# ShadowPass Level 4 — Security Model

The shadowpass4 contract provides **credential-knowledge authorization**:
a holder who knows the preimage of a commitment in the issuer's Merkle
allowlist can generate Groth16 proofs that let a contract apply business
logic (grant access, record a single use, check eligibility thresholds)
without the contract or any observer learning which credential was used
or what its hidden attributes are.

This document describes the properties the design provides, the
assumptions it makes, and its known trade-offs. It is the authoritative
companion to the test suites in `tests/`.

---

## 1. Trust model

| Party | Trusted for | Not trusted for |
|---|---|---|
| Issuer (offline CLI) | Choosing which commitments enter the allowlist | Learning when/how credentials are used |
| Holder (browser) | Keeping memberId/salt/attributes secret | Anything — a malicious holder cannot forge a commitment or spend another holder's nullifier |
| Contract (`shadowpass4`) | Honest execution of the circuits, deterministic nullification, issuer gating | Knowledge of identities or attribute values |
| Verifier (app) | Choosing public thresholds/appId | Seeing the credential or attributes |
| Indexer / network | Serving ledger state | Revealing private witness data (none is ever published) |

There is **no trusted party that both sees the allowlist and the usage**:
the issuer sees issuance only; the network sees usage only (as proofs and
nullifiers).

---

## 2. Core properties

### 2.1 Membership soundness
A holder can pass `verifyMembership` **iff** their commitment is a leaf of the
ledger `memberships` Merkle tree and they know its preimage.

- The circuit asserts `pathHostingZswap(..., path)` and
  `merkleTreePathRoot(path) == root` (root is publicly disclosed).
- The circuit asserts `path.leaf == memberCommitment(record, salt)`, so the
  holder cannot substitute an arbitrary tree node.
- The proof is checked against the verifier key bound to the `verifyMembership`
  circuit, so a valid proof must satisfy the circuit.

Non-members fail with `Not an authorized member`; a forged path from a
different tree fails the root check; a path that isn't this commitment's leaf
fails the leaf-binding assertion. (Covered by the membership suite.)

### 2.2 Selective disclosure
`proveEligibility(appId, minAge, minTier)` proves `age >= minAge` and
`tier >= minTier` **as circuit predicates over hidden `Uint<8>` fields**.

- The public arguments are only `appId` and the two thresholds — the actual
  `age`/`tier` values appear only in the private witness `record`.
- The transcript contains the disclosed `appId`/threshold bytes and the
  commitment; byte scans confirm the raw attribute bytes never appear in the
  preimage, the binding inputs, or the structured public transcript
  (privacy suite).
- Threshold boundaries are exact: `age == minAge` passes, `age == minAge - 1`
  fails with `Minimum age requirement not met` (eligibility suite).

### 2.3 Replay protection without cross-app linkability
Each proof consumes a **deterministic, wallet-independent, per-app nullifier**:

```
nullifier = persistentHash([pad32("shadowpass:use:"), appId, memberId, salt])
```

- The nullifier depends only on the appId and the credential — NOT on the
  wallet provenance or an in-wallet counter — so it is stable across
  batteries, browsers, and proving backends.
- `verifyMembership` and `proveEligibility` both record the nullifier, so a
  credential is single-use per app across **both** circuits (nullifier suite).
- The same credential used for a different `appId` yields a different,
  unlinkable nullifier — the network cannot tell that two proofs came from
  one credential (privacy suite: binding inputs are byte-identical across
  different holders but differ per appId).

This is replay protection without an oracle: the nullifier is derived but the
commitment itself is the only public link, and it is never re-disclosed in a
second use.

### 2.4 Issuer-gated lifecycle
Enrollment and revocation are restricted to the party who knows a secret whose
commitment equals the ledger `issuerCommitment`:

```
persistentHash([pad32("shadowpass:issuer:"), issuerKey]) == issuerCommitment
```

- `enroll()` rejects non-issuers with `Not the issuer`.
- `revoke(appId)` / `unrevoke(appId)` reject non-issuers the same way, and
  mark/unmark that app's nullifier in `revokedNullifiers`.
- A revoked credential fails both holder circuits with
  `Credential has been revoked`; `revoke` is idempotent-safe (second call:
  `Already revoked`) and `unrevoke` symmetric (`Not currently revoked`).
- The issuer never learns the nullifiers; it only manipulates bits keyed by
  values the holder's proof computes on-chain.

### 2.5 Private issuance
Holder credentials never cross the network: the issuer only ever submits the
**commitment** (a hash of memberId+salt+attributes), never the preimage, so
the issuer cannot learn a holder's attribute values, and the network cannot
correlate a commitment to its usage proof.

---

## 3. What an adversary can and cannot do

| Capability | Result |
|---|---|
| Eavesdrop on all public data | Sees allowances, a Merkle root, disclosed roots/appIds/thresholds, and nullifiers — learns nothing about identities or attribute values |
| Replay a recorded proof | Impossible: the recorded nullifier is spent (`Credential already spent for this application`) |
| Try a credential not in the tree | `Not an authorized member` (root check) regardless of forged paths |
| Use the wrong path for a valid commitment | Leaf-binding assertion fails (`Credential does not match a registered membership`) |
| Probe attributes with many eligibility proofs | Sees only per-app nullifiers + disproven thresholds; the true value is still hidden as long as a threshold one below it was proven |
| Revoke/unrevoke as a non-issuer | `Not the issuer` |
| Extract memberId/salt from a proof | Infeasible — only the commitment hash and derived nullifier appear on-chain |
| Link two apps' usage of one credential | Infeasible — nullifiers are per-app and the commitment is absent from proofs |

---

## 4. Trade-offs and limitations (documented)

1. **Credential-knowledge, not signature-based authorization.**
   `ownPublicKey()` is a witness function, not an authenticator. Compact
   0.31.1 does not provide signature circuits, so authorization rests on
   knowledge of the credential preimage rather than possession of a private
   key bound to the wallet. Anyone who learns memberId+salt can impersonate
   the holder. This is the primary reason the demo uses public demo values
   and production issuance must be private (see §5).

2. **Nullifiers are per-app, not per-verification.**
   A credential can be used once per application. This bounds replay
   within an app and is the intended trade for cross-app linkability
   (zero-linkability would allow unbounded replay).

3. **No on-chain attribute reveal.**
   Eligibility is boolean ("eligible") — a verifier that needs the exact
   value must use a different primitive.

4. **No rate limits or per-proof fees.**
   Access control is cryptographic, not economic. Referendum/abuse controls
   are out of scope for the demonstration.

5. **Issuer key custody.**
   The issuer secret lives in the offline issuer keystore
   (`~/.shadowpass-issuer/issuer-key.json`); losing or leaking it forfeits the
   issuer-gating property. Real deployments should use a hardware-backed key.

6. **ZKP library trust.**
   Soundness depends on the Groth16 implementation shipped in zkir-v2
   (circuit → R1CS, trusted setup, pairing check on-chain) plus the compact
   compiler snapshot. See `docs/evidence/DOCUMENT.md` for pinned versions.

---

## 5. Mitigations applied in this repository

- **Issuer gating by commitment, not by plaintext key.** The issuer key never
  appears in the contract; only its hash (`issuerCommitment`) is stored.
- **Witness-only secret material.** memberId/salt/attributes exist only in
  browser witness functions and are absent from wire transcripts and ledgers
  (verified by the privacy suite).
- **wallet-independent nullification.** No reliance on in-wallet counters that
  could be cloned or reset; the nullifier is a pure function of credential+app.
- **Single-use enforcement in the same transaction that grants access.**
  Nullifier insertion is atomic with the access check, leaving no
  reorder/race window.
- **Deterministic tests for each security property** (membership,
  eligibility, nullifier, revocation, privacy suites) — security claims are
  executable specifications, not prose.

---

## 6. Test coverage map

| Property | Suite | Cases |
|---|---|---|
| Membership soundness (root + leaf binding) | `tests/contract-membership.test.ts` | forged tree, same-tree path hijack, Groth16 proof |
| Selective disclosure (threshold predicates) | `tests/contract-eligibility.test.ts` | exact boundary pass/fail, Groth16 proof, transcript surface |
| Replay protection / cross-app nullifiers | `tests/contract-nullifier-revocation.test.ts` | per-app determinism, cross-circuit single-use, per-app freshness |
| Issuer gating / revocation lifecycle | `tests/contract-nullifier-revocation.test.ts` | non-issuer rejects, revoke/unrevoke, idempotence |
| Transcript secrecy / unlinkability | `tests/contract-privacy.test.ts` | byte scans of preimage + binding inputs, cross-holder inputs |