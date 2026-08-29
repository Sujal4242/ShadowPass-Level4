// ShadowPass configuration.
// Every value is PUBLIC — network endpoints and a contract address
// that is already visible on-chain. Never put secrets here.

const env = import.meta.env;

/** Network id passed to the wallet's connect(). */
export const NETWORK_ID: string = env.VITE_NETWORK_ID ?? 'preprod';

/** Contract address on Preprod — set after manual deployment. */
export const CONTRACT_ADDRESS: string =
  env.VITE_CONTRACT_ADDRESS ??
  '4cae45d1c4e6d2acc4e607f60cd61c19b77c31c84af0cc72c827889271041f44';

/** Fallback indexer endpoints when the wallet does not advertise its own. */
export const INDEXER_URL: string =
  env.VITE_INDEXER_URL ?? 'https://indexer.preprod.midnight.network/api/v4/graphql';
export const INDEXER_WS_URL: string =
  env.VITE_INDEXER_WS_URL ?? 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws';

/** Base URL under which the compiled ZK assets (zkir/keys) are served. */
export const ZK_ASSETS_BASE: string = `${window.location.origin}/midnight/shadowpass`;

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

/** Demo commitment — persistentCommit(DEMO_MEMBER_ID, DEMO_SALT). */
export const DEMO_COMMITMENT: string =
  env.VITE_DEMO_COMMITMENT ??
  'c14369b795a8d16f43e45d4e51b0a64750cf43f862ed3df117a061754d15658e';
