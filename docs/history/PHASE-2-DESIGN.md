# ShadowPass — Phase 2 Design

> Investigation + Design only. No implementation.
> Date: 2026-08-19
> Status: READY FOR REVIEW

---

## 1. V1 Contract Architecture (CONFIRMED FROM CODE)

Source: `~/projects/ShadowPass/contracts/shadowpass.compact`

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

### On-chain state

| Field | Type | Visibility | Description |
|-------|------|------------|-------------|
| `allowlist` | `Vector<8, Bytes<32>>` | PUBLIC | 8 Pedersen commitments, disclosed at deployment |
| `accessCount` | `Field` | PUBLIC | Incremented on each successful proof |

### Constructor

- Takes `members: Vector<8, Bytes<32>>` — an array of 8 pre-computed Pedersen commitments
- `allowlist = disclose(members)` — writes all 8 commitments to the public ledger
- After deployment, the allowlist is **immutable** (no admin circuit, no update mechanism)

### Circuit: proveMembership

**Inputs (private — never on-chain):**
| Parameter | Type | Description |
|-----------|------|-------------|
| `memberId` | `Bytes<32>` | 32-byte private member identifier |
| `salt` | `Bytes<32>` | 32-byte random nonce bound to the memberId |

**Circuit logic (CONFIRMED FROM CODE):**
1. Compute `claim = persistentCommit<Bytes<32>>(memberId, salt)` — Pedersen commitment
2. Assert `claim` equals one of `allowlist[0]` through `allowlist[7]`
3. If assertion passes: `accessCount = accessCount + 1`
4. If assertion fails: transaction reverts with "Not an authorized member"

**Outputs:**
| Return | Type | Description |
|--------|------|-------------|
| Circuit output | `[]` | Empty — no private data is leaked |
| Public transcript | — | Contains only the proof, no member data |
| Side effect | — | `accessCount` increments by 1 |

---

## 2. V1 Membership Model (CONFIRMED FROM CODE)

### Commitment construction

Source: `~/projects/ShadowPass/server/contract.ts:119-127`

```typescript
const commitment = (memberId: Uint8Array, salt: Uint8Array) =>
  ocrt.persistentCommit(new ocrt.CompactTypeBytes(32), memberId, salt);

function computeCommitment(memberIdHex: string, saltHex: string): string {
  const memberIdBytes = Buffer.from(memberIdHex, 'hex');
  const saltBytes = Buffer.from(saltHex, 'hex');
  const comm = commitment(memberIdBytes, saltBytes);
  return Buffer.from(comm).toString('hex');
}
```

**Commitment = `persistentCommit(Pedersen, memberId, salt)`** — a Pedersen hash of two 32-byte inputs.

### Allowlist construction

Source: `~/projects/ShadowPass/server/contract.ts:129-135`

```typescript
function makeAllowlist(memberId: Uint8Array, salt: Uint8Array): Uint8Array[] {
  const entries: Uint8Array[] = [commitment(memberId, salt)];
  while (entries.length < MAX_MEMBERS) {  // MAX_MEMBERS = 8
    entries.push(commitment(random32(), random32()));
  }
  return entries;
}
```

Slot 0 = real member commitment. Slots 1-7 = random filler commitments (different random each deployment).

### Verification flow (V1 server-side)

Source: `~/projects/ShadowPass/server/contract.ts:498-558`

```typescript
const tx = await state.deployed.callTx.proveMembership(memberIdBytes, saltBytes);
if (tx.public.status !== SucceedEntirely) {
  return { granted: false, ... };
}
const ledger = state.contractModule.ledger(tx.public.nextContractState);
return { granted: true, accessCount: Number(ledger.accessCount), ... };
```

**Key: `callTx.proveMembership(memberId, salt)` takes the raw private credentials.** The SDK internally generates the Groth16 proof, submits the transaction, and returns the result. The caller never sees the proof data — only the transaction status and resulting state.

---

## 3. Wallet Independence Audit (CONFIRMED FROM CODE)

### Does the membership identity involve a wallet address?

**NO.** The membership identity is exclusively:

```
membership credential = (memberId: Bytes<32>, salt: Bytes<32>)
membership commitment = persistentCommit(memberId, salt)
```

The wallet address is **never** involved in:
- The commitment computation
- The circuit inputs
- The allowlist entries
- The proof generation
- The on-chain state

### Evidence from V1 code

**Contract** (`shadowpass.compact:12`):
```compact
export circuit proveMembership(memberId: Bytes<32>, salt: Bytes<32>): []
```
No wallet address parameter. No address-derived value.

**Circuit logic** (`shadowpass.compact:13`):
```compact
const claim = persistentCommit<Bytes<32>>(memberId, salt);
```
Commitment depends only on `memberId` and `salt`.

**Server verification** (`server/contract.ts:512-516`):
```typescript
const memberIdBytes = Buffer.from(memberId, 'hex');
const saltBytes = Buffer.from(salt, 'hex');
const tx = await state.deployed.callTx.proveMembership(memberIdBytes, saltBytes);
```
Only `memberId` and `salt` are passed to the circuit. The server wallet address is used only for transaction signing/balancing, not for membership identity.

**Test confirmation** (`test/shadowpass.test.ts:116-117`):
```typescript
const memberId = random32();
const salt = random32();
```
Test credentials are independent of any wallet.

### Wallet role in ShadowPass

In ShadowPass, the browser wallet provides:
- `balanceTx()` — transaction balancing (fee payment)
- `submitTx()` — transaction submission to the network
- `getCoinPublicKey()` / `getEncryptionPublicKey()` — shielded keys for transaction privacy

**The wallet is a transaction signer and fee payer. It is NOT the membership identity.**

### Can the same credential work from two different wallets?

**YES.** If Wallet A and Wallet B both know the same `(memberId, salt)` pair, either can generate a valid proof. The proof is bound to the credential, not the wallet.

**CONFIRMED FROM CODE:** The circuit verifies `persistentCommit(memberId, salt)` matches the allowlist. No wallet address is checked.

---

## 4. Existing Test Vector Analysis (CONFIRMED FROM CODE)

### V1 test credentials

Source: `~/projects/ShadowPass/test/shadowpass.test.ts:116-117`

```typescript
const memberId = random32();  // crypto.randomBytes(32) — random, non-deterministic
const salt = random32();      // crypto.randomBytes(32) — random, non-deterministic
```

The V1 tests use **random** credentials generated at test startup. They are not deterministic across test runs.

### Allowlist used in tests

Source: `test/shadowpass.test.ts:104-110,170`

```typescript
allowlist = makeAllowlist(memberId, salt);  // [commitment(memberId, salt), 7 random fillers]
deployed = await deploy(allowlist);
```

### Test vectors summary

| Vector | Value | Deterministic? |
|--------|-------|----------------|
| `memberId` | `random32()` | NO — generated fresh each run |
| `salt` | `random32()` | NO — generated fresh each run |
| `allowlist[0]` | `commitment(memberId, salt)` | Derived from above |
| `allowlist[1..7]` | `commitment(random32(), random32())` | Random fillers |
| `KEY_SEED` | `6e0f4a3c9b1d7e5a...` (32 bytes hex) | YES — deterministic |
| `CIRCUIT_ID` | `"proveMembership"` | YES — constant |
| `KEY_LOCATION` | `"shadowpass/proveMembership"` | YES — constant |

### Can Old ShadowPass test credentials be reused for ShadowPass?

**Not directly.** Old ShadowPass tests generate random credentials at runtime. For ShadowPass, we need **fixed** credentials that correspond to the deployed contract's allowlist. The allowlist is set at deployment time and cannot be changed.

### Integration test credentials

Source: `~/projects/ShadowPass/src/integrate.ts:194-197`

```typescript
const authorizedMemberId = random32();
const authorizedSalt = random32();
const unauthorizedMemberId = random32();
const unauthorizedSalt = random32();
```

Same pattern — random, non-deterministic. The integration test deploys its own contract with its own allowlist.

### V1 Enroll page credentials

Source: `~/projects/ShadowPass/frontend/src/pages/Enroll/Enroll.tsx:6-9`

```typescript
function generateHex64(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
```

The V1 frontend generates credentials client-side, then calls `POST /api/commitment` (server) to compute the Pedersen commitment. The commitment is then manually included in the next contract deployment.

---

## 5. Old ShadowPass Architecture vs ShadowPass Architecture

### V1 (server-dependent)

```
Browser (React SPA)
  │
  ├── 1AM/Lace wallet → wallet identity only
  │
  └── HTTP → Node.js API Server
                │
                ├── MIDNIGHT_SEED → server wallet
                ├── proof-server (Docker) → ZK proof generation
                ├── wallet-sdk → sync, DUST, balance
                └── Compact runtime → contract execution
```

- Server owns the wallet, the proof, and the transaction
- Browser is a thin UI layer
- Backend dependency: Express, proof-server Docker, MIDNIGHT_SEED

### ShadowPass dApp Architecture

```
Netlify (static files)
  │
  └── React + Vite SPA
        │
        ├── 1AM/Lace wallet → transaction signer + fee payer
        │     ├── wallet.connect('preprod') → ConnectedAPI
        │     ├── getProvingProvider() → browser-side ZK proving
        │     ├── balanceUnsealedTransaction() → fee balancing
        │     └── submitTransaction() → network submission
        │
        ├── Compiled contract JS (bundled)
        ├── ZK assets (static in public/)
        ├── InMemoryPrivateStateProvider (empty)
        └── findDeployedContract() → loads on-chain state
```

- Wallet provides all infrastructure via DApp Connector
- No server, no Docker, no seed, no backend
- ZK proofs generated in-browser via `getProvingProvider()`

---

## 6. ShadowPass Credential Model (PROPOSED)

### The problem

The contract's allowlist is immutable after deployment. The allowlist contains 8 Pedersen commitments. Only credentials whose commitment matches one of these 8 entries can produce valid proofs.

For a **public demo** on Netlify, we need a credential model that:
1. Works with a single pre-deployed contract
2. Doesn't require a backend to issue credentials
3. Lets anyone (including the evaluator) demonstrate the full flow
4. Is clearly documented as a demo, not a production enrollment system

### Recommended model: Deterministic demo credential

**Approach:**
1. Choose a deterministic `memberId` and `salt` (documented, testable)
2. Pre-compute `commitment = persistentCommit(memberId, salt)`
3. Deploy the ShadowPass contract with this commitment in slot 0
4. Fill slots 1-7 with random filler commitments
5. Embed the demo `memberId` and `salt` in the frontend UI (public, intentional)
6. The evaluator enters these credentials, browser generates the ZK proof, contract verifies

**Why this works for a demo:**
- Credentials are public → this IS the point of a demo. The privacy guarantee is that the ZK proof doesn't reveal which allowlist entry matched, not that the demo credentials are secret.
- No enrollment step needed → evaluator enters the posted credentials
- Single contract → no redeployment, no backend
- Reproducible → anyone can verify the demo works

**Why this is honest:**
- The README explains that production enrollment would use an issuer who generates credentials and only shares the commitment with the contract deployer
- The demo uses publicly posted credentials to demonstrate the ZK proof flow
- The privacy model still holds: even though the credentials are public, the ZK proof proves membership without revealing which allowlist slot matched

### Credential format

```
DEMO_MEMBER_ID = <64 hex characters>  (32 bytes, deterministic)
DEMO_SALT      = <64 hex characters>  (32 bytes, deterministic)
DEMO_COMMITMENT = persistentCommit(DEMO_MEMBER_ID, DEMO_SALT)  (computed once, embedded in contract)
```

### Production enrollment model (documented, not implemented)

In a production system:
1. An issuer generates `memberId + salt` for each authorized member
2. The issuer computes `commitment = persistentCommit(memberId, salt)`
3. The issuer shares only the commitment with the contract deployer
4. The member receives their private `(memberId, salt)` securely
5. The member uses their credential to generate ZK proofs

ShadowPass demonstrates this pattern with public demo credentials. The architecture supports production enrollment without structural changes — only the credential distribution mechanism changes.

---

## 7. How Members Obtain memberId + Salt

### For the ShadowPass demo (PROPOSED)

The frontend displays the demo credentials directly:

```
╔══════════════════════════════════════════════════╗
║  Demo Membership Credentials                     ║
║                                                  ║
║  Member ID: <64 hex chars>                       ║
║  Salt:      <64 hex chars>                       ║
║                                                  ║
║  These credentials are pre-authorized for this   ║
║  demonstration. Enter them to verify membership. ║
╚══════════════════════════════════════════════════╝
```

### Flow

1. Evaluator opens the Netlify site
2. Connects their Midnight wallet (1AM or Lace)
3. Sees the demo credentials displayed on the page
4. Enters (or copies) the `memberId` and `salt` into the verification form
5. Clicks "Verify Membership"
6. Browser computes `commitment = persistentCommit(memberId, salt)`
7. Browser generates Groth16 ZK proof via `getProvingProvider()`
8. Browser submits transaction via wallet
9. Contract verifies, increments `accessCount`
10. UI displays "Access Granted" + new `accessCount`

### Why not browser enrollment?

Browser enrollment (generating random `memberId + salt` in the browser) would require the corresponding commitment to already be in the on-chain allowlist. Since the allowlist is immutable after deployment, we cannot add new commitments dynamically.

**CONFIRMED FROM CODE:** The V1 `Enroll.tsx` generates credentials client-side but then calls `POST /api/commitment` (server) to compute the commitment. The commitment must be manually placed in the allowlist before the next contract deployment. This flow requires a backend.

For ShadowPass's single-contract, no-backend architecture, pre-issued demo credentials are the only viable approach.

---

## 8. Proposed Contract Changes (PROPOSED)

### Recommendation: NO CHANGES

**The ShadowPass contract should be identical to Old ShadowPass.**

```
contracts/shadowpass.compact — IDENTICAL TO V1
```

**Rationale:**
- The V1 circuit already implements exactly the right privacy model
- `persistentCommit(memberId, salt)` + assert against allowlist = correct membership verification
- Circuit output `[]` = no private data leaked
- `accessCount` = public counter without identity linkage
- `Vector<8, Bytes<32>>` = fixed-size allowlist, simple and auditable
- No witnesses needed = simpler browser proving via `withVacantWitnesses`

### What changes between Old ShadowPass and ShadowPass

| Aspect | Old ShadowPass | ShadowPass |
|--------|----|----|
| Contract code | `shadowpass.compact` | **Same** — no changes |
| Deployment | Server deploys on first verify | Developer deploys manually before Netlify deploy |
| Allowlist contents | Random per deployment | Deterministic demo commitment in slot 0 |
| Proof generation | Server-side proof-server | Browser-side `getProvingProvider()` |
| Transaction signing | Server wallet (MIDNIGHT_SEED) | Evaluator's browser wallet |
| Frontend/backend | React SPA + Express backend | React SPA only (Netlify) |

---

## 9. Proposed ShadowPass Frontend Verification Flow (PROPOSED)

```
┌─────────────────────────────────────────────────────────┐
│                    Evaluator Opens Site                  │
│                   (Netlify static files)                │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              1. Connect Midnight Wallet                 │
│         window.midnight → wallet.connect('preprod')    │
│         Returns ConnectedAPI                           │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              2. Build Providers                         │
│    zkConfigProvider (FetchZkConfigProvider)             │
│    provingProvider (getProvingProvider)                  │
│    publicDataProvider (indexerPublicDataProvider)       │
│    privateStateProvider (InMemory, empty)               │
│    walletProvider + midnightProvider (from wallet)      │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              3. Load Deployed Contract                  │
│    findDeployedContract(providers, {                    │
│      compiledContract: ShadowPass,                     │
│      contractAddress: V2_CONTRACT_ADDRESS               │
│    })                                                  │
│    Returns: deployed.callTx interface                   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              4. Evaluator Enters Credentials            │
│    memberId: <demo credential from UI>                 │
│    salt:      <demo credential from UI>                │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              5. Generate ZK Proof (Browser)             │
│    deployed.callTx.proveMembership(                     │
│      memberIdBytes,                                    │
│      saltBytes                                         │
│    )                                                   │
│    Internally:                                         │
│      - compact-runtime computes persistentCommit       │
│      - generates Groth16 proof via provingProvider      │
│      - balances transaction via walletProvider          │
│      - submits via midnightProvider                     │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              6. Display Result                          │
│    tx.public.status === 'SucceedEntirely'              │
│    → "Access Granted"                                  │
│    → accessCount: N+1                                  │
│                                                         │
│    tx.public.status !== 'SucceedEntirely'              │
│    → "Access Denied"                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Privacy Model (CONFIRMED FROM CODE)

### What an observer CAN see

| Observable | Source | Details |
|------------|--------|---------|
| Contract address | Public ledger | The ShadowPass contract's address is public |
| Transaction existence | Blockchain | A verify transaction occurred at block X |
| Transaction metadata | Blockchain | Timestamp, block height, fee, signer address |
| Public `accessCount` | `ledger.accessCount` | Total successful verifications (counter only) |
| Allowlist commitments | `ledger.allowlist` | 8 Pedersen commitments (public, disclosed at deploy) |
| Signer wallet address | Transaction | The wallet that submitted the transaction |

### What an observer CANNOT learn

| Protected | Why | Evidence |
|-----------|-----|----------|
| `memberId` | Never stored on-chain | Circuit input `[]` return, no memberId in ledger or transcript |
| `salt` | Never stored on-chain | Same as above |
| Which allowlist slot matched | Circuit checks all 8 in parallel | `assert(claim == allowlist[0] \|\| ... \|\| claim == allowlist[7])` |
| Link between proof and specific member | ZK proof is unlinkable to credential | Groth16 proof reveals only "member of set" |
| Private transcript outputs | Circuit returns `[]` | `test/shadowpass.test.ts:279`: `expect(callResult.private.output.value).toEqual([])` |

### What the evaluator's wallet address reveals

- The wallet address is visible as the transaction signer
- This proves "wallet X submitted a verify transaction"
- But the wallet address is NOT linked to the membership credential
- The same `(memberId, salt)` could be used from any wallet

### Privacy limitation (honest disclosure)

- The `allowlist` is public (8 commitments visible on-chain)
- If an attacker knows the mapping `(commitment → member identity)`, they can de-anonymize
- In the ShadowPass demo, the demo credential is public, so this mapping is trivially known
- In a production system, the commitment-to-identity mapping would be kept secret by the issuer

### README-ready privacy explanation

```
SHADOWPASS PRIVACY MODEL

ShadowPass uses zero-knowledge proofs to verify membership without
revealing identity. Here is what an observer can and cannot learn:

CAN LEARN:
  - That a verification transaction occurred
  - The total number of successful verifications (accessCount)
  - The on-chain allowlist commitments (8 Pedersen commitments)
  - The wallet address that submitted the transaction

CANNOT LEARN:
  - The memberId of the person who proved membership
  - The salt used in the commitment
  - Which specific allowlist entry produced the match
  - Any link between the proof and a specific identity

HOW IT WORKS:
  1. Your memberId + salt are private inputs to the circuit
  2. The circuit computes persistentCommit(memberId, salt)
  3. The circuit asserts this commitment matches one of 8 on-chain entries
  4. The Groth16 proof proves "I know a valid credential" without
     revealing which credential or which allowlist entry matched
  5. The only on-chain effect is accessCount incrementing by 1

SCOPE NOTE:
  The privacy guarantee applies to the membership proof itself.
  Other blockchain activity (wallet addresses, transactions) follows
  Midnight's standard privacy model.
```

---

## 11. Single Contract Deployment Model (PROPOSED)

### Deployment lifecycle

```
Developer (before Netlify deploy)
  │
  ├── 1. Generate demo credentials:
  │      memberId = deterministic 32-byte value
  │      salt = deterministic 32-byte value
  │      commitment = persistentCommit(memberId, salt)
  │
  ├── 2. Build allowlist:
  │      [commitment, random_filler_1, ..., random_filler_7]
  │
  ├── 3. Deploy contract using server/integrate.ts:
  │      deployContract(providers, { args: [allowlist] })
  │
  ├── 4. Record contract address in config:
  │      VITE_CONTRACT_ADDRESS=<deployed address>
  │
  └── 5. Commit config to repo, deploy to Netlify

Evaluator (at Netlify site)
  │
  ├── 1. Connect wallet
  ├── 2. Enter demo credentials
  ├── 3. Click "Verify Membership"
  └── 4. Transaction submitted to the ONE pre-deployed contract
```

### What never happens at runtime

- No contract deployment
- No wallet creation/sync from seed
- No DUST generation
- No new addresses generated
- No server-side operations
- No automatic deployment

### Frontend configuration

```typescript
// frontend/src/config.ts
export const V2_CONTRACT_ADDRESS = '0x...'; // Set after deployment
export const NETWORK_ID = 'preprod';
export const INDEXER_URL = 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS_URL = 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';
export const ZK_ASSETS_BASE = `${window.location.origin}/midnight/shadowpass`;

// Demo credentials (public, intentional)
export const DEMO_MEMBER_ID = '...';  // 64 hex chars
export const DEMO_SALT = '...';       // 64 hex chars
```

---

## 12. Test Plan for Level 3 (PROPOSED)

### Test categories

**Category A: Unit tests (no wallet needed, run in CI)**

These test the Compact circuit logic using the local Compact runtime (same approach as V1 `test/shadowpass.test.ts`).

| # | Test | What it proves | V1 equivalent |
|---|------|----------------|---------------|
| 1 | Valid membership: `proveMembership` with credentials in allowlist succeeds, `accessCount` increments | Authorization works | `shadowpass.test.ts:181-200` |
| 2 | Invalid membership: `proveMembership` with random credentials fails, `accessCount` unchanged | Unauthorized access is rejected | `shadowpass.test.ts:221-253` |
| 3 | No data exposed: ledger contains only `accessCount` + `allowlist`, raw `memberId`/`salt` never appear in state or transcript | Privacy guarantee holds | `shadowpass.test.ts:256-296` |
| 4 | Commitment determinism: same `(memberId, salt)` → same commitment; different input → different commitment | Pedersen commitment is deterministic | `shadowpass.test.ts:299-321` |

**Category B: Integration tests (require browser + wallet)**

These test the full browser flow using the DApp Connector.

| # | Test | What it proves |
|---|------|----------------|
| 5 | Browser proveMembership with valid credentials: UI shows "Access Granted" + incremented accessCount | End-to-end flow works |
| 6 | Browser proveMembership with invalid credentials: UI shows "Access Denied", accessCount unchanged | Unauthorized access rejected in browser |
| 7 | Wallet independence: same credential used from test → valid proof (same circuit, different signer) | Membership is wallet-independent |

### Minimum required: 3+ tests (Level 3 requirement)

**Recommended test set (4 unit + 3 integration = 7 total):**
1. Valid membership → granted (unit)
2. Invalid membership → rejected (unit)
3. No data exposed (unit)
4. Commitment determinism (unit)
5. Browser verify → granted (integration)
6. Browser verify → denied (integration)
7. Wallet independence (integration)

### Which tests can run without a browser?

Tests 1-4 (unit tests) run with `vitest` using the Compact runtime + zkir-wasm prover. No browser, no wallet, no network needed. These are the same test infrastructure as V1.

Tests 5-7 (integration tests) require a browser with a Midnight wallet on Preprod. These should be manual test cases documented in the README, not automated CI tests.

### Test infrastructure

```
vitest.config.ts  — 300s timeout (proof generation is slow)
test/
  shadowpass.test.ts  — 4 unit tests (compact runtime, real Groth16 proofs)
```

The ShadowPass test file should be nearly identical to Old ShadowPass `test/shadowpass.test.ts`, adapted for the ShadowPass project structure. The key difference: ShadowPass uses the same compiled contract from `contracts/managed/shadowpass/`.

---

## 13. Risks and Edge Cases

### Risk 1: `getProvingProvider` browser proving failure

**Severity:** HIGH (would break the core flow)
**Status:** Phase 1 CONFIRMED working on Preprod with 1AM wallet
**Mitigation:** Already tested in Phase 1 browser validation

### Risk 2: Pre-deployed V1 contract address might be stale

**Severity:** MEDIUM
**Details:** The Old ShadowPass contract at `983d941f4b05a870fe419229397dfa4adbeec55deaf266fd9e31398f74a6b732` was deployed by the Old ShadowPass server with its own allowlist. ShadowPass needs a NEW contract with ShadowPass's demo credential commitment.

**Mitigation:** Deploy a new ShadowPass contract with the deterministic demo credentials before Phase 3
### Risk 3: Demo credentials are public (by design)

**Severity:** LOW (not a bug, a feature)
**Details:** Anyone can use the posted demo credentials. This is intentional for a demo. The privacy guarantee is that the ZK proof doesn't reveal which allowlist entry matched, not that the credentials are secret.
**Mitigation:** README clearly explains this is a demo, not a production credential system

### Risk 4: Allowlist has 7 random filler commitments

**Severity:** LOW
**Details:** Slots 1-7 contain random commitments from deployment time. If the same random seed is used, filler commitments are predictable. But this doesn't affect the security model — the attacker would need to find a preimage for any commitment, which is computationally infeasible.
**Mitigation:** Use `crypto.getRandomValues()` for filler commitments

### Risk 5: accessCount increment is linked to wallet address

**Severity:** LOW
**Details:** An observer can see "wallet X incremented accessCount". But the observer cannot determine WHICH membership credential was used. Two different wallets using the same credential produce different transactions but the same privacy guarantee.
**Mitigation:** Document in README that the wallet address is visible as transaction signer

### Edge case: Evaluator tries with wrong credentials

The contract reverts with "Not an authorized member". The transaction still gets submitted (and pays a fee), but the `accessCount` does not increment. The UI should clearly distinguish "Access Denied" from a network error.

### Edge case: Evaluator reconnects wallet

The `findDeployedContract` call reloads the contract state. The `accessCount` reflects all previous verifications. No state is lost.

---

## 14. Phase 3 Implementation Plan (PROPOSED)

### Step 1: Generate deterministic demo credentials

Create a one-time script (or compute offline) to generate:
- `DEMO_MEMBER_ID` (32 random bytes, hex-encoded)
- `DEMO_SALT` (32 random bytes, hex-encoded)
- `DEMO_COMMITMENT = persistentCommit(DEMO_MEMBER_ID, DEMO_SALT)`

Store these in a documentation file. The commitment is used for deployment; the memberId + salt are displayed in the UI.

### Step 2: Deploy ShadowPass contract

Using the Old ShadowPass `src/integrate.ts` script (adapted for ShadowPass):
- Build allowlist: `[DEMO_COMMITMENT, random_filler_1, ..., random_filler_7]`
- Deploy via `deployContract(providers, { args: [allowlist] })`
- Record the contract address

### Step 3: Update ShadowPass frontend config

```typescript
export const V2_CONTRACT_ADDRESS = '<newly deployed address>';
export const DEMO_MEMBER_ID = '<64 hex chars>';
export const DEMO_SALT = '<64 hex chars>';
```

### Step 4: Build verification UI

Replace Phase 1 test UI with the production verification flow:
- Credential input form (memberId + salt fields, pre-filled with demo values)
- "Verify Membership" button
- Status display (idle → generating proof → submitting → granted/denied)
- Access count display (reads from on-chain state after verification)

### Step 5: Build unit tests

Port Old ShadowPass `test/shadowpass.test.ts` to ShadowPass with 4 tests:
1. Valid membership → granted, accessCount increments
2. Invalid membership → rejected, accessCount unchanged
3. No data exposed in ledger/transcript
4. Commitment determinism

### Step 6: Polish for Level 3

- README with privacy model explanation
- PROPOSAL.md (reuse Old ShadowPass content, adapted for ShadowPass architecture)
- Screenshots of the verification flow
- 1-minute demo video
- CI/CD pipeline (GitHub Actions)
- 10+ commits in public repo

### Estimated scope

| Step | Estimated effort | Blocks |
|------|-----------------|--------|
| 1. Generate credentials | 30 minutes | Step 2 |
| 2. Deploy contract | 1-2 hours (Preprod sync) | Step 3 |
| 3. Update config | 15 minutes | Step 4 |
| 4. Build verification UI | 4-6 hours | Step 6 |
| 5. Build unit tests | 2-3 hours | Step 6 |
| 6. Polish for Level 3 | 3-4 hours | — |

---

## 15. Summary of Findings

| Question | Answer | Evidence |
|----------|--------|----------|
| Is memberId stored on-chain? | **NO** | `shadowpass.compact:12` — only `persistentCommit` result in allowlist |
| Is salt stored on-chain? | **NO** | Same as above |
| Is only a commitment stored? | **YES** | `allowlist: Vector<8, Bytes<32>>` contains Pedersen commitments |
| How is commitment calculated? | `persistentCommit<Bytes<32>>(memberId, salt)` | `shadowpass.compact:13` |
| What does the circuit prove? | "I know (memberId, salt) such that persistentCommit matches an allowlist entry" | `shadowpass.compact:13-24` |
| What does the circuit reveal? | Nothing (`[]` return type) | `shadowpass.compact:12` |
| What does the contract verify? | `persistentCommit` matches one of 8 allowlist entries | `shadowpass.compact:14-23` |
| How is accessCount updated? | `accessCount = accessCount + 1` on successful proof | `shadowpass.compact:25` |
| What causes granted=true? | `tx.public.status === SucceedEntirely` | `server/contract.ts:518` |
| Is membership tied to wallet? | **NO** | Circuit has no wallet address parameter |
| Can same credential work from another wallet? | **YES** | Membership depends only on `(memberId, salt)` |
| ShadowPass contract changes needed? | **NONE** | Old ShadowPass circuit is already correct |
| ShadowPass credential model? | **Deterministic demo credentials** | Public, documented, fits single-contract architecture |
| How does evaluator get credentials? | **Displayed on the UI** | Public demo, not a production enrollment system |

---

## 16. Classification of Claims

Every conclusion in this document is labeled:

- **CONFIRMED FROM CODE** — directly verified by reading the source
- **INFERRED** — derived from code analysis with high confidence
- **PROPOSED** — design recommendation requiring implementation

### CONFIRMED FROM CODE

1. Contract stores `allowlist: Vector<8, Bytes<32>>` and `accessCount: Field`
2. Constructor takes `members: Vector<8, Bytes<32>>` and discloses them
3. Circuit takes `memberId: Bytes<32>` and `salt: Bytes<32>` as private inputs
4. Circuit computes `persistentCommit<Bytes<32>>(memberId, salt)`
5. Circuit asserts commitment matches one of 8 allowlist entries
6. Circuit increments `accessCount` on success
7. Circuit returns `[]` (empty output)
8. `memberId` is 32 random bytes (or `crypto.getRandomValues()`)
9. `salt` is 32 random bytes (or `crypto.getRandomValues()`)
10. V1 server calls `callTx.proveMembership(memberIdBytes, saltBytes)`
11. V1 tests use `crypto.randomBytes(32)` for credentials
12. V1 Enroll page uses `crypto.getRandomValues()` for credentials
13. V1 `makeAllowlist` places real commitment at slot 0, fillers at 1-7
14. Wallet address is never a circuit input
15. `computeCommitment` is `ocrt.persistentCommit(CompactTypeBytes(32), memberId, salt)`

### INFERRED

1. The same `(memberId, salt)` pair can be used from any wallet (circuit has no wallet dependency)
2. Filler commitments are cryptographically random (use `crypto.randomBytes`)
3. The ShadowPass contract address will differ from the Old ShadowPass contract address (new deployment)
4. `getProvingProvider()` works on Preprod (confirmed in Phase 1 browser test)

### PROPOSED FOR SHADOWPASS

1. Deterministic demo credential model (public memberId + salt displayed in UI)
2. No contract changes (reuse V1 circuit exactly)
3. 4 unit tests + 3 integration tests = 7 total
4. Developer deploys contract manually before Netlify deployment
5. Frontend config contains `V2_CONTRACT_ADDRESS`, `DEMO_MEMBER_ID`, `DEMO_SALT`
6. Verification UI with credential input, proof generation, and result display
