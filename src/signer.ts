import { NetworkConfig, SwapResponse } from "./types.js";

/**
 * Signs unsigned transactions returned by the Saturn /swap endpoint.
 * Uses phantasma-ts Transaction class and Ed25519 signing.
 */
export class TransactionSigner {
  private config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Sign a swap response and return a hex-encoded signed transaction.
   *
   * @param swapResponse The response from Saturn's GET /swap endpoint
   * @param wif The agent's WIF-encoded private key
   * @param expirationSeconds How long until the TX expires (default: 300)
   * @returns Hex-encoded signed transaction ready for broadcast
   */
  async sign(
    swapResponse: SwapResponse,
    wif: string,
    expirationSeconds = 300
  ): Promise<string> {
    const { Transaction } = await import("phantasma-sdk-ts");

    const { script } = swapResponse.transaction;

    const expiration = new Date(Date.now() + expirationSeconds * 1000);

    const tx = new Transaction(
      this.config.nexus, // "testnet" or "mainnet"
      "main", // chain
      script, // hex VM script from /swap
      expiration,
      "" // payload
    );

    // Gas is embedded in the script by Saturn's /swap endpoint
    // (AllowGas/SpendGas calls are already in the script hex)

    // Sign with Ed25519 via WIF
    tx.sign(wif);

    // Serialize to hex for broadcast
    return tx.ToStringEncoded(true);
  }
}
