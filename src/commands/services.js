import { UsageError } from '../middleware/index.js';
import { requireWallet } from './shared.js';
import { sanitizeText, isUrl, truncateUtf8 } from '../utils/validate.js';
import { escapeMd } from '../utils/format.js';
import { logger } from '../logger.js';

/**
 * /services [query]       — discover curated x402 paid services
 * /use_service <url> [method] [json-body] — pay + fetch via Paybox gateway
 *
 * Security (v2.1.1): service names / descriptions are escaped for Markdown.
 */
export async function servicesCommand(ctx, args) {
  const query = sanitizeText(args.join(' '), 200);
  const progress = await ctx.reply(query ? `🔍 Searching x402 services for "${query}"…` : '🔍 Loading curated x402 services…');

  let services;
  try {
    services = await ctx.paybox.discoverServices(query || undefined);
  } catch (error) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      `❌ Service discovery failed: ${error.message}\n\n(Paid services may be disabled on this Paybox deployment.)`
    );
    return;
  }

  if (!Array.isArray(services) || services.length === 0) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      query
        ? `📭 No x402 services found for "${query}". Try a broader query, or /services without arguments for the curated list.`
        : '📭 No x402 services are available right now.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Store in session so callbacks can resolve which service to use.
  ctx.session.ui.serviceList = services.slice(0, 10);

  const lines = ['🛍 **Paid services (x402)**', ''];
  const buttons = [];
  for (let i = 0; i < Math.min(services.length, 10); i++) {
    const service = services[i];
    const name = escapeMd(service.name || service.resource || service.url || `service ${i + 1}`);
    const price = escapeMd(service.price_hint || service.price || '');
    const description = escapeMd((service.description || '').replace(/\s+/g, ' ').slice(0, 90));
    lines.push(`${i + 1}. **${name}**${price ? ` — ${price}` : ''}`);
    if (description) lines.push(`   _${description}_`);
    buttons.push({ text: `${i + 1}`, callback_data: `svc:use:${i}` });
  }

  lines.push('');
  lines.push('_Tap a number to pay & fetch it (needs a wallet grant + signing key)._');

  const chunks = [];
  while (buttons.length) chunks.push(buttons.splice(0, 5));

  await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: chunks },
  });
}

/**
 * /use_service <url> [method] [json-body]
 * Gateway mode: Paybox probes the 402, opens the signing window, re-fetches
 * with the payment header, and stores the response in the request output.
 */
export async function useServiceCommand(ctx, args) {
  if (args.length === 0) {
    throw new UsageError(
      '❌ **Usage**\n\n`/use_service <url> [method] [json-body]`\n\n' +
        '**Example**\n• `/use_service https://weather.example/api/tokyo`\n' +
        '• `/use_service https://api.example/order POST {"sku":"x1"}`\n\n' +
        'Paybox pays for the resource and returns its response.'
    );
  }

  const [url, methodArg, ...bodyParts] = args;
  if (!isUrl(url)) throw new UsageError('❌ `<url>` must be a valid http(s) URL.');

  let method = 'GET';
  let body;
  if (methodArg && /^(GET|POST|PUT|PATCH|DELETE)$/i.test(methodArg)) {
    method = methodArg.toUpperCase();
    const bodyText = bodyParts.join(' ');
    if (bodyText) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        throw new UsageError('❌ The request body must be valid JSON.');
      }
    }
  }

  const wallet = await requireWallet(ctx);

  if (!ctx.canSign) {
    throw new UsageError(
      '❌ **Signing key required** — paying x402 resources needs the `pbxk1.` key. Set `PAYBOX_SIGNING_KEY` and restart the bot.'
    );
  }

  const progress = await ctx.reply(`🛍 Paying for ${escapeMd(sanitizeText(url, 80))}…\n\n_Probing the 402 endpoint…_`, {
    parse_mode: 'Markdown',
  });

  try {
    const result = await ctx.paybox.useService(
      {
        credentialId: wallet.id,
        url,
        method,
        body,
      },
      { waitForApproval: { timeoutMs: ctx.config.requestTimeoutMs, intervalMs: ctx.config.pollIntervalMs } }
    );

    const response = result.response;
    if (response.status !== 'success') {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progress.message_id,
        undefined,
        `❌ **Service call ${response.status === 'denied' ? 'denied' : 'failed'}** — ${response.reason || response.error || response.error_message || ''}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const payload = response.output?.value ?? response.output ?? {};
    const svcResponse = payload.response ?? payload;
    const status = svcResponse.status ?? 200;
    const contentType = escapeMd(sanitizeText(svcResponse.content_type || 'text/plain', 40));
    const bodyText = typeof svcResponse.body === 'string' ? svcResponse.body : JSON.stringify(svcResponse.body ?? {});

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      `✅ **Paid response received**\n\nHTTP ${status} · ${contentType}\n\n\`\`\`\n${truncateUtf8(sanitizeText(bodyText, 3500), 3500)}\n\`\`\``,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );
    ctx.stats?.hit('service_used');
  } catch (error) {
    logger.error('use_service error:', error.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      `❌ **Service call failed** — ${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}
