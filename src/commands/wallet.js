import { getSupportedAsset, validateRecipient, PaymentInputError } from '../domain/payment.js';
import { PaymentIntentError } from '../services/payment-intents.js';
import { reportError, replyWithSafeError } from '../lib/errors.js';

export async function walletCommand(ctx, commandText = ctx.message?.text) {
  try {
    if (ctx.chat?.type !== 'private') {
      throw new PaymentInputError('Run /wallet in a private chat with this bot so your receiving address is not posted in a group.');
    }
    const args = String(commandText || '').trim().split(/\s+/).slice(1);
    if (args.length !== 2) {
      throw new PaymentInputError('Usage: /wallet <ETH|SOL> <wallet_address>. Run this privately before receiving tips.');
    }
    const [assetSymbol, address] = args;
    const asset = getSupportedAsset(assetSymbol);
    const walletAddress = validateRecipient(address, asset.addressType);
    if (!ctx.from?.id) throw new PaymentIntentError('Telegram user identity is required to register a wallet.');

    await ctx.paymentIntents.registerWalletProfile({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      asset: asset.symbol,
      walletAddress,
    });
    await ctx.reply(`✅ Your ${asset.symbol} tip wallet is registered as \`${walletAddress}\`. Keep private keys and seed phrases out of Telegram.`, { parse_mode: 'Markdown' });
  } catch (error) {
    if (error instanceof PaymentInputError || error instanceof PaymentIntentError) {
      await ctx.reply(`❌ ${error.message}`);
      return;
    }
    const referenceId = reportError({
      scope: 'wallet_registration',
      error,
      context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id },
    });
    await replyWithSafeError(ctx, { referenceId, message: 'We could not register that wallet.' });
  }
}
