import {
  SafetyConfig,
  DEFAULT_SAFETY_CONFIG,
  QuoteResponse,
  GasResponse,
  PortfolioResponse,
} from "./types.js";

/** Validation error with a human-readable reason. */
export class SafetyError extends Error {
  constructor(
    public readonly rule: string,
    message: string
  ) {
    super(message);
    this.name = "SafetyError";
  }
}

/**
 * Enforces safety rules before executing swaps.
 * All checks throw SafetyError on violation.
 */
export class SafetyGuard {
  private config: SafetyConfig;

  constructor(config: Partial<SafetyConfig> = {}) {
    this.config = { ...DEFAULT_SAFETY_CONFIG, ...config };
  }

  /** Current safety thresholds (read-only copy). */
  get thresholds(): SafetyConfig {
    return { ...this.config };
  }

  /**
   * Check that price impact is within acceptable bounds.
   * priceImpact comes as "3.3986%" from the API.
   */
  validatePriceImpact(quote: QuoteResponse): void {
    const impact = parseFloat(quote.priceImpact);
    if (isNaN(impact)) return;
    if (impact > this.config.maxPriceImpact) {
      throw new SafetyError(
        "maxPriceImpact",
        `Price impact ${impact}% exceeds max ${this.config.maxPriceImpact}%`
      );
    }
  }

  /**
   * Check that total fees are within acceptable bounds.
   */
  validateFees(quote: QuoteResponse): void {
    if (quote.fee.totalPercent > this.config.maxFeePercent) {
      throw new SafetyError(
        "maxFeePercent",
        `Total fee ${quote.fee.totalPercent}% exceeds max ${this.config.maxFeePercent}%`
      );
    }
  }

  /**
   * Check that the wallet has sufficient balance for the swap amount.
   */
  validateBalance(
    portfolio: PortfolioResponse,
    tokenIn: string,
    amount: number
  ): void {
    const balance = portfolio.balances.fungible.find((b) => b.symbol === tokenIn);
    const available = balance ? parseFloat(balance.amount) : 0;

    if (available < amount) {
      throw new SafetyError(
        "insufficientBalance",
        `Insufficient ${tokenIn} balance: have ${available}, need ${amount}`
      );
    }
  }

  /**
   * Check that the wallet has enough KCAL to cover gas,
   * accounting for the KCAL reserve.
   */
  validateGas(portfolio: PortfolioResponse, gasResponse: GasResponse): void {
    const kcalBalance = portfolio.balances.fungible.find((b) => b.symbol === "KCAL");
    const available = kcalBalance ? parseFloat(kcalBalance.amount) : 0;
    const estimatedGas = parseFloat(gasResponse.gas.estimatedKCAL);
    const required = estimatedGas + this.config.minKcalReserve;

    if (available < required) {
      throw new SafetyError(
        "insufficientGas",
        `Insufficient KCAL for gas: have ${available}, need ${required} (${estimatedGas} gas + ${this.config.minKcalReserve} reserve)`
      );
    }
  }

  /**
   * Ensure we're not swapping the entire KCAL balance,
   * leaving nothing for gas.
   */
  validateNotEntireBalance(
    portfolio: PortfolioResponse,
    tokenIn: string,
    amount: number
  ): void {
    if (tokenIn === "KCAL") {
      const kcalBalance = portfolio.balances.fungible.find((b) => b.symbol === "KCAL");
      const available = kcalBalance ? parseFloat(kcalBalance.amount) : 0;
      if (amount >= available) {
        throw new SafetyError(
          "entireKcalBalance",
          `Cannot swap entire KCAL balance — must reserve KCAL for gas`
        );
      }
    }
  }

  /**
   * Run all safety checks for a swap.
   */
  validateSwap(
    quote: QuoteResponse,
    gasResponse: GasResponse,
    portfolio: PortfolioResponse,
    tokenIn: string,
    amount: number
  ): void {
    this.validatePriceImpact(quote);
    this.validateFees(quote);
    this.validateBalance(portfolio, tokenIn, amount);
    this.validateGas(portfolio, gasResponse);
    this.validateNotEntireBalance(portfolio, tokenIn, amount);
  }
}
