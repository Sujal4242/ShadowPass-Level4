#!/usr/bin/env bash
# Netlify build script for ShadowPass.
# Replicates the CI pipeline: install Compact CLI, compile contracts, build frontend.
set -euo pipefail

echo "[netlify-build] Node $(node --version)"

# ── Install Compact CLI ──────────────────────────────────────────────────────
echo "[netlify-build] Installing Compact CLI..."
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# ── Install Compact compiler 0.31.1 ─────────────────────────────────────────
echo "[netlify-build] Installing Compact compiler 0.31.1..."
compact update 0.31.1

# ── Install dependencies ─────────────────────────────────────────────────────
echo "[netlify-build] Installing root dependencies..."
npm ci

echo "[netlify-build] Installing frontend dependencies..."
npm ci --prefix frontend

# ── Compile Compact contract ─────────────────────────────────────────────────
echo "[netlify-build] Compiling Compact contract..."
npm run compile

# ── Build frontend ───────────────────────────────────────────────────────────
echo "[netlify-build] Building frontend..."
npm run build:frontend

echo "[netlify-build] Done."
