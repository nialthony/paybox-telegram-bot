import { UsageError } from '../middleware/index.js';
import { requireWallet } from './shared.js';
import { requestArtifact } from '../paybox/client.js';
import { completeWalletSign, buildEvmTransferIntent, broadcastEvmTransaction, buildSolanaTransferIntent, broadcastSolanaTransaction } from '../paybox/signing.js';
import { resolveToken, explorerTxUrl } from '../utils/tokens.js';
import { parseAmount, addressFamily, isTelegramHandle, isAnyAddress } from '../utils/validate.js';
import { shortAddress } from '../utils/format.js';
import { logger } from '../logger.js';

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

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
 */
export async function transferCommand(ctx, args) {
  if (args.length < 2) {
    throw new UsageError(
      '❌ **Usage**\n\n' +
        '`/transfer <@user|address> <amount> <token>`\n\n' +
        '**Examples**\n' +
        '• `/transfer @alice 0.05 ETH`\n' +
        '• `/transfer 0x1234…abcd 10 BASE` (ETH on Base)\n' +
        '• `/transfer 5EUa…SViS 2.5 SOL`\n\n' +
        'Tokens: ETH (Ethereum), BASE (Base), SOL (Solana). Other tokens: use /swap.'
    );
  }

  const [recipientInput, amountInput, tokenInput = 'ETH'] = args;

  const amount = parseAmount(amountInput, { maxDecimals: 9, min: 1e-9 });
  if (amount === null) {
    throw new UsageError(`❌ Invalid amount: "${amountInput}". Use a plain decimal like 0.05.`);
  }

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
    let broadcast;
    if (chain.family === 'evm') {
      const plan = await buildEvmTransferIntent({
        chainId: chain.id,
        rpcUrl: ctx.config.rpc[chain.key],
        from: wallet.metadata?.address,
        to: recipient,
        amountWei: smallestUnit.toString(),
      });
      intent = plan.intent;
      broadcast = (artifact) => broadcastEvmTransaction(plan.publicClient, artifact.serializedTransaction);
    } else {
      const plan = await buildSolanaTransferIntent({
        rpcUrl: ctx.config.rpc[chain.key],
        from: wallet.metadata?.address,
        to: recipient,
        lamports: Number(smallestUnit),
      });
      intent = plan.intent;
      broadcast = async (artifact) => {
        const sig = await broadcastSolanaTransaction(plan.connection, artifact.signedTransactionBase64);
        await plan.connection.confirmTransaction(
          { signature: sig, blockhash: (await plan.connection.getLatestBlockhash()).blockhash, lastValidBlockHeight: plan.lastValidBlockHeight },
          'confirmed'
        );
        return sig;
      };
    }

    // 2. Request the wallet signature
    let request = await ctx.paybox.requestWalletSign({ credentialId: wallet.id, intent });

    // 3. Approval? Show the link and wait; then finish signing in-process.
    if (request.status === 'pending_approval') {
      const url = approvalUrl(request);
      await edit(
        `🔐 **Approval required**\n\n` +
          `To: \`${shortAddress(recipient)}\`\n` +
          `Amount: ${amount} ${chain.nativeSymbol} (${chain.label})\n\n` +
          `Approve with your passkey in the Paybox app, then I’ll sign and broadcast automatically.`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '✅ Approve in Paybox', url }]] },
        }
      );

      request = await waitApprovalAndSign(ctx, request.request_id, intent);
    }

    if (request.status === 'pending_signature') {
      // Autonomous grant but no in-process signing happened (no key).
      throw new UsageError('✍️ The request is waiting to be signed but no signing key is configured.');
    }

    if (request.status !== 'success') {
      const reason = request.reason || request.error || request.error_message || request.status;
      await edit(`❌ **Transfer not completed** — ${reason}`);
      return;
    }

    // 4. Broadcast
    const artifact = requestArtifact(request);
    await edit(`📡 **Signed.** Broadcasting to ${chain.label}…`, { parse_mode: 'Markdown' });

    const txId = await broadcast(artifact);

    await edit(
      `✅ **Transfer broadcast**\n\n` +
        `Amount: ${amount} ${chain.nativeSymbol}\n` +
        `To: \`${shortAddress(recipient)}\`\n` +
        `Tx: [\`${shortAddress(txId, 10, 8)}\`](${explorerTxUrl(chain, txId)})\n\n` +
        `_Waiting for on-chain confirmation…_`,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );

    ctx.stats?.hit('transfer_completed');
  } catch (error) {
    logger.error('transfer error:', error.message);
    await edit(`❌ **Transfer failed** — ${error.message}`, { parse_mode: 'Markdown' });
  }
}

/** Wait out `pending_approval`, complete the signature in-process, return the final request. */
async function waitApprovalAndSign(ctx, requestId, intent) {
  const deadline = Date.now() + ctx.config.requestTimeoutMs;
  for (;;) {
    await SLEEP(ctx.config.pollIntervalMs);
    const request = await ctx.paybox.getRequest(requestId);

    if (request.status === 'pending_signature') {
      await completeWalletSign(ctx.paybox, requestId, intent, ctx.config.payboxSigningKey);
      return ctx.paybox.getRequest(requestId);
    }

    if (!['pending_approval', 'pending_signature'].includes(request.status)) {
      return request;
    }

    if (Date.now() > deadline) {
      return { status: 'pending_approval', reason: 'Timed out waiting for approval.' };
    }
  }
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
