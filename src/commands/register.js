import { UsageError } from '../middleware/index.js';
import { isAnyAddress, isTelegramHandle } from '../utils/validate.js';
import { shortAddress, formatTimestamp } from '../utils/format.js';

/**
 * Address book commands.
 *  /register <address> [@user] [--force]  — add an entry (defaults to the sender)
 *  /whois <@user|address>                 — look up an entry
 *  /unregister <@user>                    — remove an entry
 *
 * Security (v2.1.1):
 *  - Non-owners may only bind a handle that matches their own Telegram username.
 *  - Owner (OWNER_TELEGRAM_ID) may register anyone.
 *  - Overwrites require --force and show old → new.
 *  - __proto__/constructor/prototype are rejected (registry layer).
 */

function normalizeHandle(h) {
  return String(h).toLowerCase().replace(/^@/, '');
}

export async function registerCommand(ctx, args) {
  if (!ctx.registry) throw new UsageError('❌ Address book is not available in this configuration.');

  const rawArgs = [...args];
  const force = rawArgs.includes('--force');
  const filteredArgs = rawArgs.filter((a) => a !== '--force');

  const addressArg = filteredArgs.find((a) => isAnyAddress(a));
  const handleArg = filteredArgs.find((a) => isTelegramHandle(a));

  const address = addressArg || filteredArgs[0];
  if (!address || !isAnyAddress(address)) {
    throw new UsageError(
      '❌ **Usage**: `/register <address> [@user] [--force]`\n\n' +
        '**Examples**\n' +
        '• `/register 0x1234…abcd` — registers your own address\n' +
        '• `/register 0x1234…abcd @alice` — (owner) registers @alice’s address\n' +
        '• `/register 0x1234…abcd --force` — overwrite your own entry'
    );
  }

  const handle = handleArg || (ctx.from?.username ? `@${ctx.from.username}` : null);
  if (!handle) {
    throw new UsageError(
      '❌ You have no Telegram username set, so I need one explicitly: `/register <address> @username`'
    );
  }

  // H2: only owner may register other users
  const callerUsername = ctx.from?.username ? normalizeHandle(ctx.from.username) : null;
  const targetHandleNorm = normalizeHandle(handle);
  const isOwner = ctx.config?.ownerTelegramId && ctx.from?.id === ctx.config.ownerTelegramId;

  if (!isOwner) {
    if (!callerUsername) {
      throw new UsageError(
        '❌ You have no Telegram username, so you cannot register an address. Set a username in Telegram settings first.'
      );
    }
    if (targetHandleNorm !== callerUsername) {
      throw new UsageError(
        `❌ You can only register your own handle @${callerUsername}. ` +
          `Asked to register @${targetHandleNorm}. ` +
          `The bot owner (OWNER_TELEGRAM_ID) may register anyone.`
      );
    }
  }

  // H2 + L1: check existing entry and require --force
  const existing = ctx.registry.byHandle(handle);
  if (existing) {
    if (!force) {
      throw new UsageError(
        `❌ @${existing.handle} is already in the address book → \`${shortAddress(existing.address, 12, 8)}\`.\n\n` +
          `To overwrite, run: \`/register ${address} @${existing.handle} --force\`\n` +
          `Old → New: \`${shortAddress(existing.address, 12, 8)}\` → \`${shortAddress(address, 12, 8)}\``
      );
    }
    // Overwrite with explicit confirmation showing old → new
    const entry = ctx.registry.add({
      handle,
      address,
      addedBy: ctx.from?.id ?? null,
      alias: ctx.from?.first_name ?? null,
    });

    await ctx.reply(
      `✅ **Updated address book (forced)**\n\n` +
        `@${existing.handle}:\n` +
        `\`${shortAddress(existing.address, 12, 8)}\` → \`${shortAddress(entry.address, 12, 8)}\`\n\n` +
        'Now anyone can `/pay @' + entry.handle + '` or `/transfer @' + entry.handle + ' …`.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const entry = ctx.registry.add({
    handle,
    address,
    addedBy: ctx.from?.id ?? null,
    alias: ctx.from?.first_name ?? null,
  });

  await ctx.reply(
    `✅ **Saved to the address book**\n\n` +
      `@${entry.handle} → \`${shortAddress(entry.address, 12, 8)}\`\\n\\n` +
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

  // Non-owners may only unregister their own handle (same policy as register)
  const callerUsername = ctx.from?.username ? normalizeHandle(ctx.from.username) : null;
  const targetNorm = normalizeHandle(handle);
  const isOwner = ctx.config?.ownerTelegramId && ctx.from?.id === ctx.config.ownerTelegramId;
  if (!isOwner && callerUsername && targetNorm !== callerUsername) {
    throw new UsageError(
      `❌ You can only unregister your own handle @${callerUsername}. ` +
        `The bot owner may unregister anyone.`
    );
  }

  const removed = ctx.registry.remove(handle);
  if (!removed) {
    await ctx.reply(`📭 @${handle.slice(1)} was not in the address book.`, { parse_mode: 'Markdown' });
    return;
  }
  await ctx.reply(`🗑 Removed @${removed.handle} from the address book.`, { parse_mode: 'Markdown' });
}
