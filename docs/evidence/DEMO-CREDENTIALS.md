# ShadowPass — Demo Credentials

> These are **public demo credentials** for the ShadowPass demonstration.
> They are intentionally public. They are NOT production credentials.

## Demo Membership Credential

| Field | Value |
|-------|-------|
| **Member ID** | `deadbeef000000000000000000000000000000000000000000000000deadbeef` |
| **Salt** | `cafebabe000000000000000000000000000000000000000000000000cafebabe` |

## On-Chain Commitment

Computed using `persistentCommit<Bytes<32>>(memberId, salt)`:

| Field | Value |
|-------|-------|
| **Commitment** | `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` |

This commitment is placed in **slot 0** of the ShadowPass contract's on-chain allowlist.

## Deployment Allowlist

The ShadowPass contract is deployed with:

| Slot | Value |
|------|-------|
| 0 | `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` (demo credential) |
| 1-7 | Random filler commitments (generated at deployment time) |

## How These Credentials Work

1. The evaluator enters the Member ID and Salt into the ShadowPass verification form.
2. The browser computes `persistentCommit(memberId, salt)` locally.
3. The browser generates a Groth16 zero-knowledge proof that this commitment matches one of the 8 on-chain allowlist entries.
4. The proof is submitted to the Midnight Preprod network.
5. The contract verifies the proof and increments `accessCount`.

## Privacy Explanation

These credentials are **public by design** for the demonstration. The zero-knowledge proof architecture ensures that:

- The ZK proof proves "I know a valid credential" without revealing which credential.
- The on-chain state never contains the raw `memberId` or `salt`.
- An observer cannot determine which allowlist entry matched.

## Production Credential Model

In a production system:

1. An issuer generates `memberId + salt` for each authorized member.
2. The issuer computes `commitment = persistentCommit(memberId, salt)`.
3. The issuer shares only the commitment with the contract deployer.
4. The member receives their private `(memberId, salt)` securely.
5. The member uses their credential to generate ZK proofs.

The demonstration uses public credentials to demonstrate the ZK proof flow without requiring a backend enrollment system.

## Warning

**Do NOT use these credentials as production membership credentials.**
They are publicly documented and anyone can use them.

For production use, credentials must be generated and distributed privately by an authorized issuer.
