# 📱 Usage Examples & Bot Interactions

This document showcases how users interact with the **Paybox Telegram Bot**, including the new **AI Agent Mode** (Natural Language).

---

### 🤖 AI Agent Mode (Natural Language)
Instead of using `/commands`, you can just chat with the bot like a human.

**User:** "Hey, check my total balance across all wallets"

**Bot:**
> 🧠 Thinking...
> 
> I'll check your total portfolio value for you.
> 
> 🔄 Executing: `/balance`
>
> 💰 **Your Portfolio**
> **Total Value:** $1,245.50 USD
> ...

**User:** "Send 50 USDC to @friend on Solana"

**Bot:**
> 🧠 Thinking...
> 
> Sure, I'll prepare a payment of 50 USDC to @friend.
> 
> 🔄 Executing: `/pay @friend 50 USDC`
>
> 🔍 Resolving user @friend...
> ⏳ **Initiating Payment**
> ...

**User:** "I need to book a cheap flight to Bali"

**Bot:**
> 🧠 Thinking...
> 
> I can help you with that! Searching for flight booking services.
> 
> 🔄 Executing: `/services flights`
>
> ✈️ **Available Services**
> **Brij Flights** - ~$150.00
> ...

---

---

### 1. Checking Portfolio Balance
**User:** `/balance`

**Bot:**
> ⏳ Fetching your portfolio...
>
> 💰 **Your Portfolio**
> 
> **Total Value:** $1,245.50 USD
>
> **Wallets:**
> • Personal Wallet (0x742...bEb)
>   Balance: $850.20
> • Trading Wallet (5EUa...SViS)
>   Balance: $395.30
>
> **Top Holdings:**
> • ETH: 0.25 ($650.00) (+2.4%)
> • SOL: 5.0 ($750.00) (-1.2%)
> • USDC: 100.0 ($100.00)
>
> _Last updated: 10:45:30 AM_

---

### 2. Sending Payment to a User
**User:** `/pay @cryptoking 0.5 ETH`

**Bot:**
> 🔍 Resolving user @cryptoking...
> ⏳ **Initiating Payment**
>
> **To**: `0x742d35Cc6634C0532925a3b844Bc9e7595f2bEb`
> **Amount**: 0.5 ETH
>
> _Checking network status..._
>
> 🔐 **Approval Required**
>
> Please approve this payment using your Paybox passkey.
>
> [👉 Approve Now](https://app.paybox.sh/approve/req_123)
> 
> *[Button: ✅ Open Paybox]*

*(After User approves via Passkey)*

**Bot:**
> ✅ **Payment Confirmed!**
>
> Transaction Hash: `0xabc123...def456`

---

### 3. Setup Validation (User not connected)
**User:** `/pay @friend 10 SOL`

**Bot:**
> ⚠️ **Paybox Setup Required**
>
> You haven't connected your Paybox account yet. To send payments, please:
> 1. Go to [app.paybox.sh](https://app.paybox.sh)
> 2. Connect your wallet
> 3. Grant permissions to this bot

---

### 4. Discovering Services (x402)
**User:** `/services flights`

**Bot:**
> 🔍 Searching for services...
>
> ✈️ **Available Services**
>
> **Brij Flights** - ~$150.00
> Book international and domestic flights directly using your Paybox wallet...
>
> _Use /use_service <service_name> to use a service_
>
> *[Buttons: ✈️ Flights | 🛒 Amazon | 📧 Email | 📊 Data]*

---

### 5. Signing a Message
**User:** `/sign gm paybox fam`

**Bot:**
> ⏳ Preparing message to sign...
> Message: "gm paybox fam"
>
> ✅ Please approve signing this message:
> `gm paybox fam`
>
> [Approve Signing](https://app.paybox.sh/approve/sign_456)
>
> *[Buttons: ✅ Sign | ❌ Deny]*

*(After User approves)*

**Bot:**
> ✅ **Signature Confirmed!**
>
> `0x789...signature_hash...`

---

### 6. Help Command
**User:** `/help`

**Bot:**
> **📚 Available Commands**
>
> **Wallet & Portfolio:**
> • /balance - Check your crypto portfolio across all chains
> • /pay - Send crypto to a user or address
> • /transfer - Send crypto to another wallet (legacy)
> • /sign - Sign a message with your wallet
>
> **Services & Payments:**
> • /services - Browse and use x402 services (flights, Amazon, APIs, etc.)
> • /email - Access your Paybox email inbox
> • /markets - Browse prediction markets
>
> **Examples:**
> `/pay @user 1.5 ETH` - Send 1.5 ETH to a user
> `/pay 0x123... 10 SOL` - Send 10 SOL to address
