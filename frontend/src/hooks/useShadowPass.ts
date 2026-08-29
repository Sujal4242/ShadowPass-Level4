/**
 * ShadowPass Level 4 — holder verification hook.
 *
 * Runs the membership/eligibility circuits against a deployed contract with
 * the holder's witness material: `verify(deployed, appId)` builds a
 * witness-bound compiled contract and calls verifyMembership(appId). The
 * holder's memberId/salt/attributes live ONLY in the witnesses (never passed
 * as circuit arguments); the appId is the public per-app replay domain.
 */

import { useCallback, useState } from 'react';
import type { ShadowPassProviders } from '../midnight/providers.ts';
import { findShadowPassContract } from '../midnight/contract-service.ts';
import type { DeployedContract } from '../midnight/contract-service.ts';
import type { CredentialMaterial } from '../midnight/witnesses.ts';
import type { VerificationState } from '../midnight/types.ts';
import { hexToBytes } from '../midnight/credential-crypto.ts';

function classifyError(message: string): { denied: boolean; state: VerificationState } {
  const deniedHints = [
    'Not an authorized member',
    'Credential has been revoked',
    'Credential already spent for this application',
    'Minimum age requirement not met',
    'Minimum tier requirement not met',
    'Credential does not match a registered membership',
    'Membership tree is full',
  ];
  const denied = deniedHints.some((hint) => message.includes(hint));
  if (denied) {
    return { denied, state: { state: 'denied', message } };
  }
  if (message.includes('balance') || message.includes('Dust') || message.includes('Funds')) {
    return {
      denied,
      state: { state: 'error', message: 'Insufficient funds. Please obtain Preprod test tokens.' },
    };
  }
  return { denied, state: { state: 'error', message } };
}

export function useShadowPass() {
  const [verification, setVerification] = useState<VerificationState>({ state: 'idle' });
  const [accessCount, setAccessCount] = useState<number | null>(null);

  const refreshAccessCount = useCallback(async (deployed: DeployedContract) => {
    try {
      const contractModule = (await import('../compiled-contract.js')).default
        ?? (await import('../compiled-contract.js'));
      const state = deployed.deployTxData?.public?.initialContractState;
      if (state && typeof contractModule === 'object' && 'ledger' in contractModule) {
        const l = (contractModule as any).ledger(state.data);
        setAccessCount(Number(l.accessCount));
      }
    } catch {
      // Silently ignore — accessCount display is non-critical
    }
  }, []);

  const verify = useCallback(async (
    providers: ShadowPassProviders,
    material: CredentialMaterial,
    appIdHex: string,
  ) => {
    setVerification({ state: 'generating' });

    let appId: Uint8Array;
    try {
      appId = hexToBytes(appIdHex);
    } catch (err) {
      console.error('[ShadowPass] appId parse error:', err);
      setVerification({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      return;
    }

    try {
      // Bind the compiled contract to the holder's witness material so the
      // proof carries the credential without ever passing it as a public arg.
      setVerification({ state: 'awaiting-wallet' });
      const deployed = await findShadowPassContract(providers, material);
      console.log('[ShadowPass] Calling deployed.callTx.verifyMembership(appId)...');
      const tx = await (deployed.callTx.verifyMembership as any)(appId);
      console.log('[ShadowPass] verifyMembership returned:', {
        status: tx?.public?.status,
        hasTxId: !!tx?.public?.txId,
      });

      const status = tx.public.status;
      const isSuccess = typeof status === 'object' && status !== null && 'tag' in status
        ? (status as any).tag === 'SucceedEntirely'
        : String(status).includes('SucceedEntirely');

      if (isSuccess) {
        const txId = tx.public.txId ?? '';
        const blockHeight = tx.public.blockHeight ?? 0;
        console.log('[ShadowPass] Verification SUCCESS:', { txId, blockHeight });

        let count = 0;
        try {
          const contractModule = (await import('../compiled-contract.js'));
          const ledgerFn = (contractModule as any).ledger;
          if (ledgerFn && tx.public.nextContractState) {
            const l = ledgerFn((tx.public as any).nextContractState?.data ?? (tx.public as any).nextContractState);
            count = Number(l.accessCount);
            setAccessCount(count);
          }
        } catch {
          // count stays 0
        }

        setVerification({
          state: 'granted',
          txId: String(txId),
          blockHeight: Number(blockHeight),
          accessCount: count,
        });
      } else {
        const statusStr = JSON.stringify(status);
        console.error('[ShadowPass] Verification DENIED — status:', statusStr);
        setVerification({ state: 'denied', message: `Transaction rejected (status: ${statusStr})` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ShadowPass] Verification error:', msg);
      const { state } = classifyError(msg);
      setVerification(state);
    }
  }, []);

  const reset = useCallback(() => {
    setVerification({ state: 'idle' });
  }, []);

  return { verification, accessCount, verify, reset, refreshAccessCount };
}