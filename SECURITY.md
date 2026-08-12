# Security Policy

## Supported scope

The current repository supports a **hardened, draft-only posture** for payment-related commands. Wallet-transfer request creation and message signing are disabled by default and are not approved for mainnet use.

## Reporting a vulnerability

Do not post exploitable details, credentials, wallet addresses, signing material, or sensitive logs in a public issue. Use GitHub’s private vulnerability-reporting feature when it is enabled for the repository, or contact the repository owner through a private channel. Include a minimal reproduction, affected version/commit, impact, and suggested mitigation if available.

## Security invariants

The following controls must not be weakened without documented review and tests:

1. Amounts must be parsed as exact decimal strings and converted with fixed-point integer arithmetic.
2. A payment draft must be bound to the originating Telegram user and chat and must expire.
3. A single payment intent may create at most one provider request.
4. Natural-language processing must not create payment, signing, swap, service-checkout, or trading requests.
5. Transfer and signing controls must default to disabled.
6. User-facing errors and routine logs must not reveal raw provider errors, secrets, or Telegram message bodies.

## Release gates for mainnet wallet transfers

Before enabling `ENABLE_WALLET_TRANSFERS`, maintainers must document and complete all of the following:

- Verified Paybox SDK method, request schema, amount-unit semantics, and response states.
- Controlled staging/testnet integration tests for success, approval, denial, timeout, retry, duplicate update, and restart cases.
- Shared persistent storage for intents, idempotency keys, account links, rate limits, and audit events.
- Durable provider-status handling through an authenticated webhook or worker queue.
- Secret scanning, dependency scanning, centralized redacted logging, monitoring, and an emergency kill switch.
- Independent application-security review and documented launch approval.

## Dependency-risk posture

The application currently depends on the Paybox SDK and its transitive blockchain libraries. Run `npm audit` during release review. A high or critical dependency finding with no compatible upstream remediation is a **mainnet release blocker**; do not silence it through an unvalidated override.
