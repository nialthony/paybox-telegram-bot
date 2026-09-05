import { JsonFileStore } from './jsonFile.js';

/**
 * Group expense splits.
 *
 * `/split 30 ETH team lunch @alice @bob` records an expense the creator
 * paid, split evenly across the creator + listed participants. Each
 * participant owes the payer their share. Settlement goes through the
 * normal /transfer pipeline (so passkey approvals still apply) when a
 * participant settles from the bot owner's account, or can be marked as
 * paid out-of-band by the payer.
 *
 * Shares are computed in fixed-point "micro" units (10^-9 of the display
 * amount) so equal division never touches floating point. The last
 * participant (the payer) absorbs any indivisible remainder dust, and
 * non-payer shares are always ≤ 9 decimals so they remain executable by
 * /transfer input validation.
 */

const SHARE_SCALE = 9; // decimals of share precision (micro units)
const MAX_PARTICIPANTS = 25;

/** Split totalMicro into n even shares (floor); the last share absorbs dust. */
export function splitEvenly(totalMicro, participantCount) {
  const total = BigInt(totalMicro);
  const n = BigInt(participantCount);
  if (n <= 0n) throw new Error('split needs at least one participant');
  const base = total / n;
  const dust = total - base * n;
  const shares = Array.from({ length: Number(n) }, () => base);
  shares[Number(n) - 1] += dust;
  return shares;
}

/** Fixed-point micro string → plain decimal string (trailing zeros trimmed). */
export function microToAmount(micro) {
  const s = String(micro).padStart(SHARE_SCALE + 1, '0');
  const whole = s.slice(0, s.length - SHARE_SCALE);
  let frac = s.slice(s.length - SHARE_SCALE);
  frac = frac.replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** Plain decimal amount → fixed-point micro BigInt string. */
export function amountToMicro(amount) {
  const raw = String(amount);
  const [whole, frac = ''] = raw.split('.');
  const padded = (frac + '0'.repeat(SHARE_SCALE)).slice(0, SHARE_SCALE);
  return (BigInt(whole) * 10n ** BigInt(SHARE_SCALE) + BigInt(padded || '0')).toString();
}

export class SplitsStore {
  constructor({ dir }) {
    this.store = new JsonFileStore({
      dir,
      file: 'splits.json',
      defaults: { splits: {}, seq: 0 },
    });
  }

  /**
   * Create a split. participants: [{ handle, address }] — the payer
   * (creator) is prepended automatically and absorbs division dust.
   */
  create({ chatId, createdBy, payerHandle, description, totalAmount, tokenSymbol, chainKey, chainLabel, participants }) {
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('split needs at least one other participant');
    }
    if (participants.length + 1 > MAX_PARTICIPANTS) {
      throw new Error(`too many participants (max ${MAX_PARTICIPANTS})`);
    }

    const totalMicro = amountToMicro(totalAmount);
    const everyone = [{ handle: payerHandle, address: null, isPayer: true }, ...participants];
    // The payer sits last in the share list so they absorb the dust.
    const ordered = [...participants, { handle: payerHandle, address: null, isPayer: true }];
    const shares = splitEvenly(totalMicro, ordered.length);

    let id = null;
    this.store.mutate((data) => {
      data.seq += 1;
      id = `spl_${data.seq}`;
      data.splits[id] = {
        id,
        chatId,
        createdBy,
        createdAt: new Date().toISOString(),
        description: String(description || 'group expense').slice(0, 120),
        totalAmount: String(totalAmount),
        totalMicro,
        tokenSymbol,
        chainKey,
        chainLabel,
        payer: { handle: payerHandle },
        participants: ordered.map((p, i) => ({
          handle: p.handle,
          address: p.address ?? null,
          isPayer: Boolean(p.isPayer),
          shareMicro: shares[i].toString(),
          paid: null,
        })),
        status: 'open',
      };
    });
    return this.get(id);
  }

  get(id) {
    return this.store.load().splits[String(id)] ?? null;
  }

  list({ chatId, includeClosed = false } = {}) {
    return Object.values(this.store.load().splits).filter(
      (s) => (includeClosed || s.status === 'open') && (chatId === undefined || s.chatId === chatId)
    );
  }

  participant(split, handle) {
    const normalized = String(handle || '').toLowerCase().replace(/^@/, '');
    return split.participants.find((p) => String(p.handle || '').toLowerCase().replace(/^@/, '') === normalized) ?? null;
  }

  /** Mark a participant as settled (how: 'transfer' | 'external'). */
  markPaid(id, handle, { txId = null, how = 'transfer' } = {}) {
    const split = this.get(id);
    if (!split) throw new Error(`unknown split ${id}`);
    const participant = this.participant(split, handle);
    if (!participant) throw new Error(`@${String(handle).replace(/^@/, '')} is not part of ${id}`);
    if (participant.paid) return this.get(id);

    this.store.mutate((data) => {
      const record = data.splits[id];
      const target = this.participant(record, handle);
      target.paid = { txId, how, at: new Date().toISOString() };
      const settled = record.participants.every((p) => p.paid);
      if (settled) {
        record.status = 'settled';
        record.settledAt = new Date().toISOString();
      }
    });
    return this.get(id);
  }

  cancel(id) {
    const split = this.get(id);
    if (!split) throw new Error(`unknown split ${id}`);
    this.store.mutate((data) => {
      data.splits[id].status = 'cancelled';
      data.splits[id].cancelledAt = new Date().toISOString();
    });
    return this.get(id);
  }

  isSettled(id) {
    return this.get(id)?.status === 'settled';
  }

  size() {
    return Object.keys(this.store.load().splits).length;
  }
}
