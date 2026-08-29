import { motion } from 'motion/react';
import type { VerificationState } from '../midnight/types.ts';

interface Props {
  state: VerificationState;
}

export function VerificationStatus({ state }: Props) {
  if (state.state === 'idle') return null;

  return (
    <motion.div
      className={`card status-card status-${state.state}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {state.state === 'generating' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div className="spinner spinner-lg" />
            <div>
              <div className="status-title">Generating ZK Proof</div>
              <div className="status-description">Preparing Groth16 proof that your credential is in the allowlist...</div>
            </div>
          </div>
          <div className="progress-track">
            <div className="progress-fill" />
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Groth16 proving system &middot; local computation
          </div>
        </>
      )}

      {state.state === 'awaiting-wallet' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="spinner spinner-lg" />
          <div>
            <div className="status-title">Awaiting Wallet Confirmation</div>
            <div className="status-description">Please confirm the transaction in your wallet extension...</div>
          </div>
        </div>
      )}

      {state.state === 'submitting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="spinner spinner-lg" />
          <div>
            <div className="status-title">Submitting Transaction</div>
            <div className="status-description">Transaction is being submitted to the Midnight network...</div>
          </div>
        </div>
      )}

      {state.state === 'confirming' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="spinner spinner-lg" />
          <div>
            <div className="status-title">Confirming</div>
            <div className="status-description">Waiting for block confirmation...</div>
          </div>
        </div>
      )}

      {state.state === 'granted' && (
        <>
          <div className="status-icon-wrap success">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="status-title">
            {state.kind === 'eligibility' ? 'Eligibility Proved' : 'Membership Verified'}
          </div>
          <div className="status-description">
            {state.kind === 'eligibility'
              ? `Credential satisfies min age ${state.eligibility?.minAge} / min tier ${state.eligibility?.minTier} without revealing the true values below those bounds.`
              : 'Membership confirmed without revealing the underlying credential.'}
          </div>

          {state.kind === 'eligibility' && (
            <div className="status-description" style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Thresholds are lower bounds — your exact age and tier stay hidden on-chain.
            </div>
          )}

          <div className="tx-grid">
            <div className="tx-item full-width">
              <span className="tx-label">Transaction</span>
              <span className="tx-value" title={state.txId}>{state.txId}</span>
            </div>
            <div className="tx-item">
              <span className="tx-label">Block</span>
              <span className="tx-value">{state.blockHeight}</span>
            </div>
            <div className="tx-item">
              <span className="tx-label">Access Count</span>
              <span className="tx-value">{state.accessCount}</span>
            </div>
            <div className="tx-item">
              <span className="tx-label">Network</span>
              <span className="tx-value">Midnight Preprod</span>
            </div>
            <div className="tx-item">
              <span className="tx-label">Proof System</span>
              <span className="tx-value">Groth16</span>
            </div>
          </div>

          <div className="privacy-verified-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Your credential was never revealed on-chain. Only the ZK proof was verified.
          </div>
        </>
      )}

      {state.state === 'denied' && (
        <>
          <div className="status-icon-wrap danger">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <div className="status-title">Access Denied</div>
          <div className="status-description">{state.message}</div>
          <div className="status-description" style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            Rejected by the contract circuit — non-member, revoked, spent, or threshold not met.
          </div>
        </>
      )}

      {state.state === 'error' && (
        <>
          <div className="status-icon-wrap warning">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="status-title">Verification Failed</div>
          <div className="status-description">{state.message}</div>
        </>
      )}
    </motion.div>
  );
}
