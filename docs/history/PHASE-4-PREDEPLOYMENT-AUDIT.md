# Phase 4 — Predeployment Audit

## 1. Architecture Verification

### Runtime Flow (browser only)
```
Evaluator opens Netlify URL
  → React/Vite app loads
  → Connects wallet via DApp Connector
  → buildProviders() assembles 7 providers (NO proof server)
  → findDeployedContract() loads existing contract by address
  → Evaluator enters memberId + salt
  → Browser generates Groth16 ZK proof via wallet's getProvingProvider()
  → Transaction submitted via wallet
  → Contract verifies proof, increments accessCount
```

### Files Audited (16/16)

| # | File | Backend Dep | Status |
|---|------|-------------|--------|
| 1 | `contracts/shadowpass.compact` | None | PASS |
| 2 | `contracts/managed/` (compiled output) | None | PASS |
| 3 | `frontend/src/config.ts` | None (env vars only) | PASS |
| 4 | `frontend/src/midnight/providers.ts` | None (browser providers) | PASS |
| 5 | `frontend/src/midnight/contract-service.ts` | None (browser-only) | PASS |
| 6 | `frontend/src/hooks/useMidnight.ts` | None | PASS |
| 7 | `frontend/src/hooks/useShadowPass.ts` | None | PASS |
| 8 | `frontend/src/components/CredentialCard.tsx` | None | PASS |
| 9 | `frontend/src/components/VerificationStatus.tsx` | None | PASS |
| 10 | `frontend/src/components/AccessCounter.tsx` | None | PASS |
| 11 | `frontend/src/App.tsx` | None | PASS |
| 12 | `tests/shadowpass.test.ts` | None (Node test) | PASS |
| 13 | `docs/DEMO-CREDENTIALS.md` | None (docs) | PASS |
| 14 | `README.md` | None (docs) | PASS |
| 15 | `PROPOSAL.md` | None (docs) | PASS |
| 16 | `.github/workflows/ci.yml` | None (CI) | PASS |

## 2. Backend Dependency Check

### Checked (all NEGATIVE — no backend found)
- `server/` directory: **DOES NOT EXIST**
- `Dockerfile` / `docker-compose.yml`: **DOES NOT EXIST**
- `src/` directory at root: **DOES NOT EXIST**
- `express` / `rest` / `api` imports in source: **NONE**
- `MIDNIGHT_SEED` in source: **NONE**
- `proof-server` / `httpClientProofProvider` in frontend source: **NONE**
- `localhost` fetch calls in frontend: **NONE**
- Database / ORM imports: **NONE**

### Documentation mentions (informational only, not runtime)
The following files mention "backend", "proof-server", "Docker" etc. in documentation describing what ShadowPass does NOT use:
- `docs/ARCHITECTURE-BLUEPRINT.md` — describes Old ShadowPass architecture and what ShadowPass avoids
- `docs/PHASE-0-FEASIBILITY.md` — feasibility analysis mentioning V1 deps
- `docs/PHASE-2-DESIGN.md` — design doc comparing Old ShadowPass vs ShadowPass
- `README.md` — states "no backend, no proof server"
- `PROPOSAL.md` — states "No backend, no proof server, no database"

These are documentation references, NOT runtime dependencies.

## 3. Wallet-Independence Verification

### Contract (shadowpass.compact)
```compact
export circuit proveMembership(memberId: Bytes<32>, salt: Bytes<32>): [] {
  const claim = persistentCommit<Bytes<32>>(memberId, salt);
  assert(
    (claim == allowlist[0]) || ... || (claim == allowlist[7]),
    "Not an authorized member"
  );
  accessCount = accessCount + 1;
}
```

**The circuit parameters are `(memberId, salt)`. There is NO wallet address parameter.**

The wallet address is only the transaction signer — it pays the transaction fee and provides the proving key, but it is NEVER part of the membership identity check.

### Verification Flow
1. `useShadowPass.ts:59` — `deployed.callTx.proveMembership(memberIdBytes, saltBytes)`
2. Only `memberId` (32 bytes) and `salt` (32 bytes) are passed to the circuit
3. The wallet's role is transaction signing and proving — not identity

## 4. Contract Behavior Summary

| Question | Answer |
|----------|--------|
| How are commitments stored? | As 8 `Bytes<32>` values in `allowlist: Vector<8, Bytes<32>>`, initialized by constructor |
| How does a user prove membership? | By calling `proveMembership(memberId, salt)` with credentials that produce a `persistentCommit` matching one of the 8 allowlist entries |
| How are memberId and salt used? | Together they compute `persistentCommit<Bytes<32>>(memberId, salt)`, which is checked against all 8 allowlist entries |
| Is wallet address involved in membership? | **NO** — the wallet address is only the transaction signer |
| What does the verifier learn? | That the prover knows SOME valid `(memberId, salt)` pair in the allowlist |
| What can the verifier NOT learn? | Which specific allowlist entry matched, the raw memberId, or the raw salt |
| How is accessCount stored? | As `accessCount: Field` (initially 0) in the ledger |
| Does verification increment accessCount? | **YES** — `accessCount = accessCount + 1` on success |
| What happens for invalid credential? | The `assert` fails with "Not an authorized member" — transaction reverts, accessCount unchanged |
| Does the contract have exactly the required functionality? | **YES** — constructor sets allowlist, `proveMembership` verifies ZK proof and increments counter |

## 5. Commitment Consistency Verification

### Recalculated Values
```
MEMBER_ID:   deadbeef000000000000000000000000000000000000000000000000deadbeef
SALT:        cafebabe000000000000000000000000000000000000000000000000cafebabe
COMMITMENT:  c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e
LENGTH:      32 bytes
```

Computed using: `ocrt.persistentCommit(new ocrt.CompactTypeBytes(32), memberId, salt)` from `@midnight-ntwrk/compact-runtime`

### Consistency Search

| Location | memberId | salt | commitment | Consistent? |
|----------|----------|------|------------|-------------|
| `docs/DEMO-CREDENTIALS.md` (line 10-11, 19, 29) | deadbeef... | cafebabe... | c14369b795...658e | YES |
| `frontend/src/config.ts` (line 31, 36, 41) | deadbeef... | cafebabe... | c14369b795...658e | YES |
| `frontend/src/components/CredentialCard.tsx` (line 10-11) | deadbeef... (via config) | cafebabe... (via config) | N/A (uses config) | YES |
| `tests/shadowpass.test.ts` (line 45-46) | N/A (uses random for test) | N/A (uses random for test) | N/A | YES (tests use `commitment()` helper which matches contract) |
| `README.md` (line 89-90) | deadbeef... | cafebabe... | (not listed) | PARTIAL — commitment not shown |
| `PROPOSAL.md` | N/A (general description) | N/A | N/A | YES (no specific values) |

**VERDICT: The commitment `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` is consistent across all source files that use it.**

The README.md does not list the commitment value (only memberId and salt). This is acceptable — the README links to `docs/DEMO-CREDENTIALS.md` which contains the full commitment.

## 6. Deployment Inputs

### Network
- **Midnight Preprod**

### Contract
- **ShadowPass** (identical bytecode to Old ShadowPass — same Compact source)

### Constructor Arguments
```typescript
members: Vector<8, Bytes<32>> = [
  // Slot 0: Demo credential commitment
  hexToBytes('c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e'),
  // Slots 1-7: Random filler commitments (generated at deployment time)
  randomBytes(32),
  randomBytes(32),
  randomBytes(32),
  randomBytes(32),
  randomBytes(32),
  randomBytes(32),
  randomBytes(32),
]
```

### Initial Ledger State
```
allowlist[0] = c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e
allowlist[1-7] = <random 32-byte values>
accessCount = 0
```

### Private State
- Empty `{}` (the circuit has no witnesses or private state)

## 7. Proposed Deployment Method

### Architecture
```
Netlify (static)
  → ShadowPass React/Vite
  → Midnight DApp Connector (wallet extension)
  → Evaluator's wallet (transaction signer)
  → Midnight Preprod
  → ONE deployed ShadowPass contract (address hardcoded in config)
```

### Deployment Steps (ONE-TIME MANUAL OPERATION)
1. Evaluator connects wallet to Midnight Preprod
2. Wallet is funded with test tDUST from faucet
3. Deployer calls contract constructor with 8-member allowlist
4. Contract is deployed; address is obtained
5. Contract address is hardcoded in `frontend/src/config.ts` (or `.env`)
6. Frontend is built and deployed to Netlify
7. **The frontend NEVER deploys a contract — it only connects to the existing deployment**

### Post-Deployment
- The contract address becomes PUBLIC metadata
- The frontend reads `CONTRACT_ADDRESS` from config
- No automatic deployment from the live application

## 8. Required Wallet/Faucet State

- A Midnight wallet (1AM or Lace) connected to Preprod
- Test tDUST from the Midnight Preprod faucet (no real money)
- The wallet's ONLY role is: transaction signing + ZK proof generation
- The wallet address is NEVER part of the membership identity

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Wallet does not support `getProvingProvider` | LOW | Verified working in Phase 1 browser test with 1AM wallet |
| Insufficient tDUST for deployment | LOW | Faucet provides test tokens |
| Contract address changes if redeployed | N/A | Single-contract; address is hardcoded in config |
| Reveal of demo credentials | NONE | Credentials are intentionally public |
| Frontend accidentally deploys contract | NONE | Frontend only uses `findDeployedContract()`, never `deployContract()` |

## 10. Validation Results

| Check | Result |
|-------|--------|
| `npm run compile` | PASS |
| `npm test` | PASS (13/13) |
| `npm run build --prefix frontend` | PASS |
| Root TypeScript (`tsc --noEmit`) | PASS |
| Frontend TypeScript (`tsc -b --noEmit`) | PASS |
| Backend dependency search | NONE FOUND |
| Commitment consistency | CONSISTENT |
| Git status | Not a git repository (needs `git init`) |

## 11. Final Decision

### READY FOR ONE-TIME PREPROD DEPLOYMENT

All checks pass. The implementation is:
- A complete Midnight dApp (no backend, no proof server, no database)
- Wallet-independent (membership via `persistentCommit(memberId, salt)`, not wallet address)
- Commitment-consistent (`c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` in all source files)
- Test-verified (13/13 tests pass, including Groth16 proof generation)
- Type-safe (both root and frontend TypeScript checks pass)
- Buildable (frontend production build succeeds)

### Next Command/Action for Deployment

The deployment is a **manual one-time operation** performed by the deployer:

```bash
# 1. Connect wallet to Midnight Preprod
# 2. Fund wallet with test tDUST from faucet
# 3. Deploy contract using wallet UI or Midnight CLI
#    Constructor arg: allowlist with 8 commitments
#    Slot 0: c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e
#    Slots 1-7: random 32-byte values
# 4. Copy the deployed contract address
# 5. Update CONTRACT_ADDRESS in frontend/src/config.ts or .env:
#    `VITE_CONTRACT_ADDRESS=<new ShadowPass address>`
# 6. Rebuild frontend:
#    npm run build --prefix frontend
# 7. Deploy frontend/dist to Netlify
```

**DO NOT proceed with deployment automatically. This document is a PRE-DEPLOYMENT AUDIT ONLY.**
