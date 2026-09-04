import { PayboxClient, PayboxError } from '@paybox-sh/sdk';
import { logger } from '../logger.js';

/**
 * Paybox integration layer.
 *
 * Wraps `@paybox-sh/sdk` (v0.8.x) and adds:
 *  - credential-list normalization (the wire shape changed across SDK
 *    generations, so both shapes are handled defensively),
 *  - friendly error mapping (401s, denied vs error, missing grants),
 *  - a small REST passthrough for tools the SDK does not expose yet
 *    (list_requests), using the SDK's own authenticated request method.
 */

export function createPaybox(config) {
  if (!config.hasPaybox) return null;

  const client = PayboxClient.fromConfig({
    baseUrl: config.payboxApiUrl,
    apiKey: config.payboxApiKey,
    signingKey: config.payboxSigningKey || undefined,
  });

  return client;
}

/**
 * Normalize the `list_credentials` response across wire generations.
 *
 * Current shape (v0.8-era server):
 *   { credentials: [{ credential_id, name, kind, metadata, approval_mode }],
 *     ungranted_summary: { wallet: { evm, solana }, card, secret } }
 * Legacy SDK-shape:
 *   { credentials: [{ credential: {...}, grant: {...} }], ungranted: [...] }
 */
export function normalizeCredentialList(raw) {
  const list = Array.isArray(raw?.credentials) ? raw.credentials : [];
  const credentials = list
    .map((entry) => {
      if (!entry) return null;
      // Legacy nested shape
      if (entry.credential && entry.grant) {
        return {
          id: entry.credential.id,
          kind: entry.credential.credential_type,
          name: entry.credential.name,
          provider: entry.credential.provider,
          metadata: entry.credential.metadata || {},
          approvalMode: entry.grant.approval_mode,
        };
      }
      // Current flat shape
      return {
        id: entry.credential_id,
        kind: entry.kind,
        name: entry.name,
        provider: entry.provider,
        metadata: entry.metadata || {},
        approvalMode: entry.approval_mode,
      };
    })
    .filter(Boolean);

  return {
    credentials,
    ungranted: raw?.ungranted_summary ?? raw?.ungranted ?? null,
  };
}

export function walletsOf(credentials) {
  return credentials.filter((c) => c.kind === 'wallet');
}

export function cardsOf(credentials) {
  return credentials.filter((c) => c.kind === 'card');
}

export function secretsOf(credentials) {
  return credentials.filter((c) => c.kind === 'secret');
}

export function findCredential(credentials, ref) {
  return (
    credentials.find((c) => c.id === ref) ||
    credentials.find((c) => c.name?.toLowerCase() === String(ref).toLowerCase()) ||
    null
  );
}

/** Extract a usable wallet address from credential metadata. */
export function walletAddress(credential) {
  return (
    credential?.metadata?.address ||
    credential?.metadata?.wallet_address ||
    credential?.metadata?.owner ||
    null
  );
}

/** The chain family an EVM/Solana wallet credential supports. */
export function walletFamily(credential) {
  const chains = credential?.metadata?.chains;
  if (Array.isArray(chains)) {
    if (chains.includes('solana')) return 'solana';
    if (chains.includes('evm')) return 'evm';
  }
  if (credential?.metadata?.provider === 'solana') return 'solana';
  return 'evm';
}

/**
 * Map an operation failure into a compact, actionable Telegram message.
 * Returns null when nothing extra is worth telling the user.
 */
export function explainFailure(error, { includeAccountChange = false } = {}) {
  if (error instanceof PayboxError) {
    if (error.status === 401 || error.status === 403) {
      return (
        '🔒 **Paybox authorization problem**\n\n' +
        'The Paybox token this bot holds is missing, expired or was revoked. ' +
        'Re-issue an Auth Token in the Paybox app and put it in `PAYBOX_API_KEY`, then restart the bot.\n\n' +
        (includeAccountChange ? 'Or use /manage to open the Paybox access page.' : '')
      );
    }
    if (error.status === 404) {
      return '❓ Paybox could not find that resource. It may have expired or been removed.';
    }
    if (error.status >= 500) {
      return '⛈️ Paybox is having trouble right now (server error). Please retry in a moment.';
    }
    return `⚠️ Paybox rejected the call (HTTP ${error.status}).`;
  }
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.cause?.code === 'ENOTFOUND') {
    return '🌐 Could not reach the network RPC. Try again in a moment.';
  }
  return null;
}

/** Human label for a request envelope status. */
export function statusLabel(status) {
  return (
    {
      pending_approval: '🟡 waiting for your approval',
      pending_signature: '✍️ waiting to be signed',
      pending_settlement: '🌉 bridging (settling on destination chain)',
      pending_confirmation: '⛓️ broadcast, confirming on-chain',
      success: '✅ done',
      denied: '❌ denied',
      error: '💥 failed',
    }[status] || `unknown (${status})`
  );
}

export function isPending(status) {
  return (
    status === 'pending_approval' ||
    status === 'pending_signature' ||
    status === 'pending_settlement' ||
    status === 'pending_confirmation'
  );
}

/** Get the artifact out of a request's output, tolerating wire variants. */
export function requestArtifact(request) {
  const output = request?.output;
  if (!output) return null;
  return output.value ?? output.output ?? output;
}

/**
 * REST passthrough on the SDK's authenticated request method.
 * `request()` is typed private in the SDK but is a plain method at runtime;
 * it is used here only for endpoints the SDK does not wrap yet (list_requests).
 */
export function rawRequest(client, method, path, init = {}) {
  if (!client || typeof client.request !== 'function') {
    throw new Error('Paybox client does not expose request(); upgrade @paybox-sh/sdk.');
  }
  return client.request(method, path, init);
}

/** List this client's recent requests (the `list_requests` tool over REST). */
export async function listRequests(client, { status, limit = 20, before, beforeId } = {}) {
  const query = {};
  if (status) query.status = status;
  if (limit) query.limit = limit;
  if (before) query.before = before;
  if (beforeId) query.before_id = beforeId;
  const raw = await rawRequest(client, 'GET', '/agent/requests', { query });
  return raw;
}

/** Lazy-load the Paybox client once and cache it (module-level singleton). */
let cachedClient = null;
export function getClient(config) {
  if (!cachedClient) {
    cachedClient = createPaybox(config);
    if (cachedClient) {
      logger.info(`Paybox client ready → ${config.payboxApiUrl} (signing: ${config.canSign ? 'in-process' : 'off'})`);
    }
  }
  return cachedClient;
}

export { PayboxError };
