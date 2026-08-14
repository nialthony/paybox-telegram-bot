# Paybox API findings for Telegram tipping

Research date: 2026-08-15 (user timezone)

## Official sources

1. [PayBox SDK & CLI](https://docs.paybox.sh/sdk-cli)
2. [PayBox request lifecycle](https://docs.paybox.sh/concepts/requests)

## Verified facts

The official SDK page describes `@paybox-sh/sdk` as a typed Node SDK wrapping the PayBox agent API. The documented request surfaces include credential listing, payment requests, wallet signing, swaps, portfolio reads, request status lookup, and service tools. The page does not document a generic `requestTransfer` method for direct wallet-to-wallet tipping. Therefore the bot must not invent a transfer method or claim that a Cwallet-style tip can execute through the current SDK without an approved PayBox operation and request/response contract.

The official request lifecycle requires a submit-once and poll pattern. A request may be autonomous, require approval and return an `approval_url`, or be denied. Non-terminal statuses include `pending_approval`, `pending_signature`, `pending_settlement`, and `pending_confirmation`; terminal statuses include `success`, `denied`, and `error`. Re-issuing the original request to finish it can create a second operation, so the bot must persist the provider request ID and poll `get_request` rather than submit again.

Approvals are operation-bound and expire after approximately ten minutes. Any changed recipient, chain, asset, or amount constitutes a new request. For Telegram tipping, the durable intent must therefore bind the exact sender, group/chat, recipient wallet, chain, asset, amount, and provider request ID before any provider call.

## Design implications

The group UX can be implemented immediately as draft-only behavior: parse `tip 0.03 sol` from a reply or `tip @username 2.4 sol`, resolve the recipient to a previously registered wallet address, validate exact SOL units, and create a user-owned expiring intent. The current Paybox transfer gateway must remain fail-closed until the official PayBox transfer operation is confirmed and tested in a controlled environment.

A Telegram username alone is not a wallet address and must never be silently interpreted as one. The safest recipient model is an explicit opt-in wallet registration or verified account-linking flow. Reply-based tipping improves Telegram identity resolution but still requires the replied-to user to have a registered wallet and must reject bots, deleted users, self-tips, missing usernames, and ambiguous identities.
