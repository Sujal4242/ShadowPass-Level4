import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DEMO_MEMBER_ID, DEMO_SALT, DEMO_APP_ID } from '../config.ts';

interface Props {
  disabled: boolean;
  walletReady: boolean;
  onVerify: (appId: string, memberId: string, salt: string) => void;
}

export function CredentialCard({ disabled, walletReady, onVerify }: Props) {
  const [appId, setAppId] = useState(DEMO_APP_ID);
  const [memberId, setMemberId] = useState(DEMO_MEMBER_ID);
  const [salt, setSalt] = useState(DEMO_SALT);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hex64valid = (value: string) => /^[0-9a-fA-F]{64}$/.test(value);
  const appIdValid = hex64valid(appId);
  const memberIdValid = hex64valid(memberId);
  const saltValid = hex64valid(salt);
  const canVerify = appIdValid && memberIdValid && saltValid && !disabled;

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
        Prove membership while keeping your credential private. The member ID and
        salt live only in the in-browser witness — never passed to the chain.
        The application ID is the public per-app replay domain.
      </p>

      <div className="field">
        <label className="field-label">
          Application ID
          <span className="field-meta">public · 64 hex</span>
        </label>
        <input
          type="text"
          className={`field-input${!appIdValid && appId.length > 0 ? ' invalid' : ''}`}
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          placeholder="010203..."
        />
      </div>

      <div className="field">
        <label className="field-label">
          Member ID
          <span className="field-meta">secret · 32 bytes / 64 hex</span>
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
          <span className="field-meta">secret · 32 bytes / 64 hex</span>
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
        onClick={() => onVerify(appId, memberId, salt)}
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
            different credentials. Invalid credentials are rejected by the
            contract; replaying the same application ID is rejected as spent.
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}