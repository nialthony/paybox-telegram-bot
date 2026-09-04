import { UsageError } from '../middleware/index.js';
import { requireWallet } from './shared.js';
import { requestArtifact } from '../paybox/client.js';
import { completeWalletSign } from '../paybox/signing.js';
import { sanitizeText } from '../utils/validate.js';
import { logger } from '../logger.js';
import { approvalUrl } from './transfer.js';

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * /sign <message>            — EIP-191 message signature (EVM wallet)
 * /sign <eip712-json>        — EIP-712 typed-data signature (EVM wallet)
 * /sign sol:<message>        — Solana message signature (Solana wallet)
 *
 * The private key never leaves MoonX MPC; the artifact is assembled here and
 * returned to the chat.
 */
export async function signCommand(ctx, args) {
  if (args.length === 0) {
    throw new UsageError(
      '❌ **Usage**\n\n' +
        '• `/sign gm frens` — EIP-191 message signature\n' +
        '• `/sign sol:gm frens` — Solana message signature\n' +
        '• `/sign {"domain":…,"types":…,"primaryType":…,"message":…}` — EIP-712 typed data'
    );
  }

  const raw = args.join(' ');
  let intent;
  let family = 'evm';
  let display = raw;

  if (raw.startsWith('sol:')) {
    family = 'solana';
    display = raw.slice(4);
    intent = { op: 'solanaMessage', message: display };
  } else if (raw.trim().startsWith('{')) {
    let typedData;
    try {
      typedData = JSON.parse(raw);
    } catch {
      throw new UsageError('❌ That looks like JSON but it does not parse. Check your quotes/braces.');
    }
    if (!typedData.types || !typedData.primaryType || !typedData.message) {
      throw new UsageError('❌ EIP-712 data needs `domain`, `types`, `primaryType` and `message`.');
    }
    family = 'evm';
    intent = { op: 'typedData', typedData };
    display = 'EIP-712 typed data';
  } else {
    intent = { op: 'message', message: sanitizeText(raw, 2048) };
    display = sanitizeText(raw, 200);
  }

  const wallet = await requireWallet(ctx, { family });

  if (!ctx.canSign) {
    throw new UsageError(
      '❌ **Signing key required** — signing needs the `pbxk1.` key. Set `PAYBOX_SIGNING_KEY` and restart the bot.'
    );
  }

  const statusMsg = await ctx.reply(
    `✍️ **Preparing signature**\n\nMessage: _${display.length > 80 ? display.slice(0, 80) + '…' : display}_\n\n_Requesting signature from ${family === 'evm' ? 'EVM' : 'Solana'} wallet…_`,
    { parse_mode: 'Markdown' }
  );
  const edit = (text, extra) =>
    ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text, extra).catch(() => {});

  try {
    let request = await ctx.paybox.requestWalletSign({ credentialId: wallet.id, intent });

    if (request.status === 'pending_approval') {
      await edit(
        `🔐 **Approve signing**\n\nMessage: _${display.length > 80 ? display.slice(0, 80) + '…' : display}_\n\nApprove with your passkey in Paybox.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '✅ Approve in Paybox', url: approvalUrl(request) }]],
          },
        }
      );
      request = await waitApprovalAndSign(ctx, request.request_id, intent);
    }

    if (request.status !== 'success') {
      await edit(
        `❌ **Signing ${request.status === 'denied' ? 'denied' : 'failed'}** — ${request.reason || request.error || ''}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const artifact = requestArtifact(request);
    const signature = artifact?.signature || artifact?.serializedTransaction || artifact?.signedTransactionBase64;
    if (!signature) {
      await edit('❌ Signing succeeded but no artifact came back — check /history.', { parse_mode: 'Markdown' });
      return;
    }

    const label = intent.op === 'typedData' ? 'EIP-712 signature' : intent.op === 'solanaMessage' ? 'Solana signature' : 'EIP-191 signature';
    const compact = String(signature).length > 60 ? `${String(signature).slice(0, 60)}…` : signature;

    await edit(
      `✅ **Message signed**\n\n${label}:\n\`${compact}\`\n\n_From wallet \`${wallet.metadata?.address?.slice(0, 10)}…\` — verify independently before trusting._`,
      { parse_mode: 'Markdown' }
    );
    ctx.stats?.hit('sign_completed');
  } catch (error) {
    logger.error('sign error:', error.message);
    await edit(`❌ **Signing failed** — ${error.message}`, { parse_mode: 'Markdown' });
  }
}

async function waitApprovalAndSign(ctx, requestId, intent) {
  const deadline = Date.now() + ctx.config.requestTimeoutMs;
  for (;;) {
    await SLEEP(ctx.config.pollIntervalMs);
    const request = await ctx.paybox.getRequest(requestId);
    if (request.status === 'pending_signature') {
      await completeWalletSign(ctx.paybox, requestId, intent, ctx.config.payboxSigningKey);
      return ctx.paybox.getRequest(requestId);
    }
    if (!['pending_approval', 'pending_signature'].includes(request.status)) return request;
    if (Date.now() > deadline) return { status: 'pending_approval', reason: 'Timed out waiting for approval.' };
  }
}
