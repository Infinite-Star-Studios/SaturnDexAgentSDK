import { NetworkConfig } from "./types";

/** Broadcast result with transaction hash and confirmation status. */
export interface BroadcastResult {
  txHash: string;
  status: "confirmed" | "failed" | "pending";
}

/**
 * Broadcasts signed transactions to the Phantasma blockchain
 * and polls for confirmation.
 */
export class TransactionBroadcaster {
  private config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Send a signed transaction to the Phantasma RPC.
   * Retries up to 3 times on network failure with exponential backoff.
   *
   * @param signedTxHex Hex-encoded signed transaction
   * @returns Transaction hash
   */
  async broadcast(signedTxHex: string): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { PhantasmaAPI } = await import("phantasma-sdk-ts");
        const api = new PhantasmaAPI(
          this.config.phantasmaRpcUrl,
          "",
          this.config.nexus
        );
        const txHash = await api.sendRawTransaction(signedTxHex);
        return txHash;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    throw new Error(
      `Broadcast failed after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Poll for transaction confirmation.
   * Checks every 3 seconds for up to maxWaitSeconds.
   *
   * @param txHash Transaction hash to poll
   * @param maxWaitSeconds Maximum time to wait (default: 60)
   * @returns Broadcast result with confirmation status
   */
  async waitForConfirmation(
    txHash: string,
    maxWaitSeconds = 60
  ): Promise<BroadcastResult> {
    const { PhantasmaAPI } = await import("phantasma-sdk-ts");
    const api = new PhantasmaAPI(
      this.config.phantasmaRpcUrl,
      "",
      this.config.nexus
    );

    const deadline = Date.now() + maxWaitSeconds * 1000;
    const pollInterval = 3000;

    while (Date.now() < deadline) {
      try {
        const tx = await api.getTransaction(txHash);
        if (tx) {
          return { txHash, status: "confirmed" };
        }
      } catch {
        // Transaction not yet indexed — keep polling
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    return { txHash, status: "pending" };
  }

  /**
   * Broadcast and wait for confirmation in one call.
   */
  async broadcastAndConfirm(
    signedTxHex: string,
    maxWaitSeconds = 60
  ): Promise<BroadcastResult> {
    const txHash = await this.broadcast(signedTxHex);
    return this.waitForConfirmation(txHash, maxWaitSeconds);
  }
}
