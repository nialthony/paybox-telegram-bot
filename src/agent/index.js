import OpenAI from 'openai';
import { emptyAgentParams, validateAgentResponse } from '../domain/agent-response.js';

const SYSTEM_PROMPT = `You are a read-only assistant for a Telegram wallet companion.
You may help the user understand features, prepare a payment draft, search services, or request a balance.
You must never claim that funds were moved, request a transfer, sign a message, create a payment request, or bypass confirmation.
For payment requests, return intent "payment_draft" and extract only recipient, amount, and asset when the user clearly supplies all three.
Return JSON with this exact shape: {"intent":"balance|payment_draft|services|chat","params":{"recipient":null|string,"amount":null|string,"asset":null|string,"query":null|string},"reply":"string"}.`;

export { validateAgentResponse } from '../domain/agent-response.js';

export class PayboxAgent {
  constructor(apiKey, { model = process.env.OPENAI_MODEL || 'gpt-4o-mini' } = {}) {
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = model;
  }

  get enabled() {
    return Boolean(this.openai);
  }

  async processMessage(message) {
    if (!this.openai) {
      return {
        intent: 'chat',
        params: emptyAgentParams(),
        reply: 'Natural-language assistance is disabled. Use /help for available commands.',
      };
    }

    const userMessage = String(message || '').trim().slice(0, 1_500);
    if (!userMessage) {
      return { intent: 'chat', params: emptyAgentParams(), reply: 'Please send a message or use /help.' };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      return validateAgentResponse(JSON.parse(response.choices[0]?.message?.content || '{}'));
    } catch (error) {
      console.error('AI classifier error:', { name: error?.name });
      return {
        intent: 'chat',
        params: emptyAgentParams(),
        reply: 'I could not understand that safely. Use /help for direct commands.',
      };
    }
  }
}
