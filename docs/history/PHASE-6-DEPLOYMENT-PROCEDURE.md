# Phase 6 — Deployment Procedure

> **WARNING: DO NOT DEPLOY SHADOWPASS TO MIDNIGHT PREVIEW.**
> **The target network is Midnight Preprod.**
> **The deployment script will REFUSE to deploy to any other network.**

## 1. Purpose

This document describes the one-time deployment of the ShadowPass contract to **Midnight Preprod ONLY**. The deployment is a manual, development-only operation. It is **not** part of the live application.

After deployment, the contract address is hardcoded into `frontend/src/config.ts` and the deployment infrastructure is never used again.

- **Network:** MIDNIGHT PREPROD ONLY
- **Deployment:** ONE-TIME MANUAL OPERATION
- **Live frontend:** FRONTEND ONLY (never deploys)

## 1b. Network Safety Assertion

The deployment script (`scripts/deploy-v2.ts`) contains an explicit network safety assertion **before** calling `deployContract()`. The assertion verifies that `getNetworkId()` returns `'preprod'`. If the resolved network is anything else, deployment is **refused** and the script exits with an error.

The network endpoints are hardcoded in the deployment script and cannot be overridden by environment variables:
- Indexer: `https://indexer.preprod.midnight.network/api/v4/graphql`
- WebSocket: `wss://indexer.preprod.midnight.network/api/v4/graphql/ws`
- RPC: `https://rpc.preprod.midnight.network`
- Faucet: `https://midnight-tmnight-preprod.nethermind.dev`

## 2. Deployment-Only Architecture

```
DEPLOYMENT (one-time, local machine):
  scripts/deploy-v2.ts
  → Docker proof server (localhost:6300)
  → Node.js wallet (seed from env var)
  → deployContract() → Midnight Preprod

LIVE APPLICATION (Netlify):
  React/Vite frontend
  → Midnight DApp Connector (browser wallet)
  → Evaluator wallet
  → Midnight Preprod
  → ONE deployed ShadowPass contract
```

The deployment script uses infrastructure that the live frontend never touches:
- Docker proof server
- `@midnight-ntwrk/wallet-sdk` (Node.js wallet)
- `@midnight-ntwrk/midnight-js-http-client-proof-provider`
- `@midnight-ntwrk/midnight-js-level-private-state-provider`
- `@midnight-ntwrk/midnight-js-protocol`

## 3. Required Node Version

```
Node.js >= 22.0.0
```

## 4. Required Docker State

Docker must be running with the Midnight proof server:

```bash
# From the Flash Loan project or any Midnight proof server setup:
docker compose up -d
```

The proof server must be accessible at `http://127.0.0.1:6300`.

The deployment script polls the proof server and will wait up to 120 seconds for it to become ready.

## 5. Required Wallet/Funding State

1. **Generate a deployment seed** (one-time, random):
   ```bash
   export SHADOWPASS_DEPLOYER_SEED=$(openssl rand -hex 32)
   ```

2. **Fund the wallet** with test tDUST from the Midnight Preprod faucet:
   - Faucet: https://midnight-tmnight-preprod.nethermind.dev
   - The deployment script will display the wallet address and wait for funding
   - Timeout: 10 minutes (configurable via `MIDNIGHT_FAUCET_TIMEOUT_MS`)

3. **The wallet needs:**
   - tNIGHT for transaction fees
   - DUST for contract deployment (auto-generated from registered NIGHT UTXOs)

## 6. Required Local Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHADOWPASS_DEPLOYER_SEED` | Yes | Hex-encoded 64-character (32-byte) wallet seed |
| `PRIVATE_STATE_PASSWORD` | No | Password for LevelDB encryption (has default) |
| `MIDNIGHT_FAUCET_TIMEOUT_MS` | No | Faucet wait timeout in ms (default: 600000) |

**NEVER commit the seed to git. NEVER print it to console.**

## 7. Exact 8 Constructor Commitments

```
Slot 0: c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e  (demo credential)
Slot 1: 5634ba7da27050e358f71072168946fe59b777f4bd2194071a38821a12c969d8  (filler)
Slot 2: e490c0c0851943f528c57de5bdb4c53374c617b18815d7191bb15c3fe5c3004f  (filler)
Slot 3: d0a71f2e6c5ae6729f43c1d300b42aa7007d78b42c9d6075f22a03e9e1c8dd1f  (filler)
Slot 4: 92a6b7ba8973383d3c7fe795e48f00c9a811d55e41ac868cebcf39b395808653  (filler)
Slot 5: 1aee7e080e596fc61ab86d96e117964229edce54454ae58a4fd3f8aa3721c9db  (filler)
Slot 6: 835d9a7aaa77ec0d22933badd164f85fcf9c02ac0db2e96aeace6fd1af407153  (filler)
Slot 7: 6dd60d0717a600771ce24a5e536655aeb8435609e18b0c7f79594edd2f64da73  (filler)
```

These are hardcoded in `scripts/deploy-v2.ts`. They match `docs/DEPLOYMENT-INPUTS.md`.

## 8. Exact Deployment Command

```bash
# Step 1: Generate seed (if you haven't already)
export SHADOWPASS_DEPLOYER_SEED=$(openssl rand -hex 32)

# Step 2: Ensure Docker proof server is running
docker compose up -d

# Step 3: Run deployment
npm run deploy:v2
```

The script will:
1. Create a wallet from the seed
2. Sync with Midnight Preprod
3. Display the wallet address
4. Wait for tNIGHT funding (if needed)
5. Register NIGHT UTXOs for DUST generation
6. Wait for DUST tokens
7. Check proof server readiness
8. Deploy the contract with the 8-member allowlist
9. Print the contract address

## 9. Expected Output

```
╔══════════════════════════════════════════════════════════════╗
║  ShadowPass — One-Time Deployment to Midnight Preprod        ║
╚══════════════════════════════════════════════════════════════╝

─── Wallet Setup ───────────────────────────────────────────────
  Creating deployment wallet...
  Syncing with network...
  ✓ Synced with network.

  Wallet Address: tnight1...
  Balance: 0 tNight

─── Fund Wallet ────────────────────────────────────────────────
  Wallet address: tnight1...
  Faucet:         https://midnight-tmnight-preprod.nethermind.dev
  ...
  Funded! tNIGHT balance: 1,000,000

─── DUST Token Setup ───────────────────────────────────────────
  DUST tokens ready!

─── Deploy Contract ────────────────────────────────────────────
  Checking proof server...
  Proof server ready!
  Setting up providers...
  Deploying contract with 8-member allowlist...

  ✅ Contract deployed successfully!

  ── Deployment Result ──────────────────────────────────────────
  Contract Address: <NEW SHADOWPASS CONTRACT ADDRESS>

  ── Next Steps ────────────────────────────────────────────────
  1. Copy the contract address above
  2. Update frontend/src/config.ts → CONTRACT_ADDRESS
  3. Rebuild frontend: npm run build --prefix frontend
  4. Deploy frontend/dist to Netlify

─── Deployment complete ────────────────────────────────────────
```

## 10. Where the Deployed Contract Address Will Appear

The contract address is printed in two places:
1. Console output during deployment (see Section 9)
2. The deployment script's final output block

## 11. How to Verify the Deployed Contract

After deployment, verify the contract on Midnight Preprod:

1. **Check the contract address** matches what was printed
2. **Query the ledger state** using the Flash Loan CLI pattern or a custom script:
   ```typescript
   const contractState = await publicDataProvider.queryContractState(contractAddress);
   const ledger = ShadowPass.ledger(contractState.data);
   console.log('Allowlist:', ledger.allowlist.map(buf => Buffer.from(buf).toString('hex')));
   console.log('Access Count:', ledger.accessCount);
   ```
3. **Verify slot 0** matches the demo commitment: `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e`

## 12. How to Update Frontend CONTRACT_ADDRESS

After deployment, update `frontend/src/config.ts`:

```typescript
export const CONTRACT_ADDRESS: string =
  env.VITE_CONTRACT_ADDRESS ??
  '<PASTE NEW SHADOWPASS CONTRACT ADDRESS HERE>';
```

## 13. How to Rebuild Frontend

```bash
npm run build --prefix frontend
```

Then deploy `frontend/dist/` to Netlify.

## 14. Security Warnings

- **NEVER commit the deployment seed to git**
- **NEVER print the seed to console** (the script does not print it)
- **NEVER place the seed in frontend code, documentation, or .env files committed to git**
- **The deployment wallet is temporary** — it is only used for the deployment transaction
- **The seed can be discarded after deployment** — it is not needed for the live application
- **The live frontend never uses a seed, private key, or wallet** — it uses the browser's Midnight DApp Connector

## 15. Confirmation: Deployment Infrastructure is NOT Part of the Live Application

The following packages are installed as `devDependencies` in the root `package.json` and are **never imported by the frontend**:

- `@midnight-ntwrk/wallet-sdk` (1.2.0) — deployment-only wallet
- `@midnight-ntwrk/midnight-js-level-private-state-provider` (4.1.1) — deployment-only storage
- `@types/ws` — WebSocket types for deployment script

The deployment script (`scripts/deploy-v2.ts`) is **never imported by the frontend**. The `frontend/` directory has its own `package.json` and `node_modules/` and does not depend on any of these packages.

The live frontend architecture remains:
```
Netlify → React/Vite → Midnight DApp Connector → Browser Wallet → Midnight Preprod
```

No Docker, no proof server, no Node.js wallet, no seed, no private key.
