/**
 * ONE-TIME deployment script for ShadowPass on Midnight Preprod.
 *
 * This script is NOT part of the live application. It runs once to deploy
 * the ShadowPass contract to the Midnight Preprod network. After deployment,
 * the contract address is hardcoded into frontend/src/config.ts and this
 * script is never run again.
 *
 * Prerequisites:
 *   1. Docker running with proof server: docker compose up -d
 *   2. Node.js 22+
 *   3. Funded wallet (tDUST from Preprod faucet)
 *
 * Usage:
 *   SHADOWPASS_DEPLOYER_SEED=<hex> npm run deploy:v2
 *
 * Environment variables:
 *   SHADOWPASS_DEPLOYER_SEED  — hex-encoded 32-byte wallet seed (required)
 *   PRIVATE_STATE_PASSWORD    — password for LevelDB encryption (optional, has default)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'buffer';
import * as Rx from 'rxjs';

// Wallet SDK
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
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

// Wallet state persistence (no SDK imports — unit-testable independently)
import {
  loadWalletState,
  saveWalletState,
  WALLET_STATE_DIR,
  type PersistedWalletState,
  type ChildKind,
  CHILD_KINDS,
} from './wallet-state.js';

// Contract deployment
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

// ─── Enable WebSocket for GraphQL subscriptions ────────────────────────────────
import { WebSocket } from 'ws';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = WebSocket;

// ─── Network Configuration ─────────────────────────────────────────────────────
// Midnight Preprod endpoints — same as Flash Loan reference project.
const NETWORK_ID = 'preprod';
const NETWORK_CONFIG = {
  indexer:   'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node:      'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
  faucet: 'https://midnight-tmnight-preprod.nethermind.dev',
};

// ─── Allowlist Commitments ─────────────────────────────────────────────────────
// EXACT 8 commitments from docs/DEPLOYMENT-INPUTS.md.
// Slot 0 = demo credential, Slots 1-7 = deterministic filler.
// DO NOT regenerate, reorder, or replace any slot.
const ALLOWLIST_HEX: string[] = [
  'c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e',
  '5634ba7da27050e358f71072168946fe59b777f4bd2194071a38821a12c969d8',
  'e490c0c0851943f528c57de5bdb4c53374c617b18815d7191bb15c3fe5c3004f',
  'd0a71f2e6c5ae6729f43c1d300b42aa7007d78b42c9d6075f22a03e9e1c8dd1f',
  '92a6b7ba8973383d3c7fe795e48f00c9a811d55e41ac868cebcf39b395808653',
  '1aee7e080e596fc61ab86d96e117964229edce54454ae58a4fd3f8aa3721c9db',
  '835d9a7aaa77ec0d22933badd164f85fcf9c02ac0db2e96aeace6fd1af407153',
  '6dd60d0717a600771ce24a5e536655aeb8435609e18b0c7f79594edd2f64da73',
];

const ALLOWLIST: Uint8Array[] = ALLOWLIST_HEX.map(
  (hex) => new Uint8Array(Buffer.from(hex, 'hex')),
);

// ─── Compiled Contract Loading ─────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'shadowpass');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  console.error('\n❌ Contract not compiled! Run: npm run compile\n');
  process.exit(1);
}

const ShadowPass = await import(pathToFileURL(contractPath).href);

// ─── Seed Handling ─────────────────────────────────────────────────────────────

function getSeed(): string {
  const seed = process.env.SHADOWPASS_DEPLOYER_SEED;
  if (!seed) {
    console.error('\n❌ SHADOWPASS_DEPLOYER_SEED environment variable is required.');
    console.error('   Generate a random 32-byte hex seed and export it:');
    console.error('   export SHADOWPASS_DEPLOYER_SEED=$(openssl rand -hex 32)\n');
    process.exit(1);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
    console.error('\n❌ SHADOWPASS_DEPLOYER_SEED must be exactly 64 hex characters (32 bytes).\n');
    process.exit(1);
  }
  return seed.toLowerCase();
}

// ─── Wallet Creation ───────────────────────────────────────────────────────────

function deriveKeys(seed: string) {
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

interface WalletContext {
  wallet: Awaited<ReturnType<typeof WalletFacade.init>>;
  shieldedSecretKeys: ReturnType<typeof ledger.ZswapSecretKeys.fromSeed>;
  dustSecretKey: ReturnType<typeof ledger.DustSecretKey.fromSeed>;
  unshieldedKeystore: ReturnType<typeof createKeystore>;
  restored: { shielded: boolean; unshielded: boolean; dust: boolean };
}

function warnRestoreFailure(kind: ChildKind, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`  Warning: Could not restore ${kind} wallet state (${msg}); falling back to fresh sync.\n`);
}

/**
 * Build the wallet facade, restoring each child from saved state when
 * available and falling back to a from-seed start when not (or when restore
 * throws, e.g. after an SDK upgrade with an incompatible state format).
 *
 * Caller is responsible for `await wallet.waitForSyncedState()` afterwards.
 */
async function createWallet(seed: string, restore = true): Promise<WalletContext> {
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

// ─── Proof Server Readiness ────────────────────────────────────────────────────

async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
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

// ─── Wallet State Persistence ───────────────────────────────────────────────

/**
 * Sync timeout: 4 hours for Preprod (562K+ zswap events from genesis).
 * Subsequent runs with saved state will take seconds instead of hours.
 */
const SYNC_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/**
 * Serialize each child wallet's current state and persist it for the next run.
 * Safe to call multiple times. Logs but does not throw on individual failures.
 */
async function persistWalletState(ctx: WalletContext): Promise<void> {
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
      process.stderr.write(`  Warning: Could not serialize ${kind} wallet state (${msg}); next run will re-sync.\n`);
    }
  }

  saveWalletState(NETWORK_ID, next);
}

// ─── Provider Setup ────────────────────────────────────────────────────────────

function createProviders(walletCtx: WalletContext) {
  const privateStatePassword =
    process.env.PRIVATE_STATE_PASSWORD?.trim() ||
    'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: walletCtx.shieldedSecretKeys,
          dustSecretKey: walletCtx.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'shadowpass-deploy-state',
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

// ─── Compiled Contract Construction ────────────────────────────────────────────
// V2 has NO witnesses — uses withVacantWitnesses (plain function, not curried).

const CC: any = CompiledContract;
const compiledContract = CC.make('shadowpass', ShadowPass.Contract).pipe(
  CC.withVacantWitnesses,
  CC.withCompiledFileAssets(zkConfigPath),
);

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ShadowPass — One-Time Deployment to Midnight Preprod        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Get seed
  console.log('─── Wallet Setup ───────────────────────────────────────────────\n');
  const seed = getSeed();
  console.log('  Creating deployment wallet...');
  const walletCtx = await createWallet(seed);

  // Check for persisted state
  if (walletCtx.restored.shielded || walletCtx.restored.unshielded || walletCtx.restored.dust) {
    console.log('  Restored wallet state from disk — sync will be fast.');
  } else {
    console.log('  No persisted state found — fresh sync will take 200+ minutes on Preprod.');
  }

  console.log('  Syncing with network...');
  console.log(`  Sync timeout: ${SYNC_TIMEOUT_MS / 3600_000} hours`);
  console.log('  ℹ  RPC disconnection messages during sync are normal (Polkadot.js submission service).\n');
  const syncStart = Date.now();

  // Progress reporting: log every 5 seconds with shielded/unshielded/dust details
  const syncProgressInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - syncStart) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const mins = Math.floor((elapsed % 3600) / 60);
    const secs = elapsed % 60;
    const elapsedStr = hours > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    process.stdout.write(`\r  ⏳ Syncing... (${elapsedStr} elapsed)   `);
  }, 5000);

  let state;
  try {
    state = await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.filter((s) => s.isSynced),
        Rx.timeout(SYNC_TIMEOUT_MS),
      ),
    );
  } catch (err) {
    clearInterval(syncProgressInterval);
    const elapsed = Math.round((Date.now() - syncStart) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const mins = Math.floor((elapsed % 3600) / 60);
    console.log(`\n  ❌ Sync timed out after ${hours}h ${mins}m.`);
    console.log(`     Limit: ${SYNC_TIMEOUT_MS / 3600_000} hours for Preprod`);
    console.log('     Re-run the script — wallet state will be checkpointed on next successful sync.\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  clearInterval(syncProgressInterval);
  const elapsed = Math.round((Date.now() - syncStart) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const mins = Math.floor((elapsed % 3600) / 60);
  const secs = elapsed % 60;
  const elapsedStr = hours > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  process.stdout.write(`\r  ✓ Synced with network. (${elapsedStr})                    \n`);

  // Persist wallet state for next run
  console.log('  Saving wallet state for next run...');
  await persistWalletState(walletCtx);
  process.stdout.write('  ✓ Wallet state saved.                                       \n');

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  let balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`\n  Wallet Address: ${address}`);
  console.log(`  Balance: ${balance.toLocaleString()} tNight\n`);

  // Step 2: Fund wallet from faucet (if needed)
  if (balance === 0n && NETWORK_CONFIG.faucet) {
    console.log('─── Fund Wallet ────────────────────────────────────────────────\n');
    console.log(`  Wallet address: ${address}`);
    console.log(`  Faucet:         ${NETWORK_CONFIG.faucet}`);
    console.log('');
    console.log('  Waiting for tNIGHT to arrive (poll every 10s)...');
    const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
    const timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
    const start = Date.now();
    while (true) {
      await new Promise((r) => setTimeout(r, 10_000));
      const s = await Rx.firstValueFrom(
        walletCtx.wallet.state().pipe(Rx.filter((x) => x.isSynced)),
      );
      const tn = s.unshielded.balances[unshieldedToken().raw] ?? 0n;
      if (tn > 0n) {
        console.log(`\n  Funded! tNIGHT balance: ${tn.toLocaleString()}\n`);
        balance = tn;
        break;
      }
      if (Date.now() - start > timeoutMs) {
        console.log(
          `\n  ❌ Funding not received within ${Math.round(timeoutMs / 60_000)} min.`,
        );
        console.log(`  Address: ${address}`);
        console.log(`  Faucet:  ${NETWORK_CONFIG.faucet}`);
        console.log(
          '  Re-run deployment after funding — your seed is preserved.\n',
        );
        await walletCtx.wallet.stop();
        process.exit(1);
      }
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)`);
    }
  }

  // Step 3: Register for DUST
  console.log('─── DUST Token Setup ───────────────────────────────────────────\n');
  const dustState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );

  const unregisteredUtxos = dustState.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  if (unregisteredUtxos.length > 0) {
    console.log(
      `  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation...`,
    );
    const { fee } = await walletCtx.wallet.estimateRegistration(unregisteredUtxos);
    console.log(`  Registration fee: ${fee.toLocaleString()} dust`);
    await walletCtx.wallet.waitForGeneratedDust(unregisteredUtxos, fee, {
      timeoutMs: 600_000,
    });
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      unregisteredUtxos,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload) => walletCtx.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
    await walletCtx.wallet.submitTransaction(finalized);
  }

  if (dustState.dust.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST tokens...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
  console.log('  DUST tokens ready!\n');

  // Step 4: Check proof server
  console.log('─── Deploy Contract ────────────────────────────────────────────\n');

  console.log('  Checking proof server...');
  const proofServerReady = await waitForProofServer();
  if (!proofServerReady) {
    console.log(
      '\n  ❌ Proof server not responding. Run: docker compose up -d\n',
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }
  process.stdout.write('\r  Proof server ready!                                 \n');

  // Step 5: Create providers and deploy
  console.log('  Setting up providers...');
  const providers = createProviders(walletCtx);

  process.stdout.write('  Generating DUST...');
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(' done.\n');

  // ─── NETWORK SAFETY ASSERTION ────────────────────────────────────────────────
  // MANDATORY: Verify we are deploying to Midnight Preprod.
  // This assertion MUST pass or deployment is refused.
  const resolvedNetwork = getNetworkId();
  if (resolvedNetwork !== 'preprod') {
    console.error(
      `\n  ❌ REFUSING DEPLOYMENT: ShadowPass must be deployed to Midnight Preprod.\n` +
      `     Resolved network: ${resolvedNetwork}\n` +
      `     Expected: preprod\n`,
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  console.log('============================================================');
  console.log('  SHADOWPASS V2 ONE-TIME DEPLOYMENT');
  console.log('  Network: MIDNIGHT PREPROD');
  console.log('  Contract: ShadowPass');
  console.log('============================================================');
  console.log('');
  console.log('  DEPLOYMENT WILL CREATE THE SINGLE CANONICAL');
  console.log('  SHADOWPASS V2 PREPROD CONTRACT.');
  console.log('');

  console.log('  Deploying contract with 8-member allowlist...\n');

  // Retry loop for DUST shortage — same pattern as Flash Loan.
  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 5000;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      deployed = await deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [ALLOWLIST],
        privateStateId: 'shadowpass',
        initialPrivateState: {},
      });
      break;
    } catch (err: any) {
      const errMsg = err?.message || err?.toString() || '';
      const errCause = err?.cause?.message || err?.cause?.toString() || '';
      const fullError = `${errMsg} ${errCause}`;

      const isDustShortage =
        fullError.includes('Not enough Dust') ||
        fullError.includes('Insufficient Funds') ||
        fullError.includes('could not balance dust');

      if (!(isDustShortage && attempt === 1)) {
        console.error(`\n  Attempt ${attempt} error: ${errMsg}`);
        if (errCause && errCause !== errMsg)
          console.error(`  Cause: ${errCause}`);
      }

      if (
        !isDustShortage &&
        (fullError.includes('Failed to connect to Proof Server') ||
          fullError.includes('connect ECONNREFUSED 127.0.0.1:6300'))
      ) {
        console.log(
          '  ❌ Proof server unreachable. Run: docker compose up -d\n',
        );
        await walletCtx.wallet.stop();
        process.exit(1);
      }

      if (isDustShortage) {
        const currentState = await walletCtx.wallet.waitForSyncedState();
        const dustBalance = currentState.dust.balance(new Date());
        if (attempt < MAX_RETRIES) {
          if (attempt === 1) {
            console.log(
              `  Still generating DUST, retrying in ${RETRY_DELAY_MS / 1000}s...`,
            );
          } else {
            console.log(
              `  ⏳ DUST balance: ${dustBalance.toLocaleString()} (attempt ${attempt}/${MAX_RETRIES}); retrying in ${RETRY_DELAY_MS / 1000}s...`,
            );
          }
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          console.log(
            `  ❌ Not enough DUST after ${MAX_RETRIES} retries (current: ${dustBalance.toLocaleString()})`,
          );
          await walletCtx.wallet.stop();
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deployment failed after all retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('  ✅ Contract deployed successfully!\n');

  // Persist wallet state after successful deployment
  console.log('  Saving wallet state for next run...');
  await persistWalletState(walletCtx);
  process.stdout.write('  ✓ Wallet state saved.                                       \n');

  console.log('  ── Deployment Result ──────────────────────────────────────────\n');
  console.log(`  Contract Address: ${contractAddress}\n`);
  console.log('  ── Next Steps ────────────────────────────────────────────────\n');
  console.log('  1. Copy the contract address above');
  console.log('  2. Update frontend/src/config.ts → CONTRACT_ADDRESS');
  console.log('  3. Rebuild frontend: npm run build --prefix frontend');
  console.log('  4. Deploy frontend/dist to Netlify\n');

  await walletCtx.wallet.stop();
  console.log('─── Deployment complete ────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
