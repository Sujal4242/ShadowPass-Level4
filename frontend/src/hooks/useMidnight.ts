/**
 * ShadowPass — Wallet connection hook.
 *
 * Manages the Midnight DApp Connector lifecycle:
 *   findWallets → connect → providers → contract → disconnect
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InitialAPI, ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { buildProviders, type ShadowPassProviders } from '../midnight/providers.ts';
import {
  findShadowPassContract,
  type DeployedContract,
} from '../midnight/contract-service.ts';
import type { CredentialMaterial } from '../midnight/witnesses.ts';
import type { ConnectionState } from '../midnight/types.ts';
import { NETWORK_ID, DEMO_AGE, DEMO_MEMBER_ID, DEMO_SALT, DEMO_TIER } from '../config.ts';
import { hexToBytes } from '../midnight/credential-crypto.ts';

const CONNECT_TIMEOUT_MS = 60_000;

/** Demo holder credential (public by design); the issuer enrolls the matching
 *  commitment in the deployed tree. Replace with a private credential for real
 *  use — the witness material never leaves the browser. */
export function demoMaterial(): CredentialMaterial {
  return {
    memberId: hexToBytes(DEMO_MEMBER_ID),
    age: BigInt(DEMO_AGE),
    tier: BigInt(DEMO_TIER),
    salt: hexToBytes(DEMO_SALT),
  };
}

export function findWallets(): InitialAPI[] {
  const midnight = (window as any).midnight as Record<string, InitialAPI> | undefined;
  if (!midnight) return [];
  return Object.values(midnight).filter(
    (c): c is InitialAPI =>
      typeof c === 'object' &&
      typeof c.name === 'string' &&
      typeof c.icon === 'string' &&
      typeof c.apiVersion === 'string' &&
      typeof c.connect === 'function',
  );
}

export function useMidnight() {
  const [wallets, setWallets] = useState<InitialAPI[]>([]);
  const [connection, setConnection] = useState<ConnectionState>({ state: 'disconnected' });
  const [providers, setProviders] = useState<ShadowPassProviders | null>(null);
  const [deployed, setDeployed] = useState<DeployedContract | null>(null);
  const connectedAPIRef = useRef<ConnectedAPI | null>(null);

  useEffect(() => {
    const found = findWallets();
    console.log('[ShadowPass] Wallet discovery:', found.length, 'wallet(s) found');
    found.forEach((w, i) => {
      console.log(`[ShadowPass]   wallet[${i}]: name=${w.name}, version=${w.apiVersion}, rdns=${w.rdns}`);
    });
    setWallets(found);
  }, []);

  const connect = useCallback(async (wallet: InitialAPI) => {
    console.log('[ShadowPass] connect() called for wallet:', wallet.name, '(' + wallet.apiVersion + ')');
    console.log('[ShadowPass] wallet.rdns:', wallet.rdns);
    setConnection({ state: 'connecting' });

    const connectWithTimeout = async (): Promise<{
      connectedAPI: ConnectedAPI;
      providers: ShadowPassProviders;
      deployed: DeployedContract;
      walletAddress: string;
    }> => {
      // Step 1: Wallet connection (triggers popup if not already authorized)
      console.log('[ShadowPass] wallet.connect("' + NETWORK_ID + '") called...');
      const connectedAPI = await wallet.connect(NETWORK_ID);
      console.log('[ShadowPass] wallet.connect() resolved — ConnectedAPI received');

      // Step 1b: Verify this is a real ConnectedAPI by checking its methods
      const apiMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(connectedAPI))
        .filter((m) => typeof (connectedAPI as any)[m] === 'function');
      console.log('[ShadowPass] ConnectedAPI methods:', apiMethods.join(', '));

      // Step 1c: Verify connection status via the DApp Connector
      try {
        const status = await connectedAPI.getConnectionStatus();
        console.log('[ShadowPass] getConnectionStatus():', JSON.stringify(status));
      } catch (e) {
        console.warn('[ShadowPass] getConnectionStatus() failed (non-fatal):', e);
      }

      // Step 2: Build providers (getConfiguration, getShieldedAddresses, proving)
      console.log('[ShadowPass] Calling buildProviders()...');
      const p = await buildProviders(connectedAPI, NETWORK_ID);
      console.log('[ShadowPass] buildProviders() resolved');

      // Step 2b: Capture wallet address for display
      let walletAddress = '';
      try {
        const shielded = await connectedAPI.getShieldedAddresses();
        walletAddress = shielded.shieldedAddress || '';
        console.log('[ShadowPass] Wallet shielded address:', walletAddress);
      } catch (e) {
        console.warn('[ShadowPass] getShieldedAddresses() for display failed:', e);
      }

      // Step 3: Find deployed contract (witness-bound to the demo credential)
      console.log('[ShadowPass] Calling findShadowPassContract()...');
      const d = await findShadowPassContract(p, demoMaterial());
      console.log('[ShadowPass] findShadowPassContract() resolved');

      return { connectedAPI: connectedAPI, providers: p, deployed: d, walletAddress };
    };

    try {
      const result = await Promise.race([
        connectWithTimeout(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s. Check that your wallet extension is installed and supports Midnight Preprod.`)),
            CONNECT_TIMEOUT_MS,
          ),
        ),
      ]);

      console.log('[ShadowPass] Connection successful');
      console.log('[ShadowPass]   wallet:', result.connectedAPI ? 'ConnectedAPI present' : 'MISSING');
      console.log('[ShadowPass]   address:', result.walletAddress || '(unavailable)');
      console.log('[ShadowPass]   providers:', Object.keys(result.providers).join(', '));
      connectedAPIRef.current = result.connectedAPI;
      setProviders(result.providers);
      setDeployed(result.deployed);
      setConnection({
        state: 'connected',
        walletName: wallet.name,
        walletVersion: wallet.apiVersion,
        walletAddress: result.walletAddress,
      });
      console.log('[ShadowPass] State updated to connected');
    } catch (err) {
      console.error('[ShadowPass] Connection failed:', err);
      connectedAPIRef.current = null;
      setConnection({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('[ShadowPass] disconnect() called');
    connectedAPIRef.current = null;
    setProviders(null);
    setDeployed(null);
    setConnection({ state: 'disconnected' });
    console.log('[ShadowPass] Disconnected — state cleared');
  }, []);

  return { wallets, connection, providers, deployed, connect, disconnect };
}
