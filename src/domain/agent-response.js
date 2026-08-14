const ALLOWED_INTENTS = new Set(['balance', 'payment_draft', 'services', 'chat']);

function normalizeParams(value) {
  const params = value && typeof value === 'object' ? value : {};
  return {
    recipient: typeof params.recipient === 'string' ? params.recipient.trim() : null,
    amount: typeof params.amount === 'string' ? params.amount.trim() : null,
    asset: typeof params.asset === 'string' ? params.asset.trim().toUpperCase() : null,
    query: typeof params.query === 'string' ? params.query.trim() : null,
  };
}

export function emptyAgentParams() {
  return normalizeParams();
}

export function validateAgentResponse(value) {
  if (!value || typeof value !== 'object' || !ALLOWED_INTENTS.has(value.intent)) {
    return { intent: 'chat', params: normalizeParams(), reply: 'Please use /help to see available commands.' };
  }

  const params = normalizeParams(value.params);
  const reply = typeof value.reply === 'string' && value.reply.trim()
    ? value.reply.trim().slice(0, 1_000)
    : 'Please use /help to see available commands.';

  if (value.intent === 'payment_draft' && !(params.recipient && params.amount && params.asset)) {
    return {
      intent: 'chat',
      params: normalizeParams(),
      reply: 'To prepare a payment draft, provide a wallet address, amount, and asset (ETH or SOL).',
    };
  }

  return { intent: value.intent, params, reply };
}
