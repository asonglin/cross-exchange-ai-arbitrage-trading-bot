import { AnimatePresence, motion } from 'framer-motion';
import { ColorType, createChart } from 'lightweight-charts';
import {
    Clock,
    Globe,
    Search
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { supabase } from '../supabaseClient';

const DashboardPage = () => {
    const [selectedCoin, setSelectedCoin] = useState('BTCUSDT');
    const [searchInput, setSearchInput] = useState('');
    const [chartType, setChartType] = useState('area');
    const [chartInterval, setChartInterval] = useState('5m');
    const [marketData, setMarketData] = useState(null);
    const [topCoins, setTopCoins] = useState([]);
    const [storedPrices, setStoredPrices] = useState({});
    const [timezone, setTimezone] = useState('IST');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [chartLoading, setChartLoading] = useState(false);
    const chartContainerRef = useRef();
    const chartRef = useRef();
    const seriesRef = useRef();
    const wsRef = useRef(null);

    // Live clock updater
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getTimeInZone = (tz) => {
        const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        if (tz === 'IST') {
            return currentTime.toLocaleTimeString('en-IN', { ...options, timeZone: 'Asia/Kolkata' });
        } else {
            return currentTime.toLocaleTimeString('en-US', { ...options, timeZone: 'America/New_York' });
        }
    };

    const getTzOffsetSeconds = () => {
        return timezone === 'IST' ? 5.5 * 3600 : -5 * 3600;
    };

    const coins = [
        { symbol: 'BTCUSDT', name: 'Bitcoin', icon: '₿' },
        { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'Ξ' },
        { symbol: 'BNBUSDT', name: 'BNB', icon: '🔶' },
        { symbol: 'SOLUSDT', name: 'Solana', icon: '◎' },
        { symbol: 'XRPUSDT', name: 'XRP', icon: '✕' },
        { symbol: 'DOGEUSDT', name: 'Dogecoin', icon: 'Ð' },
        { symbol: 'ADAUSDT', name: 'Cardano', icon: '₳' },
        { symbol: 'AVAXUSDT', name: 'Avalanche', icon: '🔺' },
        { symbol: 'DOTUSDT', name: 'Polkadot', icon: '●' },
        { symbol: 'MATICUSDT', name: 'Polygon', icon: '⬡' },
    ];

    // Fetch latest stored prices from Supabase
    useEffect(() => {
        const fetchStoredPrices = async () => {
            try {
                const { data, error } = await supabase
                    .from('coin_prices')
                    .select('symbol, price, change_percent, high_24h, low_24h, volume, recorded_at')
                    .order('recorded_at', { ascending: false });

                if (data && !error) {
                    const latest = {};
                    data.forEach(row => {
                        if (!latest[row.symbol]) {
                            latest[row.symbol] = row;
                        }
                    });
                    setStoredPrices(latest);
                }
            } catch (e) {
                console.log('Supabase fetch:', e);
            }
        };
        fetchStoredPrices();
        const interval = setInterval(fetchStoredPrices, 30000);
        return () => clearInterval(interval);
    }, []);

    // Fetch top coins real-time data for the sidebar
    useEffect(() => {
        const fetchTopCoins = async () => {
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
                const data = await res.json();
                const top = data
                    .filter(d => d.symbol.endsWith('USDT'))
                    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                    .slice(0, 10);
                setTopCoins(top);
            } catch (e) { }
        };
        fetchTopCoins();
        const interval = setInterval(fetchTopCoins, 8000);
        return () => clearInterval(interval);
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchInput.trim()) {
            const formatted = searchInput.trim().toUpperCase();
            const final = formatted.endsWith('USDT') ? formatted : `${formatted}USDT`;
            setSelectedCoin(final);
            setSearchInput('');
        }
    };

    // WebSocket for live price updates
    useEffect(() => {
        if (!selectedCoin) return;

        const wsBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsBase}/ws/trading/${selectedCoin}`);
        wsRef.current = ws;
        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload.error) {
                    setMarketData(payload);
                } else {
                    setSelectedCoin('BTCUSDT');
                }
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };
        ws.onerror = () => { };
        return () => { ws.close(); };
    }, [selectedCoin]);

    // Update chart with live WS data
    useEffect(() => {
        if (!seriesRef.current || !marketData) return;
        try {
            const t = Math.floor(Date.now() / 1000) + getTzOffsetSeconds();
            const p = parseFloat(marketData.price);
            if (chartType === 'candlestick') {
                seriesRef.current.update({ time: t, open: p, high: p, low: p, close: p });
            } else {
                seriesRef.current.update({ time: t, value: p });
            }
        } catch (e) {
            // series might be removed during chart rebuild
        }
    }, [marketData]);

    // Build chart + fetch 24h data
    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Destroy old chart safely
        if (chartRef.current) {
            try { chartRef.current.remove(); } catch (e) { }
            chartRef.current = null;
            seriesRef.current = null;
        }

        const container = chartContainerRef.current;
        let chart;
        try {
            chart = createChart(container, {
                layout: { background: { type: ColorType.Solid, color: '#0a0a0e' }, textColor: '#5a5a6e' },
                grid: { vertLines: { color: 'rgba(255,255,255,0.02)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
                width: container.clientWidth,
                height: 400,
                timeScale: { timeVisible: true, secondsVisible: false, borderColor: 'rgba(255,255,255,0.05)' },
                rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)' },
                crosshair: {
                    vertLine: { color: 'rgba(252,213,53,0.3)', labelBackgroundColor: '#FCD535' },
                    horzLine: { color: 'rgba(252,213,53,0.3)', labelBackgroundColor: '#FCD535' },
                },
            });
        } catch (e) {
            console.error('Chart creation error:', e);
            return;
        }

        let series;
        if (chartType === 'candlestick') {
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
                topColor: 'rgba(252, 213, 53, 0.12)',
                bottomColor: 'rgba(252, 213, 53, 0)',
                lineWidth: 2,
            });
        }

        seriesRef.current = series;
        chartRef.current = chart;

        // Fetch 24h chart data
        const cType = chartType;
        setChartLoading(true);

        const loadData = async () => {
            const offset = getTzOffsetSeconds();
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/prices/chart/${selectedCoin}?interval=${chartInterval}&hours=24`);
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
                console.error('Chart data error, using Binance fallback:', err);
                try {
                    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${selectedCoin}&interval=${chartInterval}&limit=288`);
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
                    console.error('Fallback also failed:', e2);
                }
            }
            setChartLoading(false);
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
            try { chart.remove(); } catch (e) { }
        };
    }, [selectedCoin, chartType, chartInterval, timezone]);

    const fmtPrice = (p) => {
        if (!p) return '$0.00';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(p);
    };

    return (
        <div className="dashboard-layout">
            <Sidebar
                active="dashboard"
                topCoins={topCoins}
                selectedCoin={selectedCoin}
                onSelectCoin={setSelectedCoin}
            />

            {/* Main */}
            <main className="main-view">
                {/* Top bar */}
                <div className="dash-topbar">
                    <form onSubmit={handleSearch} className="dash-search">
                        <Search size={16} color="#5a5a6e" />
                        <input
                            type="text"
                            placeholder="Search any coin (BTC, ETH, SOL...)"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                    </form>
                    <div className="dash-status-group">
                        <div className="status-badge">
                            <div className="status-dot live" />
                            <span style={{ color: '#00e676' }}>Live</span>
                        </div>
                        <button
                            className="status-badge"
                            onClick={() => setTimezone(tz => tz === 'IST' ? 'EST' : 'IST')}
                            style={{ cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                            title="Click to toggle timezone"
                        >
                            <Globe size={12} color="var(--gold)" />
                            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{timezone}</span>
                        </button>
                        <div className="status-badge">
                            <Clock size={12} color="var(--text-muted)" />
                            <span style={{ color: 'var(--text-secondary)' }}>{getTimeInZone(timezone)}</span>
                        </div>
                    </div>
                </div>

                {/* Coin Header */}
                <div className="coin-header">
                    <h1 className="coin-name">
                        {selectedCoin.replace('USDT', '')} <span className="coin-pair">/ USDT</span>
                    </h1>
                    <AnimatePresence mode="wait">
                        {marketData && (
                            <motion.div
                                key={selectedCoin + marketData.price}
                                className="coin-stats-row"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                <span className="coin-live-price">{fmtPrice(marketData.price)}</span>
                                <span className={parseFloat(marketData.change) >= 0 ? 'stat-positive' : 'stat-negative'}>
                                    {parseFloat(marketData.change) >= 0 ? '▲' : '▼'} {marketData.change}%
                                </span>
                                <span className="stat-label">H: {fmtPrice(marketData.high)}</span>
                                <span className="stat-label">L: {fmtPrice(marketData.low)}</span>
                                <span className="stat-label dim">Vol: {parseFloat(marketData.volume).toLocaleString()}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Chart */}
                <div className="chart-panel">
                    <div className="chart-toolbar">
                        <div className="chart-type-btns">
                            <button className={`chart-type-btn ${chartType === 'area' ? 'active' : ''}`} onClick={() => setChartType('area')}>Area</button>
                            <button className={`chart-type-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')}>Candlestick</button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            {chartLoading && <span style={{ fontSize: '0.7rem', color: 'var(--gold)', marginRight: '0.5rem' }}>Loading 24h...</span>}
                            {['1m', '5m', '15m', '1h', '4h'].map(tf => (
                                <button
                                    key={tf}
                                    className={`chart-type-btn ${chartInterval === tf ? 'active' : ''}`}
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
                                    onClick={() => setChartInterval(tf)}
                                >{tf}</button>
                            ))}
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>24h</span>
                        </div>
                    </div>
                    <div ref={chartContainerRef} style={{ width: '100%', minHeight: 400 }} />
                </div>

                {/* Quick Stats Below Chart */}
                {marketData && (
                    <div className="dash-quick-stats">
                        <div className="dqs-item">
                            <span className="dqs-label">24h Change</span>
                            <span className={`dqs-value ${parseFloat(marketData.change) >= 0 ? 'up' : 'down'}`}>
                                {parseFloat(marketData.change) >= 0 ? '+' : ''}{marketData.change}%
                            </span>
                        </div>
                        <div className="dqs-item">
                            <span className="dqs-label">24h High</span>
                            <span className="dqs-value">{fmtPrice(marketData.high)}</span>
                        </div>
                        <div className="dqs-item">
                            <span className="dqs-label">24h Low</span>
                            <span className="dqs-value">{fmtPrice(marketData.low)}</span>
                        </div>
                        <div className="dqs-item">
                            <span className="dqs-label">Volume</span>
                            <span className="dqs-value">{parseFloat(marketData.volume).toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* Pinned Assets — from Supabase */}
                <div style={{ marginTop: '2rem' }}>
                    <div className="assets-section-title">Top 10 Assets </div>
                    <div className="glass-grid">
                        {coins.map(coin => {
                            const sp = storedPrices[coin.symbol];
                            const change = sp ? parseFloat(sp.change_percent) : null;
                            return (
                                <motion.div
                                    key={coin.symbol}
                                    className={`coin-card ${selectedCoin === coin.symbol ? 'active' : ''}`}
                                    onClick={() => setSelectedCoin(coin.symbol)}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '1.3rem' }}>{coin.icon}</span>
                                        {change !== null && (
                                            <span style={{
                                                fontFamily: 'var(--mono)',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: change >= 0 ? 'var(--green)' : 'var(--red)',
                                            }}>
                                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.15rem' }}>{coin.name}</div>
                                    {sp ? (
                                        <>
                                            <div style={{ fontFamily: 'var(--mono)', fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.15rem' }}>
                                                ${parseFloat(sp.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </div>
                                            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                Vol: {parseFloat(sp.volume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--mono)' }}>
                                            {coin.symbol}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DashboardPage;
