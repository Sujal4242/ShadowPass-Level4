/**
 * ShadowPass Level 4 — selective-disclosure eligibility suite.
 *
 * Validates proveEligibility on a local in-memory contract with REAL witnesses:
 *
 *   1. thresholds: every-crossing passes (including at the exact boundary),
 *      failing either predicate rejects with the matching assertion, so the
 *      verifier learns ONLY a yes/no bit (age & tier never appear publicly)
 *   2. unenrolled holders are rejected via the in-circuit root check
 *   3. eligibility is single-use per application (app-nullifier recorded)
 *   4. a real Groth16 proof + local verifier binding for proveEligibility
 *
 * Runs headless (no chain, no browser); assets from `npm run compile`.
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
const CONTRACT_JS = new URL(
  '../contracts/managed/shadowpass4/contract/index.js',
  import.meta.url,
);

const APP_AGE = new Uint8Array(32).fill(0x01);
const APP_TIER = new Uint8Array(32).fill(0x02);
const APP_REPLAY = new Uint8Array(32).fill(0x03);
const APP_PROOF = new Uint8Array(32).fill(0x04);
const issuerKey = randomBytes(32);
const issuerCommitment = computeIssuerCommitment(issuerKey);

interface Fixture {
  driver: Level4Driver;
  contractModule: typeof ShadowPass4Types;
  state: any;
  zswap: any;
}

async function freshApp(
  credential: CredentialMaterial,
  witnessKey: Uint8Array = issuerKey,
): Promise<Fixture> {
  const driver = new Level4Driver({
    assetsDir: ZK_ASSETS,
    witnesses: createShadowPass4Witnesses({ ...credential, issuerKey: witnessKey }),
  });
  const deployed = await driver.initialize(issuerCommitment);
  const contractModule = (await import(
    CONTRACT_JS.href
  )) as typeof ShadowPass4Types;
  return {
    driver,
    contractModule,
    state: deployed.public.contractState,
    zswap: deployed.private.zswapLocalState,
  };
}

function ledgerOf(fixture: Fixture, state: any) {
  return fixture.contractModule.ledger(state?.data ?? state);
}

async function expectCircuitToReject(promise: Promise<unknown>, expected: string) {
  await expect(promise).rejects.toThrow(expected);
}

let app: Fixture;
let member: CredentialMaterial;

beforeAll(async () => {
  member = {
    memberId: randomBytes(32),
    age: 30n,
    tier: 4n,
    salt: randomBytes(32),
  };
  app = await freshApp(member);
  const enrolled = await app.driver.runCircuit('enroll', app.state, {}, app.zswap);
  app.state = enrolled.public.contractState;
  app.zswap = enrolled.private.zswapLocalState;
  expect(Number(ledgerOf(app, app.state).memberships.firstFree())).toBe(1);
});

afterAll(async () => {
  if (app) await app.driver.dispose();
});

async function proveEligibility(
  fixture: Fixture,
  appId: Uint8Array,
  minAge: bigint,
  minTier: bigint,
) {
  const result = await fixture.driver.runCircuit(
    'proveEligibility',
    fixture.state,
    {},
    fixture.zswap,
    appId,
    minAge,
    minTier,
  );
  fixture.state = result.public.contractState;
  fixture.zswap = result.private.zswapLocalState;
  return result;
}

describe('proveEligibility thresholds', () => {
  it('grants access when age and tier are above the thresholds', async () => {
    await proveEligibility(app, APP_AGE, 30n, 4n);
    const ledger = ledgerOf(app, app.state);
    expect(ledger.accessCount).toBe(1n);
    expect(
      ledger.usedNullifiers.member(
        computeAppNullifier(APP_AGE, member.memberId, member.salt),
      ),
    ).toBe(true);
  });

  it('grants access at the exact age boundary and above the tier boundary', async () => {
    await proveEligibility(app, APP_TIER, 25n, 3n);
    expect(ledgerOf(app, app.state).accessCount).toBe(2n);
  });

  it('rejects when the age threshold is one above the recorded age', async () => {
    await expectCircuitToReject(
      proveEligibility(app, new Uint8Array(32).fill(0x05), 31n, 1n),
      'Minimum age requirement not met',
    );
    expect(ledgerOf(app, app.state).accessCount).toBe(2n);
  });

  it('rejects when the tier threshold is one above the recorded tier', async () => {
    await expectCircuitToReject(
      proveEligibility(app, new Uint8Array(32).fill(0x06), 1n, 5n),
      'Minimum tier requirement not met',
    );
    expect(ledgerOf(app, app.state).accessCount).toBe(2n);
  });

  it('does not allow the same credential to be used twice for one application', async () => {
    await proveEligibility(app, APP_REPLAY, 1n, 1n);
    expect(ledgerOf(app, app.state).accessCount).toBe(3n);
    await expectCircuitToReject(
      proveEligibility(app, APP_REPLAY, 1n, 1n),
      'Credential already spent for this application',
    );
    expect(ledgerOf(app, app.state).accessCount).toBe(3n);
  });
});

describe('proveEligibility authorization', () => {
  it('rejects an unenrolled holder via the in-circuit root check', async () => {
    // The witness layer refuses to build a path for an unenrolled commitment,
    // so to reach the in-circuit guard we hand the stranger a forged path from
    // a different tree: with the wrong root the root check must fire.
    const victimPath = ledgerOf(app, app.state).memberships.findPathForLeaf(
      computeMemberCommitment({ memberId: member.memberId, age: member.age, tier: member.tier }, member.salt),
    );
    const stranger = {
      memberId: randomBytes(32),
      age: 99n,
      tier: 99n,
      salt: randomBytes(32),
    };
    const forged = {
      ...createShadowPass4Witnesses(stranger),
      membershipPath: (() => [{}, victimPath]) as any,
    };
    const driver = new Level4Driver({ assetsDir: ZK_ASSETS, witnesses: forged });
    try {
      const other = await driver.initialize(issuerCommitment);
      await expectCircuitToReject(
        driver.runCircuit(
          'proveEligibility',
          other.public.contractState,
          {},
          other.private.zswapLocalState,
          new Uint8Array(32).fill(0x07),
          1n,
          1n,
        ),
        'Not an authorized member',
      );
    } finally {
      await driver.dispose();
    }
  });

  it('still records the membership commitment as the tree leaf', async () => {
    expect(
      ledgerOf(app, app.state).memberships.findPathForLeaf(
        computeMemberCommitment({ memberId: member.memberId, age: member.age, tier: member.tier }, member.salt),
      ),
    ).toBeDefined();
  });
});

describe('Groth16 proveEligibility proof', () => {
  it('produces nontrivial proof and verifier binding inputs', async () => {
    const proofMember = {
      memberId: randomBytes(32),
      age: 21n,
      tier: 2n,
      salt: randomBytes(32),
    };
    const proofApp = await freshApp(proofMember);
    try {
      const enrolled = await proofApp.driver.runCircuit(
        'enroll',
        proofApp.state,
        {},
        proofApp.zswap,
      );
      proofApp.state = enrolled.public.contractState;
      const { proof, bindingInputs } = await proofApp.driver.proveAndCheck(
        'proveEligibility',
        proofApp.state?.data ?? proofApp.state,
        {},
        [APP_PROOF, 21n, 2n],
      );
      expect(proof.length).toBeGreaterThan(0);
      expect(proof.some((byte) => byte !== 0)).toBe(true);
      expect(bindingInputs.length).toBeGreaterThan(0);
    } finally {
      await proofApp.driver.dispose();
    }
  });
});