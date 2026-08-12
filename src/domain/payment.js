const ASSET_REGISTRY = Object.freeze({
  ETH: Object.freeze({
    symbol: 'ETH',
    chain: 'eip155:1',
    decimals: 18,
    addressType: 'evm',
    token: undefined,
  }),
  SOL: Object.freeze({
    symbol: 'SOL',
    chain: 'solana:5eykt4UsFv2P6tnw2qTr3tWUomtW5oGS5zgziYyQd53',
    decimals: 9,
    addressType: 'solana',
    token: undefined,
  }),
});

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL_AMOUNT = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export class PaymentInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentInputError';
  }
}

export function getSupportedAsset(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase();
  const asset = ASSET_REGISTRY[normalized];

  if (!asset) {
    throw new PaymentInputError('Unsupported asset. Supported assets: ETH, SOL.');
  }

  return asset;
}

export function detectWalletAddressType(address) {
  const normalized = String(address || '').trim();
  if (EVM_ADDRESS.test(normalized)) return 'evm';
  if (SOLANA_ADDRESS.test(normalized)) return 'solana';
  return null;
}

export function validateRecipient(address, addressType) {
  const normalized = String(address || '').trim();
  const detectedType = detectWalletAddressType(normalized);

  if (detectedType !== addressType) {
    throw new PaymentInputError(`Invalid ${addressType === 'evm' ? 'Ethereum' : 'Solana'} recipient address.`);
  }

  return normalized;
}

export function validateSupportedWalletAddress(address) {
  const normalized = String(address || '').trim();
  if (!detectWalletAddressType(normalized)) {
    throw new PaymentInputError('Provide a valid Ethereum or Solana wallet address.');
  }
  return normalized;
}

export function parseAmountToAtomic(amount, decimals) {
  const normalized = String(amount || '').trim();
  const match = normalized.match(DECIMAL_AMOUNT);

  if (!match) {
    throw new PaymentInputError('Amount must be a positive decimal number without exponent notation.');
  }

  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals) {
    throw new PaymentInputError(`Amount has more than ${decimals} decimal places.`);
  }

  const atomic = BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
  if (atomic <= 0n) {
    throw new PaymentInputError('Amount must be greater than zero.');
  }

  return atomic.toString();
}

export function normalizeDisplayAmount(amount) {
  const [whole, fraction = ''] = String(amount).trim().split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export function createPaymentDraft({ recipient, amount, asset: assetSymbol }) {
  const asset = getSupportedAsset(assetSymbol);
  const destination = validateRecipient(recipient, asset.addressType);
  const atomicAmount = parseAmountToAtomic(amount, asset.decimals);

  return Object.freeze({
    recipient: destination,
    asset: asset.symbol,
    chain: asset.chain,
    token: asset.token,
    atomicAmount,
    displayAmount: normalizeDisplayAmount(amount),
  });
}

export function parsePaymentCommand(text) {
  const args = String(text || '').trim().split(/\s+/).slice(1);
  if (args.length < 3) {
    throw new PaymentInputError('Usage: /pay <wallet_address> <amount> <ETH|SOL>');
  }

  const [recipient, amount, asset] = args;
  return createPaymentDraft({ recipient, amount, asset });
}

export const SUPPORTED_ASSETS = Object.freeze(
  Object.values(ASSET_REGISTRY).map(({ symbol, chain, decimals, addressType }) =>
    Object.freeze({ symbol, chain, decimals, addressType }),
  ),
);
