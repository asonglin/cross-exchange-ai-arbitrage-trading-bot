import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

export const FeatureCard = ({ icon, title, desc, delay = 0 }) => (
    <motion.div
        className="feature-card"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
    >
        <div className="feature-icon">{icon}</div>
        <h3 className="feature-title">{title}</h3>
        <p className="feature-desc">{desc}</p>
    </motion.div>
);

export const StepCard = ({ number, icon, title, desc, delay = 0 }) => (
    <motion.div
        className="step-card"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
    >
        <div className="step-number">{number}</div>
        <div className="step-icon">{icon}</div>
        <h3 className="step-title">{title}</h3>
        <p className="step-desc">{desc}</p>
    </motion.div>
);

export const MetricCard = ({ icon, value, label, delay = 0 }) => (
    <motion.div
        className="metric-card"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
    >
        <div style={{ color: 'var(--gold)', marginBottom: '0.75rem' }}>{icon}</div>
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
    </motion.div>
);

export const TrustItem = ({ text }) => (
    <div className="trust-item">
        <CheckCircle size={18} color="#FCD535" />
        <span>{text}</span>
    </div>
);
