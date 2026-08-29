import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DEMO_MEMBER_ID, DEMO_SALT, DEMO_APP_ID } from '../config.ts';

export type VerifyMode = 'membership' | 'eligibility';

interface Props {
  disabled: boolean;
  walletReady: boolean;
  onVerify: (
    mode: VerifyMode,
    appId: string,
    memberId: string,
    salt: string,
    minAge: number,
    minTier: number,
  ) => void;
}

const hex64valid = (value: string) => /^[0-9a-fA-F]{64}$/.test(value);

export function CredentialCard({ disabled, walletReady, onVerify }: Props) {
  const [mode, setMode] = useState<VerifyMode>('membership');
  const [appId, setAppId] = useState(DEMO_APP_ID);
  const [memberId, setMemberId] = useState(DEMO_MEMBER_ID);
  const [salt, setSalt] = useState(DEMO_SALT);
  const [minAge, setMinAge] = useState(18);
  const [minTier, setMinTier] = useState(3);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const appIdValid = hex64valid(appId);
  const memberIdValid = hex64valid(memberId);
  const saltValid = hex64valid(salt);
  const thresholdValid = minAge >= 0 && minTier >= 0 && minTier <= 10;
  const canVerify = appIdValid && memberIdValid && saltValid && thresholdValid && !disabled;

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.08 }}
    >
      <div className="card-header">
        <span className="card-title">Credential</span>
        <span className="badge badge-demo">Demo</span>
      </div>

      <div className="mode-toggle">
        <button
          className={`mode-btn${mode === 'membership' ? ' active' : ''}`}
          onClick={() => setMode('membership')}
          disabled={disabled}
        >
          Membership
        </button>
        <button
          className={`mode-btn${mode === 'eligibility' ? ' active' : ''}`}
          onClick={() => setMode('eligibility')}
          disabled={disabled}
        >
          Eligibility
        </button>
      </div>

      <p className="card-description">
        {mode === 'membership'
          ? 'Prove you are a member while keeping your identity hidden. Member ID and salt live only in the in-browser witness, never on-chain. The application ID is the public per-app replay domain.'
          : 'Prove you are a member AND meet minimum age/tier thresholds without revealing your actual age or tier. Thresholds are the public requirement; your real values stay hidden.'}
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

      <AnimatePresence>
        {mode === 'eligibility' && (
          <motion.div
            className="threshold-grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="field">
              <label className="field-label">
                Min age
                <span className="field-meta">public</span>
              </label>
              <input
                type="number"
                min={0}
                max={130}
                className="field-input"
                value={minAge}
                onChange={(e) => setMinAge(Number(e.target.value))}
                disabled={disabled}
              />
            </div>
            <div className="field">
              <label className="field-label">
                Min tier
                <span className="field-meta">public · 0–10</span>
              </label>
              <input
                type="number"
                min={0}
                max={10}
                className="field-input"
                value={minTier}
                onChange={(e) => setMinTier(Number(e.target.value))}
                disabled={disabled}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className="btn btn-primary btn-full btn-lg"
        disabled={!canVerify}
        onClick={() => onVerify(mode, appId, memberId, salt, minAge, minTier)}
        style={{ marginTop: '0.35rem' }}
      >
        {mode === 'membership' ? 'Verify Membership' : 'Prove Eligibility'}
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
            Edit the Member ID and Salt fields to test with different
            credentials. Invalid or non-member credentials are rejected by the
            contract; replaying the same application ID is rejected as spent;
            failing an age/tier threshold reveals nothing about your true values.
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}