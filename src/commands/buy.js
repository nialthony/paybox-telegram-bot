import { UsageError } from '../middleware/index.js';
import { requireWallet } from './shared.js';
import { walletFamily } from '../paybox/client.js';
import { parseUsd } from '../utils/validate.js';

/**
 * /buy — generate a signed MoonPay checkout URL that funds a wallet with
 * fiat. Generating a link moves no money and needs no approval; the purchase
 * itself happens on MoonPay's page, by the human.
 *
 * Usage: /buy [usd] [eth|base|sol]
 */
export async function buyCommand(ctx, args) {
  const wallet = await requireWallet(ctx);
  const family = walletFamily(wallet);

  // args: [usd?, chain?]
  const usdArg = args.find((a) => /^\$?\d+(\.\d+)?$/.test(a));
  const chainArg = args.find((a) => ['eth', 'ethereum', 'base', 'sol', 'solana'].includes(a.toLowerCase()));

  let amountUsd;
  if (usdArg) {
    amountUsd = parseUsd(usdArg);
    if (amountUsd === null) {
      throw new UsageError('❌ Invalid USD amount. Example: `/buy 50`');
    }
    amountUsd = amountUsd / 100;
  }

  let destinationChain;
  if (chainArg) {
    if (family === 'solana') {
      destinationChain = 'solana:mainnet';
    } else {
      destinationChain = ['base'].includes(chainArg.toLowerCase()) ? 'eip155:8453' : 'eip155:1';
    }
  }

  const progress = await ctx.reply('🛒 Generating a signed MoonPay checkout link…');

  try {
    const link = await ctx.paybox.getBuyLink({
      credentialId: wallet.id,
      destinationChain,
      currencyCode: undefined,
      amountUsd,
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      '💳 **Fund your wallet**\n\n' +
        `Wallet: \`${link.wallet_address}\`\n` +
        `Network: ${link.network}\n` +
        `Currency: ${link.currency_code}${amountUsd ? `\nPre-filled: $${amountUsd}` : ''}\n\n` +
        'Open the link and complete the purchase on MoonPay (payment + KYC happen there). ' +
        'Crypto is delivered straight to this wallet.',
      {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [[{ text: '💳 Buy on MoonPay', url: link.url }]],
        },
      }
    );
  } catch (error) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      `❌ Could not generate a buy link: ${error.message}`
    );
  }
}
