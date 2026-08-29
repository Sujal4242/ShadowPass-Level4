// On-disk keystore for the offline issuer CLI. Everything lives under
// .shadowpass-issuer/ by default (gitignored); set SHADOWPASS_ISSUER_DIR to
// relocate (used by the test suite). Reads are centralized here so the CLI
// commands and the test suite share identical parsing/validation.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bytesToHex,
  computeIssuerCommitment,
  computeMemberCommitment,
  hexToBytes,
  type MemberRecordValue,
} from '../frontend/src/midnight/credential-crypto.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function issuerDir(): string {
  return process.env.SHADOWPASS_ISSUER_DIR ?? join(ROOT, '.shadowpass-issuer');
}
export function issuerKeyFilePath(): string {
  return join(issuerDir(), 'issuer-key.json');
}
export function credentialsFilePath(): string {
  return join(issuerDir(), 'credentials.json');
}

export interface IssuerKeyStore {
  issuerKey: string;
  issuerCommitment: string;
  createdAt: string;
}

export interface CredentialEntry {
  name: string;
  memberId: string;
  age: number;
  tier: number;
  salt: string;
  commitment: string;
  enrolled: boolean;
  createdAt: string;
}

export function ensureKeystoreDir(): void {
  mkdirSync(issuerDir(), { recursive: true });
}

export function readIssuerKeystore(strict = false): IssuerKeyStore | null {
  const file = issuerKeyFilePath();
  if (!existsSync(file)) {
    if (strict) throw new Error(`No issuer key at ${file} — run gen-issuer first.`);
    return null;
  }
  const store = JSON.parse(readFileSync(file, 'utf8')) as IssuerKeyStore;
  if (typeof store.issuerKey !== 'string' || store.issuerKey.length !== 64) {
    throw new Error('Corrupt issuer keystore: issuerKey must be a 64-char hex string.');
  }
  return store;
}

export function writeIssuerKeystore(issuerKey: Uint8Array): IssuerKeyStore {
  ensureKeystoreDir();
  const hex = bytesToHex(issuerKey);
  const store: IssuerKeyStore = {
    issuerKey: hex,
    issuerCommitment: bytesToHex(computeIssuerCommitment(issuerKey)),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(issuerKeyFilePath(), `${JSON.stringify(store, null, 2)}\n`);
  return store;
}

export function readCredentials(): CredentialEntry[] {
  const file = credentialsFilePath();
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Corrupt credentials file: expected an array.');
  return raw as CredentialEntry[];
}

export function writeCredentials(credentials: CredentialEntry[]): void {
  ensureKeystoreDir();
  writeFileSync(credentialsFilePath(), `${JSON.stringify(credentials, null, 2)}\n`);
}

export function allocateCredential(
  entries: CredentialEntry[],
  name: string,
  memberId: Uint8Array,
  age: number,
  tier: number,
): CredentialEntry {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const commitment = bytesToHex(
    computeMemberCommitment(
      { memberId, age: BigInt(age), tier: BigInt(tier) },
      salt,
    ),
  );
  return {
    name,
    memberId: bytesToHex(memberId),
    age,
    tier,
    salt: bytesToHex(salt),
    commitment,
    enrolled: false,
    createdAt: new Date().toISOString(),
  };
}

export function findCredential(
  entries: CredentialEntry[],
  opts: { name?: string; memberId?: string; index?: number },
): CredentialEntry {
  if (opts.index !== undefined) {
    const entry = entries[opts.index];
    if (entry) return entry;
    throw new Error(`No credential at index ${opts.index} (${entries.length} stored).`);
  }
  if (opts.name !== undefined) {
    const entry = entries.find((c) => c.name === opts.name);
    if (entry) return entry;
    throw new Error(`No credential named "${opts.name}".`);
  }
  if (opts.memberId !== undefined) {
    const entry = entries.find((c) => c.memberId === opts.memberId);
    if (entry) return entry;
    throw new Error(`No credential with memberId ${opts.memberId}.`);
  }
  throw new Error('Select a credential with --name, --memberId or --index.');
}

export function credentialValue(entry: CredentialEntry): MemberRecordValue {
  return {
    memberId: hexToBytes(entry.memberId),
    age: BigInt(entry.age),
    tier: BigInt(entry.tier),
  };
}

export function credentialSalt(entry: CredentialEntry): Uint8Array {
  return hexToBytes(entry.salt);
}