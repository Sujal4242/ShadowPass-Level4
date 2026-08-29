/**
 * ShadowPass — Membership verification hook.
 *
 * Handles the full verify flow:
 *   validate credentials → proveMembership → result
 */

import { useCallback, useState } from 'react';
import type { DeployedContract } from '../midnight/contract-service.ts';
import type { VerificationState } from '../midnight/types.ts';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length !== 64) throw new Error(`Expected 64 hex characters, got ${clean.length}`);
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error('Invalid hex characters');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function useShadowPass() {
  const [verification, setVerification] = useState<VerificationState>({ state: 'idle' });
  const [accessCount, setAccessCount] = useState<number | null>(null);

  const refreshAccessCount = useCallback(async (deployed: DeployedContract) => {
    try {
      const contractModule = (await import('../compiled-contract.js')).default ?? (await import('../compiled-contract.js'));
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
    deployed: DeployedContract,
    memberIdHex: string,
    saltHex: string,
  ) => {
    setVerification({ state: 'generating' });

    let memberIdBytes: Uint8Array;
    let saltBytes: Uint8Array;
    try {
      memberIdBytes = hexToBytes(memberIdHex);
      saltBytes = hexToBytes(saltHex);
      console.log('[ShadowPass] Credential bytes:', {
        memberId: Array.from(memberIdBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        salt: Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
      });
    } catch (err) {
      console.error('[ShadowPass] Credential parse error:', err);
      setVerification({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      return;
    }

    try {
      setVerification({ state: 'awaiting-wallet' });
      console.log('[ShadowPass] Calling deployed.callTx.proveMembership...');

      // --- State diagnostic: inspect what we have before calling callTx ---
      const toHex = (a: Uint8Array) => Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
      try {
        console.group('[ShadowPass] STATE-DIAG before proveMembership');
        const dtxData = (deployed as any).deployTxData;
        console.log('deployTxData type:', typeof dtxData);
        console.log('deployTxData.public keys:', dtxData?.public ? Object.keys(dtxData.public) : 'N/A');
        const ics = dtxData?.public?.initialContractState;
        console.log('initialContractState type:', typeof ics);
        console.log('initialContractState.constructor?.name:', ics?.constructor?.name);
        if (ics && typeof ics === 'object') {
          console.log('initialContractState keys:', Object.keys(ics));
          if ('data' in ics) {
            const data = ics.data;
            console.log('initialContractState.data type:', typeof data);
            console.log('initialContractState.data.constructor?.name:', data?.constructor?.name);
            if (data && typeof data === 'object' && 'state' in data) {
              const stateVal = data.state;
              console.log('initialContractState.data.state type:', typeof stateVal);
              console.log('initialContractState.data.state.constructor?.name:', stateVal?.constructor?.name);
              if (typeof stateVal === 'object' && stateVal !== null && 'value' in stateVal) {
                console.log('initialContractState.data.state.value type:', typeof stateVal.value, 'isArray:', Array.isArray(stateVal.value));
                if (Array.isArray(stateVal.value)) {
                  console.log('initialContractState.data.state.value.length:', stateVal.value.length);
                  stateVal.value.forEach((v: any, i: number) => {
                    console.log(`  stateValue[${i}]: tag=${v?.tag} type=${typeof v}`);
                    if (v?.value && typeof v.value === 'object') {
                      console.log(`    value.keys:`, Object.keys(v.value));
                      if (v.value.value instanceof Uint8Array) {
                        console.log(`    value.value (Uint8Array): len=${v.value.value.length} hex=${toHex(v.value.value)}`);
                      } else {
                        console.log(`    value.value:`, v.value.value);
                      }
                    }
                  });
                }
              }
            }
          }
        }
        console.groupEnd();
      } catch (diagErr) {
        console.error('[ShadowPass] STATE-DIAG error:', diagErr);
      }

      const tx = await (deployed.callTx.proveMembership as any)(memberIdBytes, saltBytes);
      console.log('[ShadowPass] proveMembership returned:', {
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
        setVerification({ state: 'denied', message: `Not an authorized member (status: ${statusStr})` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const fullErr = err instanceof Error ? err : new Error(String(err));
      console.error('[ShadowPass] Verification error:', fullErr);
      console.error('[ShadowPass] Error name:', fullErr.name);
      console.error('[ShadowPass] Error stack:', fullErr.stack);

      // Only classify ACTUAL assertion failures as "denied"
      if (msg.includes('Not an authorized member')) {
        setVerification({ state: 'denied', message: 'Not an authorized member' });
      } else if (msg.includes('balance') || msg.includes('Dust') || msg.includes('Funds')) {
        setVerification({ state: 'error', message: 'Insufficient funds. Please obtain Preprod test tokens.' });
      } else {
        // Show the REAL error message instead of masking it
        setVerification({ state: 'error', message: msg });
      }
    }
  }, []);

  const reset = useCallback(() => {
    setVerification({ state: 'idle' });
  }, []);

  return { verification, accessCount, verify, reset, refreshAccessCount };
}
