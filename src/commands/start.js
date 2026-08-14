export async function startCommand(ctx) {
  const welcomeMessage = `
🎉 Welcome to *Paybox Telegram Bot*

This bot currently helps you:
• Check a Paybox portfolio with /balance
• Create a validated payment draft with /pay
• Register a tip wallet with /wallet
• Prepare a group tip by replying with \`tip 0.03 SOL\`
• Request a wallet signature with /sign
• Discover x402 services with /services

*Current safety model*
Payments and tips are always presented as a draft first. A tip recipient must explicitly register a validated wallet, and a username is never treated as a wallet address. The bot does not create payment requests from ordinary natural-language messages. Wallet transfers remain disabled until the installed Paybox transfer adapter is verified and production controls are configured.

Use /help to see the supported commands.
  `.trim();

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Paybox documentation', url: 'https://docs.paybox.sh' },
      ]],
    },
  });
}
