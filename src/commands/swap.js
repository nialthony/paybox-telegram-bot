import { UsageError } from '../middleware/index.js';
import { requireWallet } from './shared.js';
import { resolveToken, toSmallestUnit, explorerTxUrl } from '../utils/tokens.js';
import { parseAmount } from '../utils/validate.js';
import { shortAddress } from '../utils/format.js';
import { logger } from '../logger.js';

/**
 * /swap <fromToken> <toToken> <amount> [recipient]
 *
 * Uses Paybox `request_swap`: Paybox quotes the route via MoonX, builds the
 * transactions, signs them (in-process with the signing key) and broadcasts.
 * Cross-chain pairs bridge automatically (`pending_settlement` while the
 * bridge delivers).
 *
 * Tokens are symbols from the catalog: ETH, WETH, USDC, USDT, BASE, USDC_BASE,
 * SOL, USDC_SOL — or raw contract/mint addresses.
 */
export async function swapCommand(ctx, args) {
  if (args.length < 3) {
    throw new UsageError(
      '❌ **Usage**\n\n' +
        '`/swap <from> <to> <amount> [recipient]`\n\n' +
        '**Examples**\n' +
        '• `/swap ETH USDC 0.5`\n' +
        '• `/swap USDC_BASE BASE 100`\n' +
        '• `/swap SOL USDC_SOL 2`\n' +
        '• `/swap ETH SOL 0.1` (bridges to Solana)\n\n' +
        'Symbols: ETH, WETH, USDC, USDT (Ethereum) · BASE, USDC_BASE (Base) · SOL, USDC_SOL (Solana).'
    );
  }

  const [fromInput, toInput, amountInput, recipientInput] = args;

  const amount = parseAmount(amountInput, { maxDecimals: 9, min: 1e-9 });
  if (amount === null) {
    throw new UsageError(`❌ Invalid amount: "${amountInput}".`);
  }

  const from = resolveToken(fromInput);
  const to = resolveToken(toInput);
  if (!from) throw new UsageError(`❌ Unknown token: "${fromInput}". See /help for the list.`);
  if (!to) throw new UsageError(`❌ Unknown token: "${toInput}". See /help for the list.`);

  const wallet = await requireWallet(ctx, { family: from.chain.family });

  if (!ctx.canSign) {
    throw new UsageError(
      '❌ **Signing key required** — swaps need the `pbxk1.` signing key. Set `PAYBOX_SIGNING_KEY` and restart the bot.'
    );
  }

  let recipient;
  if (recipientInput) {
    const entry = recipientInput.startsWith('@') ? ctx.registry?.byHandle(recipientInput) : null;
    recipient = entry ? entry.address : recipientInput;
  }

  const statusMsg = await ctx.reply(
    `🔁 **Requesting swap**\n\n` +
      `${amount} ${from.token.label || from.token.symbol} → ${to.token.label || to.token.symbol}\n` +
      `_Getting a quote from MoonX…_`,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  );
  const edit = (text, extra) =>
    ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text, extra).catch(() => {});

  try {
    // The SDK waits for a passkey approval when needed, then signs in-process.
    const result = await ctx.paybox.requestSwap(
      {
        credentialId: wallet.id,
        srcChain: from.chain.id,
        dstChain: to.chain.id,
        srcToken: from.token.address,
        dstToken: to.token.address,
        amount: toSmallestUnit(amount, from.token),
        swapDirection: 'exact-amount-in',
        slippageBps: 50,
        recipient,
      },
      { waitForApproval: { timeoutMs: ctx.config.requestTimeoutMs, intervalMs: ctx.config.pollIntervalMs } }
    );

    const response = result.response;
    if (response.status === 'success') {
      const output = response.output?.value ?? response.output ?? {};
      const txHash = output.transaction_hash || output.tx_hash || output.txHash || null;
      const dstHash = output.dst_tx_hash || null;

      const lines = ['✅ **Swap complete**', ''];
      lines.push(`${amount} ${from.token.symbol} → ${to.token.symbol}${to.token.label ? ` (${to.token.label})` : ''}`);
      if (result.plan?.quote?.expected_out) {
        lines.push(`Expected out: ${result.plan.quote.expected_out}`);
      }
      if (txHash) lines.push(`Source tx: [${shortAddress(txHash, 10, 8)}](${explorerTxUrl(from.chain, txHash)})`);
      if (dstHash) lines.push(`Destination tx: [${shortAddress(dstHash, 10, 8)}](${explorerTxUrl(to.chain, dstHash)})`);

      await edit(lines.join('\n'), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      ctx.stats?.hit('swap_completed');
      return;
    }

    if (response.status === 'denied') {
      await edit(`❌ **Swap denied** — ${response.reason || 'rejected in Paybox.'}`, { parse_mode: 'Markdown' });
      return;
    }

    if (response.status === 'error') {
      await edit(`❌ **Swap failed** — ${response.error || response.error_message || 'unknown error'}`, { parse_mode: 'Markdown' });
      return;
    }

    // Still pending (settlement/confirmation/approval timeout) — keep watching.
    await edit(
      `⏳ Swap ${response.status.replaceAll('_', ' ')}… I’ll keep an eye on it. Check /history in a minute.`,
      { parse_mode: 'Markdown' }
    );

    watchSwap(ctx, response.request_id, from.chain, to.chain);
  } catch (error) {
    logger.error('swap error:', error.message);
    await edit(`❌ **Swap failed** — ${error.message}`, { parse_mode: 'Markdown' });
  }
}

/** Background watch for swaps still settling when the approval window ends. */
async function watchSwap(ctx, requestId, srcChain, dstChain) {
  const deadline = Date.now() + 15 * 60 * 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    await sleep(10_000);
    try {
      const request = await ctx.paybox.getRequest(requestId);
      if (['pending_approval', 'pending_signature', 'pending_settlement', 'pending_confirmation'].includes(request.status)) {
        continue;
      }
      if (request.status === 'success') {
        const output = request.output?.value ?? request.output ?? {};
        const txHash = output.transaction_hash || output.tx_hash || output.txHash || null;
        const dstHash = output.dst_tx_hash || null;
        const lines = ['✅ **Swap settled**', ''];
        if (txHash) lines.push(`Source tx: [${shortAddress(txHash, 10, 8)}](${explorerTxUrl(srcChain, txHash)})`);
        if (dstHash) lines.push(`Destination tx: [${shortAddress(dstHash, 10, 8)}](${explorerTxUrl(dstChain, dstHash)})`);
        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
      } else {
        await ctx.reply(`❌ Swap ${request.status}: ${request.reason || request.error || ''}`.trim(), { parse_mode: 'Markdown' });
      }
      return;
    } catch {
      /* transient */
    }
  }
}
