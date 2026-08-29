# Phase 1 — Result

**Date:** 2026-08-19
**Status:** PASS (build + typecheck)
**Runtime testing:** NOT TESTED (requires browser + Midnight wallet)

## Summary

Phase 1 built the minimal ShadowPass browser proof-of-concept. The entire
chain from `window.midnight` through `getProvingProvider()` to
`findDeployedContract()` is wired in code. TypeScript compiles cleanly and the
Vite production build succeeds. Runtime testing requires a browser with a
Midnight wallet (1AM or Lace) connected to Preprod, which is **not possible in
this headless environment**.

## Test Results

| # | Step | Status | Detail |
|---|------|--------|--------|
| 1 | Wallet discovery (`window.midnight`) | NOT TESTED | Requires browser with wallet extension |
| 2 | `wallet.connect("preprod")` | NOT TESTED | Requires browser with wallet extension |
| 3 | `getConfiguration()` | NOT TESTED | Requires browser with wallet extension |
| 4 | `getShieldedAddresses()` | NOT TESTED | Requires browser with wallet extension |
| 5 | ZK config provider (`FetchZkConfigProvider`) | PASS (code) | Compiles, assets copied to public/ |
| 6 | `asKeyMaterialProvider()` | PASS (code) | Called in `providers.ts:71` |
| 7 | `getProvingProvider()` | PASS (code) | Called in `providers.ts:72` — runtime depends on wallet |
| 8 | `createProofProvider()` | PASS (code) | Called in `providers.ts:73` — runtime depends on wallet |
| 9 | `CompiledContract.withVacantWitnesses()` | PASS | Contract compiled, type-safe |
| 10 | `findDeployedContract()` | NOT TESTED | Requires runtime (wallet + network) |

## Build Results

### TypeScript
```
$ npx tsc -b --noEmit
(clean — no errors)
```

### Vite Production Build
```
$ npm run build
✓ 1346 modules transformed
dist/index.html                                  0.41 kB
dist/assets/midnight_onchain_runtime_wasm_bg.wasm  1,333.65 kB
dist/assets/midnight_ledger_wasm_bg.wasm         10,143.78 kB
dist/assets/index-CQaQRTZD.css                     2.05 kB
dist/assets/index-DtHsDohG.js                   1,504.49 kB
✓ built in 1m
```

### Contract Compilation
```
$ npm run compile
Compiling 1 circuits:
(ok)
```

### ZK Asset Copy
```
$ npm run copy-zk-assets
zkir → frontend/public/midnight/shadowpass/zkir
keys → frontend/public/midnight/shadowpass/keys
index.js → frontend/src/compiled-contract.js
index.d.ts → frontend/src/compiled-contract.d.ts
```

## Issues Found and Fixed

### 1. `@swc/core` version incompatibility
**Problem:** `@swc/core` 1.16.1 (latest) has a breaking API change that
crashes `vite-plugin-top-level-await` with `missing field 'type'` error.

**Fix:** Pinned `@swc/core` to 1.15.47 via `overrides` in `frontend/package.json`.

### 2. Incorrect import names
**Problem:** Several imports used wrong case:
- `FetchZKConfigProvider` → `FetchZkConfigProvider`
- `IndexerPublicDataProvider` (class) → `indexerPublicDataProvider` (function)
- `NetworkId` and `TransactionProvider` are not exported from `midnight-js-types`

**Fix:** Used actual exports from installed packages. Verified via `.d.ts` files.

### 3. `CompiledContract` not exported from `midnight-js-contracts`
**Problem:** `CompiledContract` is from `@midnight-ntwrk/compact-js`, not
`midnight-js-contracts`.

**Fix:** Changed import to `import { CompiledContract } from '@midnight-ntwrk/compact-js'`.

### 4. `findDeployedContract` API signature
**Problem:** Initially used positional arguments, but the actual API takes an
options object `{ compiledContract, contractAddress, ... }`.

**Fix:** Updated `contract-service.ts` to use options object syntax matching
the Flash Loan pattern.

### 5. Provider shape mismatch
**Problem:** The provider interface used `transaction: TransactionProvider` but
the actual `MidnightProviders` interface uses `walletProvider` and
`midnightProvider` separately.

**Fix:** Restructured `ShadowPassProviders` to match the exact
`MidnightProviders<PCK, PSI, PS>` shape from `midnight-js-types`.

### 6. ZK asset paths
**Problem:** `copy-zk-assets.mjs` looked for ZK assets under
`contracts/managed/shadowpass/compiler/` but `compact compile` places them at
`contracts/managed/shadowpass/`.

**Fix:** Updated `MANAGED` path in the copy script.

## File Structure

```
ShadowPass/
├── contracts/
│   ├── shadowpass.compact              # Compact source (same as V1)
│   └── managed/shadowpass/             # Compiled output
│       ├── compiler/contract-info.json
│       ├── contract/{index.js,index.d.ts}
│       ├── keys/{proveMembership.prover,proveMembership.verifier}
│       └── zkir/{proveMembership.zkir,proveMembership.bzkir}
├── docs/
│   ├── ARCHITECTURE-BLUEPRINT.md
│   ├── PHASE-0-FEASIBILITY.md
│   └── PHASE-1-RESULT.md              # This file
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── scripts/copy-zk-assets.mjs
│   ├── src/
│   │   ├── config.ts                   # Network + contract config
│   │   ├── App.tsx                     # Phase 1 test UI
│   │   ├── main.tsx                    # React entry
│   │   ├── index.css                   # Minimal dark styles
│   │   ├── compiled-contract.{js,d.ts} # Generated by copy script
│   │   ├── shims/isomorphic-ws.ts      # Browser WebSocket shim
│   │   ├── midnight/
│   │   │   ├── providers.ts            # 7-provider assembly (CRITICAL)
│   │   │   ├── contract-service.ts     # findDeployedContract
│   │   │   ├── compiled-contract.ts    # Re-export wrapper
│   │   │   ├── in-memory-private-state-provider.ts
│   │   │   └── types.ts
│   │   └── hooks/
│   │       └── usePhase1.ts            # Step-by-step chain test hook
│   └── public/midnight/shadowpass/     # ZK assets for FetchZkConfigProvider
├── package.json                        # Root (compile + deps)
├── tsconfig.json
└── vitest.config.ts
```

## Key Architecture Decisions

### 1. No proof server
The Flash Loan project uses `httpClientProofProvider(proverServerUrl, zkConfigProvider)` which requires a local Docker proof server. ShadowPass replaces this with:

```typescript
const keyMaterialProvider = zkConfigProvider.asKeyMaterialProvider();
const provingProvider     = await connectedAPI.getProvingProvider(keyMaterialProvider);
const proofProvider       = createProofProvider(provingProvider);
```

This is the **browser-native** proving path confirmed by Phase 0.

### 2. Provider shape
`ShadowPassProviders` matches the exact `MidnightProviders` interface:
- `zkConfigProvider` → `FetchZkConfigProvider` (local static assets)
- `proofProvider` → from `createProofProvider(provingProvider)`
- `privateStateProvider` → `InMemoryPrivateStateProvider` (browser only)
- `publicDataProvider` → `indexerPublicDataProvider()` (Preprod indexer)
- `walletProvider` → cast from `ConnectedAPI`
- `midnightProvider` → cast from `ConnectedAPI`

### 3. CompiledContract
Uses `CompiledContract.make('shadowpass', Contract).pipe(CC.withVacantWitnesses())` — identical to Flash Loan pattern but without witnesses.

## Exact Next Step

**Runtime testing in a real browser with a Midnight wallet on Preprod.**

This requires:
1. Open `frontend/dist/index.html` (or `npm run dev`) in a browser with 1AM or Lace wallet
2. Click "Connect via [wallet name]"
3. Confirm all 8 steps show PASS
4. If `getProvingProvider()` fails at runtime, STOP and report the exact error

The build is complete. The code is type-safe. The only remaining question is
whether `getProvingProvider()` succeeds in a real browser wallet context.

## Risk

`getProvingProvider()` has **never been tested in a real browser**. Phase 0
inferred it works based on API type analysis. If it fails at runtime:

- Do NOT fall back to `httpClientProofProvider`
- Do NOT install a proof server
- STOP and report the exact error with wallet version info
