/**
 * ShadowPass — Main application.
 *
 * Full verification flow:
 *   Connect wallet → Enter credentials → Generate ZK proof → Verify on-chain
 */

import { useRef } from 'react';
import { motion } from 'motion/react';
import { Header } from './components/Header.tsx';
import { Hero } from './components/Hero.tsx';
import { WalletConnect } from './components/WalletConnect.tsx';
import { CredentialCard } from './components/CredentialCard.tsx';
import { VerificationStatus } from './components/VerificationStatus.tsx';
import { AccessCounter } from './components/AccessCounter.tsx';
import { PrivacySection } from './components/PrivacySection.tsx';
import { HowItWorks } from './components/HowItWorks.tsx';
import { Footer } from './components/Footer.tsx';
import { useMidnight } from './hooks/useMidnight.ts';
import { useShadowPass } from './hooks/useShadowPass.ts';
import { hexToBytes } from './midnight/credential-crypto.ts';

export default function App() {
  const { wallets, connection, providers, deployed, connect, disconnect } = useMidnight();
  const { verification, accessCount, verify, reset, refreshAccessCount } = useShadowPass();
  const verifyRef = useRef<HTMLDivElement>(null);

  const isReady = connection.state === 'connected' && deployed !== null && providers !== null;

  const handleVerify = async (appIdHex: string, memberId: string, salt: string) => {
    if (!providers) return;
    reset();
    await verify(providers, {
      memberId: hexToBytes(memberId),
      age: BigInt(25),
      tier: BigInt(4),
      salt: hexToBytes(salt),
    }, appIdHex);
    if (verification.state === 'granted') {
      refreshAccessCount(deployed as NonNullable<typeof deployed>);
    }
  };

  const handleDisconnect = () => {
    reset();
    disconnect();
  };

  const scrollToVerify = () => {
    verifyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="app">
      <Header
        wallets={wallets}
        connection={connection}
        onConnect={connect}
        onDisconnect={handleDisconnect}
      />

      <main className="app-main">
        <Hero onScrollToVerify={scrollToVerify} />

        <motion.div
          ref={verifyRef}
          className="section"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="section-header">
            <div className="section-eyebrow">Verification</div>
            <h2 className="section-title">Verify Membership</h2>
            <p className="section-desc">
              Connect your Midnight wallet, enter your credential, and generate a
              zero-knowledge proof of membership.
            </p>
          </div>

          <div className="verify-grid">
            <div>
              <div className="verify-section-header">
                <span className="dot active" />
                <span className="dot" />
                <span className="dot" />
                <span className="label">wallet</span>
              </div>
              <div className="verify-section-body">
                <WalletConnect
                  wallets={wallets}
                  connection={connection}
                  onConnect={connect}
                  onDisconnect={handleDisconnect}
                />
              </div>
            </div>

            <div>
              <div className="verify-section-header">
                <span className={`dot${isReady ? ' active' : ''}`} />
                <span className="dot" />
                <span className="dot" />
                <span className="label">credentials</span>
              </div>
              <div className="verify-section-body">
                <CredentialCard
                  disabled={!isReady || verification.state === 'generating' || verification.state === 'awaiting-wallet'}
                  walletReady={isReady}
                  onVerify={handleVerify}
                />
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <VerificationStatus state={verification} />
              </div>
            </div>
          </div>
        </motion.div>

        {isReady && (
          <motion.div
            className="section"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45 }}
          >
            <AccessCounter count={accessCount} />
          </motion.div>
        )}

        <HowItWorks />
        <PrivacySection />
      </main>

      <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 2rem' }}>
        <Footer />
      </div>
    </div>
  );
}
