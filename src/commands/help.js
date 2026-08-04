export async function helpCommand(ctx) {
  const helpMessage = `
**📚 Available Commands**

**Wallet & Portfolio:**
• /balance - Check your crypto portfolio across all chains
• /transfer - Send crypto to another wallet
• /sign - Sign a message with your wallet

**Services & Payments:**
• /services - Browse and use x402 services (flights, Amazon, APIs, etc.)
• /email - Access your Paybox email inbox
• /markets - Browse prediction markets

**Account:**
• /account - Manage your Paybox credentials
• /history - View recent transactions

**Other:**
• /help - Show this help message
• /start - Show welcome message

**Examples:**

\`/balance\` - Shows your portfolio
\`/transfer 0x123... 1.5 ETH\` - Send 1.5 ETH to address
\`/sign hello world\` - Sign the message "hello world"
\`/services flights\` - Search for flight booking services

**Need help?**
Visit https://docs.paybox.sh for full documentation.
  `.trim();

  await ctx.reply(helpMessage, {
    parse_mode: 'Markdown',
  });
}
