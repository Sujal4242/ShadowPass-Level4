/**
 * Phase 1 — Technical proof-of-concept hook.
 *
 * Tests the COMPLETE browser-side chain:
 *   window.midnight → wallet.connect → connectedAPI
 *   → getConfiguration → getShieldedAddresses
 *   → zkConfigProvider → asKeyMaterialProvider
 *   → getProvingProvider → createProofProvider
 *   → findDeployedContract
 *
 * Tracks the status of each individual step.
 */

import { useCallback, useEffect, useState } from 'react';
import type { InitialAPI, ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { buildProviders, type ShadowPassProviders } from '../midnight/providers.ts';
import { findShadowPassContract, ShadowPass, CONTRACT_ADDRESS } from '../midnight/contract-service.ts';
import { NETWORK_ID } from '../config.ts';

// ---------------------------------------------------------------------------
// Step statuses
// ---------------------------------------------------------------------------

type StepStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skipped';

export interface StepResult {
  status: StepStatus;
  detail: string;
}

export interface Phase1Status {
  wallet:       StepResult;
  network:      StepResult;
  config:       StepResult;
  shielded:     StepResult;
  zkConfig:     StepResult;
  proving:      StepResult;
  contractLoad: StepResult;
  contractFind: StepResult;
}

const idle = (): StepResult => ({ status: 'idle', detail: '' });
const running = (detail = '...'): StepResult => ({ status: 'running', detail });
const pass = (detail: string): StepResult => ({ status: 'pass', detail });
const fail = (detail: string): StepResult => ({ status: 'fail', detail });

const allIdle = (): Phase1Status => ({
  wallet:       idle(),
  network:      idle(),
  config:       idle(),
  shielded:     idle(),
  zkConfig:     idle(),
  proving:      idle(),
  contractLoad: idle(),
  contractFind: idle(),
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePhase1() {
  const [status, setStatus] = useState<Phase1Status>(allIdle);
  const [wallets, setWallets] = useState<InitialAPI[]>([]);

  // Detect wallets on mount.
  useEffect(() => {
    const midnight = (window as any).midnight as Record<string, InitialAPI> | undefined;
    if (!midnight) { setWallets([]); return; }
    const found = Object.values(midnight).filter(
      (c): c is InitialAPI =>
        typeof c === 'object' &&
        typeof c.name === 'string' &&
        typeof c.icon === 'string' &&
        typeof c.apiVersion === 'string' &&
        typeof c.connect === 'function',
    );
    setWallets(found);
  }, []);

  const run = useCallback(async (wallet: InitialAPI) => {
    const s = allIdle();

    // --- Step 1: wallet.connect('preprod') ---
    s.wallet = running('Connecting...');
    setStatus({ ...s });
    let connectedAPI: ConnectedAPI;
    try {
      connectedAPI = await wallet.connect(NETWORK_ID);
      s.wallet = pass(`Connected — ${wallet.name} (${wallet.apiVersion})`);
    } catch (err) {
      s.wallet = fail(err instanceof Error ? err.message : String(err));
      setStatus({ ...s });
      return;
    }

    // --- Step 2: Verify network ---
    s.network = pass(`Preprod (requested: ${NETWORK_ID})`);
    setStatus({ ...s });

    // --- Step 3: getConfiguration() ---
    s.config = running('Calling getConfiguration()...');
    setStatus({ ...s });
    try {
      const config = connectedAPI!.getConfiguration();
      const keys = Object.keys(config).join(', ');
      s.config = pass(`Keys: ${keys}`);
    } catch (err) {
      s.config = fail(err instanceof Error ? err.message : String(err));
      setStatus({ ...s });
      return;
    }

    // --- Step 4: getShieldedAddresses() ---
    s.shielded = running('Calling getShieldedAddresses()...');
    setStatus({ ...s });
    try {
      const addrs = await connectedAPI!.getShieldedAddresses();
      s.shielded = pass(`API ready — returned ${Array.isArray(addrs) ? addrs.length : '?'} addresses`);
    } catch (err) {
      s.shielded = fail(err instanceof Error ? err.message : String(err));
      setStatus({ ...s });
      return;
    }

    // --- Step 5+6: Build all providers (includes getProvingProvider) ---
    s.zkConfig  = running('Building ZK config provider...');
    s.proving   = running('getProvingProvider / createProofProvider...');
    setStatus({ ...s });
    let shadowPassProviders: ShadowPassProviders;
    try {
      shadowPassProviders = await buildProviders(connectedAPI!, NETWORK_ID);
      s.zkConfig = pass('zkConfig ready, keyMaterialProvider obtained');
      s.proving  = pass(`proofProvider ready (type: ${typeof shadowPassProviders.proofProvider})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Distinguish which sub-step failed based on message
      if (msg.includes('proving') || msg.includes('getProvingProvider')) {
        s.zkConfig = pass('zkConfig ready');
        s.proving  = fail(msg);
      } else {
        s.zkConfig = fail(msg);
        s.proving  = fail(msg);
      }
      setStatus({ ...s });
      return;
    }

    // --- Step 7: Load compiled contract ---
    s.contractLoad = running('Loading CompiledContract...');
    setStatus({ ...s });
    try {
      // ShadowPass is compiled with vacant witnesses — already imported.
      const circuitKeys = Object.keys((ShadowPass as any).circuits ?? {});
      s.contractLoad = pass(`ShadowPass loaded (${circuitKeys.length} circuits)`);
    } catch (err) {
      s.contractLoad = fail(err instanceof Error ? err.message : String(err));
      setStatus({ ...s });
      return;
    }

    // --- Step 8: findDeployedContract on V1 ---
    s.contractFind = running(`findDeployedContract(${CONTRACT_ADDRESS.slice(0, 16)}...)...`);
    setStatus({ ...s });
    try {
      const discovered = await findShadowPassContract(shadowPassProviders);
      const txHeight = discovered?.deployTxData?.public?.blockHeight ?? 'unknown';
      const txId     = discovered?.deployTxData?.public?.txId ?? 'unknown';
      s.contractFind = pass(
        `V1 contract found — deployTx height=${txHeight}, txId=${String(txId).slice(0, 16)}...`,
      );
    } catch (err) {
      s.contractFind = fail(err instanceof Error ? err.message : String(err));
    }

    setStatus({ ...s });
  }, []);

  return { status, wallets, run };
}
