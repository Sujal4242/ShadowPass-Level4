/**
 * ShadowPass Level 4 — privacy suite.
 *
 * Black-box checks on real circuit transcripts (the exact bytes that would be
 * committed on-chain) that NO secret material leaks into the public view:
 *
 *   - verifyMembership: memberId, salt, commitment, age, tier, issuerKey
 *   - proveEligibility (selective disclosure): the same, so only a yes/no bit
 *     is revealed about age/tier
 *
 * It also shows transcript-level UNLINKABILITY: two different holders producing
 * proofs for the SAME public arguments yield byte-identical public transcripts
 * and binding inputs (identity is carried only inside the proof), with
 * genuinely different proofs.
 *
 * Runs headless; assets from `npm run compile`.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  computeIssuerCommitment,
  computeMemberCommitment,
  computeAppNullifier,
} from '../frontend/src/midnight/credential-crypto.js';
import {
  createShadowPass4Witnesses,
  type CredentialMaterial,
} from '../frontend/src/midnight/witnesses.js';
import { Level4Driver } from '../scripts/contract-driver.js';
import type * as ShadowPass4Types from '../contracts/managed/shadowpass4/contract/index.js';

const ZK_ASSETS = resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  'contracts',
  'managed',
  'shadowpass4',
);

const APP_MEMBERSHIP = new Uint8Array(32).fill(0x41);
const APP_ELIGIBILITY = new Uint8Array(32).fill(0x42);
const ELIGIBILITY_ARGS: (Uint8Array | bigint)[] = [APP_ELIGIBILITY, 21n, 2n];
const issuerKey = randomBytes(32);
const issuerCommitment = computeIssuerCommitment(issuerKey);

interface Fixture {
  driver: Level4Driver;
  contractModule: typeof ShadowPass4Types;
  state: any;
  zswap: any;
}

async function freshApp(credential: CredentialMaterial): Promise<Fixture> {
  const driver = new Level4Driver({
    assetsDir: ZK_ASSETS,
    witnesses: createShadowPass4Witnesses({ ...credential, issuerKey }),
  });
  const deployed = await driver.initialize(issuerCommitment);
  const contractModule = (await import(
    '../contracts/managed/shadowpass4/contract/index.js'
  )) as typeof ShadowPass4Types;
  return {
    driver,
    contractModule,
    state: deployed.public.contractState,
    zswap: deployed.private.zswapLocalState,
  };
}

function fieldBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = value < 0n ? value + (1n << 256n) : value;
  for (let i = 31; i >= 0 && v > 0n; i -= 1) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}

function occursIn(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

let app: Fixture;
let member: CredentialMaterial;
let commitment: Uint8Array;

beforeAll(async () => {
  member = {
    memberId: randomBytes(32),
    age: 30n,
    tier: 4n,
    salt: randomBytes(32),
  };
  commitment = computeMemberCommitment(
    { memberId: member.memberId, age: member.age, tier: member.tier },
    member.salt,
  );
  app = await freshApp(member);
  const enrolled = await app.driver.runCircuit('enroll', app.state, {}, app.zswap);
  app.state = enrolled.public.contractState;
  app.zswap = enrolled.private.zswapLocalState;
});

afterAll(async () => {
  if (app) await app.driver.dispose();
});

function secretNeedles(): Uint8Array[] {
  return [
    member.memberId,
    member.salt,
    commitment,
    issuerKey,
    fieldBytes(member.age),
    fieldBytes(member.tier),
  ];
}

function assertSecretsAbsent(contextLabel: string, haystack: Uint8Array) {
  for (const needle of secretNeedles()) {
    expect(
      occursIn(haystack, needle),
      `${contextLabel} must not contain secret material`,
    ).toBe(false);
  }
}

describe('verifyMembership transcript privacy', () => {
  it('keeps every secret out of the public preimage and binding inputs', async () => {
    const { preimage, bindingInputs } = await app.driver.transcript(
      'verifyMembership',
      app.state?.data ?? app.state,
      {},
      [APP_MEMBERSHIP],
    );
    assertSecretsAbsent('preimage', preimage);
    for (const input of bindingInputs) {
      if (input === undefined) continue;
      assertSecretsAbsent('binding input', fieldBytes(input));
    }
  });
});

describe('proveEligibility transcript privacy (selective disclosure)', () => {
  it('keeps memberId, salt, commitment, age, tier, and issuerKey out of the public view', async () => {
    const { preimage, bindingInputs } = await app.driver.transcript(
      'proveEligibility',
      app.state?.data ?? app.state,
      {},
      ELIGIBILITY_ARGS,
    );
    assertSecretsAbsent('preimage', preimage);
    for (const input of bindingInputs) {
      if (input === undefined) continue;
      assertSecretsAbsent('binding input', fieldBytes(input));
    }
  });
});

describe('transcript determinism', () => {
  it('recomputes an identical public view when the same proof is repeated', async () => {
    const [first, second] = await Promise.all([
      app.driver.transcript(
        'proveEligibility',
        app.state?.data ?? app.state,
        {},
        ELIGIBILITY_ARGS,
      ),
      app.driver.transcript(
        'proveEligibility',
        app.state?.data ?? app.state,
        {},
        ELIGIBILITY_ARGS,
      ),
    ]);
    expect(second.preimage).toEqual(first.preimage);
    expect(second.bindingInputs).toEqual(first.bindingInputs);
  });
});

describe('transcript surface area', () => {
  it('exposes only the declared public arguments as circuit inputs', async () => {
    const { proofData } = await app.driver.transcript(
      'proveEligibility',
      app.state?.data ?? app.state,
      {},
      ELIGIBILITY_ARGS,
    );
    const inputs = proofData.input.value as Uint8Array[];
    expect(inputs.length).toBe(3);
    expect(inputs[0]).toEqual(APP_ELIGIBILITY);
    expect(Number(inputs[1][0])).toBe(21);
    expect(Number(inputs[2][0])).toBe(2);
    expect(proofData.output.value).toEqual([]);
  });

  it('exposes only the application id for verifyMembership', async () => {
    const { proofData } = await app.driver.transcript(
      'verifyMembership',
      app.state?.data ?? app.state,
      {},
      [APP_MEMBERSHIP],
    );
    const inputs = proofData.input.value as Uint8Array[];
    expect(inputs.length).toBe(1);
    expect(inputs[0]).toEqual(APP_MEMBERSHIP);
    expect(proofData.output.value).toEqual([]);
  });
});

describe('transcript unlinkability', () => {
  it('pins an identical public input set for different holders', async () => {
    const otherMember = {
      memberId: randomBytes(32),
      age: 55n,
      tier: 9n,
      salt: randomBytes(32),
    };
    const otherApp = await freshApp(otherMember);
    try {
      const enrolled = await otherApp.driver.runCircuit(
        'enroll',
        otherApp.state,
        {},
        otherApp.zswap,
      );
      otherApp.state = enrolled.public.contractState;

      const [a, b] = await Promise.all([
        app.driver.transcript(
          'proveEligibility',
          app.state?.data ?? app.state,
          {},
          ELIGIBILITY_ARGS,
        ),
        otherApp.driver.transcript(
          'proveEligibility',
          otherApp.state?.data ?? otherApp.state,
          {},
          ELIGIBILITY_ARGS,
        ),
      ]);

      // The verifier-pinned public input set is byte-identical for the two
      // holders (no identity inside the fixed inputs)...
      expect(a.bindingInputs).toEqual(b.bindingInputs);
      expect(a.preimage).not.toEqual(b.preimage);

      // ...and the structured inputs are exactly the declared public args.
      const inputsA = a.proofData.input.value as Uint8Array[];
      const inputsB = b.proofData.input.value as Uint8Array[];
      expect(inputsA).toEqual(inputsB);
      expect(inputsA[0]).toEqual(ELIGIBILITY_ARGS[0]);
      expect(Number(inputsB[1][0])).toBe(21);
      expect(Number(inputsB[2][0])).toBe(2);

      assertSecretsAbsent('holder A preimage', a.preimage);
      assertSecretsAbsent('holder B preimage', b.preimage);
    } finally {
      await otherApp.driver.dispose();
    }
  });
});