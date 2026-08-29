import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';

const ParticleCanvas = lazy(() =>
  import('./ParticleCanvas.tsx').then(m => ({ default: m.ParticleCanvas }))
);

interface Props {
  onScrollToVerify: () => void;
}

export function Hero({ onScrollToVerify }: Props) {
  return (
    <section className="hero">
      <div className="hero-canvas">
        <Suspense fallback={null}>
          <ParticleCanvas />
        </Suspense>
      </div>

      <div className="hero-content">
        <motion.div
          className="hero-eyebrow"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <span className="hero-eyebrow-dot" />
          Midnight Network / Preprod
        </motion.div>

        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Prove membership.<br />
          <span className="hero-title-accent">Reveal nothing else.</span>
        </motion.h1>

        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          ShadowPass uses zero-knowledge proofs to verify allowlist membership
          without exposing your identity. A Groth16 proof is generated entirely
          in your browser and verified on-chain.
        </motion.p>

        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.5 }}
        >
          <button className="btn btn-primary btn-lg" onClick={onScrollToVerify}>
            Verify Membership
          </button>
          <a href="#how-it-works" className="btn btn-secondary btn-lg">
            How It Works
          </a>
        </motion.div>

        <motion.div
          className="hero-circuit"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          <ZKCircuitVisual />
        </motion.div>
      </div>
    </section>
  );
}

function ZKCircuitVisual() {
  return (
    <svg
      viewBox="0 0 480 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 480, height: 'auto', marginTop: '2.5rem' }}
      aria-hidden="true"
    >
      {/* Left: Private inputs */}
      <rect x="0" y="20" width="90" height="40" rx="6" fill="rgba(99,102,241,0.06)" stroke="rgba(99,102,241,0.2)" strokeWidth="1" />
      <text x="45" y="36" textAnchor="middle" fill="#55556a" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="500" letterSpacing="0.05em">PRIVATE</text>
      <text x="45" y="50" textAnchor="middle" fill="#8888a0" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="500">credential</text>

      {/* Arrow left */}
      <line x1="98" y1="40" x2="138" y2="40" stroke="rgba(99,102,241,0.25)" strokeWidth="1" strokeDasharray="3 3" />
      <polygon points="136,37 142,40 136,43" fill="rgba(99,102,241,0.3)" />

      {/* Center: ZK Circuit */}
      <rect x="144" y="8" width="120" height="64" rx="8" fill="rgba(99,102,241,0.04)" stroke="rgba(99,102,241,0.2)" strokeWidth="1.5" />
      <rect x="152" y="16" width="104" height="48" rx="4" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="0.5" strokeDasharray="2 2" />

      {/* Circuit icon */}
      <circle cx="204" cy="30" r="6" fill="none" stroke="rgba(99,102,241,0.4)" strokeWidth="1.5" />
      <circle cx="204" cy="30" r="2" fill="rgba(99,102,241,0.6)" />
      <line x1="198" y1="30" x2="190" y2="30" stroke="rgba(99,102,241,0.3)" strokeWidth="1" />
      <line x1="210" y1="30" x2="218" y2="30" stroke="rgba(99,102,241,0.3)" strokeWidth="1" />
      <line x1="204" y1="24" x2="204" y2="16" stroke="rgba(99,102,241,0.3)" strokeWidth="1" />
      <line x1="204" y1="36" x2="204" y2="44" stroke="rgba(99,102,241,0.3)" strokeWidth="1" />

      <text x="204" y="58" textAnchor="middle" fill="#6366f1" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600" letterSpacing="0.06em">ZK CIRCUIT</text>

      {/* Arrow right */}
      <line x1="272" y1="40" x2="312" y2="40" stroke="rgba(34,197,94,0.3)" strokeWidth="1" strokeDasharray="3 3" />
      <polygon points="310,37 316,40 310,43" fill="rgba(34,197,94,0.4)" />

      {/* Right: Public proof */}
      <rect x="318" y="20" width="90" height="40" rx="6" fill="rgba(34,197,94,0.05)" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
      <text x="363" y="36" textAnchor="middle" fill="#16a34a" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="500" letterSpacing="0.05em">PUBLIC</text>
      <text x="363" y="50" textAnchor="middle" fill="#8888a0" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="500">proof</text>

      {/* Far right: On-chain */}
      <line x1="416" y1="40" x2="428" y2="40" stroke="rgba(34,197,94,0.2)" strokeWidth="1" />
      <rect x="428" y="24" width="52" height="32" rx="4" fill="rgba(34,197,94,0.06)" stroke="rgba(34,197,94,0.15)" strokeWidth="1" />
      <text x="454" y="38" textAnchor="middle" fill="#22c55e" fontSize="7" fontFamily="JetBrains Mono, monospace" fontWeight="600" letterSpacing="0.04em">ON-CHAIN</text>
      <text x="454" y="50" textAnchor="middle" fill="#55556a" fontSize="7" fontFamily="JetBrains Mono, monospace">verify</text>

      {/* Flow arrows along top */}
      <path d="M98 12 L138 12" stroke="rgba(99,102,241,0.08)" strokeWidth="0.5" />
      <path d="M272 12 L318 12" stroke="rgba(34,197,94,0.08)" strokeWidth="0.5" />
    </svg>
  );
}
