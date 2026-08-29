// Shared witness implementations for the ShadowPass Level 4 contract.
//
// These are the *real* witnesses used by the browser (holder flows), the
// issuer CLI (enroll/revoke/unrevoke) and the test harness. The circuits
// receive their secret material exclusively through these witness functions;
// nothing sensitive is ever passed as a circuit argument.

import type { Witnesses } from '../compiled-contract.js';

import { computeAppNullifier, computeMemberCommitment } from './credential-crypto.js';

export interface CredentialMaterial {
  memberId: Uint8Array;
  age: bigint;
  tier: bigint;
  salt: Uint8Array;
  issuerKey?: Uint8Array;
}

/** The commitment a credential hides behind; must be a Merkle leaf when enrolled. */
export function memberCommitment(material: CredentialMaterial): Uint8Array {
  return computeMemberCommitment(
    { memberId: material.memberId, age: material.age, tier: material.tier },
    material.salt,
  );
}

/** The single-use per-application nullifier for a credential. */
export function appNullifier(
  appId: Uint8Array,
  memberId: Uint8Array,
  salt: Uint8Array,
): Uint8Array {
  return computeAppNullifier(appId, memberId, salt);
}

export function createShadowPass4Witnesses<PS>(
  material: CredentialMaterial,
): Witnesses<PS> {
  const record: Witnesses<PS>['record'] = (ctx) => [
    ctx.privateState,
    { memberId: material.memberId, age: material.age, tier: material.tier },
  ];

  const recordSalt: Witnesses<PS>['recordSalt'] = (ctx) => [
    ctx.privateState,
    material.salt,
  ];

  const membershipPath: Witnesses<PS>['membershipPath'] = (ctx, commitment) => {
    const path: unknown = ctx.ledger.memberships.findPathForLeaf(commitment);
    if (!path) {
      throw new Error('shadowpass4: credential is not enrolled (commitment not in tree)');
    }
    return [ctx.privateState, path as any];
  };

  const issuerKey: Witnesses<PS>['issuerKey'] = (ctx) => [
    ctx.privateState,
    material.issuerKey ?? new Uint8Array(32),
  ];

  return { record, recordSalt, membershipPath, issuerKey };
}