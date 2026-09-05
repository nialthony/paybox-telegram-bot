export async function startCommand(ctx) {
  const ready = Boolean(ctx.paybox);
  const status = ready
    ? '🟢 Connected to Paybox'
    : '🟠 Paybox not configured yet';

  const message = [
    '🎉 **Welcome to Paybox Bot**',
    '',
    'Your non-custodial wallet for AI agents — right inside Telegram. Check balances, send crypto, swap, pay for x402 services, and browse prediction markets. All signing happens in MoonX MPC; your keys never leave your device.',
    '',
    `Status: ${status}`,
    ctx.canSign ? '✍️ Signing key: in-process signing enabled' : '✍️ Signing key: not set (read-only mode)',
    ctx.hasAgent ? '🧠 AI mode: on — just chat with me' : '🧠 AI mode: off — set OPENAI_API_KEY to enable',
    '',
    '**Quick start:**',
    '• /balance — portfolio overview',
    '• /buy — fund a wallet with a card (MoonPay)',
    '• /transfer — send crypto to any address',
    '• /swap — swap tokens or bridge chains',
    '• /markets — browse prediction markets',
    '• /services — browse paid x402 services',
    '• /help — everything else',
  ].join('\n');

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Balance', callback_data: 'nav:balance' },
          { text: '🔁 Swap', callback_data: 'nav:swap' },
          { text: '📈 Markets', callback_data: 'nav:markets' },
        ],
        [
          { text: '🛍 Services', callback_data: 'nav:services' },
          { text: '📚 Help', callback_data: 'nav:help' },
        ],
        [
          { text: '🔗 Paybox App', url: 'https://app.paybox.sh' },
          { text: '📖 Docs', url: 'https://docs.paybox.sh' },
        ],
      ],
    },
  });
}
