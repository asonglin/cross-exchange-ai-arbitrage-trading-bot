import { motion } from 'framer-motion';
import {
    Activity,
    Brain,
    Clock,
    Layers, LineChart,
    RefreshCw,
    Search,
    Shield,
    Target,
    Zap
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const AgentPage = () => {
    const navigate = useNavigate();
    const [agentStatus, setAgentStatus] = useState(null);
    const [opportunities, setOpportunities] = useState([]);
    const [decisions, setDecisions] = useState([]);
    const [portfolio, setPortfolio] = useState(null);
    const [spreads, setSpreads] = useState([]);
    const [regime, setRegime] = useState(null);
    const [anomalies, setAnomalies] = useState([]);
    const [activity, setActivity] = useState([]);
    const [wsConnected, setWsConnected] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [mlAccuracy, setMlAccuracy] = useState(null);
    const wsRef = useRef(null);

    // ── Fetch all data ──
    const fetchAll = async () => {
        try {
            const [statusRes, oppsRes, decsRes, portRes, spreadRes, regimeRes, anomRes, actRes, mlRes] = await Promise.allSettled([
                fetch(`${API}/api/agent/status`),
                fetch(`${API}/api/agent/opportunities`),
                fetch(`${API}/api/agent/decisions?limit=30`),
                fetch(`${API}/api/agent/portfolio`),
                fetch(`${API}/api/prices/spreads`),
                fetch(`${API}/api/market/regime`),
                fetch(`${API}/api/market/anomalies?limit=20`),
                fetch(`${API}/api/agent/activity?limit=40`),
                fetch(`${API}/api/agent/ml-accuracy`),
            ]);
            if (statusRes.status === 'fulfilled') setAgentStatus(await statusRes.value.json());
            if (oppsRes.status === 'fulfilled') { const d = await oppsRes.value.json(); setOpportunities(d.opportunities || []); }
            if (decsRes.status === 'fulfilled') { const d = await decsRes.value.json(); setDecisions(d.decisions || []); }
            if (portRes.status === 'fulfilled') setPortfolio(await portRes.value.json());
            if (spreadRes.status === 'fulfilled') { const d = await spreadRes.value.json(); setSpreads(d.spreads || []); }
            if (regimeRes.status === 'fulfilled') setRegime(await regimeRes.value.json());
            if (anomRes.status === 'fulfilled') { const d = await anomRes.value.json(); setAnomalies(d.anomalies || []); }
            if (actRes.status === 'fulfilled') setActivity(await actRes.value.json());
            if (mlRes.status === 'fulfilled') setMlAccuracy(await mlRes.value.json());
        } catch (e) { console.error('Fetch error', e); }
    };

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 6000);
        return () => clearInterval(interval);
    }, []);

    // ── WebSocket for live agent stream ──
    useEffect(() => {
        let isMounted = true;
        const connect = () => {
            if (!isMounted) return;
            const wsBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
            const ws = new WebSocket(`${wsBase}/ws/agent`);
            ws.onopen = () => { if (isMounted) setWsConnected(true); };
            ws.onclose = () => {
                if (isMounted) {
                    setWsConnected(false);
                    setTimeout(connect, 3000);
                }
            };
            ws.onerror = () => { }; // suppress console errors
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (!msg || !msg.type) return;
                    if (msg.type === 'status' && msg.data) setAgentStatus(msg.data);
                    if (msg.type === 'opportunity' && msg.data) setOpportunities(prev => [msg.data, ...prev].slice(0, 30));
                    if (msg.type === 'decision' && msg.data?.decision_id) setDecisions(prev => [msg.data, ...prev].slice(0, 30));
                    if (msg.type === 'trade') fetchAll();
                    if (msg.type === 'state_change' || msg.type === 'scan_complete') {
                        setActivity(prev => [msg, ...prev].slice(0, 40));
                    }
                } catch { }
            };
            wsRef.current = ws;
        };
        connect();
        return () => {
            isMounted = false;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
        };
    }, []);

    const stateColors = {
        INITIALIZING: '#ffab40', SCANNING: '#40c4ff', ANALYZING: '#7c4dff',
        OPPORTUNITY_DETECTED: '#ffd740', EXECUTING: '#69f0ae', COOLDOWN: '#ff5252', ERROR: '#ff1744',
    };
    const stateIcons = {
        INITIALIZING: <RefreshCw size={14} />, SCANNING: <Search size={14} />,
        ANALYZING: <Brain size={14} />, OPPORTUNITY_DETECTED: <Target size={14} />,
        EXECUTING: <Zap size={14} />, COOLDOWN: <Clock size={14} />, ERROR: <Shield size={14} />,
    };
    const regimeColors = {
        DISLOCATION: '#ff1744', VOLATILE: '#ff9100', RANGING: '#ffea00',
        TRENDING: '#00e676', CALM: '#40c4ff',
    };

    const perf = portfolio?.performance || {};
    const equity = portfolio?.equity_curve || [];
    const trades = portfolio?.recent_trades || [];

    return (
        <div className="dashboard-layout">
            <Sidebar active="agent" />

            {/* ── Main Content ── */}
            <main className="dashboard-main" style={{ padding: '1.5rem', overflow: 'auto', flex: 1, minWidth: 0 }}>
                {/* ── Top Bar ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                            <Brain size={24} style={{ marginRight: 8, color: '#FCD535', verticalAlign: 'middle' }} />
                            AI Agent Command Center
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.3rem 0 0' }}>
                            Autonomous Arbitrage Intelligence • Bellman-Ford • Cross-Chain
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {['overview', 'opportunities', 'decisions', 'ml-intel', 'portfolio'].map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} style={{
                                padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
                                background: activeTab === tab ? '#FCD535' : 'var(--card-bg)',
                                color: activeTab === tab ? '#000' : 'var(--text-secondary)',
                                fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                                textTransform: 'capitalize',
                            }}>{tab === 'ml-intel' ? '🧠 ML Intel' : tab}</button>
                        ))}
                    </div>
                </div>

                {/* ═══ Agent Status Strip ═══ */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.8rem', marginBottom: '1.2rem',
                }}>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>AGENT STATE</div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            color: stateColors[agentStatus?.state] || '#fff', fontWeight: 800, fontSize: '0.95rem',
                        }}>
                            {stateIcons[agentStatus?.state]}
                            {agentStatus?.state || 'OFFLINE'}
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>TOTAL SCANS</div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)', color: '#40c4ff' }}>
                            {agentStatus?.scan_count?.toLocaleString() || '0'}
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>MARKET REGIME</div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: regimeColors[regime?.regime] || '#fff' }}>
                            {regime?.regime || '—'}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginTop: '0.2rem' }}>
                            {regime?.description?.slice(0, 50) || ''}
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>WIN RATE</div>
                        <div style={{ fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)', color: '#69f0ae' }}>
                            {perf.win_rate != null ? `${perf.win_rate.toFixed(1)}%` : '—'}
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>PORTFOLIO</div>
                        <div style={{
                            fontWeight: 800, fontSize: '1.3rem', fontFamily: 'var(--mono)',
                            color: (perf.total_pnl || 0) >= 0 ? '#69f0ae' : '#ff5252',
                        }}>
                            ${perf.balance?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '10,000'}
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1rem' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.5rem' }}>UPTIME</div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', fontFamily: 'var(--mono)', color: '#fff' }}>
                            {agentStatus?.uptime || '0s'}
                        </div>
                    </div>
                </div>

                {/* ═══ Tab Content ═══ */}

                {activeTab === 'overview' && <OverviewTab activity={activity} spreads={spreads} anomalies={anomalies} />}
                {activeTab === 'opportunities' && <OpportunitiesTab opportunities={opportunities} />}
                {activeTab === 'decisions' && <DecisionsTab decisions={decisions} />}
                {activeTab === 'ml-intel' && <MLIntelTab mlAccuracy={mlAccuracy} agentStatus={agentStatus} decisions={decisions} />}
                {activeTab === 'portfolio' && <PortfolioTab perf={perf} equity={equity} trades={trades} />}
            </main>
        </div>
    );
};

// ═══════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════

const OverviewTab = ({ activity, spreads, anomalies }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Live Activity Feed */}
        <div className="glass-card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} style={{ color: '#FCD535' }} /> Live Activity Feed
            </h3>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {(Array.isArray(activity) ? activity : []).slice(0, 20).map((a, i) => (
                    <div key={i} style={{
                        padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: a.type === 'trade' ? '#69f0ae' : a.type === 'opportunity' ? '#ffd740' : '#40c4ff',
                            }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {a.type || a.event || 'scan'}
                            </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                            {a.timestamp ? new Date(a.timestamp * 1000).toLocaleTimeString() : ''}
                        </span>
                    </div>
                ))}
                {(!activity || activity.length === 0) && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
                        Agent starting — waiting for first scan...
                    </div>
                )}
            </div>
        </div>

        {/* Spread Heatmap */}
        <div className="glass-card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={16} style={{ color: '#FCD535' }} /> Cross-Source Spread Heatmap
            </h3>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {spreads.slice(0, 15).map((s, i) => {
                    const intensity = Math.min(s.spread_pct / 0.5, 1);
                    return (
                        <div key={i} style={{
                            padding: '0.5rem 0.7rem', marginBottom: '0.4rem', borderRadius: '0.4rem',
                            background: `rgba(${Math.round(255 * intensity)}, ${Math.round(215 * (1 - intensity))}, 53, ${0.08 + intensity * 0.15})`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.symbol?.replace('USDT', '')}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: '0.5rem' }}>
                                    {s.source_a} ↔ {s.source_b}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{
                                    fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--mono)',
                                    color: s.spread_pct > 0.1 ? '#ffd740' : '#aaa',
                                }}>
                                    {s.spread_pct?.toFixed(4)}%
                                </span>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                                    ${s.price_a?.toFixed(2)} → ${s.price_b?.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {spreads.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
                        Collecting multi-source prices...
                    </div>
                )}
            </div>
        </div>

        {/* Anomalies — spans full width */}
        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={16} style={{ color: '#ff5252' }} /> Anomaly Detection
            </h3>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {anomalies.slice(0, 10).map((a, i) => {
                    const sev = (a.severity || '').toLowerCase();
                    return (
                        <div key={i} style={{
                            padding: '0.6rem 0.9rem', borderRadius: '0.5rem',
                            background: sev === 'high' ? 'rgba(255,23,68,0.12)' :
                                (sev === 'medium' || sev === 'moderate') ? 'rgba(255,171,64,0.12)' : 'rgba(64,196,255,0.12)',
                            border: `1px solid ${sev === 'high' ? 'rgba(255,23,68,0.3)' :
                                (sev === 'medium' || sev === 'moderate') ? 'rgba(255,171,64,0.3)' : 'rgba(64,196,255,0.3)'}`,
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>{a.symbol?.replace('USDT', '')} — {a.type}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                {a.description?.slice(0, 80) || `z-score: ${a.z_score?.toFixed(2)}`}
                            </div>
                        </div>
                    );
                })}
                {anomalies.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem' }}>
                        No anomalies detected — market is calm.
                    </div>
                )}
            </div>
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════
// TAB: OPPORTUNITIES
// ═══════════════════════════════════════════════════════

const OpportunitiesTab = ({ opportunities }) => {
    const [executing, setExecuting] = useState(null);
    const [execResult, setExecResult] = useState(null);

    const executeOpp = async (opp) => {
        setExecuting(opp.id);
        setExecResult(null);
        try {
            const res = await fetch(`${API}/api/agent/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ opportunity_id: opp.id }),
            });
            const data = await res.json();
            setExecResult({ id: opp.id, ...data });
        } catch (e) {
            setExecResult({ id: opp.id, status: 'error', message: e.message });
        }
        setTimeout(() => setExecuting(null), 1000);
    };

    return (
        <div className="glass-card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Target size={16} style={{ color: '#ffd740' }} /> Detected Arbitrage Opportunities ({opportunities.length})
            </h3>

            {/* Execution result banner */}
            {execResult && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    style={{
                        padding: '0.8rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem',
                        background: execResult.status === 'executed' ? 'rgba(105,240,174,0.1)' : 'rgba(255,171,64,0.1)',
                        border: `1px solid ${execResult.status === 'executed' ? 'rgba(105,240,174,0.3)' : 'rgba(255,171,64,0.3)'}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                >
                    <div>
                        <span style={{
                            fontWeight: 800, fontSize: '0.85rem',
                            color: execResult.status === 'executed' ? '#69f0ae' : '#ffab40',
                        }}>
                            {execResult.status === 'executed' ? '✅ Trade Executed' : `⚡ ${execResult.status || 'Processed'}`}
                        </span>
                        {execResult.trade && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.8rem' }}>
                                P&L: <strong style={{ color: (execResult.trade.pnl || 0) >= 0 ? '#69f0ae' : '#ff5252' }}>
                                    {execResult.trade.pnl >= 0 ? '+' : ''}${execResult.trade.pnl?.toFixed(2)}
                                </strong> • {execResult.trade.symbol}
                            </span>
                        )}
                        {execResult.message && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.8rem' }}>
                                {execResult.message}
                            </span>
                        )}
                    </div>
                    <button onClick={() => setExecResult(null)} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem',
                    }}>×</button>
                </motion.div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            {['#', 'Type', 'Pair', 'Buy @', 'Sell @', 'Gross %', 'Net %', 'Route', 'Time', ''].map(h => (
                                <th key={h} style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {opportunities.map((o, i) => {
                            const buyStep = o.path?.find(p => p.action === 'BUY');
                            const sellStep = o.path?.find(p => p.action === 'SELL');
                            const sym = (o.symbols || []).map(s => s.replace('USDT', '')).join('/');
                            const isProfitable = (o.net_profit_pct || 0) > 0;
                            const isExec = executing === o.id;
                            return (
                                <tr key={o.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--mono)', fontSize: '0.7rem' }}>{o.id?.split('-').pop()}</td>
                                    <td style={{ padding: '0.6rem 0.5rem' }}>
                                        <span style={{
                                            padding: '0.15rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.7rem', fontWeight: 700,
                                            background: o.type === 'triangular' ? 'rgba(124,77,255,0.2)' :
                                                o.type === 'cross_chain' ? 'rgba(255,171,64,0.2)' : 'rgba(64,196,255,0.2)',
                                            color: o.type === 'triangular' ? '#b388ff' :
                                                o.type === 'cross_chain' ? '#ffab40' : '#40c4ff',
                                        }}>
                                            {o.type}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>{sym || '—'}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--mono)' }}>${buyStep?.price?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || '—'}</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'var(--mono)' }}>${sellStep?.price?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || '—'}</td>
                                    <td style={{
                                        padding: '0.6rem 0.5rem', fontFamily: 'var(--mono)', fontWeight: 700,
                                        color: (o.gross_spread_pct || 0) > 0 ? '#69f0ae' : '#ff5252',
                                    }}>{o.gross_spread_pct?.toFixed(4)}%</td>
                                    <td style={{
                                        padding: '0.6rem 0.5rem', fontFamily: 'var(--mono)', fontWeight: 800,
                                        color: (o.net_profit_pct || 0) > 0 ? '#69f0ae' : '#ff5252',
                                    }}>{o.net_profit_pct?.toFixed(4)}%</td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {(o.sources || []).join(' → ')}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.7rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                                        {o.timestamp ? new Date(o.timestamp * 1000).toLocaleTimeString() : ''}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.3rem' }}>
                                        {isProfitable && (
                                            <button
                                                onClick={() => executeOpp(o)}
                                                disabled={isExec}
                                                style={{
                                                    padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: 'none',
                                                    background: isExec ? 'rgba(252,213,53,0.3)' : 'linear-gradient(135deg, #FCD535, #f0b90b)',
                                                    color: '#000', fontWeight: 800, fontSize: '0.65rem', cursor: isExec ? 'wait' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap',
                                                }}
                                            >
                                                <Zap size={10} /> {isExec ? 'Executing...' : 'Execute'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {opportunities.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem', fontSize: '0.9rem' }}>
                        <Target size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} /><br />
                        No opportunities detected yet — agent is scanning...
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════
// TAB: DECISIONS  (FIXED: risk_factors is an object, not array)
// ═══════════════════════════════════════════════════════

const DecisionsTab = ({ decisions }) => (
    <div className="glass-card" style={{ padding: '1.2rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Brain size={16} style={{ color: '#b388ff' }} /> XAI Decision Audit Trail ({decisions.filter(d => d && d.decision).length})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {decisions.filter(d => d && d.decision).map((d, i) => {
                const isExec = d.decision === 'EXECUTE';
                const syms = (d.symbols || []).map(s => s.replace('USDT', '')).join('/');
                const netPct = d.profit_analysis?.net_profit || '—';
                const kellyPct = d.position_sizing?.kelly_fraction != null
                    ? `${(d.position_sizing.kelly_fraction * 100).toFixed(1)}%` : '—';

                // risk_factors is an OBJECT like { slippage: {score, label}, fee_impact: {score, label}, ... }
                const riskFactors = d.reasoning?.risk_factors;
                const riskEntries = riskFactors && typeof riskFactors === 'object' && !Array.isArray(riskFactors)
                    ? Object.entries(riskFactors)
                    : [];

                return (
                    <motion.div key={d.decision_id || i}
                        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        style={{
                            padding: '1rem', borderRadius: '0.6rem',
                            background: isExec ? 'rgba(105,240,174,0.06)' : 'rgba(255,82,82,0.06)',
                            border: `1px solid ${isExec ? 'rgba(105,240,174,0.15)' : 'rgba(255,82,82,0.15)'}`,
                        }}>
                        {/* Header row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{
                                    padding: '0.15rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.7rem', fontWeight: 800,
                                    background: isExec ? 'rgba(105,240,174,0.2)' : 'rgba(255,82,82,0.2)',
                                    color: isExec ? '#69f0ae' : '#ff5252',
                                }}>{d.decision}</span>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{syms}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{d.opportunity_type}</span>
                            </div>
                            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                                {d.decision_id}
                            </span>
                        </div>

                        {/* Verdict */}
                        <div style={{ fontSize: '0.75rem', marginBottom: '0.4rem', color: isExec ? '#69f0ae' : '#ffab40' }}>
                            {d.verdict}
                        </div>

                        {/* Scores */}
                        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                            <span>Confidence: <strong style={{ color: '#40c4ff' }}>{d.confidence}</strong>/100</span>
                            <span>Risk: <strong style={{ color: '#ff5252' }}>{d.risk}</strong>/100</span>
                            <span>Net: <strong style={{ color: '#ffd740', fontFamily: 'var(--mono)' }}>{netPct}</strong></span>
                            <span>Kelly: <strong style={{ fontFamily: 'var(--mono)' }}>{kellyPct}</strong></span>
                            <span>Size: <strong style={{ fontFamily: 'var(--mono)', color: '#b388ff' }}>{d.position_sizing?.recommended_size_usd || '—'}</strong></span>
                        </div>

                        {/* ML Analysis Badge */}
                        {d.ml_analysis && (
                            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                {d.ml_analysis.algorithm_agreement && (
                                    <span style={{
                                        padding: '0.15rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.65rem', fontWeight: 700,
                                        background: d.ml_analysis.algorithm_agreement.agreement_pct > 60 ? 'rgba(105,240,174,0.15)' : 'rgba(255,171,64,0.15)',
                                        color: d.ml_analysis.algorithm_agreement.agreement_pct > 60 ? '#69f0ae' : '#ffab40',
                                    }}>
                                        🧠 {d.ml_analysis.algorithm_agreement.bullish_models}/{d.ml_analysis.algorithm_agreement.total_models} models agree ({d.ml_analysis.algorithm_agreement.agreement_pct}%)
                                    </span>
                                )}
                                {d.ml_analysis.bayesian_calibration && (
                                    <span style={{
                                        padding: '0.15rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.65rem', fontWeight: 700,
                                        background: 'rgba(64,196,255,0.12)', color: '#40c4ff',
                                    }}>
                                        📊 Bayesian: {d.ml_analysis.bayesian_calibration.raw_input?.toFixed(0)} → {d.ml_analysis.bayesian_calibration.calibrated_output?.toFixed(0)}
                                    </span>
                                )}
                                {d.ml_analysis.raw_confidence != null && d.ml_analysis.legacy_confidence != null && (
                                    <span style={{
                                        padding: '0.15rem 0.5rem', borderRadius: '0.3rem', fontSize: '0.65rem', fontWeight: 700,
                                        background: 'rgba(179,136,255,0.12)', color: '#b388ff',
                                    }}>
                                        Legacy: {d.ml_analysis.legacy_confidence} vs ML: {d.ml_analysis.raw_confidence?.toFixed(0)}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Execution Path + Reasoning */}
                        {d.execution_path && d.execution_path.length > 0 && (
                            <div style={{
                                padding: '0.6rem', borderRadius: '0.4rem', background: 'rgba(0,0,0,0.3)',
                                fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--mono)',
                                lineHeight: 1.6, marginTop: '0.3rem',
                            }}>
                                {d.execution_path.map((step, j) => (
                                    <div key={j}>{step}</div>
                                ))}
                                {d.reasoning?.primary_reason && (
                                    <div style={{ marginTop: '0.3rem', color: '#ffd740' }}>💡 {d.reasoning.primary_reason}</div>
                                )}
                                {/* Render risk_factors as object entries */}
                                {riskEntries.map(([key, val]) => (
                                    <div key={key} style={{ color: '#ff8a80' }}>
                                        ⚠ {key.replace(/_/g, ' ')}: {typeof val === 'object' ? val.label || `score ${val.score}` : val}
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                );
            })}
            {decisions.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    <Brain size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} /><br />
                    No decisions yet — agent is learning market patterns...
                </div>
            )}
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════
// TAB: ML INTELLIGENCE
// ═══════════════════════════════════════════════════════

const MLIntelTab = ({ mlAccuracy, agentStatus, decisions }) => {
    const calibration = mlAccuracy?.calibration_curve || [];
    const accuracyTiers = mlAccuracy?.accuracy_by_confidence || [];
    const brierScore = mlAccuracy?.brier_score;
    const totalPredictions = mlAccuracy?.total_predictions || 0;
    const totalScored = mlAccuracy?.total_scored || 0;
    const ensembleWeights = mlAccuracy?.ensemble_weights || {};
    const mlStatus = agentStatus?.ml_accuracy || {};

    // Algorithm descriptions for the info panel
    const algorithms = [
        { name: 'Z-Score Spread Analysis', icon: '📊', weight: ensembleWeights.spread_strength, desc: 'Statistical significance of spread vs rolling 200-point history. Higher z-score = more unusual = more likely real.' },
        { name: 'Profitability Assessment', icon: '💰', weight: ensembleWeights.profitability, desc: 'Net profit after all costs (gas, slippage, execution decay). Tiered scoring from THIN (0.05%) to EXCEPTIONAL (>1%).' },
        { name: 'EMA Crossover (MACD)', icon: '📈', weight: ensembleWeights.ema_signal, desc: 'Dual exponential moving average crossover (12/26). BULLISH = spread widening (opportunity), BEARISH = spread closing (danger).' },
        { name: 'Ornstein-Uhlenbeck Half-Life', icon: '⏱️', weight: ensembleWeights.half_life, desc: 'Models spread as mean-reverting process. Calculates how many seconds until spread closes to half its value. Ideal: 30-120s.' },
        { name: 'ADF Stationarity Test', icon: '🔬', weight: ensembleWeights.mean_reversion, desc: 'Augmented Dickey-Fuller inspired test. Stationary spread = mean-reverting = capturable. Non-stationary = random walk = dangerous.' },
        { name: 'Source Consensus', icon: '🔗', weight: ensembleWeights.source_consensus, desc: 'Multi-oracle agreement analysis. 5 sources agreeing = high confidence. Wild disagreement = possible data error.' },
        { name: 'Data Freshness', icon: '⚡', weight: ensembleWeights.data_freshness, desc: 'Timestamp recency of price data. Real-time (<2s) = maximum score. Stale (>30s) = spread may have already closed.' },
        { name: 'Volume/Liquidity Depth', icon: '🌊', weight: ensembleWeights.volume, desc: '24h trading volume across sources. Deep liquidity (>$1B) = can execute without moving price. Thin = high slippage risk.' },
    ];

    // Get the most recent decision's sub-model breakdown for live display
    const latestDecision = decisions.find(d => d?.ml_analysis);
    const latestBreakdown = latestDecision?.reasoning?.confidence_factors || {};

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            {/* ── Bayesian Calibration Curve ── */}
            <div className="glass-card" style={{ padding: '1.2rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Brain size={16} style={{ color: '#40c4ff' }} /> Bayesian Confidence Calibration
                </h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Self-correcting: if we predict 80% but only win 60%, future 80% predictions are adjusted down.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {calibration.map((c, i) => {
                        const predicted = c.predicted_confidence;
                        const actual = c.actual_accuracy;
                        const posterior = c.bayesian_posterior;
                        const hasData = c.sample_size > 0;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ width: '40px', fontSize: '0.7rem', fontFamily: 'var(--mono)', color: 'var(--text-muted)', textAlign: 'right' }}>
                                    {predicted.toFixed(0)}%
                                </span>
                                <div style={{ flex: 1, height: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                                    {/* Predicted bar (gray) */}
                                    <div style={{
                                        position: 'absolute', height: '100%', width: `${predicted}%`,
                                        background: 'rgba(255,255,255,0.08)', borderRadius: '4px',
                                    }} />
                                    {/* Actual bar (colored) */}
                                    {hasData && (
                                        <div style={{
                                            position: 'absolute', height: '100%', width: `${actual}%`,
                                            background: Math.abs(actual - predicted) < 15
                                                ? 'rgba(105,240,174,0.4)' : 'rgba(255,82,82,0.4)',
                                            borderRadius: '4px',
                                        }} />
                                    )}
                                    {/* Posterior marker */}
                                    <div style={{
                                        position: 'absolute', height: '100%', width: '3px', left: `${posterior}%`,
                                        background: '#FCD535', borderRadius: '2px',
                                    }} />
                                </div>
                                <span style={{ width: '60px', fontSize: '0.65rem', fontFamily: 'var(--mono)', color: hasData ? '#fff' : 'var(--text-muted)' }}>
                                    {hasData ? `${actual.toFixed(0)}% (${c.sample_size})` : 'no data'}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(105,240,174,0.4)', marginRight: 4 }} />
                        Actual accuracy
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 3, background: '#FCD535', marginRight: 4 }} />
                        Bayesian posterior
                    </span>
                </div>
            </div>

            {/* ── Accuracy by Confidence Tier ── */}
            <div className="glass-card" style={{ padding: '1.2rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Target size={16} style={{ color: '#69f0ae' }} /> Accuracy by Confidence Tier
                </h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    How often each confidence range actually wins. Perfect calibration: 80% confidence → 80% win rate.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {accuracyTiers.map((tier, i) => (
                        <div key={i} style={{
                            padding: '0.7rem', borderRadius: '0.5rem',
                            background: 'rgba(255,255,255,0.03)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{tier.tier}%</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                    ({tier.sample_size} trades)
                                </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                {tier.accuracy != null ? (
                                    <span style={{
                                        fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--mono)',
                                        color: tier.accuracy > 65 ? '#69f0ae' : tier.accuracy > 45 ? '#ffd740' : '#ff5252',
                                    }}>{tier.accuracy.toFixed(1)}%</span>
                                ) : (
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>—</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem' }}>
                    <div style={{ padding: '0.6rem', borderRadius: '0.5rem', background: 'rgba(64,196,255,0.08)', flex: 1 }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>BRIER SCORE</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: '#40c4ff' }}>
                            {brierScore != null ? brierScore.toFixed(4) : '—'}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>0 = perfect, 0.25 = random</div>
                    </div>
                    <div style={{ padding: '0.6rem', borderRadius: '0.5rem', background: 'rgba(179,136,255,0.08)', flex: 1 }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL SCORED</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: '#b388ff' }}>
                            {totalScored.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{totalPredictions} with outcomes</div>
                    </div>
                </div>
            </div>

            {/* ── Ensemble Algorithm Breakdown ── full width */}
            <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🧠 Ensemble Algorithm Breakdown
                </h3>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    8 sub-models vote on every opportunity. Final confidence = weighted average × volatility adjustment × Bayesian calibration.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.6rem' }}>
                    {algorithms.map((algo, i) => (
                        <div key={i} style={{
                            padding: '0.8rem', borderRadius: '0.5rem',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{algo.icon} {algo.name}</span>
                                <span style={{
                                    padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontSize: '0.65rem',
                                    fontWeight: 800, fontFamily: 'var(--mono)',
                                    background: 'rgba(252,213,53,0.12)', color: '#FCD535',
                                }}>
                                    {algo.weight != null ? `${(algo.weight * 100).toFixed(0)}%` : '—'} weight
                                </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                {algo.desc}
                            </div>
                            {/* Weight bar */}
                            <div style={{ marginTop: '0.4rem', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                                <div style={{
                                    height: '100%', width: `${(algo.weight || 0) * 500}%`,
                                    background: 'linear-gradient(90deg, #FCD535, #40c4ff)',
                                    borderRadius: '2px',
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── How It Works Explainer ── full width */}
            <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📐 How Confidence Is Calculated
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                    {[
                        { step: '1', title: '8 Sub-Models Score', desc: 'Each algorithm independently scores the opportunity 0-100', color: '#40c4ff' },
                        { step: '2', title: 'Weighted Ensemble', desc: 'Scores are combined using optimized weights (20% spread, 15% profit, 15% mean-reversion...)', color: '#b388ff' },
                        { step: '3', title: 'Volatility Adjust', desc: 'High volatility penalizes confidence (30% penalty at >150% ann. vol)', color: '#ffd740' },
                        { step: '4', title: 'Bayesian Calibrate', desc: 'Self-corrects based on historical accuracy at each confidence level', color: '#69f0ae' },
                        { step: '5', title: 'Kelly Position Size', desc: 'f* = (p·b - q)/b — optimal bet size given win probability and payoff ratio', color: '#ff5252' },
                    ].map((s, i) => (
                        <div key={i} style={{
                            padding: '0.8rem', borderRadius: '0.5rem',
                            background: 'rgba(0,0,0,0.3)',
                            borderLeft: `3px solid ${s.color}`,
                        }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: s.color, marginBottom: '0.3rem' }}>STEP {s.step}</div>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.2rem' }}>{s.title}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════
// TAB: PORTFOLIO
// ═══════════════════════════════════════════════════════

const PortfolioTab = ({ perf, equity, trades }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Performance Metrics — full width */}
        <div className="glass-card" style={{ padding: '1.2rem', gridColumn: '1 / -1' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LineChart size={16} style={{ color: '#69f0ae' }} /> Portfolio Performance
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.8rem' }}>
                {[
                    { label: 'Balance', value: `$${perf.balance?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '10,000'}`, color: '#fff' },
                    { label: 'Total P&L', value: `${(perf.total_pnl || 0) >= 0 ? '+' : ''}$${perf.total_pnl?.toFixed(2) || '0'}`, color: (perf.total_pnl || 0) >= 0 ? '#69f0ae' : '#ff5252' },
                    { label: 'Win Rate', value: perf.win_rate != null ? `${perf.win_rate.toFixed(1)}%` : '—', color: '#40c4ff' },
                    { label: 'Sharpe Ratio', value: perf.sharpe_ratio?.toFixed(2) || '—', color: '#b388ff' },
                    { label: 'Profit Factor', value: perf.profit_factor?.toFixed(2) || '—', color: '#ffd740' },
                    { label: 'Max Drawdown', value: perf.max_drawdown_pct != null ? `${perf.max_drawdown_pct.toFixed(2)}%` : '—', color: '#ff5252' },
                    { label: 'Total Trades', value: perf.total_trades || '0', color: '#fff' },
                    { label: 'Circuit Breaker', value: perf.circuit_breaker_active ? '🔴 ACTIVE' : '🟢 OK', color: perf.circuit_breaker_active ? '#ff5252' : '#69f0ae' },
                ].map((m, i) => (
                    <div key={i} style={{ padding: '0.8rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{m.label}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--mono)', color: m.color }}>{m.value}</div>
                    </div>
                ))}
            </div>
        </div>

        {/* Equity Curve */}
        <div className="glass-card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem' }}>📈 Equity Curve</h3>
            <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '2px', padding: '0 0.5rem' }}>
                {equity.slice(-60).map((e, i) => {
                    const min = Math.min(...equity.slice(-60).map(x => x.balance));
                    const max = Math.max(...equity.slice(-60).map(x => x.balance));
                    const range = max - min || 1;
                    const h = ((e.balance - min) / range) * 180;
                    return (
                        <div key={i} style={{
                            flex: 1, height: `${h}px`, borderRadius: '2px 2px 0 0',
                            background: e.balance >= 10000 ? 'rgba(105,240,174,0.6)' : 'rgba(255,82,82,0.6)',
                            minWidth: '2px',
                        }} title={`$${e.balance.toFixed(2)}`} />
                    );
                })}
                {equity.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', width: '100%', alignSelf: 'center' }}>
                        No trades yet
                    </div>
                )}
            </div>
        </div>

        {/* Recent Trades */}
        <div className="glass-card" style={{ padding: '1.2rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1rem' }}>📋 Recent Trades</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {trades.map((t, i) => (
                    <div key={i} style={{
                        padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem',
                    }}>
                        <div>
                            <span style={{ fontWeight: 700 }}>{t.symbol?.replace('USDT', '')}</span>
                            <span style={{
                                marginLeft: '0.5rem', fontSize: '0.65rem', fontWeight: 700,
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
                ))}
                {trades.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                        No trades executed yet
                    </div>
                )}
            </div>
        </div>
    </div>
);

export default AgentPage;
