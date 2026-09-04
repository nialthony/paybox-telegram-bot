# 📖 Example conversations

Simulated sessions showing the bot's flows. `[paybox]` marks where the Paybox API/approval flow sits — the bot narrates its real states.

## 1. First run

```
User:   /start
Bot:    🎉 Welcome to Paybox Bot
        Your non-custodial wallet for AI agents — right inside Telegram…
        Status: 🟢 Connected to Paybox
        ✍️ Signing key: in-process signing enabled
        🧠 AI mode: on — just chat with me

        [💰 Balance] [🔁 Swap] [📈 Markets]
        [🛍 Services] [📚 Help]
        [🔗 Paybox App] [📖 Docs]
```

## 2. Portfolio

```
User:   /balance
Bot:    ⏳ Fetching portfolios…
        👛 Trading wallet `0x70a0…2b1f`
        Total: $12,480.31
        • ETH: 4.2 ≈ $11,180.40 (+0.52%)
        • USDC: 1,300 ≈ $1,300.00 (0.00%)
        — On-chain data via MoonX…
```

## 3. Transfer with passkey approval

```
User:   /transfer @alice 0.05 ETH
Bot:    ⏳ Preparing transfer
        To: `0x8f2a…41cd`
        Amount: 0.05 ETH (Ethereum)
        Building the transaction…

Bot:    🔐 Approval required
        Approve with your passkey in the Paybox app, then I'll sign and
        broadcast automatically.
        [✅ Approve in Paybox]

        …user approves on their phone…

Bot:    📡 Signed. Broadcasting to Ethereum…

Bot:    ✅ Transfer broadcast
        Amount: 0.05 ETH
        To: `0x8f2a…41cd`
        Tx: [0x5e1f…b3a7](https://etherscan.io/tx/0x5e1f…b3a7)
```

`@alice` resolved from the address book (`/register 0x8f2a… @alice` was run earlier). If she's not registered, the bot asks for her address instead of guessing.

## 4. Swap (same chain)

```
User:   /swap ETH USDC 0.5
Bot:    🔁 Requesting swap
        0.5 ETH → USDC
        Getting a quote from MoonX…

Bot:    ✅ Swap complete
        0.5 ETH → USDC
        Source tx: [0x91ab…c2de](https://etherscan.io/tx/0x91ab…c2de)
```

## 5. Bridge (cross-chain)

```
User:   /swap USDC_BASE SOL 25
Bot:    ⏳ Swap pending_settlement… I'll keep an eye on it. Check /history in a minute.
Bot:    ✅ Swap settled
        Source tx: [0x2f1e…9a01](https://basescan.org/tx/0x2f1e…9a01)
        Destination tx: [4kq2…Zt9v](https://solscan.io/tx/4kq2…Zt9v)
```

## 6. Card payment (one-time virtual card)

```
User:   /pay Acme https://acme.com 19.99
Bot:    💳 Preparing payment — Merchant: Acme, Amount: $19.99
Bot:    🔐 Approve payment  [✅ Approve in Paybox]
Bot:    ✅ Virtual card issued
        Merchant: Acme — Amount available: $19.99
        Card: `•••• 4242`
        Use these details at Acme's checkout. The card is one-time and
        merchant-locked. I won't mark the purchase complete until the
        merchant confirms it.
```

## 7. Funding a wallet (MoonPay)

```
User:   /buy 50
Bot:    🛒 Generating a signed MoonPay checkout link…
Bot:    💳 Fund your wallet
        Wallet: `0x70a0…2b1f` — Network: eip155:8453 — Currency: usdc_base
        [💳 Buy on MoonPay]
```

No money moves until the buyer completes the purchase on MoonPay's page.

## 8. Signing

```
User:   /sign gm frens
Bot:    ✅ Message signed
        EIP-191 signature:
        `0x9c2e…f31a`
        From wallet `0x70a0…` — verify independently before trusting.

User:   /sign sol:gm frens
Bot:    ✅ Message signed — Solana signature: `4k2x…Z9p1`
```

## 9. Secrets

```
User:   /secret
Bot:    🔑 Available secrets
        🔑 OpenAI key — `9f8e…`
        Use /secret <name> to reveal one…

User:   /secret OpenAI key deploy script
Bot:    🔐 Approve secret access — Purpose: deploy script  [✅ Approve in Paybox]
Bot:    ✅ Secret revealed
        `sk-…`
        ⚠️ One-time use — treat it as consumed.
```

## 10. x402 services

```
User:   /services weather
Bot:    🔍 Searching x402 services for "weather"…
        🛍 Paid services (x402)
        1. World Weather API — 0.002 X402 USDC
        2. Satellite imagery — 0.01 X402 USDC
        [1] [2]

User:   (taps 1)
Bot:    🛍 Paying for https://weather.example/tokyo…
Bot:    ✅ Paid response received
        HTTP 200 · application/json
        {"tokyo": {"temp_c": 14, "condition": "clear"}}
```

## 11. Markets

```
User:   /markets
Bot:    📈 Prediction markets
        1. Fed decision — Sep 2026 — 0.540
        2. ETH above $3000 on Dec 31 — 0.410
        [1] [2]

User:   /price fed-decision-sept
Bot:    ▁▂▃▅▆▇▆▅▄▃▄▅▆▇▇▆▅▄▃▂▁▂▃
        last: 0.5420 | high: 0.6100 | low: 0.4310
        7d change: +3.42% 📈
```

## 12. AI mode

```
User:   how much ETH do I have?
Bot:    🧠 Checking your portfolio…
        👛 Trading wallet `0x70a0…2b1f` — Total: $12,480.31 …

User:   send 10 usdc to @alice on base
Bot:    🧠 On it — sending 10 USDC on Base to @alice.
        ⏳ Preparing transfer… (base chain flow, same as example 3)
```

## 13. Locked / degraded modes

Without `PAYBOX_SIGNING_KEY`:

```
User:   /transfer @alice 0.1 ETH
Bot:    ❌ Signing key required
        Transfers need the `pbxk1.` signing key so the bot can sign
        in-process. Add PAYBOX_SIGNING_KEY and restart the bot.
```

With `OWNER_TELEGRAM_ID` set, anyone else gets:

```
Bot:    🔒 Sorry, this is a private bot. It is locked to a single owner.
```

---

All flows use the same primitives the Paybox docs prescribe: never re-call a write tool to finish it — poll `get_request`; `success` means confirmed on-chain; `denied` shows the reason and is never retried blindly.
