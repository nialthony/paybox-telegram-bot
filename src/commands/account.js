import { requireCredentials } from './shared.js';
import { shortAddress } from '../utils/format.js';

const KIND_ICON = { wallet: '👛', card: '💳', secret: '🔑' };
const MODE_LABEL = {
  always_approve: '🟡 passkey for every op',
  iframe: '🖥️ in-window confirm',
  autonomous: '🟢 autonomous (grant limits apply)',
};

function summarizeUngranted(ungranted) {
  if (!ungranted) return '';
  if (Array.isArray(ungranted)) {
    return `⚠️ ${ungranted.length} credential(s) exist in Paybox but are not granted to this bot.`;
  }
  const parts = [];
  const wallet = ungranted.wallet;
  if (wallet) {
    const n = (wallet.evm ?? 0) + (wallet.solana ?? 0);
    if (n > 0) parts.push(`${n} wallet(s)`);
  }
  if (ungranted.card) parts.push(`${ungranted.card} card(s)`);
  if (ungranted.secret) parts.push(`${ungranted.secret} secret(s)`);
  if (parts.length === 0) return '';
  return `⚠️ Not granted to this bot yet: ${parts.join(', ')}. Use /manage to grant access.`;
}

export async function accountCommand(ctx) {
  const { credentials, ungranted } = await requireCredentials(ctx, { force: true });

  if (credentials.length === 0) {
    await ctx.reply(
      '📭 **No credentials granted**\n\n' +
        'Paybox is connected, but this bot has not been granted any credentials yet.\n\n' +
        'Open the Paybox app → Clients → this bot, and grant a wallet, card or secret. Then press Refresh below.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔓 Manage access', url: 'https://app.paybox.sh' }],
            [{ text: '🔄 Refresh', callback_data: 'nav:account' }],
          ],
        },
      }
    );
    return;
  }

  const lines = ['**👤 Paybox credentials**', ''];
  for (const c of credentials) {
    const icon = KIND_ICON[c.kind] ?? '•';
    const address = c.metadata?.address;
    const detail = address
      ? ` — \`${shortAddress(address)}\``
      : c.metadata?.brand
        ? ` — ${c.metadata.brand} •••• ${c.metadata.last4 ?? ''}`
        : '';
    const mode = MODE_LABEL[c.approvalMode] ?? c.approvalMode;
    lines.push(`${icon} **${c.name || c.id}**${detail}`);
    lines.push(`   _${c.kind} · ${mode}_`);
  }

  const ungrantedNote = summarizeUngranted(ungranted);
  if (ungrantedNote) {
    lines.push('');
    lines.push(ungrantedNote);
  }

  lines.push('');
  lines.push('_Approval modes are set per-credential in the Paybox app._');

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔓 Manage access', callback_data: 'manage' },
          { text: '🔄 Refresh', callback_data: 'nav:account' },
        ],
      ],
    },
  });
}

/** /manage — ask the user to update this connector's access. */
export async function manageCommand(ctx, args) {
  const note = args.join(' ') || 'update this bot’s Paybox access';
  const client = ctx.paybox;
  if (!client) {
    await ctx.reply('⚠️ Paybox is not configured yet — nothing to manage.', { parse_mode: 'Markdown' });
    return;
  }

  const result = await client.requestAccountChange(note);
  const url = result.manage_url || result.url;

  await ctx.reply(
    '🔓 **Update bot access**\n\n' +
      'Open the link below to change this bot’s Paybox access: grant another credential, raise a limit, or switch an approval mode.\n\n' +
      'Changes apply to your own passkey-gated Paybox session — nothing is changed on the bot’s behalf.',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔐 Open Paybox', url }]],
      },
    }
  );
}
