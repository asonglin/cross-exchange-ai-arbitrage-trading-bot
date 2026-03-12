import { AnimatePresence, motion } from 'framer-motion';
import { ColorType, createChart } from 'lightweight-charts';
import { BarChart3, Eye, RefreshCw, Search, TrendingDown, TrendingUp, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SOURCE_COLORS = {
    binance: '#F0B90B',
    coingecko: '#8DC63F',
    pancakeswap: '#D1884F',
    jupiter: '#00E4A0',
    oneinch: '#1B314F',
};
const SOURCE_LABELS = {
    binance: 'Binance',
    coingecko: 'CoinGecko',
    pancakeswap: 'PancakeSwap',
    jupiter: 'Jupiter',
    oneinch: '1inch',
};

const CoinsPage = () => {
    const [hotCoins, setHotCoins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCoin, setSelectedCoin] = useState(null);
    const [multiPrices, setMultiPrices] = useState(null);
    const [spreads, setSpreads] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [modalChartType, setModalChartType] = useState('area');
    const [modalInterval, setModalInterval] = useState('5m');
    const [modalChartLoading, setModalChartLoading] = useState(false);
    const modalChartContainerRef = useRef();
    const modalChartRef = useRef();
    const modalSeriesRef = useRef();

    useEffect(() => {
        const fetchHotCoins = async () => {
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
                const data = await res.json();
                const usdtPairs = data
                    .filter(d => d.symbol.endsWith('USDT'))
                    .sort((a, b) => b.quoteVolume - a.quoteVolume)
                    .slice(0, 24);
                setHotCoins(usdtPairs);
                setLoading(false);
            } catch (err) { console.error("Hot coins fetch error:", err); }
        };
        fetchHotCoins();
        const interval = setInterval(fetchHotCoins, 10000);
        return () => clearInterval(interval);
    }, []);

    // Fetch spreads
    useEffect(() => {
        const fetchSpreads = async () => {
            try {
                const res = await fetch(`${API}/api/prices/spreads`);
                const data = await res.json();
                setSpreads(data.spreads || []);
            } catch (e) { console.error(e); }
        };
        fetchSpreads();
        const iv = setInterval(fetchSpreads, 8000);
        return () => clearInterval(iv);
    }, []);

    const openDetail = async (symbol) => {
        setSelectedCoin(symbol);
        try {
            const res = await fetch(`${API}/api/prices/multi/${symbol}`);
            const data = await res.json();
            setMultiPrices(data);
        } catch (e) {
            console.error('Multi price fetch:', e);
            setMultiPrices(null);
        }
    };

    // Build chart inside modal when selectedCoin, chartType, or interval changes
    useEffect(() => {
        if (!selectedCoin || !modalChartContainerRef.current) return;

        // Small delay to let the modal DOM render
        const timer = setTimeout(() => {
            if (!modalChartContainerRef.current) return;

            // Destroy old chart
            if (modalChartRef.current) {
                try { modalChartRef.current.remove(); } catch (e) { }
                modalChartRef.current = null;
                modalSeriesRef.current = null;
            }

            const container = modalChartContainerRef.current;
            let chart;
            try {
                chart = createChart(container, {
                    layout: { background: { type: ColorType.Solid, color: '#111118' }, textColor: '#5a5a6e' },
                    grid: { vertLines: { color: 'rgba(255,255,255,0.02)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
                    width: container.clientWidth,
                    height: 280,
                    timeScale: { timeVisible: true, secondsVisible: false, borderColor: 'rgba(255,255,255,0.05)' },
                    rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)' },
                    crosshair: {
                        vertLine: { color: 'rgba(252,213,53,0.3)', labelBackgroundColor: '#FCD535' },
                        horzLine: { color: 'rgba(252,213,53,0.3)', labelBackgroundColor: '#FCD535' },
                    },
                });
            } catch (e) {
                console.error('Modal chart error:', e);
                return;
            }

            let series;
            if (modalChartType === 'candlestick') {
                series = chart.addCandlestickSeries({
                    upColor: '#00e676',
                    downColor: '#ff1744',
                    borderUpColor: '#00e676',
                    borderDownColor: '#ff1744',
                    wickUpColor: '#00e676',
                    wickDownColor: '#ff1744',
                });
            } else {
                series = chart.addAreaSeries({
                    lineColor: '#FCD535',
                    topColor: 'rgba(252, 213, 53, 0.15)',
                    bottomColor: 'rgba(252, 213, 53, 0)',
                    lineWidth: 2,
                });
            }

            modalSeriesRef.current = series;
            modalChartRef.current = chart;

            // Fetch 24h data
            const cType = modalChartType;
            setModalChartLoading(true);

            const loadData = async () => {
                const offset = 5.5 * 3600; // IST offset
                try {
                    const res = await fetch(`${API}/api/prices/chart/${selectedCoin}?interval=${modalInterval}&hours=24`);
                    const data = await res.json();
                    if (data && data.klines && data.klines.length > 0 && series) {
                        if (cType === 'candlestick') {
                            series.setData(data.klines.map(k => ({
                                time: Math.floor(k.time / 1000) + offset,
                                open: k.open, high: k.high, low: k.low, close: k.close,
                            })));
                        } else {
                            series.setData(data.klines.map(k => ({
                                time: Math.floor(k.time / 1000) + offset,
                                value: k.close,
                            })));
                        }
                    }
                } catch (err) {
                    console.error('Modal chart fetch error, using Binance fallback:', err);
                    try {
                        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${selectedCoin}&interval=${modalInterval}&limit=288`);
                        const data = await res.json();
                        if (Array.isArray(data) && series) {
                            if (cType === 'candlestick') {
                                series.setData(data.map(d => ({
                                    time: Math.floor(d[0] / 1000) + offset,
                                    open: parseFloat(d[1]), high: parseFloat(d[2]),
                                    low: parseFloat(d[3]), close: parseFloat(d[4]),
                                })));
                            } else {
                                series.setData(data.map(d => ({
                                    time: Math.floor(d[0] / 1000) + offset,
                                    value: parseFloat(d[4]),
                                })));
                            }
                        }
                    } catch (e2) {
                        console.error('Modal chart fallback error:', e2);
                    }
                }
                setModalChartLoading(false);
            };
            loadData();

            const handleResize = () => {
                if (container && chart) {
                    try { chart.applyOptions({ width: container.clientWidth }); } catch (e) { }
                }
            };
            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
            };
        }, 100);

        return () => {
            clearTimeout(timer);
            if (modalChartRef.current) {
                try { modalChartRef.current.remove(); } catch (e) { }
                modalChartRef.current = null;
                modalSeriesRef.current = null;
            }
        };
    }, [selectedCoin, modalChartType, modalInterval]);

    const filteredCoins = hotCoins.filter(c =>
        c.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const topSpreads = spreads.filter(s => s.spread_pct > 0.01).slice(0, 8);

    return (
        <div className="dashboard-layout">
            <Sidebar active="coins" />

            <main className="main-view" style={{ overflow: 'auto', padding: '1.5rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.3rem' }}>
                            <BarChart3 size={24} style={{ marginRight: 8, color: '#FCD535', verticalAlign: 'middle' }} />
                            Global Markets
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                            Top 24 pairs by volume • 5-source comparison • Live spreads
                        </p>
                    </motion.div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {/* Search */}
                        <div style={{
                            position: 'relative', display: 'flex', alignItems: 'center',
                        }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
                            <input
                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search..."
                                style={{
                                    padding: '0.4rem 0.6rem 0.4rem 2rem', borderRadius: '0.4rem',
                                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                                    color: '#fff', fontSize: '0.78rem', outline: 'none', width: '140px',
                                    fontFamily: 'var(--mono)',
                                }}
                            />
                        </div>
                        {/* View toggle */}
                        {['grid', 'table'].map(mode => (
                            <button key={mode} onClick={() => setViewMode(mode)} style={{
                                padding: '0.4rem 0.7rem', borderRadius: '0.4rem', border: 'none',
                                background: viewMode === mode ? '#FCD535' : 'var(--bg-card)',
                                color: viewMode === mode ? '#000' : 'var(--text-secondary)',
                                fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', textTransform: 'capitalize',
                            }}>
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Live Spread Ticker */}
                {topSpreads.length > 0 && (
                    <div style={{
                        display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem',
                        marginBottom: '1rem', scrollbarWidth: 'none',
                    }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#FCD535', padding: '0.4rem 0.6rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Zap size={12} /> LIVE SPREADS
                        </div>
                        {topSpreads.map((s, i) => (
                            <motion.div key={i}
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => openDetail(s.symbol)}
                                style={{
                                    padding: '0.35rem 0.6rem', borderRadius: '0.35rem', whiteSpace: 'nowrap',
                                    background: 'rgba(252,213,53,0.06)', border: '1px solid rgba(252,213,53,0.1)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    fontSize: '0.72rem',
                                }}
                            >
                                <span style={{ fontWeight: 700 }}>{s.symbol?.replace('USDT', '')}</span>
                                <span style={{ color: '#69f0ae', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                                    {(s.spread_pct || 0).toFixed(3)}%
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>
                                    {s.source_low} → {s.source_high}
                                </span>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* ═══ GRID VIEW ═══ */}
                {viewMode === 'grid' && (
                    <div className="glass-grid">
                        {loading ? (
                            <div className="loading-spinner" style={{ gridColumn: '1 / -1' }}>
                                <RefreshCw size={36} style={{ color: '#FCD535', animation: 'spin-slow 1.5s linear infinite' }} />
                                <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>Synchronizing...</p>
                            </div>
                        ) : (
                            filteredCoins.map((coin, i) => {
                                const change = parseFloat(coin.priceChangePercent);
                                const coinSpread = spreads.find(s => s.symbol === coin.symbol);
                                return (
                                    <motion.div
                                        key={coin.symbol}
                                        className="coin-card"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.02 }}
                                        whileHover={{ scale: 1.02 }}
                                        onClick={() => openDetail(coin.symbol)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <span style={{ fontWeight: 800, fontSize: '1rem' }}>{coin.symbol.replace('USDT', '')}</span>
                                            <span style={{
                                                color: change >= 0 ? '#00e676' : '#ff1744',
                                                fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--mono)',
                                                display: 'flex', alignItems: 'center', gap: '0.2rem',
                                            }}>
                                                {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--mono)', marginBottom: '0.25rem' }}>
                                            ${parseFloat(coin.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontFamily: 'var(--mono)' }}>
                                                Vol: {(parseFloat(coin.quoteVolume) / 1e6).toFixed(1)}M
                                            </span>
                                            {coinSpread && coinSpread.spread_pct > 0.01 && (
                                                <span style={{
                                                    fontSize: '0.62rem', fontFamily: 'var(--mono)', fontWeight: 700,
                                                    color: '#69f0ae', background: 'rgba(105,240,174,0.08)',
                                                    padding: '0.1rem 0.3rem', borderRadius: '0.2rem',
                                                }}>
                                                    Δ{coinSpread.spread_pct.toFixed(3)}%
                                                </span>
                                            )}
                                        </div>
                                        {/* Mini source bar */}
                                        <div style={{ display: 'flex', gap: '2px', marginTop: '0.4rem' }}>
                                            {Object.keys(SOURCE_COLORS).map(src => (
                                                <div key={src} style={{
                                                    flex: 1, height: 3, borderRadius: 2,
                                                    background: `${SOURCE_COLORS[src]}60`,
                                                }} />
                                            ))}
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ═══ TABLE VIEW ═══ */}
                {viewMode === 'table' && !loading && (
                    <div className="glass-card" style={{ overflow: 'auto', padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['#', 'Symbol', 'Price', '24h Change', 'Volume', 'High', 'Low', 'Spread', ''].map((h, i) => (
                                        <th key={i} style={{
                                            padding: '0.7rem 0.6rem', textAlign: i < 2 ? 'left' : 'right',
                                            fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.68rem',
                                            textTransform: 'uppercase', letterSpacing: '0.05em',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCoins.map((coin, i) => {
                                    const change = parseFloat(coin.priceChangePercent);
                                    const coinSpread = spreads.find(s => s.symbol === coin.symbol);
                                    return (
                                        <tr key={coin.symbol}
                                            onClick={() => openDetail(coin.symbol)}
                                            style={{
                                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                cursor: 'pointer', transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(252,213,53,0.03)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: '0.7rem' }}>{i + 1}</td>
                                            <td style={{ padding: '0.6rem', fontWeight: 800 }}>{coin.symbol.replace('USDT', '')}<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/USDT</span></td>
                                            <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                                                ${parseFloat(coin.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </td>
                                            <td style={{
                                                padding: '0.6rem', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700,
                                                color: change >= 0 ? '#00e676' : '#ff1744',
                                            }}>
                                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-secondary)' }}>
                                                ${(parseFloat(coin.quoteVolume) / 1e6).toFixed(1)}M
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                                                ${parseFloat(coin.highPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                                                ${parseFloat(coin.lowPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                                                {coinSpread && coinSpread.spread_pct > 0.01 ? (
                                                    <span style={{
                                                        fontFamily: 'var(--mono)', fontWeight: 700, color: '#69f0ae',
                                                        fontSize: '0.72rem',
                                                    }}>
                                                        {coinSpread.spread_pct.toFixed(3)}%
                                                    </span>
                                                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                                                <Eye size={13} style={{ color: 'var(--text-muted)' }} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ═══ DETAIL MODAL ═══ */}
                <AnimatePresence>
                    {selectedCoin && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                                backdropFilter: 'blur(8px)', zIndex: 9999,
                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                padding: '1.5rem',
                            }}
                            onClick={() => { setSelectedCoin(null); setMultiPrices(null); }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    background: 'var(--bg-card)', borderRadius: '1rem',
                                    border: '1px solid var(--border)', width: '100%', maxWidth: '720px',
                                    padding: '1.5rem', position: 'relative', maxHeight: '90vh', overflowY: 'auto',
                                    boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
                                }}
                            >
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
                                            {selectedCoin.replace('USDT', '')}<span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.9rem' }}>/USDT</span>
                                        </h2>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', margin: '0.2rem 0 0' }}>
                                            5-Source Price Comparison
                                        </p>
                                    </div>
                                    <button onClick={() => { setSelectedCoin(null); setMultiPrices(null); }} style={{
                                        background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '50%',
                                        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', color: '#fff',
                                    }}>
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* ═══ 24H CHART ═══ */}
                                <div style={{
                                    marginBottom: '1rem', background: '#111118',
                                    borderRadius: '0.6rem', border: '1px solid var(--border)',
                                    overflow: 'hidden',
                                }}>
                                    {/* Chart toolbar */}
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '0.5rem 0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                                            {['area', 'candlestick'].map(ct => (
                                                <button key={ct} onClick={() => setModalChartType(ct)} style={{
                                                    padding: '0.25rem 0.55rem', borderRadius: '0.3rem', border: 'none',
                                                    background: modalChartType === ct ? 'rgba(252,213,53,0.15)' : 'transparent',
                                                    color: modalChartType === ct ? '#FCD535' : 'var(--text-muted)',
                                                    fontWeight: 700, fontSize: '0.68rem', cursor: 'pointer',
                                                    textTransform: 'capitalize',
                                                }}>{ct}</button>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                            {modalChartLoading && (
                                                <span style={{ fontSize: '0.62rem', color: '#FCD535', marginRight: '0.3rem' }}>Loading 24h...</span>
                                            )}
                                            {['1m', '5m', '15m', '1h', '4h'].map(tf => (
                                                <button key={tf} onClick={() => setModalInterval(tf)} style={{
                                                    padding: '0.2rem 0.45rem', borderRadius: '0.25rem', border: 'none',
                                                    background: modalInterval === tf ? 'rgba(252,213,53,0.15)' : 'transparent',
                                                    color: modalInterval === tf ? '#FCD535' : 'var(--text-muted)',
                                                    fontWeight: 600, fontSize: '0.65rem', cursor: 'pointer',
                                                }}>{tf}</button>
                                            ))}
                                            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginLeft: '0.3rem' }}>24h</span>
                                        </div>
                                    </div>
                                    {/* Chart container */}
                                    <div ref={modalChartContainerRef} style={{ width: '100%', minHeight: 280 }} />
                                </div>

                                {/* Prices from all sources */}
                                {multiPrices?.sources ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {(() => {
                                            const entries = Object.entries(multiPrices.sources)
                                                .filter(([, v]) => v && v.price)
                                                .sort((a, b) => b[1].price - a[1].price);
                                            const maxPrice = entries.length > 0 ? Math.max(...entries.map(e => e[1].price)) : 1;
                                            const minPrice = entries.length > 0 ? Math.min(...entries.map(e => e[1].price)) : 1;
                                            const spread = maxPrice > 0 ? ((maxPrice - minPrice) / minPrice * 100) : 0;

                                            return (
                                                <>
                                                    {/* Spread banner */}
                                                    <div style={{
                                                        padding: '0.6rem 0.8rem', borderRadius: '0.5rem',
                                                        background: spread > 0.1 ? 'rgba(105,240,174,0.06)' : 'rgba(255,255,255,0.03)',
                                                        border: `1px solid ${spread > 0.1 ? 'rgba(105,240,174,0.15)' : 'var(--border)'}`,
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        marginBottom: '0.3rem',
                                                    }}>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                            Cross-Source Spread
                                                        </span>
                                                        <span style={{
                                                            fontFamily: 'var(--mono)', fontWeight: 800,
                                                            color: spread > 0.1 ? '#69f0ae' : 'var(--text-secondary)',
                                                            fontSize: '1rem',
                                                        }}>
                                                            {spread.toFixed(4)}%
                                                        </span>
                                                    </div>

                                                    {entries.map(([src, data], idx) => {
                                                        const isHigh = data.price === maxPrice;
                                                        const isLow = data.price === minPrice;
                                                        return (
                                                            <motion.div key={src}
                                                                initial={{ opacity: 0, x: -10 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.06 }}
                                                                style={{
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    padding: '0.7rem 0.8rem', borderRadius: '0.5rem',
                                                                    background: 'rgba(255,255,255,0.02)',
                                                                    border: `1px solid ${isHigh ? 'rgba(105,240,174,0.15)' : isLow ? 'rgba(255,23,68,0.15)' : 'transparent'}`,
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                                    <div style={{
                                                                        width: 10, height: 10, borderRadius: '50%',
                                                                        background: SOURCE_COLORS[src] || '#666',
                                                                        boxShadow: `0 0 6px ${SOURCE_COLORS[src] || '#666'}50`,
                                                                    }} />
                                                                    <div>
                                                                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                                                            {SOURCE_LABELS[src] || src}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                                                                            {data.timestamp ? new Date(data.timestamp * 1000).toLocaleTimeString() : '—'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{
                                                                        fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '1rem',
                                                                        color: isHigh ? '#69f0ae' : isLow ? '#ff5252' : '#fff',
                                                                    }}>
                                                                        ${data.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                                    </div>
                                                                    {isHigh && <span style={{ fontSize: '0.58rem', color: '#69f0ae', fontWeight: 700 }}>▲ HIGHEST</span>}
                                                                    {isLow && entries.length > 1 && <span style={{ fontSize: '0.58rem', color: '#ff5252', fontWeight: 700 }}>▼ LOWEST</span>}
                                                                </div>
                                                            </motion.div>
                                                        );
                                                    })}

                                                    {entries.length === 0 && (
                                                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                                            No source prices available for this pair
                                                        </div>
                                                    )}

                                                    {/* Arb opportunity hint */}
                                                    {spread > 0.05 && entries.length >= 2 && (
                                                        <div style={{
                                                            marginTop: '0.3rem', padding: '0.7rem 0.8rem', borderRadius: '0.5rem',
                                                            background: 'rgba(252,213,53,0.05)', border: '1px solid rgba(252,213,53,0.12)',
                                                            display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                        }}>
                                                            <Zap size={16} style={{ color: '#FCD535', flexShrink: 0 }} />
                                                            <div style={{ fontSize: '0.75rem' }}>
                                                                <span style={{ fontWeight: 700, color: '#FCD535' }}>Arbitrage Signal: </span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>
                                                                    Buy on <strong>{entries[entries.length - 1][0]}</strong> → Sell on <strong>{entries[0][0]}</strong>
                                                                </span>
                                                                <div style={{ marginTop: '0.15rem', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                                                    Net spread after estimated fees: ~{(spread - 0.02).toFixed(3)}%
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        <RefreshCw size={20} style={{ animation: 'spin-slow 1.5s linear infinite', marginBottom: '0.5rem' }} /><br />
                                        Loading multi-source prices...
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
};

export default CoinsPage;
