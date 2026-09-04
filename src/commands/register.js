import { UsageError } from '../middleware/index.js';
import { isAnyAddress, isTelegramHandle } from '../utils/validate.js';
import { shortAddress, formatTimestamp } from '../utils/format.js';

/**
 * Address book commands.
 *  /register <address> [@user]  — add an entry (defaults to the sender)
 *  /whois <@user|address>       — look up an entry
 *  /unregister <@user>          — remove an entry
 */
export async function registerCommand(ctx, args) {
  if (!ctx.registry) throw new UsageError('❌ Address book is not available in this configuration.');

  const addressArg = args.find((a) => isAnyAddress(a));
  const handleArg = args.find((a) => isTelegramHandle(a));

  const address = addressArg || args[0];
  if (!address || !isAnyAddress(address)) {
    throw new UsageError(
      '❌ **Usage**: `/register <address> [@user]`\n\n' +
        '**Examples**\n' +
        '• `/register 0x1234…abcd` — registers your own address\n' +
        '• `/register 0x1234…abcd @alice` — registers @alice’s address'
    );
  }

  const handle = handleArg || (ctx.from?.username ? `@${ctx.from.username}` : null);
  if (!handle) {
    throw new UsageError(
      '❌ You have no Telegram username set, so I need one explicitly: `/register <address> @username`'
    );
  }

  const entry = ctx.registry.add({
    handle,
    address,
    addedBy: ctx.from?.id ?? null,
    alias: ctx.from?.first_name ?? null,
  });

  await ctx.reply(
    `✅ **Saved to the address book**\n\n` +
      `@${entry.handle} → \`${shortAddress(entry.address, 12, 8)}\`\n\n` +
      'Now anyone can `/pay @' + entry.handle + '` or `/transfer @' + entry.handle + ' …`.',
    { parse_mode: 'Markdown' }
  );
}

export async function whoisCommand(ctx, args) {
  if (!ctx.registry) throw new UsageError('❌ Address book is not available in this configuration.');
  const query = args[0];
  if (!query) throw new UsageError('❌ Usage: `/whois <@user|address>`');

  const entry = query.startsWith('@') ? ctx.registry.byHandle(query) : ctx.registry.byAddress(query);

  if (!entry) {
    await ctx.reply(`📭 Nothing in the address book for "${query}".`, { parse_mode: 'Markdown' });
    return;
  }

  await ctx.reply(
    `👤 **Address book entry**\n\n` +
      `Handle: @${entry.handle}\n` +
      `Address: \`${entry.address}\`\n` +
      `Added: ${formatTimestamp(entry.addedAt)}${entry.alias ? `\nBy: ${entry.alias}` : ''}`,
    { parse_mode: 'Markdown' }
  );
}

export async function unregisterCommand(ctx, args) {
  if (!ctx.registry) throw new UsageError('❌ Address book is not available in this configuration.');
  const handle = args[0];
  if (!handle || !isTelegramHandle(handle)) throw new UsageError('❌ Usage: `/unregister @user`');

  const removed = ctx.registry.remove(handle);
  if (!removed) {
    await ctx.reply(`📭 @${handle.slice(1)} was not in the address book.`, { parse_mode: 'Markdown' });
    return;
  }
  await ctx.reply(`🗑 Removed @${removed.handle} from the address book.`, { parse_mode: 'Markdown' });
}
