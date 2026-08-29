# Phase 0 — Compact 0.31.1 Feasibility Spikes (TEMPORARY)

> **STATUS: EXPERIMENTAL / NOT PRODUCTION.**
> This directory contains isolated compile/runtime feasibility probes created
> during Phase 0 of Level 4. None of these files are the production contract,
> are deployed anywhere, or part of the live application. They must be removed
> (or archived under `docs/`) before the Phase 1 MVP ships.
>
> The Level 3 contract `contracts/shadowpass.compact` is unchanged and remains
> the only production contract.

## Environment verified

- Compact compiler: `0.31.1` (`compact update 0.31.1`)
- `compact-runtime`: `0.16.0`
- `onchain-runtime-v3`: `3.1.0` (override)
- `@midnight-ntwrk/compact-js`: `2.5.1`

## How to reproduce the compile results

```bash
cd phase0
for f in spikes/*.compact; do
  n=$(basename "$f" .compact)
  compact compile --skip-zk "$f" "out/$n"
  echo "$n exit=$?"
done
```

`--skip-zk` skips Groth16 key generation so the spikes build in seconds. Keys
are not needed to prove language/stdlib feasibility.

## Spike results matrix

| Spike | File | Construct tested | 0.31.1 result |
|---|---|---|---|
| 01 | `spikes/01-merkle-membership.compact` | `MerkleTree<8, Bytes<32>>`, witness `MerkleTreePath`, `merkleTreePathRoot`, `checkRoot` | PASS |
| 02 | `spikes/02-nullifier-replay.compact` | `persistentHash` nullifier + `Map` "already used" replay guard | PASS |
| 03 | `spikes/03-revocation.compact` | revoked-nullifier `Map` membership rejection | PASS |
| 04 | `spikes/04-selective-disclosure.compact` | attribute preimage proof + disclosed selected attribute | PASS |
| 05 | `spikes/05-enrollment-dynamic.compact` | post-deploy `enroll()` inserting into `MerkleTree` + `Counter` | PASS |
| 06 | `spikes/06-wallet-binding.compact` | `ownPublicKey()` available + usable as commitment opening seed | PASS |
| 07 | `spikes/07-per-app-access.compact` | per-app nullifier (app domain in hash) + `Map` cap tracking | PASS |
| 08 | `spikes/08-hashing-primitives.compact` | `persistentHash`, `upgradeFromTransient`, `degradeToTransient` | PASS |
| 09 | `spikes/09-wallet-bound-nullifier.compact` | nullifier bound to `ownPublicKey()` — runtime replay rejection | PASS (runtime) |
| 10 | `spikes/10-historic-merkle.compact` | `HistoricMerkleTree` availability | PASS |
| 11 | `spikes/11-revocation-status.compact` | `Map` of revoked nullifiers + `remove()` re-enable | PASS |
| 12 | `spikes/12-mvp-core.compact` | consolidated MVP shape: enroll + Merkle membership + per-app nullifier | PASS |
| 13 | `spikes/13-struct-leaf-and-ownkey.compact` | struct-typed Merkle leaves + `disclose(ownPublicKey().bytes)` | PASS |
| 14 | `spikes/14-schnorr-wallet-binding.compact` | `jubjubSchnorrVerify` | FAIL — **unbound** in 0.31.1 |
| 15 | `spikes/15-ec-primitives.compact` | `hashToCurve`/`ecAdd`/`ecMul`/`ecMulGenerator` OK; `ecNeg` FAIL — unbound | PARTIAL |
| 16 | `spikes/16-selective-predicate.compact` | predicate proofs over hidden `Uint<8>` attributes (`age>=t`, `tier>=t`) | PASS |

## Runtime smoke tests (Node / tsx)

| File | Validates | Result |
|---|---|---|
| `spikes/merkle-runtime-smoke.ts` | `findPathForLeaf`, circuit execution, stranger rejection | PASS |
| `spikes/nullifier-runtime-smoke.ts` | first spend OK, replay rejected, `usedSpends.size()==1` | PASS |

Run:

```bash
npx tsx phase0/spikes/merkle-runtime-smoke.ts
npx tsx phase0/spikes/nullifier-runtime-smoke.ts
```

## Key negatives verified in 0.31.1

- `keccak256` — unbound identifier (docs describe it; the pinned compiler does not expose it)
- `jubjubSchnorrVerify` / `secp256k1EcdsaVerify` — unbound (no in-circuit signature verification)
- `ecNeg` — unbound (curve ops limited to add/mul/generator/hashToCurve)
- `Field` does not support relational operators (`>=`); `Uint<N>` does

## Discipline notes

- `disclose()` is mandatory for moving witness-derived values into ledger
  operations (`insert`, `checkRoot`, `Map.member`/`insert`). Paths can be kept
  private by disclosing *only* the recomputed root:
  `const root = disclose(merkleTreePathRoot<8, Bytes<32>>(path));`
- `ownPublicKey()` compiles and runs, but Midnight's security docs classify it
  as a **witness function** — it does not authenticate the caller. See report
  section 7 (wallet binding).
- No named constants like `0n`/`1n`; use plain integers with Uint types.

## Cleanup

Delete the entire `phase0/` directory before Phase 1 production work, or
archive this document under `docs/` and delete the `spikes/` + `out/`
artifacts.