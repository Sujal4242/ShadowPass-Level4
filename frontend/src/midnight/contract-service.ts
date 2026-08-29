/**
 * ShadowPass — Contract service (browser-only).
 *
 * Responsibilities:
 *   1. Compile the ShadowPass CompiledContract for the browser.
 *   2. findDeployedContract() — load an already-deployed ShadowPass contract.
 */

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { asContractAddress } from '@midnight-ntwrk/midnight-js-types';
import type { ContractProviders, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

import { Contract, ledger } from '../compiled-contract.js';
import { CONTRACT_ADDRESS } from '../config.ts';

export { CONTRACT_ADDRESS } from '../config.ts';

// ---------------------------------------------------------------------------
// Compiled contract (browser)
// ---------------------------------------------------------------------------

const CC: any = CompiledContract;
export const ShadowPass = CC.make('shadowpass', Contract).pipe(
  CC.withVacantWitnesses,
);

// ---------------------------------------------------------------------------
// Deployed contract type
// ---------------------------------------------------------------------------

export type DeployedContract = FoundContract<any>;

// ---------------------------------------------------------------------------
// findDeployedContract
// ---------------------------------------------------------------------------

export async function findShadowPassContract(
  providers: ContractProviders,
): Promise<DeployedContract> {
  console.log('[ShadowPass] findShadowPassContract: CONTRACT_ADDRESS from config.ts =', CONTRACT_ADDRESS);
  console.log('[ShadowPass] findShadowPassContract: address being passed to findDeployedContract =', asContractAddress(CONTRACT_ADDRESS));
  console.log('[ShadowPass] findShadowPassContract: env.VITE_CONTRACT_ADDRESS =', import.meta.env.VITE_CONTRACT_ADDRESS ?? '(undefined — using fallback)');
  const result = await findDeployedContract(providers as any, {
    compiledContract: ShadowPass as any,
    contractAddress: asContractAddress(CONTRACT_ADDRESS),
  });
  console.log('[ShadowPass] findShadowPassContract: found contract');
  return result;
}
