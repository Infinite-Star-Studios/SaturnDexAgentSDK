import {
  NetworkConfig,
  TokenInfo,
  TokenListResponse,
  TokenSingleResponse,
  PriceEntry,
  PricesResponse,
  QuoteResponse,
  GasResponse,
  SwapResponse,
  PortfolioResponse,
  PoolsResponse,
  HealthResponse,
  NftsListResponse,
  NftSingleResponse,
} from "./types.js";

/**
 * Rate limiter that enforces max requests per minute.
 */
class RateLimiter {
  private timestamps: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);

    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0];
      const waitMs = 60_000 - (now - oldest) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.timestamps.push(Date.now());
  }
}

/**
 * HTTP client for the Saturn Alpha API.
 * Handles quotes, swaps, token data, gas estimates, portfolio, pools, and NFTs.
 */
export class SaturnClient {
  private config: NetworkConfig;
  private rateLimiter: RateLimiter;
  private tokenCache: { data: TokenInfo[]; timestamp: number } | null = null;
  private priceCache: { data: PriceEntry[]; timestamp: number } | null = null;

  constructor(config: NetworkConfig, maxRequestsPerMinute = 120) {
    this.config = config;
    this.rateLimiter = new RateLimiter(maxRequestsPerMinute);
  }

  private async fetch<T>(path: string): Promise<T> {
    await this.rateLimiter.waitForSlot();
    const url = `${this.config.saturnApiUrl}${path}`;
    const res = await globalThis.fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Saturn API ${res.status}: ${path} — ${body}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Health ──

  /** GET /health */
  async getHealth(): Promise<HealthResponse> {
    return this.fetch<HealthResponse>("/health");
  }

  // ── Tokens ──

  /** GET /tokens — full response with count and knownSymbols */
  async getTokensResponse(): Promise<TokenListResponse> {
    return this.fetch<TokenListResponse>("/tokens");
  }

  /** GET /tokens — token list only (cached 60s) */
  async getTokens(): Promise<TokenInfo[]> {
    const now = Date.now();
    if (this.tokenCache && now - this.tokenCache.timestamp < 60_000) {
      return this.tokenCache.data;
    }
    const resp = await this.getTokensResponse();
    this.tokenCache = { data: resp.tokens, timestamp: now };
    return resp.tokens;
  }

  /** GET /tokens/:symbol — single token lookup */
  async getToken(symbol: string): Promise<TokenSingleResponse> {
    return this.fetch<TokenSingleResponse>(`/tokens/${symbol}`);
  }

  /** Lookup a token's decimals from the cached registry. */
  async getTokenDecimals(symbol: string): Promise<number> {
    const tokens = await this.getTokens();
    const token = tokens.find((t) => t.symbol === symbol);
    if (!token) throw new Error(`Unknown token: ${symbol}`);
    return token.decimals;
  }

  // ── Prices ──

  /** GET /prices — full response */
  async getPricesResponse(): Promise<PricesResponse> {
    return this.fetch<PricesResponse>("/prices");
  }

  /** GET /prices — price list only (cached 30s) */
  async getPrices(): Promise<PriceEntry[]> {
    const now = Date.now();
    if (this.priceCache && now - this.priceCache.timestamp < 30_000) {
      return this.priceCache.data;
    }
    const resp = await this.getPricesResponse();
    this.priceCache = { data: resp.prices, timestamp: now };
    return resp.prices;
  }

  // ── Quote ──

  /** GET /quote — get a swap quote without executing */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amount: number
  ): Promise<QuoteResponse> {
    return this.fetch<QuoteResponse>(
      `/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}`
    );
  }

  // ── Gas ──

  /** GET /gas — estimate gas for an operation */
  async getGasEstimate(
    operation = "swap",
    hops?: number
  ): Promise<GasResponse> {
    const params =
      hops !== undefined
        ? `/gas?operation=${operation}&hops=${hops}`
        : `/gas?operation=${operation}`;
    return this.fetch<GasResponse>(params);
  }

  // ── Swap ──

  /** GET /swap — build an unsigned swap transaction */
  async getSwapTransaction(
    address: string,
    tokenIn: string,
    tokenOut: string,
    amount: number,
    slippage: number
  ): Promise<SwapResponse> {
    return this.fetch<SwapResponse>(
      `/swap?address=${address}&tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}&slippage=${slippage}`
    );
  }

  // ── Portfolio ──

  /** GET /portfolio — get wallet balances, stake, and NFTs */
  async getPortfolio(address: string): Promise<PortfolioResponse> {
    return this.fetch<PortfolioResponse>(`/portfolio?address=${address}`);
  }

  // ── Pools ──

  /** GET /pools — list all liquidity pools */
  async getPools(): Promise<PoolsResponse> {
    return this.fetch<PoolsResponse>("/pools");
  }

  // ── NFTs ──

  /** GET /nfts — list NFTs with pagination */
  async getNfts(
    symbol: string,
    limit = 50,
    offset = 0
  ): Promise<NftsListResponse> {
    return this.fetch<NftsListResponse>(
      `/nfts?symbol=${symbol}&limit=${limit}&offset=${offset}`
    );
  }

  /** GET /nfts/:id — get a single NFT */
  async getNft(symbol: string, id: string): Promise<NftSingleResponse> {
    return this.fetch<NftSingleResponse>(`/nfts/${symbol}/${id}`);
  }

  // ── Cache ──

  /** Invalidate all caches. */
  clearCache(): void {
    this.tokenCache = null;
    this.priceCache = null;
  }
}
