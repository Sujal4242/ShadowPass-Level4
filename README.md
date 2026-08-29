# ShadowPass

**Private Allowlist Access on Midnight — prove membership without revealing identity.**

[![CI](https://github.com/Sujal4242/ShadowPass/actions/workflows/ci.yml/badge.svg)](https://github.com/Sujal4242/ShadowPass/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ShadowPass is a complete Midnight dApp that solves the **Private Allowlist Access** problem. Users prove they are members of an authorized allowlist using a zero-knowledge proof — without revealing their identity, membership credential, or salt. The Groth16 ZK proof is generated entirely in the browser and verified on-chain by a Compact smart contract deployed to Midnight Preprod.

## Live Demo

**[Launch ShadowPass →](https://shadowpass.netlify.app/)**

ShadowPass is deployed on Midnight Preprod and can be tested directly in the browser.

## Demo Video

**[Watch the ShadowPass Demo →](https://youtu.be/awoQSnAiCgo)**

The video demonstrates:
- Connecting the Midnight wallet
- Entering the membership credential
- Generating a zero-knowledge proof in the browser
- Wallet approval
- On-chain verification
- Successful Groth16 proof verification
- Privacy-preserving verification without revealing the underlying credential

> The demo video is unlisted on YouTube.

---

## Overview

Access control systems routinely require users to prove authorization — but traditional approaches reveal *who* is requesting access, creating surveillance risk. ShadowPass solves this by decoupling identity from authorization.

A user proves membership in an authorized allowlist using a zero-knowledge proof:

- The user possesses a private credential: `(memberId, salt)`.
- A Compact smart contract stores 8 Pedersen commitments on-chain, one per allowlist slot.
- The ZK circuit computes `persistentCommit(memberId, salt)` and asserts it matches one of the 8 on-chain commitments.
- The Groth16 proof is generated in-browser and verified on-chain.
- The raw credential never leaves the user's browser.

The result: the blockchain verifies "this user is authorized" without learning *which* member they are.

---

## Why ShadowPass?

Most access control systems leak identity. Every login, every badge scan, every credential check creates a trail. ShadowPass breaks that trail by proving authorization without disclosure.

- **No identity leak** — the blockchain never learns which member requested access
- **No credential exposure** — the raw membership data never leaves the browser
- **No linkability** — multiple verifications by the same member cannot be connected on-chain
- **Full on-chain verification** — the proof is verified by the smart contract, not a trusted server

---

## Features

- **Private membership verification** — prove you're on the allowlist without revealing which entry you hold
- **Zero-knowledge proof flow** — Groth16 proof generated entirely in the browser
- **Midnight wallet connection** — DApp Connector API with 1AM and Lace wallets
- **Preprod network integration** — deployed and verified on Midnight Preprod
- **Access verification result** — real-time proof status with granted/denied feedback
- **Privacy explanation** — in-app section explaining what is and isn't revealed
- **On-chain access count** — public ledger of successful verifications (count only)
- **Responsive UI** — polished interface with animated design system
- **Automated tests** — 28 tests covering contract logic, ZK proofs, and wallet state
- **GitHub Actions CI** — compile, typecheck, build, and test on every push

---

## How It Works

```
User
  │
  ▼
Connect Midnight Wallet (DApp Connector)
  │
  ▼
Enter membership credential (memberId + salt)
  │
  ▼
Browser computes persistentCommit(memberId, salt)
  │
  ▼
Groth16 ZK proof generated in browser (via wallet WASM prover)
  │
  ▼
Proof submitted to Midnight Preprod
  │
  ▼
Smart contract verifies proof against 8 on-chain commitments
  │
  ▼
Access Granted / Denied
```

**What becomes public:** The ZK proof itself, the access count increment, and the contract address.

**What stays private:** The raw `memberId`, the `salt`, and which specific allowlist entry matched.

---

## Privacy Model

### What an observer can learn

- A proof of membership was submitted to the contract
- The `accessCount` incremented (total number of successful verifications)
- The contract address and allowlist commitments (8 Pedersen hashes)
- The ZK proof data (Groth16 proof bytes)

### What remains private

- The raw `memberId` or `salt` used to generate the proof
- Which of the 8 allowlist slots matched the credential
- The identity or wallet address of the prover (membership is verified via commitment, not wallet address)
- Any linking between multiple proofs from the same member

---

## Architecture

```mermaid
graph TD
    A[React 19 + Vite 6 UI] --> B[Midnight Wallet<br/>DApp Connector]
    B --> C[ShadowPass<br/>Verification Flow]
    C --> D[ShadowPass Contract<br/>Compact — On-Chain Verification]
    D --> E[Midnight Preprod<br/>Blockchain]

    A --> F[7 Midnight.js Providers]
    F --> G[FetchZkConfigProvider<br/>Static ZK Assets]
    F --> H[Browser WASM Prover<br/>Groth16 Proof Generation]
    F --> I[InMemoryPrivateStateProvider<br/>Browser Memory]
    F --> J[Indexer Public Data Provider<br/>Preprod Indexer API]
```

The app uses 7 midnight-js providers assembled in `frontend/src/midnight/providers.ts`:

| Provider | Source |
|----------|--------|
| ZK Config | `FetchZkConfigProvider` — reads ZKIR/keys from static assets |
| Proof | `connectedAPI.getProvingProvider()` — browser WASM prover |
| Private State | `InMemoryPrivateStateProvider` — empty (no witnesses) |
| Public Data | `indexerPublicDataProvider()` — Midnight Preprod indexer |
| Wallet | `connectedAPI` — DApp Connector |
| Midnight | `connectedAPI` — DApp Connector |

---

## Smart Contract

The ShadowPass contract is written in Compact and lives at `contracts/shadowpass.compact`:

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
    (claim == allowlist[0]) || (claim == allowlist[1]) ||
    (claim == allowlist[2]) || (claim == allowlist[3]) ||
    (claim == allowlist[4]) || (claim == allowlist[5]) ||
    (claim == allowlist[6]) || (claim == allowlist[7]),
    "Not an authorized member"
  );
  accessCount = accessCount + 1;
}
```

- **`constructor`** — initializes 8 Pedersen commitments from the allowlist vector
- **`proveMembership`** — computes `persistentCommit(memberId, salt)` and asserts it matches one of the 8 slots
- **No witnesses** — the circuit takes explicit `Bytes<32>` arguments, no private state
- **`accessCount`** — incremented on each successful verification

---

## Wallet & Midnight Integration

ShadowPass connects to the user's Midnight-compatible wallet via the **DApp Connector API** (`window.midnight`):

1. **Discovery** — the app enumerates installed Midnight wallets (1AM, Lace)
2. **Connection** — `wallet.connect(networkId)` returns a `ConnectedAPI` instance
3. **Provider assembly** — 7 providers are assembled from the connected wallet
4. **Contract interaction** — `findDeployedContract()` loads the deployed contract at `4cae45d1...`
5. **Proof generation** — `connectedAPI.getProvingProvider()` delegates Groth16 proving to the wallet's WASM prover
6. **Transaction submission** — the wallet balances and submits the transaction to Midnight Preprod

**Network:** Midnight Preprod (testnet — no real value at stake)

---

## Running Locally

**Requirements:** Node.js >= 22.0.0, Midnight wallet extension (1AM or Lace)

### Installation

```bash
npm install
npm --prefix frontend install
```

### Compilation

```bash
npm run compile
```

### Tests

```bash
npm test
```

### TypeScript Check

```bash
npm run build
cd frontend && npx tsc -b --noEmit
```

### Frontend Development

```bash
npm run dev:frontend
# → http://localhost:5173
```

### Production Build

```bash
npm run build:frontend
```

---

## Testing

The project includes **28 automated tests** across two test suites:

| Suite | Tests | Description |
|-------|-------|-------------|
| `shadowpass.test.ts` | 13 | Contract creation, Groth16 proof generation, ZK circuit verification, invalid credential rejection, no data exposure, commitment determinism |
| `wallet-state.test.ts` | 15 | Wallet state serialization, version handling, atomic writes, corruption recovery, network isolation |

### What the tests validate

- CompactContract creation and witness generation
- Groth16 proof generation and on-chain verification
- ZK circuit constraint satisfaction
- Invalid credential rejection (unauthorized member)
- No raw `memberId` or `salt` exposed in on-chain transcript
- Commitment determinism (`persistentCommit` is deterministic)
- Wallet state persistence round-trips and error handling

### Latest validation

```
Compact compile     ✅ Clean
TypeScript          ✅ Clean
Frontend build      ✅ Clean (Vite production build)
Tests               ✅ 28/28 passing
```

---

## CI/CD

The project uses **GitHub Actions** for continuous integration:

**Workflow:** `.github/workflows/ci.yml`

| Stage | Command |
|-------|---------|
| Checkout | `actions/checkout@v4` |
| Node.js 22 | `actions/setup-node@v4` |
| Compact CLI | Install from Midnight releases |
| Compiler 0.31.1 | `compact update 0.31.1` |
| Root deps | `npm ci` |
| Frontend deps | `npm ci` (in `frontend/`) |
| Contract compile | `npm run compile` |
| TypeScript check | `npm run build` |
| Frontend build | `npm run build:frontend` |
| Unit tests | `npm test` (15 min timeout) |

Triggered on push to `main` and pull requests to `main`.

---

## Preprod Deployment

| Field | Value |
|-------|-------|
| **Network** | Midnight Preprod |
| **Contract address** | `4cae45d1c4e6d2acc4e607f60cd61c19b77c31c84af0cc72c827889271041f44` |
| **Explorer** | [View on Explorer](https://explorer.preprod.midnight.network/contract/4cae45d1c4e6d2acc4e607f60cd61c19b77c31c84af0cc72c827889271041f44) |
| **Allowlist size** | 8 slots (`Vector<8, Bytes<32>>`) |
| **Compiler** | Compact 0.31.1 |
| **Runtime** | compact-runtime 0.16.0 |

> Midnight Preprod is a test network. Test tokens are obtained from the network faucet. No real value is at stake.

Full deployment evidence: [`docs/evidence/DOCUMENT.md`](docs/evidence/DOCUMENT.md)

---

## Demo

### Demo Flow

1. Open the ShadowPass dApp in a browser with a Midnight wallet extension
2. Click **Connect Wallet** and approve the DApp Connector prompt
3. Enter the demo membership credential (see below)
4. Click **Verify Membership** to generate a ZK proof
5. Approve the wallet transaction if prompted
6. View the verification result: **Access Granted**
7. The on-chain `accessCount` increments

### Demo Credentials

| Field | Value |
|-------|-------|
| **Member ID** | `deadbeef000000000000000000000000000000000000000000000000deadbeef` |
| **Salt** | `cafebabe000000000000000000000000000000000000000000000000cafebabe` |

These credentials are **public by design** for demonstration purposes. See [`docs/evidence/DEMO-CREDENTIALS.md`](docs/evidence/DEMO-CREDENTIALS.md) for details.

> **Production credential model:** In a production system, credentials are generated and distributed privately by an authorized issuer. The demonstration uses public credentials to show the ZK proof flow without requiring a backend enrollment system.

---

## Screenshots

### Live Deployment

The ShadowPass landing page deployed on Midnight Preprod.

![ShadowPass live deployment](docs/evidence/screenshots/shadowpass-live.jpeg)

### Wallet Connected

The Midnight wallet connected via DApp Connector, showing the verification interface ready for credential input.

![Midnight wallet connected](docs/evidence/screenshots/wallet-connected.jpeg)

### Successful Proof Verification

A Groth16 zero-knowledge proof verified on-chain. The transaction hash, block number, and incremented access count confirm successful membership verification.

![ShadowPass proof verified on-chain](docs/evidence/screenshots/proof-verified.jpeg)

### Test Suite

All 28 automated tests passing — covering Compact contract logic, Groth16 proof generation, ZK circuit verification, and wallet state persistence.

![ShadowPass test suite with 28 passing tests](docs/evidence/screenshots/tests-28-of-28.jpeg)

### Continuous Integration

GitHub Actions CI workflow passing on every push to `main`.

![ShadowPass GitHub Actions CI passing](docs/evidence/screenshots/ci-passing.jpeg)

---

## Security

The repository is configured to **never commit** sensitive material:

- `.env` files are gitignored (only `.env.example` is tracked)
- Wallet seed phrases and private keys are never stored in the repository
- Generated artifacts (`contracts/managed/`, `frontend/dist/`, `*.tsbuildinfo`) are gitignored
- Wallet state directories (`.midnight-wallet-state/`, `midnight-level-db/`) are gitignored
- Demo credentials documented in this README and `docs/evidence/` are public by design

The deployment script (`scripts/deploy-v2.ts`) requires `SHADOWPASS_DEPLOYER_SEED` as an environment variable — this is never stored in the repository.

---

## Project Status

| Component | Status |
|---|---|
| Compact contract | Deployed on Preprod |
| Privacy circuit | Groth16 proof — verified end-to-end |
| Wallet integration | DApp Connector (1AM, Lace) |
| Frontend | React 19 + Vite 6 — production build clean |
| Tests | 28/28 passing |
| TypeScript | Clean |
| CI/CD | GitHub Actions — compile, typecheck, build, test |
| Preprod deployment | Live at `4cae45d1...` |
| Documentation | Complete (evidence, architecture, history) |

---

## Level 3 Submission

| Requirement | Status |
|---|---|
| Private Allowlist Access selected | Done |
| Functional Midnight privacy functionality | Done |
| Smart contract on Midnight | Done |
| Zero-knowledge proof | Done |
| Wallet integration | Done |
| Minimum 3 tests passing | Done (28/28) |
| CI/CD workflow | Done |
| Public GitHub repository | Done |
| README privacy model | Done |
| Minimum 10 meaningful commits | Done (11) |
| Live demo link | Done |
| Test-output screenshot | Done |
| 1-minute demo video | Done |
| Product proposal approval | Pending |

---

## License

[MIT](LICENSE)
