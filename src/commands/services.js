export async function servicesCommand(ctx) {
  const query = ctx.message.text.split(' ').slice(1).join(' ');

  try {
    await ctx.reply('🔍 Searching for services...');

    // Discover services
    const services = await ctx.paybox.discoverServices({
      query: query || undefined,
      limit: 10,
    });

    if (!services.services || services.services.length === 0) {
      await ctx.reply(
        `❌ No services found${query ? ` for "${query}"` : ''}.\n\n` +
        'Available service categories:\n' +
        '• flights - Book flights (Brij)\n' +
        '• amazon - Buy from Amazon (Purch)\n' +
        '• email - Email inbox (Agentmail)\n' +
        '• data - Market & web data (Glim.sh)\n' +
        '• sms - Send SMS\n' +
        '• documents - Parse documents\n' +
        '• contacts - Enrich contact info'
      );
      return;
    }

    let message = `✈️ **Available Services**\n\n`;

    for (const service of services.services) {
      const name = service.name || 'Unknown Service';
      const description = service.description || 'No description';
      const price = service.price_hint ? ` - ~$${service.price_hint}` : '';

      message += `**${name}**${price}\n`;
      message += `${description.substring(0, 100)}...\n\n`;
    }

    message += `_Use /use_service <service_name> to use a service_`;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✈️ Flights', callback_data: 'service_flights' },
            { text: '🛒 Amazon', callback_data: 'service_amazon' },
          ],
          [
            { text: '📧 Email', callback_data: 'service_email' },
            { text: '📊 Data', callback_data: 'service_data' },
          ],
        ],
      },
    });
  } catch (error) {
    console.error('Services error:', error);
    await ctx.reply(
      `❌ Error discovering services: ${error.message}\n\n` +
      'Available x402 services include:\n' +
      '• ✈️ **Flights** - Book flights via Brij\n' +
      '• 🛒 **Amazon** - Buy products via Purch\n' +
      '• 📧 **Email** - Agentmail inbox\n' +
      '• 📊 **Data** - Market data, web scraping via Glim.sh\n' +
      '• 📱 **SMS** - Send SMS messages\n' +
      '• 📄 **Documents** - Parse and extract data\n' +
      '• 👥 **Contacts** - Enrich contact information\n\n' +
      'Try: /services flights'
    );
  }
}
