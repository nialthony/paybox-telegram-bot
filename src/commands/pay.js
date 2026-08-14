import { PaymentInputError, parsePaymentCommand } from '../domain/payment.js';
import { PaymentIntentError } from '../services/payment-intents.js';
import { WalletTransferGatewayError } from '../services/wallet-transfer-gateway.js';
import { escapeMarkdown, reportError, replyWithSafeError } from '../lib/errors.js';

export function getWalletCredentialId(credentials) {
  const wallet = credentials.find((summary) =>
    summary?.credential?.credential_type === 'wallet'
    || summary?.credential?.kind === 'wallet'
    || summary?.kind === 'wallet',
  );
  const credentialId = wallet?.credential?.id || wallet?.credential_id;

  if (!credentialId) {
    throw new PaymentIntentError('No wallet credential is available for this request.');
  }

  return credentialId;
}

function confirmationKeyboard(intentId) {
  return {
    inline_keyboard: [[
      { text: 'Review and create request', callback_data: `payment:confirm:${intentId}` },
      { text: 'Cancel', callback_data: `payment:cancel:${intentId}` },
    ]],
  };
}

function formatDraft(draft) {
  return [
    '🔎 *Payment draft — no transfer has been requested yet*',
    '',
    `To: \`${escapeMarkdown(draft.recipient)}\``,
    `Amount: *${escapeMarkdown(draft.displayAmount)} ${draft.asset}*`,
    `Network: \`${escapeMarkdown(draft.chain)}\``,
    '',
    'Confirm only after checking the destination address and amount. This draft expires in 15 minutes.',
  ].join('\n');
}

export async function payCommand(ctx, commandText = ctx.message?.text) {
  try {
    const draft = parsePaymentCommand(commandText);
    const intent = await ctx.paymentIntents.createDraft({
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
      draft,
    });

    await ctx.reply(formatDraft(draft), {
      parse_mode: 'Markdown',
      reply_markup: confirmationKeyboard(intent.id),
    });
  } catch (error) {
    if (error instanceof PaymentInputError || error instanceof PaymentIntentError) {
      await ctx.reply(`❌ ${error.message}`);
      return;
    }

    const referenceId = reportError({
      scope: 'payment_draft',
      error,
      context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id },
    });
    await replyWithSafeError(ctx, { referenceId, message: 'We could not create a payment draft.' });
  }
}

export async function confirmPaymentCallback(ctx, intentId) {
  let claimedIntentId = null;
  try {
    const activeIntent = await ctx.paymentIntents.getOwnedActiveIntent({
      id: intentId,
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });

    if (!ctx.transferGateway.enabled) {
      await ctx.answerCbQuery('Wallet transfers are not enabled.');
      await ctx.reply('⚠️ Wallet transfers are currently disabled until the Paybox transfer adapter is verified for this SDK version. No request was created.');
      return;
    }

    const intent = await ctx.paymentIntents.claimForCreation({
      id: activeIntent.id,
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });
    claimedIntentId = intent.id;
    const credentials = await ctx.paybox.listCredentials();
    const credentialId = getWalletCredentialId(credentials);

    const transfer = await ctx.transferGateway.createTransferRequest({
      credentialId,
      draft: intent.draft,
    });

    const providerRequestId = transfer.request_id || transfer.id || null;
    if (transfer.status === 'pending_approval') {
      await ctx.paymentIntents.transition(intent.id, 'pending_approval', { providerRequestId, providerStatus: transfer.status });
      await ctx.answerCbQuery('Approval is required in Paybox.');
      await ctx.reply(
        '🔐 *Approval required*\n\nApprove this request in Paybox. The bot will not poll in-memory; check the request status in Paybox until durable webhook processing is configured.',
        {
          parse_mode: 'Markdown',
          reply_markup: transfer.approval_url
            ? { inline_keyboard: [[{ text: 'Open Paybox approval', url: transfer.approval_url }]] }
            : undefined,
        },
      );
      return;
    }

    if (transfer.status === 'success') {
      await ctx.paymentIntents.transition(intent.id, 'succeeded', { providerRequestId, providerStatus: transfer.status });
      await ctx.answerCbQuery('Payment request completed.');
      await ctx.reply('✅ Payment request completed. Verify the transaction in Paybox before treating it as final.');
      return;
    }

    await ctx.paymentIntents.transition(intent.id, 'failed', { providerRequestId, providerStatus: transfer.status });
    await ctx.answerCbQuery('Payment request was not accepted.');
    await ctx.reply('❌ Paybox did not accept the payment request. No further action was taken.');
  } catch (error) {
    if (claimedIntentId) {
      await ctx.paymentIntents.transition(claimedIntentId, 'failed');
    }
    if (error instanceof PaymentIntentError || error instanceof WalletTransferGatewayError) {
      await ctx.answerCbQuery(error.message).catch(() => {});
      await ctx.reply(`❌ ${error.message}`);
      return;
    }

    const referenceId = reportError({
      scope: 'payment_confirm',
      error,
      context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id, intentId },
    });
    await ctx.answerCbQuery('Unable to create the payment request.').catch(() => {});
    await replyWithSafeError(ctx, { referenceId, message: 'We could not create the payment request.' });
  }
}

export async function cancelPaymentCallback(ctx, intentId) {
  try {
    await ctx.paymentIntents.cancel({
      id: intentId,
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });
    await ctx.answerCbQuery('Payment draft cancelled.');
    await ctx.reply('✅ Payment draft cancelled. No provider request was created.');
  } catch (error) {
    const message = error instanceof PaymentIntentError
      ? error.message
      : 'We could not cancel that payment draft.';
    await ctx.answerCbQuery(message).catch(() => {});
    await ctx.reply(`❌ ${message}`);
  }
}
