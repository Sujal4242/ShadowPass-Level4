/** ShadowPass types. */

export interface ShadowPassLedger {
  allowlist: Uint8Array[];
  accessCount: bigint;
}

/** Connection state for the wallet. */
export type ConnectionState =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; walletName: string; walletVersion: string; walletAddress: string }
  | { state: 'error'; message: string };

/** Verification state. */
export type VerificationState =
  | { state: 'idle' }
  | { state: 'generating' }
  | { state: 'awaiting-wallet' }
  | { state: 'submitting' }
  | { state: 'confirming' }
  | {
      state: 'granted';
      kind: 'membership' | 'eligibility';
      txId: string;
      blockHeight: number;
      accessCount: number;
      eligibility?: { minAge: number; minTier: number };
    }
  | { state: 'denied'; message: string }
  | { state: 'error'; message: string };
