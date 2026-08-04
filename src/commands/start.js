export async function startCommand(ctx) {
  const welcomeMessage = `
🎉 Welcome to **Paybox Telegram Bot**!

I'm your gateway to Web3 payments, crypto transfers, and decentralized services - all from Telegram.

**What I can do:**
• 💰 Check your crypto portfolio balance
• 🔄 Transfer crypto to friends
• ✍️ Sign messages with your wallet
• ✈️ Book flights, buy from Amazon, and more via x402 services
• 📊 Trade prediction markets
• 📧 Access your email inbox

**Get started:**
Use /help to see all available commands or /balance to check your portfolio.

**Security:**
All operations require your Paybox approval. Your private keys never leave your device.
  `.trim();

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📖 Help', callback_data: 'help' },
          { text: '💰 Balance', callback_data: 'balance' },
        ],
        [
          { text: '🔗 Paybox Docs', url: 'https://docs.paybox.sh' },
          { text: '⭐ GitHub', url: 'https://github.com/moonpay/paybox' },
        ],
      ],
    },
  });
}
