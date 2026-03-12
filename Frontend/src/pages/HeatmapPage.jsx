import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Grid3X3, TrendingUp, Activity, Zap, RefreshCw, ArrowRight,
    Eye, Layers, BarChart3, Clock, Wifi, WifiOff, Target, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Color utilities ──
const getSpreadColor = (spreadPct) => {
    if (spreadPct <= 0) return 'rgba(255,255,255,0.03)';
    if (spreadPct < 0.02) return 'rgba(64,196,255,0.12)';
    if (spreadPct < 0.05) return 'rgba(64,196,255,0.25)';
    if (spreadPct < 0.1) return 'rgba(105,240,174,0.2)';
    if (spreadPct < 0.2) return 'rgba(252,213,53,0.2)';
    if (spreadPct < 0.4) return 'rgba(252,213,53,0.35)';
    if (spreadPct < 0.8) return 'rgba(255,171,64,0.35)';
    return 'rgba(255,23,68,0.35)';
};

const getSpreadBorder = (spreadPct) => {
    if (spreadPct <= 0) return 'rgba(255,255,255,0.04)';
    if (spreadPct < 0.05) return 'rgba(64,196,255,0.2)';
    if (spreadPct < 0.1) return 'rgba(105,240,174,0.25)';
    if (spreadPct < 0.2) return 'rgba(252,213,53,0.3)';
    if (spreadPct < 0.4) return 'rgba(252,213,53,0.45)';
    if (spreadPct < 0.8) return 'rgba(255,171,64,0.45)';
    return 'rgba(255,23,68,0.5)';
};

const getSpreadTextColor = (spreadPct) => {
    if (spreadPct <= 0) return 'var(--text-muted)';
    if (spreadPct < 0.05) return '#40c4ff';
    if (spreadPct < 0.1) return '#69f0ae';
    if (spreadPct < 0.3) return '#FCD535';
    if (spreadPct < 0.8) return '#ffab40';
    return '#ff5252';
};

const COINS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'];
const COIN_LABELS = {
    BTCUSDT: 'BTC', ETHUSDT: 'ETH', BNBUSDT: 'BNB', SOLUSDT: 'SOL', XRPUSDT: 'XRP',
    DOGEUSDT: 'DOGE', ADAUSDT: 'ADA', AVAXUSDT: 'AVAX', DOTUSDT: 'DOT', MATICUSDT: 'MATIC',
};
const COIN_ICONS = {
    BTCUSDT: '₿', ETHUSDT: 'Ξ', BNBUSDT: '◆', SOLUSDT: '◎', XRPUSDT: '✕',
    DOGEUSDT: 'Ð', ADAUSDT: '₳', AVAXUSDT: '▲', DOTUSDT: '●', MATICUSDT: '⬡',
};
const SOURCES = ['binance', 'coingecko', 'pancakeswap', 'jupiter', '1inch'];

// Generate all unique source pairs
const SOURCE_PAIRS = [];
for (let i = 0; i < SOURCES.length; i++) {
    for (let j = i + 1; j < SOURCES.length; j++) {
        SOURCE_PAIRS.push([SOURCES[i], SOURCES[j]]);
    }
}

const HeatmapPage = () => {
    const navigate = useNavigate();
    const [matrix, setMatrix] = useState({});
    const [spreads, setSpreads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [hoveredCell, setHoveredCell] = useState(null);
    const [selectedCoin, setSelectedCoin] = useState(null);
    const [wsConnected, setWsConnected] = useState(false);
    const wsRef = useRef(null);
    const tooltipRef = useRef(null);

    // ── Fetch data ──
    const fetchData = useCallback(async () => {
        try {
            const [matrixRes, spreadsRes] = await Promise.allSettled([
                fetch(`${API}/api/prices/matrix`),
                fetch(`${API}/api/prices/spreads`),
            ]);
            if (matrixRes.status === 'fulfilled') {
                const d = await matrixRes.value.json();
                setMatrix(d.matrix || {});
            }
            if (spreadsRes.status === 'fulfilled') {
                const d = await spreadsRes.value.json();
                setSpreads(d.spreads || []);
            }
            setLastUpdate(new Date());
            setLoading(false);
        } catch (e) {
            console.error('Heatmap fetch error:', e);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // ── WebSocket for live spread updates ──
    useEffect(() => {
        let isMounted = true;
        const connect = () => {
            if (!isMounted) return;
            try {
                const wsBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
                const ws = new WebSocket(`${wsBase}/ws/spreads`);
                ws.onopen = () => { if (isMounted) setWsConnected(true); };
                ws.onclose = () => {
                    if (isMounted) {
                        setWsConnected(false);
                        setTimeout(connect, 5000);
                    }
                };
                ws.onerror = () => { };
                ws.onmessage = (e) => {
                    try {
                        const msg = JSON.parse(e.data);
                        if (msg.type === 'spreads' && msg.spreads) {
                            setSpreads(msg.spreads);
                            setLastUpdate(new Date());
                        }
                    } catch { }
                };
                wsRef.current = ws;
            } catch { }
        };
        connect();
        return () => {
            isMounted = false;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
        };
    }, []);

    // ── Build the heatmap grid data ──
    const buildGrid = () => {
        const grid = {};
        COINS.forEach(coin => {
            grid[coin] = {};
            SOURCE_PAIRS.forEach(([s1, s2]) => {
                const pairKey = `${s1}↔${s2}`;
                const p1 = matrix[coin]?.[s1]?.price;
                const p2 = matrix[coin]?.[s2]?.price;
                if (p1 && p2 && p1 > 0 && p2 > 0) {
                    const spreadPct = Math.abs(p1 - p2) / Math.min(p1, p2) * 100;
                    const buyOn = p1 < p2 ? s1 : s2;
                    const sellOn = p1 < p2 ? s2 : s1;
                    grid[coin][pairKey] = {
                        spreadPct: spreadPct > 10 ? 0 : spreadPct, // cap noise
                        priceA: p1,
                        priceB: p2,
                        sourceA: s1,
                        sourceB: s2,
                        buyOn,
                        sellOn,
                        buyPrice: Math.min(p1, p2),
                        sellPrice: Math.max(p1, p2),
                    };
                } else {
                    grid[coin][pairKey] = null;
                }
            });
        });
        return grid;
    };

    const gridData = buildGrid();

    // ── Stats ──
    const allCells = Object.values(gridData).flatMap(row =>
        Object.values(row).filter(Boolean)
    );
    const activeSpreads = allCells.filter(c => c.spreadPct > 0);
    const avgSpread = activeSpreads.length > 0
        ? activeSpreads.reduce((s, c) => s + c.spreadPct, 0) / activeSpreads.length
        : 0;
    const bestSpread = activeSpreads.length > 0
        ? activeSpreads.reduce((best, c) => c.spreadPct > best.spreadPct ? c : best)
        : null;
    const onlineSources = [...new Set(
        Object.values(matrix).flatMap(sources => Object.keys(sources))
    )].length;

    // ── Top opportunities from spreads data ──
    const topOpps = spreads.slice(0, 8);

    return (
        <div className="dashboard-layout">
            <Sidebar active="heatmap" />

            <main className="dashboard-main" style={{ padding: '1.5rem', overflow: 'auto', flex: 1, minWidth: 0 }}>
                {/* ── Header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                            <Grid3X3 size={24} style={{ marginRight: 8, color: '#FCD535', verticalAlign: 'middle' }} />
                            Spread Heatmap
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
                            Real-time cross-source spread matrix • {COINS.length} coins × {SOURCE_PAIRS.length} exchange pairs
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.8rem', borderRadius: '0.5rem',
                            background: wsConnected ? 'rgba(105,240,174,0.08)' : 'rgba(255,82,82,0.08)',
                            border: `1px solid ${wsConnected ? 'rgba(105,240,174,0.2)' : 'rgba(255,82,82,0.2)'}`,
                        }}>
                            {wsConnected ? <Wifi size={14} style={{ color: '#69f0ae' }} /> : <WifiOff size={14} style={{ color: '#ff5252' }} />}
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: wsConnected ? '#69f0ae' : '#ff5252' }}>
                                {wsConnected ? 'LIVE' : 'POLLING'}
                            </span>
                        </div>
                        <button onClick={fetchData} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            color: 'var(--text-secondary)', padding: '0.4rem 0.8rem', borderRadius: '0.5rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                            fontSize: '0.78rem', fontWeight: 600,
                        }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
                </div>

                {/* ── Stats Strip ── */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '0.8rem', marginBottom: '1.2rem',
                }}>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem' }}>ACTIVE SPREADS</div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)', color: '#40c4ff' }}>
                            {activeSpreads.length}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>of {allCells.length} pairs</div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem' }}>AVG SPREAD</div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)', color: '#FCD535' }}>
                            {avgSpread.toFixed(4)}%
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>across all pairs</div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem' }}>BEST OPPORTUNITY</div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)', color: '#69f0ae' }}>
                            {bestSpread ? `${bestSpread.spreadPct.toFixed(4)}%` : '—'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {bestSpread ? `${bestSpread.buyOn} → ${bestSpread.sellOn}` : 'scanning...'}
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem' }}>SOURCES ONLINE</div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)', color: onlineSources >= 4 ? '#69f0ae' : '#ffab40' }}>
                            {onlineSources}/{SOURCES.length}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>oracle feeds active</div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem' }}>LAST UPDATE</div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--mono)', color: '#fff' }}>
                            {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>auto-refresh 5s</div>
                    </div>
                </div>

                {/* ── Legend ── */}
                <div className="glass-card" style={{ padding: '0.8rem 1rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>SPREAD INTENSITY:</span>
                    {[
                        { label: '< 0.02%', color: 'rgba(64,196,255,0.12)', border: 'rgba(64,196,255,0.2)', text: '#40c4ff' },
                        { label: '0.02-0.05%', color: 'rgba(64,196,255,0.25)', border: 'rgba(64,196,255,0.3)', text: '#40c4ff' },
                        { label: '0.05-0.1%', color: 'rgba(105,240,174,0.2)', border: 'rgba(105,240,174,0.3)', text: '#69f0ae' },
                        { label: '0.1-0.2%', color: 'rgba(252,213,53,0.2)', border: 'rgba(252,213,53,0.3)', text: '#FCD535' },
                        { label: '0.2-0.4%', color: 'rgba(252,213,53,0.35)', border: 'rgba(252,213,53,0.45)', text: '#FCD535' },
                        { label: '0.4-0.8%', color: 'rgba(255,171,64,0.35)', border: 'rgba(255,171,64,0.45)', text: '#ffab40' },
                        { label: '> 0.8%', color: 'rgba(255,23,68,0.35)', border: 'rgba(255,23,68,0.5)', text: '#ff5252' },
                    ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <div style={{
                                width: 14, height: 14, borderRadius: '3px',
                                background: item.color, border: `1px solid ${item.border}`,
                            }} />
                            <span style={{ fontSize: '0.68rem', color: item.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>{item.label}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
                        <div style={{
                            width: 14, height: 14, borderRadius: '3px',
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        }} />
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontWeight: 600 }}>No Data</span>
                    </div>
                </div>

                {/* ── Main Content Grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>

                    {/* ── Heatmap Grid ── */}
                    <div className="glass-card" style={{ padding: '1.2rem', overflow: 'auto' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={16} style={{ color: '#FCD535' }} /> Price Spread Matrix
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 'auto' }}>
                                Hover for details • Click to highlight coin
                            </span>
                        </h3>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={32} style={{ opacity: 0.3, marginBottom: '0.5rem', animation: 'spin-slow 2s linear infinite' }} />
                                <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Loading price matrix...</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto', position: 'relative' }}>
                                <table className="heatmap-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px', minWidth: '700px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{
                                                padding: '0.5rem', fontSize: '0.7rem', fontWeight: 700,
                                                color: 'var(--text-muted)', textAlign: 'left', whiteSpace: 'nowrap',
                                                position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 2,
                                            }}>
                                                COIN
                                            </th>
                                            {SOURCE_PAIRS.map(([s1, s2], i) => (
                                                <th key={i} style={{
                                                    padding: '0.4rem 0.3rem', fontSize: '0.58rem', fontWeight: 700,
                                                    color: 'var(--text-muted)', textAlign: 'center', whiteSpace: 'nowrap',
                                                    textTransform: 'uppercase', letterSpacing: '0.02em',
                                                }}>
                                                    <div style={{ lineHeight: 1.3 }}>
                                                        <div>{s1.slice(0, 4)}</div>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem' }}>↕</div>
                                                        <div>{s2.slice(0, 4)}</div>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {COINS.map(coin => {
                                            const isSelected = selectedCoin === coin;
                                            return (
                                                <tr key={coin} onClick={() => setSelectedCoin(prev => prev === coin ? null : coin)}>
                                                    <td style={{
                                                        padding: '0.5rem 0.6rem', fontSize: '0.78rem', fontWeight: 700,
                                                        whiteSpace: 'nowrap', cursor: 'pointer',
                                                        position: 'sticky', left: 0, zIndex: 2,
                                                        background: isSelected ? 'rgba(252,213,53,0.08)' : 'var(--bg-card)',
                                                        borderLeft: isSelected ? '3px solid #FCD535' : '3px solid transparent',
                                                        transition: 'all 0.2s',
                                                    }}>
                                                        <span style={{ marginRight: '0.4rem', fontSize: '0.9rem' }}>{COIN_ICONS[coin]}</span>
                                                        {COIN_LABELS[coin]}
                                                    </td>
                                                    {SOURCE_PAIRS.map(([s1, s2], j) => {
                                                        const pairKey = `${s1}↔${s2}`;
                                                        const cell = gridData[coin]?.[pairKey];
                                                        const isHovered = hoveredCell?.coin === coin && hoveredCell?.pair === pairKey;
                                                        const spreadPct = cell?.spreadPct || 0;

                                                        return (
                                                            <td
                                                                key={j}
                                                                className={`heatmap-cell ${spreadPct > 0.2 ? 'heatmap-cell-hot' : ''}`}
                                                                onMouseEnter={(e) => {
                                                                    setHoveredCell({ coin, pair: pairKey, cell, x: e.clientX, y: e.clientY });
                                                                }}
                                                                onMouseLeave={() => setHoveredCell(null)}
                                                                style={{
                                                                    padding: '0.4rem',
                                                                    textAlign: 'center',
                                                                    background: cell ? getSpreadColor(spreadPct) : 'rgba(255,255,255,0.015)',
                                                                    border: `1px solid ${cell ? getSpreadBorder(spreadPct) : 'rgba(255,255,255,0.04)'}`,
                                                                    borderRadius: '4px',
                                                                    cursor: cell ? 'crosshair' : 'default',
                                                                    transition: 'all 0.3s ease',
                                                                    transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                                                                    zIndex: isHovered ? 10 : 1,
                                                                    position: 'relative',
                                                                    boxShadow: isHovered && cell
                                                                        ? `0 0 12px ${getSpreadBorder(spreadPct)}`
                                                                        : 'none',
                                                                    minWidth: '52px',
                                                                }}
                                                            >
                                                                {cell ? (
                                                                    <span style={{
                                                                        fontSize: '0.68rem',
                                                                        fontFamily: 'var(--mono)',
                                                                        fontWeight: 700,
                                                                        color: getSpreadTextColor(spreadPct),
                                                                    }}>
                                                                        {spreadPct < 0.001 ? '—' : spreadPct.toFixed(3)}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.15)' }}>·</span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ── Right Panel: Top Opportunities + Details ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Top Opportunities */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Target size={16} style={{ color: '#69f0ae' }} /> Top Spreads
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {topOpps.map((s, i) => {
                                    const intensity = Math.min(s.spread_pct / 0.5, 1);
                                    return (
                                        <motion.div
                                            key={`${s.symbol}-${s.source_a}-${s.source_b}-${i}`}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            style={{
                                                padding: '0.65rem 0.8rem',
                                                borderRadius: '0.5rem',
                                                background: `rgba(${Math.round(255 * intensity)}, ${Math.round(215 * (1 - intensity))}, 53, ${0.06 + intensity * 0.12})`,
                                                border: `1px solid rgba(${Math.round(255 * intensity)}, ${Math.round(215 * (1 - intensity))}, 53, ${0.1 + intensity * 0.15})`,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                            }}
                                            whileHover={{ scale: 1.02, x: 4 }}
                                            onClick={() => setSelectedCoin(s.symbol)}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                                                        {s.symbol?.replace('USDT', '')}
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginLeft: '0.5rem' }}>
                                                        {s.source_a} ↔ {s.source_b}
                                                    </span>
                                                </div>
                                                <span style={{
                                                    fontWeight: 800, fontSize: '0.85rem',
                                                    fontFamily: 'var(--mono)',
                                                    color: getSpreadTextColor(s.spread_pct),
                                                }}>
                                                    {s.spread_pct?.toFixed(4)}%
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                                                    ${s.buy_price?.toLocaleString(undefined, { maximumFractionDigits: 4 })} → ${s.sell_price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </span>
                                                <span style={{ fontSize: '0.62rem', color: '#69f0ae', fontWeight: 600 }}>
                                                    +${s.gross_profit_per_1000?.toFixed(2)}/1k
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                                {topOpps.length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.85rem' }}>
                                        Scanning for spreads...
                                    </div>
                                )}
                            </div>
                            <Link to="/agent" style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                marginTop: '1rem', padding: '0.6rem', borderRadius: '0.5rem',
                                background: 'linear-gradient(135deg, rgba(252,213,53,0.08), rgba(252,213,53,0.02))',
                                border: '1px solid rgba(252,213,53,0.15)',
                                color: '#FCD535', fontSize: '0.78rem', fontWeight: 700,
                                textDecoration: 'none', transition: 'all 0.2s',
                            }}>
                                <Zap size={14} /> View AI Agent <ChevronRight size={14} />
                            </Link>
                        </div>

                        {/* Selected Coin Detail */}
                        <AnimatePresence>
                            {selectedCoin && matrix[selectedCoin] && (
                                <motion.div
                                    className="glass-card"
                                    initial={{ opacity: 0, y: 20, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0, y: 20, height: 0 }}
                                    style={{ padding: '1.2rem', overflow: 'hidden' }}
                                >
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Eye size={16} style={{ color: '#40c4ff' }} />
                                        <span style={{ fontSize: '1.1rem' }}>{COIN_ICONS[selectedCoin]}</span>
                                        {COIN_LABELS[selectedCoin]} Price Detail
                                        <button
                                            onClick={() => setSelectedCoin(null)}
                                            style={{
                                                marginLeft: 'auto', background: 'none', border: 'none',
                                                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem',
                                            }}
                                        >×</button>
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {Object.entries(matrix[selectedCoin] || {}).map(([source, data]) => (
                                            <div key={source} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '0.5rem 0.6rem', borderRadius: '0.4rem',
                                                background: 'rgba(255,255,255,0.03)',
                                            }}>
                                                <div>
                                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', textTransform: 'capitalize' }}>{source}</span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontWeight: 800, fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
                                                        ${data.price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                    </div>
                                                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                                                        bid: ${data.bid?.toLocaleString(undefined, { maximumFractionDigits: 2 })} • ask: ${data.ask?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {Object.keys(matrix[selectedCoin] || {}).length === 0 && (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                                                No price data for {COIN_LABELS[selectedCoin]}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Spread Distribution */}
                        <div className="glass-card" style={{ padding: '1.2rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <BarChart3 size={16} style={{ color: '#b388ff' }} /> Distribution
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {[
                                    { range: '> 0.5%', min: 0.5, color: '#ff5252' },
                                    { range: '0.2 - 0.5%', min: 0.2, max: 0.5, color: '#ffab40' },
                                    { range: '0.1 - 0.2%', min: 0.1, max: 0.2, color: '#FCD535' },
                                    { range: '0.05 - 0.1%', min: 0.05, max: 0.1, color: '#69f0ae' },
                                    { range: '< 0.05%', max: 0.05, color: '#40c4ff' },
                                ].map((bucket, i) => {
                                    const count = activeSpreads.filter(c => {
                                        if (bucket.min != null && bucket.max != null)
                                            return c.spreadPct >= bucket.min && c.spreadPct < bucket.max;
                                        if (bucket.min != null) return c.spreadPct >= bucket.min;
                                        return c.spreadPct < bucket.max;
                                    }).length;
                                    const pct = activeSpreads.length > 0 ? (count / activeSpreads.length) * 100 : 0;
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--mono)', color: bucket.color, fontWeight: 600 }}>
                                                    {bucket.range}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                                                    {count}
                                                </span>
                                            </div>
                                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.1 }}
                                                    style={{
                                                        height: '100%', borderRadius: '3px',
                                                        background: `linear-gradient(90deg, ${bucket.color}88, ${bucket.color})`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Floating Tooltip ── */}
                <AnimatePresence>
                    {hoveredCell?.cell && (
                        <motion.div
                            ref={tooltipRef}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            style={{
                                position: 'fixed',
                                top: (hoveredCell.y || 0) - 140,
                                left: (hoveredCell.x || 0) + 16,
                                zIndex: 1000,
                                background: 'rgba(12,12,16,0.96)',
                                border: '1px solid rgba(252,213,53,0.2)',
                                borderRadius: '0.6rem',
                                padding: '0.9rem 1.1rem',
                                backdropFilter: 'blur(20px)',
                                minWidth: '240px',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                pointerEvents: 'none',
                            }}
                        >
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontSize: '1rem' }}>{COIN_ICONS[hoveredCell.coin]}</span>
                                {COIN_LABELS[hoveredCell.coin]}
                                <span style={{ color: getSpreadTextColor(hoveredCell.cell.spreadPct), fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
                                    {hoveredCell.cell.spreadPct.toFixed(4)}%
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{hoveredCell.cell.sourceA}</span>
                                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>${hoveredCell.cell.priceA?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{hoveredCell.cell.sourceB}</span>
                                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>${hoveredCell.cell.priceB?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.35rem', marginTop: '0.15rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#69f0ae', fontWeight: 700 }}>
                                        <ArrowRight size={12} />
                                        BUY on <span style={{ textTransform: 'capitalize' }}>{hoveredCell.cell.buyOn}</span> → SELL on <span style={{ textTransform: 'capitalize' }}>{hoveredCell.cell.sellOn}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default HeatmapPage;
