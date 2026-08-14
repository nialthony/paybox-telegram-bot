import { randomUUID } from 'node:crypto';

export function createReferenceId() {
  return `err_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function reportError({ logger = console, scope, error, context = {} }) {
  const referenceId = createReferenceId();
  logger.error({
    referenceId,
    scope,
    errorName: error?.name,
    context,
  });
  return referenceId;
}

export async function replyWithSafeError(ctx, { referenceId, message = 'We could not complete that request.' }) {
  await ctx.reply(`❌ ${message}\n\nReference: \`${referenceId}\``, { parse_mode: 'Markdown' });
}

export function escapeMarkdown(value) {
  return String(value ?? '').replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1');
}
