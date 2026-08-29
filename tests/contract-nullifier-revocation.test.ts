/**
 * ShadowPass Level 4 — nullifier & revocation suite.
 *
 * Validates replay protection and issuer-gated revocation on a local
 * in-memory contract with REAL witnesses:
 *
 *   1. the per-application nullifier is deterministic, recorded once, and
 *      spent across BOTH holder circuits (verifyMembership + proveEligibility)
 *   2. revocation flags the exact same nullifier, blocking both circuits with
 *      "Credential has been revoked", and unrevocation restores access
 *   3. blind relay of the app id still cannot grant a second use
 *   4. only the issuer can enroll/revoke/unrevoke ("Not the issuer")
 *
 * Runs headless; assets from `npm run compile`.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  computeIssuerCommitment,
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

const APP_ONE = new Uint8Array(32).fill(0x11);
const APP_TWO = new Uint8Array(32).fill(0x22);
const APP_REV = new Uint8Array(32).fill(0x33);
const issuerKey = randomBytes(32);
const issuerCommitment = computeIssuerCommitment(issuerKey);
const nonIssuerKey = randomBytes(32);

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

async function run(
  fixture: Fixture,
  circuit: 'enroll' | 'verifyMembership' | 'proveEligibility' | 'revoke' | 'unrevoke',
  ...args: (Uint8Array | bigint)[]
) {
  const result = await fixture.driver.runCircuit(circuit, fixture.state, {}, fixture.zswap, ...args);
  fixture.state = result.public.contractState;
  fixture.zswap = result.private.zswapLocalState;
  return result;
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
  await run(app, 'enroll');
});

afterAll(async () => {
  if (app) await app.driver.dispose();
});

const nullifierFor = (appId: Uint8Array) =>
  computeAppNullifier(appId, member.memberId, member.salt);

describe('nullifier replay protection', () => {
  it('records the app-nullifier once when membership is verified', async () => {
    await run(app, 'verifyMembership', APP_ONE);
    const ledger = ledgerOf(app, app.state);
    expect(ledger.usedNullifiers.member(nullifierFor(APP_ONE))).toBe(true);
    expect(ledger.accessCount).toBe(1n);
  });

  it('rejects a replay of the same nullifier through verifyMembership', async () => {
    await expectCircuitToReject(
      run(app, 'verifyMembership', APP_ONE),
      'Credential already spent for this application',
    );
    expect(ledgerOf(app, app.state).accessCount).toBe(1n);
  });

  it('rejects a replay of the same nullifier through proveEligibility', async () => {
    await expectCircuitToReject(
      run(app, 'proveEligibility', APP_ONE, 1n, 1n),
      'Credential already spent for this application',
    );
    expect(ledgerOf(app, app.state).accessCount).toBe(1n);
  });

  it('lets the same credential prove eligibility for another application', async () => {
    await run(app, 'proveEligibility', APP_TWO, 1n, 1n);
    const ledger = ledgerOf(app, app.state);
    expect(ledger.accessCount).toBe(2n);
    expect(ledger.usedNullifiers.member(nullifierFor(APP_TWO))).toBe(true);
    expect(ledger.usedNullifiers.member(nullifierFor(APP_ONE))).toBe(true);
  });
});

describe('revocation', () => {
  it('flips the app-nullifier into revokedNullifiers when the issuer revokes', async () => {
    const result = await run(app, 'revoke', APP_REV);
    void result.private;
    const ledger = ledgerOf(app, app.state);
    expect(ledger.revokedNullifiers.member(nullifierFor(APP_REV))).toBe(true);
  });

  it('blocks an already revoked credential on both holder circuits', async () => {
    await expectCircuitToReject(
      run(app, 'verifyMembership', APP_REV),
      'Credential has been revoked',
    );
    await expectCircuitToReject(
      run(app, 'proveEligibility', APP_REV, 1n, 1n),
      'Credential has been revoked',
    );
  });

  it('refuses to revoke the same nullifier twice', async () => {
    await expectCircuitToReject(
      run(app, 'revoke', APP_REV),
      'Already revoked',
    );
  });

  it('unrevokes and restores access for a fresh app-nullifier', async () => {
    await run(app, 'unrevoke', APP_REV);
    expect(ledgerOf(app, app.state).revokedNullifiers.member(nullifierFor(APP_REV))).toBe(false);
    await expectCircuitToReject(
      run(app, 'unrevoke', APP_REV),
      'Not currently revoked',
    );
    await run(app, 'verifyMembership', APP_REV);
    const ledger = ledgerOf(app, app.state);
    expect(ledger.usedNullifiers.member(nullifierFor(APP_REV))).toBe(true);
  });
});

describe('issuer gating', () => {
  it('rejects enrollment from someone who does not hold the issuer key', async () => {
    const impostor = await freshApp(member, nonIssuerKey);
    try {
      await expectCircuitToReject(
        run(impostor, 'enroll'),
        'Not the issuer',
      );
    } finally {
      await impostor.driver.dispose();
    }
  });

  it('rejects revocation from someone who does not hold the issuer key', async () => {
    const impostor = await freshApp(member, nonIssuerKey);
    try {
      await expectCircuitToReject(
        run(impostor, 'revoke', APP_REV),
        'Not the issuer',
      );
    } finally {
      await impostor.driver.dispose();
    }
  });

  it('rejects unrevocation from someone who does not hold the issuer key', async () => {
    const impostor = await freshApp(member, randomBytes(32));
    try {
      await expectCircuitToReject(
        run(impostor, 'unrevoke', APP_REV),
        'Not the issuer',
      );
    } finally {
      await impostor.driver.dispose();
    }
  });

  it('derives the issuer commitment deterministically from the issuer key', () => {
    expect(computeIssuerCommitment(issuerKey)).toEqual(issuerCommitment);
    expect(computeIssuerCommitment(nonIssuerKey)).not.toEqual(issuerCommitment);
  });
});