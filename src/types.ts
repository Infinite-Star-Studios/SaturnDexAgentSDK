// ── Network Configuration ──

/** Network configuration */
export interface NetworkConfig {
  /** "testnet" for devnet, "mainnet" for production */
  nexus: "testnet" | "mainnet";
  /** Saturn Alpha API base URL */
  saturnApiUrl: string;
  /** Phantasma RPC endpoint */
  phantasmaRpcUrl: string;
}

export const DEVNET_CONFIG: NetworkConfig = {
  nexus: "testnet",
  saturnApiUrl: "https://devnet.saturnx.cc/api/v1",
  phantasmaRpcUrl: "https://devnet.phantasma.info/rpc",
};

export const MAINNET_CONFIG: NetworkConfig = {
  nexus: "mainnet",
  saturnApiUrl: "https://www.saturnx.cc/api/v1",
  phantasmaRpcUrl: "https://mainnet.phantasma.info/rpc",
};

// ── GET /api/v1/health ──

export interface HealthResponse {
  status: "healthy" | "degraded";
  version: string;
  chain: {
    name: string;
    nexus: string;
    rpc: string;
    connected: boolean;
    latencyMs: number;
    blockHeight: number;
    error?: string;
  };
  dex: {
    contract: string;
    name: string;
  };
  timestamp: string;
}

// ── GET /api/v1/tokens ──

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  maxSupply: string;
  icon: string;
  url: string;
  metadata: Record<string, unknown>;
}

export interface TokenListResponse {
  tokens: TokenInfo[];
  count: number;
  knownSymbols: string[];
}

export interface TokenSingleResponse {
  token: TokenInfo;
}

// ── GET /api/v1/quote ──

export interface FeeLeg {
  leg: string;
  percent: number;
}

export interface FeeInfo {
  legs: FeeLeg[];
  totalPercent: number;
  description: string;
}

export interface QuoteResponse {
  quote: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    rawAmountIn: string;
    rawAmountOut: string;
    rate: string;
    reverseRate: string;
    route: string[];
    hops: number;
  };
  fee: FeeInfo;
  priceImpact: string;
  tokens: Record<string, { name: string; decimals: number }>;
  routeComparison?: {
    alternativeRoute?: string[];
    alternativeOutput?: string;
    directAdvantage?: string;
    directOutput?: string;
    routeAdvantage?: string;
  };
}

// ── GET /api/v1/swap ──

export interface SwapResponse {
  transaction: {
    script: string;
    scriptBase64: string;
    label: string;
    gasPrice: number;
    gasLimit: number;
    instructions: string;
  };
  quote: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    rawAmountIn: string;
    rawAmountOut: string;
    rate: string;
    slippage: number;
    route: string[];
    hops: number;
    fee: {
      legs: FeeLeg[];
      totalPercent: number;
    };
  };
}

// ── GET /api/v1/prices ──

export interface PriceEntry {
  symbol: string;
  price: string;
  base: string;
  pool: string;
  reserves: {
    tokenA: string;
    tokenB: string;
  };
}

export interface PricesResponse {
  prices: PriceEntry[];
  base: string;
  count: number;
  timestamp: string;
}

// ── GET /api/v1/pools ──

export interface PoolReserve {
  raw: string;
  amount: string;
  decimals: number;
}

export interface PoolEntry {
  poolKey: string;
  tokenA: string;
  tokenB: string;
  reserves: Record<string, PoolReserve>;
}

export interface PoolsResponse {
  pools: PoolEntry[];
  count: number;
  totalPoolKeys: number;
  uniquePools: number;
}

// ── GET /api/v1/portfolio ──

export interface FungibleBalance {
  symbol: string;
  amount: string;
  rawAmount: string;
  decimals: number;
  chain: string;
}

export interface NftBalance {
  symbol: string;
  amount: string;
  rawAmount: string;
  decimals: number;
  chain: string;
  nftIds: string[];
  nftCount: number;
}

export interface PortfolioResponse {
  address: string;
  name: string | null;
  stake: string;
  unclaimed: string;
  balances: {
    fungible: FungibleBalance[];
    nfts: NftBalance[];
    totalTokens: number;
  };
  timestamp: string;
}

// ── GET /api/v1/gas ──

export interface GasOperation {
  name: string;
  gasLimit: number;
  estimatedKCAL: string;
  description: string;
}

export interface GasResponse {
  gas: {
    operation: string;
    description: string;
    gasPrice: number;
    gasLimit: number;
    totalGasCost: string;
    estimatedKCAL: string;
    hops?: number;
    note?: string;
  };
  token: {
    symbol: string;
    name: string;
    decimals: number;
    role: string;
  };
  operations: GasOperation[];
}

// ── GET /api/v1/nfts ──

export interface NftAttributes {
  accessory: string;
  background: string;
  eyeColor: string;
  hairColor: string;
  hairDecoration: string;
  hairStyle: string;
  orientation: string;
  outfit: string;
  skinColor: string;
}

export interface NftItem {
  id: string;
  mint: number;
  name: string;
  imageURL: string;
  description: string;
  attributes: NftAttributes;
  rarity: {
    tier: string;
    rank: number;
    score: number;
  };
}

export interface NftsListResponse {
  nfts: NftItem[];
  collection: {
    name: string;
    symbol: string;
    totalSupply: number;
    rarityTiers: string[];
  };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface NftSingleResponse {
  nft: NftItem;
}

// ── Safety Configuration ──

export interface SafetyConfig {
  /** Max allowed price impact percentage (default: 5) */
  maxPriceImpact: number;
  /** Max allowed total fee percentage (default: 3) */
  maxFeePercent: number;
  /** Default slippage tolerance percentage (default: 3) */
  defaultSlippage: number;
  /** Minimum KCAL to reserve for gas (default: 1) */
  minKcalReserve: number;
  /** Transaction expiration window in seconds (default: 300) */
  expirationSeconds: number;
  /** Max API requests per minute (default: 120) */
  maxRequestsPerMinute: number;
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  maxPriceImpact: 5,
  maxFeePercent: 3,
  defaultSlippage: 3,
  minKcalReserve: 1,
  expirationSeconds: 300,
  maxRequestsPerMinute: 120,
};

// ── Swap Result ──

export interface SwapResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  status: "confirmed" | "failed" | "pending";
}
