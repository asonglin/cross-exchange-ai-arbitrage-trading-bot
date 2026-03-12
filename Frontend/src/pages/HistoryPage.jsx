import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    History, TrendingUp, TrendingDown, ArrowRight, RefreshCw,
    ChevronDown, ChevronUp, Filter, Download, Search, Zap,
    DollarSign, BarChart3, Target, Shield, Clock, Layers
} from 'lucide-react';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const HistoryPage = () => {
    const [trades, setTrades] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedTrade, setExpandedTrade] = useState(null);
    const [filterType, setFilterType] = useState('all'); // all, wins, losses
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState('timestamp');
    const [sortDir, setSortDir] = useState('desc');

    // Fetch trades from backend (tries Supabase first, falls back to in-memory)
    const fetchTrades = async () => {
        try {
            // Try Supabase history first
            const res = await fetch(`${API}/api/trades/history?limit=500`);
            const data = await res.json();
            if (data.trades && data.trades.length > 0) {
                // Normalize the Supabase data shape
                const normalized = data.trades.map(t => ({
                    id: t.trade_id || t.id,
                    opportunity_id: t.opportunity_id,
                    decision_id: t.decision_id,
                    type: t.trade_type || t.type || 'unknown',
                    symbols: typeof t.symbols === 'string' ? t.symbols.split(',') : (t.symbols || []),
                    sources: typeof t.sources === 'string' ? t.sources.split(',') : (t.sources || []),
                    position_size: parseFloat(t.position_size) || 0,
                    net_profit_pct: parseFloat(t.spread_pct || t.net_profit_pct) || 0,
                    pnl: parseFloat(t.pnl) || 0,
                    won: t.won,
                    confidence: parseInt(t.confidence) || 0,
                    risk: parseInt(t.risk) || 0,
                    timestamp: t.executed_at ? new Date(t.executed_at).getTime() / 1000 : (t.timestamp || 0),
                    cost_breakdown: t.cost_breakdown || {
                        gas: parseFloat(t.gas_cost) || 0,
                        slippage: parseFloat(t.slippage_cost) || 0,
                        total_costs: parseFloat(t.total_costs) || 0,
                    },
                }));
                setTrades(normalized);
            } else {
                // Fallback to in-memory trades from agent
                const memRes = await fetch(`${API}/api/agent/trades?limit=500`);
                const memData = await memRes.json();
                if (Array.isArray(memData)) {
                    setTrades(memData);
                }
            }
        } catch (e) {
            console.error('Trade history fetch error:', e);
            // Last resort: try in-memory
            try {
                const memRes = await fetch(`${API}/api/agent/trades?limit=500`);
                const memData = await memRes.json();
                if (Array.isArray(memData)) setTrades(memData);
            } catch (e2) { }
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API}/api/trades/stats`);
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error('Trade stats error:', e);
        }
    };

    useEffect(() => {
        fetchTrades();
        fetchStats();
        const interval = setInterval(() => { fetchTrades(); fetchStats(); }, 15000);
        return () => clearInterval(interval);
    }, []);

    // Filter & sort
    const filtered = trades
        .filter(t => {
            if (filterType === 'wins') return t.won;
            if (filterType === 'losses') return !t.won;
            return true;
        })
        .filter(t => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const syms = (t.symbols || []).join(' ').toLowerCase();
            const srcs = (t.sources || []).join(' ').toLowerCase();
            return syms.includes(q) || srcs.includes(q) || (t.type || '').toLowerCase().includes(q) || (t.id || '').toLowerCase().includes(q);
        })
        .sort((a, b) => {
            const av = a[sortField] || 0;
            const bv = b[sortField] || 0;
            return sortDir === 'desc' ? bv - av : av - bv;
        });

    const toggleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const formatTime = (ts) => {
        if (!ts) return '—';
        const d = new Date(ts * 1000);
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
        });
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) return null;
        return sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />;
    };

    return (
        <div className="dashboard-layout">
            <Sidebar active="history" />

            <main className="main-view" style={{ overflow: 'auto', padding: '1.5rem' }}>
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginBottom: '1.2rem' }}
                >
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <History size={24} style={{ color: '#FCD535' }} />
                        Transaction History
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Complete record of all arbitrage trades • Source-to-source execution details • P&L tracking
                    </p>
                </motion.div>

                {/* Stats Cards */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem', marginBottom: '1.2rem' }}
                    >
                        {[
                            { label: 'Total Trades', value: stats.total_trades, icon: <Layers size={16} />, color: '#FCD535' },
                            { label: 'Win Rate', value: `${stats.win_rate}%`, icon: <Target size={16} />, color: stats.win_rate >= 50 ? '#00e676' : '#ff1744' },
                            { label: 'Total P&L', value: `$${stats.total_pnl?.toFixed(2)}`, icon: <DollarSign size={16} />, color: stats.total_pnl >= 0 ? '#00e676' : '#ff1744' },
                            { label: 'Wins / Losses', value: `${stats.wins} / ${stats.losses}`, icon: <BarChart3 size={16} />, color: '#69f0ae' },
                            { label: 'Avg Confidence', value: `${stats.avg_confidence}%`, icon: <Shield size={16} />, color: '#ffab40' },
                            { label: 'Volume Traded', value: `$${stats.total_volume?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <Zap size={16} />, color: '#40c4ff' },
                            { label: 'Gas Costs', value: `$${stats.total_gas_costs?.toFixed(2)}`, icon: <Clock size={16} />, color: '#ff5252' },
                            { label: 'Avg P&L/Trade', value: `$${stats.avg_pnl_per_trade?.toFixed(4)}`, icon: <TrendingUp size={16} />, color: stats.avg_pnl_per_trade >= 0 ? '#00e676' : '#ff1744' },
                        ].map((card, i) => (
                            <motion.div
                                key={card.label}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.04 }}
                                style={{
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderRadius: '0.6rem', padding: '0.8rem 1rem',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                    <span style={{ color: card.color }}>{card.icon}</span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {card.label}
                                    </span>
                                </div>
                                <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '1.1rem', color: card.color }}>
                                    {card.value}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}

                {/* Filters & Search */}
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: '0.8rem', gap: '0.6rem', flexWrap: 'wrap',
                    }}
                >
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {[
                            { id: 'all', label: 'All Trades' },
                            { id: 'wins', label: '✅ Wins' },
                            { id: 'losses', label: '❌ Losses' },
                        ].map(f => (
                            <button key={f.id} onClick={() => setFilterType(f.id)} style={{
                                padding: '0.35rem 0.7rem', borderRadius: '0.4rem', border: 'none',
                                background: filterType === f.id ? 'rgba(252,213,53,0.15)' : 'var(--bg-card)',
                                color: filterType === f.id ? '#FCD535' : 'var(--text-muted)',
                                fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
                            }}>{f.label}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--text-muted)' }} />
                            <input
                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search trades..."
                                style={{
                                    padding: '0.35rem 0.6rem 0.35rem 1.8rem', borderRadius: '0.4rem',
                                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                                    color: '#fff', fontSize: '0.72rem', fontFamily: 'var(--mono)',
                                    outline: 'none', width: '160px',
                                }}
                            />
                        </div>
                        <button onClick={() => { fetchTrades(); fetchStats(); }} style={{
                            padding: '0.35rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border)',
                            background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem',
                        }}>
                            <RefreshCw size={12} /> Refresh
                        </button>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                            {filtered.length} trades
                        </span>
                    </div>
                </motion.div>

                {/* Trade Table */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card"
                    style={{ overflow: 'auto', padding: 0 }}
                >
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <RefreshCw size={28} style={{ animation: 'spin-slow 1.5s linear infinite', marginBottom: '0.5rem' }} />
                            <p style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>Loading trade history...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <History size={36} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                            <p style={{ fontSize: '0.85rem' }}>No trades found. The AI Agent is scanning for opportunities...</p>
                            <p style={{ fontSize: '0.7rem', marginTop: '0.3rem', fontFamily: 'var(--mono)' }}>
                                Trades will appear here as the agent executes arbitrage opportunities.
                            </p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {[
                                        { key: 'timestamp', label: 'Time' },
                                        { key: 'type', label: 'Type' },
                                        { key: 'symbols', label: 'Route' },
                                        { key: 'sources', label: 'From → To' },
                                        { key: 'position_size', label: 'Size' },
                                        { key: 'net_profit_pct', label: 'Spread' },
                                        { key: 'pnl', label: 'P&L' },
                                        { key: 'confidence', label: 'Conf.' },
                                        { key: 'won', label: 'Result' },
                                    ].map(col => (
                                        <th key={col.key}
                                            onClick={() => toggleSort(col.key)}
                                            style={{
                                                padding: '0.65rem 0.5rem', textAlign: col.key === 'timestamp' || col.key === 'type' ? 'left' : 'right',
                                                fontWeight: 700, color: sortField === col.key ? '#FCD535' : 'var(--text-muted)',
                                                fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                                                cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                {col.label} <SortIcon field={col.key} />
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((trade, i) => {
                                    const isExpanded = expandedTrade === trade.id;
                                    const symbols = trade.symbols || [];
                                    const sources = trade.sources || [];
                                    const costs = trade.cost_breakdown || {};

                                    return (
                                        <React.Fragment key={trade.id || i}>
                                            <tr
                                                onClick={() => setExpandedTrade(isExpanded ? null : trade.id)}
                                                style={{
                                                    borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.03)',
                                                    cursor: 'pointer', transition: 'background 0.15s',
                                                    background: isExpanded ? 'rgba(252,213,53,0.03)' : 'transparent',
                                                }}
                                                onMouseEnter={e => !isExpanded && (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                                onMouseLeave={e => !isExpanded && (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <td style={{ padding: '0.55rem 0.5rem', fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {formatTime(trade.timestamp)}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem' }}>
                                                    <span style={{
                                                        padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.62rem',
                                                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                                                        background: trade.type === 'triangular' ? 'rgba(255,171,64,0.12)' : 'rgba(105,240,174,0.08)',
                                                        color: trade.type === 'triangular' ? '#ffab40' : '#69f0ae',
                                                    }}>
                                                        {trade.type === 'triangular' ? '△ TRI' : '↔ CROSS'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontWeight: 700, fontSize: '0.72rem' }}>
                                                    {symbols.map((s, j) => (
                                                        <React.Fragment key={j}>
                                                            <span>{s.replace('USDT', '')}</span>
                                                            {j < symbols.length - 1 && (
                                                                <ArrowRight size={10} style={{ margin: '0 0.15rem', color: 'var(--text-muted)', verticalAlign: 'middle' }} />
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                                    {sources.length >= 2 ? (
                                                        <span>
                                                            <span style={{ fontWeight: 600 }}>{sources[0]}</span>
                                                            <ArrowRight size={10} style={{ margin: '0 0.15rem', color: '#FCD535', verticalAlign: 'middle' }} />
                                                            <span style={{ fontWeight: 600 }}>{sources[1]}</span>
                                                        </span>
                                                    ) : sources.join(', ')}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                                                    ${trade.position_size?.toFixed(0)}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: '#69f0ae' }}>
                                                    {trade.net_profit_pct?.toFixed(3)}%
                                                </td>
                                                <td style={{
                                                    padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--mono)',
                                                    fontWeight: 800, color: trade.pnl >= 0 ? '#00e676' : '#ff1744',
                                                }}>
                                                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl?.toFixed(4)}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>
                                                    {trade.confidence}%
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '0.12rem 0.35rem', borderRadius: '0.2rem', fontSize: '0.62rem', fontWeight: 800,
                                                        background: trade.won ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)',
                                                        color: trade.won ? '#00e676' : '#ff1744',
                                                    }}>
                                                        {trade.won ? 'WIN' : 'LOSS'}
                                                    </span>
                                                </td>
                                            </tr>

                                            {/* Expanded detail row */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={9} style={{ padding: 0 }}>
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                style={{
                                                                    overflow: 'hidden',
                                                                    background: 'rgba(252,213,53,0.02)',
                                                                    borderBottom: '1px solid var(--border)',
                                                                }}
                                                            >
                                                                <div style={{ padding: '0.8rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.8rem' }}>
                                                                    {/* IDs */}
                                                                    <div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 700 }}>Identifiers</div>
                                                                        <div style={{ fontSize: '0.68rem', fontFamily: 'var(--mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                                                            <div>Trade: <span style={{ color: '#fff' }}>{trade.id}</span></div>
                                                                            <div>Opp: <span style={{ color: '#fff' }}>{trade.opportunity_id}</span></div>
                                                                            <div>Decision: <span style={{ color: '#fff' }}>{trade.decision_id}</span></div>
                                                                        </div>
                                                                    </div>
                                                                    {/* Cost Breakdown */}
                                                                    <div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 700 }}>Cost Breakdown</div>
                                                                        <div style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Gas:</span>
                                                                                <span style={{ color: '#ff5252' }}>${costs.gas?.toFixed(4)}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Slippage:</span>
                                                                                <span style={{ color: '#ff5252' }}>${costs.slippage?.toFixed(4)}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Execution Decay:</span>
                                                                                <span style={{ color: '#ff5252' }}>${costs.execution_decay?.toFixed(4) || '—'}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.2rem', marginTop: '0.2rem' }}>
                                                                                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Total Costs:</span>
                                                                                <span style={{ color: '#ff5252', fontWeight: 700 }}>${costs.total_costs?.toFixed(4)}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {/* Execution Details */}
                                                                    <div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 700 }}>Execution Details</div>
                                                                        <div style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Position:</span>
                                                                                <span>${trade.position_size?.toFixed(2)}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Detected Spread:</span>
                                                                                <span style={{ color: '#69f0ae' }}>{trade.net_profit_pct?.toFixed(4)}%</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Confidence:</span>
                                                                                <span>{trade.confidence}%</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Risk Score:</span>
                                                                                <span style={{ color: trade.risk > 50 ? '#ff5252' : '#ffab40' }}>{trade.risk}/100</span>
                                                                            </div>
                                                                            {costs.market_noise_factor && (
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                    <span style={{ color: 'var(--text-muted)' }}>Noise Factor:</span>
                                                                                    <span>{costs.market_noise_factor?.toFixed(3)}x</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {/* P&L Summary */}
                                                                    <div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem', fontWeight: 700 }}>P&L Summary</div>
                                                                        <div style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Gross P&L:</span>
                                                                                <span style={{ color: (costs.gross_pnl || 0) >= 0 ? '#00e676' : '#ff1744' }}>
                                                                                    ${costs.gross_pnl?.toFixed(4) || '—'}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                <span style={{ color: 'var(--text-muted)' }}>Costs Deducted:</span>
                                                                                <span style={{ color: '#ff5252' }}>-${costs.total_costs?.toFixed(4)}</span>
                                                                            </div>
                                                                            <div style={{
                                                                                display: 'flex', justifyContent: 'space-between',
                                                                                borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.3rem', marginTop: '0.3rem',
                                                                            }}>
                                                                                <span style={{ fontWeight: 800 }}>Net P&L:</span>
                                                                                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: trade.pnl >= 0 ? '#00e676' : '#ff1744' }}>
                                                                                    {trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(4)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </AnimatePresence>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </motion.div>
            </main>
        </div>
    );
};

export default HistoryPage;
