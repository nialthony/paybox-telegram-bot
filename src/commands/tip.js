import { PaymentInputError, createPaymentDraft, getSupportedAsset } from '../domain/payment.js';
import { PaymentIntentError } from '../services/payment-intents.js';
import { escapeMarkdown, reportError, replyWithSafeError } from '../lib/errors.js';

const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

export function parseTipCommand(text) {
  const args = String(text || '').trim().split(/\s+/).slice(1);
  if (args.length === 2) {
    return { recipientUsername: null, amount: args[0], asset: args[1] };
  }
  if (args.length === 3 && args[0].startsWith('@')) {
    const recipientUsername = args[0].slice(1);
    if (!TELEGRAM_USERNAME.test(recipientUsername)) {
      throw new PaymentInputError('Use a valid Telegram username such as @alice.');
    }
    return { recipientUsername, amount: args[1], asset: args[2] };
  }
  throw new PaymentInputError('Usage: reply to a user with `tip <amount> <ETH|SOL>` or use `tip @username <amount> <ETH|SOL>`.');
}

function recipientFromReply(ctx) {
  const user = ctx.message?.reply_to_message?.from;
  if (!user?.id || user.is_bot) return null;
  return {
    telegramUserId: String(user.id),
    telegramUsername: user.username || null,
    displayName: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || String(user.id),
  };
}

async function resolveRecipient(ctx, recipientUsername, assetSymbol) {
  const repliedUser = recipientFromReply(ctx);
  if (!recipientUsername && !repliedUser) {
    throw new PaymentInputError('Reply to a user, or specify a registered recipient as @username.');
  }

  const username = recipientUsername || repliedUser.telegramUsername;

  const profile = await ctx.walletProfiles.getWalletProfile(recipientUsername
    ? { telegramUsername: username, asset: assetSymbol }
    : { telegramUserId: repliedUser.telegramUserId, asset: assetSymbol });
  if (!profile) {
    throw new PaymentInputError(`No ${assetSymbol} wallet is registered for this Telegram recipient. Ask them to run /wallet ${assetSymbol} <wallet_address> first.`);
  }

  if (repliedUser && recipientUsername && repliedUser.telegramUsername?.toLowerCase() !== recipientUsername.toLowerCase()) {
    throw new PaymentInputError('The @username does not match the user whose message was replied to.');
  }

  return {
    ...profile,
    displayName: repliedUser?.displayName || `@${profile.telegramUsername || recipientUsername}`,
  };
}

function confirmationKeyboard(intentId) {
  return {
    inline_keyboard: [[
      { text: 'Review and create tip request', callback_data: `payment:confirm:${intentId}` },
      { text: 'Cancel', callback_data: `payment:cancel:${intentId}` },
    ]],
  };
}

function formatAddress(address) {
  return address.length > 14 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export async function tipCommand(ctx, commandText = ctx.message?.text) {
  try {
    const parsed = parseTipCommand(commandText);
    const asset = getSupportedAsset(parsed.asset);
    const recipient = await resolveRecipient(ctx, parsed.recipientUsername, asset.symbol);
    if (String(recipient.telegramUserId) === String(ctx.from?.id)) {
      throw new PaymentInputError('You cannot tip yourself.');
    }

    const draft = createPaymentDraft({ recipient: recipient.walletAddress, amount: parsed.amount, asset: asset.symbol });
    const intent = await ctx.paymentIntents.createDraft({
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
      draft: Object.freeze({
        ...draft,
        tipRecipientTelegramUserId: String(recipient.telegramUserId),
        tipRecipientUsername: recipient.telegramUsername || null,
      }),
    });

    await ctx.reply([
      '🎁 *Tip draft — no transfer has been requested yet*',
      '',
      `Recipient: *${escapeMarkdown(recipient.displayName)}*`,
      `Wallet: \`${escapeMarkdown(formatAddress(recipient.walletAddress))}\``,
      `Amount: *${draft.displayAmount} ${draft.asset}*`,
      '',
      'Review the recipient and amount. This draft expires in 15 minutes.',
    ].join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: confirmationKeyboard(intent.id),
    });
  } catch (error) {
    if (error instanceof PaymentInputError || error instanceof PaymentIntentError) {
      await ctx.reply(`❌ ${error.message}`);
      return;
    }
    const referenceId = reportError({
      scope: 'tip_draft',
      error,
      context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id },
    });
    await replyWithSafeError(ctx, { referenceId, message: 'We could not create the tip draft.' });
  }
}
