# Saturn Agent SDK

TypeScript SDK for AI agents to autonomously swap tokens on the [Phantasma](https://phantasma.info/) blockchain via the [Saturn DEX](https://www.saturnx.cc/) — no browser or PhantasmaLink required.

## What It Does

An AI agent can use this SDK to:

1. **Create a wallet** — generate an Ed25519 keypair (Phantasma-native) and store it encrypted on disk
2. **Discover tokens & prices** — query the Saturn API for available tokens, exchange rates, and liquidity pools
3. **Get swap quotes** — find the best route and expected output for any token pair
4. **Execute swaps** — build the transaction, sign it locally with the agent's private key, and broadcast it to the chain
5. **Confirm results** — poll the Phantasma RPC until the transaction is confirmed

All of this happens through a single high-level call:

```ts
import { AgentWallet, SaturnAgent, DEVNET_CONFIG } from "saturn-agent-sdk";

const wallet = await AgentWallet.generate();
const agent = new SaturnAgent(wallet, { network: DEVNET_CONFIG });

// One call does: quote → safety checks → build TX → sign → broadcast → confirm
const result = await agent.swap("SOUL", "KCAL", 10);
console.log(result.txHash, result.amountOut);
```

## Architecture

```
src/
  wallet.ts        — Ed25519 keypair generation, WIF import/export, AES-256-GCM encrypted storage
  client.ts        — Saturn API client (tokens, prices, pools, quotes, swaps, gas, portfolio, NFTs)
  signer.ts        — Takes unsigned TX from /swap, signs with phantasma-sdk-ts, serializes to hex
  broadcaster.ts   — Sends signed TX to Phantasma RPC, retries on failure, polls for confirmation
  safety.ts        — Pre-swap validation (price impact, fees, balance, gas reserve)
  agent.ts         — High-level orchestrator that wires everything together
  types.ts         — TypeScript interfaces matching the Saturn Alpha API spec
  index.ts         — Public exports
```

## Safety Rules

The SDK enforces safety checks before every swap:

| Rule | Default |
|---|---|
| Max price impact | 5% |
| Max cumulative fees | 3% |
| KCAL gas reserve | Always keep ≥1 KCAL for gas |
| Balance check | Verify sufficient token balance before building TX |
| No full-balance KCAL swaps | Prevents locking the wallet by spending all gas |
| Rate limiting | 120 requests/minute to the Saturn API |

All thresholds are configurable:

```ts
const agent = new SaturnAgent(wallet, {
  safety: { maxPriceImpact: 2, maxFeePercent: 1.5, minKcalReserve: 5 },
});
```

## Setup

```bash
npm install
npm run build
```

### Dependencies

| Package | Purpose |
|---|---|
| `phantasma-sdk-ts` | Ed25519 keypair, transaction signing, Phantasma RPC client |

## API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /tokens` | Token registry (symbol, decimals, metadata) |
| `GET /prices` | Current exchange rates in KCAL |
| `GET /pools` | Liquidity pool reserves |
| `GET /quote` | Swap quote with routing, fees, and price impact |
| `GET /gas` | Gas cost estimate per operation |
| `GET /swap` | Build unsigned swap transaction |
| `GET /portfolio` | Wallet balances (fungible + NFTs) |
| `GET /health` | API and chain connectivity status |

**Devnet:** `https://devnet.saturnx.cc/api/v1`
**Mainnet:** `https://www.saturnx.cc/api/v1`

## Testing

```bash
# Wallet generation + safety guards (no funding needed)
npx tsx test-devnet.ts

# Full swap against devnet (requires funded wallet)
AGENT_WIF=<your-wif> npx tsx test-devnet.ts --swap
```

## How a Swap Works

```
agent.swap("SOUL", "KCAL", 10)
  │
  ├─ 1. GET /quote        → best route, expected output, fees
  ├─ 2. GET /gas           → KCAL cost for this swap
  ├─ 3. GET /portfolio     → current wallet balances
  ├─ 4. Safety checks      → price impact, fees, balance, gas
  ├─ 5. GET /swap          → unsigned transaction script (hex)
  ├─ 6. Sign locally       → Ed25519 signature via phantasma-sdk-ts
  ├─ 7. RPC broadcast      → sendRawTransaction (retries 3x)
  └─ 8. Poll confirmation  → getTransaction until confirmed
```

## Key Details

- **Phantasma uses Ed25519** — not secp256k1 (Ethereum) or other curves
- **Amounts are in base units** — the API handles decimal conversion
- **Gas is paid in KCAL** — always ensure sufficient KCAL before swapping
- **The `/swap` endpoint does NOT execute** — it only builds the unsigned script; signing and broadcast happen client-side
- **Nexus names:** `"testnet"` on devnet, `"mainnet"` on production
