// Offline credential cryptography for ShadowPass Level 4.
//
// All values are computed headlessly with compact-runtime so the issuer CLI
// (and tests) can produce byte-exact circuit constants without a running
// contract instance:
//
//   - issuerCommitment = persistentHash<Vector<2, Bytes<32>>>([
//       pad32("shadowpass:issuer:"), issuerKey ])
//   - memberCommitment = persistentCommit<MemberRecord>(record, salt)
//   - appNullifier      = persistentHash<Vector<4, Bytes<32>>>([
//       pad32("shadowpass:use:"), appId, memberId, salt ])
//
// The descriptor shapes MUST match the compiler's on-chain serialization:
// MemberRecord { memberId: Bytes<32>, age: Uint<8>, tier: Uint<8> }.

import {
  persistentCommit,
  persistentHash,
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  type CompactType,
} from '@midnight-ntwrk/compact-runtime';

export const ISSUE_PAD = 'shadowpass:issuer:';
export const USE_PAD = 'shadowpass:use:';

export interface MemberRecordValue {
  memberId: Uint8Array;
  age: bigint;
  tier: bigint;
}

const BYTES32: CompactType<Uint8Array> = new CompactTypeBytes(32);
const UINT8: CompactType<bigint> = new CompactTypeUnsignedInteger(255n, 1);

export const recordDescriptor: CompactType<MemberRecordValue> = {
  alignment: () => BYTES32.alignment().concat(UINT8.alignment().concat(UINT8.alignment())),
  fromValue: (value) => ({
    memberId: BYTES32.fromValue(value),
    age: UINT8.fromValue(value),
    tier: UINT8.fromValue(value),
  }),
  toValue: (value) =>
    BYTES32.toValue(value.memberId).concat(
      UINT8.toValue(value.age).concat(UINT8.toValue(value.tier)),
    ),
};

const VEC2_BYTES32: CompactType<Uint8Array[]> = new CompactTypeVector(2, BYTES32);
const VEC4_BYTES32: CompactType<Uint8Array[]> = new CompactTypeVector(4, BYTES32);

/** Right-pad a string to 32 bytes, matching the compiler's pad(n, "...") literal. */
export function pad32(text: string): Uint8Array {
  const raw = new TextEncoder().encode(text);
  if (raw.length > 32) throw new Error(`pad32: string too long (${text})`);
  const out = new Uint8Array(32);
  out.set(raw, 0);
  return out;
}

export function computeIssuerCommitment(issuerKey: Uint8Array): Uint8Array {
  return persistentHash(VEC2_BYTES32, [pad32(ISSUE_PAD), issuerKey]);
}

export function computeMemberCommitment(
  record: MemberRecordValue,
  salt: Uint8Array,
): Uint8Array {
  return persistentCommit(recordDescriptor, record, salt);
}

export function computeAppNullifier(
  appId: Uint8Array,
  memberId: Uint8Array,
  salt: Uint8Array,
): Uint8Array {
  return persistentHash(VEC4_BYTES32, [pad32(USE_PAD), appId, memberId, salt]);
}

export function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`hexToBytes: expected 64 hex chars, got ${clean.length} ("${clean}")`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}