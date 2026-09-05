import { UsageError } from '../middleware/index.js';
import { requireWallet } from './shared.js';
import { requestArtifact } from '../paybox/client.js';
import {
  completeWalletSign,
  buildEvmTransferIntent,
  broadcastEvmTransaction,
  buildSolanaTransferIntent,
  broadcastSolanaTransaction,
  evmPublicClient,
} from '../paybox/signing.js';
import { resolveToken } from '../utils/tokens.js';
import { watchTransaction } from '../utils/txconfirm.js';
import { parseAmount, addressFamily, isTelegramHandle, isAnyAddress } from '../utils/validate.js';
import { shortAddress } from '../utils/format.js';
import { logger } from '../logger.js';

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

/** How long a background watcher keeps watching an approval that never came. */
const BACKGROUND_WATCH_MS = 24 * 60 * 60 * 1000;

/**
 * Detached watchers for requests that outlived the approval window.
 * Cancelling wakes the sleeping loop immediately (graceful shutdown).
 */
const backgroundWatchers = new Set();

export function stopBackgroundWatchers() {
  for (const token of backgroundWatchers) {
    token.cancelled = true;
    if (token.wake) token.wake();
  }
  backgroundWatchers.clear();
}

const USAGE =
  '❌ **Usage**\n\n' +
  '`/transfer <@user|address> <amount> <token>`\n\n' +
  '**Examples**\n' +
  '• `/transfer @alice 0.05 ETH`\n' +
  '• `/transfer 0x1234…abcd 10 BASE` (ETH on Base)\n' +
  '• `/transfer 5EUa…SViS 2.5 SOL`\n\n' +
  'Tokens: ETH (Ethereum), BASE (Base), SOL (Solana). Other tokens: use /swap.';

/**
 * /transfer <@user|address> <amount> <token>
 *
 * On-chain transfer via wallet-sign intents:
 *   EVM  → `{ op: "transaction", transaction: { …eip1559… } }` (broadcast by us)
 *   SOL  → `{ op: "solanaTransaction", … }` (broadcast by us)
 *
 * Supports native ETH (Ethereum), ETH on Base, and native SOL.
 * The signing key (pbxk1.) is required: it powers the in-process signing that
 * finishes both autonomous and passkey-approved requests.
 *
 * In-flight requests are tracked in the durable pending store, so a restart
 * resumes them (see src/resume.js), and the broadcast is followed to on-chain
 * finality by the confirmation watcher (see src/utils/txconfirm.js).
 */
export async function transferCommand(ctx, args) {
  if (args.length < 2) {
    throw new UsageError(USAGE);
  }

  const [recipientInput, amountInput, tokenInput = 'ETH'] = args;

  const amount = parseAmount(amountInput, { maxDecimals: 9, min: 1e-9 });
  if (amount === null) {
    throw new UsageError(`❌ Invalid amount: "${amountInput}". Use a plain decimal like 0.05.`);
  }

  return executeTransfer(ctx, { recipientInput, amount, tokenInput });
}

/**
 * Run a transfer end-to-end. Shared by /transfer, split settlement and the
 * scheduler — every caller goes through the same validation and approval
 * pipeline. `amount` is a validated number; `tokenInput` a symbol.
 */
export async function executeTransfer(ctx, { recipientInput, amount, tokenInput = 'ETH' }) {
  const resolved = resolveToken(tokenInput);
  if (!resolved || resolved.token.address !== 'native') {
    throw new UsageError(
      `❌ Unsupported token: "${tokenInput}". /transfer supports native ETH (Ethereum), BASE (Base) and SOL (Solana). Use /swap for other tokens.`
    );
  }
  const { chain } = resolved;

  // Resolve recipient
  let recipient = recipientInput;
  if (isTelegramHandle(recipientInput)) {
    const entry = ctx.registry?.byHandle(recipientInput);
    if (!entry) {
      throw new UsageError(
        `❌ **@${recipientInput.slice(1)} is not in the address book.**\n\n` +
          `Ask them for a wallet address, then save it with:\n` +
          `\`/register <address> @${recipientInput.slice(1)}\``
      );
    }
    recipient = entry.address;
  }
  if (!isAnyAddress(recipient)) {
    throw new UsageError(`❌ "${recipientInput}" is not a valid wallet address.`);
  }
  const recipientFamily = addressFamily(recipient);
  if (recipientFamily !== chain.family) {
    throw new UsageError(
      `❌ Chain mismatch: that ${recipientFamily} address cannot receive ${chain.label} ${chain.nativeSymbol}. Use an ${chain.family} address.`
    );
  }

  const wallet = await requireWallet(ctx, { family: chain.family });

  if (!wallet.metadata?.address) {
    throw new UsageError(
      '❌ This wallet has no captured address yet. Open the Paybox app once (so the address is captured), then retry.'
    );
  }

  if (!ctx.canSign) {
    throw new UsageError(
      '❌ **Signing key required**\n\n' +
        'Transfers need the `pbxk1.` signing key so the bot can sign in-process. ' +
        'Add `PAYBOX_SIGNING_KEY` to the environment and restart the bot.'
    );
  }

  const smallestUnit = BigInt(Math.round(amount * 10 ** chain.decimals));
  const statusMsg = await ctx.reply(
    `⏳ **Preparing transfer**\n\n` +
      `To: \`${shortAddress(recipient)}\`\n` +
      `Amount: ${amount} ${chain.nativeSymbol} (${chain.label})\n` +
      `_Building the transaction…_`,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  );
  const edit = (text, extra) =>
    ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text, extra).catch(() => {});

  try {
    // 1. Build the sign intent + broadcast plan
    let intent;
    if (chain.family === 'evm') {
      const plan = await buildEvmTransferIntent({
        chainId: chain.id,
        rpcUrl: ctx.config.rpc[chain.key],
        from: wallet.metadata?.address,
        to: recipient,
        amountWei: smallestUnit.toString(),
      });
      intent = plan.intent;
    } else {
      const plan = await buildSolanaTransferIntent({
        rpcUrl: ctx.config.rpc[chain.key],
        from: wallet.metadata?.address,
        to: recipient,
        lamports: Number(smallestUnit),
      });
      intent = plan.intent;
    }

    // 2. Request the wallet signature
    const request = await ctx.paybox.requestWalletSign({ credentialId: wallet.id, intent });

    // 3. Track it durably — a restart picks this back up.
    ctx.pending?.track({
      requestId: request.request_id,
      kind: 'transfer',
      chatId: ctx.chat.id,
      messageId: statusMsg.message_id,
      intent,
      chainKey: chain.key,
      recipient,
      amount,
      tokenSymbol: chain.nativeSymbol,
    });

    // 4. Drive to completion: approval → sign → broadcast → watch on-chain.
    return await driveTransferToCompletion({
      config: ctx.config,
      paybox: ctx.paybox,
      telegram: ctx.telegram,
      chatId: ctx.chat.id,
      messageId: statusMsg.message_id,
      request,
      intent,
      chain,
      recipient,
      amount,
      pending: ctx.pending,
      stats: ctx.stats,
    });
  } catch (error) {
    logger.error('transfer error:', error.message);
    await edit(`❌ **Transfer failed** — ${error.message}`, { parse_mode: 'Markdown' });
    return { ok: false, error: error.message };
  }
}

/**
 * Take a transfer request to completion, editing the status message through
 * every stage. Used by the live command path and by restart-resume.
 *
 * Injectable seams (tests): sign, broadcast, watch.
 */
export async function driveTransferToCompletion({
  config,
  paybox,
  telegram,
  chatId,
  messageId,
  request,
  intent,
  chain,
  recipient,
  amount,
  pending,
  stats,
  sign = completeWalletSign,
  broadcast = broadcastArtifact,
  watch = watchTransaction,
}) {
  const edit = (text, extra) =>
    telegram.editMessageText(chatId, messageId, undefined, text, extra).catch(() => {});
  const details = () =>
    `To: \`${shortAddress(recipient)}\`\nAmount: ${amount} ${chain.nativeSymbol} (${chain.label})`;

  const untrack = () => pending?.untrack(request.request_id);

  try {
    // Approval? Show the link and wait; then finish signing in-process.
    if (request.status === 'pending_approval') {
      await edit(
        `🔐 **Approval required**\n\n${details()}\n\n` +
          `Approve with your passkey in the Paybox app, then I’ll sign and broadcast automatically.`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '✅ Approve in Paybox', url: approvalUrl(request) }]] },
        }
      );
    }

    if (['pending_approval', 'pending_signature'].includes(request.status)) {
      request = await waitApprovalAndSign({ paybox, config, requestId: request.request_id, intent, sign });
    }

    if (request.status === 'pending_signature') {
      // Autonomous grant but no in-process signing happened (no key).
      untrack();
      await edit(`✍️ The request is waiting to be signed but no signing key is configured.`);
      return { ok: false, status: 'pending_signature' };
    }

    if (request.status === 'pending_approval') {
      // The approval window timed out — keep watching quietly, and stay
      // tracked so a restart still resumes this request.
      await edit(
        `⏱️ **Still waiting for approval**\n\n${details()}\n\n` +
          `I’ll keep watching in the background (and across restarts). You can also check /history.`,
        { parse_mode: 'Markdown' }
      );
      watchRequestInBackground({
        config,
        paybox,
        telegram,
        chatId,
        messageId,
        requestId: request.request_id,
        intent,
        chain,
        recipient,
        amount,
        pending,
        stats,
        sign,
        broadcast,
        watch,
      }).catch((error) => logger.error(`background watch failed: ${error.message}`));
      return { ok: false, status: 'watching' };
    }

    if (request.status !== 'success') {
      const reason = request.reason || request.error || request.error_message || request.status;
      untrack();
      await edit(`❌ **Transfer not completed** — ${reason}`);
      return { ok: false, status: request.status };
    }

    // Broadcast
    const artifact = requestArtifact(request);
    await edit(`📡 **Signed.** Broadcasting to ${chain.label}…`, { parse_mode: 'Markdown' });

    const txId = await broadcast(config, chain, artifact);

    // Broadcast handed to the on-chain watcher — stop tracking. (A restart
    // cannot "resume" an already-broadcast transaction; the watcher owns the
    // rest and the explorer link is on screen.)
    untrack();

    // Hand the message over to the on-chain confirmation watcher.
    watch({
      telegram,
      chatId,
      messageId,
      chain,
      txId,
      rpcUrl: config.rpc?.[chain.key],
      intervalMs: config.pollIntervalMs,
      timeoutMs: config.txConfirmTimeoutMs,
      onFinal: () => stats?.hit('transfer_confirmed'),
    }).catch((error) => logger.error(`tx watch failed: ${error.message}`));

    stats?.hit('transfer_completed');
    return { ok: true, txId, chain };
  } catch (error) {
    logger.error('transfer error:', error.message);
    untrack();
    await edit(`❌ **Transfer failed** — ${error.message}`, { parse_mode: 'Markdown' });
    return { ok: false, error: error.message };
  }
}

/** Wait out `pending_approval`, complete the signature in-process, return the final request. */
async function waitApprovalAndSign({ paybox, config, requestId, intent, sign }) {
  const deadline = Date.now() + config.requestTimeoutMs;
  for (;;) {
    await SLEEP(config.pollIntervalMs);
    const request = await paybox.getRequest(requestId);

    if (request.status === 'pending_signature') {
      await sign(paybox, requestId, intent, config.payboxSigningKey);
      return paybox.getRequest(requestId);
    }

    if (!['pending_approval', 'pending_signature'].includes(request.status)) {
      return request;
    }

    if (Date.now() > deadline) {
      return { status: 'pending_approval', reason: 'Timed out waiting for approval.', request_id: requestId };
    }
  }
}

/**
 * Keep watching a request that outlived the approval window (up to 24h).
 * If the user approves late, the transfer still signs, broadcasts and gets
 * its on-chain confirmation watcher.
 */
async function watchRequestInBackground(env) {
  const { paybox, config, requestId, pending, stats, sign, broadcast, watch } = env;
  const { telegram, chatId, messageId, intent, chain, recipient, amount } = env;
  const token = { cancelled: false, wake: null };
  backgroundWatchers.add(token);
  const deadline = Date.now() + BACKGROUND_WATCH_MS;
  const edit = (text) => telegram.editMessageText(chatId, messageId, undefined, text, { parse_mode: 'Markdown' }).catch(() => {});
  const sleep = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      // Unref'd: the bot keeps the loop alive on its own; a quiet process
      // (e.g. a finished test run) must not be held hostage by a 15s nap.
      if (timer.unref) timer.unref();
      token.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });

  try {
    while (Date.now() < deadline) {
      await sleep(Math.max(config.pollIntervalMs, 15_000));
      if (token.cancelled) return; // shutdown: stay tracked, restart resumes

      let request;
      try {
        request = await paybox.getRequest(requestId);
      } catch (error) {
        logger.debug(`background watch poll error for ${requestId}: ${error.message}`);
        continue;
      }

      if (request.status === 'pending_signature') {
        await sign(paybox, requestId, intent, config.payboxSigningKey);
        request = await paybox.getRequest(requestId);
      }

      if (['pending_approval', 'pending_signature'].includes(request.status)) continue;

      if (request.status === 'success') {
        try {
          const artifact = requestArtifact(request);
          await edit(`🔓 **Approved late — broadcasting now…**`);
          const txId = await broadcast(config, chain, artifact);
          watch({
            telegram,
            chatId,
            messageId,
            chain,
            txId,
            rpcUrl: config.rpc?.[chain.key],
            intervalMs: config.pollIntervalMs,
            timeoutMs: config.txConfirmTimeoutMs,
            onFinal: () => stats?.hit('transfer_confirmed'),
          }).catch(() => {});
          stats?.hit('transfer_completed');
        } catch (error) {
          logger.error(`late broadcast failed for ${requestId}: ${error.message}`);
          await edit(`❌ **Approved, but broadcasting failed** — ${error.message}`);
        }
        pending?.untrack(requestId);
        return;
      }

      const reason = request.reason || request.error || request.error_message || request.status;
      await edit(`❌ **Transfer not completed** — ${reason}`);
      pending?.untrack(requestId);
      return;
    }

    await edit(`⌛ **Gave up watching** this request — check /history or the Paybox app for its final state.`);
    pending?.untrack(requestId);
  } finally {
    backgroundWatchers.delete(token);
  }
}

/** Broadcast a signed artifact on the right chain. */
async function broadcastArtifact(config, chain, artifact) {
  if (chain.family === 'evm') {
    const client = evmPublicClient(chain.id, config.rpc[chain.key]);
    return broadcastEvmTransaction(client, artifact.serializedTransaction);
  }
  const { Connection } = await import('@solana/web3.js');
  const connection = new Connection(config.rpc[chain.key], 'confirmed');
  return broadcastSolanaTransaction(connection, artifact.signedTransactionBase64);
}

/** Find the approval URL across wire variants. */
export function approvalUrl(request) {
  return (
    request?.approval_url ||
    request?.output?.approval_url ||
    request?.approval?.url ||
    request?.approvalUrl ||
    'https://app.paybox.sh'
  );
}
