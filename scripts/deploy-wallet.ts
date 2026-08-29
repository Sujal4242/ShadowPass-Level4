// Shared Midnight node/deploy wallet helpers for one-time deployment and the
// issuer CLI. Adapted from the Level 3 scripts/deploy-v2.ts wallet creation.
//
// A wallet here is the wallet-sdk facade (shielded + unshielded + dust child
// wallets) with on-disk sync-state persistence via scripts/wallet-state.ts so
// repeated runs resume from a checkpoint instead of re-syncing from genesis.

import {
  WalletFacade,
  HDWallet,
  ShieldedWallet,
  UnshieldedWallet,
  DustWallet,
  Roles,
  createKeystore,
  NoOpTransactionHistoryStorage,
  PublicKey,
} from '@midnight-ntwrk/wallet-sdk';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  loadWalletState,
  saveWalletState,
  type PersistedWalletState,
  type ChildKind,
  CHILD_KINDS,
} from './wallet-state.js';

import { WebSocket } from 'ws';
(globalThis as any).WebSocket = WebSocket;

export const NETWORK_ID = 'preprod';

export const NETWORK_CONFIG = {
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
  faucet: 'https://midnight-tmnight-preprod.nethermind.dev',
};

export function deriveKeys(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

export interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
  restored: { shielded: boolean; unshielded: boolean; dust: boolean };
}

function warnRestoreFailure(kind: ChildKind, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `  Warning: Could not restore ${kind} wallet state (${msg}); falling back to fresh sync.\n`,
  );
}

export async function createWallet(seed: string, restore = true): Promise<WalletContext> {
  setNetworkId(NETWORK_ID);

  const keys = deriveKeys(seed);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const saved: PersistedWalletState = restore ? loadWalletState(NETWORK_ID) : {};
  const restored = { shielded: false, unshielded: false, dust: false };

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: NETWORK_CONFIG.indexer,
      indexerWsUrl: NETWORK_CONFIG.indexerWS,
    },
    provingServerUrl: new URL(NETWORK_CONFIG.proofServer),
    relayURL: new URL(NETWORK_CONFIG.node.replace(/^http/, 'ws')),
    txHistoryStorage: new NoOpTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
  };

  const wallet = await WalletFacade.init({
    configuration: walletConfig,
    shielded: async (config) => {
      const cls = ShieldedWallet(config);
      if (saved.shielded !== undefined) {
        try {
          const restoredWallet = cls.restore(saved.shielded as string);
          restored.shielded = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('shielded', err);
        }
      }
      return cls.startWithSecretKeys(shieldedSecretKeys);
    },
    unshielded: async (config) => {
      const cls = UnshieldedWallet(config);
      if (saved.unshielded !== undefined) {
        try {
          const restoredWallet = cls.restore(saved.unshielded as string);
          restored.unshielded = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('unshielded', err);
        }
      }
      return cls.startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
    },
    dust: async (config) => {
      const cls = DustWallet(config);
      if (saved.dust !== undefined) {
        try {
          const restoredWallet = cls.restore(saved.dust);
          restored.dust = true;
          return restoredWallet;
        } catch (err) {
          warnRestoreFailure('dust', err);
        }
      }
      return cls.startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      );
    },
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore, restored };
}

export async function waitForProofServer(
  maxAttempts = 60,
  delayMs = 2000,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(NETWORK_CONFIG.proofServer, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (
        code !== 'ECONNREFUSED' &&
        code !== 'UND_ERR_CONNECT_TIMEOUT' &&
        code !== 'UND_ERR_SOCKET'
      ) {
        return true;
      }
    }
    if (attempt < maxAttempts) {
      process.stdout.write(
        `\r  Waiting for proof server... (${attempt}/${maxAttempts})   `,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

export const SYNC_TIMEOUT_MS = 4 * 60 * 60 * 1000;

export async function persistWalletState(ctx: WalletContext): Promise<void> {
  const next: PersistedWalletState = {};
  for (const kind of CHILD_KINDS) {
    try {
      const child = (ctx.wallet as unknown as Record<ChildKind, { serializeState: () => Promise<unknown> }>)[kind];
      const serialized = await child.serializeState();
      if (kind === 'dust') {
        next.dust = serialized as string;
      } else {
        next[kind] = serialized;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `  Warning: Could not serialize ${kind} wallet state (${msg}); next run will re-sync.\n`,
      );
    }
  }
  saveWalletState(NETWORK_ID, next);
}

/** Get a synced wallet state, persisting the sync checkpoint afterwards. */
export async function syncWallet(
  ctx: WalletContext,
  timeoutMs = SYNC_TIMEOUT_MS,
) {
  const Rx = await import('rxjs');
  const state = await Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.filter((s: any) => s.isSynced),
      Rx.timeout(timeoutMs),
    ),
  );
  await persistWalletState(ctx);
  return state;
}

export interface ContractProviders {
  privateStateProvider: unknown;
  publicDataProvider: unknown;
  zkConfigProvider: unknown;
  proofProvider: unknown;
  walletProvider: unknown;
  midnightProvider: unknown;
}

/**
 * Assemble the six midnight-js providers (wallet, midnight, public data,
 * private state, ZK config, proof) backed by the wallet facade. `zkAssetsDir`
 * points at the compiled contract's assets; `privateStateStoreName` keys the
 * LevelDB private-state store (account-scoped per wallet).
 */
export async function createContractProviders(
  ctx: WalletContext,
  zkAssetsDir: string,
  privateStateStoreName: string,
): Promise<ContractProviders> {
  const { NodeZkConfigProvider } = await import('@midnight-ntwrk/midnight-js-node-zk-config-provider');
  const { levelPrivateStateProvider } = await import('@midnight-ntwrk/midnight-js-level-private-state-provider');
  const { indexerPublicDataProvider } = await import('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  const { httpClientProofProvider } = await import('@midnight-ntwrk/midnight-js-http-client-proof-provider');

  const privateStatePassword =
    process.env.PRIVATE_STATE_PASSWORD?.trim() ??
    'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => ctx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => ctx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: ctx.shieldedSecretKeys,
          dustSecretKey: ctx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => ctx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkAssetsDir);
  const accountId = ctx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(
      NETWORK_CONFIG.indexer,
      NETWORK_CONFIG.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(NETWORK_CONFIG.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}