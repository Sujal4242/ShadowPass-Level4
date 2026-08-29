# ShadowPass — Architecture Blueprint

> Produced 2026-08-19. Based on deep inspection of both reference projects.
> This document is the authoritative design before any code is written.

---

## A. Flash Loan Architecture (Primary Reference)

The Simple Flash Loan Demo at `/mnt/c/Users/Sujal/OneDrive/Desktop/Simple Flash Loan Demo` is a **proven browser-based** Midnight DApp.

### Architecture Summary

```
Browser
  │
  ├── React 19 + Vite 6 (frontend/)
  │     ├── Compiled contract JS module (bundled)
  │     ├── ZK assets served from public/midnight/ (static)
  │     ├── InMemoryPrivateStateProvider (nothing persisted)
  │     └── Contract service (findDeployedContract + callTx)
  │
  ├── Midnight Browser Wallet (window.midnight)
  │     ├── wallet.connect(networkId) → ConnectedAPI
  │     ├── connectedAPI.getConfiguration() → { indexerUri, indexerWsUri, proverServerUri }
  │     ├── connectedAPI.getShieldedAddresses() → { shieldedCoinPublicKey, shieldedEncryptionPublicKey }
  │     ├── connectedAPI.balanceUnsealedTransaction(hexTx) → { tx: hexFinalizedTx }
  │     └── connectedAPI.submitTransaction(hexTx) → void
  │
  └── 7 Midnight.js Providers (assembled from wallet)
        ├── privateStateProvider  → InMemoryPrivateStateProvider
        ├── publicDataProvider    → indexerPublicDataProvider(indexerUrl, indexerWsUrl)
        ├── zkConfigProvider      → FetchZkConfigProvider(ZK_ASSETS_BASE, fetch)
        ├── proofProvider         → httpClientProofProvider(proofServerUrl, zkConfigProvider)
        ├── walletProvider        → { getCoinPublicKey, getEncryptionPublicKey, balanceTx }
        └── midnightProvider      → { submitTx }
```

### Key Insight: No Witnesses Pattern for Simple Circuits

The Flash Loan contract has 3 witnesses (`getTrade`, `getOperatorSecret`, `divMod`) bound via `CompiledContract.withWitnesses(...)`. But for a circuit like `proveMembership(memberId, salt)` that has **no witnesses** and only explicit `Bytes<32>` arguments, the binding is simpler — the arguments are passed directly to `callTx.proveMembership(memberId, salt)`.

### How Proof Server Works in the Browser

1. The browser wallet advertises `config.proverServerUri` via `connectedAPI.getConfiguration()`
2. `httpClientProofProvider(proofServerUrl, zkConfigProvider)` sends proof requests to that URL
3. The proof server is either:
   - Run locally via Docker (`midnightntwrk/proof-server:8.1.0` on port 6300)
   - Provided by the wallet itself (some wallets bundle proving capability)
4. **The frontend does NOT generate proofs in-process** — it delegates to the proof server

### How ZK Assets Are Served

- `.bzkir`, `.prover`, `.verifier` files are copied to `frontend/public/midnight/<contract>/`
- `FetchZkConfigProvider` fetches them over HTTP at runtime from `${window.location.origin}/midnight/<contract>/`
- This is the **only** "backend" needed — static file serving (Vite dev server or Netlify)

---

## B. Old ShadowPass Architecture

### Architecture Summary

```
Browser (React 18 + Vite 6)
  │
  ├── WalletButton (DApp Connector — display only)
  │     └── useMidnightWallet → window.midnight → wallet.connect()
  │
  └── Pages (Home, Enroll, Verify, Privacy, Dashboard, About)
        └── api.ts → REST + NDJSON streaming to backend

Backend (Node.js HTTP server, port 3001)
  │
  ├── MIDNIGHT_SEED → HDWallet → ShieldedWallet → UnshieldedWallet → DustWallet
  │     └── Server-side wallet handles ALL on-chain operations
  │
  ├── Contract interaction
  │     ├── findDeployedContract (or deployContract if needed)
  │     └── deployed.callTx.proveMembership(memberId, salt)
  │
  ├── ZK proof generation
  │     └── httpClientProofProvider (Docker proof-server:8.1.0)
  │
  ├── Deployment persistence
  │     └── .midnight-state/preprod/shadowpass-deployment.json
  │
  └── Routes
        ├── POST /api/verify (NDJSON streaming)
        ├── POST /api/commitment (Pedersen commitment)
        ├── GET /api/contract-state
        ├── GET /api/sync-status
        └── GET /api/health
```

### Critical Observation: Server-Owns-Everything

The browser wallet is **cosmetic**. It is only used for display (address, balance, network). All real operations happen server-side:

- Server creates its own wallet from `MIDNIGHT_SEED`
- Server syncs that wallet (can take hours on Preprod)
- Server deploys contracts using its own wallet
- Server generates ZK proofs
- Server submits transactions using its own wallet
- Server computes Pedersen commitments

The browser never touches the blockchain.

---

## C. Exact Mistakes from Old ShadowPass

| # | Mistake | Impact | Solution |
|---|---------|--------|-------------|
| 1 | Backend dependency | Cannot deploy to Netlify as static site | Frontend-only architecture |
| 2 | Server-owned Midnight wallet | Single point of failure, wallet sync | Browser wallet owns all operations |
| 3 | MIDNIGHT_SEED architecture | Secrets on server, security risk | No server, no seed needed |
| 4 | Server-side wallet synchronization | 3+ hour initial sync on Preprod | Wallet connects instantly via DApp Connector |
| 5 | 3+ hour Preprod wallet sync | Evaluator cannot demo in reasonable time | Zero sync — wallet API is instant |
| 6 | Server-side proof flow | Browser cannot do anything independently | Browser delegates to wallet's proof server |
| 7 | Automatic deployment on first verification | Unexpected contract creation per evaluator | ONE fixed contract, deployed once by developer |
| 8 | Redeployment after server restart | Contract address changes | Contract address hardcoded in frontend config |
| 9 | Deployment state only in memory | Lost on crash, no persistence | Contract address in VITE_ config (immutable) |
| 10 | Difficulty making a true public demo | Must run backend locally | Netlify static deployment, zero backend |
| 11 | Frontend depending on localhost backend | Cannot demo publicly | Frontend connects directly to Midnight |
| 12 | Putting secrets into VITE_ variables | Vars visible in browser bundle | Only public data in VITE_ vars |
| 13 | Assuming free backend hosting = static hosting | Backend hosting costs money/complexity | Truly static — Netlify free tier |
| 14 | Overcomplicated authentication | Unnecessary complexity | No auth needed — ZK proof IS the authentication |
| 15 | Unnecessary database/backend dependencies | Extra failure points | Zero dependencies beyond frontend |
| 16 | Building too many features before core | Wasted time on profiles, admin panels | Core flow first: connect → verify → grant |
| 17 | Testing production architecture too late | Discovered sync issues during demo | Test dApp architecture from day 1 |
| 18 | Leaving deployment evidence until the end | Missing submission materials | Capture evidence as each milestone completes |
| 19 | Coupling membership identity to operator wallet | All verifications from same address | Membership identity is independent of wallet |
| 20 | Assuming evaluator must use developer wallet | evaluator cannot demo independently | Any wallet can verify with valid credentials |

---

## D. ShadowPass dApp Architecture

### Target Architecture

```
User Browser
  │
  ├── Netlify (static hosting)
  │     └── Vite build output (HTML + JS + CSS + WASM + ZK assets)
  │
  ├── React 19 + Vite 6 (ShadowPass dApp)
  │     ├── Compiled contract JS module (bundled)
  │     ├── ZK assets in public/midnight/shadowpass/ (static)
  │     ├── InMemoryPrivateStateProvider (browser-only)
  │     ├── Contract service (findDeployedContract + callTx)
  │     ├── Pedersen commitment computation (compact-runtime)
  │     └── Config: VITE_CONTRACT_ADDRESS, VITE_NETWORK_ID, etc.
  │
  ├── Midnight Browser Wallet (window.midnight — Lace or 1AM)
  │     ├── wallet.connect("preprod") → ConnectedAPI
  │     ├── ConnectedAPI.getConfiguration()
  │     │     ├── .indexerUri     → https://indexer.preprod.midnight.network/...
  │     │     ├── .indexerWsUri   → wss://indexer.preprod.midnight.network/...
  │     │     └── .proverServerUri → ???
  │     ├── ConnectedAPI.getShieldedAddresses()
  │     ├── ConnectedAPI.balanceUnsealedTransaction(hexTx)
  │     └── ConnectedAPI.submitTransaction(hexTx)
  │
  ├── Midnight Preprod Network
  │     ├── Indexer (read contract state)
  │     ├── Node (submit transactions)
  │     └── Proof server (generate ZK proofs)
  │
  └── ONE ShadowPass Contract (deployed once)
        ├── allowlist: Vector<8, Bytes<32>> (8 Pedersen commitments)
        └── accessCount: Field (verification counter)
```

### Data Flow: Verify Membership

```
1. User opens Netlify URL
2. User clicks "Connect Midnight Wallet"
3. Browser discovers wallets via window.midnight
4. User selects wallet (e.g., Lace)
5. wallet.connect("preprod") → ConnectedAPI
6. Browser assembles 7 providers from ConnectedAPI
7. Browser loads compiled contract + connects via findDeployedContract
8. User enters memberId (hex) and salt (hex)
9. Browser calls deployed.callTx.proveMembership(memberIdBytes, saltBytes)
10. SDK builds transaction, encounters private inputs
11. SDK sends proof request to proof provider (wallet's proof server)
12. Proof server generates Groth16 ZK proof
13. SDK balances + signs transaction via connectedAPI.balanceUnsealedTransaction
14. SDK submits transaction via connectedAPI.submitTransaction
15. Transaction confirmed on-chain
16. accessCount increments
17. Browser reads updated ledger → shows "ACCESS GRANTED"
```

---

## E. Browser Wallet Flow (DApp Connector API)

### Discovery

```typescript
// Wallets inject themselves into window.midnight
const midnight = (window as any).midnight;
// Returns: { mnLace: InitialAPI, 1am: InitialAPI, ... }
```

### Connection

```typescript
const connectedAPI = await wallet.connect("preprod");
// Returns ConnectedAPI with methods:
//   .getConfiguration()
//   .getShieldedAddresses()
//   .getUnshieldedAddress()
//   .getUnshieldedBalances()
//   .balanceUnsealedTransaction(hexTx)
//   .submitTransaction(hexTx)
//   .getConnectionStatus()
```

### Provider Assembly (from Flash Loan)

```typescript
const config = await connectedAPI.getConfiguration();
const shielded = await connectedAPI.getShieldedAddresses();

// 7 providers:
const providers = {
  privateStateProvider: new InMemoryPrivateStateProvider(),
  publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
  zkConfigProvider: new FetchZkConfigProvider(zkAssetsBase, fetch),
  proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
  walletProvider: {
    getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
    getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
    balanceTx: async (tx) => {
      const hex = uint8ArrayToHex(tx.serialize());
      const result = await connectedAPI.balanceUnsealedTransaction(hex);
      return Transaction.deserialize('signature', 'proof', 'binding', hexToUint8Array(result.tx));
    },
  },
  midnightProvider: {
    submitTx: async (tx) => {
      const hex = uint8ArrayToHex(tx.serialize());
      await connectedAPI.submitTransaction(hex);
      return tx.identifiers()[0];
    },
  },
};
```

### Contract Connection

```typescript
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { Contract, ledger } from './compiled-contract';

const compiledContract = CompiledContract.make('shadowpass', Contract)
  .pipe(CompiledContract.withVacantWitnesses);  // No witnesses needed!

const deployed = await findDeployedContract(providers, {
  compiledContract,
  contractAddress: VITE_CONTRACT_ADDRESS,
  privateStateId: 'shadowpassPrivateState',
  initialPrivateState: {},
});
```

### Transaction Execution

```typescript
// memberId and salt are Bytes<32> arguments, NOT witnesses
const memberIdBytes = hexToUint8Array(memberIdHex);  // 32 bytes
const saltBytes = hexToUint8Array(saltHex);           // 32 bytes

const tx = await deployed.callTx.proveMembership(memberIdBytes, saltBytes);
// tx.public.status === SucceedEntirely → ACCESS GRANTED
// tx.public.status !== SucceedEntirely → ACCESS DENIED
```

---

## F. Proof Generation Flow

### In the Browser

1. `deployed.callTx.proveMembership(memberId, salt)` is called
2. The Midnight.js SDK internally:
   - Executes the circuit with the given arguments
   - Encounters the `persistentCommit` computation inside the circuit
   - Builds a proof request containing the circuit + inputs
   - Sends the proof request to `proofProvider` (the HTTP proof server)
3. The proof server generates a Groth16 proof
4. The SDK receives the proof and attaches it to the transaction
5. The SDK calls `walletProvider.balanceTx()` to balance and sign
6. The SDK calls `midnightProvider.submitTx()` to submit

### Proof Server Sources

The proof server URL comes from (in priority order):
1. `connectedAPI.getConfiguration().proverServerUri` — wallet advertises it
2. `VITE_PROOF_SERVER_URL` fallback — configurable in frontend `.env`

**Critical question: Does the wallet provide a proof server?**

The Flash Loan demo works on `preview` network with `config.proverServerUri`. This suggests the wallet (1AM/Lace) either:
- Bundles a proof server
- Connects to a hosted proof server
- Advertises a localhost proof server (requires Docker)

**This must be verified during implementation.** If the wallet does not provide a proof server URL, we need to document that the evaluator must run `docker compose up proof-server` locally.

### ZK Asset Flow

```
Compiled artifacts (contracts/managed/shadowpass/)
  │
  ├── contract/index.js    → copied to frontend/src/compiled-contract.js
  ├── contract/index.d.ts  → copied to frontend/src/compiled-contract.d.ts
  ├── zkir/proveMembership.bzkir → copied to frontend/public/midnight/shadowpass/zkir/
  ├── keys/proveMembership.prover → copied to frontend/public/midnight/shadowpass/keys/
  └── keys/proveMembership.verifier → copied to frontend/public/midnight/shadowpass/keys/

At runtime:
  FetchZkConfigProvider fetches from ${window.location.origin}/midnight/shadowpass/
```

---

## G. Transaction Flow

### Unsigned → Signed → Submitted

```
callTx.proveMembership(memberId, salt)
  │
  ├── 1. Execute circuit (compact-runtime)
  │     └── persistentCommit(memberId, salt) computed inside ZK
  │
  ├── 2. Generate ZK proof
  │     └── proofProvider.sendProofRequest(circuit + inputs)
  │         └── HTTP POST to proof server
  │             └── Returns Groth16 proof artifact
  │
  ├── 3. Build transaction
  │     └── Attach proof to transaction body
  │
  ├── 4. Balance + Sign
  │     └── walletProvider.balanceTx(unboundTx)
  │         └── connectedAPI.balanceUnsealedTransaction(hexTx)
  │             └── Wallet adds inputs/outputs, signs
  │
  └── 5. Submit
        └── midnightProvider.submitTx(finalizedTx)
            └── connectedAPI.submitTransaction(hexTx)
                └── Sent to Midnight node → indexer → confirmed
```

---

## H. Contract Architecture

### Compact Contract (ShadowPass — same bytecode as Old ShadowPass)

```compact
pragma language_version >= 0.23;
import CompactStandardLibrary;

export ledger allowlist: Vector<8, Bytes<32>>;
export ledger accessCount: Field;

constructor(members: Vector<8, Bytes<32>>) {
  allowlist = disclose(members);
}

export circuit proveMembership(memberId: Bytes<32>, salt: Bytes<32>): [] {
  const claim = persistentCommit<Bytes<32>>(memberId, salt);
  assert(
    (claim == allowlist[0]) ||
    (claim == allowlist[1]) ||
    (claim == allowlist[2]) ||
    (claim == allowlist[3]) ||
    (claim == allowlist[4]) ||
    (claim == allowlist[5]) ||
    (claim == allowlist[6]) ||
    (claim == allowlist[7]),
    "Not an authorized member"
  );
  accessCount = accessCount + 1;
}
```

### Why This Contract Is Ideal for ShadowPass

1. **No witnesses** — `proveMembership` takes explicit arguments, no mutable state binding needed
2. **Clean privacy model** — Pedersen commitment, not wallet address
3. **Simple state** — 8-slot allowlist + counter
4. **Already compiled** — compiler version 0.31.1, runtime 0.16.0
5. **Proven on-chain** — already deployed on Preprod
6. **Frontend-compatible** — no Node.js-only APIs required

### Compiled Contract in Browser

The compiled contract (`contract/index.js`) exports:
- `Contract` class — constructor and circuit definitions
- `ledger(stateValue)` — decoder for the public ledger
- `pureCircuits` — empty (no pure circuits in this contract)

The browser imports these and uses them with `CompiledContract.make('shadowpass', Contract)`.

---

## I. Membership Identity vs Wallet Identity

### Two Completely Separate Identity Systems

| Aspect | Membership Identity | Wallet Identity |
|--------|-------------------|-----------------|
| **What it is** | `memberId: Bytes<32>` + `salt: Bytes<32>` | Midnight wallet address |
| **How it's created** | Generated by crypto.getRandomValues() | Derived from wallet seed by DApp Connector |
| **Where it lives** | User's local notes / clipboard | Browser wallet |
| **On-chain representation** | Pedersen commitment (allowlist slot) | Transaction sender address |
| **Privacy** | Hidden inside ZK proof | Public on ledger |
| **Purpose** | Prove "I am authorized" | Sign and submit the transaction |
| **Who controls it** | The member (whoever holds the credentials) | The wallet owner |
| **Relationship** | Independent — any wallet can prove any membership | Independent — wallet address ≠ membership |

### Conceptual Flow

```
User's wallet (any Midnight wallet)
  │
  ├── Transaction signer (public, on-chain)
  │
  ├── Pays transaction fees (DUST/tNight)
  │
  └── Submits proveMembership(memberId, salt)
        │
        ├── memberId + salt → private (never on-chain)
        │
        ├── persistentCommit(memberId, salt) → commitment
        │
        ├── ZK proof proves: commitment ∈ allowlist
        │
        └── Result: accessCount + 1 (no identity revealed)
```

### Critical Invariant

**The wallet address that submits the transaction is NEVER the membership identity.**

A user with wallet address `mn_addr_abc...` can prove membership for `memberId=0x1234...` (if they have the correct salt). A different user with wallet address `mn_addr_xyz...` can prove the SAME membership with the SAME credentials. On-chain, these two transactions are indistinguishable.

---

## J. One-Time Deployment Strategy

### Deployment Model

```
Developer (one-time setup)
  │
  ├── 1. Compile: compact compile contracts/shadowpass.compact
  ├── 2. Generate demo credential:
  │     memberId = 0x<32 random bytes>
  │     salt     = 0x<32 random bytes>
  │     commitment = persistentCommit(memberId, salt)
  ├── 3. Build allowlist:
  │     [commitment, random32, random32, ..., random32]  (8 slots)
  ├── 4. Deploy contract with allowlist (via deploy script)
  ├── 5. Record contract address
  └── 6. Configure frontend: VITE_CONTRACT_ADDRESS=<address>

Evaluator (normal usage)
  │
  ├── 1. Open Netlify URL
  ├── 2. Connect Midnight wallet
  ├── 3. Enter demo credential (documented in README/UI)
  ├── 4. Generate proof
  ├── 5. Submit transaction
  └── 6. ACCESS GRANTED (accessCount increments)
```

### Deployment Script (Developer Only)

A standalone Node.js script (NOT part of the frontend):
- Creates a wallet from a dev seed
- Syncs with Preprod (one-time, slow)
- Deploys the contract with the allowlist
- Records the contract address
- Outputs deployment evidence for DEPLOYMENT.md

### What the Frontend NEVER Does

- Never deploys a contract
- Never creates a wallet
- Never syncs a wallet
- Never exposes MIDNIGHT_SEED
- Never runs deployment logic

### If Contract Cannot Be Found

The frontend shows: "ShadowPass contract unavailable on this network."

It does NOT:
- Auto-deploy
- Prompt to deploy
- Offer a deploy button
- Fall back to a different contract

---

## K. Existing Contract Compatibility

### Contract: `983d941f4b05a870fe419229397dfa4adbeec55deaf266fd9e31398f74a6b732`

**Is it compatible with ShadowPass?**

| Requirement | Compatible? | Notes |
|-------------|-------------|-------|
| Frontend-only architecture | ✅ | Contract has no witnesses, no server dependency |
| Browser wallet interaction | ✅ | `callTx.proveMembership(memberId, salt)` works with browser wallet |
| ZK proof generation | ✅ | Proof server provides Groth16 proving |
| Privacy model | ✅ | Pedersen commitment, membership ≠ wallet identity |
| Multiple wallets | ✅ | Any wallet can call `proveMembership` with valid credentials |
| No backend | ✅ | Contract interaction is purely client-side SDK |
| Browser-compatible SDK | ✅ | `compact-js`, `midnight-js-contracts` work in browser |
| Preprod deployment | ✅ | Already deployed on Preprod |

### Decision: REUSE Existing Contract

The existing contract is fully compatible. No new contract needed.

### What We Need to Reuse It

1. **Compiled artifacts** — `contracts/managed/shadowpass/` directory
   - Already exists in old ShadowPass
   - Copy to ShadowPass or recompile from source

2. **Demo credential** — `(memberId, salt)` for one allowlist slot
   - Must be discovered from the old deployment
   - Or: deploy a NEW contract with known credentials (simpler, recommended)

3. **Contract address** — `983d941f4b05a870fe419229397dfa4adbeec55deaf266fd9e31398f74a6b732`
   - Hardcoded in `VITE_CONTRACT_ADDRESS`

### Recommended Approach: Deploy New Contract

The existing contract was deployed by the server's wallet with auto-generated credentials. We don't have the raw `(memberId, salt)` for any slot.

**Deploy a new ShadowPass contract** with:
- 1 known demo credential (we control the `(memberId, salt)`)
- 7 random filler commitments
- Hardcoded address in frontend

This costs 0 real money (faucet tokens only) and is a one-time operation.

---

## L. Netlify Deployment Architecture

### Build Pipeline

```
Netlify Build
  │
  ├── 1. npm install (root — compact compiler + SDK)
  ├── 2. npm run compile (compact compile .compact → managed/)
  ├── 3. npm run copy-zk-assets (copy to frontend/)
  ├── 4. cd frontend && npm install
  ├── 5. cd frontend && npm run build (vite build)
  └── 6. Publish frontend/dist/
```

### Netlify Configuration

```toml
[build]
  command = "npm install && npm run compile && cd frontend && npm install && npm run build"
  publish = "frontend/dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### What Netlify Hosts

- `index.html` — SPA entry
- `assets/*.js` — React + Vite bundle
- `assets/*.css` — Styles
- `midnight/shadowpass/zkir/*.bzkir` — ZK IR files
- `midnight/shadowpass/keys/*.prover` — Prover keys
- `midnight/shadowpass/keys/*.verifier` — Verifier keys
- `assets/*.wasm` — Ledger + onchain runtime WASM

### What Netlify Does NOT Host

- No backend server
- No API endpoints
- No wallet seed
- No private state
- No database
- No proof server

### Required Environment Variables (Build-Time Only)

```
VITE_CONTRACT_ADDRESS=<hex contract address>
VITE_NETWORK_ID=preprod
VITE_INDEXER_URL=https://indexer.preprod.midnight.network/api/v4/graphql
VITE_INDEXER_WS_URL=wss://indexer.preprod.midnight.network/api/v4/graphql/ws
```

All VITE_ variables are public. No secrets.

---

## M. Required Packages

### Frontend (frontend/package.json)

Based on Flash Loan's proven browser-compatible set:

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | `^19.1.0` | UI framework |
| `react-dom` | `^19.1.0` | DOM rendering |
| `@midnight-ntwrk/compact-js` | `2.5.1` | Compiled contract runtime |
| `@midnight-ntwrk/compact-runtime` | `0.16.0` | Pedersen commitment, circuit execution |
| `@midnight-ntwrk/dapp-connector-api` | `4.0.1` | Browser wallet API types |
| `@midnight-ntwrk/ledger-v8` | `8.1.0` | Transaction serialization |
| `@midnight-ntwrk/midnight-js` | `4.1.1` | Core Midnight.js |
| `@midnight-ntwrk/midnight-js-contracts` | `4.1.1` | findDeployedContract |
| `@midnight-ntwrk/midnight-js-fetch-zk-config-provider` | `4.1.1` | Fetch ZK assets over HTTP |
| `@midnight-ntwrk/midnight-js-http-client-proof-provider` | `4.1.1` | Proof server HTTP client |
| `@midnight-ntwrk/midnight-js-indexer-public-data-provider` | `4.1.1` | Read contract state |
| `@midnight-ntwrk/midnight-js-network-id` | `4.1.1` | Network ID management |
| `@midnight-ntwrk/midnight-js-types` | `4.1.1` | SDK types |

### Frontend Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@originjs/vite-plugin-commonjs` | `1.0.3` | CommonJS compat for Compact runtime |
| `@types/react` | `^19.1.2` | TypeScript types |
| `@types/react-dom` | `^19.1.2` | TypeScript types |
| `@vitejs/plugin-react` | `^4.4.1` | React Vite plugin |
| `typescript` | `~5.8.3` | TypeScript compiler |
| `vite` | `^6.3.5` | Build tool |
| `vite-plugin-node-polyfills` | `^0.23.0` | Node.js polyfills for browser |
| `vite-plugin-top-level-await` | `^1.5.0` | Top-level await support |
| `vite-plugin-wasm` | `^3.4.1` | WASM support |

### Root (Root package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `@midnight-ntwrk/compact-runtime` | `0.16.0` | For compile + commitment |
| All `@midnight-ntwrk/midnight-js-*` | `4.1.1` | For deployment script |
| `@midnight-ntwrk/wallet-sdk` | `1.2.0` | For deployment wallet |
| `vitest` | `^3.2.4` | Testing |
| `tsx` | `^4.23.1` | TypeScript execution |

### Critical Override

```json
"overrides": {
  "@midnight-ntwrk/onchain-runtime-v3": "3.1.0"
}
```

This MUST be set in both root and frontend `package.json`.

---

## N. Required Environment Variables

### Frontend (.env)

```env
# PUBLIC — visible in browser, no secrets
VITE_CONTRACT_ADDRESS=<deployed contract hex address>
VITE_NETWORK_ID=preprod
VITE_INDEXER_URL=https://indexer.preprod.midnight.network/api/v4/graphql
VITE_INDEXER_WS_URL=wss://indexer.preprod.midnight.network/api/v4/graphql/ws
VITE_LEDGER_POLL_MS=5000
VITE_EXPLORER_URL=https://explorer.preprod.midnight.network/tx/{txId}
```

### Root (.env — deployment script only, NOT in frontend)

```env
MIDNIGHT_NETWORK=preprod
MIDNIGHT_SEED=<dev wallet seed — NEVER committed>
PRIVATE_STATE_PASSWORD=<encryption password — NEVER committed>
MIDNIGHT_PROOF_SERVER_URL=http://127.0.0.1:6300
```

### What NEVER Goes in VITE_ Variables

- MIDNIGHT_SEED
- PRIVATE_STATE_PASSWORD
- Private keys
- Wallet seeds
- Membership credentials (memberId/salt)

---

## O. Security Model

### What Is Public

- Contract address (on-chain, visible to anyone)
- Allowlist commitments (on-chain, visible to anyone)
- accessCount (on-chain, visible to anyone)
- VITE_ environment variables (bundled in frontend JS)
- Transaction hashes, block heights, timestamps

### What Is Private

- `memberId` — raw 32-byte membership identifier
- `salt` — random 32-byte nonce
- Pedersen commitment preimage — the ZK proof hides which slot matched
- The ZK proof itself — generated locally, only proof artifact submitted

### What an Observer CAN Learn

- A `proveMembership` transaction was submitted
- The transaction succeeded or failed (accessCount changed or didn't)
- The wallet address of the transaction sender
- The total number of successful verifications (accessCount)

### What an Observer CANNOT Learn

- WHO proved membership (which memberId)
- WHICH allowlist slot matched
- The salt used in the commitment
- The relationship between wallet address and membership identity
- Whether two different transactions used the same credentials

### Trust Assumptions

- The proof server is trusted to generate valid ZK proofs (not to cheat)
- The browser wallet is trusted to balance/sign transactions correctly
- The developer is trusted to deploy the correct contract
- No third party is needed to verify proofs (Midnight node verifies on-chain)

---

## P. Testing Strategy

### Level 3 Requirement: Minimum 3 Tests

### Target: 15+ Meaningful Tests

#### Contract Tests (10 tests — using compact-runtime in browser-compatible mode)

| # | Test | Type |
|---|------|------|
| 1 | Valid member proof accepted | Happy path |
| 2 | accessCount increments after valid proof | State change |
| 3 | Invalid member proof rejected | Security |
| 4 | accessCount unchanged after invalid proof | Security |
| 5 | Pedersen commitment matches on-chain slot | Crypto correctness |
| 6 | Different salt produces different commitment | Crypto property |
| 7 | Same inputs produce same commitment (determinism) | Crypto property |
| 8 | Ledger contains only allowlist + accessCount | Privacy |
| 9 | Raw memberId never appears in ledger | Privacy |
| 10 | Raw salt never appears in ledger | Privacy |

#### Frontend Tests (5 tests — Vitest + jsdom)

| # | Test | Type |
|---|------|------|
| 1 | Wallet connection flow | Integration |
| 2 | Wallet disconnection flow | Integration |
| 3 | Wrong network detection | Error handling |
| 4 | Contract unavailable handling | Error handling |
| 5 | Proof generation + verification result display | Integration |

#### Testing Framework

- **Vitest** (root) — contract logic tests, runs against compiled Compact runtime
- **Vitest + jsdom** (frontend) — component/hook tests
- **@testing-library/react** — DOM interaction testing
- **@testing-library/jest-dom** — DOM assertions

---

## Q. CI/CD Strategy

### GitHub Actions Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Setup Node.js 22
      - Install Compact CLI
      - Install dependencies
      - Compile Compact contract
      - Run contract tests
      - Install frontend dependencies
      - Run frontend tests
      - Build frontend
```

### What CI Does NOT Do

- Does NOT deploy to Netlify (manual or Netlify auto-deploy on push)
- Does NOT deploy a contract
- Does NOT run a proof server
- Does NOT require a wallet
- Does NOT require Docker

---

## R. Level 3 Requirement Mapping

| Requirement | How ShadowPass Satisfies It |
|-------------|-------------------|
| Fully functional dApp | Browser wallet → ZK proof → verification → access granted |
| Meaningfully uses privacy model | Pedersen commitment, ZK proof, membership ≠ wallet identity |
| Minimum 3 tests | Targeting 15+ |
| CI/CD workflow | GitHub Actions, passing |
| Approved idea | Private Allowlist Access — from provided list |
| Minimum 10 meaningful commits | Planned 16+ genuine milestones |
| Public GitHub repo | Will create |
| Live demo link | Netlify deployment |
| Screenshot test output | CI artifact or manual screenshot |
| CI badge | README badge |
| 1-minute demo video | Recording |
| README privacy model | What observer CAN/CANNOT learn |
| Product proposal | PROPOSAL.md |
| Contract info | Address, network, deployment evidence |

---

## S. Four-Day Implementation Plan

### Day 1 — Foundation (Phase 0-3)

**Goal: Minimal Vite/React app that connects to Midnight wallet on Preprod**

1. Initialize project structure
2. Configure Vite with all required plugins
3. Set up TypeScript configuration
4. Install all dependencies
5. Implement wallet discovery and connection
6. Implement Preprod network detection
7. Test: wallet connects successfully
8. **Commit:** `chore: initialize ShadowPass with Vite/React and Midnight wallet connector`

### Day 2 — Contract + Proof (Phase 4-6)

**Goal: Load contract, generate ZK proof, submit verification transaction**

1. Copy and configure compiled contract artifacts
2. Set up ZK asset serving from public/
3. Implement InMemoryPrivateStateProvider
4. Implement contract service (findDeployedContract)
5. Implement Pedersen commitment computation (or use raw bytes)
6. Implement proveMembership call flow
7. Deploy new ShadowPass contract (one-time, developer)
8. Test: valid proof accepted, accessCount increments
9. **Commits:**
   - `feat: integrate ShadowPass contract for browser-side interaction`
   - `feat: implement membership proof generation and verification`
   - `feat: deploy ShadowPass contract on Preprod`

### Day 3 — UI + Error Handling (Phase 7-9)

**Goal: Polished, production-grade UI with complete error handling**

1. Build landing page with branding
2. Build wallet connection component
3. Build verification form (memberId + salt inputs)
4. Build verification result display
5. Build privacy explanation section
6. Implement all error states
7. Implement loading states
8. Style with dark theme, professional design
9. **Commits:**
   - `feat: build verification UI with privacy-focused design`
   - `feat: add comprehensive error handling and loading states`
   - `feat: add privacy model documentation to UI`

### Day 4 — Testing + CI/CD + Deployment (Phase 10-16)

**Goal: Tests passing, CI/CD running, live on Netlify, submission-ready**

1. Write contract tests (10+)
2. Write frontend tests (5+)
3. Set up GitHub Actions CI
4. Verify CI passes
5. Deploy to Netlify
6. Test live demo end-to-end
7. Write PROPOSAL.md
8. Write README.md with privacy model
9. Capture deployment evidence
10. Record demo video
11. Capture test screenshot
12. **Commits:**
   - `test: add contract verification and privacy tests`
   - `test: add frontend wallet and verification tests`
   - `ci: add GitHub Actions CI pipeline`
   - `docs: add Level 3 product proposal`
   - `docs: add comprehensive README with privacy model`
   - `docs: add deployment documentation and evidence`

---

## T. Risks and Blockers

### CRITICAL RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Wallet does not provide proof server URL | HIGH | Document that evaluator must run `docker compose up proof-server` locally. Alternatively, check if 1AM/Lace bundle proof generation. |
| `compact-js` / `compact-runtime` fail in browser | HIGH | Flash Loan demo already proves they work. Use exact same versions. |
| Vite plugins fail to bundle Midnight SDK | MEDIUM | Flash Loan demo already proves the plugin set works. Use exact same plugins. |
| Existing contract's allowlist has unknown credentials | LOW | Deploy new ShadowPass contract with known credentials. Cost: faucet tokens only. |
| Netlify build fails (Compact CLI needed at build time) | MEDIUM | Install Compact CLI in Netlify build environment. Test locally first. |
| Preprod faucet tokens exhausted | LOW | Request tokens via faucet URL. May need multiple requests. |
| Browser wallet not available (evaluator has no wallet) | MEDIUM | Document wallet installation in README. 1AM and Lace are the primary options. |
| Proof server timeout during demo | LOW | Increase timeout. Use local proof server as backup. |
| Contract interaction throws unexpected errors | MEDIUM | Comprehensive error handling + fallback messages. |

### MUST VERIFY DURING PHASE 0

1. Does `window.midnight` exist when 1AM or Lace is installed?
2. Does `wallet.connect("preprod")` succeed?
3. Does `connectedAPI.getConfiguration()` return a `proverServerUri`?
4. Does `httpClientProofProvider` work with the wallet's proof server URL?
5. Does `findDeployedContract` succeed with the existing contract address?
6. Can `callTx.proveMembership(memberId, salt)` execute with browser wallet?

### STOP CONDITIONS

If any of these are true, STOP and report:

1. `compact-js` does not work in the browser
2. The wallet does not provide a proof server AND no local proof server can be used
3. `findDeployedContract` requires Node.js-only APIs
4. The existing contract is incompatible with browser-side interaction
5. Any required dependency costs real money

---

## U. Definitive Technical Answers

### "Can ShadowPass be implemented as a complete Midnight dApp with no backend dependency and without requiring 3+ hour synchronization?"

**YES.**

Evidence:
   1. The Flash Loan demo already proves browser-based Midnight DApps work on Netlify
2. The wallet's DApp Connector API provides instant connection (no sync)
3. The proof server handles ZK proof generation (delegated, not in-browser)
4. `compact-js` + `compact-runtime` work in the browser (proven by Flash Loan)
5. `findDeployedContract` works with browser providers (proven by Flash Loan)
6. The ShadowPass contract has no witnesses, making it simpler than Flash Loan
7. Private state is empty (`{}`) — nothing to persist server-side

The 3+ hour sync was a server-side wallet synchronization problem. The browser wallet connects instantly via DApp Connector API. No sync is needed on the client side.

### "Can multiple different evaluator wallets use the same deployed ShadowPass contract without their wallet address being their membership identity?"

**YES.**

Evidence:
1. The `proveMembership` circuit takes `memberId` and `salt` as explicit arguments
2. The Pedersen commitment `persistentCommit(memberId, salt)` is independent of wallet address
3. The ZK proof proves "I know (memberId, salt) whose commitment is in the allowlist"
4. The wallet address only appears as the transaction signer (public, but unrelated to membership)
5. Two different wallets submitting the same `(memberId, salt)` produce indistinguishable results
6. The same deployed contract works for any wallet with valid credentials

The membership identity system is cryptographically decoupled from the wallet identity system by design.

---

## Appendix: File Structure (Target)

```
ShadowPass/
├── .github/workflows/ci.yml
├── contracts/
│   ├── shadowpass.compact
│   └── managed/shadowpass/
│       ├── compiler/contract-info.json
│       ├── contract/index.js + index.d.ts
│       ├── keys/proveMembership.prover + .verifier
│       └── zkir/proveMembership.bzkir + .zkir
├── docs/
│   ├── ARCHITECTURE-BLUEPRINT.md
│   └── PROPOSAL.md
├── frontend/
│   ├── public/midnight/shadowpass/
│   │   ├── keys/ (prover/verifier)
│   │   └── zkir/ (.bzkir)
│   ├── scripts/copy-zk-assets.mjs
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── config.ts
│   │   ├── compiled-contract.js + .d.ts
│   │   ├── midnight/
│   │   │   ├── compiled-contract.ts
│   │   │   ├── contract-service.ts
│   │   │   ├── in-memory-private-state-provider.ts
│   │   │   ├── providers.ts
│   │   │   └── types.ts
│   │   ├── hooks/
│   │   │   └── useMidnight.ts
│   │   ├── components/
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── VerificationPanel.tsx
│   │   │   ├── StatusBanner.tsx
│   │   │   └── icons.tsx
│   │   ├── shims/isomorphic-ws.ts
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json + tsconfig.app.json + tsconfig.node.json
│   └── vite.config.ts
├── src/
│   ├── deploy.ts (developer-only deployment script)
│   └── network.ts
├── test/
│   └── shadowpass.test.ts
├── frontend/test/
│   └── *.test.ts
├── .env.example
├── .gitignore
├── netlify.toml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── PROPOSAL.md
└── DEPLOYMENT.md
```
