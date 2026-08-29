import { motion } from 'motion/react';

const items = [
  {
    label: 'Protocol Property',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'ZK Proof',
    desc: 'Proves you know a valid credential without revealing which credential. The Groth16 proof is zero-knowledge: it reveals nothing beyond validity.',
  },
  {
    label: 'Protocol Property',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Hidden Identity',
    desc: 'Your member ID is never transmitted on-chain. The only on-chain artifact is the zero-knowledge proof, which is cryptographically unlinkable to your identity.',
  },
  {
    label: 'Protocol Property',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'No Tracking',
    desc: 'Multiple verifications by the same member cannot be linked on-chain. Each proof is independent and unlinkable.',
  },
];

export function PrivacySection() {
  return (
    <section className="section" id="privacy">
      <div className="section-header">
        <motion.div
          className="section-eyebrow"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          Privacy
        </motion.div>
        <motion.h2
          className="section-title"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Privacy Model
        </motion.h2>
        <motion.p
          className="section-desc"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, delay: 0.15 }}
        >
          Zero-knowledge proofs ensure your identity stays private while proving membership.
        </motion.p>
      </div>

      <div className="privacy-grid">
        {items.map((item, i) => (
          <motion.div
            key={item.title}
            className="privacy-cell"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: 0.08 + i * 0.06 }}
          >
            <div className="privacy-cell-icon">{item.icon}</div>
            <div className="privacy-cell-label">{item.label}</div>
            <div className="privacy-cell-title">{item.title}</div>
            <div className="privacy-cell-desc">{item.desc}</div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="advanced-info"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.4, delay: 0.2 }}
        style={{ border: '1px solid rgba(245, 158, 11, 0.15)', background: 'rgba(245, 158, 11, 0.04)' }}
      >
        <strong>Demo Limitation:</strong> These demo credentials are public and documented.
        In production, credentials are issued privately by an authorized issuer and never publicly shared.
      </motion.div>
    </section>
  );
}
