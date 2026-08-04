# 🤖 Paybox Telegram Bot

A powerful Telegram bot that brings Web3 payments, crypto transfers, and decentralized services directly to Telegram. Powered by **Paybox** - the non-custodial wallet for AI agents.

## 🎯 Features

### Wallet & Portfolio Management
- **Check Portfolio**: View your crypto holdings across EVM and Solana chains.
- **Pay Users**: Send ETH, SOL, and tokens to other Telegram users using `/pay @user`.
- **Crypto Transfers**: Send funds directly to any wallet address.
- **Sign Messages**: Sign messages and transactions securely with your wallet.
- **Setup Validation**: Intelligent checks to ensure users have connected their Paybox account before transacting.

### x402 Services Integration
Access premium services directly from Telegram:
- **✈️ Flights**: Book flights via Brij.
- **🛒 Shopping**: Buy from Amazon via Purch.
- **📧 Email**: Access Agentmail inbox.
- **📊 Data**: Real-time market data and web scraping via Glim.sh.
- **📱 SMS**: Send SMS messages.
- **📄 Documents**: Parse and extract data from documents.

### Security
- **Non-custodial**: Your private keys never leave your device.
- **Passkey Approval**: Sensitive operations require your passkey via Paybox.
- **Audit Trail**: All operations are logged for transparency.
- **Scoped Access**: The bot only sees what you explicitly grant.

---

## 🗺️ Project Roadmap & Phases

To make this bot the ultimate Web3 companion on Telegram, we follow a structured development roadmap:

### Phase 1: Foundation (Current)
- [x] Integration with @paybox-sh/sdk.
- [x] Portfolio balance checking across multiple chains.
- [x] Basic `/pay` and `/transfer` functionality.
- [x] Message signing capabilities.
- [x] x402 service discovery.

### Phase 2: Enhanced User Experience (Next)
- [ ] **User Registry**: Database integration to map Telegram handles to wallet addresses.
- [ ] **Inline Keyboards**: Quick actions for common tasks (e.g., "Pay Back", "View Tx").
- [ ] **Real-time Notifications**: Instant alerts when a payment is received or a request is approved.
- [ ] **Multi-currency Support**: Automatic price conversion for common tokens.

### Phase 3: Autonomous Agents & Automation
- [ ] **Scheduled Payments**: Set up recurring transfers or subscription payments.
- [ ] **Trading Agents**: Deploy AI agents that trade on prediction markets based on your custom signals.
- [ ] **Smart Alerts**: Get notified of portfolio changes or market opportunities.

### Phase 4: Ecosystem Expansion
- [ ] **Group Chat Features**: Split bills and group expenses within Telegram groups.
- [ ] **Merchant Tools**: Allow businesses to accept Paybox payments via Telegram bots.
- [ ] **White-label SDK**: A framework for other developers to build their own Paybox-powered Telegram bots.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- A Paybox account ([app.paybox.sh](https://app.paybox.sh))
- Paybox API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/nialthony/paybox-telegram-bot.git
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
   Edit `.env` and add your `TELEGRAM_BOT_TOKEN` and `PAYBOX_API_KEY`.

4. **Start the bot**
   ```bash
   npm start
   ```

## 📱 Usage

| Command | Description | Example |
|---------|-------------|---------|
| `/pay` | Send crypto to a user or address | `/pay @user 1.5 ETH` |
| `/balance` | Check your crypto portfolio | `/balance` |
| `/services` | Browse x402 services | `/services flights` |
| `/sign` | Sign a message | `/sign gm frens` |

---

**Made with ❤️ to showcase the power of Paybox + Telegram**

🔗 [Paybox](https://paybox.sh) | 🤖 [Telegraf](https://telegraf.js.org) | 💬 [Telegram](https://telegram.org)
