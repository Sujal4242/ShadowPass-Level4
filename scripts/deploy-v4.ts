/**
 * ONE-TIME deployment of the ShadowPass Level 4 contract to Midnight Preprod.
 *
 * Not part of the live application — runs once to deploy the contract, after
 * which the address is hardcoded into frontend/src/config.ts.
 *
 * Prerequisites:
 *   1. Docker proof server running: docker compose up -d
 *   2. Node.js 22+
 *   3. Funded deployer wallet (tNIGHT + DUST from the Preprod faucet)
 *   4. Issuer keystore initialized: npm run issuer:gen-issuer
 *      (the issuerCommitment is the contract constructor argument, so the
 *      issuer must exist BEFORE the contract is deployed.)
 *
 * Usage:
 *   SHADOWPASS4_DEPLOYER_SEED=<hex> npm run deploy:v4
 *
 * Environment:
 *   SHADOWPASS4_DEPLOYER_SEED — hex 32-byte wallet seed (required)
 *   PRIVATE_STATE_PASSWORD    — LevelDB password (optional, has default)
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'buffer';
import * as Rx from 'rxjs';

import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';

import {
  createWallet,
  createContractProviders,
  waitForProofServer,
  syncWallet,
  NETWORK_CONFIG,
  SYNC_TIMEOUT_MS,
} from './deploy-wallet.js';
import { readIssuerKeystore } from './issuer-keystore.js';
import { hexToBytes } from '../frontend/src/midnight/credential-crypto.js';
import { createShadowPass4Witnesses } from '../frontend/src/midnight/witnesses.js';
import type * as ShadowPass4Module from '../contracts/managed/shadowpass4/contract/index.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ZK_ASSETS = join(ROOT, 'contracts', 'managed', 'shadowpass4');
const CONTRACT_JS = join(ZK_ASSETS, 'contract', 'index.js');

function fatal(message: string): never {
  process.stderr.write(`\n❌ ${message}\n\n`);
  process.exit(1);
}

if (!existsSync(CONTRACT_JS)) fatal('Contract not compiled. Run: npm run compile');

const ShadowPass4 = (await import(
  pathToFileURL(CONTRACT_JS).href,
)) as typeof ShadowPass4Module;

function getSeed(): string {
  const seed = process.env.SHADOWPASS4_DEPLOYER_SEED;
  if (!seed) {
    fatal(
      'SHADOWPASS4_DEPLOYER_SEED is required.\n' +
        '  export SHADOWPASS4_DEPLOYER_SEED=$(openssl rand -hex 32)',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
    fatal('SHADOWPASS4_DEPLOYER_SEED must be exactly 64 hex characters (32 bytes).');
  }
  return seed.toLowerCase();
}

function getIssuerCommitment(): Uint8Array {
  const store = readIssuerKeystore(true);
  if (!store) fatal('No issuer keystore. Run: npm run issuer:gen-issuer');
  process.stdout.write(`  issuerCommitment : ${store.issuerCommitment}\n`);
  return hexToBytes(store.issuerCommitment);
}

async function ensureFundedDust(walletCtx: Awaited<ReturnType<typeof createWallet>>) {
  const dustState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s: any) => s.isSynced)),
  );
  const unregistered = dustState.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  if (unregistered.length > 0) {
    process.stdout.write(`  Registering ${unregistered.length} NIGHT UTXOs for DUST generation...\n`);
    const { fee } = await walletCtx.wallet.estimateRegistration(unregistered);
    process.stdout.write(`  Registration fee: ${fee.toLocaleString()} dust\n`);
    await walletCtx.wallet.waitForGeneratedDust(unregistered, fee, { timeoutMs: 600_000 });
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => walletCtx.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
    await walletCtx.wallet.submitTransaction(finalized);
  }
  if (dustState.dust.balance(new Date()) === 0n) {
    process.stdout.write('  Waiting for DUST tokens...\n');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s: any) => s.isSynced),
        Rx.filter((s: any) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
  process.stdout.write('  DUST tokens ready.\n');
}

async function main() {
  process.stdout.write(
    '\n╔══════════════════════════════════════════════════╗\n' +
      '║  ShadowPass Level 4 — Deploy to Midnight Preprod  ║\n' +
      '╚══════════════════════════════════════════════════╝\n\n',
  );

  process.stdout.write('─── Wallet Setup ─────────────────────────────────\n\n');
  const seed = getSeed();
  const issuerCommitment = getIssuerCommitment();

  process.stdout.write('  Creating deployer wallet...\n');
  const walletCtx = await createWallet(seed);

  if (getNetworkId() !== 'preprod') {
    fatal(
      `REFUSING DEPLOYMENT: ShadowPass Level 4 must deploy to Midnight Preprod. ` +
        `Resolved: ${getNetworkId()}`,
    );
  }

  process.stdout.write(
    walletCtx.restored.shielded || walletCtx.restored.unshielded || walletCtx.restored.dust
      ? '  Restored wallet state from disk — sync will be fast.\n'
      : '  No persisted state — fresh sync may take 200+ minutes on Preprod.\n',
  );
  process.stdout.write('  Syncing with network...\n');
  await syncWallet(walletCtx);
  process.stdout.write('  Wallet synced.\n');

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  process.stdout.write(`  Wallet Address: ${address}\n`);

  if (!process.env.SKIP_FAUCET_CHECK) {
    await ensureFundedDust(walletCtx);
  }

  process.stdout.write('\n─── Deploy Contract ───────────────────────────────\n\n');
  process.stdout.write('  Checking proof server...\n');
  const ready = await waitForProofServer();
  if (!ready) {
    fatal('Proof server not responding. Run: docker compose up -d');
  }
  process.stdout.write('  Proof server ready.\n');

  const providers = await createContractProviders(
    walletCtx,
    ZK_ASSETS,
    'shadowpass4-deploy-state',
  );

  const {
    CompiledContract,
  } = await import('@midnight-ntwrk/midnight-js-protocol/compact-js');
  const compiledContract = CompiledContract.make('shadowpass4', ShadowPass4.Contract).pipe(
    CompiledContract.withWitnesses(
      createShadowPass4Witnesses({
        memberId: new Uint8Array(32),
        age: 0n,
        tier: 0n,
        salt: new Uint8Array(32),
      }),
    ),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS),
  );

  process.stdout.write(`Deploying with issuerCommitment=${Buffer.from(issuerCommitment).toString('hex')}\n`);

  const MAX_RETRIES = 20;
  const RETRY_DELAY_MS = 5000;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      deployed = await deployContract(providers as any, {
        compiledContract: compiledContract as any,
        args: [issuerCommitment],
        privateStateId: 'shadowpass4',
        initialPrivateState: {},
      });
      break;
    } catch (err: any) {
      const full = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
      const isDust = /Not enough Dust|Insufficient Funds|could not balance dust/i.test(full);
      if (isDust && attempt < MAX_RETRIES) {
        process.stdout.write(`  ⏳ Dust shortage, retrying (${attempt}/${MAX_RETRIES})...\n`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }

  if (!deployed) fatal('Deployment failed after retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;
  process.stdout.write('\n  ✅ Contract deployed successfully!\n');
  process.stdout.write(`  Contract Address: ${contractAddress}\n`);
  process.stdout.write(
    '\n  Next steps:\n' +
      "  1. Update frontend/src/config.ts → CONTRACT_ADDRESS (and ZK_ASSETS_BASE = '/midnight/shadowpass4').\n" +
      '  2. Rebuild the frontend and deploy to Netlify.\n' +
      '  3. Record evidence in docs/evidence/LEVEL4-DEPLOYMENT.md.\n',
  );

  await walletCtx.wallet.stop();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    process.stderr.write(`\n${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });