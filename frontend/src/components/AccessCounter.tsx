import { motion } from 'motion/react';

interface Props {
  count: number | null;
}

export function AccessCounter({ count }: Props) {
  return (
    <motion.div
      className="card counter-panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1 }}
    >
      <div className="counter-label">On-Chain Verifications</div>
      <div className={`counter-value${count === null ? ' unknown' : ''}`}>
        {count !== null ? String(count).padStart(2, '0') : '--'}
      </div>
      <div className="counter-sub">Verified on Midnight Preprod</div>
    </motion.div>
  );
}
