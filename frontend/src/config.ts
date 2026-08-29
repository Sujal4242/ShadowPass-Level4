// ShadowPass configuration.
// Every value is PUBLIC — network endpoints and a contract address
// that is already visible on-chain. Never put secrets here.

const env = import.meta.env;

/** Network id passed to the wallet's connect(). */
export const NETWORK_ID: string = env.VITE_NETWORK_ID ?? 'preprod';

/** Contract address on Preprod — the deployed Level 4 shadowpass4 contract
 *  (m17). Override via VITE_CONTRACT_ADDRESS. */
export const CONTRACT_ADDRESS: string =
  env.VITE_CONTRACT_ADDRESS ??
  '52a195f6b68a2f09c8535afe2cfed126068b4cf82eead210b6d1504a985c285e';

/** Fallback indexer endpoints when the wallet does not advertise its own. */
export const INDEXER_URL: string =
  env.VITE_INDEXER_URL ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS_URL: string =
  env.VITE_INDEXER_WS_URL ?? 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

/** Base URL under which the compiled ZK assets (zkir/keys) are served. */
export const ZK_ASSETS_BASE: string = `${window.location.origin}/midnight/shadowpass4`;

// ---------------------------------------------------------------------------
// Demo credentials (public, intentional)
// ---------------------------------------------------------------------------

/** Demo memberId — 32 bytes / 64 hex characters. Public by design. */
export const DEMO_MEMBER_ID: string =
  env.VITE_DEMO_MEMBER_ID ??
  'deadbeef000000000000000000000000000000000000000000000000deadbeef';

/** Demo salt — 32 bytes / 64 hex characters. Public by design. */
export const DEMO_SALT: string =
  env.VITE_DEMO_SALT ??
  'cafebabe000000000000000000000000000000000000000000000000cafebabe';

/** Demo recorded attributes (hidden inside the commitment). Public by design. */
export const DEMO_AGE: number = Number(env.VITE_DEMO_AGE ?? 25);
export const DEMO_TIER: number = Number(env.VITE_DEMO_TIER ?? 4);

/**
 * Demo application id (the public per-app replay domain for nullifiers).
 * This is the public argument of verifyMembership/proveEligibility.
 */
export const DEMO_APP_ID: string =
  env.VITE_DEMO_APP_ID ??
  '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

/** Demo commitment — persistentCommit({DEMO_MEMBER_ID, age=25, tier=4}, DEMO_SALT). */
export const DEMO_COMMITMENT: string =
  env.VITE_DEMO_COMMITMENT ??
  '757b45c19b21628dca784536aa489448b0808ff00a763cd7d83c796d98d65916';
