import {
  SafetyConfig,
  DEFAULT_SAFETY_CONFIG,
  QuoteResponse,
  GasEstimate,
  PortfolioResponse,
} from "./types";

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
   */
  validatePriceImpact(quote: QuoteResponse): void {
    if (quote.priceImpact > this.config.maxPriceImpact) {
      throw new SafetyError(
        "maxPriceImpact",
        `Price impact ${quote.priceImpact}% exceeds max ${this.config.maxPriceImpact}%`
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
    const balance = portfolio.balances.find((b) => b.symbol === tokenIn);
    const available = balance ? balance.amount : 0;

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
  validateGas(portfolio: PortfolioResponse, gasEstimate: GasEstimate): void {
    const kcalBalance =
      portfolio.balances.find((b) => b.symbol === "KCAL")?.amount ?? 0;
    const required = gasEstimate.estimatedKCAL + this.config.minKcalReserve;

    if (kcalBalance < required) {
      throw new SafetyError(
        "insufficientGas",
        `Insufficient KCAL for gas: have ${kcalBalance}, need ${required} (${gasEstimate.estimatedKCAL} gas + ${this.config.minKcalReserve} reserve)`
      );
    }
  }

  /**
   * Ensure we're not swapping the entire balance of a token,
   * leaving nothing for gas if the token is KCAL.
   */
  validateNotEntireBalance(
    portfolio: PortfolioResponse,
    tokenIn: string,
    amount: number
  ): void {
    if (tokenIn === "KCAL") {
      const kcalBalance =
        portfolio.balances.find((b) => b.symbol === "KCAL")?.amount ?? 0;
      if (amount >= kcalBalance) {
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
    gasEstimate: GasEstimate,
    portfolio: PortfolioResponse,
    tokenIn: string,
    amount: number
  ): void {
    this.validatePriceImpact(quote);
    this.validateFees(quote);
    this.validateBalance(portfolio, tokenIn, amount);
    this.validateGas(portfolio, gasEstimate);
    this.validateNotEntireBalance(portfolio, tokenIn, amount);
  }
}
