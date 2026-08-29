# ShadowPass — Level 4 Demo Credentials

> These are **public demo credentials** for the ShadowPass Level 4 demonstration.
> They are intentionally public. They are NOT production credentials.

## Demo Credential

| Field | Value |
|-------|-------|
| **Member ID** | `deadbeef000000000000000000000000000000000000000000000000deadbeef` |
| **Salt** | `cafebabe000000000000000000000000000000000000000000000000cafebabe` |
| **Age** (hidden attribute) | `25` |
| **Tier** (hidden attribute) | `4` |

## On-Chain Commitment

Computed with `memberCommitment(record, salt)` over the
`MemberRecord { memberId, age, tier }` (= `persistentCommit` of the
concatentation of the record fields with the salt):

| Field | Value |
|-------|-------|
| **Commitment** | `757b45c19b21628dca784536aa489448b0808ff00a763cd7d83c796d98d65916` |

This commitment is enrolled as a leaf of the `memberships` Merkle tree by the
issuer after deployment (`npm run issuer:enroll`).

## Demo Application Id

| Field | Value |
|-------|-------|
| **appId** | `0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20` |

`appId` is the public per-app replay domain. The demo credential is
single-use per app: use the demo `appId` once, then it is spent
(`Credential already spent for this application`). Pick a fresh appId to
verify again.

## Demo Thresholds (Selective Disclosure)

The hidden attributes are `age = 25`, `tier = 4`. In the browser:

- `proveEligibility(appId, minAge, minTier)` succeeds for `minAge <= 25` and
  `minTier <= 4`.
- Asking for `minAge = 26` fails with `Minimum age requirement not met`;
  `minTier = 5` fails with `Minimum tier requirement not met`.

## How These Credentials Work

1. The evaluator enters the public Member ID, Salt, and Application Id into
   the ShadowPass verification form (defaults are pre-filled).
2. The holder witnesses carry the secret material; the browser generates a
   Groth16 zero-knowledge proof in the Midnight wallet.
3. `verifyMembership(appId)` proves: knowledge of the commitment preimage,
   membership in the Merkle tree (path stays private — only the recomputed
   root is disclosed), leaf-binding of the commitment, and records a
   deterministic per-app nullifier.
4. `proveEligibility(appId, minAge, minTier)` additionally proves in-circuit
   that `age >= minAge` and `tier >= minTier` without revealing the values.
5. The proof is submitted to Midnight Preprod; the contract rejects replays
   (spent nullifier) and revoked credentials.

## Privacy Explanation

These credentials are **public by design** for the demonstration. The
zero-knowledge architecture ensures that:

- The ZK proof proves "I know a valid credential" without revealing which one.
- On-chain state never contains the raw `memberId`, `salt`, `age`, or `tier`.
- The Merkle path and tree position stay inside the circuit.
- Unlinkability: the same credential used for two different `appId`s produces
  two unrelated nullifiers.
- Replay protection: within one `appId`, the credential is single-use.

## Production Credential Model

In a production system:

1. An issuer generates `memberId + salt` and assigns hidden attributes for
   each authorized member.
2. The issuer computes the commitment and enrolls it in the Merkle tree via
   `enroll()`.
3. The member receives their private credential out-of-band.
4. The member keeps `memberId`/`salt`/attributes private and uses them only
   inside the browser witnesses.

The demonstration uses public credentials to show the flow without a
back-end enrollment system.

## Warning

**Do NOT use these credentials as production membership credentials.**
They are publicly documented and anyone can use them.

For production use, credentials must be generated and distributed privately
by an authorized issuer.