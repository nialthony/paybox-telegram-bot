import { UsageError } from '../middleware/index.js';
import { requireCard } from './shared.js';
import { requestArtifact } from '../paybox/client.js';
import { parseUsd, isUrl, sanitizeText } from '../utils/validate.js';
import { formatCents, escapeMd } from '../utils/format.js';
import { logger } from '../logger.js';

const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * /pay <merchant> <url> <usd>
 *
 * Authorizes a merchant-scoped, one-time virtual card for a card credential.
 * This does NOT complete the merchant checkout — it issues the card details
 * the user then enters at the merchant's site. For passkey-approved payments
 * the card is claimed once via `claim_payment_credentials`.
 *
 * Security (v2.1.1): merchant name is escaped for Markdown.
 */
export async function payCommand(ctx, args) {
  if (args.length < 3) {
    throw new UsageError(
      '❌ **Usage**\n\n' +
        '`/pay <merchant> <url> <usd>`\n\n' +
        '**Example**\n' +
        '• `/pay Acme https://acme.com 19.99`\n\n' +
        'This issues a one-time virtual card bound to the merchant origin. ' +
        'You then complete the checkout yourself — the bot never submits the purchase.'
    );
  }

  const [merchantRaw, url, usdRaw] = args;
  const merchant = sanitizeText(merchantRaw, 80);
  const merchantEsc = escapeMd(merchant);
  const amountCents = parseUsd(usdRaw);

  if (!isUrl(url)) {
    throw new UsageError('❌ `<url>` must be an https:// URL — the real merchant origin the card is bound to.');
  }
  if (amountCents === null) {
    throw new UsageError(`❌ Invalid USD amount: "${usdRaw}".`);
  }

  const card = await requireCard(ctx);

  const statusMsg = await ctx.reply(
    `💳 **Preparing payment**\n\nMerchant: ${merchantEsc}\nAmount: ${formatCents(amountCents)}\n\n_Authorizing card issuance…_`,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  );
  const edit = (text, extra) =>
    ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text, extra).catch(() => {});

  try {
    let request = await ctx.paybox.requestPayment({
      credentialId: card.id,
      merchant,
      merchantUrl: url,
      amountCents,
      currency: 'USD',
    });

    if (request.status === 'pending_approval') {
      const approval = approvalUrl(request);
      await edit(
        `🔐 **Approve payment**\n\nMerchant: ${merchantEsc}\nAmount: ${formatCents(amountCents)}\n\nApprove with your passkey in Paybox, then I’ll fetch the card details.`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '✅ Approve in Paybox', url: approval }]] },
        }
      );

      request = await waitForApproval(ctx, request.request_id);
    }

    if (request.status === 'denied') {
      await edit(`❌ **Payment denied** — ${request.reason || 'rejected in Paybox.'}`, { parse_mode: 'Markdown' });
      return;
    }
    if (request.status !== 'success') {
      await edit(`❌ **Payment failed** — ${request.error || request.error_message || request.status}`, { parse_mode: 'Markdown' });
      return;
    }

    // The polled request redacts the card for human-approved payments; claim it.
    let cardDetails = requestArtifact(request);
    try {
      const claimed = await ctx.paybox.claimPaymentCredentials(request.request_id);
      cardDetails = claimed?.value ?? claimed ?? cardDetails;
    } catch {
      /* already claimed or not required — use what we have */
    }

    await edit(
      `✅ **Virtual card issued**\n\n` +
        `Merchant: ${merchantEsc}\n` +
        `Amount available: ${formatCents(amountCents)}\n` +
        `Expires: ${cardDetails?.expires_at ? new Date(cardDetails.expires_at).toLocaleString() : 'one-time use'}\n\n` +
        `Card: \`${maskCard(cardDetails)}\`\n\n` +
        `_Use these details at ${merchantEsc}'s checkout. The card is one-time and merchant-locked. I won't mark the purchase complete until the merchant confirms it._`,
      {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      }
    );
    ctx.stats?.hit('payment_issued');
  } catch (error) {
    logger.error('pay error:', error.message);
    await edit(`❌ **Payment failed** — ${error.message}`, { parse_mode: 'Markdown' });
  }
}

function maskCard(details) {
  if (!details) return '•••• •••• •••• ••••';
  const number = details.number || details.card_number || details.pan;
  if (number) {
    return `•••• ${String(number).slice(-4)}`;
  }
  const brand = details.brand ? `${details.brand} ` : '';
  const last4 = details.last4 || details.last_four || '';
  return `${brand}•••• ${last4}`.trim();
}

function approvalUrl(request) {
  return request?.approval_url || request?.output?.approval_url || request?.approval?.url || 'https://app.paybox.sh';
}

async function waitForApproval(ctx, requestId) {
  const deadline = Date.now() + ctx.config.requestTimeoutMs;
  for (;;) {
    await SLEEP(ctx.config.pollIntervalMs);
    const request = await ctx.paybox.getRequest(requestId);
    if (!['pending_approval', 'pending_signature'].includes(request.status)) return request;
    if (Date.now() > deadline) {
      return { status: 'pending_approval', reason: 'Timed out waiting for approval.' };
    }
  }
}
