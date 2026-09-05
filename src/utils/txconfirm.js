import { createPublicClient, http } from 'viem';
import { mainnet, base } from 'viem/chains';
import { Connection } from '@solana/web3.js';
import { explorerTxUrl } from './tokens.js';
import { shortAddress } from './format.js';
import { logger } from '../logger.js';

/**
 * On-chain transaction confirmation watcher.
 *
 * "Broadcast" is not "done": a transaction can be dropped or revert. This
 * module watches a broadcast transaction to on-chain finality, live-editing
 * the Telegram status message through the stages
 *
 *   📡 broadcast → ✅ included (block, n/F confirmations) → 🔒 final
 *                  ↘ ❌ reverted / failed
 *
 * with an explorer link the whole way. Watchers are tracked so shutdown can
 * cancel them; anything still unconfirmed at the timeout is left with a link
 * (it may still land — check the explorer).
 */

const FINALITY_CONFIRMATIONS = 12;
const POLL_MS = 4_000;

const activeWatchers = new Set();

export function stopAllTxWatchers() {
  for (const token of activeWatchers) {
    token.cancelled = true;
    if (token.wake) token.wake();
  }
  activeWatchers.clear();
}

export function txWatcherCount() {
  return activeWatchers.size;
}

function evmChainOf(chain) {
  return chain.key === 'ethereum' ? mainnet : base;
}

/**
 * Render the status message for a stage (pure — unit tested).
 * stages: broadcast | included | final | reverted | failed | timeout
 */
export function renderTxStatus({ stage, chain, txId, blockNumber = null, confirmations = 0, error = null }) {
  const link = `[\`${shortAddress(txId, 10, 8)}\`](${explorerTxUrl(chain, txId)})`;
  const head = `Tx: ${link}`;

  switch (stage) {
    case 'broadcast':
      return `📡 **Broadcast to ${chain.label}**\n\n${head}\n\n_Waiting for inclusion in a block…_`;
    case 'included':
      return (
        `✅ **Included on ${chain.label}**\n\n${head}\n` +
        `Block: ${blockNumber} · ${confirmations}/${FINALITY_CONFIRMATIONS} confirmations\n\n` +
        `_Watching until finality…_`
      );
    case 'final':
      return (
        `🔒 **Final on ${chain.label}**\n\n${head}\n` +
        `Block: ${blockNumber} · ${confirmations} confirmations\n\nDone — this transaction is final on-chain.`
      );
    case 'reverted':
      return (
        `❌ **Reverted on ${chain.label}**\n\n${head}\n\n` +
        `The transaction was included but the contract execution failed — the amount was *not* moved (gas was spent). ` +
        `Check the transaction on the explorer for the revert reason.`
      );
    case 'failed':
      return `❌ **Failed on ${chain.label}**\n\n${head}${error ? `\n${error}` : ''}`;
    case 'timeout':
      return (
        `⏱️ **Still confirming**\n\n${head}\n\n` +
        `I stopped watching after the timeout, but the transaction may still land — check the explorer link.`
      );
    default:
      return `${head}`;
  }
}

/**
 * Watch a transaction to finality, editing `messageId` in `chatId`.
 * Returns the terminal stage ('final' | 'reverted' | 'failed' | 'timeout').
 *
 * `probe` is injectable for tests; the default talks to the chain over RPC:
 *   probe.status() → { stage: 'pending'|'included'|'final'|'reverted'|'failed', blockNumber, confirmations, error }
 */
export async function watchTransaction({
  telegram,
  chatId,
  messageId,
  chain,
  txId,
  rpcUrl,
  intervalMs = POLL_MS,
  timeoutMs = 10 * 60 * 1000,
  probe = null,
  onFinal = null,
}) {
  const token = { cancelled: false, wake: null };
  activeWatchers.add(token);
  const sleep = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      token.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  const deadline = Date.now() + timeoutMs;
  let lastText = '';
  let stage = 'broadcast';

  const probeImpl =
    probe ??
    (chain.family === 'evm'
      ? evmProbe(chain, rpcUrl, txId)
      : solanaProbe(rpcUrl, txId));

  const edit = (text) => {
    if (text === lastText) return;
    lastText = text;
    telegram.editMessageText(chatId, messageId, undefined, text, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    }).catch(() => {});
  };

  try {
    edit(renderTxStatus({ stage, chain, txId }));
    let blockNumber = null;

    for (;;) {
      if (token.cancelled) {
        activeWatchers.delete(token);
        return stage;
      }
      if (Date.now() > deadline) {
        edit(renderTxStatus({ stage: 'timeout', chain, txId, blockNumber }));
        activeWatchers.delete(token);
        return 'timeout';
      }

      let status;
      try {
        status = await probeImpl.status();
      } catch (error) {
        logger.debug(`txwatch probe error for ${txId}: ${error.message}`);
        status = { stage: 'pending' };
      }

      if (status.stage === 'included' || status.stage === 'final') {
        blockNumber = status.blockNumber ?? blockNumber;
        stage = status.stage;
        edit(
          renderTxStatus({
            stage,
            chain,
            txId,
            blockNumber,
            confirmations: status.confirmations ?? 0,
          })
        );
        if (stage === 'final') {
          activeWatchers.delete(token);
          if (onFinal) await onFinal('final');
          return 'final';
        }
      } else if (status.stage === 'reverted' || status.stage === 'failed') {
        stage = status.stage;
        edit(renderTxStatus({ stage, chain, txId, blockNumber, error: status.error }));
        activeWatchers.delete(token);
        if (onFinal) await onFinal(stage);
        return stage;
      }
      // 'pending' — keep waiting.

      await sleep(intervalMs);
    }
  } catch (error) {
    logger.error(`txwatch crashed for ${txId}: ${error.message}`);
    activeWatchers.delete(token);
    return 'failed';
  }
}

function evmProbe(chain, rpcUrl, txId) {
  const client = createPublicClient({ chain: evmChainOf(chain), transport: http(rpcUrl) });
  let seenReceipt = false;
  let receiptBlock = null;
  return {
    async status() {
      if (!seenReceipt) {
        const receipt = await client.getTransactionReceipt({ hash: txId }).catch(() => null);
        if (!receipt) return { stage: 'pending' };
        seenReceipt = true;
        receiptBlock = receipt.blockNumber;
        if (receipt.status === 'reverted') return { stage: 'reverted', blockNumber: receipt.blockNumber };
        // Included — count confirmations from the tip.
        const tip = await client.getBlockNumber().catch(() => receipt.blockNumber);
        const confirmations = Number(tip - receipt.blockNumber) + 1;
        return { stage: 'included', blockNumber: Number(receipt.blockNumber), confirmations };
      }
      const tip = await client.getBlockNumber().catch(() => receiptBlock);
      const confirmations = Number(tip - receiptBlock) + 1;
      return confirmations >= FINALITY_CONFIRMATIONS
        ? { stage: 'final', blockNumber: Number(receiptBlock), confirmations }
        : { stage: 'included', blockNumber: Number(receiptBlock), confirmations };
    },
  };
}

function solanaProbe(rpcUrl, txId) {
  const connection = new Connection(rpcUrl, 'confirmed');
  return {
    async status() {
      const result = await connection.getSignatureStatuses([txId], { searchTransactionHistory: true });
      const status = result?.value?.[0];
      if (!status) return { stage: 'pending' };
      if (status.err) return { stage: 'failed', error: JSON.stringify(status.err).slice(0, 200) };
      if (status.confirmation_status === 'finalized') {
        return { stage: 'final', blockNumber: status.slot, confirmations: FINALITY_CONFIRMATIONS };
      }
      // 'confirmed' (or 'processed') — Solana calls 1 confirmed + 31 more for finalized;
      // report a simple monotone count so the message keeps moving toward final.
      return { stage: 'included', blockNumber: status.slot, confirmations: 1 };
    },
  };
}
