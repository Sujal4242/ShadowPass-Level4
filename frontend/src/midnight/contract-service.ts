/**
 * ShadowPass Level 4 — Contract service (browser-only).
 *
 * Responsibilities:
 *   1. Compile the shadowpass4 CompiledContract for the browser, bound to
 *      REAL witness functions (frontend/src/midnight/witnesses.ts) so the
 *      holder's secret material flows through the proofs.
 *   2. findDeployedContract() — load an already-deployed ShadowPass contract.
 */

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { asContractAddress } from '@midnight-ntwrk/midnight-js-types';
import type { ContractProviders, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

import { Contract, ledger } from '../compiled-contract.js';
import { CONTRACT_ADDRESS } from '../config.ts';
import {
  createShadowPass4Witnesses,
  type CredentialMaterial,
} from './witnesses.ts';

export { CONTRACT_ADDRESS } from '../config.ts';

// ---------------------------------------------------------------------------
// Compiled contract (browser, with real witnesses)
// ---------------------------------------------------------------------------

const CC: any = CompiledContract;

/** Build the shadowpass4 compiled contract for a holder's credential. */
export function buildShadowPassContract(material: CredentialMaterial) {
  return CC.make('shadowpass4', Contract).pipe(
    CC.withWitnesses(createShadowPass4Witnesses(material)),
  );
}

// ---------------------------------------------------------------------------
// Deployed contract type
// ---------------------------------------------------------------------------

export type DeployedContract = FoundContract<any>;

// ---------------------------------------------------------------------------
// findDeployedContract
// ---------------------------------------------------------------------------

export async function findShadowPassContract(
  providers: ContractProviders,
  material: CredentialMaterial,
): Promise<DeployedContract> {
  console.log('[ShadowPass] findShadowPassContract: CONTRACT_ADDRESS =', CONTRACT_ADDRESS);
  const result = await findDeployedContract(providers as any, {
    compiledContract: buildShadowPassContract(material),
    contractAddress: asContractAddress(CONTRACT_ADDRESS),
  });
  console.log('[ShadowPass] findShadowPassContract: found contract');
  return result;
}

export { ledger };