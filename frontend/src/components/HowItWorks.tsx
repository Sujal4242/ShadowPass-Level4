import { motion } from 'motion/react';

const steps = [
  {
    num: '01',
    title: 'Connect Wallet',
    desc: 'Link your Midnight-compatible wallet (1AM or Lace) through the DApp Connector.',
  },
  {
    num: '02',
    title: 'Enter Credential',
    desc: 'Provide your membership ID and salt plus a public application ID. Your identity never leaves your browser.',
  },
  {
    num: '03',
    title: 'Generate ZK Proof',
    desc: 'A Groth16 zero-knowledge proof is generated locally, proving credential validity and eligibility thresholds without disclosing them.',
  },
  {
    num: '04',
    title: 'Verify on Midnight',
    desc: 'The proof is submitted on-chain. The contract verifies it against the Merkle allowlist and records a per-app nullifier.',
  },
  {
    num: '05',
    title: 'Receive Access',
    desc: 'Membership is confirmed. Your identity remains hidden. Access count increments.',
  },
];

export function HowItWorks() {
  return (
    <section className="section" id="how-it-works">
      <div className="section-header">
        <motion.div
          className="section-eyebrow"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
        >
          Protocol
        </motion.div>
        <motion.h2
          className="section-title"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          How It Works
        </motion.h2>
      </div>

      <div className="flow-steps">
        {steps.map((step, i) => (
          <motion.div
            key={step.num}
            className="flow-step"
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
          >
            <div className="flow-step-number">{step.num}</div>
            <div className="flow-step-content">
              <div className="flow-step-title">{step.title}</div>
              <div className="flow-step-desc">{step.desc}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
