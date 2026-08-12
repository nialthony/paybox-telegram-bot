export class WalletTransferGatewayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WalletTransferGatewayError';
  }
}

export function createWalletTransferGateway({ paybox, enabled = false }) {
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      async createTransferRequest() {
        throw new WalletTransferGatewayError(
          'Wallet transfers are disabled. Configure and validate the supported Paybox transfer adapter before enabling them.',
        );
      },
    });
  }

  if (typeof paybox?.requestTransfer !== 'function') {
    throw new WalletTransferGatewayError(
      'The installed Paybox SDK does not expose requestTransfer. Wallet transfers cannot be enabled safely.',
    );
  }

  return Object.freeze({
    enabled: true,
    async createTransferRequest({ credentialId, draft }) {
      const payload = {
        credentialId,
        chain: draft.chain,
        to: draft.recipient,
        amount: draft.atomicAmount,
        ...(draft.token ? { token: draft.token } : {}),
      };

      return paybox.requestTransfer(payload);
    },
  });
}
