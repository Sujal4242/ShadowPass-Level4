import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DEMO_MEMBER_ID, DEMO_SALT } from '../config.ts';

interface Props {
  disabled: boolean;
  walletReady: boolean;
  onVerify: (memberId: string, salt: string) => void;
}

export function CredentialCard({ disabled, walletReady, onVerify }: Props) {
  const [memberId, setMemberId] = useState(DEMO_MEMBER_ID);
  const [salt, setSalt] = useState(DEMO_SALT);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const memberIdValid = /^[0-9a-fA-F]{64}$/.test(memberId);
  const saltValid = /^[0-9a-fA-F]{64}$/.test(salt);
  const canVerify = memberIdValid && saltValid && !disabled;

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
    >
      <div className="card-header">
        <span className="card-title">Membership Credential</span>
        <span className="badge badge-demo">Demo</span>
      </div>

      <p className="card-description">
        Enter your membership credentials to generate a zero-knowledge proof.
        These demo credentials are publicly provided for demonstration.
      </p>

      <div className="field">
        <label className="field-label">
          Member ID
          <span className="field-meta">32 bytes / 64 hex</span>
        </label>
        <input
          type="text"
          className={`field-input${!memberIdValid && memberId.length > 0 ? ' invalid' : ''}`}
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          placeholder="deadbeef..."
        />
      </div>

      <div className="field">
        <label className="field-label">
          Salt
          <span className="field-meta">32 bytes / 64 hex</span>
        </label>
        <input
          type="text"
          className={`field-input${!saltValid && salt.length > 0 ? ' invalid' : ''}`}
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          placeholder="cafebabe..."
        />
      </div>

      <button
        className="btn btn-primary btn-full btn-lg"
        disabled={!canVerify}
        onClick={() => onVerify(memberId, salt)}
        style={{ marginTop: '0.35rem' }}
      >
        Verify Membership
      </button>

      {!walletReady && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Connect your wallet to enable verification
        </div>
      )}

      <button
        className="advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? 'Hide advanced' : 'Use custom credentials'}
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            className="advanced-info"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            You can edit the Member ID and Salt fields above to test with
            different credentials. Invalid credentials will be rejected by the
            contract with "Access Denied".
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
