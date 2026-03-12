import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    Box,
    Check,
    Clock,
    Cpu,
    DollarSign,
    Fuel, Hash,
    RefreshCw,
    Server,
    Settings,
    Shield,
    Sliders,
    Zap
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SettingsPage = () => {
    const navigate = useNavigate();
    const [config, setConfig] = useState(null);
    const [chainStats, setChainStats] = useState(null);
    const [agentStatus, setAgentStatus] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState({});
    const [activeSection, setActiveSection] = useState('agent');

    const fetchAll = useCallback(async () => {
        try {
            const [cfgRes, chainRes, statusRes] = await Promise.allSettled([
                fetch(`${API}/api/agent/config`),
                fetch(`${API}/api/chain/stats`),
                fetch(`${API}/api/agent/status`),
            ]);
            if (cfgRes.status === 'fulfilled') setConfig(await cfgRes.value.json());
            if (chainRes.status === 'fulfilled') setChainStats(await chainRes.value.json());
            if (statusRes.status === 'fulfilled') setAgentStatus(await statusRes.value.json());
        } catch (e) { console.error('Settings fetch:', e); }
    }, []);

    useEffect(() => {
        fetchAll();
        const iv = setInterval(fetchAll, 10000);
        return () => clearInterval(iv);
    }, [fetchAll]);

    const updateField = (key, value) => {
        setDirty(prev => ({ ...prev, [key]: value }));
    };

    const saveConfig = async () => {
        if (Object.keys(dirty).length === 0) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/api/agent/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dirty),
            });
            if (res.ok) {
                const result = await res.json();
                setConfig(prev => ({ ...prev, ...result.config }));
                setDirty({});
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
            }
        } catch (e) { console.error('Save config:', e); }
        setSaving(false);
    };

    const getVal = (key) => dirty[key] !== undefined ? dirty[key] : (config?.[key] ?? 0);
    const isDirty = Object.keys(dirty).length > 0;

    const configFields = [
        {
            key: 'min_confidence', label: 'Minimum Confidence', icon: <Shield size={16} />,
            min: 0, max: 100, step: 1, unit: '/100', color: '#40c4ff',
            desc: 'Minimum XAI confidence score required to execute a trade',
        },
        {
            key: 'min_spread_pct', label: 'Minimum Spread', icon: <Zap size={16} />,
            min: 0.001, max: 2, step: 0.001, unit: '%', color: '#ffd740',
            desc: 'Minimum net spread percentage to consider an opportunity',
        },
        {
            key: 'max_risk', label: 'Maximum Risk', icon: <AlertTriangle size={16} />,
            min: 0, max: 100, step: 1, unit: '/100', color: '#ff5252',
            desc: 'Maximum risk score allowed — lower is more conservative',
        },
        {
            key: 'scan_interval', label: 'Scan Interval', icon: <Clock size={16} />,
            min: 1, max: 60, step: 1, unit: 's', color: '#69f0ae',
            desc: 'Seconds between each full market scan cycle',
        },
        {
            key: 'max_position_usd', label: 'Max Position Size', icon: <DollarSign size={16} />,
            min: 10, max: 10000, step: 10, unit: 'USD', color: '#b388ff',
            desc: 'Maximum dollar amount allocated per trade',
        },
        {
            key: 'circuit_breaker_drawdown', label: 'Circuit Breaker', icon: <AlertTriangle size={16} />,
            min: 0.5, max: 20, step: 0.1, unit: '%', color: '#ff1744',
            desc: 'Stop trading if portfolio drawdown exceeds this percentage',
        },
        {
            key: 'cooldown_seconds', label: 'Cooldown Period', icon: <Clock size={16} />,
            min: 5, max: 300, step: 5, unit: 's', color: '#ffab40',
            desc: 'Wait time between consecutive trade executions',
        },
    ];

    return (
        <div className="dashboard-layout">
            <Sidebar active="settings" />

            {/* Main */}
            <main className="dashboard-main" style={{ padding: '1.5rem', overflow: 'auto', flex: 1, minWidth: 0 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                            <Settings size={24} style={{ marginRight: 8, color: '#FCD535', verticalAlign: 'middle' }} />
                            Control Center
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
                            Agent configuration • BNB Chain status • Live tuning
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {[
                            { id: 'agent', label: 'Agent Config', icon: <Sliders size={14} /> },
                            { id: 'chain', label: 'BNB Chain', icon: <Box size={14} /> },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveSection(tab.id)} style={{
                                padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: 'none',
                                background: activeSection === tab.id ? '#FCD535' : 'var(--bg-card)',
                                color: activeSection === tab.id ? '#000' : 'var(--text-secondary)',
                                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                            }}>
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ═══ AGENT CONFIG ═══ */}
                {activeSection === 'agent' && config && (
                    <div>
                        {/* Save bar */}
                        <AnimatePresence>
                            {(isDirty || saved) && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.8rem 1.2rem', borderRadius: '0.6rem', marginBottom: '1rem',
                                        background: saved ? 'rgba(105,240,174,0.08)' : 'rgba(252,213,53,0.08)',
                                        border: `1px solid ${saved ? 'rgba(105,240,174,0.2)' : 'rgba(252,213,53,0.2)'}`,
                                    }}
                                >
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: saved ? '#69f0ae' : '#ffd740' }}>
                                        {saved ? '✓ Configuration saved — agent updated in real-time' : `${Object.keys(dirty).length} setting(s) changed — unsaved`}
                                    </span>
                                    {isDirty && (
                                        <button onClick={saveConfig} disabled={saving} style={{
                                            padding: '0.4rem 1rem', borderRadius: '0.4rem', border: 'none',
                                            background: '#FCD535', color: '#000', fontWeight: 800, fontSize: '0.78rem',
                                            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
                                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        }}>
                                            {saving ? <RefreshCw size={12} style={{ animation: 'spin-slow 1s linear infinite' }} /> : <Check size={12} />}
                                            {saving ? 'Saving...' : 'Apply Changes'}
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Config sliders */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                            {configFields.map((field, i) => {
                                const val = getVal(field.key);
                                const pct = ((val - field.min) / (field.max - field.min)) * 100;
                                const isChanged = dirty[field.key] !== undefined;
                                return (
                                    <motion.div key={field.key}
                                        className="glass-card"
                                        style={{
                                            padding: '1.1rem',
                                            border: isChanged ? `1px solid rgba(252,213,53,0.3)` : undefined,
                                        }}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.04 }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ color: field.color }}>{field.icon}</span>
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{field.label}</span>
                                            </div>
                                            <span style={{
                                                fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '1rem',
                                                color: isChanged ? '#FCD535' : '#fff',
                                            }}>
                                                {typeof val === 'number' && val % 1 !== 0 ? val.toFixed(3) : val}
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>{field.unit}</span>
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                                            {field.desc}
                                        </div>
                                        {/* Slider */}
                                        <div style={{ position: 'relative', height: '24px' }}>
                                            <input
                                                type="range"
                                                min={field.min} max={field.max} step={field.step}
                                                value={val}
                                                onChange={(e) => updateField(field.key, parseFloat(e.target.value))}
                                                style={{
                                                    width: '100%', height: '6px', borderRadius: '3px',
                                                    background: `linear-gradient(90deg, ${field.color} ${pct}%, rgba(255,255,255,0.06) ${pct}%)`,
                                                    appearance: 'none', WebkitAppearance: 'none', outline: 'none',
                                                    cursor: 'pointer',
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                                            <span>{field.min}</span>
                                            <span>{field.max}</span>
                                        </div>
                                    </motion.div>
                                );
                            })}

                            {/* Agent Status Card */}
                            <div className="glass-card" style={{ padding: '1.1rem' }}>
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Cpu size={14} style={{ color: '#40c4ff' }} /> Agent Runtime
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {[
                                        { label: 'State', value: agentStatus?.state || '—', color: agentStatus?.state === 'SCANNING' ? '#40c4ff' : '#ffab40' },
                                        { label: 'Uptime', value: agentStatus?.uptime || '—' },
                                        { label: 'Scans', value: agentStatus?.scan_count?.toLocaleString() || '0' },
                                        { label: 'Last Cycle', value: agentStatus?.last_cycle_ms ? `${agentStatus.last_cycle_ms.toFixed(0)}ms` : '—' },
                                        { label: 'Regime', value: agentStatus?.market?.regime || '—', color: '#ffd740' },
                                        { label: 'Sources', value: `${agentStatus?.market?.sources_online || 0}/5`, color: '#69f0ae' },
                                    ].map((item, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: item.color || '#fff' }}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ BNB CHAIN ═══ */}
                {activeSection === 'chain' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Chain Health */}
                        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Box size={16} style={{ color: '#F0B90B' }} /> BNB Smart Chain — Live Network Status
                            </h3>
                            {chainStats ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8rem' }}>
                                    {[
                                        { label: 'Network', value: chainStats.network_status === 'healthy' ? '🟢 Healthy' : '🔴 Error', color: chainStats.network_status === 'healthy' ? '#69f0ae' : '#ff5252' },
                                        { label: 'Block', value: `#${chainStats.block_number?.toLocaleString()}`, color: '#40c4ff', icon: <Hash size={14} /> },
                                        { label: 'Gas Price', value: `${chainStats.gas_price_gwei} Gwei`, color: '#ffd740', icon: <Fuel size={14} /> },
                                        { label: 'BNB Price', value: `$${chainStats.bnb_price_usd}`, color: '#F0B90B', icon: <DollarSign size={14} /> },
                                        { label: 'Swap Cost', value: `$${chainStats.estimated_swap_cost_usd}`, color: '#69f0ae', icon: <Zap size={14} /> },
                                        { label: 'Block Time', value: `${chainStats.block_time_seconds}s`, color: '#b388ff', icon: <Clock size={14} /> },
                                        { label: 'Est. TPS', value: `~${chainStats.tps_estimate}`, color: '#ffab40', icon: <Server size={14} /> },
                                        { label: 'Swap Gas', value: `${chainStats.estimated_swap_cost_bnb} BNB`, color: '#fff', icon: <Fuel size={14} /> },
                                    ].map((item, i) => (
                                        <motion.div key={i}
                                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.05 }}
                                            style={{ padding: '0.9rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.03)' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                                                {item.icon} {item.label}
                                            </div>
                                            <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--mono)', color: item.color }}>
                                                {item.value}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={24} style={{ animation: 'spin-slow 1.5s linear infinite', marginBottom: '0.5rem' }} /><br />
                                    Connecting to BNB Smart Chain...
                                </div>
                            )}
                        </div>

                        {/* Why BNB Chain */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                🔶 Why BNB Chain?
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {[
                                    { title: 'Ultra-Low Gas', desc: 'Average $0.01 per swap — 100x cheaper than Ethereum', color: '#69f0ae' },
                                    { title: '3s Block Time', desc: 'Near-instant finality for time-sensitive arbitrage', color: '#40c4ff' },
                                    { title: 'PancakeSwap DEX', desc: 'Largest BSC DEX — deep liquidity pools for low slippage', color: '#D1884F' },
                                    { title: 'Cross-Chain Bridges', desc: 'Native bridges to Ethereum, Solana, Polygon', color: '#b388ff' },
                                    { title: 'EVM Compatible', desc: 'Deploy Solidity smart contracts with existing tooling', color: '#ffd740' },
                                ].map((item, i) => (
                                    <motion.div key={i}
                                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + i * 0.08 }}
                                        style={{ padding: '0.6rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.02)' }}
                                    >
                                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: item.color, marginBottom: '0.15rem' }}>
                                            {item.title}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.desc}</div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Arbix Architecture on BNB */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.8rem' }}>
                                🏗 Arbix on BNB Chain
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem' }}>
                                {[
                                    { step: '1', label: 'Price Discovery', desc: 'Multi-oracle scan across 5 sources', color: '#40c4ff' },
                                    { step: '2', label: 'Opportunity Detection', desc: 'Bellman-Ford finds negative cycles', color: '#ffd740' },
                                    { step: '3', label: 'Risk Analysis', desc: 'XAI scores confidence & slippage risk', color: '#b388ff' },
                                    { step: '4', label: 'Smart Contract Execution', desc: 'Atomic BSC swap via PancakeSwap Router', color: '#69f0ae' },
                                    { step: '5', label: 'Profit Capture', desc: 'Settle in < 6 seconds, lock profits', color: '#FCD535' },
                                ].map((item, i) => (
                                    <motion.div key={i}
                                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + i * 0.08 }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.7rem',
                                            padding: '0.5rem 0.6rem', borderRadius: '0.4rem',
                                            background: 'rgba(255,255,255,0.02)',
                                        }}
                                    >
                                        <div style={{
                                            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                            background: `${item.color}20`, border: `1px solid ${item.color}40`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.65rem', fontWeight: 800, color: item.color,
                                        }}>
                                            {item.step}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: item.color }}>{item.label}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.desc}</div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {!config && activeSection === 'agent' && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <RefreshCw size={32} style={{ animation: 'spin-slow 1.5s linear infinite', marginBottom: '0.5rem' }} /><br />
                        Loading agent configuration...
                    </div>
                )}
            </main>
        </div>
    );
};

export default SettingsPage;
