export async function helpCommand(ctx) {
  const helpMessage = `
*📚 Available commands*

*Wallet*
• /balance [wallet_address] — view a Paybox portfolio
• /pay <wallet_address> <amount> <ETH|SOL> — create a validated payment draft
• /transfer <wallet_address> <amount> <ETH|SOL> — legacy alias for /pay
• /sign <message> — displays the current signing safety gate; no request is created
• /wallet <ETH|SOL> <wallet_address> — register a wallet privately for receiving tips
• tip <amount> <ETH|SOL> — reply to a user’s message to prepare a tip draft
• tip @username <amount> <ETH|SOL> — prepare a tip draft for a registered username

*Discovery*
• /services [query] — browse available x402 services (discovery only)

*Examples*
\`/balance 0x1111111111111111111111111111111111111111\`
\`/pay 0x1111111111111111111111111111111111111111 0.25 ETH\`
\`/pay 5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP 1.5 SOL\`
Reply to a user: \`tip 0.03 SOL\`
\`tip @alice 2.4 SOL\`
\`/wallet SOL 5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP\`
\`/sign hello world\`
\`/services flights\`

*Safety*
• Natural-language messages never create payments.
• Review the full destination and amount before confirming a draft.
• A username is only resolved to an address after that user explicitly registers the wallet.
• Wallet transfers are disabled until the Paybox transfer adapter is validated for the installed SDK version.
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}
