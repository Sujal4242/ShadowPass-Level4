/**
 * Unit tests for wallet-state.ts persistence module.
 *
 * Tests run on Node via vitest — no SDK imports, no network access.
 * They validate the on-disk format, version handling, atomic writes,
 * and corruption recovery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadWalletState,
  saveWalletState,
  clearWalletState,
  WALLET_STATE_DIR,
  WALLET_STATE_VERSION,
  type PersistedWalletState,
} from '../scripts/wallet-state';

describe('wallet-state persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-state-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadWalletState', () => {
    it('returns empty state when directory does not exist', () => {
      const state = loadWalletState('preprod', { cwd: tmpDir });
      expect(state).toEqual({ shielded: undefined, unshielded: undefined, dust: undefined });
    });

    it('returns empty state when no files exist', () => {
      fs.mkdirSync(path.join(tmpDir, WALLET_STATE_DIR, 'preprod'), { recursive: true });
      const state = loadWalletState('preprod', { cwd: tmpDir });
      expect(state).toEqual({ shielded: undefined, unshielded: undefined, dust: undefined });
    });
  });

  describe('saveWalletState', () => {
    it('creates directory structure on first save', () => {
      const state: PersistedWalletState = { shielded: { synced: true } };
      saveWalletState('preprod', state, { cwd: tmpDir });

      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'shielded.json'))).toBe(true);
    });

    it('writes versioned JSON format', () => {
      const state: PersistedWalletState = { dust: 'dust-state-string' };
      saveWalletState('preprod', state, { cwd: tmpDir });

      const file = path.join(tmpDir, WALLET_STATE_DIR, 'preprod', 'dust.json');
      const content = JSON.parse(fs.readFileSync(file, 'utf-8'));
      expect(content.version).toBe(WALLET_STATE_VERSION);
      expect(content.state).toBe('dust-state-string');
    });

    it('saves all three child wallet kinds', () => {
      const state: PersistedWalletState = {
        shielded: { offset: 12345 },
        unshielded: { appliedId: 67890 },
        dust: 'dust-data',
      };
      saveWalletState('preprod', state, { cwd: tmpDir });

      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      expect(fs.existsSync(path.join(dir, 'shielded.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'unshielded.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'dust.json'))).toBe(true);
    });

    it('does not write undefined children', () => {
      const state: PersistedWalletState = { shielded: { offset: 1 } };
      saveWalletState('preprod', state, { cwd: tmpDir });

      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      expect(fs.existsSync(path.join(dir, 'shielded.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'unshielded.json'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'dust.json'))).toBe(false);
    });

    it('uses atomic write (no .tmp files left behind)', () => {
      saveWalletState('preprod', { dust: 'test' }, { cwd: tmpDir });

      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      const files = fs.readdirSync(dir);
      expect(files).toEqual(['dust.json']);
    });
  });

  describe('round-trip', () => {
    it('saves and loads identical state', () => {
      const original: PersistedWalletState = {
        shielded: { zswapOffset: 42, appliedId: 100 },
        unshielded: { nextIndex: 500 },
        dust: '{"balance":1000}',
      };

      saveWalletState('preprod', original, { cwd: tmpDir });
      const loaded = loadWalletState('preprod', { cwd: tmpDir });

      expect(loaded).toEqual(original);
    });

    it('handles empty state round-trip', () => {
      const original: PersistedWalletState = {};
      saveWalletState('preprod', original, { cwd: tmpDir });
      const loaded = loadWalletState('preprod', { cwd: tmpDir });
      expect(loaded).toEqual({ shielded: undefined, unshielded: undefined, dust: undefined });
    });
  });

  describe('version handling', () => {
    it('rejects state with wrong version', () => {
      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'shielded.json'),
        JSON.stringify({ version: 999, state: { offset: 1 } }),
      );

      const state = loadWalletState('preprod', { cwd: tmpDir });
      expect(state.shielded).toBeUndefined();
    });

    it('rejects corrupt JSON', () => {
      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shielded.json'), '{invalid json!!!');

      const state = loadWalletState('preprod', { cwd: tmpDir });
      expect(state.shielded).toBeUndefined();
    });

    it('rejects non-object JSON', () => {
      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shielded.json'), JSON.stringify('just a string'));

      const state = loadWalletState('preprod', { cwd: tmpDir });
      expect(state.shielded).toBeUndefined();
    });
  });

  describe('clearWalletState', () => {
    it('removes the entire state directory', () => {
      saveWalletState('preprod', { shielded: { x: 1 }, dust: 'd' }, { cwd: tmpDir });

      const dir = path.join(tmpDir, WALLET_STATE_DIR, 'preprod');
      expect(fs.existsSync(dir)).toBe(true);

      clearWalletState('preprod', { cwd: tmpDir });
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('is safe to call when directory does not exist', () => {
      expect(() => clearWalletState('preprod', { cwd: tmpDir })).not.toThrow();
    });
  });

  describe('network isolation', () => {
    it('different networks get separate directories', () => {
      saveWalletState('preprod', { shielded: { net: 'preprod' } }, { cwd: tmpDir });
      saveWalletState('preview', { shielded: { net: 'preview' } }, { cwd: tmpDir });

      const preprod = loadWalletState('preprod', { cwd: tmpDir });
      const preview = loadWalletState('preview', { cwd: tmpDir });

      expect(preprod.shielded).toEqual({ net: 'preprod' });
      expect(preview.shielded).toEqual({ net: 'preview' });
    });
  });
});
