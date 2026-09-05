import { UsageError } from '../middleware/index.js';
import { requireWallet, requireCredentials } from './shared.js';
import { walletsOf, walletAddress, walletFamily } from '../paybox/client.js';
import { formatUsd, formatAmount, shortAddress } from '../utils/format.js';

/**
 * /balance — portfolio for every granted wallet.
 * `get_portfolio` needs the wallet address; it is read from the credential
 * metadata, which Paybox captures when the wallet is granted.
 */
export async function balanceCommand(ctx) {
  const { credentials } = await requireCredentials(ctx);
  const wallets = walletsOf(credentials);

  if (wallets.length === 0) {
    throw new UsageError(
      '❌ **No wallet connected**\n\nGrant this bot a wallet in Paybox first (run /account for details).'
    );
  }

  const progress = await ctx.reply('⏳ Fetching portfolios…', {
    reply_markup: { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: 'nav:balance' }]] },
  });

  const sections = [];
  let grandTotal = 0;

  for (const wallet of wallets) {
    const address = walletAddress(wallet);
    if (!address) {
      sections.push(
        `👛 **${wallet.name || shortAddress(wallet.id)}**\n` +
          `_No address captured yet — open the Paybox app once to capture it._`
      );
      continue;
    }

    try {
      const portfolio = await ctx.paybox.getPortfolio({ address });

      const totalUsd = portfolio?.total_usd;
      if (totalUsd !== null && totalUsd !== undefined && !Number.isNaN(Number(totalUsd))) {
        grandTotal += Number(totalUsd);
      }

      const holdings = Array.isArray(portfolio?.holdings) ? portfolio.holdings : [];
      const lines = [`👛 **${wallet.name || shortAddress(address)}** \`${shortAddress(address)}\``];

      if (totalUsd === null || totalUsd === undefined) {
        lines.push('_Some holdings are unpriced — totals unavailable._');
      } else {
        lines.push(`**Total:** ${formatUsd(totalUsd)}`);
      }

      if (holdings.length === 0) {
        lines.push('_No holdings found on-chain._');
      } else {
        for (const holding of holdings.slice(0, 12)) {
          const symbol = holding.symbol || holding.name || 'token';
          const amount = holding.balance?.ui_amount_string ?? holding.balance ?? 0;
          const usd = holding.priced_usd ?? holding.usd ?? null;
          const change = holding.priceChange24h ?? holding.price_change_24h ?? null;
          const changeStr =
            change !== null && change !== undefined
              ? ` (${change >= 0 ? '+' : ''}${(Number(change) * 100).toFixed(2)}%)`
              : '';
          lines.push(
            `• *${symbol}*: ${formatAmount(amount)}${usd !== null ? ` ≈ ${formatUsd(usd)}` : ''}${changeStr}`
          );
        }
        if (holdings.length > 12) lines.push(`_…and ${holdings.length - 12} more_`);
      }

      sections.push(lines.join('\n'));
    } catch (error) {
      sections.push(`👛 **${wallet.name || shortAddress(address)}**\n❌ _${error.message}_`);
    }
  }

  const header =
    wallets.length > 1 && grandTotal > 0
      ? `💼 **Portfolio total: ${formatUsd(grandTotal)}**\n\n`
      : '';
  const footer =
    '\n\n_On-chain data via MoonX. 24h changes are fractions (0.0052 = +0.52%)._';

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    progress.message_id,
    undefined,
    header + sections.join('\n\n') + footer,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  ).catch(() => ctx.reply(header + sections.join('\n\n') + footer, { parse_mode: 'Markdown' }));
}
