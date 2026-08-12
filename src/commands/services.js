import { escapeMarkdown, reportError, replyWithSafeError } from '../lib/errors.js';

function serviceLabel(resource) {
  try {
    return new URL(resource).hostname;
  } catch {
    return resource || 'Unnamed service';
  }
}

export async function servicesCommand(ctx) {
  const query = ctx.message?.text?.split(' ').slice(1).join(' ').trim();

  try {
    await ctx.reply('🔍 Searching available services...');
    const services = await ctx.paybox.discoverServices(query || undefined);

    if (!Array.isArray(services) || !services.length) {
      await ctx.reply(
        `No services found${query ? ` for “${escapeMarkdown(query)}”` : ''}. Try a category such as flights, shopping, email, data, SMS, or documents.`,
      );
      return;
    }

    const lines = ['✈️ *Available services*', ''];
    for (const service of services.slice(0, 10)) {
      const name = escapeMarkdown(serviceLabel(service.resource));
      const description = escapeMarkdown(String(service.description || 'No description').slice(0, 160));
      lines.push(`*${name}*`, description, '');
    }

    lines.push('Service checkout is not enabled in this bot yet. This view is discovery-only.');
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    const referenceId = reportError({
      scope: 'service_discovery',
      error,
      context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id },
    });
    await replyWithSafeError(ctx, { referenceId, message: 'We could not retrieve services.' });
  }
}
