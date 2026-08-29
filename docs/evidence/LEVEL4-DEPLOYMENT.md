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

## On-chain verification

- **Latest membership verification (live browser, holder flow):**
  - transaction: `000ccf80749d2733a15f598c3f370ecd9c8882f7941926cbe5ab7a310ba8785b0e`
  - block: `2317331`
  - access count after verification: `2`
  - network: Midnight Preprod
  - proof system: Groth16
- **Selective-disclosure eligibility check (tx):** TBD — no on-chain eligibility
  transaction recorded; the eligibility circuit/toggle were verified in the UI.
- **Revocation + replay-rejection check (tx):** replay protection was verified in
  the browser via the terminal/browser result `Credential already spent for this
  application` (per-app nullifier rejection). No separate revocation tx recorded.

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