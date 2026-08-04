import { startCommand } from './start.js';
import { balanceCommand } from './balance.js';
import { transferCommand } from './transfer.js';
import { payCommand } from './pay.js';
import { signCommand } from './sign.js';
import { servicesCommand } from './services.js';
import { helpCommand } from './help.js';

export function setupCommands(bot) {
  // Start command
  bot.start(startCommand);

  // Help command
  bot.help(helpCommand);

  // Balance command
  bot.command('balance', balanceCommand);

  // Transfer command
  bot.command('transfer', transferCommand);

  // Pay command
  bot.command('pay', payCommand);

  // Sign command
  bot.command('sign', signCommand);

  // Services command (x402 services)
  bot.command('services', servicesCommand);

  // Handle text messages (AI Agent Mode)
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    const text = ctx.message.text;
    
    // If OpenAI API key is not set, fallback to simple message
    if (!process.env.OPENAI_API_KEY) {
      return ctx.reply('👋 I\'m a Paybox bot! Connect an AI key to enable Natural Language Mode, or use /help.');
    }

    await ctx.reply('🧠 Thinking...');

    try {
      const aiResult = await ctx.agent.processMessage(text, ctx);
      
      if (aiResult.intent === 'chat') {
        return ctx.reply(aiResult.reply);
      }

      // Map AI intent to bot commands
      let cmdMsg = aiResult.reply + "\n\n";
      
      switch (aiResult.intent) {
        case 'balance':
          cmdMsg += "🔄 Executing: `/balance`";
          await ctx.reply(cmdMsg, { parse_mode: 'Markdown' });
          return balanceCommand(ctx);
        
        case 'pay':
          const { recipient, amount, token } = aiResult.params;
          cmdMsg += `🔄 Executing: \`/pay ${recipient} ${amount} ${token || 'ETH'}\``;
          await ctx.reply(cmdMsg, { parse_mode: 'Markdown' });
          // Mock the context message for the command
          ctx.message.text = `/pay ${recipient} ${amount} ${token || 'ETH'}`;
          return payCommand(ctx);

        case 'services':
          cmdMsg += `🔄 Executing: \`/services ${aiResult.params.query}\``;
          await ctx.reply(cmdMsg, { parse_mode: 'Markdown' });
          ctx.message.text = `/services ${aiResult.params.query}`;
          return servicesCommand(ctx);

        default:
          return ctx.reply(aiResult.reply);
      }
    } catch (error) {
      console.error('Agent processing error:', error);
      ctx.reply('❌ Sorry, I couldn\'t process that request.');
    }
  });
}
