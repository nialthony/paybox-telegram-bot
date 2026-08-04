# 🤖 Paybox Telegram Bot

A powerful Telegram bot that brings Web3 payments, crypto transfers, and decentralized services directly to Telegram. Powered by **Paybox** - the non-custodial wallet for AI agents.

## 🎯 Features

### Wallet & Portfolio Management
- **Check Portfolio**: View your crypto holdings across EVM and Solana chains
- **Transfer Crypto**: Send ETH, SOL, and tokens to other wallets
- **Sign Messages**: Sign messages and transactions with your wallet
- **Balance Verification**: Verify Solana balances with transaction signatures

### x402 Services Integration
Access premium services directly from Telegram:
- **✈️ Flights**: Book flights via Brij
- **🛒 Shopping**: Buy from Amazon via Purch
- **📧 Email**: Access Agentmail inbox
- **📊 Data**: Real-time market data and web scraping via Glim.sh
- **📱 SMS**: Send SMS messages
- **📄 Documents**: Parse and extract data from documents
- **👥 Contacts**: Enrich contact information

### Prediction Markets
- Browse World prediction markets
- Trade prediction outcomes
- Monitor positions and P&L
- Real-time market data and orderbook

### Security
- **Non-custodial**: Your private keys never leave your device
- **Passkey Approval**: Sensitive operations require your passkey
- **Audit Trail**: All operations are logged
- **Scoped Access**: Agents get limited, scoped credentials

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- A Paybox account (https://app.paybox.sh)
- Paybox API key

### Installation

1. **Clone or download this repository**
   ```bash
   cd paybox-telegram-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
   - `PAYBOX_API_KEY`: Your Paybox API key
   - `PAYBOX_SIGNING_KEY`: (Optional) Your Paybox signing key for autonomous operations

4. **Start the bot**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## 📱 Usage

### Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Show welcome message | `/start` |
| `/help` | Show all available commands | `/help` |
| `/balance` | Check your crypto portfolio | `/balance` |
| `/transfer` | Send crypto to another wallet | `/transfer 0x123... 1.5 ETH` |
| `/sign` | Sign a message with your wallet | `/sign hello world` |
| `/services` | Browse x402 services | `/services flights` |
| `/email` | Access your email inbox | `/email` |
| `/markets` | Browse prediction markets | `/markets` |

### Examples

**Check your portfolio:**
```
/balance
```

**Send 1.5 ETH to an address:**
```
/transfer 0x742d35Cc6634C0532925a3b844Bc9e7595f2bEb 1.5 ETH
```

**Sign a message:**
```
/sign gm frens
```

**Book a flight:**
```
/services flights
```

**Access your email:**
```
/email
```

## 🏗️ Architecture

### Project Structure
```
paybox-telegram-bot/
├── src/
│   ├── index.js           # Main bot entry point
│   ├── middleware/
│   │   └── index.js       # Middleware setup
│   └── commands/
│       ├── index.js       # Command registration
│       ├── start.js       # Start command
│       ├── help.js        # Help command
│       ├── balance.js     # Portfolio balance
│       ├── transfer.js    # Crypto transfer
│       ├── sign.js        # Message signing
│       └── services.js    # x402 services
├── .env.example           # Environment variables template
├── package.json           # Dependencies
└── README.md             # This file
```

### Key Technologies
- **Telegraf**: Telegram bot framework
- **Paybox SDK**: Non-custodial wallet integration
- **Node.js**: Runtime environment

## 🔐 Security Considerations

1. **Private Keys**: Never stored in the bot. All signing happens in Paybox.
2. **Passkey Approval**: Sensitive operations require user approval via passkey.
3. **Scoped Credentials**: The bot only gets access to what the user explicitly grants.
4. **Audit Trail**: All operations are logged in Paybox for transparency.
5. **Environment Variables**: Keep your API keys secure in `.env` file.

## 🌟 Why This Bot is "Crazy" (In a Good Way)

1. **First Telegram + Paybox Integration**: Brings Web3 to the world's most popular messaging app
2. **Non-Custodial by Default**: Users maintain full control of their assets
3. **x402 Services**: Unique access to premium services (flights, shopping, data, etc.)
4. **Prediction Markets**: Trade prediction outcomes directly from Telegram
5. **Seamless UX**: Complex Web3 operations simplified for mainstream users

## 🚀 Future Enhancements

- [ ] Inline keyboard for quick actions
- [ ] Webhook support for scalability
- [ ] Redis session persistence
- [ ] Multi-language support
- [ ] Advanced trading features
- [ ] Portfolio analytics and charts
- [ ] Scheduled transfers and payments
- [ ] Group chat support
- [ ] Tip/payment splitting
- [ ] Integration with other Web3 services

## 📚 Documentation

- [Paybox Docs](https://docs.paybox.sh) - Complete Paybox documentation
- [Telegraf Docs](https://telegraf.js.org) - Telegram bot framework
- [x402 Services](https://docs.paybox.sh/reference/mcp-tools#discover_services) - Available premium services

## 🤝 Contributing

This is a demo project showcasing Paybox capabilities. Feel free to:
- Fork and extend with new features
- Submit issues and suggestions
- Create pull requests
- Share your use cases

## 📄 License

MIT License - Feel free to use and modify

## 🎓 Learning Resources

- [Paybox Getting Started](https://docs.paybox.sh/getting-started)
- [MCP Tools Reference](https://docs.paybox.sh/reference/mcp-tools)
- [OAuth 2.1 Integration](https://docs.paybox.sh/connect/oauth)
- [SDK & CLI Guide](https://docs.paybox.sh/sdk-cli)

## 💬 Support

For issues related to:
- **Paybox**: Visit https://docs.paybox.sh or contact Paybox team
- **Telegram Bot**: Check Telegraf documentation or create an issue
- **This Bot**: Create an issue on GitHub

---

**Made with ❤️ to showcase the power of Paybox + Telegram**

🔗 [Paybox](https://paybox.sh) | 🤖 [Telegraf](https://telegraf.js.org) | 💬 [Telegram](https://telegram.org)
