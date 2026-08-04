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

## 🔐 Security Analysis

This project is designed with a **Security-First** approach, leveraging the robust architecture of Paybox.

### 1. Non-Custodial Architecture
The bot **never** has access to your raw private keys or credit card numbers. All signing operations occur within the MoonX MPC (Multi-Party Computation) environment. The bot only receives a "scoped output" (a signature or a one-time virtual card).

### 2. Passkey-Gated Approvals
Even if the bot is compromised, it cannot move significant funds without your explicit consent. Any operation above your set threshold will pause and wait for your **Passkey approval** on your personal device.

### 3. Scoped Grants & Limits
You stay in control by setting specific grants for the bot:
- **Amount Limits**: Restrict how much the bot can spend per transaction or per day.
- **Credential Access**: Grant access only to specific wallets or cards, not your entire portfolio.
- **Autonomous vs. Approval**: Choose which operations need a passkey and which can be autonomous.

### 4. Secure Credential Handling
- **Environment Variables**: Sensitive keys (Auth Token, Signing Key) are stored in a `.env` file, which is excluded from version control via `.gitignore`.
- **In-Process Signing**: When using a Signing Key, the SDK performs signing in-process, ensuring that the MoonX secret never leaves the secure boundary.

### 5. Auditability
Every single action taken by the bot is recorded in the Paybox **Audit Log**. You can review every request, approval, and transaction hash at any time in the Paybox dashboard.

### 🛑 Important Safety Tips
- **Never share your .env file** or commit it to GitHub.
- **Set strict limits** in the Paybox dashboard for the "Tele" agent.
- **Regularly review the Audit Log** to monitor bot activity.
- **Revoke access immediately** in the Paybox dashboard if you suspect any unusual behavior.

---

## 🤖 AI Agent Integration Tutorial

Since Paybox is a non-custodial wallet for AI agents, you can use the same Paybox account to power tools like **Claude Code**, **Claude Desktop**, and **ChatGPT**. This Telegram bot acts as your mobile interface, while these tools act as your developer interface.

### 1. AI Agent Mode (Inside this Bot)
This bot now features a **Natural Language Mode** powered by LLMs (like GPT-4 or Claude). Instead of typing commands, you can just chat:
- *"How much money do I have?"* -> Triggers `/balance`
- *"Send 10 bucks to @friend in SOL"* -> Triggers `/pay @friend 10 SOL`
- *"I want to book a flight to Tokyo"* -> Triggers `/services flights`

To enable this, add your `OPENAI_API_KEY` to the `.env` file.

### 2. Integrating with Claude (Desktop & Code)
Paybox speaks the **Model Context Protocol (MCP)**. You can add Paybox as a custom connector.

**Steps for Claude Desktop:**
1. Open Claude Desktop and go to `Settings` -> `Customize` -> `Connectors`.
2. Click **Add Connector** and paste the Paybox MCP URL:
   ```
   https://api.paybox.sh/mcp
   ```
3. Sign in with your Passkey when prompted and approve the grant.
4. Now you can ask Claude: *"Check my Paybox portfolio"* or *"Send 0.1 ETH to 0x..."*.

**Steps for Claude Code (CLI):**
Add the Paybox MCP server to your `claude_desktop_config.json` (or your specific tool config):
```json
{
  "mcpServers": {
    "paybox": {
      "command": "npx",
      "args": ["-y", "@paybox-sh/sdk", "mcp"]
    }
  }
}
```

### 3. Integrating with ChatGPT (Custom GPTs & Codex)
You can create a Custom GPT that uses Paybox as an Action.

1. Create a new **GPT** in ChatGPT.
2. Go to **Configure** -> **Create new action**.
3. Import from URL using the Paybox OpenAPI spec (found in [Paybox Docs](https://docs.paybox.sh/api-reference)).
4. Set up **OAuth 2.1** authentication using the endpoints:
   - **Authorize URL**: `https://api.paybox.sh/oauth/authorize`
   - **Token URL**: `https://api.paybox.sh/oauth/token`
5. Now your GPT can handle payments and check balances on your behalf!

### 4. How they work together
- **Telegram Bot**: Use it for quick checks, mobile payments, and notifications while on the go.
- **Claude/ChatGPT**: Use them for complex financial analysis, automated trading scripts, or building Web3 apps.
- **Unified Identity**: All tools share the same Paybox identity and security settings (Passkey, Scoped Grants, Audit Log).

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
   Edit `.env` and add:
   - `TELEGRAM_BOT_TOKEN`: Your token from @BotFather.
   - `PAYBOX_API_KEY`: The **Auth Token** from Paybox (starts with `pbx_live_`).
   - `PAYBOX_SIGNING_KEY`: The **Signing Key** from Paybox (starts with `pbxk1_`, optional but recommended).

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

### 📖 Detailed Examples
Check out [EXAMPLES.md](./EXAMPLES.md) to see full simulated bot interactions and responses.

---

**Made with ❤️ to showcase the power of Paybox + Telegram**

🔗 [Paybox](https://paybox.sh) | 🤖 [Telegraf](https://telegraf.js.org) | 💬 [Telegram](https://telegram.org)
