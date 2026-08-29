# ShadowPass Level 4 — Preprod Deployment Evidence

> This file records the public blockchain evidence for the canonical ShadowPass
> Level 4 Preprod deployment. This is the two-week Level 4 project's
> deployment of the **shadowpass4** contract (`contracts/shadowpass4.compact`),
> a distinct contract and address from the Level 3 baseline. All values are
> taken from the deployment script output, source configuration, tests and
> successful in-browser verification. No secrets are stored here.
>
> **Status:** Deployment completed and live verification recorded.

## Deployment

- **Network:** Midnight Preprod
- **Contract address:** `52a195f6b68a2f09c8535afe2cfed126068b4cf82eead210b6d1504a985c285e`
- **Compact contract:** `contracts/shadowpass4.compact`
- **Compiler version:** 0.31.1
- **Runtime version:** 0.16.0
- **Deployment transaction ID:** TBD
- **Deployment block:** TBD

## Constructor

The constructor receives a single argument, the issuer commitment:

```
issuerCommitment = persistentHash([pad("shadowpass:issuer:"), issuerKey])
```

| Field | Value |
|---|---|
| issuerKey | kept secret — issuer keystore `.shadowpass-issuer/issuer-key.json` |
| issuerCommitment | `a2ec55b08a47b2a30512881e7efbce6953f9230b9d4b80608c1ee4c2490ca01b` |

## Circuits (5, all Groth16)

| Circuit | Role |
|---|---|
| `enroll` | issuer-authorized; inserts a credential commitment into the Merkle tree |
| `verifyMembership` | holder proves preimage + leaf membership; per-app nullifier |
| `proveEligibility` | holder proves predicates over hidden `age`/`tier`; per-app nullifier |
| `revoke` / `unrevoke` | issuer-authorized app-nullifier management |

## Enrollment

The Level 4 demo credential was enrolled on-chain by the issuer CLI
(`npm run issuer:enroll -- --index 3 --submit`), adding one member to the
Merkle membership tree. State was verified by decoding the on-chain contract
state after each action.

- **Block:** `2316943`
- **Transaction:** `b880705d046531e61e596c1e443d0a0076cdb250521520d23c8ae598b621fcaa`
- **Decoded state after action:** members `0 -> 1`, accessCount `0`, nullifiers `0`, revoked `0`
- **Attribution:** enrollment

## On-chain verification

- **Latest membership verification (live browser, holder flow):**
  - transaction: `10dfab1d998f135e61a7de061a00d715d7e6cbcb1ee751c700cd6360d85b7575`
  - block: `2317331`
  - access count after verification: `2`
  - network: Midnight Preprod
  - proof system: Groth16
- **Selective-disclosure eligibility check (tx):** TBD — no on-chain eligibility
  transaction recorded; the eligibility circuit/toggle were verified in the UI.
- **Revocation + replay-rejection check (tx):** replay protection was verified in
  the browser via the terminal/browser result `Credential already spent for this
  application` (per-app nullifier rejection). No separate revocation tx recorded.

### On-chain verification history

Every contract action for this address publishes a decoded ledger state. The
full history observed on Midnight Preprod is:

| Block | Transaction | accessCount | used nullifiers | Attribution |
|---|---|---|---|---|
| `2316943` | `b880705d046531e61e596c1e443d0a0076cdb250521520d23c8ae598b621fcaa` | 0 | 0 | Enrollment |
| `2317066` | `b82654820015cda063843948a269a7fdb22732498b48ac5e5b2b9c78cd4be4c3` | 1 | 1 | Holder verification #1 |
| `2317331` | `10dfab1d998f135e61a7de061a00d715d7e6cbcb1ee751c700cd6360d85b7575` | 2 | 2 | Holder verification #2 — documented browser demo |
| `2317901` | `31e3115b400fd04956fb770c8fe7caecf42e672a9d258d73c6153cadf28ecce0` | 3 | 3 | Holder verification #3 |
| `2318050` | `dd86c1ecf9af1d1a5fe5e6abdcdcdff541c59cfe1372415e4f8e537c85bd5aaf` | 4 | 4 | Holder verification #4 |

Notes:

- Both holder circuits (`verifyMembership` and `proveEligibility`) increment
  accessCount and consume one per-application nullifier; the decoded on-chain
  ledger state does **not** distinguish the two. Labelling a specific
  verification as membership vs. eligibility comes from the corresponding
  off-chain UI evidence (`membership-selected.jpeg`,
  `eligibility-selected.jpeg`, `eligibility-proved.jpeg`).
- Replay rejection is represented by the existing UI evidence
  (`replay-protection.jpeg`, `Credential already spent for this application`);
  it is **not** claimed here as an on-chain duplicate-transaction record.
- No live revocation transaction exists: `revoked` is `0` at every observed
  state. Revocation is implemented and covered by the unit test suite
  (`contract-nullifier-revocation.test.ts`), but no `revoke`/`unrevoke`
  transaction has been submitted on-chain.
- The deployment transaction ID/block remain **TBD** (the exact deployment
  transaction ID was not recovered during this audit). No transaction ID is
  asserted here without on-chain verification.

## UI evidence (Level 4 frontend)

Screenshot files present under `docs/evidence/screenshots/`:

**UI state (frontend)**

| File | What it shows | Status |
|---|---|---|
| `01-credential-card-membership-selected.png` | Credential card, **Membership** selected/highlighted, Eligibility unselected | verified |
| `02-credential-card-eligibility-selected.png` | Credential card, **Eligibility** selected/highlighted, min age/tier fields visible | verified |
| `03-full-page-membership-selected.png` | Full-page view (Membership selected) | verified |

**Live holder flow (browser captures)**

| File | What it shows | Status |
|---|---|---|
| `production-home.jpeg` | Production app home | verified |
| `wallet-connection-request.jpeg` | Midnight wallet connection request | verified |
| `membership-selected.jpeg` | Membership verification step | verified |
| `eligibility-selected.jpeg` | Eligibility (selective disclosure) verification step | verified |
| `proof-service-access.jpeg` | Proving service access during verification | verified |
| `transaction-sign-request.jpeg` | Wallet transaction sign request | verified |
| `eligibility-proved.jpeg` | Eligibility proof result | verified |
| `replay-protection.jpeg` | Replay-protection result (per-app nullifier rejection) | verified |

The successful membership verification result is also recorded as **terminal/browser
output evidence** (transaction/block above). The older `proof-verified.jpeg` in this
directory predates Level 4 (Level 3 flow) and is **not** Level 4 evidence.

## Explorer

- **Contract:** https://explorer.preprod.midnight.network/contract/52a195f6b68a2f09c8535afe2cfed126068b4cf82eead210b6d1504a985c285e
- Proof infrastructure: browser-delegated proving via the Midnight wallet
  (1AM integrated WASM prover) with a fallback to the wallet's advertised
  prover server URI. The local proof server at `127.0.0.1:6300` is used only by
  deployment/issuer tooling and the test suite — never by the browser.
- Frontend: fully static, no backend, no database.

## Demo credentials

Public demo credential values are mirrored in `docs/evidence/DEMO-CREDENTIALS.md`.
The Level 4 demo credential (`deadbeef…` member / `cafebabe…` salt, commitment
`757b45c19b21628dca784536aa489448b0808ff00a763cd7d83c796d98d65916`) is stored in
the issuer keystore and **enrolled on-chain** as a Merkle membership leaf by the
issuer CLI (`npm run issuer:enroll -- --index 3 --submit`).