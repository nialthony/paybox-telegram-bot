import { UsageError } from '../middleware/index.js';
import { requireWallet, requireCredentials } from './shared.js';
import { walletsOf, walletAddress } from '../paybox/client.js';
import { sanitizeText } from '../utils/validate.js';
import { renderChart } from '../utils/format.js';
import { logger } from '../logger.js';

/**
 * Prediction-market & perp read-only tools (World + Hyperliquid plugins).
 * The wire shapes are defensive: rendering tolerates whatever fields the
 * plugin returns (name/ticker/id/price…).
 */

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value?.events && Array.isArray(value.events)) return value.events;
  if (value?.markets && Array.isArray(value.markets)) return value.markets;
  if (value?.results && Array.isArray(value.results)) return value.results;
  if (value?.items && Array.isArray(value.items)) return value.items;
  return [];
}

export async function marketsCommand(ctx, args) {
  const query = sanitizeText(args.join(' '), 100);
  const progress = await ctx.reply('📈 Fetching prediction markets…');

  try {
    const raw = await ctx.paybox.worldMarkets({ events: true, limit: 12, ...(query ? { eventTicker: query } : {}) });
    const items = asArray(raw);

    if (items.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progress.message_id,
        undefined,
        query ? `📭 No markets found for "${query}".` : '📭 No markets available right now. Enable the World plugin in the Paybox app.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const lines = ['📈 **Prediction markets**', ''];
    const buttons = [];
    for (let i = 0; i < Math.min(items.length, 12); i++) {
      const m = items[i];
      const ticker = firstNonEmpty(m.ticker, m.event_ticker, m.eventTicker);
      const title = firstNonEmpty(m.title, m.name, m.question, ticker, `market ${i + 1}`);
      const price = firstNonEmpty(m.price, m.last_price, m.yes_price);
      lines.push(`${i + 1}. ${String(title).slice(0, 80)}${price !== null ? ` — ${Number(price).toFixed(3)}` : ''}`);
      if (ticker) buttons.push({ text: `${i + 1}`, callback_data: `mkt:detail:${String(ticker).slice(0, 40)}` });
    }
    lines.push('');
    lines.push('_Tap a number for detail. Read-only data from the World plugin._');

    const chunks = [];
    while (buttons.length) chunks.push(buttons.splice(0, 5));

    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: chunks },
    });
  } catch (error) {
    logger.error('markets error:', error.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      `❌ Markets unavailable: ${error.message}\n\nEnable the **World** plugin in the Paybox app (https://app.paybox.sh/plugins).`,
      { parse_mode: 'Markdown' }
    );
  }
}

export async function marketCommand(ctx, args) {
  const ticker = args[0];
  if (!ticker) throw new UsageError('❌ Usage: `/market <ticker>` — e.g. `/market fed-decision-sept`');
  const progress = await ctx.reply(`📊 Loading ${sanitizeText(ticker, 40)}…`);

  try {
    const raw = await ctx.paybox.worldMarket(ticker, true);
    const markets = asArray(raw);
    const event = raw && !Array.isArray(raw) ? raw.event ?? raw : null;
    const title = firstNonEmpty(event?.title, event?.name, raw?.title, ticker);

    const lines = [`📊 **${String(title).slice(0, 80)}**`, ''];
    for (const m of markets.slice(0, 10)) {
      const id = firstNonEmpty(m.id, m.market_id, m.ticker);
      const name = firstNonEmpty(m.name, m.question, m.title, id);
      const yes = firstNonEmpty(m.yes_price, m.yesPrice, m.price);
      const no = firstNonEmpty(m.no_price, m.noPrice);
      lines.push(
        `• ${String(name).slice(0, 60)}${yes !== null ? ` — yes ${Number(yes).toFixed(3)}` : ''}${no !== null ? ` / no ${Number(no).toFixed(3)}` : ''}`
      );
      if (id) lines.push(`  _id: \`${String(id).slice(0, 40)}\`_`);
    }

    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, `❌ ${error.message}`, {
      parse_mode: 'Markdown',
    });
  }
}

export async function orderbookCommand(ctx, args) {
  const id = args[0];
  if (!id) throw new UsageError('❌ Usage: `/orderbook <market_id>`');
  const progress = await ctx.reply('📖 Loading order book…');

  try {
    const raw = await ctx.paybox.worldOrderbook(id);
    const bids = asArray(raw?.bids);
    const asks = asArray(raw?.asks);

    const fmt = (row) => {
      const price = firstNonEmpty(row.price, row.p, row[0]);
      const size = firstNonEmpty(row.size, row.qty, row.s, row[1]);
      return `${Number(price).toFixed(3)} × ${Number(size).toFixed(2)}`;
    };

    const lines = ['📖 **Order book**', ''];
    lines.push('*Asks*');
    for (const a of asks.slice(0, 5).reverse()) lines.push(`• ${fmt(a)}`);
    lines.push('— spread —');
    lines.push('*Bids*');
    for (const b of bids.slice(0, 5)) lines.push(`• ${fmt(b)}`);
    lines.push('');
    lines.push('_Midpoint data via the World plugin._');

    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, `❌ ${error.message}`, {
      parse_mode: 'Markdown',
    });
  }
}

export async function priceCommand(ctx, args) {
  const ticker = args[0];
  if (!ticker) throw new UsageError('❌ Usage: `/price <ticker>` — e.g. `/price fed-decision-sept`');
  const progress = await ctx.reply(`📉 Loading price history for ${sanitizeText(ticker, 40)}…`);

  try {
    const now = Math.floor(Date.now() / 1000);
    const raw = await ctx.paybox.worldPrices({
      ticker,
      startTs: now - 7 * 24 * 3600,
      endTs: now,
      resolution: 3600,
    });

    const series = asArray(raw);
    const values = series
      .map((p) => Number(firstNonEmpty(p.price, p.close, p.p)))
      .filter((n) => Number.isFinite(n));

    if (values.length < 2) {
      await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, '📭 No price history for that ticker.', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const chart = renderChart(values, { label: ticker, width: 24 });
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, chart, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, `❌ ${error.message}`, {
      parse_mode: 'Markdown',
    });
  }
}

export async function positionsCommand(ctx) {
  const { credentials } = await requireCredentials(ctx);
  const wallet = walletsOf(credentials)[0];
  const address = wallet ? walletAddress(wallet) : null;
  if (!address) throw new UsageError('❌ No wallet address available — connect a wallet first.');

  const progress = await ctx.reply('🎯 Loading your positions…');

  try {
    const raw = await ctx.paybox.worldPositions(address);
    const positions = asArray(raw);

    if (positions.length === 0) {
      await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, '🎯 No open positions.', {
        parse_mode: 'Markdown',
      });
      return;
    }

    const lines = ['🎯 **Your positions**', ''];
    for (const p of positions.slice(0, 12)) {
      const name = firstNonEmpty(p.market, p.ticker, p.title, p.name, 'position');
      const side = firstNonEmpty(p.side, p.outcome, '');
      const size = firstNonEmpty(p.size, p.shares, p.amount);
      const value = firstNonEmpty(p.value, p.balanceUsd, p.usd);
      lines.push(
        `• ${String(name).slice(0, 50)}${side ? ` (${side})` : ''}${size !== null ? ` — ${Number(size).toFixed(2)}` : ''}${value !== null ? ` ≈ $${Number(value).toFixed(2)}` : ''}`
      );
    }

    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, `❌ ${error.message}`, {
      parse_mode: 'Markdown',
    });
  }
}

export async function perpCommand(ctx, args) {
  const name = args[0];
  const progress = await ctx.reply('📉 Loading Hyperliquid data…');

  try {
    if (name) {
      const raw = await ctx.paybox.hyperliquidToken(name);
      const display = JSON.stringify(raw, null, 2).slice(0, 3000);
      await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, `\`\`\`\n${display}\n\`\`\``, {
        parse_mode: 'Markdown',
      });
      return;
    }

    const raw = await ctx.paybox.hyperliquidMarkets();
    const items = asArray(raw);
    const lines = ['📉 **Hyperliquid markets**', ''];
    for (const m of items.slice(0, 15)) {
      const sym = firstNonEmpty(m.symbol, m.name, m.coin, m.base);
      const price = firstNonEmpty(m.price, m.markPrice, m.oraclePx);
      const change = firstNonEmpty(m.change, m.dayNtlVlm);
      lines.push(`• ${String(sym).slice(0, 20)}${price !== null ? ` — ${Number(price).toFixed(4)}` : ''}${change !== null && Number(change) ? ` (${Number(change).toFixed(2)}%)` : ''}`);
    }
    lines.push('');
    lines.push('_Read-only. Enable the Hyperliquid plugin in the Paybox app._');

    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, `❌ ${error.message}`, {
      parse_mode: 'Markdown',
    });
  }
}
