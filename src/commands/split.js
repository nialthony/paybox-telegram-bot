import { UsageError } from '../middleware/index.js';
import { resolveToken } from '../utils/tokens.js';
import { parseAmount, isTelegramHandle, sanitizeText } from '../utils/validate.js';
import { formatTimestamp, escapeMd } from '../utils/format.js';
import { microToAmount } from '../store/splits.js';
import { executeTransfer } from './transfer.js';

/**
 * /split — group expense splitter.
 *
 *   /split <amount> <token> <description…> @a @b [@c …]
 *   /split status [id]
 *   /split settle <id>       — pay YOUR share to the payer (real transfer,
 *                              normal approvals apply)
 *   /split paid <id> @user   — payer marks @user as settled out-of-band
 *   /split cancel <id>
 *
 * The creator is the payer and a participant. Everyone else owes the payer
 * their share. The bot never pulls money from participants — it can only
 * send from the owner's wallet, so `settle` is how the *owner* pays their
 * share to the payer; everyone else settles out-of-band and is marked paid.
 *
 * Security (v2.1.1):
 *  - Payer identity is bound to immutable Telegram user id (createdBy / payer.userId),
 *    not mutable username. Usernames are display-only.
 *  - Payer actions (markPaid, cancel) check userId, not handle.
 *  - Settle payee is resolved via payerUserId + stored address, not mutable handle.
 *  - Descriptions are escaped for Markdown.
 */
export async function splitCommand(ctx, args) {
  if (!ctx.splits) {
    throw new UsageError('❌ Splits are unavailable (store not configured).');
  }

  const [sub = '', ...rest] = args;

  if (sub === 'status') return showSplit(ctx, rest[0]);
  if (sub === 'settle') return settleSplit(ctx, rest[0]);
  if (sub === 'paid') return markPaid(ctx, rest[0], rest[1]);
  if (sub === 'cancel') return cancelSplit(ctx, rest[0]);
  if (parseAmount(sub, { maxDecimals: 9, min: 1e-9 }) !== null) return createSplit(ctx, args);

  return usage(ctx);
}

function usage(ctx) {
  const lines = [
    '💸 **Group expense splitter**',
    '',
    '`/split <amount> <token> <description…> @a @b` — record an expense you paid, split evenly (you included)',
    '`/split status [id]` — balances of an open split (or all open splits here)',
    '`/split settle <id>` — pay **your** share to the payer (a real transfer, approvals apply)',
    '`/split paid <id> @user` — (payer) mark @user as settled out-of-band',
    '`/split cancel <id>` — (payer) cancel the split',
    '',
    '**Example**',
    '• `/split 0.09 ETH team lunch @alice @bob`',
    '',
    'Tokens: ETH, BASE, SOL (native only — /swap other tokens first). @handles must be in the address book (/register).',
  ];
  return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
}

function myHandle(ctx) {
  return ctx.from?.username ? `@${ctx.from.username}` : null;
}

function isPayerUser(split, userId) {
  if (!userId) return false;
  if (split.createdBy && split.createdBy === userId) return true;
  if (split.payer?.userId && split.payer.userId === userId) return true;
  return false;
}

async function createSplit(ctx, args) {
  const [amountInput, tokenInput, ...words] = args;

  const amount = parseAmount(amountInput, { maxDecimals: 9, min: 1e-9 });
  if (amount === null) {
    throw new UsageError(`❌ Invalid amount: "${amountInput}". Use a plain decimal like 30 or 0.09.`);
  }

  const resolved = resolveToken(tokenInput);
  if (!resolved || resolved.token.address !== 'native') {
    throw new UsageError(
      `❌ Unsupported token: "${tokenInput}". Splits use native ETH (Ethereum), BASE (Base) or SOL (Solana) — /swap other tokens first.`
    );
  }
  const { chain } = resolved;

  const handles = words.filter((w) => w.startsWith('@'));
  const descriptionWords = words.filter((w) => !w.startsWith('@'));
  const description = sanitizeText(descriptionWords.join(' '), 120) || 'group expense';

  if (handles.length === 0) {
    throw new UsageError('❌ Add at least one other participant: `/split 30 ETH lunch @alice @bob`.');
  }

  const participants = [];
  for (const handle of handles) {
    if (!isTelegramHandle(handle)) {
      throw new UsageError(`❌ "${handle}" is not a valid Telegram handle.`);
    }
    const entry = ctx.registry?.byHandle(handle);
    if (!entry) {
      throw new UsageError(
        `❌ **${handle} is not in the address book.** Save their wallet address first:\n\n\`/register <address> ${handle.slice(1)}\``
      );
    }
    participants.push({ handle: handle.slice(1).toLowerCase(), address: entry.address });
  }

  const payerHandle = myHandle(ctx);
  const payerUserId = ctx.from?.id ?? null;
  // Try to resolve payer's own address at creation time for secure settlement
  let payerAddress = null;
  if (payerHandle) {
    const payerEntry = ctx.registry?.byHandle(payerHandle);
    if (payerEntry) payerAddress = payerEntry.address;
  }

  const split = ctx.splits.create({
    chatId: ctx.chat.id,
    createdBy: payerUserId,
    payerHandle: payerHandle ? payerHandle.slice(1).toLowerCase() : null,
    payerUserId,
    payerAddress,
    description,
    totalAmount: amount,
    tokenSymbol: chain.nativeSymbol,
    chainKey: chain.key,
    chainLabel: chain.label,
    participants,
  });

  await ctx.reply(renderSplit(split, { created: true }), {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
  });
  ctx.stats?.hit('split_created');
}

function renderSplit(split, { created = false } = {}) {
  const lines = [];
  lines.push(created ? `💸 **Split created** — \`${split.id}\`` : `💸 **Split** — \`${split.id}\``);
  lines.push('');
  // L2: escape user-controlled description
  lines.push(`_${escapeMd(split.description)}_`);
  lines.push(`Total: ${split.totalAmount} ${escapeMd(split.tokenSymbol)} (${escapeMd(split.chainLabel)}) · ${formatTimestamp(split.createdAt)}`);
  lines.push('');
  for (const p of split.participants) {
    const who = p.isPayer ? `${p.handle ? `@${escapeMd(p.handle)}` : 'payer'} (paid the bill)` : `@${escapeMd(p.handle)}`;
    const share = `${microToAmount(p.shareMicro)} ${escapeMd(split.tokenSymbol)}`;
    lines.push(`${p.paid ? '✅' : '⬜'} ${who} — ${share}`);
  }
  if (split.status === 'settled') lines.push('', '🎉 All settled up!');
  return lines.join('\n');
}

async function showSplit(ctx, id) {
  if (id) {
    const split = ctx.splits.get(id);
    if (!split || split.chatId !== ctx.chat.id) {
      throw new UsageError(`❌ No split \`${id}\` in this chat.`);
    }
    await ctx.reply(renderSplit(split), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
    return;
  }

  const open = ctx.splits.list({ chatId: ctx.chat.id });
  if (open.length === 0) {
    await ctx.reply('💸 No open splits in this chat. Start one: `/split 30 ETH lunch @alice @bob`.', {
      parse_mode: 'Markdown',
    });
    return;
  }
  for (const split of open.slice(0, 10)) {
    await ctx.reply(renderSplit(split), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
  }
}

function requireSplit(ctx, id) {
  const split = ctx.splits.get(id);
  if (!split || split.chatId !== ctx.chat.id) {
    throw new UsageError(`❌ No split \`${id}\` in this chat.`);
  }
  if (split.status !== 'open') {
    throw new UsageError(`❌ Split \`${id}\` is already ${split.status}.`);
  }
  return split;
}

async function settleSplit(ctx, id) {
  if (!id) throw new UsageError('❌ Usage: `/split settle <id>`');

  const split = requireSplit(ctx, id);

  const handle = myHandle(ctx);
  const callerId = ctx.from?.id ?? null;

  if (!handle && !callerId) {
    throw new UsageError('❌ You need a Telegram username or id to settle a split.');
  }

  // Payer cannot settle their own share — check by userId first, then handle fallback
  if (callerId && isPayerUser(split, callerId)) {
    throw new UsageError(
      '❌ You are the payer here — others pay *you*. When they do, mark them with `/split paid ' + split.id + ' @who`.'
    );
  }
  const normalized = handle ? handle.slice(1).toLowerCase() : null;
  if (normalized && split.payer?.handle && normalized === split.payer.handle && !split.payer?.userId) {
    // Fallback for old splits without userId
    throw new UsageError(
      '❌ You are the payer here — others pay *you*. When they do, mark them with `/split paid ' + split.id + ' @who`.'
    );
  }

  // Find participant — try by handle, then by userId if available
  let participant = null;
  if (handle) participant = ctx.splits.participant(split, handle);
  if (!participant && callerId) participant = ctx.splits.participantByUserId(split, callerId);
  // If still not found, try handle lookup via stored participants that may have no handle but userId
  if (!participant && handle) {
    // last resort: check if caller is participant by handle
    participant = ctx.splits.participant(split, handle);
  }

  if (!participant) {
    throw new UsageError(`❌ You are not part of ${split.id}.`);
  }
  if (participant.paid) {
    throw new UsageError(`✅ Your share of ${split.id} is already settled.`);
  }

  // Resolve payer address securely: prefer stored address (bound to userId at creation), fallback to registry
  let payerAddress = split.payer?.address || null;
  let payerHandleForTransfer = split.payer?.handle ? `@${split.payer.handle}` : null;

  if (!payerAddress) {
    if (!split.payer?.handle) {
      throw new UsageError('❌ The payer of this split has no Telegram username and no stored address, so their address cannot be resolved.');
    }
    const payerEntry = ctx.registry?.byHandle(`@${split.payer.handle}`);
    if (!payerEntry) {
      throw new UsageError(
        `❌ The payer @${split.payer.handle} is not in the address book — save their address with /register first.`
      );
    }
    payerAddress = payerEntry.address;
    payerHandleForTransfer = `@${split.payer.handle}`;
  }

  // Use address directly if we have it, otherwise use handle (transfer will resolve via registry)
  const recipientInput = payerAddress || payerHandleForTransfer;
  if (!recipientInput) {
    throw new UsageError('❌ Cannot resolve payer address for settlement.');
  }

  const shareAmount = microToAmount(participant.shareMicro);
  const result = await executeTransfer(ctx, {
    recipientInput,
    amount: Number(shareAmount),
    tokenInput: split.tokenSymbol,
  });

  if (result?.ok) {
    // Mark paid by handle if available, else by participant handle
    const markHandle = participant.handle ? `@${participant.handle}` : handle;
    const updated = ctx.splits.markPaid(split.id, markHandle, { txId: result.txId, how: 'transfer' });
    await ctx.reply(renderSplit(updated), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
    ctx.stats?.hit('split_settled');
  }
  // On failure executeTransfer already reported the reason in-chat.
}

async function markPaid(ctx, id, handle) {
  if (!id || !handle) throw new UsageError('❌ Usage: `/split paid <id> @user`');

  const split = requireSplit(ctx, id);

  const callerId = ctx.from?.id ?? null;
  // M3: authorize by userId, not handle
  if (!isPayerUser(split, callerId)) {
    // Fallback for old splits: check handle
    const me = myHandle(ctx);
    const normalized = me ? me.slice(1).toLowerCase() : null;
    if (normalized !== split.payer?.handle) {
      throw new UsageError('❌ Only the payer can mark participants as paid.');
    }
  }
  if (!isTelegramHandle(handle)) {
    throw new UsageError(`❌ "${handle}" is not a valid Telegram handle.`);
  }

  const updated = ctx.splits.markPaid(id, handle, { how: 'external' });
  await ctx.reply(renderSplit(updated), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
}

async function cancelSplit(ctx, id) {
  if (!id) throw new UsageError('❌ Usage: `/split cancel <id>`');

  const split = requireSplit(ctx, id);

  const callerId = ctx.from?.id ?? null;
  const isOwner = ctx.config?.ownerTelegramId && callerId === ctx.config.ownerTelegramId;

  // M3: payer check by userId
  if (!isPayerUser(split, callerId) && !isOwner) {
    // Fallback for old splits without userId: check createdBy and handle
    const me = myHandle(ctx);
    const normalized = me ? me.slice(1).toLowerCase() : null;
    if (normalized !== split.payer?.handle && callerId !== split.createdBy) {
      throw new UsageError('❌ Only the payer can cancel this split.');
    }
  }

  const cancelled = ctx.splits.cancel(id);
  await ctx.reply(`🗑 **Split \`${cancelled.id}\` cancelled.**`, { parse_mode: 'Markdown' });
}
