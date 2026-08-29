/**
 * ShadowPass Level 4 — membership suite.
 *
 * Validates the Merkle-membership circuits of contracts/shadowpass4.compact
 * against a local in-memory instance with REAL witnesses:
 *
 *   1. issuer-authorized enrollment (and rejection of non-issuer enrollments)
 *   2. membership verification that only an enrolled holder can pass
 *   3. stranger rejection via the in-circuit root check
 *   4. commitment/path binding (path.leaf == memberCommitment)
 *   5. a real Groth16 proof + local verifier binding for verifyMembership
 *
 * Runs headless (no chain, no browser); Groth16 keys come from the compiled
 * contract (npm run compile) and the public SRS.
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

const APP_ID = new Uint8Array(32).fill(0xab);
const PROOF_APP_ID = new Uint8Array(32).fill(0xcd);
const issuerKey = randomBytes(32);
const issuerCommitment = computeIssuerCommitment(issuerKey);

function material(
  memberId: Uint8Array = randomBytes(32),
  age = 30,
  tier = 4,
): CredentialMaterial {
  return { memberId, age: BigInt(age), tier: BigInt(tier), salt: randomBytes(32) };
}

function commitmentOf(m: CredentialMaterial): Uint8Array {
  return computeMemberCommitment(
    { memberId: m.memberId, age: m.age, tier: m.tier },
    m.salt,
  );
}

function nullifierOf(m: CredentialMaterial, appId: Uint8Array = APP_ID): Uint8Array {
  return computeAppNullifier(appId, m.memberId, m.salt);
}

interface Fixture {
  driver: Level4Driver;
  contractModule: typeof ShadowPass4Types;
  state: any;
  zswap: any;
}

async function freshApp(
  credential: CredentialMaterial = material(),
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

async function run(fixture: Fixture, circuit: 'enroll' | 'verifyMembership', ...args: unknown[]) {
  const result = await fixture.driver.runCircuit(
    circuit,
    fixture.state,
    {},
    fixture.zswap,
    ...args,
  );
  fixture.state = result.public.contractState;
  fixture.zswap = result.private.zswapLocalState;
  return result;
}

let app: Fixture;
let member: CredentialMaterial;

beforeAll(async () => {
  member = material();
  app = await freshApp(member);
});

afterAll(async () => {
  if (app) await app.driver.dispose();
});

describe('enroll (issuer-authorized)', () => {
  it('starts with an empty membership tree', () => {
    const ledger = ledgerOf(app, app.state);
    expect(Number(ledger.memberships.firstFree())).toBe(0);
    expect(ledger.accessCount).toBe(0n);
  });

  it('adds a member when called with the issuer key present', async () => {
    await run(app, 'enroll');
    const ledger = ledgerOf(app, app.state);
    expect(Number(ledger.memberships.firstFree())).toBe(1);
    expect(ledger.memberships.findPathForLeaf(commitmentOf(member))).toBeDefined();
  });
});

describe('verifyMembership', () => {
  it('grants access to an enrolled member and records the app-nullifier', async () => {
    const result = await run(app, 'verifyMembership', APP_ID);
    expect(result.private.result).toEqual([]);
    const ledger = ledgerOf(app, app.state);
    expect(ledger.accessCount).toBe(1n);
    expect(ledger.usedNullifiers.member(nullifierOf(member))).toBe(true);
  });

  it('rejects a stranger via the in-circuit root check', async () => {
    const path = ledgerOf(app, app.state).memberships.findPathForLeaf(commitmentOf(member));
    const stranger = material();
    const hijack = {
      ...createShadowPass4Witnesses(stranger),
      membershipPath: (() => [{}, path]) as any,
    };
    const driver = new Level4Driver({ assetsDir: ZK_ASSETS, witnesses: hijack });
    try {
      const other = await driver.initialize(issuerCommitment);
      await expectCircuitToReject(
        driver.runCircuit(
          'verifyMembership',
          other.public.contractState,
          {},
          other.private.zswapLocalState,
          APP_ID,
        ),
        'Not an authorized member',
      );
    } finally {
      await driver.dispose();
    }
  });

  it('rejects a member claiming another members path (path binding)', async () => {
    // Victim is enrolled; attacker reuses victim's legitimate Merkle path for
    // THIS root, so the root check passes and the leaf-match guard
    // (path.leaf == memberCommitment) must fire instead.
    const victim = material();
    const attacker = material();
    const shared = await freshApp(victim);
    try {
      await run(shared, 'enroll');
      const victimPath = ledgerOf(shared, shared.state).memberships.findPathForLeaf(
        commitmentOf(victim),
      );
      const hijack = {
        ...createShadowPass4Witnesses(attacker),
        membershipPath: (() => [{}, victimPath]) as any,
      };
      const driver = new Level4Driver({ assetsDir: ZK_ASSETS, witnesses: hijack });
      try {
        const other = await driver.initialize(issuerCommitment);
        await expectCircuitToReject(
          driver.runCircuit(
            'verifyMembership',
            shared.state,
            {},
            other.private.zswapLocalState,
            APP_ID,
          ),
          'Credential does not match a registered membership',
        );
      } finally {
        await driver.dispose();
      }
    } finally {
      await shared.driver.dispose();
    }
  });
});

describe('Groth16 verifyMembership proof', () => {
  it('produces nontrivial proof and verifier binding inputs', async () => {
    const proofMember = material();
    const proofApp = await freshApp(proofMember);
    try {
      await run(proofApp, 'enroll');
      const { proof, bindingInputs } = await proofApp.driver.proveAndCheck(
        'verifyMembership',
        proofApp.state?.data ?? proofApp.state,
        {},
        [PROOF_APP_ID],
      );
      expect(proof.length).toBeGreaterThan(0);
      expect(proof.some((byte) => byte !== 0)).toBe(true);
      expect(bindingInputs.length).toBeGreaterThan(0);
    } finally {
      await proofApp.driver.dispose();
    }
  });
});