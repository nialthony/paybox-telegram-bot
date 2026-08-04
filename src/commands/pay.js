export async function payCommand(ctx) {
  const args = ctx.message.text.split(' ').slice(1);

  if (args.length < 2) {
    await ctx.reply(
      '❌ **Usage**: `/pay <@user|address> <amount> [token]`\n\n' +
      '**Examples**:\n' +
      '• `/pay @cryptoking 1.5 ETH`\n' +
      '• `/pay 0x123... 10 SOL`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [recipientInput, amount, tokenInput = 'ETH'] = args;
  const token = tokenInput.toUpperCase();

  try {
    // 1. Check if Sender has Paybox setup
    const { credentials } = await ctx.paybox.listCredentials();
    
    if (!credentials || credentials.length === 0) {
      await ctx.reply(
        '⚠️ **Paybox Setup Required**\n\n' +
        'You haven\'t connected your Paybox account yet. To send payments, please:\n' +
        '1. Go to [app.paybox.sh](https://app.paybox.sh)\n' +
        '2. Connect your wallet\n' +
        '3. Grant permissions to this bot',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Find appropriate wallet credential
    const walletCredential = credentials.find((c) => c.kind === 'wallet');
    if (!walletCredential) {
      await ctx.reply('❌ **No Wallet Found**: Please grant this bot access to a wallet in your Paybox settings.');
      return;
    }

    // 2. Resolve Recipient
    let recipientAddress = recipientInput;
    
    if (recipientInput.startsWith('@')) {
      // In a real app, you would look this up in a database
      // For this demo, we'll simulate a check
      await ctx.reply(`🔍 Resolving user ${recipientInput}...`);
      
      // Simulation: Only @paybox_dev is "registered" for the demo
      if (recipientInput.toLowerCase() === '@paybox_dev') {
        recipientAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bEb'; // Demo address
      } else {
        await ctx.reply(
          `❌ **User Not Found**: ${recipientInput} has not registered their wallet with this bot yet.\n\n` +
          `Ask them to run \`/start\` and connect their Paybox account!`
        );
        return;
      }
    }

    await ctx.reply(
      `⏳ **Initiating Payment**\n\n` +
      `**To**: \`${recipientAddress}\`\n` +
      `**Amount**: ${amount} ${token}\n\n` +
      `_Checking network status..._`,
      { parse_mode: 'Markdown' }
    );

    // 3. Determine chain
    let chain;
    if (token === 'SOL') {
      chain = 'solana:5eykt4UsFv2P6tnw2qTr3tWUomtW5oGS5zgziYyQd53';
    } else if (token === 'ETH') {
      chain = 'eip155:1';
    } else {
      await ctx.reply('❌ **Unsupported Token**: Currently supports ETH and SOL.');
      return;
    }

    // 4. Request transfer via Paybox
    const transfer = await ctx.paybox.requestTransfer({
      credentialId: walletCredential.credential_id,
      chain,
      to: recipientAddress,
      amount: (parseFloat(amount) * 1e18).toString(), // Simplified conversion
    });

    if (transfer.status === 'pending_approval') {
      await ctx.reply(
        `🔐 **Approval Required**\n\n` +
        `Please approve this payment using your Paybox passkey.\n\n` +
        `[👉 Approve Now](${transfer.approval_url})`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '✅ Open Paybox', url: transfer.approval_url }]],
          },
        }
      );
      
      pollStatus(ctx, transfer.request_id);
    } else if (transfer.status === 'success') {
      await ctx.reply(`✅ **Payment Sent!**\n\nHash: \`${transfer.output.transaction_hash}\``, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ **Payment Failed**: ${transfer.status}`);
    }

  } catch (error) {
    console.error('Pay error:', error);
    await ctx.reply(`❌ **Error**: ${error.message}`);
  }
}

async function pollStatus(ctx, requestId, attempts = 0) {
  if (attempts > 20) return;

  try {
    const request = await ctx.paybox.getRequest(requestId);
    if (request.status === 'success') {
      await ctx.reply(`✅ **Payment Confirmed!**\n\nTransaction Hash: \`${request.output.transaction_hash}\``, { parse_mode: 'Markdown' });
    } else if (['denied', 'error'].includes(request.status)) {
      await ctx.reply(`❌ **Payment ${request.status === 'denied' ? 'Rejected' : 'Failed'}**`);
    } else {
      setTimeout(() => pollStatus(ctx, requestId, attempts + 1), 5000);
    }
  } catch (e) {}
}
