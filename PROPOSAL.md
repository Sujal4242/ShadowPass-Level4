# PROPOSAL.md — ShadowPass

## Project Title

**ShadowPass: Private Allowlist Access on Midnight**

## Summary

ShadowPass is a zero-knowledge proof dApp that proves allowlist membership without revealing user identity. Built as a complete Midnight dApp, it generates Groth16 proofs entirely in the browser and verifies them on-chain.

## Problem Statement

Traditional membership verification systems reveal user identity to the verifier. This creates privacy concerns:

- The on-chain transaction history reveals which addresses are members
- Multiple verifications can be linked to track user behavior
- Membership lists can be harvested from public blockchain data

## Solution

ShadowPass uses zero-knowledge proofs to decouple identity from membership verification:

1. **Commitment-based allowlist:** Members are registered as `persistentCommit(memberId, salt)` commitments on-chain
2. **ZK proof generation:** The browser generates a Groth16 proof that proves knowledge of a valid `(memberId, salt)` pair matching one of the on-chain commitments
3. **Privacy preservation:** The proof reveals nothing about which commitment matched, preventing tracking

## Technical Approach

### Smart Contract (Compact)

```compact
contract ShadowPass {
  allowlist: Persistent<Bytes<32>, 8>;
  accessCount: Persistent<Uint<64>>;

  constructor(members: Vector<8, Bytes<32>>) {
    this.allowlist.setAll(members);
    this.accessCount.set(0n);
  }

  proveMembership(memberId: Bytes<32>, salt: Bytes<32>) {
    require(this.allowlist.has(persistentCommit<Bytes<32>>(memberId, salt)));
    this.accessCount.set(this.accessCount.get() + 1n);
  }
}
```

### dApp Architecture

- **Complete Midnight dApp:** Compact smart contract, browser-based proving, wallet integration, production frontend
- **Browser-native ZK proving:** Uses WASM-based Groth16 prover via `dapp-connector-api`
- **Wallet integration:** Connects via Midnight DApp Connector (1AM, Lace)
- **React + Vite:** Modern build tooling with hot module replacement

### Privacy Model

| Aspect | ShadowPass | Traditional Systems |
|--------|------------|-------------------|
| Identity on-chain | Hidden (ZK proof) | Visible (wallet address) |
| Verifiability | Proof of membership only | Proof of specific identity |
| Tracking | Impossible (unlinkable proofs) | Possible (address monitoring) |
| Allowlist privacy | Commitments only | Public member list |

## Implementation Status

### Phase 0: Feasibility ✅
- Verified 7 midnight-js providers work with DApp Connector
- Confirmed browser-native proving is possible
- Validated contract compilation pipeline

### Phase 1: Technical POC ✅
- 8-step provider wiring validated in browser
- Wallet connection → contract loading → proof generation all verified
- Cross-fetch shim fix implemented

### Phase 2: Design ✅
- Old ShadowPass contract analysis confirmed no changes needed
- Deterministic demo credential model approved
- Comprehensive test plan documented

### Phase 3: Implementation ✅
- Frontend verification flow
- Unit tests with Groth16 proof generation
- CI/CD pipeline
- Documentation

## Key Decisions

1. **No contract changes from Old ShadowPass:** The circuit correctly implements `persistentCommit` verification
2. **Demo credentials are public:** Intentional for demonstration; production uses private credential distribution
3. **Browser-native proving:** No proof server dependency; all ZK computation happens in the browser via WASM
4. **Membership is wallet-independent:** The circuit verifies `persistentCommit(memberId, salt)`, not wallet addresses

## Testing Strategy

- **Unit tests:** CompactContract creation, proof generation, valid/invalid credential verification
- **Integration tests:** Full browser flow validation (Phase 1 completed)
- **CI/CD:** Automated test + build on every push

## Future Work

1. **Private credential distribution:** Replace demo credentials with issuer-based enrollment
2. **Multi-member verification:** Support batch proofs for multiple credentials
3. **Mainnet deployment:** Upgrade to mainnet when available
4. **Circuit optimization:** Reduce proof generation time and memory usage

## Links

- [Midnight Network](https://github.com/midnightntwk/midnight-network)
- [Compact Language](https://docs.midnight.network/)
- [DApp Connector API](https://github.com/midnightntwk/dapp-connector-api)

## License

MIT
