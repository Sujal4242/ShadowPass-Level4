# ShadowPass Level 4 — Preprod Deployment Evidence

> This file records the public blockchain evidence for the canonical ShadowPass
> Level 4 Preprod deployment. This is the two-week Level 4 project's
> deployment of the **shadowpass4** contract (`contracts/shadowpass4.compact`),
> a distinct contract and address from the Level 3 baseline. All values are
> taken from the deployment script output, source configuration, tests and
> successful in-browser verification. No secrets are stored here.
>
> **Status:** Deployment completed — evidence filled in below.

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

- **First membership verification (tx):** TBD
- **Selective-disclosure eligibility check (tx):** TBD
- **Revocation + replay-rejection check (tx):** TBD
- **Access count after verification:** TBD

## Explorer

- **Contract:** https://explorer.preprod.midnight.network/contract/52a195f6b68a2f09c8535afe2cfed126068b4cf82eead210b6d1504a985c285e
- Proof infrastructure: browser-delegated proving via the Midnight wallet
  (1AM integrated WASM prover) with an HTTP fallback to the local proof server.
- Frontend: fully static, no backend, no database.

## Demo credentials

Issued offline with the issuer CLI (`npm run issuer:seed`). Credential values are
public for demo purposes and mirrored in `docs/evidence/DEMO-CREDENTIALS.md`.