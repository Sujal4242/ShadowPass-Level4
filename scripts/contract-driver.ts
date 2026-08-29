// Local executable driver for the ShadowPass Level 4 contract.
//
// Builds a compact-runtime executable around the compiled contract with REAL
// witness functions (frontend/src/midnight/witnesses.ts) so ledger transitions
// and Groth16 transcripts can run headlessly — no chain, no browser. Used by
// the issuer CLI (dry-run mode) and by the Groth16/privacy test suites.
//
// Requires `npm run compile` first (compiled contract under contracts/managed).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as CompactJS from '@midnight-ntwrk/compact-js';
import type { ContractExecutable } from '@midnight-ntwrk/compact-js/effect/ContractExecutable';
import * as ContractAddress from '@midnight-ntwrk/platform-js/effect/ContractAddress';
import * as ocrt from '@midnight-ntwrk/compact-runtime';
import * as zkirV2 from '@midnight-ntwrk/zkir-v2';
import * as ledgerModule from '@midnight-ntwrk/ledger-v8';
import { makeContractExecutableRuntime } from '@midnight-ntwrk/midnight-js-types';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { Cause } from 'effect';

import * as ShadowPass4 from '../contracts/managed/shadowpass4/contract/index.js';
import type * as ShadowPass4Types from '../contracts/managed/shadowpass4/contract/index.js';
import type { Witnesses } from '../contracts/managed/shadowpass4/contract/index.js';

const KEY_SEED = Buffer.from(
  '6e0f4a3c9b1d7e5a2f8c0b4d1e9a6f3c2b5d8a1e7c4f9b0d6a3e8c1f5b2a7d4e9',
  'hex',
);

const S3_PARAMS_BASE =
  'https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com';

const encodedCoinPublicKeyBytes = () =>
  ocrt.encodeCoinPublicKey(
    ledgerModule.ZswapSecretKeys.fromSeed(KEY_SEED).coinPublicKey,
  ) as unknown as Uint8Array;

export const CIRCUIT_IDS = {
  enroll: CompactJS.ProvableCircuitId<ShadowPass4Types.Contract<any, any>>('enroll'),
  revoke: CompactJS.ProvableCircuitId<ShadowPass4Types.Contract<any, any>>('revoke'),
  unrevoke: CompactJS.ProvableCircuitId<ShadowPass4Types.Contract<any, any>>('unrevoke'),
  verifyMembership: CompactJS.ProvableCircuitId<ShadowPass4Types.Contract<any, any>>(
    'verifyMembership',
  ),
  proveEligibility: CompactJS.ProvableCircuitId<ShadowPass4Types.Contract<any, any>>(
    'proveEligibility',
  ),
} as const;

export type CircuitName = keyof typeof CIRCUIT_IDS;

const FIBER_FAILURE_CAUSE = Symbol.for('effect/Runtime/FiberFailure/Cause');

/**
 * Circuit assertions surface as CompactError deep inside the effect/Fiber
 * failure machinery. Walk the cause chain to the innermost message (e.g.
 * "failed assert: Not an authorized member") so callers and users see the
 * actual reason a transition was rejected.
 */
export function unwrapCircuitError(error: unknown): Error {
  const fiber = error as { [FIBER_FAILURE_CAUSE]?: Cause.Cause<unknown> };
  if (fiber && fiber[FIBER_FAILURE_CAUSE]) {
    for (const failure of Cause.failures(fiber[FIBER_FAILURE_CAUSE])) {
      let current: unknown = failure;
      let message = '';
      while (current && typeof current === 'object') {
        const own = current as { message?: unknown; cause?: unknown };
        if (typeof own.message === 'string' && own.message) {
          message = own.message;
        }
        current = own.cause;
      }
      if (message) {
        const unwrapped = new Error(message);
        unwrapped.cause = error;
        return unwrapped;
      }
    }
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export interface DriverOptions {
  assetsDir: string;
  witnesses: Witnesses<any>;
}

export class Level4Driver {
  readonly runtime: ReturnType<typeof makeContractExecutableRuntime>;
  readonly executable: ContractExecutable<ShadowPass4Types.Contract<any, any>, any, any, any>;
  readonly nodeZkConfigProvider: NodeZkConfigProvider<any>;
  private readonly assetsDir: string;
  private readonly witnesses: Witnesses<any>;
  private readonly paramsCache = new Map<number, Uint8Array>();
  private readonly keyMaterialProvider: Parameters<typeof zkirV2.prove>[1];

  constructor(options: DriverOptions) {
    this.assetsDir = options.assetsDir;
    this.witnesses = options.witnesses;

    this.nodeZkConfigProvider = new NodeZkConfigProvider(options.assetsDir);
    this.runtime = makeContractExecutableRuntime(this.nodeZkConfigProvider, {
      coinPublicKey: Buffer.from(encodedCoinPublicKeyBytes()).toString('hex'),
      signingKey: ocrt.sampleSigningKey(),
    });

    const compiled = CompactJS.CompiledContract.make(
      'shadowpass4',
      ShadowPass4.Contract,
    ).pipe(
      CompactJS.CompiledContract.withWitnesses(options.witnesses),
      CompactJS.CompiledContract.withCompiledFileAssets(options.assetsDir),
    );
    this.executable = CompactJS.ContractExecutable.make(compiled);

    this.keyMaterialProvider = {
      lookupKey: async (keyLocation: string) => {
        const circuit = keyLocation.replace(/^shadowpass4\//, '');
        const [proverKey, verifierKey, ir] = await Promise.all([
          readFile(this.assetPath('keys', `${circuit}.prover`)),
          readFile(this.assetPath('keys', `${circuit}.verifier`)),
          readFile(this.assetPath('zkir', `${circuit}.bzkir`)),
        ]);
        return { proverKey, verifierKey, ir };
      },
      getParams: async (k: number) => {
        let params = this.paramsCache.get(k);
        if (!params) {
          const response = await fetch(`${S3_PARAMS_BASE}/bls_midnight_2p${k}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch proving params for k=${k}: ${response.status}`);
          }
          params = new Uint8Array(await response.arrayBuffer());
          this.paramsCache.set(k, params);
        }
        return params;
      },
    };
  }

  assetPath(...parts: string[]): string {
    return join(this.assetsDir, ...parts);
  }

  async initialize(issuerCommitmentValue: Uint8Array) {
    return this.runtime.runPromise(
      this.executable.initialize({}, issuerCommitmentValue),
    );
  }

  async runCircuit(
    circuitName: CircuitName,
    state: any,
    privateState: unknown,
    zswapLocalState: any,
    ...args: unknown[]
  ) {
    try {
      return await this.runtime.runPromise(
        this.executable.circuit(
          CIRCUIT_IDS[circuitName],
          {
            address: ContractAddress.ContractAddress('00'.repeat(32)),
            contractState: state,
            privateState,
            zswapLocalState,
          },
          ...(args as any[]),
        ),
      );
    } catch (error) {
      throw unwrapCircuitError(error);
    }
  }

  /**
   * Generate and verify a real Groth16 proof for `circuitName` against the
   * given contract state. `args` are the *public* circuit arguments
   * (appId, minAge, minTier); secret material flows through the witnesses
   * attached to this driver.
   */
  async proveAndCheck(
    circuitName: CircuitName,
    contextState: any,
    privateState: unknown,
    args: Array<Uint8Array | bigint>,
  ) {
    try {
      const contract = new ShadowPass4.Contract(this.witnesses);
      const context = ocrt.createCircuitContext(
        ocrt.dummyContractAddress(),
        { bytes: encodedCoinPublicKeyBytes() },
        contextState,
        privateState as any,
      );
      const circuit = (contract.circuits as unknown as Record<
        string,
        (ctx: unknown, ...a: any[]) => any
      >)[circuitName];
      const { proofData } = circuit(context, ...args);
      const keyLocation = `shadowpass4/${circuitName}`;
      const preimage = ocrt.proofDataIntoSerializedPreimage(
        proofData.input,
        proofData.output,
        proofData.publicTranscript,
        proofData.privateTranscriptOutputs,
        keyLocation,
      );
      const proof = await zkirV2.prove(preimage, this.keyMaterialProvider);
      const bindingInputs = await zkirV2.check(preimage, this.keyMaterialProvider);
      return { preimage, proof, bindingInputs };
    } catch (error) {
      throw unwrapCircuitError(error);
    }
  }

  /**
   * Run `circuitName` up to the transcript stage (no Groth16 proving): returns
   * the raw proofData, the serialized preimage, and the public binding inputs.
   * Used by the privacy suite, which scans the public view of a transcript for
   * leaked secret material.
   */
  async transcript(
    circuitName: CircuitName,
    contextState: any,
    privateState: unknown,
    args: Array<Uint8Array | bigint>,
  ) {
    try {
      const contract = new ShadowPass4.Contract(this.witnesses);
      const context = ocrt.createCircuitContext(
        ocrt.dummyContractAddress(),
        { bytes: encodedCoinPublicKeyBytes() },
        contextState,
        privateState as any,
      );
      const circuit = (contract.circuits as unknown as Record<
        string,
        (ctx: unknown, ...a: any[]) => any
      >)[circuitName] as (ctx: unknown, ...a: any[]) => any;
      const proofData = circuit(context, ...args).proofData;
      const keyLocation = `shadowpass4/${circuitName}`;
      const preimage = ocrt.proofDataIntoSerializedPreimage(
        proofData.input,
        proofData.output,
        proofData.publicTranscript,
        proofData.privateTranscriptOutputs,
        keyLocation,
      );
      const bindingInputs = await zkirV2.check(preimage, this.keyMaterialProvider);
      return { proofData, preimage, bindingInputs };
    } catch (error) {
      throw unwrapCircuitError(error);
    }
  }

  async dispose() {
    await this.runtime.dispose();
  }
}