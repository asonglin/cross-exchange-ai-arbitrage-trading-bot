import { useMemo } from 'react';

// ── SVG Network Graph showing price sources and flow ──
// Renders: 5 oracle nodes in a pentagon, center "ARBIX" hub, edges with spread labels

const SOURCES = ['Binance', 'CoinGecko', 'PancakeSwap', 'Jupiter', '1inch'];
const SOURCE_COLORS = {
    Binance: '#F0B90B',
    CoinGecko: '#8DC63F',
    PancakeSwap: '#D1884F',
    Jupiter: '#C7F284',
    '1inch': '#1B314F',
};

const NetworkGraph = ({ spreads = [], anomalies = [], anomalyTotalCount = 0, regime }) => {
    const W = 480, H = 400;
    const CX = W / 2, CY = H / 2;
    const R = 150; // radius of pentagon

    // Positions for each oracle (pentagon layout)
    const nodes = useMemo(() => {
        return SOURCES.map((name, i) => {
            const angle = (Math.PI * 2 * i) / SOURCES.length - Math.PI / 2;
            return {
                name,
                x: CX + R * Math.cos(angle),
                y: CY + R * Math.sin(angle),
                color: SOURCE_COLORS[name] || '#fff',
            };
        });
    }, []);

    // Find active edges (spreads between sources)
    const edges = useMemo(() => {
        if (!spreads.length) return [];
        const edgeMap = {};
        spreads.slice(0, 30).forEach(s => {
            const key = [s.source_a, s.source_b].sort().join('-');
            if (!edgeMap[key] || s.spread_pct > edgeMap[key].spread_pct) {
                edgeMap[key] = s;
            }
        });
        return Object.values(edgeMap).slice(0, 10).map(s => {
            const a = nodes.find(n => n.name.toLowerCase().includes(s.source_a?.toLowerCase()));
            const b = nodes.find(n => n.name.toLowerCase().includes(s.source_b?.toLowerCase()));
            if (!a || !b) return null;
            const intensity = Math.min(s.spread_pct / 0.3, 1);
            return { ...s, ax: a.x, ay: a.y, bx: b.x, by: b.y, intensity };
        }).filter(Boolean);
    }, [spreads, nodes]);

    const anomalyCount = anomalyTotalCount || anomalies.length;
    const regimeColor = {
        DISLOCATION: '#ff1744', VOLATILE: '#ff9100', RANGING: '#ffea00',
        TRENDING: '#00e676', CALM: '#40c4ff',
    }[regime?.regime] || '#666';

    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: '400px' }}>
            <defs>
                {/* Glow filter */}
                <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                <filter id="glow-strong">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                {/* Animated dash */}
                <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FCD535" stopOpacity="0.1" />
                    <stop offset="50%" stopColor="#FCD535" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#FCD535" stopOpacity="0.1" />
                </linearGradient>
            </defs>

            {/* Background grid */}
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
            </pattern>
            <rect width={W} height={H} fill="url(#grid)" />

            {/* Edges with spread data */}
            {edges.map((e, i) => (
                <g key={i}>
                    <line
                        x1={e.ax} y1={e.ay} x2={e.bx} y2={e.by}
                        stroke={`rgba(252,213,53,${0.08 + e.intensity * 0.4})`}
                        strokeWidth={1 + e.intensity * 2}
                        strokeDasharray={e.intensity > 0.5 ? '6,3' : '3,6'}
                    >
                        <animate
                            attributeName="stroke-dashoffset"
                            from="0" to="-18"
                            dur={`${2 - e.intensity}s`}
                            repeatCount="indefinite"
                        />
                    </line>
                    {/* Spread label on edge midpoint */}
                    <text
                        x={(e.ax + e.bx) / 2}
                        y={(e.ay + e.by) / 2 - 6}
                        textAnchor="middle"
                        fill={e.intensity > 0.3 ? '#ffd740' : 'rgba(255,255,255,0.3)'}
                        fontSize="9"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="600"
                    >
                        {e.spread_pct?.toFixed(4)}%
                    </text>
                    <text
                        x={(e.ax + e.bx) / 2}
                        y={(e.ay + e.by) / 2 + 6}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.2)"
                        fontSize="7"
                        fontFamily="JetBrains Mono, monospace"
                    >
                        {e.symbol?.replace('USDT', '')}
                    </text>
                </g>
            ))}

            {/* Center hub — ARBIX */}
            <circle cx={CX} cy={CY} r="32" fill="rgba(252,213,53,0.08)" stroke="#FCD535" strokeWidth="1.5" filter="url(#glow)" />
            <circle cx={CX} cy={CY} r="22" fill="rgba(0,0,0,0.6)" stroke="rgba(252,213,53,0.3)" strokeWidth="1" />
            <text x={CX} y={CY - 3} textAnchor="middle" fill="#FCD535" fontSize="10" fontWeight="800" fontFamily="Outfit, sans-serif">
                ARBIX
            </text>
            <text x={CX} y={CY + 9} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="6" fontFamily="JetBrains Mono, monospace">
                ENGINE
            </text>

            {/* Connecting lines from center to each node */}
            {nodes.map((n, i) => (
                <line key={`c-${i}`}
                    x1={CX} y1={CY} x2={n.x} y2={n.y}
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth="1"
                    strokeDasharray="4,8"
                />
            ))}

            {/* Oracle nodes */}
            {nodes.map((n, i) => {
                const hasAnomaly = anomalies.some(a =>
                    a.sources?.includes(n.name.toLowerCase()) || a.source === n.name.toLowerCase()
                );
                return (
                    <g key={i}>
                        {/* Pulse ring for active nodes */}
                        <circle cx={n.x} cy={n.y} r="28" fill="none" stroke={n.color} strokeWidth="0.5" opacity="0.3">
                            <animate attributeName="r" from="28" to="36" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" from="0.3" to="0" dur="2s" repeatCount="indefinite" />
                        </circle>
                        {/* Node circle */}
                        <circle cx={n.x} cy={n.y} r="24" fill="rgba(0,0,0,0.7)"
                            stroke={hasAnomaly ? '#ff5252' : n.color}
                            strokeWidth={hasAnomaly ? 2 : 1.5}
                            filter="url(#glow)"
                        />
                        {/* Inner ring */}
                        <circle cx={n.x} cy={n.y} r="16" fill={`${n.color}15`}
                            stroke={`${n.color}40`} strokeWidth="0.5"
                        />
                        {/* Name */}
                        <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
                            fill="#fff" fontSize="8" fontWeight="700" fontFamily="Inter, sans-serif"
                        >
                            {n.name.length > 8 ? n.name.slice(0, 7) + '…' : n.name}
                        </text>
                        {/* Status dot */}
                        <circle cx={n.x + 18} cy={n.y - 18} r="4"
                            fill={hasAnomaly ? '#ff5252' : '#69f0ae'}
                            filter="url(#glow)"
                        >
                            <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                    </g>
                );
            })}

            {/* Regime indicator — bottom left */}
            <rect x="10" y={H - 30} width="80" height="20" rx="4" fill="rgba(0,0,0,0.5)" stroke={regimeColor} strokeWidth="0.8" />
            <circle cx="22" cy={H - 20} r="3" fill={regimeColor}>
                <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
            </circle>
            <text x="30" y={H - 16} fill={regimeColor} fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
                {regime?.regime || 'N/A'}
            </text>

            {/* Anomaly count — bottom right */}
            {anomalyCount > 0 && (
                <g>
                    <rect x={W - 100} y={H - 30} width="90" height="20" rx="4" fill="rgba(255,23,68,0.1)" stroke="rgba(255,23,68,0.3)" strokeWidth="0.8" />
                    <text x={W - 50} y={H - 16} textAnchor="middle" fill="#ff5252" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace">
                        ⚠ {anomalyCount} anomalies
                    </text>
                </g>
            )}
        </svg>
    );
};

export default NetworkGraph;
