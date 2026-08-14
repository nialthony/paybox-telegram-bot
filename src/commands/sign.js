export async function signCommand(ctx) {
  const message = ctx.message?.text?.split(' ').slice(1).join(' ').trim();

  if (!message) {
    await ctx.reply('❌ Usage: /sign <message>');
    return;
  }

  await ctx.reply(
    '⚠️ Message signing is temporarily disabled in hardened mode. No signature request was created. Use the Paybox application directly until this bot has a durable, user-owned signing-intent and status workflow.',
  );
}
