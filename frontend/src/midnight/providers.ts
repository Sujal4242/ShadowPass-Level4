/**
 * ShadowPass — Browser provider assembly.
 *
 * Wires the 7 midnight-js providers from a live DApp Connector wallet connection.
 * Follows the proven Flash Loan pattern:
 *   1. setNetworkId
 *   2. getConfiguration → wallet's own endpoints
 *   3. getShieldedAddresses → public keys
 *   4. Try getProvingProvider (wallet-delegated proving) with timeout
 *   5. Fall back to httpClientProofProvider (wallet's proverServerUri)
 *   6. Manually construct walletProvider and midnightProvider
 */

import type {
  CoinPublicKey,
  EncPublicKey,
  FinalizedTransaction,
} from '@midnight-ntwrk/ledger-v8';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type {
  ZKConfigProvider,
  ProofProvider,
  PublicDataProvider,
  WalletProvider,
  MidnightProvider,
  UnboundTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';

import {
  ZK_ASSETS_BASE,
  INDEXER_URL,
  INDEXER_WS_URL,
} from '../config.ts';
import type { PrivateStateId } from '@midnight-ntwrk/midnight-js-types';
import {
  SHADOWPASS_PRIVATE_STATE_ID,
  InMemoryPrivateStateProvider,
} from './in-memory-private-state-provider.ts';

// ---------------------------------------------------------------------------
// Helpers (matching Flash Loan reference)
// ---------------------------------------------------------------------------

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const matches = cleaned.match(/.{1,2}/g) ?? [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

// ---------------------------------------------------------------------------
// Provider shape
// ---------------------------------------------------------------------------

export interface ShadowPassProviders {
  zkConfigProvider:    ZKConfigProvider<string>;
  proofProvider:       ProofProvider;
  privateStateProvider: InMemoryPrivateStateProvider;
  publicDataProvider:  PublicDataProvider;
  walletProvider:      WalletProvider;
  midnightProvider:    MidnightProvider;
  privateStateId:      PrivateStateId;
}

// ---------------------------------------------------------------------------
// buildProviders
// ---------------------------------------------------------------------------

/**
 * Wires all 7 providers from a live DApp Connector wallet connection.
 *
 * Must be called **after** `wallet.connect('preprod')` has succeeded.
 *
 * Strategy (matching Flash Loan):
 *   1. setNetworkId
 *   2. getConfiguration → wallet's own indexer/prover endpoints
 *   3. getShieldedAddresses → coin + encryption public keys
 *   4. Try getProvingProvider (browser-delegated proving) with 30s timeout
 *   5. Fall back to httpClientProofProvider (wallet's proverServerUri)
 *   6. Manually construct walletProvider + midnightProvider (not casts)
 */
export async function buildProviders(
  connectedAPI: ConnectedAPI,
  networkId: string,
): Promise<ShadowPassProviders> {
  // --- 1. Set network ID (matching Flash Loan) ---
  console.log('[ShadowPass] buildProviders: setNetworkId(', networkId, ')');
  setNetworkId(networkId);

  // --- 2. Get wallet's own configuration ---
  console.log('[ShadowPass] buildProviders: getConfiguration()...');
  const config = await connectedAPI.getConfiguration();
  console.log('[ShadowPass] buildProviders: config =', {
    indexerUri: config.indexerUri,
    indexerWsUri: config.indexerWsUri,
    proverServerUri: config.proverServerUri,
  });

  // --- 3. Get shielded addresses (public keys) ---
  console.log('[ShadowPass] buildProviders: getShieldedAddresses()...');
  const shielded = await connectedAPI.getShieldedAddresses();
  console.log('[ShadowPass] buildProviders: shielded =', {
    coin: shielded.shieldedCoinPublicKey?.substring(0, 16) + '...',
    enc: shielded.shieldedEncryptionPublicKey?.substring(0, 16) + '...',
  });

  // Wallet's own endpoints are authoritative; fall back to config defaults.
  const indexerUrl   = config.indexerUri   || INDEXER_URL;
  const indexerWsUrl = config.indexerWsUri || INDEXER_WS_URL;

  // --- 4-5. ZK Config + Proof Provider ---
  const zkConfigProvider = new FetchZkConfigProvider(ZK_ASSETS_BASE, window.fetch.bind(window));

  let proofProvider: ProofProvider;
  try {
    // Try browser-delegated proving first (no proof server needed).
    const keyMaterialProvider = zkConfigProvider.asKeyMaterialProvider();
    console.log('[ShadowPass] buildProviders: calling getProvingProvider() with 30s timeout...');

    const provingProvider = await Promise.race([
      connectedAPI.getProvingProvider(keyMaterialProvider),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getProvingProvider timed out (30s)')), 30_000),
      ),
    ]);

    console.log('[ShadowPass] buildProviders: getProvingProvider() resolved');
    const { createProofProvider } = await import('@midnight-ntwrk/midnight-js-types');
    proofProvider = createProofProvider(provingProvider);
  } catch (e) {
    console.warn('[ShadowPass] buildProviders: getProvingProvider failed:', e);
    // Fall back to proof server from wallet config (Flash Loan pattern).
    const proofServerUrl = config.proverServerUri;
    if (proofServerUrl) {
      console.log('[ShadowPass] buildProviders: falling back to httpClientProofProvider');
      proofProvider = httpClientProofProvider(proofServerUrl, zkConfigProvider);
    } else {
      throw new Error(
        'No proving provider available: wallet getProvingProvider failed and no proverServerUri in wallet config.',
      );
    }
  }

  // --- 6. Public data (indexer) with diagnostic wrapper ---
  const rawPublicDataProvider = indexerPublicDataProvider(indexerUrl, indexerWsUrl);
  const publicDataProvider: PublicDataProvider = {
    ...rawPublicDataProvider,
    async queryZSwapAndContractState(contractAddress: string) {
      console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: queryZSwapAndContractState called for', contractAddress);
      const result = await (rawPublicDataProvider as any).queryZSwapAndContractState(contractAddress);
      if (result) {
        const [zswap, contractState, ledgerParams] = result;
        console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: result tuple length:', result.length);
        console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: zswap type:', typeof zswap, 'constructor:', zswap?.constructor?.name);
        console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: contractState type:', typeof contractState, 'constructor:', contractState?.constructor?.name);
        if (contractState && typeof contractState === 'object' && 'data' in contractState) {
          const data = contractState.data;
          console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: contractState.data type:', typeof data, 'constructor:', data?.constructor?.name);
          if (data && typeof data === 'object' && 'state' in data) {
            const sv = data.state;
            console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: contractState.data.state type:', typeof sv, 'constructor:', sv?.constructor?.name);
            if (sv && typeof sv === 'object' && 'value' in sv && Array.isArray(sv.value)) {
              console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: stateValue.value.length:', sv.value.length);
              sv.value.forEach((v: any, i: number) => {
                const tag = v?.tag;
                const valType = v?.value?.value;
                const isUint8 = valType instanceof Uint8Array;
                console.log(`[ShadowPass] PUBLIC-DATA-PROVIDER: stateValue[${i}]: tag=${tag} valueValueIsUint8Array=${isUint8} len=${isUint8 ? valType.length : 'N/A'}`);
                if (isUint8) {
                  console.log(`[ShadowPass] PUBLIC-DATA-PROVIDER: stateValue[${i}] hex:`, Array.from(valType).map((b: number) => b.toString(16).padStart(2, '0')).join(''));
                }
              });
            }
          }
        }
        console.log('[ShadowPass] PUBLIC-DATA-PROVIDER: ledgerParams type:', typeof ledgerParams, 'constructor:', ledgerParams?.constructor?.name);
      } else {
        console.warn('[ShadowPass] PUBLIC-DATA-PROVIDER: result is null/undefined!');
      }
      return result;
    },
  } as PublicDataProvider;

  // --- 7. Private state (empty for proveMembership) ---
  const privateStateProvider = new InMemoryPrivateStateProvider();

  // --- 8. Wallet provider (manual construction, matching Flash Loan) ---
  const walletProvider: WalletProvider = {
    getCoinPublicKey(): CoinPublicKey {
      return shielded.shieldedCoinPublicKey;
    },
    getEncryptionPublicKey(): EncPublicKey {
      return shielded.shieldedEncryptionPublicKey;
    },
    async balanceTx(tx: UnboundTransaction, _ttl?: Date): Promise<FinalizedTransaction> {
      const serialized = tx.serialize();
      const result = await connectedAPI.balanceUnsealedTransaction(uint8ArrayToHex(serialized));
      return Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        hexToUint8Array(result.tx),
      ) as FinalizedTransaction;
    },
  };

  // --- 9. Midnight provider (submitTx, matching Flash Loan) ---
  const midnightProvider: MidnightProvider = {
    async submitTx(tx) {
      const serialized = tx.serialize();
      await connectedAPI.submitTransaction(uint8ArrayToHex(serialized));
      return tx.identifiers()[0];
    },
  };

  return {
    zkConfigProvider,
    proofProvider,
    privateStateProvider,
    publicDataProvider,
    walletProvider,
    midnightProvider,
    privateStateId: SHADOWPASS_PRIVATE_STATE_ID,
  };
}
