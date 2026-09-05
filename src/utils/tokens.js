/**
 * Chain & token catalog.
 *
 * Chains use CAIP-2 ids. Token symbols are canonicalized here so commands
 * accept friendly forms ("eth", "ETH", "usdc", "sol") and resolve them to the
 * correct chain + contract address for swaps and transfers.
 */

export const CHAINS = {
  ethereum: {
    key: 'ethereum',
    id: 'eip155:1',
    label: 'Ethereum',
    family: 'evm',
    nativeSymbol: 'ETH',
    decimals: 18,
    defaultRpc: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
  },
  base: {
    key: 'base',
    id: 'eip155:8453',
    label: 'Base',
    family: 'evm',
    nativeSymbol: 'ETH',
    decimals: 18,
    defaultRpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
  },
  solana: {
    key: 'solana',
    id: 'solana:5eykt4UsFv2P6tnw2qTr3tWUomtW5oGS5zgziYyQd53',
    label: 'Solana',
    family: 'solana',
    nativeSymbol: 'SOL',
    decimals: 9,
    defaultRpc: 'https://api.mainnet-beta.solana.com',
    explorer: 'https://solscan.io',
  },
};

const WETH_ETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/**
 * Token symbols resolvable in commands.
 * `chain` names the chain entry (swap source chain); `address` is the token
 * contract (or mint) — Solana swaps require mint addresses, never symbols.
 */
export const TOKENS = {
  ETH: { symbol: 'ETH', chain: 'ethereum', address: 'native', decimals: 18 },
  WETH: { symbol: 'WETH', chain: 'ethereum', address: WETH_ETH, decimals: 18 },
  USDC: { symbol: 'USDC', chain: 'ethereum', address: USDC_ETH, decimals: 6 },
  USDT: { symbol: 'USDT', chain: 'ethereum', address: USDT_ETH, decimals: 6 },
  BASE: { symbol: 'ETH', chain: 'base', address: 'native', decimals: 18, label: 'ETH (Base)' },
  USDC_BASE: { symbol: 'USDC', chain: 'base', address: USDC_BASE, decimals: 6, label: 'USDC (Base)' },
  SOL: { symbol: 'SOL', chain: 'solana', address: 'native', decimals: 9 },
  USDC_SOL: { symbol: 'USDC', chain: 'solana', address: USDC_SOL, decimals: 6, label: 'USDC (Solana)' },
};

const ALIASES = {
  eth: 'ETH',
  ether: 'ETH',
  weth: 'WETH',
  usdc: 'USDC',
  usdt: 'USDT',
  base: 'BASE',
  'eth-base': 'BASE',
  'eth_base': 'BASE',
  'usdc-base': 'USDC_BASE',
  'usdc_base': 'USDC_BASE',
  sol: 'SOL',
  'usdc-sol': 'USDC_SOL',
  'usdc_sol': 'USDC_SOL',
};

/**
 * Resolve a token from user input.
 * Returns `{ token, chain }` or null when unknown.
 */
export function resolveToken(input) {
  if (!input) return null;
  const key = ALIASES[String(input).toLowerCase().trim()];
  const token = TOKENS[key ?? String(input).toUpperCase()];
  if (!token) return null;
  return { token, chain: CHAINS[token.chain] };
}

/** Amount in the token's smallest unit, as a decimal string (swap wire format). */
export function toSmallestUnit(amount, token) {
  const scaled = BigInt(Math.round(Number(amount) * 10 ** token.decimals));
  return scaled.toString();
}

/** Human amount from a smallest-unit decimal string. */
export function fromSmallestUnit(amountStr, decimals) {
  const padded = String(amountStr).padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals);
  return Number(`${whole}.${frac}`);
}

export function explorerTxUrl(chain, hash) {
  return `${chain.explorer}/tx/${hash}`;
}

export function explorerAddressUrl(chain, address) {
  if (chain.family === 'solana') return `${chain.explorer}/account/${address}`;
  return `${chain.explorer}/address/${address}`;
}

/** List tokens available for a given chain (for /swap help). */
export function tokensForChain(chainKey) {
  return Object.values(TOKENS).filter((t) => t.chain === chainKey);
}
