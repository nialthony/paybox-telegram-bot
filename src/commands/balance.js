export async function balanceCommand(ctx) {
  try {
    await ctx.reply('⏳ Fetching your portfolio...');

    const { credentials } = await ctx.paybox.listCredentials();

    if (credentials.length === 0) {
      await ctx.reply('❌ No credentials found. Please connect your wallet first at https://app.paybox.sh');
      return;
    }

    // Get portfolio for all wallets
    const portfolio = await ctx.paybox.getPortfolio();

    if (!portfolio || portfolio.total_usd === null) {
      await ctx.reply('📊 Portfolio is empty or no pricing data available.');
      return;
    }

    // Format portfolio message
    let message = `💰 **Your Portfolio**\n\n`;
    message += `**Total Value:** $${portfolio.total_usd?.toFixed(2) || '0.00'} USD\n\n`;

    if (portfolio.wallets && portfolio.wallets.length > 0) {
      message += `**Wallets:**\n`;
      for (const wallet of portfolio.wallets) {
        message += `• ${wallet.wallet_name || wallet.wallet_address.slice(0, 10)}...\n`;
        message += `  Balance: $${wallet.total_usd?.toFixed(2) || '0.00'}\n`;
      }
    }

    if (portfolio.holdings && portfolio.holdings.length > 0) {
      message += `\n**Holdings:**\n`;
      for (const holding of portfolio.holdings.slice(0, 10)) {
        // Show top 10 holdings
        const symbol = holding.symbol || 'Unknown';
        const amount = holding.balance?.ui_amount_string || '0';
        const usd = holding.priced_usd?.toFixed(2) || '0.00';
        const change = holding.priceChange24h
          ? ` (${(holding.priceChange24h * 100).toFixed(1)}%)`
          : '';
        message += `• ${symbol}: ${amount} ($${usd})${change}\n`;
      }
    }

    message += `\n_Last updated: ${new Date(portfolio.as_of).toLocaleTimeString()}_`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('Balance command error:', error);
    await ctx.reply(`❌ Error fetching portfolio: ${error.message}`);
  }
}
