import { motion } from 'framer-motion';
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Gauge,
    Layers, LineChart,
    PieChart,
    Server,
    Shield,
    Target,
    TrendingUp,
    Wifi, WifiOff,
    Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NetworkGraph from '../components/NetworkGraph';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const AnalyticsPage = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState(null);
    const [portfolio, setPortfolio] = useState(null);
    const [spreads, setSpreads] = useState([]);
    const [regime, setRegime] = useState(null);
    const [anomalies, setAnomalies] = useState([]);
    const [anomalyTotalCount, setAnomalyTotalCount] = useState(0);
    const [matrix, setMatrix] = useState(null);
    const [decisions, setDecisions] = useState([]);
    const [priceHistory, setPriceHistory] = useState({});
    const [activeSection, setActiveSection] = useState('network');

    const fetchAll = async () => {
        try {
            const [sRes, pRes, spRes, rRes, aRes, mRes, dRes] = await Promise.allSettled([
                fetch(`${API}/api/agent/status`),
                fetch(`${API}/api/agent/portfolio`),
                fetch(`${API}/api/prices/spreads`),
                fetch(`${API}/api/market/regime`),
                fetch(`${API}/api/market/anomalies?limit=30`),
                fetch(`${API}/api/prices/matrix`),
                fetch(`${API}/api/agent/decisions?limit=50`),
            ]);
            if (sRes.status === 'fulfilled') setStatus(await sRes.value.json());
            if (pRes.status === 'fulfilled') setPortfolio(await pRes.value.json());
            if (spRes.status === 'fulfilled') { const d = await spRes.value.json(); setSpreads(d.spreads || []); }
            if (rRes.status === 'fulfilled') setRegime(await rRes.value.json());
            if (aRes.status === 'fulfilled') { const d = await aRes.value.json(); setAnomalies(d.anomalies || []); setAnomalyTotalCount(d.total_count || d.anomalies?.length || 0); }
            if (mRes.status === 'fulfilled') {
                const raw = await mRes.value.json();
                // API returns { matrix: { BTCUSDT: { binance: {price,...}, ... }, ... }, summary: { source_status, ... } }
                const mat = raw.matrix || {};
                const summary = raw.summary || {};
                const syms = Object.keys(mat);
                const srcs = [...new Set(syms.flatMap(s => Object.keys(mat[s] || {})))];
                // Build coverage: { source: { SYM: true/false } }
                const cov = {};
                srcs.forEach(src => {
                    cov[src] = {};
                    syms.forEach(sym => { cov[src][sym] = !!(mat[sym]?.[src]?.price); });
                });
                setMatrix({ matrix: mat, symbols: syms, sources: srcs, coverage: cov, summary });
            }
            if (dRes.status === 'fulfilled') { const d = await dRes.value.json(); setDecisions(d.decisions || []); }
        } catch (e) { console.error('Fetch:', e); }
    };

    useEffect(() => {
        fetchAll();
        const iv = setInterval(fetchAll, 8000);
        return () => clearInterval(iv);
    }, []);

    const perf = portfolio?.performance || {};
    const equity = portfolio?.equity_curve || [];
    const trades = portfolio?.recent_trades || [];

    // ── Derived stats ──
    const validDecisions = decisions.filter(d => d && d.decision);
    const executeCount = validDecisions.filter(d => d.decision === 'EXECUTE').length;
    const skipCount = validDecisions.filter(d => d.decision === 'SKIP').length;
    const execRate = validDecisions.length > 0 ? ((executeCount / validDecisions.length) * 100).toFixed(1) : '0';

    // Source health from matrix
    const sources = matrix?.sources || [];
    const symbolCount = matrix?.symbols?.length || 0;
    const coverageEntries = matrix?.coverage || {};

    // Spread distribution buckets
    const spreadBuckets = { '<0.01%': 0, '0.01-0.05%': 0, '0.05-0.1%': 0, '0.1-0.5%': 0, '>0.5%': 0 };
    spreads.forEach(s => {
        const p = s.spread_pct || 0;
        if (p < 0.01) spreadBuckets['<0.01%']++;
        else if (p < 0.05) spreadBuckets['0.01-0.05%']++;
        else if (p < 0.1) spreadBuckets['0.05-0.1%']++;
        else if (p < 0.5) spreadBuckets['0.1-0.5%']++;
        else spreadBuckets['>0.5%']++;
    });
    const maxBucket = Math.max(...Object.values(spreadBuckets), 1);

    // Anomaly severity distribution (case-insensitive — API may return HIGH/MODERATE/LOW)
    const anomSeverity = { high: 0, medium: 0, low: 0 };
    anomalies.forEach(a => {
        const sev = (a.severity || '').toLowerCase();
        if (sev === 'high') anomSeverity.high++;
        else if (sev === 'medium' || sev === 'moderate') anomSeverity.medium++;
        else if (sev === 'low') anomSeverity.low++;
    });

    // Decision confidence histogram
    const confBuckets = Array(10).fill(0); // 0-10, 10-20, ..., 90-100
    validDecisions.forEach(d => {
        const bucket = Math.min(Math.floor((d.confidence || 0) / 10), 9);
        confBuckets[bucket]++;
    });
    const maxConf = Math.max(...confBuckets, 1);

    const regimeColors = {
        DISLOCATION: '#ff1744', VOLATILE: '#ff9100', RANGING: '#ffea00',
        TRENDING: '#00e676', CALM: '#40c4ff',
    };

    const sectionTabs = [
        { id: 'network', label: 'Network', icon: <Layers size={14} /> },
        { id: 'performance', label: 'Performance', icon: <LineChart size={14} /> },
        { id: 'sources', label: 'Sources', icon: <Server size={14} /> },
        { id: 'distribution', label: 'Distribution', icon: <PieChart size={14} /> },
    ];

    return (
        <div className="dashboard-layout">
            <Sidebar active="analytics" />

            {/* ── Main ── */}
            <main className="dashboard-main" style={{ padding: '1.5rem', overflow: 'auto', flex: 1, minWidth: 0 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                            <Activity size={24} style={{ marginRight: 8, color: '#FCD535', verticalAlign: 'middle' }} />
                            Analytics &amp; Intelligence
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
                            Real-time system health • Source coverage • Decision analysis
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {sectionTabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveSection(tab.id)} style={{
                                padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: 'none',
                                background: activeSection === tab.id ? '#FCD535' : 'var(--card-bg, #0c0c10)',
                                color: activeSection === tab.id ? '#000' : 'var(--text-secondary)',
                                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                            }}>
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── LIVE PROFIT HERO ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    style={{
                        background: 'linear-gradient(135deg, rgba(105,240,174,0.06) 0%, rgba(252,213,53,0.04) 50%, rgba(124,77,255,0.06) 100%)',
                        border: '1px solid rgba(105,240,174,0.12)',
                        borderRadius: '1rem', padding: '1.5rem 2rem', marginBottom: '1.2rem',
                        display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'center',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem', letterSpacing: '1px' }}>
                            PORTFOLIO VALUE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
                            <motion.span
                                key={perf.balance}
                                initial={{ scale: 1.1, color: '#FCD535' }}
                                animate={{ scale: 1, color: '#fff' }}
                                style={{ fontSize: '2.4rem', fontWeight: 900, fontFamily: 'var(--mono)' }}
                            >
                                ${perf.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '10,000.00'}
                            </motion.span>
                            <span style={{
                                fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--mono)',
                                color: (perf.total_pnl || 0) >= 0 ? '#69f0ae' : '#ff5252',
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                                {(perf.total_pnl || 0) >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                {(perf.total_pnl || 0) >= 0 ? '+' : ''}${perf.total_pnl?.toFixed(2) || '0.00'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
                            {[
                                { label: 'Win Rate', value: perf.win_rate != null ? `${perf.win_rate.toFixed(1)}%` : '—', color: '#69f0ae' },
                                { label: 'Sharpe', value: perf.sharpe_ratio?.toFixed(2) || '—', color: '#b388ff' },
                                { label: 'Trades', value: perf.total_trades || '0', color: '#40c4ff' },
                                { label: 'Max DD', value: perf.max_drawdown_pct != null ? `${perf.max_drawdown_pct.toFixed(2)}%` : '—', color: '#ff5252' },
                                { label: 'Profit Factor', value: perf.profit_factor?.toFixed(2) || '—', color: '#ffd740' },
                            ].map((s, i) => (
                                <div key={i}>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{s.label}</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: s.color }}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Mini sparkline */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', height: '80px', minWidth: '120px' }}>
                        {equity.length > 0 ? equity.slice(-40).map((e, i) => {
                            const arr = equity.slice(-40);
                            const min = Math.min(...arr.map(x => x.balance));
                            const max = Math.max(...arr.map(x => x.balance));
                            const range = max - min || 1;
                            const h = ((e.balance - min) / range) * 70 + 10;
                            return (
                                <div key={i} style={{
                                    flex: 1, height: `${h}px`, borderRadius: '1px 1px 0 0', minWidth: '2px',
                                    background: e.balance >= 10000
                                        ? `rgba(105,240,174,${0.3 + (i / 40) * 0.5})`
                                        : `rgba(255,82,82,${0.3 + (i / 40) * 0.5})`,
                                }} />
                            );
                        }) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', alignSelf: 'center', textAlign: 'center', width: '100%' }}>
                                Collecting data...
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* ── KPI Strip ── */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                    gap: '0.7rem', marginBottom: '1.2rem',
                }}>
                    {[
                        { label: 'TOTAL SCANS', value: status?.scan_count?.toLocaleString() || '0', color: '#40c4ff', icon: <Gauge size={14} /> },
                        { label: 'SOURCES ONLINE', value: `${status?.market?.sources_online || 0}/${status?.market?.total_sources || 5}`, color: '#69f0ae', icon: <Wifi size={14} /> },
                        { label: 'REGIME', value: regime?.regime || '—', color: regimeColors[regime?.regime] || '#fff', icon: <Zap size={14} /> },
                        { label: 'EXEC RATE', value: `${execRate}%`, color: '#b388ff', icon: <Target size={14} /> },
                        { label: 'TOTAL P&L', value: `${(perf.total_pnl || 0) >= 0 ? '+' : ''}$${perf.total_pnl?.toFixed(2) || '0'}`, color: (perf.total_pnl || 0) >= 0 ? '#69f0ae' : '#ff5252', icon: <TrendingUp size={14} /> },
                        { label: 'ANOMALIES', value: anomalyTotalCount.toString(), color: anomalyTotalCount > 5 ? '#ff5252' : '#ffab40', icon: <Shield size={14} /> },
                    ].map((kpi, i) => (
                        <motion.div key={i}
                            className="glass-card"
                            style={{ padding: '0.9rem' }}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                                {kpi.icon} {kpi.label}
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '1.2rem', fontFamily: 'var(--mono)', color: kpi.color }}>
                                {kpi.value}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* ═══ SECTION CONTENT ═══ */}

                {activeSection === 'network' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Network Graph */}
                        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Layers size={16} style={{ color: '#FCD535' }} /> Price Source Network
                                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    {spreads.length} active spreads • {anomalyTotalCount} anomalies
                                </span>
                            </h3>
                            <NetworkGraph spreads={spreads} anomalies={anomalies} anomalyTotalCount={anomalyTotalCount} regime={regime} />
                        </div>

                        {/* Top Spreads */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                🔥 Highest Spreads
                            </h3>
                            {spreads.slice(0, 8).map((s, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center',
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.symbol?.replace('USDT', '')}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginLeft: '0.4rem' }}>
                                            {s.source_a} → {s.source_b}
                                        </span>
                                    </div>
                                    <span style={{
                                        fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '0.85rem',
                                        color: s.spread_pct > 0.1 ? '#ffd740' : s.spread_pct > 0.05 ? '#ffab40' : 'var(--text-secondary)',
                                    }}>
                                        {s.spread_pct?.toFixed(4)}%
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Anomaly Breakdown */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                ⚡ Anomaly Breakdown
                            </h3>
                            {/* Severity bars */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                                {[
                                    { label: 'High', count: anomSeverity.high, color: '#ff1744' },
                                    { label: 'Medium', count: anomSeverity.medium, color: '#ff9100' },
                                    { label: 'Low', count: anomSeverity.low, color: '#40c4ff' },
                                ].map((sev, i) => (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
                                            <span style={{ color: sev.color, fontWeight: 600 }}>{sev.label}</span>
                                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{sev.count}</span>
                                        </div>
                                        <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.05)' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${anomalyTotalCount > 0 ? (sev.count / anomalyTotalCount) * 100 : 0}%` }}
                                                transition={{ duration: 0.8, delay: i * 0.1 }}
                                                style={{ height: '100%', borderRadius: '3px', background: sev.color }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Latest anomalies */}
                            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                {anomalies.slice(0, 5).map((a, i) => {
                                    const sev = (a.severity || '').toLowerCase();
                                    return (
                                    <div key={i} style={{
                                        padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between',
                                    }}>
                                        <span style={{ color: '#fff' }}>{a.symbol?.replace('USDT', '')} — {a.type}</span>
                                        <span style={{
                                            fontFamily: 'var(--mono)', fontSize: '0.7rem', textTransform: 'uppercase',
                                            color: sev === 'high' ? '#ff1744' : (sev === 'medium' || sev === 'moderate') ? '#ff9100' : '#40c4ff',
                                        }}>{a.severity}</span>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'performance' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Equity Curve — full width */}
                        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <LineChart size={16} style={{ color: '#69f0ae' }} /> Equity Curve
                                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    {equity.length > 0 && (
                                        <motion.span
                                            key={equity[equity.length - 1]?.balance}
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            style={{ color: '#69f0ae', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '0.78rem' }}
                                        >
                                            LIVE ${equity[equity.length - 1]?.balance?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </motion.span>
                                    )}
                                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#69f0ae', animation: 'pulse 1.5s infinite' }} />
                                    {equity.length} data points
                                </span>
                            </h3>
                            <div key={`eq-${equity.length}`} style={{ height: '220px', display: 'flex', alignItems: 'flex-end', gap: '1px', padding: '0 0.5rem' }}>
                                {equity.length > 0 ? (() => {
                                    const arr = equity.slice(-120);
                                    const min = Math.min(...arr.map(x => x.balance));
                                    const max = Math.max(...arr.map(x => x.balance));
                                    const range = max - min || 1;
                                    const total = arr.length;
                                    return arr.map((e, i) => {
                                    const h = ((e.balance - min) / range) * 200;
                                    const isUp = e.balance >= 10000;
                                    const isNewest = i >= total - 3;
                                    return (
                                        <motion.div key={`${i}-${e.balance}`}
                                            initial={{ height: 0, opacity: 0.5 }}
                                            animate={{ height: `${h}px`, opacity: 1 }}
                                            transition={{ duration: 0.5, delay: i * 0.002 }}
                                            style={{
                                            flex: 1, borderRadius: '1px 1px 0 0', minWidth: '1px',
                                            background: isNewest
                                                ? (isUp ? 'rgba(105,240,174,0.95)' : 'rgba(255,82,82,0.95)')
                                                : isUp
                                                    ? `rgba(105,240,174,${0.2 + (i / total) * 0.5})`
                                                    : `rgba(255,82,82,${0.2 + (i / total) * 0.5})`,
                                            boxShadow: isNewest ? '0 0 6px rgba(105,240,174,0.5)' : 'none',
                                        }} title={`$${e.balance.toFixed(2)}`} />
                                    );
                                    });
                                })() : (
                                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', width: '100%', alignSelf: 'center' }}>
                                        No equity data yet
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Performance Metrics */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>📊 Key Metrics</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                {[
                                    { label: 'Balance', value: `$${perf.balance?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '10,000'}`, color: '#fff' },
                                    { label: 'Total P&L', value: `${(perf.total_pnl || 0) >= 0 ? '+' : ''}$${perf.total_pnl?.toFixed(2) || '0'}`, color: (perf.total_pnl || 0) >= 0 ? '#69f0ae' : '#ff5252' },
                                    { label: 'Win Rate', value: perf.win_rate != null ? `${perf.win_rate.toFixed(1)}%` : '—', color: '#40c4ff' },
                                    { label: 'Sharpe', value: perf.sharpe_ratio?.toFixed(2) || '—', color: '#b388ff' },
                                    { label: 'Profit Factor', value: perf.profit_factor?.toFixed(2) || '—', color: '#ffd740' },
                                    { label: 'Max DD', value: perf.max_drawdown_pct != null ? `${perf.max_drawdown_pct.toFixed(2)}%` : '—', color: '#ff5252' },
                                    { label: 'Total Trades', value: `${perf.total_trades || 0}`, color: '#fff' },
                                    { label: 'Avg Trade', value: perf.total_trades > 0 ? `$${((perf.total_pnl || 0) / perf.total_trades).toFixed(2)}` : '—', color: '#ffab40' },
                                ].map((m, i) => (
                                    <div key={i} style={{ padding: '0.6rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{m.label}</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, fontFamily: 'var(--mono)', color: m.color }}>{m.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Trade Log */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>📋 Recent Trades</h3>
                            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                {trades.length > 0 ? trades.map((t, i) => (
                                    <div key={i} style={{
                                        padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            {t.pnl >= 0
                                                ? <ArrowUpRight size={12} style={{ color: '#69f0ae' }} />
                                                : <ArrowDownRight size={12} style={{ color: '#ff5252' }} />}
                                            <span style={{ fontWeight: 700 }}>{t.symbol?.replace('USDT', '')}</span>
                                            <span style={{
                                                fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.3rem', borderRadius: '0.2rem',
                                                background: t.result === 'WIN' ? 'rgba(105,240,174,0.15)' : 'rgba(255,82,82,0.15)',
                                                color: t.result === 'WIN' ? '#69f0ae' : '#ff5252',
                                            }}>{t.result}</span>
                                        </div>
                                        <span style={{
                                            fontFamily: 'var(--mono)', fontWeight: 700,
                                            color: t.pnl >= 0 ? '#69f0ae' : '#ff5252',
                                        }}>
                                            {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}
                                        </span>
                                    </div>
                                )) : (
                                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
                                        No trades yet
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'sources' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Source Health Cards */}
                        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Server size={16} style={{ color: '#40c4ff' }} /> Oracle Source Health
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                                {['binance', 'coingecko', 'pancakeswap', 'jupiter', '1inch'].map((src, i) => {
                                    const coverage = coverageEntries[src];
                                    const symbolsCovered = coverage ? Object.values(coverage).filter(Boolean).length : 0;
                                    const isOnline = symbolsCovered > 0;
                                    const coveragePct = symbolCount > 0 ? ((symbolsCovered / symbolCount) * 100).toFixed(0) : 0;
                                    const srcColors = {
                                        binance: '#F0B90B', coingecko: '#8DC63F', pancakeswap: '#D1884F',
                                        jupiter: '#C7F284', '1inch': '#94A3B8',
                                    };
                                    const displayName = src === '1inch' ? 'Oneinch' : src;
                                    return (
                                        <motion.div key={src}
                                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.08 }}
                                            style={{
                                                padding: '1rem', borderRadius: '0.6rem',
                                                background: isOnline ? 'rgba(105,240,174,0.04)' : 'rgba(255,82,82,0.04)',
                                                border: `1px solid ${isOnline ? 'rgba(105,240,174,0.12)' : 'rgba(255,82,82,0.12)'}`,
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {isOnline ? <Wifi size={14} style={{ color: '#69f0ae' }} /> : <WifiOff size={14} style={{ color: '#ff5252' }} />}
                                                    <span style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'capitalize', color: srcColors[src] || '#fff' }}>
                                                        {displayName}
                                                    </span>
                                                </div>
                                                <span style={{
                                                    padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.65rem', fontWeight: 700,
                                                    background: isOnline ? 'rgba(105,240,174,0.15)' : 'rgba(255,82,82,0.15)',
                                                    color: isOnline ? '#69f0ae' : '#ff5252',
                                                }}>
                                                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                                                {symbolsCovered}/{symbolCount} symbols • {coveragePct}% coverage
                                            </div>
                                            {/* Coverage bar */}
                                            <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${coveragePct}%` }}
                                                    transition={{ duration: 1, delay: i * 0.1 }}
                                                    style={{ height: '100%', borderRadius: '2px', background: srcColors[src] || '#69f0ae' }}
                                                />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Price Matrix Heatmap */}
                        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Layers size={16} style={{ color: '#ffd740' }} /> Price Matrix Coverage
                                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    {symbolCount} symbols × {sources.length} sources
                                </span>
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding: '0.4rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Symbol</th>
                                            {sources.map(s => (
                                                <th key={s} style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>{s}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(matrix?.symbols || []).slice(0, 15).map((sym, i) => (
                                            <tr key={sym} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '0.4rem', fontWeight: 700, fontFamily: 'var(--mono)' }}>{sym.replace('USDT', '')}</td>
                                                {sources.map(src => {
                                                    const entry = matrix?.matrix?.[sym]?.[src];
                                                    const price = entry?.price;
                                                    return (
                                                        <td key={src} style={{
                                                            padding: '0.4rem', textAlign: 'center', fontFamily: 'var(--mono)',
                                                            color: price ? '#fff' : 'var(--text-muted)',
                                                            background: price ? 'rgba(105,240,174,0.04)' : 'rgba(255,82,82,0.03)',
                                                        }}>
                                                            {price ? `$${parseFloat(price).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'distribution' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Spread Distribution */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                📊 Spread Distribution
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {Object.entries(spreadBuckets).map(([label, count], i) => (
                                    <div key={label}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', marginBottom: '0.2rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>{count}</span>
                                        </div>
                                        <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(count / maxBucket) * 100}%` }}
                                                transition={{ duration: 0.8, delay: i * 0.08 }}
                                                style={{
                                                    height: '100%', borderRadius: '4px',
                                                    background: `linear-gradient(90deg, #FCD535, ${i > 2 ? '#ff9100' : '#ffd740'})`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Decision Confidence Histogram */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                🧠 Decision Confidence Distribution
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '160px', padding: '0 0.3rem' }}>
                                {confBuckets.map((count, i) => {
                                    const h = maxConf > 0 ? (count / maxConf) * 140 : 0;
                                    const hue = (i / 9) * 120; // red (0) to green (120)
                                    return (
                                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            <span style={{ fontSize: '0.55rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                                                {count > 0 ? count : ''}
                                            </span>
                                            <motion.div
                                                initial={{ height: 0 }}
                                                animate={{ height: `${h}px` }}
                                                transition={{ duration: 0.6, delay: i * 0.05 }}
                                                style={{
                                                    width: '100%', borderRadius: '2px 2px 0 0', minHeight: count > 0 ? '3px' : '0',
                                                    background: `hsla(${hue}, 80%, 55%, 0.6)`,
                                                }}
                                                title={`${i * 10}-${(i + 1) * 10}: ${count} decisions`}
                                            />
                                            <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>{i * 10}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Decision Type Breakdown */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                ⚖️ Decision Breakdown
                            </h3>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                                {/* Visual donut approximation */}
                                <div style={{ position: 'relative', width: '100px', height: '100px' }}>
                                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                                        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,82,82,0.3)" strokeWidth="12"
                                            strokeDasharray={`${(skipCount / Math.max(validDecisions.length, 1)) * 238.76} 238.76`}
                                            strokeDashoffset="0" transform="rotate(-90 50 50)"
                                        />
                                        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(105,240,174,0.6)" strokeWidth="12"
                                            strokeDasharray={`${(executeCount / Math.max(validDecisions.length, 1)) * 238.76} 238.76`}
                                            strokeDashoffset={`-${(skipCount / Math.max(validDecisions.length, 1)) * 238.76}`}
                                            transform="rotate(-90 50 50)"
                                        />
                                    </svg>
                                    <div style={{
                                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff',
                                    }}>
                                        {validDecisions.length}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '2px', background: 'rgba(105,240,174,0.6)' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>EXECUTE: {executeCount}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '2px', background: 'rgba(255,82,82,0.3)' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>SKIP: {skipCount}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Agent Uptime & Cycle Stats */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                ⏱ Agent Runtime
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                                {[
                                    { label: 'Uptime', value: status?.uptime || '0s' },
                                    { label: 'Total Cycles', value: status?.cycle_count?.toLocaleString() || '0' },
                                    { label: 'Last Cycle', value: status?.last_cycle_ms ? `${status.last_cycle_ms.toFixed(0)}ms` : '—' },
                                    { label: 'Avg Cycle', value: status?.uptime_seconds && status?.cycle_count ? `${((status.uptime_seconds * 1000) / status.cycle_count).toFixed(0)}ms` : '—' },
                                    { label: 'Min Confidence', value: `${status?.thresholds?.min_confidence || '—'}/100` },
                                    { label: 'Min Spread', value: `${status?.thresholds?.min_spread_pct || '—'}%` },
                                    { label: 'Max Risk', value: `${status?.thresholds?.max_risk || '—'}/100` },
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#fff' }}>{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AnalyticsPage;
