import { isAddress } from 'viem';
import { PublicKey } from '@solana/web3.js';

/**
 * Input validation helpers. All user input for money operations passes
 * through here before touching Paybox or the network.
 */

export function isEvmAddress(value) {
  return typeof value === 'string' && isAddress(value);
}

export function isSolanaAddress(value) {
  if (typeof value !== 'string') return false;
  try {
    new PublicKey(value);
    return value.length >= 32 && value.length <= 44;
  } catch {
    return false;
  }
}

export function isAnyAddress(value) {
  return isEvmAddress(value) || isSolanaAddress(value);
}

export function addressFamily(value) {
  if (isSolanaAddress(value)) return 'solana';
  if (isEvmAddress(value)) return 'evm';
  return null;
}

export function isTelegramHandle(value) {
  return /^@[A-Za-z0-9_]{5,32}$/.test(String(value || ''));
}

/**
 * Parse a decimal amount. Rejects negatives, zero, NaN, scientific notation
 * and more than `maxDecimals` fractional digits.
 */
export function parseAmount(input, { maxDecimals = 18, min = 1e-9 } = {}) {
  const raw = String(input ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < min) return null;
  const frac = raw.split('.')[1];
  if (frac && frac.length > maxDecimals) return null;
  return value;
}

export function parseUsd(input) {
  const raw = String(input ?? '').trim().replace(/^\$/, '');
  const value = parseAmount(raw, { maxDecimals: 2, min: 0.01 });
  return value === null ? null : Math.round(value * 100);
}

export function isUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeText(value, maxLength = 1024) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return text.slice(0, maxLength);
}

export function truncateUtf8(text, maxBytes = 4000) {
  let out = '';
  let bytes = 0;
  for (const char of String(text)) {
    const size = Buffer.byteLength(char);
    if (bytes + size > maxBytes) break;
    out += char;
    bytes += size;
  }
  return out;
}
