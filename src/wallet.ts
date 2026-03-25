import * as crypto from "crypto";
import * as fs from "fs";

/**
 * Manages a Phantasma Ed25519 keypair for autonomous agent operation.
 * Supports generation, import/export, and encrypted storage.
 */
export class AgentWallet {
  private wif: string;
  private _address: string;

  private constructor(wif: string, address: string) {
    this.wif = wif;
    this._address = address;
  }

  /** Phantasma address (P2K...) */
  get address(): string {
    return this._address;
  }

  /**
   * Generate a new random wallet.
   * Requires phantasma-ts to be available at runtime.
   */
  static async generate(): Promise<AgentWallet> {
    const { PhantasmaKeys } = await import("phantasma-ts");
    const keys = PhantasmaKeys.generate();
    const wif = keys.toWIF();
    const address = keys.Address.Text;
    return new AgentWallet(wif, address);
  }

  /**
   * Import a wallet from a WIF (Wallet Import Format) private key.
   */
  static async fromWIF(wif: string): Promise<AgentWallet> {
    const { PhantasmaKeys } = await import("phantasma-ts");
    const keys = PhantasmaKeys.fromWIF(wif);
    const address = keys.Address.Text;
    return new AgentWallet(wif, address);
  }

  /**
   * Load a wallet from an encrypted file.
   * @param filePath Path to the encrypted wallet file
   * @param password Encryption password
   */
  static async loadEncrypted(
    filePath: string,
    password: string
  ): Promise<AgentWallet> {
    const data = fs.readFileSync(filePath);
    const salt = data.subarray(0, 16);
    const iv = data.subarray(16, 28);
    const tag = data.subarray(28, 44);
    const encrypted = data.subarray(44);

    const key = crypto.scryptSync(password, salt, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    const wif = decrypted.toString("utf8");
    return AgentWallet.fromWIF(wif);
  }

  /**
   * Save the wallet to an encrypted file using AES-256-GCM.
   * @param filePath Destination file path
   * @param password Encryption password
   */
  saveEncrypted(filePath: string, password: string): void {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(password, salt, 32);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(this.wif, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: salt(16) + iv(12) + tag(16) + ciphertext
    const output = Buffer.concat([salt, iv, tag, encrypted]);
    fs.writeFileSync(filePath, output, { mode: 0o600 });
  }

  /**
   * Get the WIF private key. Handle with extreme care.
   * Never log, transmit, or include in API calls.
   */
  getWIF(): string {
    return this.wif;
  }

  /**
   * Sign arbitrary data with this wallet's private key.
   * Returns hex-encoded signature.
   */
  async signData(hexData: string): Promise<string> {
    const { PhantasmaKeys } = await import("phantasma-ts");
    const keys = PhantasmaKeys.fromWIF(this.wif);
    const msgBytes = Uint8Array.from(
      hexData.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const sig = keys.Sign(msgBytes);
    return Buffer.from(sig.Bytes).toString("hex");
  }
}
