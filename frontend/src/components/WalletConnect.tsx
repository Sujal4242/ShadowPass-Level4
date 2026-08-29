import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { ConnectionState } from '../midnight/types.ts';

interface Props {
  wallets: InitialAPI[];
  connection: ConnectionState;
  onConnect: (wallet: InitialAPI) => void;
  onDisconnect: () => void;
}

export function WalletConnect({ wallets, connection, onConnect, onDisconnect }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (connection.state === 'connected') {
    return (
      <motion.div
        className="card wallet-panel"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="wallet-connected-header">
          <div className="wallet-icon-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <div className="wallet-info">
            <div className="wallet-name-row">
              <span className="wallet-name">{connection.walletName}</span>
              <span className="wallet-status-badge">
                <span className="wallet-status-dot" />
                Connected
              </span>
            </div>
            <div className="wallet-meta">{connection.walletVersion} &middot; Midnight Preprod</div>
          </div>
        </div>

        <div className="wallet-details">
          <div className="wallet-detail-row">
            <span className="wallet-detail-label">Network</span>
            <span className="wallet-detail-value">Midnight Preprod</span>
          </div>
          <div className="wallet-detail-row">
            <span className="wallet-detail-label">Status</span>
            <span className="wallet-detail-value" style={{ color: 'var(--success)' }}>Active</span>
          </div>
          {connection.walletAddress && (
            <div className="wallet-detail-row">
              <span className="wallet-detail-label">Address</span>
              <span className="wallet-address-value" title={connection.walletAddress}>
                {connection.walletAddress}
              </span>
            </div>
          )}
        </div>

        <div className="wallet-actions">
          <button className="btn btn-secondary btn-full btn-sm" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </motion.div>
    );
  }

  if (connection.state === 'error') {
    return (
      <motion.div
        className="card wallet-panel wallet-card-error"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="wallet-connected-header">
          <div className="wallet-icon-wrap" style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'var(--danger-glow)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div className="wallet-info">
            <div className="wallet-name-row">
              <span className="wallet-name">Connection Failed</span>
            </div>
          </div>
        </div>
        <p className="status-description" style={{ marginBottom: '0.75rem' }}>{connection.message}</p>
        <button className="btn btn-primary btn-full btn-sm" onClick={() => setExpanded(true)}>
          Try Again
        </button>
      </motion.div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="card wallet-panel wallet-no-wallet">
        <div className="wallet-icon-wrap" style={{ margin: '0 auto 0.75rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="M22 10H2" />
          </svg>
        </div>
        <p>
          Install <strong>1AM</strong> or <strong>Lace</strong> with Midnight support,
          then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="card wallet-panel">
      <AnimatePresence mode="wait">
        {connection.state === 'connecting' ? (
          <motion.div
            key="connecting"
            className="connecting-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="spinner spinner-lg" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Connecting wallet...</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Check your wallet extension</div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {wallets.length === 1 ? (
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={() => onConnect(wallets[0])}
              >
                Connect {wallets[0].name}
              </button>
            ) : (
              <>
                <button
                  className="btn btn-primary btn-full btn-lg"
                  onClick={() => setExpanded(!expanded)}
                >
                  Connect Midnight Wallet
                </button>
                {expanded && (
                  <div className="wallet-list">
                    {wallets.map((w) => (
                      <button
                        key={w.rdns}
                        className="btn btn-secondary btn-full"
                        onClick={() => { onConnect(w); setExpanded(false); }}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
