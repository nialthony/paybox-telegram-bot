import OpenAI from 'openai';

export class PayboxAgent {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async processMessage(message, ctx) {
    const prompt = `
You are a Paybox AI Assistant for a Telegram Bot. Your goal is to help users manage their Web3 assets using Paybox.
The user said: "${message}"

Available tools:
- /balance: Check portfolio balance
- /pay @user <amount> <token>: Send money to a user
- /transfer <address> <amount> <token>: Send money to an address
- /services <query>: Browse x402 services (flights, amazon, etc.)
- /sign <message>: Sign a message

Based on the user's message, determine the best action. 
If they want to pay someone, extract the recipient, amount, and token.
If they just want to chat, be friendly but remind them of your financial capabilities.

Return a JSON response:
{
  "intent": "balance" | "pay" | "transfer" | "services" | "sign" | "chat",
  "params": {
    "recipient": "@username or address",
    "amount": "number",
    "token": "ETH/SOL",
    "query": "search term",
    "message": "text to sign"
  },
  "reply": "Friendly response to the user"
}
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('AI Agent Error:', error);
      return { intent: 'chat', reply: "I'm having trouble thinking right now. Can you try using a direct command like /help?" };
    }
  }
}
