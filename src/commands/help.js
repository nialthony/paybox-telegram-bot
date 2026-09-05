const SECTIONS = [
  {
    title: '💰 Wallet',
    rows: [
      ['/balance', 'Portfolio across all chains'],
      ['/buy', 'Fund a wallet with fiat (MoonPay link)'],
      ['/account', 'Credentials, grants & approval modes'],
      ['/manage', 'Open the Paybox access page (grant/limit changes)'],
    ],
  },
  {
    title: '💸 Money movement',
    rows: [
      ['/transfer <addr|@user> <amount> <token>', 'Send crypto on-chain (ETH, Base ETH, SOL)'],
      ['/swap <token> <token> <amount>', 'Swap or bridge tokens'],
      ['/pay <merchant> <url> <usd>', 'Pay a merchant with a one-time virtual card'],
      ['/sign <message>', 'Sign a message with your wallet'],
      ['/secret <name>', 'Reveal a secret credential (API keys, …)'],
    ],
  },
  {
    title: '🛍 Services & markets',
    rows: [
      ['/services [query]', 'Browse curated x402 paid services'],
      ['/use_service <url>', 'Pay for and fetch an x402 resource'],
      ['/markets', 'Browse prediction markets (World)'],
      ['/market <ticker>', 'Market detail + nested markets'],
      ['/orderbook <id>', 'Order book of a market'],
      ['/positions', 'Your prediction-market positions'],
      ['/perp', 'Hyperliquid perp market data'],
    ],
  },
  {
    title: '📒 Account & history',
    rows: [
      ['/register <address> [@user]', 'Add an entry to the address book'],
      ['/whois <@user|address>', 'Look up the address book'],
      ['/history', 'Recent Paybox requests & their status'],
      ['/stats', 'Bot usage counters'],
    ],
  },
];

export async function helpCommand(ctx) {
  const lines = ['**📚 Command reference**', ''];
  for (const section of SECTIONS) {
    lines.push(`*${section.title}*`);
    for (const [command, description] of section.rows) {
      lines.push(`\`${command}\` — ${description}`);
    }
    lines.push('');
  }
  lines.push(
    '🧠 **AI mode**: when OPENAI_API_KEY is set, just chat — “send 5 USDC to @alice”, “how much ETH do I have?”, “any markets on the Fed decision?”',
    '',
    '🔐 All money operations are passkey-approved or run inside your Paybox grant. Audit log: app.paybox.sh'
  );

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
  });
}
