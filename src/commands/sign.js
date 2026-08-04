export async function signCommand(ctx) {
  const message = ctx.message.text.split(' ').slice(1).join(' ');

  if (!message) {
    await ctx.reply(
      '❌ Usage: /sign <message>\n\n' +
      'Example: /sign hello world\n' +
      'Example: /sign gm frens',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  try {
    await ctx.reply(`⏳ Preparing message to sign...\n\nMessage: "${message}"`);

    const { credentials } = await ctx.paybox.listCredentials();

    if (credentials.length === 0) {
      await ctx.reply('❌ No wallet credentials found.');
      return;
    }

    // Find wallet credential
    const walletCredential = credentials.find((c) => c.kind === 'wallet');
    if (!walletCredential) {
      await ctx.reply('❌ No wallet found. Please connect a wallet at https://app.paybox.sh');
      return;
    }

    // Request wallet sign
    const signRequest = await ctx.paybox.requestWalletSign({
      credentialId: walletCredential.credential_id,
      intent: {
        op: 'message',
        message: message,
      },
    });

    if (signRequest.status === 'pending_approval') {
      await ctx.reply(
        `✅ Please approve signing this message:\n\n` +
        `\`${message}\`\n\n` +
        `[Approve Signing](${signRequest.approval_url})`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Sign', url: signRequest.approval_url }],
              [{ text: '❌ Deny', callback_data: `deny_${signRequest.request_id}` }],
            ],
          },
        }
      );

      // Poll for completion
      pollSignStatus(ctx, signRequest.request_id);
    } else if (signRequest.status === 'pending_signature') {
      await ctx.reply('⏳ Signing in progress...');
      pollSignStatus(ctx, signRequest.request_id);
    } else if (signRequest.status === 'success') {
      const signature = signRequest.output.signature;
      await ctx.reply(
        `✅ **Message Signed!**\n\n` +
        `Signature:\n\`${signature}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(`❌ Signing failed: ${signRequest.status}`);
    }
  } catch (error) {
    console.error('Sign error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

async function pollSignStatus(ctx, requestId, attempts = 0) {
  if (attempts > 30) {
    await ctx.reply('⏱️ Signing polling timeout. Please check manually.');
    return;
  }

  try {
    const request = await ctx.paybox.getRequest(requestId);

    if (request.status === 'success') {
      const signature = request.output.signature;
      await ctx.reply(
        `✅ **Signature Confirmed!**\n\n` +
        `\`${signature}\``,
        { parse_mode: 'Markdown' }
      );
    } else if (request.status === 'denied') {
      await ctx.reply('❌ Signing was denied.');
    } else if (request.status === 'error') {
      await ctx.reply(`❌ Signing error: ${request.error_message}`);
    } else {
      // Still pending, poll again after 5 seconds
      setTimeout(() => pollSignStatus(ctx, requestId, attempts + 1), 5000);
    }
  } catch (error) {
    console.error('Poll error:', error);
  }
}
