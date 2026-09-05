import { UsageError } from '../middleware/index.js';
import {
  normalizeCredentialList,
  walletsOf,
  cardsOf,
  secretsOf,
  walletFamily,
} from '../paybox/client.js';

/**
 * Shared command plumbing: Paybox client/credential access with friendly
 * setup errors, plus a small credential cache per session.
 */

const CREDENTIAL_CACHE_MS = 30 * 1000;

export function setupMessage(ctx) {
  return [
    '⚠️ **Paybox setup required**\n\n',
    'This bot is not connected to Paybox yet. To use it:\n',
    '1. Create an account at [app.paybox.sh](https://app.paybox.sh)\n',
    '2. Connect a wallet and/or card, and grant this Telegram bot access\n',
    '3. Put the **Auth Token** (`pbx_live_…`) in `PAYBOX_API_KEY`\n',
    '4. (Recommended) put the **Signing Key** (`pbxk1.…`) in `PAYBOX_SIGNING_KEY`\n',
    '5. Restart the bot and run /start again',
  ].join('\n');
}

export function requireClient(ctx) {
  const client = ctx.paybox;
  if (!client) {
    throw new UsageError(setupMessage(ctx));
  }
  return client;
}

export async function requireCredentials(ctx, { force = false } = {}) {
  const client = requireClient(ctx);
  const cached = ctx.session?.credentials;
  if (!force && cached && Date.now() - cached.at < CREDENTIAL_CACHE_MS) {
    return cached.data;
  }
  const raw = await client.listCredentials();
  const data = normalizeCredentialList(raw);
  if (ctx.session) ctx.session.credentials = { at: Date.now(), data };
  return data;
}

export async function requireWallet(ctx, { family } = {}) {
  const { credentials } = await requireCredentials(ctx);
  const wallets = walletsOf(credentials);
  if (wallets.length === 0) {
    throw new UsageError(
      '❌ **No wallet found**\n\n' +
        'This bot has no wallet credential granted. Connect a wallet in the Paybox app and grant access to this bot, then run /account.'
    );
  }
  const wallet = family
    ? wallets.find((w) => walletFamily(w) === family) || null
    : wallets[0];
  if (!wallet) {
    throw new UsageError(
      `❌ **No ${family} wallet**\n\n` +
        `This operation needs a ${family} wallet, but only ${wallets
          .map((w) => walletFamily(w))
          .join('/')} wallet(s) are granted. Grant a ${family} wallet in Paybox, then run /account.`
    );
  }
  return wallet;
}

export async function requireCard(ctx) {
  const { credentials } = await requireCredentials(ctx);
  const card = cardsOf(credentials)[0];
  if (!card) {
    throw new UsageError(
      '❌ **No card found**\n\n' +
        'Card payments need a card credential. Add a card in the Paybox app and grant access to this bot, then run /account.'
    );
  }
  return card;
}

export async function requireSecret(ctx, ref) {
  const { credentials } = await requireCredentials(ctx);
  const secrets = secretsOf(credentials);
  if (secrets.length === 0) {
    throw new UsageError(
      '❌ **No secrets found**\n\n' +
        'This bot has no secret credentials granted. Add one in the Paybox app and grant access, then run /account.'
    );
  }
  if (!ref) return secrets;
  return secrets.filter(
    (s) => s.id === ref || s.name?.toLowerCase() === String(ref).toLowerCase()
  );
}

/** Parse args from a Telegram message, handling the @botname suffix. */
export function parseArgs(ctx) {
  const text = ctx.message?.text ?? '';
  const parts = text.replace(/^\/\w+(?:@\w+)?/, '').trim().split(/\s+/);
  return parts[0] === '' ? [] : parts;
}

/** Parse args from the AI agent's structured params. */
export function argsFromParams(params, fields) {
  const out = [];
  for (const field of fields) {
    const value = params?.[field];
    if (value === undefined || value === null || value === '') continue;
    out.push(String(value));
  }
  return out;
}

export const md = { parse_mode: 'Markdown' };
