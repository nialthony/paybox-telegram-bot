# External Source Findings

This record preserves the public documentation findings used to harden the bot and assess release readiness.

| Source | Finding used in this repository | Implementation impact |
|---|---|---|
| Paybox SDK and CLI documentation | The published SDK exposes `listCredentials`, `getPortfolio({ address })`, `requestPayment`, `requestWalletSign`, `requestSwap`, `discoverServices(query)`, and `getRequest`. It does **not** document or expose `requestTransfer`. | The bot uses the documented credential, portfolio, and service interfaces. Wallet-transfer creation remains disabled and fails closed pending an approved Paybox integration contract. |
| Ethereum developer documentation | ETH values use 18 decimal places in wei. | ETH amounts are parsed as decimal strings and converted exactly with `BigInt`. |
| Solana terminology documentation | A SOL is divided into 1,000,000,000 lamports. | SOL amounts use 9 decimal places rather than the ETH conversion factor. |
| Telegram Bot API | Telegram webhook delivery supports a `secret_token` sent in the `X-Telegram-Bot-Api-Secret-Token` header. | The deployment guide requires authenticated webhook verification and idempotent update handling before a webhook rollout. |

## Dependency-risk finding

`npm audit --omit=dev` reported **8 moderate** and **1 high** production dependency vulnerabilities after updating `@paybox-sh/sdk` to `0.7.0`. The high issue remains transitively connected to the Paybox SDK dependency tree and has no compatible automated remediation. The repository treats this as a **mainnet release blocker** rather than applying an unvalidated override.

## Sources

1. [Paybox SDK and CLI documentation](https://docs.paybox.sh/sdk-cli)
2. [Ethereum — technical introduction to ether and wei](https://ethereum.org/en/developers/docs/intro-to-ether/)
3. [Solana terminology — lamport](https://solana.com/docs/references/terminology#lamport)
4. [Telegram Bot API — webhook setup](https://core.telegram.org/bots/api#setwebhook)
