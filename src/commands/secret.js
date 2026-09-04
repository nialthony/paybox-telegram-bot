import { UsageError } from '../middleware/index.js';
import { requireSecret } from './shared.js';
import { requestArtifact } from '../paybox/client.js';
import { sanitizeText } from '../utils/validate.js';
import { logger } from '../logger.js';

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * /secret <name|id> [--raw] [purpose…]
 *
 * Reveals a secret credential (API key, etc). `raw: false` (default) returns
 * a one-time secret_token for Paybox-mediated egress; `--raw` returns the
 * plaintext, which requires a grant that allows raw access.
 */
export async function secretCommand(ctx, args) {
  if (args.length === 0) {
    const secrets = await requireSecret(ctx);
    const lines = secrets.map((s) => `🔑 **${s.name || s.id}** — \`${s.id.slice(0, 10)}…\``);
    await ctx.reply(
      '🔑 **Available secrets**\n\n' +
        (lines.join('\n') || '_none_') +
        '\n\nUse `/secret <name>` to reveal one, or `/secret <name> --raw` for the plaintext (needs a raw grant).',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const raw = args.includes('--raw');
  const ref = args.find((a) => !a.startsWith('--'));
  const purpose = sanitizeText(
    args.filter((a) => a !== ref && a !== '--raw').join(' ') || 'requested from Telegram',
    200
  );

  const matches = await requireSecret(ctx, ref);
  if (matches.length === 0) {
    throw new UsageError(`❌ No secret matches "${ref}". Run /secret to list them.`);
  }
  if (matches.length > 1) {
    throw new UsageError(`❌ "${ref}" matches several secrets — use an exact name or id.`);
  }
  const secret = matches[0];

  const statusMsg = await ctx.reply(`🔑 Requesting secret "${secret.name || secret.id}"…`, {
    parse_mode: 'Markdown',
  });

  try {
    let request = await ctx.paybox.requestSecret({
      credentialId: secret.id,
      raw,
      purpose,
    });

    if (request.status === 'pending_approval') {
      const url = request.approval_url || request.output?.approval_url || 'https://app.paybox.sh';
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `🔐 **Approve secret access**\n\nPurpose: _${purpose}_\n\nApprove with your passkey in Paybox.`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '✅ Approve in Paybox', url }]] },
        }
      );
      request = await waitForApproval(ctx, request.request_id);
    }

    if (request.status !== 'success') {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        `❌ **Secret ${request.status === 'denied' ? 'denied' : 'failed'}** — ${request.reason || request.error || ''}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const artifact = requestArtifact(request);
    const value = artifact?.value ?? artifact?.token ?? artifact?.secret_token ?? artifact?.raw_secret ?? artifact;
    const oneTime = artifact?.one_time !== false;
    const display = typeof value === 'string' ? value : JSON.stringify(value ?? {});

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ **Secret revealed**\n\n\`${sanitizeText(display, 2000)}\`\n\n` +
        `${oneTime ? '⚠️ _One-time use — treat it as consumed._\n' : ''}` +
        `_Do not paste this anywhere public. ${raw ? 'This is the raw plaintext.' : 'This is a Paybox-mediated token.'}_`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('secret error:', error.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `❌ **Secret request failed** — ${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}

async function waitForApproval(ctx, requestId) {
  const deadline = Date.now() + ctx.config.requestTimeoutMs;
  for (;;) {
    await SLEEP(ctx.config.pollIntervalMs);
    const request = await ctx.paybox.getRequest(requestId);
    if (!['pending_approval', 'pending_signature'].includes(request.status)) return request;
    if (Date.now() > deadline) return { status: 'pending_approval', reason: 'Timed out waiting for approval.' };
  }
}
