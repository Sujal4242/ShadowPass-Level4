# ShadowPass — Phase 0 Feasibility Verification

> Date: 2026-08-19
> Purpose: Prove the dApp architecture is technically viable BEFORE implementation
> Method: Deep source inspection of Flash Loan reference + DApp Connector API types

---

## Verdict: PASS

**ShadowPass CAN be implemented as a complete Midnight dApp with no backend dependency and no 3+ hour synchronization.**

The DApp Connector API (`@midnight-ntwrk/dapp-connector-api@4.0.1`) provides everything the browser needs. The old Flash Loan demo used a **deprecated** proof server approach. ShadowPass will use the **new** `getProvingProvider` API, which eliminates the proof server requirement entirely.

---

## Q1: Does the wallet configuration expose proverServerUri?

### DEPRECATED and OPTIONAL

Source: `dapp-connector-api/dist/api.d.ts:199-213`

```typescript
export type Configuration = {
    indexerUri: string;           // Required
    indexerWsUri: string;         // Required
    /**
     * Prover Server URI, likely to not be present, as different proving modalities emerge
     * @deprecated Use `getProvingProvider` instead
     */
    proverServerUri?: string | undefined;  // DEPRECATED, OPTIONAL
    substrateNodeUri: string;     // Required
    networkId: string;            // Required
};
```

The Flash Loan demo uses `config.proverServerUri || PROOF_SERVER_URL` (fallback `http://localhost:6300`). This is deprecated. ShadowPass must use `getProvingProvider()` instead — see Q3.

---

## Q2: What exact network identifier does the Flash Loan use?

### `"preview"` (not `"preprod"`)

Source: `frontend/.env:8` — `VITE_NETWORK_ID=preview`

ShadowPass must use `VITE_NETWORK_ID=preprod` since our contract is on Preprod.

---

## Q3: Does the Flash Loan require a locally running proof server?

### Flash Loan: YES (deprecated approach). ShadowPass: NO.

The Flash Loan uses `httpClientProofProvider(proofServerUrl, zkConfigProvider)` which sends HTTP requests to a proof server at `localhost:6300`.

**ShadowPass uses the new approach — zero proof server needed:**

```typescript
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';

// 1. Get KeyMaterialProvider from ZK config
const keyMaterialProvider = zkConfigProvider.asKeyMaterialProvider();

// 2. Ask the wallet to handle proving
const provingProvider = await connectedAPI.getProvingProvider(keyMaterialProvider);

// 3. Wrap into ProofProvider interface
const proofProvider = createProofProvider(provingProvider);
```

The wallet extension handles proof generation internally. No Docker, no localhost, no proof server process.

---

## Q4: Does the Flash Loan's browser flow ever create/sync a server-side wallet?

### NO

The entire `useMidnight` hook is 109 lines. Zero wallet creation, zero sync, zero seed phrases. All wallet operations happen inside the browser extension via the DApp Connector API:

1. `wallet.connect("preview")` returns `ConnectedAPI`
2. `connectedAPI.getShieldedAddresses()` returns public keys
3. `connectedAPI.balanceUnsealedTransaction(hex)` balances + signs
4. `connectedAPI.submitTransaction(hex)` submits to network

---

## Q5: Can the provider assembly be reused for ShadowPass?

### YES, with one improvement

| Provider | Flash Loan | ShadowPass |
|----------|-----------|-----|
| `privateStateProvider` | `InMemoryPrivateStateProvider` | Copy as-is |
| `publicDataProvider` | `indexerPublicDataProvider(url, wsUrl)` | Copy as-is |
| `zkConfigProvider` | `FetchZkConfigProvider(base, fetch)` | Copy, change base URL |
| `proofProvider` | `httpClientProofProvider(url, zk)` | **CHANGE** to `getProvingProvider` + `createProofProvider` |
| `walletProvider` | Custom wrapper around `connectedAPI` | Copy as-is |
| `midnightProvider` | Custom wrapper around `connectedAPI` | Copy as-is |

---

## Q6: Can findDeployedContract() work entirely from browser-side providers?

### YES

Source: `frontend/src/midnight/contract-service.ts:57-68`

`findDeployedContract(providers, { compiledContract, contractAddress, privateStateId, initialPrivateState })` works entirely with the 7 providers. No filesystem, no Node.js APIs.

The ShadowPass contract is simpler than Flash Loan (no witnesses), so `CompiledContract.withVacantWitnesses` replaces `CompiledContract.withWitnesses(...)`.

---

## Q7: Node.js-only dependencies that would prevent Netlify deployment?

### NONE (with correct polyfills)

**Browser-compatible (confirmed by Flash Loan production build):**
- `@midnight-ntwrk/compact-js` 2.5.1
- `@midnight-ntwrk/compact-runtime` 0.16.0
- `@midnight-ntwrk/dapp-connector-api` 4.0.1 (types only)
- `@midnight-ntwrk/ledger-v8` 8.1.0
- `@midnight-ntwrk/midnight-js-contracts` 4.1.1
- `@midnight-ntwrk/midnight-js-fetch-zk-config-provider` 4.1.1
- `@midnight-ntwrk/midnight-js-http-client-proof-provider` 4.1.1
- `@midnight-ntwrk/midnight-js-indexer-public-data-provider` 4.1.1
- `@midnight-ntwrk/midnight-js-network-id` 4.1.1
- `@midnight-ntwrk/midnight-js-types` 4.1.1

**Node.js only — NEVER include in frontend:**
- `@midnight-ntwrk/wallet-sdk`
- `@midnight-ntwrk/midnight-js-level-private-state-provider`
- `@midnight-ntwrk/midnight-js-node-zk-config-provider`
- `@midnight-ntwrk/zkir-v2`

---

## Q8: Required Vite Plugins and Polyfills

### Exact config to copy from Flash Loan

```
vite.config.ts plugins:
  1. react()                          — JSX transform
  2. viteCommonjs()                   — CommonJS compat for Compact runtime
  3. wasm()                           — WASM module support
  4. topLevelAwait()                  — Top-level await in Compact runtime
  5. nodePolyfills({ include: ['crypto','buffer','process','stream','util'] })

optimizeDeps.include:
  - '@midnight-ntwrk/compact-js'
  - '@midnight-ntwrk/compact-runtime'

resolve.alias:
  - 'isomorphic-ws' -> src/shims/isomorphic-ws.ts

build.target: 'es2022'
build.commonjsOptions.transformMixedEsModules: true
```

---

## Q9: Exact Files to Copy/Adapt from Flash Loan

### Files to copy directly (minimal changes)

| Flash Loan Source | ShadowPass Target | Changes |
|-------------------|-----------|---------|
| `frontend/src/shims/isomorphic-ws.ts` | `frontend/src/shims/isomorphic-ws.ts` | None |
| `frontend/src/midnight/in-memory-private-state-provider.ts` | Same path | Change `FLASH_LOAN_PRIVATE_STATE_ID` to `SHADOWPASS_PRIVATE_STATE_ID` |
| `frontend/vite.config.ts` | Same path | None (identical config) |
| `frontend/tsconfig.app.json` | Same path | None |
| `frontend/tsconfig.node.json` | Same path | None |
| `frontend/tsconfig.json` | Same path | None |
| `frontend/src/vite-env.d.ts` | Same path | None |

### Files to adapt (significant changes)

| Flash Loan Source | ShadowPass Target | Key Changes |
|-------------------|-----------|-------------|
| `frontend/src/midnight/providers.ts` | Same path | Replace `httpClientProofProvider` with `getProvingProvider` + `createProofProvider`. Remove `PROOF_SERVER_URL` import. |
| `frontend/src/midnight/contract-service.ts` | Same path | Replace Flash Loan contract calls with ShadowPass `proveMembership`. Use `withVacantWitnesses` instead of `withWitnesses`. Remove witness state. |
| `frontend/src/midnight/compiled-contract.ts` | Same path | Re-export from ShadowPass compiled contract |
| `frontend/src/config.ts` | Same path | Change `ZK_ASSETS_BASE` to `/midnight/shadowpass`. Add `SHADOWPASS_CONTRACT_ADDRESS`. Remove `PROOF_SERVER_URL`. |
| `frontend/src/hooks/useMidnight.ts` | Same path | Adapt for ShadowPass-specific state |
| `frontend/src/components/WalletConnect.tsx` | Same path | Adapt for ShadowPass branding |

### Files to create new

| ShadowPass Target | Purpose |
|-----------|---------|
| `frontend/src/components/VerificationPanel.tsx` | Main verification UI |
| `frontend/src/components/StatusBanner.tsx` | Status messages |
| `frontend/src/midnight/types.ts` | ShadowPass-specific types |
| `frontend/scripts/copy-zk-assets.mjs` | Copy compiled contract artifacts |
| `frontend/index.html` | SPA entry |
| `contracts/shadowpass.compact` | Contract source (copy from old ShadowPass) |
| `src/deploy.ts` | Developer-only deployment script |

---

## Q10: Blueprint Corrections / Risks

### Corrections to the Architecture Blueprint

1. **Proof provider approach is WRONG in the blueprint.** The blueprint says to use `httpClientProofProvider(proofServerUrl, zkConfigProvider)`. This is the deprecated Flash Loan approach. ShadowPass MUST use `getProvingProvider()` + `createProofProvider()` instead. This is the single most important architectural change.

2. **The blueprint correctly identifies the contract as compatible.** Runtime version 0.16.0 matches between old ShadowPass and Flash Loan SDK. The compiled contract will work.

3. **The blueprint's risk about proof server is RESOLVED.** With `getProvingProvider`, no proof server is needed at all. The risk is eliminated.

### Remaining Risks

| Risk | Severity | Status |
|------|----------|--------|
| `getProvingProvider` might not work on Preprod wallets | MEDIUM | Must test in Phase 1 |
| Wallet might not support `getProvingProvider` (older wallet version) | LOW | Fallback: use `httpClientProofProvider` with local Docker proof server |
| `persistentCommit` in browser via compact-runtime | LOW | Flash Loan proves compact-runtime works in browser |
| Compiled contract from old ShadowPass compatible with new SDK | LOW | Same runtime version 0.16.0; recompile to be safe |

### Fallback Strategy

If `getProvingProvider` fails on Preprod:
1. Try `config.proverServerUri` (deprecated but may still work)
2. Fall back to `httpClientProofProvider` with `VITE_PROOF_SERVER_URL=http://localhost:6300`
3. Document that evaluator must run `docker compose up proof-server`

This fallback is only needed if the wallet doesn't support the new API.

---

## Implementation Priority for Phase 1

The FIRST thing to build in Phase 1 is a minimal proof-of-concept that:

1. Connects to a Midnight wallet on Preprod
2. Calls `connectedAPI.getConfiguration()` and logs the result
3. Calls `connectedAPI.getProvingProvider(keyMaterialProvider)` and verifies it returns
4. Calls `findDeployedContract` with the existing contract address
5. Calls `deployed.callTx.proveMembership(memberId, salt)`

If steps 1-3 work, the architecture is confirmed. If step 3 fails, switch to fallback.

**Do NOT build UI before confirming the provider assembly works.**
