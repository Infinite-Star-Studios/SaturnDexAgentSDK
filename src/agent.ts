import { AgentWallet } from "./wallet.js";
import { SaturnClient } from "./client.js";
import { TransactionSigner } from "./signer.js";
import { TransactionBroadcaster } from "./broadcaster.js";
import { SafetyGuard, SafetyError } from "./safety.js";
import {
  NetworkConfig,
  SafetyConfig,
  SwapResult,
  QuoteResponse,
  PortfolioResponse,
  TokenInfo,
  DEVNET_CONFIG,
} from "./types.js";

export interface AgentConfig {
  /** Network configuration (defaults to devnet) */
  network?: NetworkConfig;
  /** Safety thresholds (defaults apply if omitted) */
  safety?: Partial<SafetyConfig>;
  /** Max API requests per minute (default: 120) */
  maxRequestsPerMinute?: number;
}

/**
 * High-level orchestrator for AI agent token swaps.
 *
 * Usage:
 *   const agent = new SaturnAgent(wallet, { network: DEVNET_CONFIG });
 *   const result = await agent.swap("SOUL", "KCAL", 10);
 */
export class SaturnAgent {
  readonly wallet: AgentWallet;
  readonly client: SaturnClient;
  readonly signer: TransactionSigner;
  readonly broadcaster: TransactionBroadcaster;
  readonly safety: SafetyGuard;
  private config: NetworkConfig;

  constructor(wallet: AgentWallet, agentConfig: AgentConfig = {}) {
    const network = agentConfig.network ?? DEVNET_CONFIG;
    this.config = network;
    this.wallet = wallet;
    this.client = new SaturnClient(
      network,
      agentConfig.maxRequestsPerMinute ?? 120
    );
    this.signer = new TransactionSigner(network);
    this.broadcaster = new TransactionBroadcaster(network);
    this.safety = new SafetyGuard(agentConfig.safety);
  }

  /**
   * Get the agent wallet's current portfolio.
   */
  async getPortfolio(): Promise<PortfolioResponse> {
    return this.client.getPortfolio(this.wallet.address);
  }

  /**
   * Discover available tokens.
   */
  async getTokens(): Promise<TokenInfo[]> {
    return this.client.getTokens();
  }

  /**
   * Get a swap quote without executing.
   */
  async quote(
    tokenIn: string,
    tokenOut: string,
    amount: number
  ): Promise<QuoteResponse> {
    return this.client.getQuote(tokenIn, tokenOut, amount);
  }

  /**
   * Execute a full swap: quote -> safety checks -> build TX -> sign -> broadcast -> confirm.
   *
   * @param tokenIn Source token symbol (e.g. "SOUL")
   * @param tokenOut Destination token symbol (e.g. "KCAL")
   * @param amount Amount of tokenIn to swap (in human-readable units)
   * @param slippage Slippage tolerance percentage (uses safety default if omitted)
   * @returns Swap result with tx hash and confirmation status
   * @throws SafetyError if any safety check fails
   */
  async swap(
    tokenIn: string,
    tokenOut: string,
    amount: number,
    slippage?: number
  ): Promise<SwapResult> {
    const effectiveSlippage = slippage ?? this.safety.thresholds.defaultSlippage;

    // Step 1: Get quote
    const quoteResult = await this.client.getQuote(tokenIn, tokenOut, amount);

    // Step 2: Estimate gas
    const gasResponse = await this.client.getGasEstimate(
      "swap",
      quoteResult.quote.hops
    );

    // Step 3: Get portfolio for safety checks
    const portfolio = await this.getPortfolio();

    // Step 4: Run all safety checks (throws SafetyError on failure)
    this.safety.validateSwap(
      quoteResult,
      gasResponse,
      portfolio,
      tokenIn,
      amount
    );

    // Step 5: Build unsigned transaction
    const swapResponse = await this.client.getSwapTransaction(
      this.wallet.address,
      tokenIn,
      tokenOut,
      amount,
      effectiveSlippage
    );

    // Step 6: Sign
    const signedTxHex = await this.signer.sign(
      swapResponse,
      this.wallet.getWIF(),
      this.safety.thresholds.expirationSeconds
    );

    // Step 7: Broadcast and confirm
    const result = await this.broadcaster.broadcastAndConfirm(signedTxHex);

    return {
      txHash: result.txHash,
      tokenIn,
      tokenOut,
      amountIn: quoteResult.quote.amountIn,
      amountOut: quoteResult.quote.amountOut,
      status: result.status,
    };
  }
}
