# Phase 5 — Deployment Ready

## 1. Exact Contract Source Verified

**Source:** `contracts/shadowpass.compact`

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

**Confirmed:**
- Constructor takes `Vector<8, Bytes<32>>` (8 commitments)
- Circuit takes `(memberId: Bytes<32>, salt: Bytes<32>)` — NO wallet address
- Witnesses: NONE
- Private state: NONE
- Ledger: `allowlist` (8 × 32-byte commitments) + `accessCount` (Field)

## 2. Exact Demo Commitment Verified

Recalculated using `@midnight-ntwrk/compact-runtime`:

```
MEMBER_ID:   deadbeef000000000000000000000000000000000000000000000000deadbeef
SALT:        cafebabe000000000000000000000000000000000000000000000000cafebabe
COMMITMENT:  c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e
LENGTH:      32 bytes
```

Consistent across: `config.ts`, `DEMO-CREDENTIALS.md`, `DEPLOYMENT-INPUTS.md`, and live recalculation.

## 3. All 8 Deployment Commitments

```
Slot 0: c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e  (demo)
Slot 1: 5634ba7da27050e358f71072168946fe59b777f4bd2194071a38821a12c969d8  (filler)
Slot 2: e490c0c0851943f528c57de5bdb4c53374c617b18815d7191bb15c3fe5c3004f  (filler)
Slot 3: d0a71f2e6c5ae6729f43c1d300b42aa7007d78b42c9d6075f22a03e9e1c8dd1f  (filler)
Slot 4: 92a6b7ba8973383d3c7fe795e48f00c9a811d55e41ac868cebcf39b395808653  (filler)
Slot 5: 1aee7e080e596fc61ab86d96e117964229edce54454ae58a4fd3f8aa3721c9db  (filler)
Slot 6: 835d9a7aaa77ec0d22933badd164f85fcf9c02ac0db2e96aeace6fd1af407153  (filler)
Slot 7: 6dd60d0717a600771ce24a5e536655aeb8435609e18b0c7f79594edd2f64da73  (filler)
```

All 8 are unique. Slots 1-7 are deterministic filler commitments from documented inputs (`member-XX-demo` + `salt-XX-demo`). Full derivation in `docs/DEPLOYMENT-INPUTS.md`.

## 4. Initial Ledger State

| Field | Initial Value |
|-------|---------------|
| `allowlist` | 8 × 32-byte commitments (see Section 3) |
| `accessCount` | `0` |

## 5. Deployment Mechanism

### One-Time Deployment (Node.js script)

The Flash Loan reference (`src/deploy.ts`) demonstrates the pattern:

```typescript
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
```

A minimal deployment script would:
1. Create a temporary wallet from a seed (for deployment transaction only)
2. Sync with Preprod network
3. Fund the wallet with test tDUST from the faucet
4. Set up providers (including a Docker proof server for the deployment transaction)
5. Call `deployContract(providers, { compiledContract, args: [allowlist], privateStateId, initialPrivateState: {} })`
6. Record the deployed contract address
7. **Discard the deployment wallet seed**

### Requirements for Deployment
- Docker (for proof server during deployment only)
- Node.js 22+
- Midnight wallet with test tDUST (from Preprod faucet)
- The Flash Loan project already has this infrastructure

### Post-Deployment
The contract address is hardcoded in `frontend/src/config.ts`:
```typescript
export const CONTRACT_ADDRESS: string =
  env.VITE_CONTRACT_ADDRESS ??
  '983d941f4b05a870fe419229397dfa4adbeec55deaf266fd9e31398f74a6b732';
```
This value is updated to the newly deployed ShadowPass address after deployment.

## 6. Required Wallet State

- **Wallet:** 1AM or Lace with Midnight support
- **Network:** Midnight Preprod
- **Balance:** Test tDUST from the Preprod faucet (NOT real funds)
- **Role:** Transaction signer + ZK proof generation
- **Membership:** The wallet address is NOT an allowlist entry

## 7. Required Preprod Funds

- **Amount:** Sufficient tDUST to pay for ONE contract deployment transaction
- **Source:** Midnight Preprod faucet (free test tokens)
- **No real money:** This project uses ONLY Midnight Preprod/test resources

## 8. Secret Handling

- **No seed in source:** Verified — no `MIDNIGHT_SEED` in any source file
- **No private key in source:** Verified — no wallet secrets in repository
- **No real credentials:** Demo credentials are intentionally public
- **Deployment seed:** If a deployment script is created, the seed must remain local and must NOT be committed
- **.gitignore:** Covers `.midnight-state.json`, `.midnight-wallet-state`, and `.env` files

## 9. Contract Address Status

**NOT YET DEPLOYED**

The current `CONTRACT_ADDRESS` in `config.ts` is the V1 contract address (temporary placeholder):
```
983d941f4b05a870fe419229397dfa4adbeec55deaf266fd9e31398f74a6b732
```

After deployment, this must be updated to the new ShadowPass contract address.

## 10. Exact Next Command

The deployment is a **manual one-time operation**. The developer must:

```bash
# Step 1: Create a one-time deployment script (or adapt Flash Loan's deploy.ts)
# Step 2: Run it locally with Docker proof server
# Step 3: Fund the deployment wallet with test tDUST from faucet
# Step 4: Deploy with the 8-member allowlist from DEPLOYMENT-INPUTS.md
# Step 5: Copy the deployed contract address
# Step 6: Update config.ts:
#    VITE_CONTRACT_ADDRESS=<new ShadowPass address>
# Step 7: Rebuild frontend:
npm run build --prefix frontend
# Step 8: Deploy frontend/dist to Netlify
```

**The live frontend NEVER deploys a contract. It only connects to the existing deployment.**

## Validation Results

| Check | Result |
|-------|--------|
| `npm run compile` | PASS |
| `npm test` | PASS (13/13) |
| `npm run build --prefix frontend` | PASS |
| Root TypeScript | PASS |
| Frontend TypeScript | PASS |
| Backend dependency search | NONE FOUND |
| Commitment consistency | CONSISTENT |
| Git status | Not a git repository |

---

**READY TO DEPLOY**
