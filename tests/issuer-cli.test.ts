/**
 * ShadowPass Level 4 — issuer CLI primitives.
 *
 * Covers the offline credential cryptography and keystore behavior that the
 * issuer CLI is built on: deterministic commitments/nullifiers (matching the
 * on-chain circuits), right-padding, keystore round-trips, and selection
 * helpers. Cross-consistency with the deployed contract circuits is validated
 * in the membership suite (tests/contract-membership.test.ts).
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  pad32,
  bytesToHex,
  hexToBytes,
  randomBytes32,
  computeIssuerCommitment,
  computeMemberCommitment,
  computeAppNullifier,
  ISSUE_PAD,
  USE_PAD,
} from '../frontend/src/midnight/credential-crypto.js';

import {
  writeIssuerKeystore,
  readIssuerKeystore,
  writeCredentials,
  readCredentials,
  allocateCredential,
  findCredential,
  credentialValue,
  credentialSalt,
  issuerDir,
  issuerKeyFilePath,
  credentialsFilePath,
  type CredentialEntry,
} from '../scripts/issuer-keystore.js';

let keystoreDir: string;
let issuerKey: Uint8Array;
let issuerCommitment: Uint8Array;

beforeAll(() => {
  keystoreDir = mkdtempSync(join(tmpdir(), 'shadowpass-issuer-'));
  process.env.SHADOWPASS_ISSUER_DIR = keystoreDir;
  issuerKey = randomBytes32();
  issuerCommitment = computeIssuerCommitment(issuerKey);
});

afterAll(() => {
  rmSync(keystoreDir, { recursive: true, force: true });
  delete process.env.SHADOWPASS_ISSUER_DIR;
});

const textEncoder = new TextEncoder();
const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

describe('credential cryptography (headless Compact hashing)', () => {
  it('right-pads strings to exactly 32 bytes', () => {
    const padded = pad32(ISSUE_PAD);
    expect(padded).toHaveLength(32);
    for (let i = 0; i < ISSUE_PAD.length; i += 1) {
      expect(padded[i]).toBe(textEncoder.encode(ISSUE_PAD)[i]);
    }
    for (let i = ISSUE_PAD.length; i < 32; i += 1) expect(padded[i]).toBe(0);
  });

  it('computes a deterministic issuer commitment (32 bytes)', () => {
    expect(issuerCommitment).toHaveLength(32);
    expect(bytesEqual(computeIssuerCommitment(issuerKey), issuerCommitment)).toBe(true);
    expect(bytesEqual(computeIssuerCommitment(randomBytes32()), issuerCommitment)).toBe(false);
  });

  it('computes a deterministic member commitment that varies with record and salt', () => {
    const record = { memberId: randomBytes32(), age: 30n, tier: 4n };
    const saltA = randomBytes32();
    const saltB = randomBytes32();
    const c1 = computeMemberCommitment(record, saltA);
    expect(c1).toHaveLength(32);
    expect(bytesEqual(computeMemberCommitment(record, saltA), c1)).toBe(true);
    expect(bytesEqual(computeMemberCommitment(record, saltB), c1)).toBe(false);
    expect(
      bytesEqual(computeMemberCommitment({ ...record, age: 31n }, saltA), c1),
    ).toBe(false);
  });

  it('computes a per-app nullifier that is deterministic and unlinkable across apps', () => {
    const memberId = randomBytes32();
    const salt = randomBytes32();
    const appA = randomBytes32();
    const appB = randomBytes32();
    const nulA = computeAppNullifier(appA, memberId, salt);
    expect(nulA).toHaveLength(32);
    expect(bytesEqual(computeAppNullifier(appA, memberId, salt), nulA)).toBe(true);
    expect(bytesEqual(computeAppNullifier(appB, memberId, salt), nulA)).toBe(false);
    expect(bytesEqual(nulA, computeAppNullifier(appA, memberId, randomBytes32()))).toBe(false);
    expect(pad32(USE_PAD)[0]).toBe(textEncoder.encode(USE_PAD)[0]);
  });

  it('hex conversions round-trip and reject malformed input', () => {
    const value = randomBytes32();
    expect(bytesEqual(hexToBytes(bytesToHex(value)), value)).toBe(true);
    expect(bytesEqual(hexToBytes(`0x${bytesToHex(value)}`), value)).toBe(true);
    expect(() => hexToBytes('abcd')).toThrow();
    expect(() => hexToBytes('zz'.repeat(32))).toThrow();
  });
});

function makeEntry(name: string, age: number, tier: number): CredentialEntry {
  return allocateCredential([], name, randomBytes32(), age, tier);
}

describe('issuer keystore', () => {
  it('persists and restores the issuer key with a matching commitment', () => {
    expect(existsSync(issuerKeyFilePath())).toBe(false);
    const stored = writeIssuerKeystore(issuerKey);
    expect(stored.issuerCommitment).toBe(bytesToHex(issuerCommitment));
    const restored = readIssuerKeystore(true);
    expect(restored!.issuerKey).toBe(bytesToHex(issuerKey));
    expect(restored!.issuerCommitment).toBe(bytesToHex(issuerCommitment));
    expect(readIssuerKeystore(false)).toEqual(stored);
  });

  it('keeps credentials in sync with the computed commitments', () => {
    const entry = makeEntry('alice', 30, 4);
    const recomputed = computeMemberCommitment(credentialValue(entry), credentialSalt(entry));
    expect(entry.commitment).toBe(bytesToHex(recomputed));
    expect(entry.enrolled).toBe(false);
  });

  it('round-trips the credentials file', () => {
    const entries = [makeEntry('alice', 30, 4), makeEntry('bob', 19, 2)];
    writeCredentials(entries);
    const restored = readCredentials();
    expect(restored).toHaveLength(2);
    expect(restored[0].name).toBe('alice');
    expect(restored[1].age).toBe(19);
  });

  it('finds credentials by index, name and memberId; rejects unknown ones', () => {
    const entries = [makeEntry('alice', 30, 4), makeEntry('bob', 19, 2)];
    expect(findCredential(entries, { index: 0 }).name).toBe('alice');
    expect(findCredential(entries, { name: 'bob' }).age).toBe(19);
    expect(findCredential(entries, { memberId: entries[0].memberId }).name).toBe('alice');
    expect(() => findCredential(entries, { index: 5 })).toThrow();
    expect(() => findCredential(entries, { name: 'nobody' })).toThrow();
    expect(() => findCredential(entries, {})).toThrow();
  });

  it('respects SHADOWPASS_ISSUER_DIR (no stray files outside temp dir)', () => {
    expect(issuerDir()).toBe(keystoreDir);
    const onDisk = JSON.parse(readFileSync(credentialsFilePath(), 'utf8')) as CredentialEntry[];
    expect(Array.isArray(onDisk)).toBe(true);
  });
});