import { AnimatePresence, motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowRightLeft,
    CheckCircle2,
    ChevronDown, ChevronRight,
    Copy,
    Cpu,
    Database,
    ExternalLink,
    Eye,
    FileCode2,
    Layers,
    Lock,
    RefreshCw,
    Shield,
    Wallet,
    Zap
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ContractsPage = () => {
    const [contracts, setContracts] = useState(null);
    const [simulation, setSimulation] = useState(null);
    const [simLoading, setSimLoading] = useState(false);
    const [expandedContract, setExpandedContract] = useState('executor');
    const [tokenIn, setTokenIn] = useState('USDT');
    const [tokenOut, setTokenOut] = useState('WBNB');
    const [amount, setAmount] = useState(1000);
    const [reserves, setReserves] = useState(null);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        fetch(`${API}/api/contracts`).then(r => r.json()).then(setContracts).catch(() => {});
    }, []);

    const runSimulation = useCallback(async () => {
        setSimLoading(true);
        try {
            const res = await fetch(`${API}/api/contracts/simulate?token_in=${tokenIn}&token_out=${tokenOut}&amount=${amount}`);
            const data = await res.json();
            setSimulation(data);
        } catch (e) { console.error(e); }
        setSimLoading(false);
    }, [tokenIn, tokenOut, amount]);

    const fetchReserves = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/contracts/reserves/${tokenIn}/${tokenOut}`);
            const data = await res.json();
            setReserves(data);
        } catch (e) { console.error(e); }
    }, [tokenIn, tokenOut]);

    useEffect(() => { runSimulation(); fetchReserves(); }, []);

    const copyAddress = (addr) => {
        navigator.clipboard.writeText(addr);
        setCopied(addr);
        setTimeout(() => setCopied(''), 2000);
    };

    const contractIcons = {
        executor: <Zap size={20} />,
        oracle: <Eye size={20} />,
        vault: <Lock size={20} />,
    };

    const statusColors = {
        compiled: '#FCD335',
        deployed: '#00E676',
        verified: '#00E676',
    };

    const tokens = contracts?.tokens ? Object.keys(contracts.tokens) : ['USDT', 'WBNB', 'BUSD', 'BTCB', 'ETH', 'USDC'];

    return (
        <div className="dashboard-layout">
            <Sidebar active="contracts" />
            <main className="dashboard-main" style={{ padding: '1.5rem', overflow: 'auto', flex: 1, minWidth: 0 }}>
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <FileCode2 size={28} color="#FCD335" />
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                            Smart Contracts
                        </h1>
                        <span style={{
                            background: 'rgba(252,211,53,0.1)',
                            color: '#FCD335',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                        }}>BSC Testnet</span>
                        <span style={{
                            background: 'rgba(0,230,118,0.1)',
                            color: '#00E676',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                        }}>✓ Deployed</span>
                    </div>
                    <p style={{ color: '#888', fontSize: '0.9rem', margin: 0 }}>
                        On-chain arbitrage infrastructure — Flash loans, multi-DEX execution, price oracles & vault management
                    </p>
                </motion.div>

                {/* Architecture Overview */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
                >
                    <h3 style={{ color: '#FCD335', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={16} /> CONTRACT ARCHITECTURE
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {[
                            { label: 'AI Agent', icon: <Cpu size={14} />, color: '#9C27B0' },
                            { label: '→', icon: null, color: '#555' },
                            { label: 'ArbixExecutor', icon: <Zap size={14} />, color: '#FCD335' },
                            { label: '↔', icon: null, color: '#555' },
                            { label: 'PancakeSwap', icon: null, color: '#00E676' },
                            { label: '|', icon: null, color: '#333' },
                            { label: 'BiSwap', icon: null, color: '#2196F3' },
                            { label: '|', icon: null, color: '#333' },
                            { label: 'THENA', icon: null, color: '#FF5252' },
                        ].map((item, i) => (
                            item.icon !== null || item.label.length > 2 ? (
                                <div key={i} style={{
                                    background: `${item.color}15`,
                                    border: `1px solid ${item.color}30`,
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: item.color,
                                }}>
                                    {item.icon} {item.label}
                                </div>
                            ) : (
                                <span key={i} style={{ color: item.color, fontSize: '1.2rem', fontWeight: 700 }}>{item.label}</span>
                            )
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                        <span style={{ color: '#555', fontSize: '1.2rem' }}>↑</span>
                        <div style={{
                            background: '#FF980015',
                            border: '1px solid #FF980030',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#FF9800',
                        }}>
                            <Eye size={14} /> ArbixPriceOracle
                        </div>
                        <span style={{ color: '#555', fontSize: '1.2rem' }}>↓</span>
                        <div style={{
                            background: '#00BCD415',
                            border: '1px solid #00BCD430',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#00BCD4',
                        }}>
                            <Lock size={14} /> ArbixVault
                        </div>
                    </div>
                </motion.div>

                {/* Contract Cards */}
                <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                    {contracts && Object.entries(contracts.contracts).map(([key, contract], idx) => (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + idx * 0.1 }}
                            className="glass-card"
                            style={{ padding: '1.25rem', cursor: 'pointer' }}
                        >
                            {/* Header */}
                            <div
                                onClick={() => setExpandedContract(expandedContract === key ? null : key)}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                        width: 40, height: 40,
                                        borderRadius: '10px',
                                        background: 'rgba(252,211,53,0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#FCD335',
                                    }}>
                                        {contractIcons[key]}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                                            {contract.name}
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>
                                            {contract.description}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <span style={{
                                        background: `${statusColors[contract.status]}15`,
                                        color: statusColors[contract.status],
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                    }}>
                                        {contract.status}
                                    </span>
                                    <span style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        color: '#888',
                                        fontFamily: 'monospace',
                                    }}>
                                        {contract.functions.length} functions
                                    </span>
                                    {expandedContract === key ? <ChevronDown size={16} color="#888" /> : <ChevronRight size={16} color="#888" />}
                                </div>
                            </div>

                            {/* Expanded Content */}
                            <AnimatePresence>
                                {expandedContract === key && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div style={{ marginTop: '1.25rem', borderTop: '1px solid #1a1a24', paddingTop: '1.25rem' }}>
                                            {/* Address */}
                                            <div style={{
                                                background: '#0a0a12',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: '1rem',
                                                fontFamily: 'monospace',
                                                fontSize: '0.8rem',
                                            }}>
                                                <span style={{ color: '#666' }}>Address:</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ color: '#aaa' }}>{contract.address}</span>
                                                    <Copy
                                                        size={14}
                                                        style={{ cursor: 'pointer', color: copied === contract.address ? '#00E676' : '#555' }}
                                                        onClick={(e) => { e.stopPropagation(); copyAddress(contract.address); }}
                                                    />
                                                    <a 
                                                        href={`https://testnet.bscscan.com/address/${contract.address}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ color: '#FCD335', display: 'flex', alignItems: 'center' }}
                                                    >
                                                        <ExternalLink size={14} />
                                                    </a>
                                                </div>
                                            </div>

                                            {/* Functions */}
                                            <h4 style={{ color: '#FCD335', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                                                FUNCTIONS
                                            </h4>
                                            <div style={{ display: 'grid', gap: '6px' }}>
                                                {contract.functions.map((fn, i) => (
                                                    <div key={i} style={{
                                                        background: '#0c0c14',
                                                        borderRadius: '8px',
                                                        padding: '10px 14px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <span style={{
                                                                width: 6, height: 6,
                                                                borderRadius: '50%',
                                                                background: fn.type === 'write' ? '#FF5252' : '#00E676',
                                                            }} />
                                                            <code style={{ color: '#fff', fontSize: '0.8rem' }}>{fn.name}()</code>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <span style={{ color: '#666', fontSize: '0.75rem' }}>{fn.desc}</span>
                                                            <span style={{
                                                                background: fn.type === 'write' ? 'rgba(255,82,82,0.1)' : 'rgba(0,230,118,0.1)',
                                                                color: fn.type === 'write' ? '#FF5252' : '#00E676',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: 600,
                                                            }}>
                                                                {fn.type.toUpperCase()}
                                                            </span>
                                                            <span style={{ color: '#555', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                                                ⛽ {fn.gas}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Safety Features */}
                                            <h4 style={{ color: '#FCD335', fontSize: '0.75rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.75rem' }}>
                                                SAFETY FEATURES
                                            </h4>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {contract.safety.map((s, i) => (
                                                    <span key={i} style={{
                                                        background: 'rgba(0,230,118,0.08)',
                                                        border: '1px solid rgba(0,230,118,0.15)',
                                                        color: '#00E676',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 500,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                    }}>
                                                        <Shield size={10} /> {s}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>

                {/* Arbitrage Simulator */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
                >
                    <h3 style={{ color: '#FCD335', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ArrowRightLeft size={16} /> LIVE ARBITRAGE SIMULATOR
                    </h3>

                    {/* Controls */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                            <label style={{ color: '#888', fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>Token In</label>
                            <select
                                value={tokenIn} onChange={e => setTokenIn(e.target.value)}
                                style={{
                                    background: '#0c0c14', border: '1px solid #1a1a24', color: '#fff',
                                    padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', minWidth: 100,
                                }}
                            >
                                {tokens.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <ArrowRightLeft size={18} color="#555" style={{ marginBottom: '8px' }} />
                        <div>
                            <label style={{ color: '#888', fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>Token Out</label>
                            <select
                                value={tokenOut} onChange={e => setTokenOut(e.target.value)}
                                style={{
                                    background: '#0c0c14', border: '1px solid #1a1a24', color: '#fff',
                                    padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', minWidth: 100,
                                }}
                            >
                                {tokens.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ color: '#888', fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>Amount</label>
                            <input
                                type="number" value={amount} onChange={e => setAmount(e.target.value)}
                                style={{
                                    background: '#0c0c14', border: '1px solid #1a1a24', color: '#fff',
                                    padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', width: 120,
                                }}
                            />
                        </div>
                        <button
                            onClick={() => { runSimulation(); fetchReserves(); }}
                            disabled={simLoading}
                            style={{
                                background: simLoading ? '#333' : 'linear-gradient(135deg, #FCD335, #e5b800)',
                                color: '#000',
                                border: 'none',
                                padding: '8px 20px',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: simLoading ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            {simLoading ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
                            {simLoading ? 'Simulating...' : 'Simulate'}
                        </button>
                    </div>

                    {/* Simulation Results */}
                    {simulation && (
                        <div>
                            {/* DEX Prices Grid — valid quotes */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                                {simulation.dex_prices && Object.entries(simulation.dex_prices).map(([dex, info]) => (
                                    <div key={dex} style={{
                                        background: dex === simulation.best_sell ? 'rgba(0,230,118,0.06)' :
                                            dex === simulation.best_buy ? 'rgba(255,82,82,0.06)' : '#0c0c14',
                                        border: `1px solid ${dex === simulation.best_sell ? 'rgba(0,230,118,0.2)' :
                                            dex === simulation.best_buy ? 'rgba(255,82,82,0.2)' : '#1a1a24'}`,
                                        borderRadius: '10px',
                                        padding: '12px',
                                        textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                            {dex}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                                            {info.amount_out?.toFixed(6)}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#555', marginTop: '2px' }}>
                                            Fee: {info.fee}
                                        </div>
                                        {dex === simulation.best_sell && (
                                            <span style={{ fontSize: '0.6rem', color: '#00E676', fontWeight: 700 }}>▲ HIGHEST</span>
                                        )}
                                        {dex === simulation.best_buy && (
                                            <span style={{ fontSize: '0.6rem', color: '#FF5252', fontWeight: 700 }}>▼ LOWEST</span>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Excluded DEXes — low liquidity */}
                            {simulation.excluded_dexes && Object.keys(simulation.excluded_dexes).length > 0 && (
                                <div style={{
                                    background: 'rgba(255,152,0,0.04)',
                                    border: '1px solid rgba(255,152,0,0.12)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                }}>
                                    <AlertTriangle size={14} color="#FF9800" />
                                    <span style={{ color: '#FF9800', fontSize: '0.75rem', fontWeight: 600 }}>
                                        Low Liquidity:
                                    </span>
                                    <span style={{ color: '#888', fontSize: '0.75rem' }}>
                                        {Object.entries(simulation.excluded_dexes).map(([dex, info]) =>
                                            `${dex} (${info.amount_out?.toFixed(4)} ${tokenOut})`
                                        ).join(', ')} — excluded from spread calculation
                                    </span>
                                </div>
                            )}

                            {/* Opportunity Summary */}
                            {simulation.best_buy && simulation.best_sell ? (
                                <div style={{
                                    background: simulation.profitable ? 'rgba(0,230,118,0.05)' : 'rgba(255,152,0,0.05)',
                                    border: `1px solid ${simulation.profitable ? 'rgba(0,230,118,0.15)' : 'rgba(255,152,0,0.15)'}`,
                                    borderRadius: '10px',
                                    padding: '14px 18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        {simulation.profitable ?
                                            <CheckCircle2 size={20} color="#00E676" /> :
                                            <AlertTriangle size={20} color="#FF9800" />
                                        }
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                                                {simulation.profitable ? 'Arbitrage Opportunity Detected' : 'No Profitable Opportunity'}
                                            </div>
                                            <div style={{ color: '#888', fontSize: '0.8rem' }}>
                                                Buy on <strong style={{ color: '#FF5252' }}>{simulation.best_buy}</strong> → Sell on <strong style={{ color: '#00E676' }}>{simulation.best_sell}</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ color: simulation.profitable ? '#00E676' : '#FF9800', fontSize: '1.2rem', fontWeight: 700 }}>
                                            {simulation.spread_pct?.toFixed(4)}%
                                        </div>
                                        <div style={{ color: '#888', fontSize: '0.75rem' }}>
                                            Est. profit: ${simulation.estimated_profit?.toFixed(4)}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{
                                    background: 'rgba(255,82,82,0.05)',
                                    border: '1px solid rgba(255,82,82,0.15)',
                                    borderRadius: '10px',
                                    padding: '14px 18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                }}>
                                    <AlertTriangle size={20} color="#FF5252" />
                                    <div style={{ color: '#FF5252', fontWeight: 700, fontSize: '0.9rem' }}>
                                        Insufficient DEX quotes — not enough pools with liquidity for this pair
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>

                {/* DEX Routers */}
                {contracts?.dex_routers && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                        className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}
                    >
                        <h3 style={{ color: '#FCD335', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Database size={16} /> CONNECTED DEX ROUTERS
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                            {Object.entries(contracts.dex_routers).map(([key, dex]) => (
                                <div key={key} style={{
                                    background: '#0c0c14',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    border: '1px solid #1a1a24',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>{dex.name}</span>
                                        <span style={{
                                            background: 'rgba(0,230,118,0.1)',
                                            color: '#00E676',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                        }}>LIVE</span>
                                    </div>
                                    <div style={{
                                        fontFamily: 'monospace', fontSize: '0.7rem', color: '#666',
                                        background: '#08080e', padding: '6px 10px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <span>{dex.address.slice(0, 10)}...{dex.address.slice(-8)}</span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Copy
                                                size={12}
                                                style={{ cursor: 'pointer', color: copied === dex.address ? '#00E676' : '#444' }}
                                                onClick={() => copyAddress(dex.address)}
                                            />
                                            <a href={`https://bscscan.com/address/${dex.address}`} target="_blank" rel="noreferrer">
                                                <ExternalLink size={12} color="#444" />
                                            </a>
                                        </div>
                                    </div>
                                    <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '6px' }}>
                                        Swap Fee: <span style={{ color: '#FCD335' }}>{dex.fee}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Liquidity Reserves */}
                {reserves?.reserves && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                        className="glass-card" style={{ padding: '1.5rem' }}
                    >
                        <h3 style={{ color: '#FCD335', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Wallet size={16} /> LIQUIDITY RESERVES — {tokenIn}/{tokenOut}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                            {Object.entries(reserves.reserves).map(([dex, data]) => (
                                <div key={dex} style={{
                                    background: '#0c0c14',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    border: '1px solid #1a1a24',
                                }}>
                                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '10px' }}>
                                        {dex}
                                    </div>
                                    {data.pair && data.reserve_a !== undefined ? (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <span style={{ color: '#888', fontSize: '0.8rem' }}>{tokenIn} Reserve</span>
                                                <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                    {data.reserve_a?.toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <span style={{ color: '#888', fontSize: '0.8rem' }}>{tokenOut} Reserve</span>
                                                <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                                    {data.reserve_b?.toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{
                                                fontFamily: 'monospace', fontSize: '0.65rem', color: '#555',
                                                background: '#08080e', padding: '4px 8px', borderRadius: '4px', marginTop: '6px',
                                            }}>
                                                Pair: {data.pair?.slice(0, 10)}...{data.pair?.slice(-8)}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: '#555', fontSize: '0.8rem' }}>No pair found</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </main>
        </div>
    );
};

export default ContractsPage;
