import { credsFromToken } from '@paybox-sh/sdk';
import nacl from 'tweetnacl';
import { Buffer } from 'node:buffer';
import {
  createPublicClient,
  http,
  hashMessage,
  hashTypedData,
  keccak256,
  serializeTransaction,
  serializeSignature,
  getAddress,
} from 'viem';
import { mainnet, base } from 'viem/chains';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { rawRequest } from './client.js';
import { CHAINS } from '../utils/tokens.js';

/**
 * Headless in-process wallet signing.
 *
 * The SDK signs in-process only when a request clears immediately
 * (`pending_signature` on the first response). When a wallet has
 * `always_approve`, the request parks at `pending_approval`; after the user
 * approves with their passkey the request flips to `pending_signature` and the
 * client must finish it. This module re-implements that finishing step with
 * the same protocol the SDK uses internally:
 *
 *   1. POST /agent/requests/{id}/binding   -> { wallet_id, key_id, derivation_path }
 *   2. POST /agent/requests/{id}/moonx-sign -> MPC signature of the digest
 *   3. POST /agent/requests/{id}/signature -> submit the assembled artifact
 *
 * The MoonX secret never leaves the server; the `pbxk1.` signing key is only
 * used locally (Ed25519) to authenticate the envelopes with the agent key.
 */

// ---------------------------------------------------------------- helpers

const bytesToHex = (bytes) => Buffer.from(bytes).toString('hex');
const hexToBytes = (hex) => new Uint8Array(Buffer.from(String(hex).replace(/^0x/, ''), 'hex'));
const toBig = (v) => BigInt(v);

function buildEnvelope(rawSigningPayloadHex, binding, creds) {
  const signedPayload = {
    raw_signing_payload: String(rawSigningPayloadHex).replace(/^0x/, '').toLowerCase(),
    key_id: binding.keyId,
    derivation_path: binding.derivationPath,
    issued_at: new Date().toISOString(),
  };
  const signedBodyBytes = new TextEncoder().encode(JSON.stringify(signedPayload));
  const keyPair = nacl.sign.keyPair.fromSeed(hexToBytes(creds.apiPrivHex));
  const agentSignature = nacl.sign.detached(signedBodyBytes, keyPair.secretKey);
  return {
    signed_body: bytesToHex(signedBodyBytes),
    agent_signature: bytesToHex(agentSignature),
  };
}

function buildIssuedAtEnvelope(creds) {
  const signedBodyBytes = new TextEncoder().encode(
    JSON.stringify({ issued_at: new Date().toISOString() })
  );
  const keyPair = nacl.sign.keyPair.fromSeed(hexToBytes(creds.apiPrivHex));
  const agentSignature = nacl.sign.detached(signedBodyBytes, keyPair.secretKey);
  return {
    signed_body: bytesToHex(signedBodyBytes),
    agent_signature: bytesToHex(agentSignature),
  };
}

function solanaSigningPayload(base64Tx) {
  const raw = Buffer.from(base64Tx, 'base64');
  let i = 0;
  let sigCount = 0;
  let shift = 0;
  for (;;) {
    const b = raw[i++];
    sigCount |= (b & 127) << shift;
    if ((b & 128) === 0) break;
    shift += 7;
  }
  if (sigCount < 1) throw new Error('Solana transaction has no signature slots.');
  return bytesToHex(new Uint8Array(raw.subarray(i + sigCount * 64)));
}

// ---------------------------------------------------------------- signing flow

async function resolveBinding(client, requestId, creds) {
  const env = buildIssuedAtEnvelope(creds);
  const raw = await rawRequest(client, 'POST', `/agent/requests/${requestId}/binding`, {
    body: { api_pub: creds.apiPubHex, signed_body: env.signed_body, agent_signature: env.agent_signature },
  });
  return {
    walletId: raw.wallet_id,
    keyId: raw.key_id ?? '',
    derivationPath: raw.derivation_path ?? '',
  };
}

async function signWithMoonX(client, requestId, digestHex, binding, creds) {
  const envelope = buildEnvelope(digestHex, binding, creds);
  return rawRequest(client, 'POST', `/agent/requests/${requestId}/moonx-sign`, {
    body: { api_pub: creds.apiPubHex, ...envelope },
  });
}

function reviveEvmTx(w) {
  return {
    type: 'eip1559',
    to: w.to,
    value: toBig(w.value ?? 0),
    data: w.data ?? '0x',
    chainId: Number(w.chainId),
    gas: toBig(w.gas ?? 0),
    maxPriorityFeePerGas: toBig(w.maxPriorityFeePerGas ?? 0),
    maxFeePerGas: toBig(w.maxFeePerGas ?? 0),
    nonce: Number(w.nonce ?? 0),
  };
}

function ecdsaFrom(result) {
  const { r, s, recovery_id } = result.signature ?? {};
  if (r == null || s == null || recovery_id == null) {
    throw new Error('Signing service returned an ECDSA result without {r, s, recovery_id}.');
  }
  return { r: `0x${r}`, s: `0x${s}`, yParity: recovery_id };
}

/** Compute the raw signing payload (digest) for an intent. */
function intentDigest(intent) {
  switch (intent.op) {
    case 'message':
      return hashMessage(intent.message);
    case 'typedData':
      return hashTypedData(intent.typedData);
    case 'transaction':
      return keccak256(serializeTransaction(reviveEvmTx(intent.transaction)));
    case 'solanaMessage':
      return bytesToHex(new TextEncoder().encode(intent.message));
    case 'solanaTransaction':
      return solanaSigningPayload(intent.transactionBase64);
    case 'raw':
      return intent.rawSigningPayloadHex;
    default:
      throw new Error(`Unsupported sign intent op for headless completion: ${intent.op}`);
  }
}

/** Assemble the final artifact from the intent + MPC signature. */
function assembleArtifact(intent, result) {
  switch (intent.op) {
    case 'message':
    case 'typedData':
    case 'raw':
      return { signature: serializeSignature(ecdsaFrom(result)) };
    case 'transaction': {
      const tx = reviveEvmTx(intent.transaction);
      return { serializedTransaction: serializeTransaction(tx, ecdsaFrom(result)) };
    }
    case 'solanaMessage': {
      const sig = result.signature?.signature;
      if (!sig) throw new Error('Signing service returned an Ed25519 result without a signature.');
      return { signature: sig };
    }
    case 'solanaTransaction': {
      const sig = result.signature?.signature;
      if (!sig) throw new Error('Signing service returned an Ed25519 result without a signature.');
      const tx = Transaction.from(Buffer.from(intent.transactionBase64, 'base64'));
      tx.addSignature(new PublicKey(intent.address), hexToBytes(sig));
      return { signedTransactionBase64: tx.serialize().toString('base64') };
    }
    default:
      throw new Error(`Unsupported sign intent op for headless completion: ${intent.op}`);
  }
}

/**
 * Finish a `pending_signature` wallet-sign request in-process and return the
 * assembled artifact (e.g. { signature } or { serializedTransaction }).
 */
export async function completeWalletSign(client, requestId, intent, signingKey) {
  const creds = credsFromToken(signingKey);
  const binding = await resolveBinding(client, requestId, creds);
  const digest = intentDigest(intent);
  const result = await signWithMoonX(client, requestId, digest, binding, creds);
  const artifact = assembleArtifact(intent, result);
  await rawRequest(client, 'POST', `/agent/requests/${requestId}/signature`, { body: { artifact } });
  return artifact;
}

// ---------------------------------------------------------------- transfer builders

function evmChainConfig(chainId) {
  return chainId === CHAINS.ethereum.id ? mainnet : base;
}

export function evmPublicClient(chainId, rpcUrl) {
  return createPublicClient({
    chain: evmChainConfig(chainId),
    transport: http(rpcUrl),
  });
}

/**
 * Build a wallet-sign `transaction` intent for a native EVM transfer.
 * Returns { intent, publicClient }.
 */
export async function buildEvmTransferIntent({ chainId, rpcUrl, from, to, amountWei }) {
  const publicClient = evmPublicClient(chainId, rpcUrl);
  const request = await publicClient.prepareTransactionRequest({
    account: getAddress(from),
    to: getAddress(to),
    value: BigInt(amountWei),
  });

  const wire = {
    type: 'eip1559',
    to,
    value: `0x${BigInt(request.value ?? 0).toString(16)}`,
    data: request.data ?? '0x',
    chainId: Number(request.chainId),
    gas: `0x${BigInt(request.gas ?? 0).toString(16)}`,
    maxFeePerGas: `0x${BigInt(request.maxFeePerGas ?? 0).toString(16)}`,
    maxPriorityFeePerGas: `0x${BigInt(request.maxPriorityFeePerGas ?? 0).toString(16)}`,
    nonce: Number(request.nonce ?? 0),
  };

  return {
    intent: { op: 'transaction', transaction: wire },
    publicClient,
  };
}

/** Broadcast a signed EVM transaction and return the tx hash. */
export async function broadcastEvmTransaction(publicClient, serializedTransaction) {
  return publicClient.sendRawTransaction({ serializedTransaction });
}

/** Build a wallet-sign `solanaTransaction` intent for a native SOL transfer. */
export async function buildSolanaTransferIntent({ rpcUrl, from, to, lamports }) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: new PublicKey(from),
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(from),
      toPubkey: new PublicKey(to),
      lamports,
    })
  );

  return {
    intent: {
      op: 'solanaTransaction',
      address: from,
      transactionBase64: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    },
    connection,
    lastValidBlockHeight,
  };
}

/** Broadcast a signed Solana transaction and return the signature. */
export async function broadcastSolanaTransaction(connection, signedTransactionBase64) {
  const raw = connection.sendRawTransaction(Buffer.from(signedTransactionBase64, 'base64'), {
    skipPreflight: false,
    maxRetries: 3,
  });
  return raw;
}
