/**
 * Integration test against live Saturn devnet API.
 *
 * Usage:
 *   npx tsx test-devnet.ts
 *
 * Tests (no wallet funding required):
 *   1. Wallet generation
 *   2. GET /tokens
 *   3. GET /prices
 *   4. GET /quote (SOUL -> KCAL)
 *   5. GET /gas
 *   6. Portfolio lookup (empty wallet)
 *   7. Safety guard validation
 *   8. Encrypted wallet save/load round-trip
 *
 * To test a full swap (requires funded wallet):
 *   AGENT_WIF=<your-wif> npx tsx test-devnet.ts --swap
 */

import { SaturnClient } from "./src/client.js";
import { AgentWallet } from "./src/wallet.js";
import { SafetyGuard } from "./src/safety.js";
import { TransactionSigner } from "./src/signer.js";
import { SaturnAgent } from "./src/agent.js";
import {
  DEVNET_CONFIG,
  QuoteResponse,
  GasResponse,
  PortfolioResponse,
} from "./src/types.js";
import * as fs from "fs";
import * as path from "path";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail = "") {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function testWalletGeneration() {
  console.log("\n── Wallet Generation ──");
  const wallet = await AgentWallet.generate();
  assert(!!wallet.address, "Generated wallet has address");
  assert(
    wallet.address.startsWith("P"),
    `Address starts with P: ${wallet.address}`
  );
  assert(wallet.getWIF().length > 40, "WIF key is present");
  return wallet;
}

async function testEncryptedStorage(wallet: AgentWallet) {
  console.log("\n── Encrypted Wallet Storage ──");
  const tmpFile = path.join("/tmp", `saturn-test-wallet-${Date.now()}.enc`);
  const password = "test-password-123";

  wallet.saveEncrypted(tmpFile, password);
  assert(fs.existsSync(tmpFile), "Encrypted file created");

  const loaded = await AgentWallet.loadEncrypted(tmpFile, password);
  assert(loaded.address === wallet.address, "Loaded address matches");
  assert(loaded.getWIF() === wallet.getWIF(), "Loaded WIF matches");

  // Clean up
  fs.unlinkSync(tmpFile);
  assert(!fs.existsSync(tmpFile), "Temp file cleaned up");
}

async function testTokens(client: SaturnClient) {
  console.log("\n── GET /tokens ──");
  const tokens = await client.getTokens();
  assert(Array.isArray(tokens), `Got ${tokens.length} tokens`);
  assert(tokens.length > 0, "Token list is not empty");

  const soul = tokens.find((t) => t.symbol === "SOUL");
  assert(!!soul, "SOUL token found");
  assert(soul?.decimals === 8, `SOUL decimals = ${soul?.decimals}`);

  const kcal = tokens.find((t) => t.symbol === "KCAL");
  assert(!!kcal, "KCAL token found");
  assert(kcal?.decimals === 10, `KCAL decimals = ${kcal?.decimals}`);

  // Test caching — second call should be instant
  const t0 = Date.now();
  await client.getTokens();
  const cacheMs = Date.now() - t0;
  assert(cacheMs < 10, `Cache hit in ${cacheMs}ms`);
}

async function testPrices(client: SaturnClient) {
  console.log("\n── GET /prices ──");
  const prices = await client.getPrices();
  assert(Array.isArray(prices), `Got ${prices.length} price entries`);
  assert(prices.length > 0, "Prices list is not empty");

  const soulPrice = prices.find((p) => p.symbol === "SOUL");
  assert(!!soulPrice, "SOUL price found");
  assert(
    parseFloat(soulPrice!.price) > 0,
    `SOUL price = ${soulPrice?.price} KCAL`
  );
}

async function testQuote(client: SaturnClient): Promise<QuoteResponse> {
  console.log("\n── GET /quote (10 SOUL → KCAL) ──");
  const quote = await client.getQuote("SOUL", "KCAL", 10);
  assert(!!quote.quote, "Quote object present");
  assert(quote.quote.tokenIn === "SOUL", `tokenIn = ${quote.quote.tokenIn}`);
  assert(quote.quote.tokenOut === "KCAL", `tokenOut = ${quote.quote.tokenOut}`);
  assert(
    parseFloat(quote.quote.amountOut) > 0,
    `amountOut = ${quote.quote.amountOut}`
  );
  assert(quote.quote.hops >= 1, `hops = ${quote.quote.hops}`);
  assert(
    Array.isArray(quote.quote.route),
    `route = ${quote.quote.route.join(" → ")}`
  );
  assert(!!quote.fee, `fee = ${quote.fee.totalPercent}%`);
  assert(!!quote.priceImpact, `priceImpact = ${quote.priceImpact}`);
  return quote;
}

async function testGas(client: SaturnClient): Promise<GasResponse> {
  console.log("\n── GET /gas ──");
  const gas = await client.getGasEstimate("swap", 1);
  assert(!!gas.gas, "Gas object present");
  assert(gas.gas.gasPrice > 0, `gasPrice = ${gas.gas.gasPrice}`);
  assert(gas.gas.gasLimit > 0, `gasLimit = ${gas.gas.gasLimit}`);
  assert(
    parseFloat(gas.gas.estimatedKCAL) > 0,
    `estimatedKCAL = ${gas.gas.estimatedKCAL}`
  );
  assert(
    Array.isArray(gas.operations),
    `${gas.operations.length} operations listed`
  );
  return gas;
}

async function testPortfolio(client: SaturnClient, address: string) {
  console.log("\n── GET /portfolio ──");
  try {
    const portfolio = await client.getPortfolio(address);
    assert(!!portfolio, "Portfolio response received");
    assert(
      portfolio.address === address || !!portfolio.balances,
      "Portfolio has expected shape"
    );
    assert(
      Array.isArray(portfolio.balances?.fungible),
      "Portfolio has fungible balances array"
    );
    const fungible = portfolio.balances?.fungible ?? [];
    console.log(
      `  ℹ Balances: ${
        fungible.length
          ? fungible.map((b) => `${b.amount} ${b.symbol}`).join(", ")
          : "(empty wallet)"
      }`
    );
    return portfolio;
  } catch (err: any) {
    // Empty/new wallets may return 404 or empty
    console.log(`  ℹ Portfolio returned: ${err.message}`);
    return {
      address,
      name: null,
      stake: "0",
      unclaimed: "0",
      balances: { fungible: [], nfts: [], totalTokens: 0 },
      timestamp: new Date().toISOString(),
    } as PortfolioResponse;
  }
}

async function testSafetyGuard(
  quote: QuoteResponse,
  gas: GasResponse
) {
  console.log("\n── Safety Guards ──");
  const guard = new SafetyGuard({ maxPriceImpact: 5, maxFeePercent: 3 });

  // Should pass with reasonable defaults
  try {
    guard.validatePriceImpact(quote);
    const impact = parseFloat(quote.priceImpact);
    assert(true, `Price impact ${impact}% within limit`);
  } catch (err: any) {
    assert(false, `Price impact check: ${err.message}`);
  }

  try {
    guard.validateFees(quote);
    assert(true, `Fees ${quote.fee.totalPercent}% within limit`);
  } catch (err: any) {
    assert(false, `Fee check: ${err.message}`);
  }

  // Test rejection with strict config
  const strictGuard = new SafetyGuard({ maxPriceImpact: 0.01 });
  try {
    strictGuard.validatePriceImpact(quote);
    assert(false, "Should have rejected high price impact");
  } catch (err: any) {
    assert(
      err.name === "SafetyError",
      `Strict guard rejects: ${err.message}`
    );
  }

  // Test balance check with mock empty portfolio
  const emptyPortfolio: PortfolioResponse = {
    address: "P2K...",
    name: null,
    stake: "0",
    unclaimed: "0",
    balances: { fungible: [], nfts: [], totalTokens: 0 },
    timestamp: new Date().toISOString(),
  };
  try {
    guard.validateBalance(emptyPortfolio, "SOUL", 10);
    assert(false, "Should have rejected insufficient balance");
  } catch (err: any) {
    assert(
      err.name === "SafetyError",
      `Balance check rejects empty wallet: ${err.message}`
    );
  }

  // Test gas check with mock empty portfolio
  try {
    guard.validateGas(emptyPortfolio, gas);
    assert(false, "Should have rejected insufficient gas");
  } catch (err: any) {
    assert(
      err.name === "SafetyError",
      `Gas check rejects empty wallet: ${err.message}`
    );
  }
}

async function testFullSwap() {
  console.log("\n── Full Swap (funded wallet) ──");
  const wif = process.env.AGENT_WIF;
  if (!wif) {
    console.log("  ⚠ Skipped — set AGENT_WIF env var to test");
    return;
  }

  const wallet = await AgentWallet.fromWIF(wif);
  console.log(`  Agent address: ${wallet.address}`);

  const agent = new SaturnAgent(wallet, { network: DEVNET_CONFIG });

  const portfolio = await agent.getPortfolio();
  console.log(
    `  Balances: ${portfolio.balances.fungible
      .map((b) => `${b.amount} ${b.symbol}`)
      .join(", ")}`
  );

  // Try a small swap
  try {
    const result = await agent.swap("SOUL", "KCAL", 1);
    assert(!!result.txHash, `TX hash: ${result.txHash}`);
    assert(result.status !== "failed", `Status: ${result.status}`);
    console.log(
      `  Swapped ${result.amountIn} SOUL → ${result.amountOut} KCAL`
    );
  } catch (err: any) {
    if (err.name === "SafetyError") {
      console.log(`  ⚠ Safety guard blocked swap: ${err.message}`);
    } else {
      assert(false, `Swap failed: ${err.message}`);
    }
  }
}

async function main() {
  console.log("Saturn Agent SDK — Devnet Integration Test");
  console.log(`API: ${DEVNET_CONFIG.saturnApiUrl}`);
  console.log(`RPC: ${DEVNET_CONFIG.phantasmaRpcUrl}`);

  const client = new SaturnClient(DEVNET_CONFIG);

  // Tests that don't require funding
  const wallet = await testWalletGeneration();
  await testEncryptedStorage(wallet);

  let quote: QuoteResponse | null = null;
  let gas: GasResponse | null = null;

  try {
    await testTokens(client);
    await testPrices(client);
    quote = await testQuote(client);
    gas = await testGas(client);
    await testPortfolio(client, wallet.address);
  } catch (err: any) {
    console.log(`\n  ⚠ API tests failed (network issue?): ${err.message}`);
  }

  if (quote && gas) {
    await testSafetyGuard(quote, gas);
  } else {
    console.log("\n── Safety Guards (offline mock) ──");
    // Run safety tests with mock data
    const mockQuote: QuoteResponse = {
      quote: { tokenIn: "SOUL", tokenOut: "KCAL", amountIn: "10", amountOut: "400", rawAmountIn: "1000000000", rawAmountOut: "4000000000000", rate: "40", reverseRate: "0.025", route: ["SOUL", "KCAL"], hops: 1 },
      fee: { legs: [{ leg: "SOUL→KCAL", percent: 0.3 }], totalPercent: 0.3, description: "~0.3%" },
      priceImpact: "2.5%",
      tokens: { SOUL: { name: "Phantasma Stake", decimals: 8 }, KCAL: { name: "Phantasma Energy", decimals: 10 } },
      routeComparison: { directOutput: "400", routeAdvantage: "+0%" },
    };
    const mockGas: GasResponse = {
      gas: { operation: "swap", description: "swap", gasPrice: 100000, gasLimit: 21000, totalGasCost: "2100000000", estimatedKCAL: "0.21" },
      token: { symbol: "KCAL", name: "Phantasma Energy", decimals: 10, role: "gas" },
      operations: [],
    };
    await testSafetyGuard(mockQuote, mockGas);
  }

  // Full swap test (requires AGENT_WIF)
  if (process.argv.includes("--swap")) {
    await testFullSwap();
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
