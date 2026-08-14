import { PaymentInputError, validateSupportedWalletAddress } from '../domain/payment.js';
import { escapeMarkdown, reportError, replyWithSafeError } from '../lib/errors.js';

function usd(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function findWalletAddressInCredentials(credentials) {
  for (const summary of credentials) {
    const credential = summary?.credential || summary;
    if (credential?.credential_type !== 'wallet' && credential?.kind !== 'wallet') continue;
    const metadata = credential?.metadata || {};
    const candidate = metadata.address || metadata.wallet_address || metadata.walletAddress || metadata.public_address || metadata.publicKey;
    if (typeof candidate === 'string') {
      try {
        return validateSupportedWalletAddress(candidate);
      } catch {
        // Try the next credential; the final message asks for an explicit address.
      }
    }
  }
  return null;
}

function requestedAddress(ctx) {
  return ctx.message?.text?.split(/\s+/).slice(1).join(' ').trim() || null;
}

export async function balanceCommand(ctx) {
  try {
    await ctx.reply('⏳ Fetching your portfolio...');
    const credentials = await ctx.paybox.listCredentials();

    if (!credentials.length) {
      await ctx.reply('❌ No Paybox credentials are available. Connect a wallet in Paybox before using /balance.');
      return;
    }

    const address = requestedAddress(ctx)
      ? validateSupportedWalletAddress(requestedAddress(ctx))
      : findWalletAddressInCredentials(credentials);

    if (!address) {
      await ctx.reply('⚠️ Provide a wallet address: `/balance <Ethereum_or_Solana_wallet_address>`', { parse_mode: 'Markdown' });
      return;
    }

    const portfolio = await ctx.paybox.getPortfolio({ address });
    if (!portfolio || portfolio.total_usd === null || portfolio.total_usd === undefined) {
      await ctx.reply('📊 Your portfolio is empty or current pricing data is unavailable.');
      return;
    }

    const lines = [
      '💰 *Your portfolio*',
      '',
      `*Address:* \`${escapeMarkdown(address)}\``,
      `*Total value:* $${usd(portfolio.total_usd)} USD`,
    ];

    if (portfolio.wallets?.length) {
      lines.push('', '*Wallets:*');
      for (const wallet of portfolio.wallets.slice(0, 10)) {
        const label = escapeMarkdown(wallet.wallet_name || String(wallet.wallet_address || 'Unknown wallet').slice(0, 10));
        lines.push(`• ${label} — $${usd(wallet.total_usd)}`);
      }
    }

    if (portfolio.holdings?.length) {
      lines.push('', '*Holdings:*');
      for (const holding of portfolio.holdings.slice(0, 10)) {
        const symbol = escapeMarkdown(holding.symbol || 'Unknown');
        const amount = escapeMarkdown(holding.balance?.ui_amount_string || '0');
        const change = Number(holding.priceChange24h);
        const changeText = Number.isFinite(change) ? ` (${(change * 100).toFixed(1)}%)` : '';
        lines.push(`• ${symbol}: ${amount} ($${usd(holding.priced_usd)})${changeText}`);
      }
    }

    if (portfolio.as_of) {
      lines.push('', `_Last updated: ${escapeMarkdown(new Date(portfolio.as_of).toLocaleTimeString())}_`);
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    if (error instanceof PaymentInputError) {
      await ctx.reply(`❌ ${error.message}`);
      return;
    }
    const referenceId = reportError({
      scope: 'balance',
      error,
      context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id },
    });
    await replyWithSafeError(ctx, { referenceId, message: 'We could not retrieve the portfolio.' });
  }
}
