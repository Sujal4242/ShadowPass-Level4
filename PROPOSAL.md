# PROPOSAL.md — ShadowPass Level 4

## Project Title

**ShadowPass: Verifiable Access Credentials on Midnight**

## Summary

ShadowPass is a zero-knowledge dApp for privacy-preserving access control. Level 4 evolves the Level 3 "private allowlist" into a full **verifiable credential system**: reusable credentials, dynamic issuer-authorized enrollment, per-application replay protection, issuer-side revocation, and **selective disclosure** (proving predicates over hidden attributes). Groth16 proofs are generated entirely in the browser and verified on-chain by a Compact smart contract on Midnight Preprod — with **no backend anywhere**.

## Problem Statement

Traditional access control leaks identity and usage:

- Verifiers learn *who* is requesting access, creating surveillance risk.
- Fixed membership lists are static: adding/removing members requires re-deployment.
- A credential checked at multiple applications can be **replayed** and **linked** across services.
- Users must disclose *everything* to prove eligibility (e.g. "I am over 21"), even when only the predicate matters.

## Solution

Level 4 separates identity from authorization using a compact set of cryptographic primitives (all verified working under Compact 0.31.1):

1. **Merkle-tree allowlist.** Members are encoded as on-chain commitments in a `MerkleTree<10, Bytes<32>>` (1024 capacity). Enrollment happens **post-deployment** via an issuer-authorized circuit — no redeploy, no server.
2. **Credential-knowledge proofs.** A holder proves, in one Groth16 proof, knowledge of the preimage commitment *and* that the commitment is a tree leaf (the Merkle path stays private — the contract only sees a recomputed root).
3. **Replay protection without linkability.** Each credential derives a deterministic, wallet-independent **per-application nullifier**; a credential is single-use per app and leaves no cross-app trace.
4. **Selective disclosure.** `proveEligibility` proves predicates over hidden `Uint<8>` attributes (`age`, `tier`) — the app learns "eligible", not the values.
5. **Revocation.** The issuer can revoke/un-revoke a credential's app-nullifier; third parties never see the underlying credential.

## Why this matters

- **Reusable credentials** — one credential, many applications, one use per app.
- **Stronger verification flows** — an application verifies exactly the property it needs, and nothing more.
- **Serverless issuance** — an offline issuer CLI handles credential lifecycle; no hosted backend, no API keys.
- **Documented trade-offs** — `ownPublicKey()` is a witness function, not an authenticator; signature circuits are unavailable in 0.31.1; authorization is therefore credential-knowledge based (see `docs/security-model.md`).

## Technical Approach

### Smart Contract (`contracts/shadowpass4.compact`)

```
struct MemberRecord { memberId: Bytes<32>; age: Uint<8>; tier: Uint<8> }

ledger memberships       : MerkleTree<10, Bytes<32>>
ledger usedNullifiers    : Map<Bytes<32>, Bytes<32>>
ledger revokedNullifiers : Map<Bytes<32>, Boolean>
ledger accessCount       : Field
ledger issuerCommitment  : Bytes<32>

enroll()                          // issuer-authorized, adds commitment to tree
verifyMembership(appId)           // membership + commitment binding + nullifier
proveEligibility(appId, a, t)     // + predicates age>=a, tier>=t
revoke(appId) / unrevoke(appId)   // issuer-authorized app-nullifier management
```

### Frontend

React 19 + Vite 6, DApp Connector, 7-provider assembly with real Merkle-path witnesses (`membershipPath`, `record`, `recordSalt`, `issuerKey`), wallet-delegated Groth16 proving with HTTP fallback.

### Architecture principles

- **Serverless**: browser + wallet + contract + public indexer + static hosting + GitHub Actions + offline CLI.
- **Privacy by construction**: witness values are private transcript inputs; only disclosed commitments, the recomputed root, and nullifiers reach the ledger.

## Testing

Headless vitest suites: membership, eligibility boundaries, nullifier replay/rejection, revocation, privacy (transcript leak checks), real Groth16 prove/verify, issuer CLI behavior, wallet-state persistence. CI runs compile + typecheck + build + tests on every push.

## Deliverables

- New contract (`shadowpass4.compact`) deployed on Midnight Preprod (own address)
- Browser dApp with membership + selective-disclosure verification flows
- Offline issuer CLI + documented demo credentials
- Documentation: README, security model, deployment evidence, demo video
- CI/CD (GitHub Actions + Netlify), X product profile, 15+ meaningful commits