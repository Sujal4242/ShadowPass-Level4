import type { InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { ConnectionState } from '../midnight/types.ts';

interface Props {
  wallets: InitialAPI[];
  connection: ConnectionState;
  onConnect: (wallet: InitialAPI) => void;
  onDisconnect: () => void;
}

export function Header({ wallets, connection, onConnect, onDisconnect }: Props) {
  const handleConnect = () => {
    if (wallets.length === 1) {
      onConnect(wallets[0]);
    } else if (wallets.length > 0) {
      onConnect(wallets[0]);
    }
  };

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo">
            <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="28" height="28" rx="6" fill="rgba(99,102,241,0.1)" />
              <path d="M14 6L20 10V18L14 22L8 18V10L14 6Z" stroke="#6366f1" strokeWidth="1.5" fill="none" />
              <circle cx="14" cy="14" r="2.5" fill="#6366f1" opacity="0.5" />
            </svg>
          </div>
          <span className="header-name">ShadowPass</span>
        </div>

        <nav className="header-nav">
          <a href="#how-it-works" className="header-link">Protocol</a>
          <a href="#privacy" className="header-link">Privacy</a>
        </nav>

        <div className="header-right">
          <div className="header-network">
            <span className="header-network-dot" />
            Preprod
          </div>

          {connection.state === 'connected' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button className="header-wallet-btn connected" onClick={onDisconnect}>
                <span style={{ color: 'var(--success)', fontSize: '0.55rem' }}>&#9679;</span>
                {connection.walletName}
                {connection.walletAddress && (
                  <span className="header-wallet-address">
                    {connection.walletAddress.slice(0, 6)}...{connection.walletAddress.slice(-4)}
                  </span>
                )}
              </button>
            </div>
          ) : connection.state === 'connecting' ? (
            <div className="connecting-overlay">
              <div className="spinner" />
              <span>Connecting...</span>
            </div>
          ) : (
            <button
              className="header-wallet-btn"
              onClick={handleConnect}
              disabled={wallets.length === 0}
            >
              {wallets.length === 0 ? 'No Wallet' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
