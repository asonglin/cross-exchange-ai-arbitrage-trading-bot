import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Brain, Target, TrendingUp, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION = 5000;

const icons = {
    opportunity: <Target size={16} style={{ color: '#ffd740' }} />,
    decision: <Brain size={16} style={{ color: '#b388ff' }} />,
    trade: <Zap size={16} style={{ color: '#69f0ae' }} />,
    anomaly: <AlertTriangle size={16} style={{ color: '#ff5252' }} />,
    scan_complete: <TrendingUp size={16} style={{ color: '#40c4ff' }} />,
};

const bgColors = {
    opportunity: 'rgba(255,215,64,0.12)',
    decision: 'rgba(179,136,255,0.12)',
    trade: 'rgba(105,240,174,0.12)',
    anomaly: 'rgba(255,82,82,0.12)',
    scan_complete: 'rgba(64,196,255,0.08)',
};

const borderColors = {
    opportunity: 'rgba(255,215,64,0.25)',
    decision: 'rgba(179,136,255,0.25)',
    trade: 'rgba(105,240,174,0.25)',
    anomaly: 'rgba(255,82,82,0.25)',
    scan_complete: 'rgba(64,196,255,0.15)',
};

const NotificationToast = () => {
    const [toasts, setToasts] = useState([]);
    const wsRef = useRef(null);
    const toastIdRef = useRef(0);

    const addToast = useCallback((type, message, detail) => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev.slice(-4), { id, type, message, detail, ts: Date.now() }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, TOAST_DURATION);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        let isMounted = true;
        const connect = () => {
            if (!isMounted) return;
            const wsBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
            const ws = new WebSocket(`${wsBase}/ws/agent`);
            ws.onopen = () => { };
            ws.onclose = () => {
                if (isMounted) setTimeout(connect, 5000);
            };
            ws.onerror = () => { };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (!msg || !msg.type) return;

                    if (msg.type === 'opportunity' && msg.data) {
                        const syms = (msg.data.symbols || []).map(s => s.replace('USDT', '')).join('/');
                        addToast('opportunity', `Arbitrage: ${syms}`, `${msg.data.net_profit_pct?.toFixed(4)}% net spread`);
                    }
                    if (msg.type === 'decision' && msg.data?.decision_id) {
                        const syms = (msg.data.symbols || []).map(s => s.replace('USDT', '')).join('/');
                        const action = msg.data.decision;
                        addToast('decision', `${action}: ${syms}`, msg.data.verdict || `Confidence ${msg.data.confidence}/100`);
                    }
                    if (msg.type === 'trade' && msg.data) {
                        addToast('trade', `Trade executed`, `${msg.data.symbol} — PnL: $${msg.data.pnl?.toFixed(2)}`);
                    }
                } catch { }
            };
            wsRef.current = ws;
        };
        connect();
        return () => {
            isMounted = false;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
        };
    }, [addToast]);

    return (
        <div style={{
            position: 'fixed', top: '1rem', right: '1rem',
            zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem',
            pointerEvents: 'none', maxWidth: '360px', width: '100%',
        }}>
            <AnimatePresence>
                {toasts.map((t) => (
                    <motion.div
                        key={t.id}
                        initial={{ opacity: 0, x: 80, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 80, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        style={{
                            pointerEvents: 'auto',
                            padding: '0.8rem 1rem',
                            borderRadius: '0.75rem',
                            background: bgColors[t.type] || 'rgba(255,255,255,0.08)',
                            border: `1px solid ${borderColors[t.type] || 'rgba(255,255,255,0.1)'}`,
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            cursor: 'pointer',
                        }}
                        onClick={() => removeToast(t.id)}
                    >
                        <div style={{ marginTop: '2px', flexShrink: 0 }}>
                            {icons[t.type] || icons.scan_complete}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.15rem', color: '#fff' }}>
                                {t.message}
                            </div>
                            {t.detail && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--mono)' }}>
                                    {t.detail}
                                </div>
                            )}
                        </div>
                        <X size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, marginTop: '2px' }} />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default NotificationToast;
