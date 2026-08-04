export async function transferCommand(ctx) {
  const args = ctx.message.text.split(' ').slice(1);

  if (args.length < 3) {
    await ctx.reply(
      '❌ Usage: /transfer <recipient_address> <amount> <token>\n\n' +
      'Example: /transfer 0x123abc... 1.5 ETH\n' +
      'Example: /transfer 5EUa...SViS 10 SOL',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const [recipient, amount, token] = args;

  try {
    await ctx.reply(
      `⏳ Processing transfer...\n\n` +
      `To: ${recipient}\n` +
      `Amount: ${amount} ${token}`,
      { parse_mode: 'Markdown' }
    );

    const { credentials } = await ctx.paybox.listCredentials();

    if (credentials.length === 0) {
      await ctx.reply('❌ No wallet credentials found.');
      return;
    }

    // Find appropriate wallet
    const walletCredential = credentials.find((c) => c.kind === 'wallet');
    if (!walletCredential) {
      await ctx.reply('❌ No wallet found. Please connect a wallet at https://app.paybox.sh');
      return;
    }

    // Determine chain and token
    let chain, tokenAddress;
    if (token.toUpperCase() === 'SOL') {
      chain = 'solana:5eykt4UsFv2P6tnw2qTr3tWUomtW5oGS5zgziYyQd53';
      tokenAddress = undefined; // Native SOL
    } else if (token.toUpperCase() === 'ETH') {
      chain = 'eip155:1'; // Ethereum mainnet
      tokenAddress = undefined; // Native ETH
    } else {
      await ctx.reply('❌ Unsupported token. Currently supports ETH and SOL.');
      return;
    }

    // Request transfer
    const transfer = await ctx.paybox.requestTransfer({
      credentialId: walletCredential.credential_id,
      chain,
      to: recipient,
      amount: (parseFloat(amount) * 1e18).toString(), // Convert to wei/lamports
      token: tokenAddress,
    });

    if (transfer.status === 'pending_approval') {
      await ctx.reply(
        `✅ Transfer initiated!\n\n` +
        `Please approve this transaction using your passkey.\n` +
        `[Approve Transfer](${transfer.approval_url})`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Approve', url: transfer.approval_url }],
              [{ text: '❌ Deny', callback_data: `deny_${transfer.request_id}` }],
            ],
          },
        }
      );

      // Poll for completion
      pollTransferStatus(ctx, transfer.request_id);
    } else if (transfer.status === 'success') {
      await ctx.reply(
        `✅ Transfer successful!\n\n` +
        `Hash: \`${transfer.output.transaction_hash}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(`❌ Transfer failed: ${transfer.status}`);
    }
  } catch (error) {
    console.error('Transfer error:', error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
}

async function pollTransferStatus(ctx, requestId, attempts = 0) {
  if (attempts > 30) {
    // Stop polling after 5 minutes
    await ctx.reply('⏱️ Transfer polling timeout. Please check manually.');
    return;
  }

  try {
    const request = await ctx.paybox.getRequest(requestId);

    if (request.status === 'success') {
      await ctx.reply(
        `✅ **Transfer Confirmed!**\n\n` +
        `Hash: \`${request.output.transaction_hash}\``,
        { parse_mode: 'Markdown' }
      );
    } else if (request.status === 'denied') {
      await ctx.reply('❌ Transfer was denied.');
    } else if (request.status === 'error') {
      await ctx.reply(`❌ Transfer error: ${request.error_message}`);
    } else {
      // Still pending, poll again after 10 seconds
      setTimeout(() => pollTransferStatus(ctx, requestId, attempts + 1), 10000);
    }
  } catch (error) {
    console.error('Poll error:', error);
  }
}
