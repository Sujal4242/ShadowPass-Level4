/**
 * Phase 1 — Copy ZK assets and compiled contract from contracts/managed to
 *           frontend public dir (for runtime) and frontend src (for types).
 *
 * Runs during `npm run build:frontend`.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');

const MANAGED   = resolve(ROOT, 'contracts/managed/shadowpass4');
const COMPILED  = resolve(ROOT, 'contracts/managed/shadowpass4/contract');

const PUBLIC_ZK = resolve(ROOT, 'frontend/public/midnight/shadowpass4');
const SRC_OUT   = resolve(ROOT, 'frontend/src');

// ---------------------------------------------------------------------------
// ZK assets → public (runtime)
// ---------------------------------------------------------------------------

const ZK_DIRS = ['zkir', 'keys'];

for (const dir of ZK_DIRS) {
  const src  = resolve(MANAGED, dir);
  const dest = resolve(PUBLIC_ZK, dir);

  if (!existsSync(src)) {
    console.error(`[copy-zk-assets] MISSING: ${src} — run \`npm run compile\` first`);
    process.exit(1);
  }

  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[copy-zk-assets] ${dir} → ${dest}`);
}

// ---------------------------------------------------------------------------
// Compiled contract → frontend/src (types + runtime)
// ---------------------------------------------------------------------------

const contractFiles = ['index.js', 'index.d.ts'];

for (const file of contractFiles) {
  const src  = resolve(COMPILED, file);
  const dest = resolve(SRC_OUT, `compiled-contract.${file === 'index.js' ? 'js' : 'd.ts'}`);

  if (!existsSync(src)) {
    console.error(`[copy-zk-assets] MISSING contract: ${src}`);
    process.exit(1);
  }

  cpSync(src, dest);

  // Strip sourceMappingURL reference (source map is not shipped).
  if (file === 'index.js') {
    const content = readFileSync(dest, 'utf8');
    const cleaned = content.replace(/\/\/# sourceMappingURL=.*\n?/g, '');
    writeFileSync(dest, cleaned, 'utf8');
  }

  console.log(`[copy-zk-assets] ${file} → ${dest}`);
}

console.log('[copy-zk-assets] Done.');
