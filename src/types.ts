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

/** Token metadata from Saturn API */
export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
}

/** Price entry from Saturn API */
export interface TokenPrice {
  symbol: string;
  price: number;
}

/** A single hop in a swap route */
export interface RouteHop {
  tokenIn: string;
  tokenOut: string;
  pool: string;
}

/** Quote response from GET /quote */
export interface QuoteResponse {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  route: RouteHop[];
  hops: number;
  fee: {
    totalPercent: number;
  };
  priceImpact: number;
}

/** Gas estimate from GET /gas */
export interface GasEstimate {
  operation: string;
  hops: number;
  estimatedKCAL: number;
  gasPrice: number;
  gasLimit: number;
}

/** Unsigned transaction from GET /swap */
export interface SwapResponse {
  transaction: {
    script: string;
    gasPrice: number;
    gasLimit: number;
  };
  quote: QuoteResponse;
}

/** Portfolio balance entry */
export interface PortfolioBalance {
  symbol: string;
  amount: number;
  decimals: number;
}

/** Portfolio response from GET /portfolio */
export interface PortfolioResponse {
  address: string;
  balances: PortfolioBalance[];
}

/** Safety thresholds for the agent */
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

/** Result of a completed swap */
export interface SwapResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
  status: "confirmed" | "failed" | "pending";
}
