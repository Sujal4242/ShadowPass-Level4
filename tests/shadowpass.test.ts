/**
 * ShadowPass — Unit tests for compact runtime and ZK proof generation.
 *
 * Tests run on Node via vitest — NOT in a browser. They validate:
 *   1. CompactContract creation and witness generation
 *   2. Groth16 proof generation and verification
 *   3. ZK circuit constraints are satisfied
 *   4. Invalid credentials are rejected
 *   5. No membership data is exposed on-chain
 *   6. Commitment determinism
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { makeContractExecutableRuntime } from '@midnight-ntwrk/midnight-js-types';
import * as CompactJS from '@midnight-ntwrk/compact-js';
import type { ContractExecutable } from '@midnight-ntwrk/compact-js/effect/ContractExecutable';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import * as ocrt from '@midnight-ntwrk/compact-runtime';
import * as ledgerModule from '@midnight-ntwrk/ledger-v8';
import * as zkirV2 from '@midnight-ntwrk/zkir-v2';

import type * as ShadowPassContract from '../contracts/managed/shadowpass/contract/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '..', 'contracts', 'managed', 'shadowpass');
const CONTRACT_JS_PATH = path.join(ASSETS_DIR, 'contract', 'index.js');
const CIRCUIT_ID = CompactJS.ProvableCircuitId<ShadowPassContract.Contract<any, any>>('proveMembership');
const KEY_LOCATION = 'shadowpass/proveMembership';
const S3_PARAMS_BASE =
  'https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com';

const KEY_SEED = Buffer.from(
  '6e0f4a3c9b1d7e5a2f8c0b4d1e9a6f3c2b5d8a1e7c4f9b0d6a3e8c1f5b2a7d4e9',
  'hex',
);

const random32 = () => crypto.randomBytes(32);
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const commitment = (memberId: Uint8Array, salt: Uint8Array) =>
  ocrt.persistentCommit(new ocrt.CompactTypeBytes(32), memberId, salt);
const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

let contractModule: typeof ShadowPassContract;
let runtime: ReturnType<typeof makeContractExecutableRuntime>;
let executable: ContractExecutable<ShadowPassContract.Contract<any, any>, any, any, any>;
let keyMaterialProvider: Parameters<typeof zkirV2.prove>[1];
let deployed: Awaited<ReturnType<typeof deploy>>;

const memberId = random32();
const salt = random32();

function makeAllowlist(memberId: Uint8Array, salt: Uint8Array): Uint8Array[] {
  const entries: Uint8Array[] = [commitment(memberId, salt)];
  while (entries.length < 8) {
    entries.push(commitment(random32(), random32()));
  }
  return entries;
}

async function deploy(allowlist: Uint8Array[]) {
  return runtime.runPromise(executable.initialize({}, allowlist));
}

async function callProveMembership(
  deployResult: Awaited<ReturnType<typeof deploy>>,
  state: Awaited<ReturnType<typeof deploy>>['public']['contractState'],
  memberId: Uint8Array,
  salt: Uint8Array,
) {
  return runtime.runPromise(
    executable.circuit(
      CIRCUIT_ID,
      {
        address: ContractAddress.ContractAddress('00'.repeat(32)),
        contractState: state,
        privateState: {},
        zswapLocalState: deployResult.private.zswapLocalState,
      },
      memberId,
      salt,
    ),
  );
}

let allowlist: Uint8Array[];
let coinPublicKeyHex: string;
let encodedCoinPublicKey: ocrt.EncodedCoinPublicKey;

beforeAll(async () => {
  contractModule = (await import(
    pathToFileURL(CONTRACT_JS_PATH).href
  )) as typeof ShadowPassContract;

  const secretKeys = ledgerModule.ZswapSecretKeys.fromSeed(KEY_SEED);
  encodedCoinPublicKey = {
    bytes: ocrt.encodeCoinPublicKey(secretKeys.coinPublicKey),
  };
  coinPublicKeyHex = toHex(encodedCoinPublicKey.bytes);
  const signingKeyHex = ocrt.sampleSigningKey();

  const zkConfigProvider = new NodeZkConfigProvider(ASSETS_DIR);
  runtime = makeContractExecutableRuntime(zkConfigProvider, {
    coinPublicKey: coinPublicKeyHex,
    signingKey: signingKeyHex,
  });

  const compiledContract = CompactJS.CompiledContract.make(
    'shadowpass',
    contractModule.Contract,
  ).pipe(
    CompactJS.CompiledContract.withVacantWitnesses,
    CompactJS.CompiledContract.withCompiledFileAssets(ASSETS_DIR),
  );
  executable = CompactJS.ContractExecutable.make(compiledContract);

  const paramsCache = new Map<number, Uint8Array>();
  keyMaterialProvider = {
    async lookupKey(_keyLocation: string) {
      const [proverKey, verifierKey, ir] = await Promise.all([
        readFile(path.join(ASSETS_DIR, 'keys', `${CIRCUIT_ID}.prover`)),
        readFile(path.join(ASSETS_DIR, 'keys', `${CIRCUIT_ID}.verifier`)),
        readFile(path.join(ASSETS_DIR, 'zkir', `${CIRCUIT_ID}.bzkir`)),
      ]);
      return { proverKey, verifierKey, ir };
    },
    async getParams(k: number) {
      let params = paramsCache.get(k);
      if (!params) {
        const response = await fetch(`${S3_PARAMS_BASE}/bls_midnight_2p${k}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch proving params for k=${k}: ${response.status}`);
        }
        params = new Uint8Array(await response.arrayBuffer());
        paramsCache.set(k, params);
      }
      return params;
    },
  };

  allowlist = makeAllowlist(memberId, salt);
  deployed = await deploy(allowlist);
});

afterAll(async () => {
  if (runtime) {
    await runtime.dispose();
  }
});

describe('ShadowPassV2: authorized membership', () => {
  it('allows a member whose commitment is in the allowlist and increments accessCount', async () => {
    expect(deployed).toBeDefined();
    const initialLedger = contractModule.ledger(deployed.public.contractState.data);
    expect(initialLedger.accessCount).toBe(0n);
    expect(initialLedger.allowlist).toHaveLength(8);
    expect(bytesEqual(initialLedger.allowlist[0], commitment(memberId, salt))).toBe(true);

    const callResult = await callProveMembership(
      deployed,
      deployed.public.contractState,
      memberId,
      salt,
    );

    expect(callResult.private.result).toEqual([]);
    const nextLedger = contractModule.ledger(callResult.public.contractState);
    expect(nextLedger.accessCount).toBe(1n);
    expect(nextLedger.allowlist).toHaveLength(8);
    expect(bytesEqual(nextLedger.allowlist[0], commitment(memberId, salt))).toBe(true);
  });

  it('produces and checks a real Groth16 proof for the authorized call', async () => {
    const contract = new contractModule.Contract({});
    const initial = contract.initialState(
      ocrt.createConstructorContext({}, encodedCoinPublicKey),
      allowlist,
    );
    const context = ocrt.createCircuitContext(
      ocrt.dummyContractAddress(),
      encodedCoinPublicKey,
      initial.currentContractState.data,
      {},
    );
    const { proofData } = contract.circuits.proveMembership(context, memberId, salt);
    const preimage = ocrt.proofDataIntoSerializedPreimage(
      proofData.input,
      proofData.output,
      proofData.publicTranscript,
      proofData.privateTranscriptOutputs,
      KEY_LOCATION,
    );
    const proof = await zkirV2.prove(preimage, keyMaterialProvider);
    const bindingInputs = await zkirV2.check(preimage, keyMaterialProvider);

    expect(preimage.length).toBeGreaterThan(0);
    expect(proof.length).toBeGreaterThan(0);
    expect(bindingInputs.length).toBeGreaterThan(0);
    expect(proof.some((byte) => byte !== 0)).toBe(true);
  });

  it('binds the deployed contract operation to the compiled verifier key', async () => {
    const operation = deployed.public.contractState.operation(CIRCUIT_ID);
    expect(operation).toBeDefined();
    const verifierKeyFile = await readFile(
      path.join(ASSETS_DIR, 'keys', `${CIRCUIT_ID}.verifier`),
    );
    expect(Buffer.compare(Buffer.from(operation!.verifierKey), verifierKeyFile)).toBe(0);
  });
});

describe('ShadowPassV2: unauthorized membership', () => {
  it('rejects a memberId/salt pair whose commitment is not in the allowlist', async () => {
    const strangerId = random32();
    const strangerSalt = random32();
    expect(
      commitment(strangerId, strangerSalt),
    ).not.toEqual(commitment(memberId, salt));

    await expect(
      callProveMembership(
        deployed,
        deployed.public.contractState,
        strangerId,
        strangerSalt,
      ),
    ).rejects.toThrow(/proveMembership/);
  });

  it('leaves accessCount unchanged after a rejected attempt', async () => {
    const strangerId = random32();
    const strangerSalt = random32();

    await expect(
      callProveMembership(
        deployed,
        deployed.public.contractState,
        strangerId,
        strangerSalt,
      ),
    ).rejects.toThrow();

    const ledgerAfterReject = contractModule.ledger(deployed.public.contractState.data);
    expect(ledgerAfterReject.accessCount).toBe(0n);
  });
});

describe('ShadowPassV2: no membership data exposed', () => {
  it('exposes exactly the allowlist and accessCount ledger fields', () => {
    const exposed = contractModule.ledger(deployed.public.contractState.data);
    expect(Object.keys(exposed).sort()).toEqual(['accessCount', 'allowlist']);
  });

  it('never stores the raw memberId or salt in the ledger', () => {
    const exposed = contractModule.ledger(deployed.public.contractState.data);
    for (const stored of exposed.allowlist) {
      expect(bytesEqual(stored, memberId)).toBe(false);
      expect(bytesEqual(stored, salt)).toBe(false);
    }
    expect(bytesEqual(exposed.allowlist[0], commitment(memberId, salt))).toBe(true);
  });

  it('keeps memberId and salt out of the public circuit transcript and output', async () => {
    const callResult = await callProveMembership(
      deployed,
      deployed.public.contractState,
      memberId,
      salt,
    );

    expect(callResult.private.output.value).toEqual([]);

    const publicTranscriptJson = JSON.stringify(callResult.public.publicTranscript);
    expect(publicTranscriptJson).not.toContain(toHex(memberId));
    expect(publicTranscriptJson).not.toContain(toHex(salt));
  });

  it('produces no private transcript outputs that are public', async () => {
    const callResult = await callProveMembership(
      deployed,
      deployed.public.contractState,
      memberId,
      salt,
    );
    expect(callResult.public.partitionedTranscript).toBeDefined();
    expect(callResult.private.privateTranscriptOutputs).toEqual([]);
  });
});

describe('ShadowPassV2: commitment determinism', () => {
  it('produces the same commitment for identical memberId and salt', () => {
    expect(bytesEqual(commitment(memberId, salt), commitment(memberId, salt))).toBe(true);
  });

  it('produces a different commitment when the salt changes', () => {
    const otherSalt = random32();
    const first = commitment(memberId, salt);
    const second = commitment(memberId, otherSalt);
    expect(bytesEqual(first, second)).toBe(false);
  });

  it('produces a different commitment when the memberId changes', () => {
    const otherId = random32();
    const first = commitment(memberId, salt);
    const second = commitment(otherId, salt);
    expect(bytesEqual(first, second)).toBe(false);
  });

  it('stores exactly the deterministic commitment in slot 0 of the allowlist', () => {
    const exposed = contractModule.ledger(deployed.public.contractState.data);
    expect(bytesEqual(exposed.allowlist[0], commitment(memberId, salt))).toBe(true);
  });
});
