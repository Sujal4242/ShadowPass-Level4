# ShadowPass — Preprod Deployment Evidence

> This file records the public blockchain evidence for the canonical ShadowPass Preprod deployment. Deployment and verification values are taken from the deployment metadata, source configuration, tests, and successful browser/on-chain verification. No secrets are stored here.

**This is the canonical ShadowPass Preprod deployment.** The contract was deployed once using the project's deployment script. The dApp connects to this single deployed address via `findDeployedContract()`. No server-side persistence is used; the dApp runs entirely in the browser.

## Deployment

- **Network:** Midnight Preprod
- **Contract address:** `4cae45d1c4e6d2acc4e607f60cd61c19b77c31c84af0cc72c827889271041f44`
- **Deployment transaction ID:** TBD / Not captured in repository
- **Deployment block height:** TBD / Not captured in repository
- **Deployment block hash:** TBD / Not captured in repository
- **Deployer wallet address:** TBD / Not captured in repository
- **Deployed at:** TBD / Not captured in repository

> **Note:** The deployment was performed using `scripts/deploy-v2.ts`. The contract address was captured from the deployment script output and is recorded in `frontend/.env` and `frontend/src/config.ts`. The deployment transaction details were not persisted in the repository.

## Verification

The first successful browser verification was performed on Midnight Preprod using the 1AM wallet:

- **Verification transaction ID:** TBD / Not captured in repository
- **Verification block height:** 2188929
- **Verification block hash:** TBD / Not captured in repository
- **Access count after verification:** 1
- **Granted:** true

> **Note:** The browser verification was performed through the live frontend. The 1AM wallet confirmed "TRANSACTION SUBMITTED". The ShadowPass frontend displayed "Access Granted". The access count was incremented from 0 to 1.

## Explorer

- **Contract:** https://explorer.preprod.midnight.network/contract/4cae45d1c4e6d2acc4e607f60cd61c19b77c31c84af0cc72c827889271041f44
- **Deployment transaction:** TBD / Not captured
- **Verification transaction:** TBD / Not captured

> Explorer links follow the Midnight Preprod explorer URL pattern. Once the verification transaction ID is available, the verification transaction URL can be constructed as `https://explorer.preprod.midnight.network/tx/<VERIFICATION_TX_ID>`.

## Deployment Details

- **Compact contract:** `contracts/shadowpass.compact`
- **Compiler version:** 0.31.1
- **Language version:** 0.23.0
- **Runtime version:** 0.16.0
- **SDK versions:** `@midnight-ntwrk/midnight-js-contracts@4.1.1`, `@midnight-ntwrk/wallet-sdk@1.2.0`
- **Allowlist size:** 8 (`Vector<8, Bytes<32>>`)
- **Proof infrastructure:** Browser-delegated proving via `connectedAPI.getProvingProvider()` (1AM wallet WASM prover). No external proof server.
- **Frontend architecture:** Browser-only dApp. No backend, no server, no database.
- **Contract address source:** `frontend/.env` (`VITE_CONTRACT_ADDRESS`) with fallback in `frontend/src/config.ts`

## Allowlist Configuration

The contract is deployed with an 8-entry allowlist. Slot 0 contains the public demo credential commitment. Slots 1-7 contain deterministic filler commitments.

| Slot | Commitment | Description |
|------|-----------|-------------|
| 0 | `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` | Demo credential |
| 1 | `5634ba7da27050e358f71072168946fe59b777f4bd2194071a38821a12c969d8` | Filler |
| 2 | `e490c0c0851943f528c57de5bdb4c53374c617b18815d7191bb15c3fe5c3004f` | Filler |
| 3 | `d0a71f2e6c5ae6729f43c1d300b42aa7007d78b42c9d6075f22a03e9e1c8dd1f` | Filler |
| 4 | `92a6b7ba8973383d3c7fe795e48f00c9a811d55e41ac868cebcf39b395808653` | Filler |
| 5 | `1aee7e080e596fc61ab86d96e117964229edce54454ae58a4fd3f8aa3721c9db` | Filler |
| 6 | `835d9a7aaa77ec0d22933badd164f85fcf9c02ac0db2e96aeace6fd1af407153` | Filler |
| 7 | `6dd60d0717a600771ce24a5e536655aeb8435609e18b0c7f79594edd2f64da73` | Filler |

See `DEPLOYMENT-INPUTS.md` for the complete allowlist derivation details.

## Demo Credential Evidence

The demo membership credential is public by design. It was verified end-to-end against the deployed ShadowPass contract.

| Field | Value |
|-------|-------|
| Member ID | `deadbeef000000000000000000000000000000000000000000000000deadbeef` |
| Salt | `cafebabe000000000000000000000000000000000000000000000000cafebabe` |
| Computed commitment | `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` |
| Allowlist slot 0 | `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` |
| Match | **Yes** — credential-derived commitment equals allowlist slot 0 |

The `proveMembership` circuit computed `persistentCommit(memberId, salt)` and found a match in the on-chain allowlist at slot 0, resulting in a successful verification.

See `DEMO-CREDENTIALS.md` for full credential documentation.

## Verification Flow

```
User connects 1AM wallet (DApp Connector → Midnight Preprod)
    ↓
User enters Member ID + Salt into the verification form
    ↓
Browser computes persistentCommit(memberId, salt) locally
    ↓
Browser calls deployed.callTx.proveMembership(memberIdBytes, saltBytes)
    ↓
SDK queries current on-chain state via indexer (publicDataProvider)
    ↓
proveMembership circuit asserts claim matches one of 8 allowlist slots
    ↓
Groth16 ZK proof generated in browser via 1AM wallet WASM prover
    ↓
Wallet balances and submits the transaction to Midnight Preprod
    ↓
Contract verifies the proof on-chain
    ↓
accessCount incremented (0 → 1)
    ↓
Frontend displays "Access Granted"
```

## Wallet Integration

- **Wallet:** 1AM (version 4.0.0)
- **Connection:** Midnight DApp Connector API (`window.midnight`)
- **Network:** Midnight Preprod
- **Proving:** Browser-delegated via `connectedAPI.getProvingProvider()` — no external proof server required
- **Transaction submission:** Through the connected wallet's `submitTransaction()` method
- **Reconnection:** The frontend can reconnect silently when the origin is already authorized by the wallet extension

## Notes

- **Midnight Preprod** is a test network. No real money is involved. Test tokens are obtained from the network faucet.
- **Demo credentials are public by design.** The Member ID and Salt are documented in `DEMO-CREDENTIALS.md` and intentionally public for demonstration purposes.
- **Zero-knowledge privacy model:** The ZK proof proves "I know a valid credential" without revealing which credential. The raw `memberId` and `salt` never appear on-chain. An observer cannot determine which allowlist entry matched.
- **The wallet address is NOT an allowlist entry.** The wallet address is the transaction signer/prover. Membership is verified via the `persistentCommit(memberId, salt)` commitment, independent of the wallet.
- **Canonical contract.** The contract address `4cae45d1...` is the single deployed ShadowPass instance. The frontend is hardcoded to this address. Redeployment creates a new address (see Redeployment below).

## Frontend Architecture

ShadowPass is a complete Midnight dApp. There is no backend, no server-side logic, no database, and no proof server.

| Component | Source |
|-----------|--------|
| ZK Config | `FetchZkConfigProvider` — reads ZKIR/keys from static assets |
| Proof | `connectedAPI.getProvingProvider()` — browser WASM prover |
| Private State | `InMemoryPrivateStateProvider` — empty (no witnesses) |
| Public Data | `indexerPublicDataProvider()` — Midnight Preprod indexer |
| Wallet | `connectedAPI` — DApp Connector |
| Midnight | `connectedAPI` — DApp Connector |

Provider assembly: `frontend/src/midnight/providers.ts`

## Deployment / Persistence

ShadowPass does **not** use server-side persistence. The Old ShadowPass server maintained a `.midnight-state/preprod/shadowpass-deployment.json` file to persist deployment metadata across restarts. ShadowPass has no such mechanism.

- The contract is deployed once using `scripts/deploy-v2.ts`.
- The deployment script outputs the contract address to stdout.
- The operator manually updates `frontend/.env` (`VITE_CONTRACT_ADDRESS`) and `frontend/src/config.ts` (`CONTRACT_ADDRESS`) with the deployed address.
- The frontend rebuilds and is deployed (e.g., to Netlify).
- The frontend uses `findDeployedContract()` to load the existing on-chain contract at startup.

## Redeployment

ShadowPass deployment and redeployment is managed through the project's deployment scripts. To deploy a new contract:

1. Run `npm run deploy:v2` with the `SHADOWPASS_DEPLOYER_SEED` environment variable set.
2. The script outputs the new contract address.
3. Update `frontend/.env` and `frontend/src/config.ts` with the new address.
4. Rebuild and redeploy the frontend.

A redeployment creates a new contract address. The old contract and its on-chain state remain on the blockchain but are no longer referenced by the frontend.

## Security / Secrets

This evidence document contains only public blockchain information and publicly documented demo credentials. The following are **never** stored in this document or the repository:

- Wallet seed phrases
- Private keys
- `SHADOWPASS_DEPLOYER_SEED`
- `PRIVATE_STATE_PASSWORD`
- API secrets or tokens
- Private witnesses

Public information recorded here includes: contract address, network configuration, demo credentials (public by design), compiler/SDK versions, and verification results.

## Testing & Validation

The project includes 28 automated tests covering:

| Test Suite | Tests | Description |
|------------|-------|-------------|
| Wallet state persistence | 15 | Unit tests for wallet state serialization/deserialization |
| Authorized membership | 2 | Verifies commitment match and accessCount increment |
| Unauthorized membership | 2 | Verifies rejection of non-matching credentials |
| No data exposure | 2 | Verifies memberId/salt are not leaked on-chain |
| Commitment determinism | 4 | Verifies persistentCommit is deterministic |
| Groth16 proof generation | 1 | Full end-to-end proof generation and verification |

**TypeScript checks:** Clean (frontend `tsconfig.app.json`, root `tsconfig.json`, deploy `tsconfig.deploy.json`)

**Frontend build:** Clean (Vite production build)

**Contract compilation:** Clean (`compact compile` → `contracts/managed/shadowpass/`)

## Important Deployment Note

During development, the frontend was initially using the Old ShadowPass contract address (`983d941f...`) through the `VITE_CONTRACT_ADDRESS` environment variable. This caused the frontend to query the wrong contract state, resulting in "Not an authorized member" errors despite correct demo credentials.

The root cause was that `frontend/.env` contained the Old ShadowPass address, which overrode the fallback default in `config.ts`. The fix was:

1. Updating `frontend/.env` to the canonical ShadowPass contract address
2. Updating `frontend/.env.example` to match
3. Cleaning the Vite module cache

After the correction:
- The frontend loaded the correct ShadowPass contract state
- Allowlist slot 0 matched the expected demo credential commitment
- `proveMembership` succeeded
- The wallet submitted the transaction
- "Access Granted" was displayed
- Access count incremented to 1
