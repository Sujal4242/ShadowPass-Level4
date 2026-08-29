# ShadowPass — Preprod Deployment Inputs

## Network

**Midnight Preprod**

## Contract

**ShadowPass**

Source: `contracts/shadowpass.compact` (identical bytecode to Old ShadowPass)

## Allowlist Size

**8 entries** (`Vector<8, Bytes<32>>`)

## Slot 0 — Demo Credential Commitment

This slot corresponds to the **public demo credential** documented in `DEMO-CREDENTIALS.md`.

| Field | Value |
|-------|-------|
| Member ID | `deadbeef000000000000000000000000000000000000000000000000deadbeef` |
| Salt | `cafebabe000000000000000000000000000000000000000000000000cafebabe` |
| Commitment (slot 0) | `c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e` |

Computed using: `persistentCommit<Bytes<32>>(memberId, salt)` from `@midnight-ntwrk/compact-runtime`.

## Slots 1-7 — Deterministic Filler Commitments

These are valid 32-byte commitments generated from deterministic inputs for reproducibility. They do NOT correspond to any disclosed credentials.

| Slot | Input (UTF-8) | Salt (UTF-8) | memberId (hex) | salt (hex) | Commitment |
|------|---------------|--------------|----------------|------------|------------|
| 1 | `member-01-demo` | `salt-01-demo` | `6d656d6265722d30312d64656d6f000000000000000000000000000000000000` | `73616c742d30312d64656d6f0000000000000000000000000000000000000000` | `5634ba7da27050e358f71072168946fe59b777f4bd2194071a38821a12c969d8` |
| 2 | `member-02-demo` | `salt-02-demo` | `6d656d6265722d30322d64656d6f000000000000000000000000000000000000` | `73616c742d30322d64656d6f0000000000000000000000000000000000000000` | `e490c0c0851943f528c57de5bdb4c53374c617b18815d7191bb15c3fe5c3004f` |
| 3 | `member-03-demo` | `salt-03-demo` | `6d656d6265722d30332d64656d6f000000000000000000000000000000000000` | `73616c742d30332d64656d6f0000000000000000000000000000000000000000` | `d0a71f2e6c5ae6729f43c1d300b42aa7007d78b42c9d6075f22a03e9e1c8dd1f` |
| 4 | `member-04-demo` | `salt-04-demo` | `6d656d6265722d30342d64656d6f000000000000000000000000000000000000` | `73616c742d30342d64656d6f0000000000000000000000000000000000000000` | `92a6b7ba8973383d3c7fe795e48f00c9a811d55e41ac868cebcf39b395808653` |
| 5 | `member-05-demo` | `salt-05-demo` | `6d656d6265722d30352d64656d6f000000000000000000000000000000000000` | `73616c742d30352d64656d6f0000000000000000000000000000000000000000` | `1aee7e080e596fc61ab86d96e117964229edce54454ae58a4fd3f8aa3721c9db` |
| 6 | `member-06-demo` | `salt-06-demo` | `6d656d6265722d30362d64656d6f000000000000000000000000000000000000` | `73616c742d30362d64656d6f0000000000000000000000000000000000000000` | `835d9a7aaa77ec0d22933badd164f85fcf9c02ac0db2e96aeace6fd1af407153` |
| 7 | `member-07-demo` | `salt-07-demo` | `6d656d6265722d30372d64656d6f000000000000000000000000000000000000` | `73616c742d30372d64656d6f0000000000000000000000000000000000000000` | `6dd60d0717a600771ce24a5e536655aeb8435609e18b0c7f79594edd2f64da73` |

These filler commitments were generated using `persistentCommit<Bytes<32>>(paddedMemberId, paddedSalt)` where the inputs are UTF-8 strings zero-padded to 32 bytes.

## Complete Allowlist (Constructor Argument)

```
[
  0: c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e  (demo)
  1: 5634ba7da27050e358f71072168946fe59b777f4bd2194071a38821a12c969d8  (filler)
  2: e490c0c0851943f528c57de5bdb4c53374c617b18815d7191bb15c3fe5c3004f  (filler)
  3: d0a71f2e6c5ae6729f43c1d300b42aa7007d78b42c9d6075f22a03e9e1c8dd1f  (filler)
  4: 92a6b7ba8973383d3c7fe795e48f00c9a811d55e41ac868cebcf39b395808653  (filler)
  5: 1aee7e080e596fc61ab86d96e117964229edce54454ae58a4fd3f8aa3721c9db  (filler)
  6: 835d9a7aaa77ec0d22933badd164f85fcf9c02ac0db2e96aeace6fd1af407153  (filler)
  7: 6dd60d0717a600771ce24a5e536655aeb8435609e18b0c7f79594edd2f64da73  (filler)
]
```

## Initial Ledger State

| Field | Value |
|-------|-------|
| `allowlist` | 8 × 32-byte commitments (see above) |
| `accessCount` | `0` (Field / bigint) |

## Private State

**Empty** — `{}`

The `proveMembership` circuit has no witnesses and no private state. The `Witnesses<PS>` type is empty.

## Witnesses

**None** — the compiled contract declares no witness functions.

## Important Notes

- **Slot 0 corresponds to the public demo credential.** The evaluator uses this credential to demonstrate the ZK proof flow.
- **The evaluator's wallet is NOT an allowlist entry.** The wallet address is only the transaction signer/prover. Membership is verified via `persistentCommit(memberId, salt)`.
- **The live frontend will connect to this single deployed address.** The contract address is hardcoded in `frontend/src/config.ts`.
- **The frontend will never deploy a contract.** It only uses `findDeployedContract()` to load the existing deployment.
- **Filler commitments (slots 1-7) are NOT disclosed as usable credentials.** They exist only to fill the `Vector<8, Bytes<32>>` allowlist.
