import {
  NetworkConfig,
  TokenInfo,
  TokenPrice,
  QuoteResponse,
  GasEstimate,
  SwapResponse,
  PortfolioResponse,
} from "./types";

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
 * Handles quotes, swaps, token data, gas estimates, and portfolio queries.
 */
export class SaturnClient {
  private config: NetworkConfig;
  private rateLimiter: RateLimiter;
  private tokenCache: { data: TokenInfo[]; timestamp: number } | null = null;
  private priceCache: { data: TokenPrice[]; timestamp: number } | null = null;

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

  /**
   * GET /tokens — fetch token registry.
   * Cached for 60 seconds.
   */
  async getTokens(): Promise<TokenInfo[]> {
    const now = Date.now();
    if (this.tokenCache && now - this.tokenCache.timestamp < 60_000) {
      return this.tokenCache.data;
    }
    const data = await this.fetch<TokenInfo[]>("/tokens");
    this.tokenCache = { data, timestamp: now };
    return data;
  }

  /**
   * GET /prices — fetch current token prices.
   * Cached for 30 seconds.
   */
  async getPrices(): Promise<TokenPrice[]> {
    const now = Date.now();
    if (this.priceCache && now - this.priceCache.timestamp < 30_000) {
      return this.priceCache.data;
    }
    const data = await this.fetch<TokenPrice[]>("/prices");
    this.priceCache = { data, timestamp: now };
    return data;
  }

  /**
   * GET /quote — get a swap quote without executing.
   */
  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amount: number
  ): Promise<QuoteResponse> {
    return this.fetch<QuoteResponse>(
      `/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}`
    );
  }

  /**
   * GET /gas — estimate gas for a swap operation.
   */
  async getGasEstimate(hops: number): Promise<GasEstimate> {
    return this.fetch<GasEstimate>(`/gas?operation=swap&hops=${hops}`);
  }

  /**
   * GET /swap — build an unsigned swap transaction.
   */
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

  /**
   * GET /portfolio — get wallet balances.
   */
  async getPortfolio(address: string): Promise<PortfolioResponse> {
    return this.fetch<PortfolioResponse>(`/portfolio?address=${address}`);
  }

  /**
   * Lookup a token's decimals from the cached registry.
   */
  async getTokenDecimals(symbol: string): Promise<number> {
    const tokens = await this.getTokens();
    const token = tokens.find((t) => t.symbol === symbol);
    if (!token) throw new Error(`Unknown token: ${symbol}`);
    return token.decimals;
  }

  /** Invalidate all caches. */
  clearCache(): void {
    this.tokenCache = null;
    this.priceCache = null;
  }
}
