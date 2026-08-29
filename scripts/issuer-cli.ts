#!/usr/bin/env node
/**
 * ShadowPass Level 4 — offline issuer CLI.
 *
 * Credential lifecycle without a backend:
 *
 *   gen-issuer                 create the issuer keypair + issuerCommitment
 *   seed --count N             generate demo credentials (offline)
 *   credentials                list stored credentials
 *   commitment --index I       print the on-chain commitment for a credential
 *   nullifier --appId HEX [--index I]  print the per-app nullifier
 *   enroll --index I [--dry-run|--submit]
 *   revoke/unrevoke --index I --appId HEX [--dry-run|--submit]
 *
 *   --dry-run  run the operation against an in-memory contract instance with
 *              real witnesses and print the resulting ledger changes.
 *   --submit   submit the transaction to the DEPLOYED Preprod contract. Needs
 *              SP4_CONTRACT_ADDRESS and SHADOWPASS4_WALLET_SEED set, plus the
 *              dockerized proof server (docker compose up -d).
 *
 * Everything reads/writes the keystore under .shadowpass-issuer/ (gitignored).
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  bytesToHex,
  hexToBytes,
  computeMemberCommitment,
  computeAppNullifier,
  type MemberRecordValue,
} from '../frontend/src/midnight/credential-crypto.js';
import { createShadowPass4Witnesses } from '../frontend/src/midnight/witnesses.js';

import {
  readIssuerKeystore,
  writeIssuerKeystore,
  readCredentials,
  writeCredentials,
  allocateCredential,
  findCredential,
  credentialValue,
  credentialSalt,
  issuerKeyFilePath,
  credentialsFilePath,
  type CredentialEntry,
} from './issuer-keystore.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ZK_ASSETS = join(ROOT, 'contracts', 'managed', 'shadowpass4');
const CONTRACT_JS = join(ZK_ASSETS, 'contract', 'index.js');

function header(): void {
  process.stdout.write('\n══════ ShadowPass Level 4 — Issuer CLI ══════\n');
}

function fatal(message: string): never {
  process.stderr.write(`\n❌ ${message}\n\n`);
  process.exit(1);
}

function requireCompiledContract(): void {
  if (!existsSync(CONTRACT_JS)) {
    fatal('Contract not compiled. Run: npm run compile');
  }
}

function requireIssuer(): { issuerKey: Uint8Array; issuerCommitment: Uint8Array } {
  const store = readIssuerKeystore(true);
  if (!store) fatal('Run gen-issuer first.');
  return {
    issuerKey: hexToBytes(store.issuerKey),
    issuerCommitment: hexToBytes(store.issuerCommitment),
  };
}

interface ParsedArgs {
  flags: Map<string, string>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(key, next);
        i += 1;
      } else {
        flags.set(key, 'true');
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

const INT_RE = /^\d+$/;
const HEX32_RE = /^[0-9a-fA-F]{64}$/;

function intFlag(args: ParsedArgs, name: string): number | undefined {
  const raw = args.flags.get(name);
  if (raw === undefined) return undefined;
  if (!INT_RE.test(raw)) fatal(`--${name} must be a non-negative integer (got "${raw}")`);
  return Number.parseInt(raw, 10);
}

function hex32Flag(args: ParsedArgs, name: string): string | undefined {
  const raw = args.flags.get(name);
  if (raw === undefined) return undefined;
  const clean = raw.toLowerCase().replace(/^0x/, '');
  if (!HEX32_RE.test(clean)) fatal(`--${name} must be 32 bytes as hex (got "${raw}")`);
  return clean;
}

function formatCredential(entry: CredentialEntry, index: number): string {
  return (
    `  [${index}] ${entry.name.padEnd(20)} age=${entry.age} tier=${entry.tier} ` +
    `memberId=${entry.memberId.slice(0, 10)}… enrolled=${entry.enrolled ? 'yes' : 'no'}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];

  if (command === undefined) {
    header();
    process.stdout.write(
      'Usage: issuer <command> [options]\n\n' +
        'Commands:\n' +
        '  gen-issuer                   create issuer key + issuerCommitment\n' +
        '  seed --count N [--prefix S]  generate N demo credentials\n' +
        '  credentials                  list stored credentials\n' +
        '  commitment --index I         print the on-chain commitment\n' +
        '  nullifier --appId HEX [--index I]  print the per-app nullifier\n' +
        '  enroll --index I [--dry-run|--submit]\n' +
        '  revoke --index I --appId HEX [--dry-run|--submit]\n' +
        '  unrevoke --index I --appId HEX [--dry-run|--submit]\n',
    );
    return;
  }

  header();

  switch (command) {
    case 'gen-issuer': {
      if (existsSync(issuerKeyFilePath())) {
        const store = readIssuerKeystore(true);
        if (!store) fatal('Issuer keystore is corrupt; remove it and re-run gen-issuer.');
        process.stdout.write(
          `Issuer key already exists (${issuerKeyFilePath()}).\n` +
            `  issuerCommitment = ${store.issuerCommitment}\n` +
            'Keep the private key safe; issuerCommitment is the constructor argument.\n',
        );
        return;
      }
      const store = writeIssuerKeystore(crypto.getRandomValues(new Uint8Array(32)));
      process.stdout.write(
        `Issuer key generated and stored.\n` +
          `  issuerKey        = ${store.issuerKey}\n` +
          `  issuerCommitment = ${store.issuerCommitment}\n` +
          'The issuerCommitment is passed to the contract constructor at deploy time.\n',
      );
      return;
    }

    case 'seed': {
      const count = intFlag(args, 'count') ?? 3;
      const prefix = args.flags.get('prefix') ?? 'demo';
      const entries = readCredentials();
      for (let n = 1; n <= count; n += 1) {
        const slot = entries.length;
        const name = slot === 0 ? 'issuer-alice' : `${prefix}-${slot}`;
        const memberId = crypto.getRandomValues(new Uint8Array(32));
        const age = 18 + (slot * 7) % 40;
        const tier = 1 + (slot * 3) % 5;
        entries.push(allocateCredential(entries, name, memberId, age, tier));
      }
      writeCredentials(entries);
      process.stdout.write(`Generated ${count} credential(s) → ${credentialsFilePath()}\n\n`);
      for (const [i, entry] of entries.entries()) process.stdout.write(`${formatCredential(entry, i)}\n`);
      process.stdout.write('\n');
      return;
    }

    case 'credentials': {
      const entries = readCredentials();
      if (entries.length === 0) {
        process.stdout.write('No credentials stored. Run: npm run issuer:seed\n');
        return;
      }
      for (const [i, entry] of entries.entries()) process.stdout.write(`${formatCredential(entry, i)}\n`);
      process.stdout.write('\n');
      return;
    }

    case 'commitment': {
      const entry = findCredential(readCredentials(), { index: intFlag(args, 'index') });
      const record: MemberRecordValue = credentialValue(entry);
      const commitment = computeMemberCommitment(record, credentialSalt(entry));
      process.stdout.write(
        `commitment(${entry.name}) = ${bytesToHex(commitment)}\n` +
          `  matches keystore = ${bytesToHex(commitment) === entry.commitment ? 'yes' : 'NO — re-run seed'}\n`,
      );
      return;
    }

    case 'nullifier': {
      const appId = hex32Flag(args, 'appId');
      if (!appId) fatal('--appId is required for nullifier');
      const entry = findCredential(readCredentials(), { index: intFlag(args, 'index') });
      const nul = computeAppNullifier(hexToBytes(appId), hexToBytes(entry.memberId), hexToBytes(entry.salt));
      process.stdout.write(
        `use:nullifier(${entry.name}, appId=${appId.slice(0, 10)}…) = ${bytesToHex(nul)}\n`,
      );
      return;
    }

    case 'enroll':
    case 'revoke':
    case 'unrevoke': {
      const issuer = requireIssuer();
      const entry = findCredential(readCredentials(), { index: intFlag(args, 'index') });
      let appId: string | undefined;
      if (command === 'revoke' || command === 'unrevoke') {
        appId = hex32Flag(args, 'appId');
        if (!appId) fatal(`--appId is required for ${command}`);
      }

      const dryRun = args.flags.get('dry-run') === 'true';
      const submit = args.flags.get('submit') === 'true';
      if (dryRun === submit) fatal('Choose exactly one of --dry-run or --submit');

      if (submit) {
        await submitIssuerCall(command, entry, issuer, appId);
        return;
      }
      await dryRunIssuerCall(command, entry, issuer, appId);
      return;
    }

    default:
      fatal(`Unknown command "${command}". Run “issuer” with no arguments for usage.`);
  }
}

interface LedgerSnapshot {
  memberships: number;
  accessCount: bigint;
  revokedCount: number;
}

function snapshotLedger(contractModule: any, contractState: any): LedgerSnapshot {
  const unwrapped = contractState?.data ?? contractState;
  const l: any = contractModule.ledger(unwrapped);
  let revoked = 0;
  for (const [, value] of l.revokedNullifiers as Iterable<[Uint8Array, boolean]>) {
    if (value) revoked += 1;
  }
  return {
    memberships: Number((l.memberships as any)?.firstFree?.() ?? 0n),
    accessCount: l.accessCount,
    revokedCount: revoked,
  };
}

async function dryRunIssuerCall(
  command: 'enroll' | 'revoke' | 'unrevoke',
  entry: CredentialEntry,
  issuer: { issuerKey: Uint8Array; issuerCommitment: Uint8Array },
  appId?: string,
) {
  requireCompiledContract();
  const contractModule = (await import(
    pathToFileURL(CONTRACT_JS).href
  )) as typeof import('../contracts/managed/shadowpass4/contract/index.js');
  const { Level4Driver } = await import('./contract-driver.js');

  const witnesses = createShadowPass4Witnesses({
    memberId: hexToBytes(entry.memberId),
    age: BigInt(entry.age),
    tier: BigInt(entry.tier),
    salt: hexToBytes(entry.salt),
    issuerKey: issuer.issuerKey,
  });

  const driver = new Level4Driver({ assetsDir: ZK_ASSETS, witnesses });
  try {
    const deployed = await driver.initialize(issuer.issuerCommitment);
    let state: any = deployed.public.contractState;
    const privateState: unknown = {};
    const initial = snapshotLedger(contractModule, deployed.public.contractState);
    process.stdout.write(
      `Initial state → memberships=${initial.memberships} accessCount=${initial.accessCount}\n`,
    );

    if (command === 'enroll') {
      const result = await driver.runCircuit('enroll', state, privateState, deployed.private.zswapLocalState);
      const snap = snapshotLedger(contractModule, result.public.contractState);
      process.stdout.write(`enroll OK → memberships=${snap.memberships} accessCount=${snap.accessCount}\n`);
    } else {
      const enrollResult = await driver.runCircuit('enroll', state, privateState, deployed.private.zswapLocalState);
      const snap = snapshotLedger(contractModule, enrollResult.public.contractState);
      process.stdout.write(`  enroll OK → memberships=${snap.memberships}\n`);
      const result = await driver.runCircuit(
        command,
        enrollResult.public.contractState,
        privateState,
        enrollResult.private.zswapLocalState,
        hexToBytes(appId!),
      );
      const snap2 = snapshotLedger(contractModule, result.public.contractState);
      process.stdout.write(
        `${command} OK → revoked=${snap2.revokedCount} accessCount=${snap2.accessCount} memberships=${snap2.memberships}\n`,
      );
    }
    process.stdout.write('Dry-run succeeded (in-memory contract instance, real witnesses).\n');
  } finally {
    await driver.dispose();
  }
}

async function submitIssuerCall(
  command: 'enroll' | 'revoke' | 'unrevoke',
  entry: CredentialEntry,
  issuer: { issuerKey: Uint8Array },
  appId?: string,
) {
  const contractAddress = process.env.SP4_CONTRACT_ADDRESS;
  const walletSeed = process.env.SHADOWPASS4_WALLET_SEED;
  if (!contractAddress) {
    fatal(
      'SP4_CONTRACT_ADDRESS is not set.\n' +
        'The contract is deployed during the deployment milestone; until then use --dry-run.',
    );
  }
  if (!walletSeed) {
    fatal('SHADOWPASS4_WALLET_SEED is required to submit (funded Preprod wallet).');
  }

  requireCompiledContract();

  const { createWallet, syncWallet, persistWalletState, createContractProviders } =
    await import('./deploy-wallet.js');
  const { ContractAddress } = await import('@midnight-ntwrk/platform-js/effect/ContractAddress');
  const contractModule = (await import(
    pathToFileURL(CONTRACT_JS).href
  )) as typeof import('../contracts/managed/shadowpass4/contract/index.js');

  process.stdout.write('Creating wallet...\n');
  const walletCtx = await createWallet(walletSeed);
  process.stdout.write('Syncing wallet state...\n');
  await syncWallet(walletCtx);
  process.stdout.write('Wallet synced.\n');

  const providers = await createContractProviders(
    walletCtx,
    ZK_ASSETS,
    'shadowpass4-issuer-state',
  );

  const { CompiledContract } = await import('@midnight-ntwrk/midnight-js-protocol/compact-js');
  const { findDeployedContract } = await import('@midnight-ntwrk/midnight-js-contracts');

  const witnesses = createShadowPass4Witnesses({
    memberId: hexToBytes(entry.memberId),
    age: BigInt(entry.age),
    tier: BigInt(entry.tier),
    salt: hexToBytes(entry.salt),
    issuerKey: issuer.issuerKey,
  });

  const compiled = CompiledContract.make('shadowpass4', contractModule.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  const deployed = await findDeployedContract(providers as any, {
    compiledContract: compiled,
    contractAddress: ContractAddress(contractAddress),
    privateStateId: 'shadowpass4-issuer',
    initialPrivateState: {},
  } as any);

  const callTx = deployed.callTx as any;
  const tx = command === 'enroll' ? await callTx.enroll() : await callTx[command](hexToBytes(appId!));
  process.stdout.write(
    `Submitted ${command} for ${entry.name}: ${JSON.stringify(tx, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}\n`,
  );

  const credentials = readCredentials();
  const stored = credentials.find((c) => c.memberId === entry.memberId);
  if (stored) {
    stored.enrolled = true;
    writeCredentials(credentials);
  }
  await persistWalletState(walletCtx);
  await walletCtx.wallet.stop();
}

main().catch((err) => {
  process.stderr.write(`\n${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});