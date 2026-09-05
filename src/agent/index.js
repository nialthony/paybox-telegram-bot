import OpenAI from 'openai';
import { logger } from '../logger.js';
import { appendHistory } from '../store/sessions.js';
import { MONEY_INTENTS, requestConfirmation } from '../utils/confirm.js';

/**
 * Natural-language mode.
 *
 * Single-shot structured completion with short conversation memory (kept in
 * the user's session). The model returns an intent + params that map onto the
 * bot's real command functions — the same code path a slash command uses, so
 * nothing the model "decides" bypasses validation or approval flows.
 */

const SYSTEM_PROMPT = `You are the Paybox assistant inside a Telegram bot. Paybox is a non-custodial wallet for AI agents; every money operation is passkey-approved or runs inside the user's Paybox grant. You are helpful, terse, and you NEVER invent results — you only describe what the tools do.

You answer by returning ONE JSON object:
{
  "intent": "<intent>",
  "params": { ... },
  "reply": "<short friendly line shown before the tool runs>"
}

Available intents and their params:
- "chat"             — small talk or questions about the bot. params: {}
- "help"             — list of commands. params: {}
- "balance"          — portfolio overview. params: {}
- "account"          — credentials/grants overview. params: {}
- "history"          — recent requests. params: {}
- "transfer"         — send crypto on-chain. params: { "recipient": "@user or address", "amount": "number", "token": "ETH | BASE | SOL" }
- "swap"             — swap or bridge tokens. params: { "from": "symbol", "to": "symbol", "amount": "number" }
- "pay"              — pay a merchant with a one-time virtual card. params: { "merchant": "name", "url": "https://...", "usd": "amount" }
- "buy"              — fund a wallet with fiat. params: { "usd": "amount" }
- "sign"             — sign a message. params: { "message": "text" }
- "secret"           — reveal a secret credential. params: { "name": "credential name" }
- "services"         — browse paid x402 services. params: { "query": "optional search" }
- "use_service"      — pay & fetch an x402 resource. params: { "url": "https://..." }
- "markets"          — browse prediction markets. params: { "query": "optional" }
- "market"           — market detail. params: { "ticker": "ticker" }
- "orderbook"        — order book. params: { "id": "market id" }
- "price"            — price chart. params: { "ticker": "ticker" }
- "positions"        — user's market positions. params: {}
- "perp"             — Hyperliquid market data. params: {}

Rules:
- Token symbols: ETH (Ethereum), BASE (ETH on Base), SOL (Solana), USDC, USDT, WETH, USDC_BASE, USDC_SOL.
- Amounts are plain decimals, e.g. "0.05".
- Only choose an intent when the request clearly fits it. Otherwise reply in chat with a helpful pointer (e.g. mention /help).
- Money intents (transfer, swap, pay, use_service) are shown to the user for a one-tap confirmation before running — phrase replies accordingly ("I'll send it once you confirm").
- The reply field is ONE short sentence (max ~25 words), never a JSON blob.`;

export class PayboxAgent {
  constructor(config, loggerRef = logger) {
    this.config = config;
    this.logger = loggerRef;
    this.openai = null;
    if (config.hasAgent) {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey,
        baseURL: config.openaiBaseUrl || undefined,
      });
    }
  }

  get enabled() {
    return Boolean(this.openai);
  }

  async process(userText, history = []) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.openaiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.slice(-6),
          { role: 'user', content: userText },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 400,
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new Error('empty model response');
      const parsed = JSON.parse(content);

      return {
        intent: parsed.intent || 'chat',
        params: parsed.params || {},
        reply: typeof parsed.reply === 'string' ? parsed.reply : '',
      };
    } catch (error) {
      this.logger.error('agent error:', error.message);
      return {
        intent: 'chat',
        params: {},
        reply: "I'm having trouble thinking right now — try a direct command like /help.",
      };
    }
  }
}

/** Run an intent through the registered command dispatcher. */
export async function executeIntent(dispatcher, ctx, result) {
  const { intent, params, reply } = result;
  const run = dispatcher[intent];
  if (!run) {
    await ctx.reply(reply || 'I could not map that to a command. Try /help.');
    return;
  }

  const args = paramsToArgs(intent, params);
  if (reply) {
    // Fire-and-forget the preamble so the tool's own progress message follows.
    ctx.reply(`🧠 ${reply}`).catch(() => {});
  }

  // Confirm-before-send: natural-language money moves need a one-tap ✅
  // before anything runs. Nothing the model decides bypasses this.
  if (MONEY_INTENTS.has(intent)) {
    const approved = await requestConfirmation({
      ctx,
      intent,
      args,
      timeoutMs: ctx.config?.agentConfirmTimeoutMs,
    });
    if (!approved) return;
  }

  await run(ctx, args);
}

function paramsToArgs(intent, params) {
  const pick = (...fields) =>
    fields.map((f) => (params?.[f] !== undefined && params?.[f] !== null ? String(params[f]) : undefined)).filter((v) => v !== undefined);

  switch (intent) {
    case 'transfer':
      return pick('recipient', 'amount', 'token');
    case 'swap':
      return pick('from', 'to', 'amount', 'recipient');
    case 'pay':
      return pick('merchant', 'url', 'usd');
    case 'buy':
      return pick('usd');
    case 'sign':
      return pick('message');
    case 'secret':
      return pick('name');
    case 'services':
    case 'markets':
      return pick('query');
    case 'market':
      return pick('ticker');
    case 'orderbook':
      return pick('id');
    case 'price':
      return pick('ticker');
    case 'use_service':
      return pick('url');
    default:
      return [];
  }
}

/** Text-message entry point used by the bot. */
export async function handleNaturalLanguage(ctx) {
  if (!ctx.agent?.enabled) {
    await ctx.reply(
      '👋 I’m a Paybox bot! Natural-language mode is off — set `OPENAI_API_KEY` to enable it. Meanwhile, use /help.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const text = ctx.message.text;
  await ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => {});

  const history = ctx.session?.agentHistory ?? [];
  const result = await ctx.agent.process(text, history);

  appendHistory(ctx.session, 'user', text);
  appendHistory(ctx.session, 'assistant', result.reply || `(ran ${result.intent})`);

  await executeIntent(ctx.dispatcher, ctx, result);
}
