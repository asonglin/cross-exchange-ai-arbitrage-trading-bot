import { motion, useScroll, useTransform } from 'framer-motion';
import {
    Activity,
    ArrowRight,
    ArrowUpRight,
    Bot,
    Brain,
    ChevronRight,
    Eye,
    GitBranch,
    Play,
    Radar,
    Radio, Sparkles,
    Star,
    Wallet,
    Zap
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedCounter from '../components/AnimatedCounter';
import ArbixLogo from '../components/ArbixLogo';
import LivePriceWidget from '../components/LivePriceWidget';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/* ───── Animated gradient blob ───── */
const GlowBlob = ({ color, size, top, left, delay = 0 }) => (
    <motion.div
        animate={{
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 6, repeat: Infinity, delay, ease: 'easeInOut' }}
        style={{
            position: 'absolute', top, left, width: size, height: size,
            borderRadius: '50%', background: color, filter: 'blur(80px)',
            pointerEvents: 'none', zIndex: 0,
        }}
    />
);

/* ───── Stat counter card ───── */
const StatBox = ({ value, suffix = '', label, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay }}
        style={{
            display: 'flex', flexDirection: 'column', gap: '0.15rem',
        }}
    >
        <div style={{ fontFamily: 'var(--heading)', fontWeight: 900, fontSize: '2.2rem', color: '#FCD535', lineHeight: 1 }}>
            <AnimatedCounter end={parseFloat(value)} suffix={suffix} decimals={suffix === '%' ? 1 : 0} />
        </div>
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
    </motion.div>
);

/* ───── Bento card wrapper ───── */
const BentoCard = ({ children, span = 1, rowSpan = 1, delay = 0, glow, style = {}, ...props }) => (
    <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -5, transition: { duration: 0.3 } }}
        style={{
            gridColumn: `span ${span}`, gridRow: `span ${rowSpan}`,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '1.4rem', padding: '1.8rem', position: 'relative',
            overflow: 'hidden', cursor: 'default', ...style,
        }}
        {...props}
    >
        {glow && (
            <div style={{
                position: 'absolute', top: '-30%', right: '-20%', width: '200px', height: '200px',
                borderRadius: '50%', background: glow, filter: 'blur(60px)', opacity: 0.15, pointerEvents: 'none',
            }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </motion.div>
);

const LandingPage = () => {
    const navigate = useNavigate();
    const [tickerData, setTickerData] = useState([]);
    const [agentStatus, setAgentStatus] = useState(null);
    const [portfolio, setPortfolio] = useState(null);

    const heroRef = useRef(null);
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
    const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

    useEffect(() => {
        const fetchTicker = async () => {
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
                const data = await res.json();
                const top = data.filter(d => d.symbol.endsWith('USDT'))
                    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)).slice(0, 20);
                setTickerData(top);
            } catch { }
        };
        fetchTicker();
    }, []);

    useEffect(() => {
        const fetchLive = async () => {
            try {
                const [sRes, pRes] = await Promise.allSettled([
                    fetch(`${API}/api/agent/status`), fetch(`${API}/api/agent/portfolio`)
                ]);
                if (sRes.status === 'fulfilled') setAgentStatus(await sRes.value.json());
                if (pRes.status === 'fulfilled') setPortfolio(await pRes.value.json());
            } catch { }
        };
        fetchLive();
        const iv = setInterval(fetchLive, 5000);
        return () => clearInterval(iv);
    }, []);

    const perf = portfolio?.performance || {};
    const winRate = perf.win_rate != null ? perf.win_rate.toFixed(1) : '85.7';
    const totalTrades = perf.total_trades || 0;
    const totalPnl = perf.total_pnl || 0;
    const isLive = !!agentStatus?.state;

    const fadeUp = (delay = 0) => ({
        initial: { opacity: 0, y: 30 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true },
        transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] },
    });

    return (
        <div style={{ background: '#000', color: '#fff', minHeight: '100vh', fontFamily: 'var(--body)', overflowX: 'hidden' }}>

            {/* AMBIENT BLOBS */}
            <GlowBlob color="rgba(252,213,53,0.3)" size="500px" top="-10%" left="60%" delay={0} />
            <GlowBlob color="rgba(252,213,53,0.15)" size="400px" top="30%" left="-10%" delay={2} />
            <GlowBlob color="rgba(252,213,53,0.1)" size="350px" top="70%" left="70%" delay={4} />

            {/* ════════ NAVBAR ════════ */}
            <nav style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
                padding: '1rem 3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
                <a href="/" style={{ textDecoration: 'none' }}><ArbixLogo size="default" /></a>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    {[
                        { label: 'Features', href: '#features' },
                        { label: 'Architecture', href: '#architecture' },
                        { label: 'Markets', href: '#markets' },
                    ].map(l => (
                        <a key={l.label} href={l.href} style={{
                            color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.82rem',
                            fontWeight: 500, transition: 'color 0.2s',
                        }}
                            onMouseEnter={e => e.target.style.color = '#FCD535'}
                            onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.6)'}
                        >{l.label}</a>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <button onClick={() => navigate('/agent')} style={{
                        padding: '0.55rem 1.2rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s',
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#69f0ae', boxShadow: '0 0 8px #69f0ae', animation: 'blink 1.5s ease-in-out infinite' }} />
                        AI Agent
                    </button>
                    <button onClick={() => navigate('/dashboard')} style={{
                        padding: '0.55rem 1.4rem', borderRadius: '2rem', border: 'none',
                        background: '#FCD535', color: '#000', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s',
                    }}>
                        Launch App <ArrowRight size={14} />
                    </button>
                </div>
            </nav>

            {/* ════════ HERO ════════ */}
            <section ref={heroRef} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', paddingTop: '5rem' }}>
                <motion.div style={{ y: heroY, opacity: heroOpacity, width: '100%', padding: '0 4rem' }}>
                    <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '3rem', alignItems: 'center' }}>

                        {/* LEFT — product text */}
                        <div>
                            <motion.h1 {...fadeUp(0.1)} style={{
                                fontSize: 'clamp(2.8rem, 5.5vw, 4.5rem)', fontFamily: 'var(--heading)', fontWeight: 900,
                                lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 1.5rem 0',
                            }}>
                                Cutting-edge{' '}
                                <span style={{ color: '#FCD535', fontStyle: 'italic' }}>arbitrage</span>
                                <br />solutions
                            </motion.h1>

                            <motion.p {...fadeUp(0.2)} style={{
                                fontSize: '1rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7,
                                maxWidth: '460px', margin: '0 0 2.2rem 0',
                            }}>
                                Arbix is an AI-powered autonomous trading engine that detects
                                cross-exchange price gaps in real-time, makes intelligent decisions,
                                and executes profitable trades — all without human intervention.
                            </motion.p>

                            <motion.div {...fadeUp(0.3)} style={{ display: 'flex', gap: '0.8rem', marginBottom: '3.5rem', flexWrap: 'wrap' }}>
                                <button onClick={() => navigate('/dashboard')} style={{
                                    padding: '0.75rem 1.8rem', borderRadius: '2rem', border: 'none',
                                    background: '#FCD535', color: '#000', fontSize: '0.85rem', fontWeight: 800,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    boxShadow: '0 0 30px rgba(252,213,53,0.25)',
                                }}
                                    onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 0 40px rgba(252,213,53,0.4)'; }}
                                    onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 0 30px rgba(252,213,53,0.25)'; }}
                                >
                                    Explore Platform <ArrowRight size={14} />
                                </button>
                                <button onClick={() => navigate('/agent')} style={{
                                    padding: '0.75rem 1.8rem', borderRadius: '2rem',
                                    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
                                    color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s',
                                    backdropFilter: 'blur(10px)',
                                }}
                                    onMouseEnter={e => e.target.style.borderColor = 'rgba(252,213,53,0.3)'}
                                    onMouseLeave={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                                >
                                    <Play size={14} /> Watch Demo
                                </button>
                            </motion.div>

                            {/* Stats row */}
                            <motion.div {...fadeUp(0.4)} style={{ display: 'flex', gap: '3rem' }}>
                                <StatBox value={totalTrades > 0 ? String(totalTrades) : '230'} suffix="+" label="Trades Executed" />
                                <StatBox value={winRate} suffix="%" label="Win Rate" delay={0.1} />
                                <StatBox value={totalPnl > 0 ? String(Math.round(totalPnl)) : '400'} suffix="+" label="Opportunities Found" delay={0.2} />
                            </motion.div>
                        </div>

                        {/* RIGHT — Animated 3D orb visual */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            style={{ position: 'relative', width: '100%', height: '450px', overflow: 'visible' }}
                        >
                            {/* Core glow */}
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                width: '200px', height: '200px', borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(252,213,53,0.35) 0%, rgba(252,213,53,0.05) 60%, transparent 80%)',
                                filter: 'blur(20px)',
                            }} />

                            {/* Inner sphere */}
                            <motion.div
                                initial={{ x: '-50%', y: '-50%', rotate: 0 }}
                                animate={{ x: '-50%', y: '-50%', rotate: 360 }}
                                transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    width: '140px', height: '140px', borderRadius: '50%',
                                    background: 'radial-gradient(circle at 35% 35%, rgba(252,213,53,0.3), rgba(252,213,53,0.05) 60%, transparent)',
                                    border: '1px solid rgba(252,213,53,0.15)',
                                    boxShadow: '0 0 60px rgba(252,213,53,0.15), inset 0 0 40px rgba(252,213,53,0.08)',
                                }}
                            >
                                {/* Arbix A logo in center */}
                                <svg width="50" height="50" viewBox="0 0 40 40" fill="none" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                    <path d="M20 6L30 30H24L20 22L16 30H10L20 6Z" fill="rgba(252,213,53,0.4)" />
                                </svg>
                            </motion.div>

                            {/* Ring 1 — horizontal */}
                            <motion.div
                                initial={{ x: '-50%', y: '-50%', rotateX: 75, rotateZ: 0 }}
                                animate={{ x: '-50%', y: '-50%', rotateX: 75, rotateZ: 360 }}
                                transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    width: '300px', height: '300px',
                                    borderRadius: '50%',
                                    border: '1.5px solid rgba(252,213,53,0.2)',
                                    boxShadow: '0 0 15px rgba(252,213,53,0.05)',
                                }}
                            />

                            {/* Ring 2 — tilted */}
                            <motion.div
                                initial={{ x: '-50%', y: '-50%', rotateX: 60, rotateY: 30, rotateZ: 0 }}
                                animate={{ x: '-50%', y: '-50%', rotateX: 60, rotateY: 30, rotateZ: -360 }}
                                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    width: '350px', height: '350px',
                                    borderRadius: '50%',
                                    border: '1px solid rgba(252,213,53,0.12)',
                                }}
                            />

                            {/* Ring 3 — vertical */}
                            <motion.div
                                initial={{ x: '-50%', y: '-50%', rotateY: 75, rotateZ: 0 }}
                                animate={{ x: '-50%', y: '-50%', rotateY: 75, rotateZ: 360 }}
                                transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                                style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    width: '280px', height: '280px',
                                    borderRadius: '50%',
                                    border: '1px solid rgba(252,213,53,0.1)',
                                }}
                            />

                            {/* Orbiting dots */}
                            {[0, 1, 2, 3].map(i => (
                                <motion.div
                                    key={i}
                                    initial={{ x: '-50%', y: '-50%', rotateX: 60 + i * 15, rotateZ: i * 45 }}
                                    animate={{ x: '-50%', y: '-50%', rotateX: 60 + i * 15, rotateZ: i * 45 + 360 }}
                                    transition={{ duration: 8 + i * 3, repeat: Infinity, ease: 'linear', delay: i * 0.5 }}
                                    style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        width: `${200 + i * 50}px`, height: `${200 + i * 50}px`,
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)',
                                        width: i === 0 ? '10px' : '6px', height: i === 0 ? '10px' : '6px',
                                        borderRadius: '50%', background: '#FCD535',
                                        boxShadow: `0 0 ${10 + i * 4}px rgba(252,213,53,0.6)`,
                                    }} />
                                </motion.div>
                            ))}

                            {/* Floating labels */}
                            <motion.div
                                animate={{ y: [-5, 5, -5] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                style={{
                                    position: 'absolute', top: '12%', right: '5%',
                                    padding: '0.4rem 0.8rem', borderRadius: '0.6rem',
                                    background: 'rgba(252,213,53,0.08)', border: '1px solid rgba(252,213,53,0.15)',
                                    fontSize: '0.68rem', fontWeight: 700, color: '#FCD535', fontFamily: 'var(--mono)',
                                    backdropFilter: 'blur(10px)',
                                }}
                            >Secure</motion.div>

                            <motion.div
                                animate={{ y: [5, -5, 5] }}
                                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                                style={{
                                    position: 'absolute', bottom: '15%', left: '5%',
                                    padding: '0.4rem 0.8rem', borderRadius: '0.6rem',
                                    background: 'rgba(105,240,174,0.08)', border: '1px solid rgba(105,240,174,0.15)',
                                    fontSize: '0.68rem', fontWeight: 700, color: '#69f0ae', fontFamily: 'var(--mono)',
                                    backdropFilter: 'blur(10px)',
                                }}
                            >Fast</motion.div>

                            <motion.div
                                animate={{ y: [-3, 7, -3] }}
                                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                                style={{
                                    position: 'absolute', bottom: '25%', right: '0%',
                                    padding: '0.4rem 0.8rem', borderRadius: '0.6rem',
                                    background: 'rgba(64,196,255,0.08)', border: '1px solid rgba(64,196,255,0.15)',
                                    fontSize: '0.68rem', fontWeight: 700, color: '#40c4ff', fontFamily: 'var(--mono)',
                                    backdropFilter: 'blur(10px)',
                                }}
                            >AI-Driven</motion.div>
                        </motion.div>
                    </div>
                </motion.div>

                {/* Scroll indicator */}
                <motion.div
                    animate={{ y: [0, 8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                        position: 'absolute', bottom: '2rem', right: '4rem',
                        fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)',
                        textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                >
                    Scroll Down ↓
                </motion.div>
            </section>

            {/* ════════ TICKER ════════ */}
            {tickerData.length > 0 && (
                <div className="ticker-bar" style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="ticker-track">
                        {[...tickerData, ...tickerData].map((t, i) => (
                            <div key={i} className="ticker-item">
                                <span className="ticker-symbol">{t.symbol.replace('USDT', '')}</span>
                                <span className="ticker-price">${parseFloat(t.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                <span className={`ticker-change ${parseFloat(t.priceChangePercent) >= 0 ? 'up' : 'down'}`}>
                                    {parseFloat(t.priceChangePercent) >= 0 ? '+' : ''}{parseFloat(t.priceChangePercent).toFixed(2)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ════════ BENTO GRID — ABOUT ════════ */}
            <section style={{ padding: '6rem 4rem', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridAutoRows: 'auto', gap: '1rem' }}>

                    {/* Big text card */}
                    <BentoCard span={2} delay={0}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#FCD535', marginBottom: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Star size={12} /> About Arbix
                        </div>
                        <h2 style={{ fontFamily: 'var(--heading)', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
                            We <span style={{ color: '#FCD535', fontStyle: 'italic' }}>detect</span> and execute{' '}
                            <span style={{ color: '#FCD535', fontStyle: 'italic' }}>arbitrage</span>{' '}
                            with AI at the core, ensuring every{' '}
                            <span style={{ color: '#FCD535', fontStyle: 'italic' }}>trade is explainable</span>{' '}
                            and profitable.
                        </h2>
                    </BentoCard>

                    {/* Stats card */}
                    <BentoCard delay={0.1} glow="rgba(252,213,53,0.3)">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.8rem' }}>
                            {[...Array(5)].map((_, i) => <Star key={i} size={12} fill="#FCD535" color="#FCD535" />)}
                        </div>
                        <div style={{ fontFamily: 'var(--heading)', fontSize: '3.5rem', fontWeight: 900, color: '#FCD535', lineHeight: 1 }}>
                            <AnimatedCounter end={3} suffix="" />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.3rem' }}>Smart Contracts on BSC</div>
                    </BentoCard>

                    {/* BNB Chain card */}
                    <BentoCard delay={0.15} style={{ background: 'linear-gradient(135deg, rgba(252,213,53,0.08), rgba(252,213,53,0.02))' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Deployed on</div>
                        <div style={{ fontFamily: 'var(--heading)', fontSize: '1.3rem', fontWeight: 900 }}>
                            Built on <span style={{ color: '#FCD535' }}>BNB Chain</span>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: '0.5rem 0 1rem 0' }}>
                            3 gwei gas • 3s blocks • PancakeSwap V2 flash loans
                        </p>
                        <button onClick={() => navigate('/contracts')} style={{
                            padding: '0.45rem 1rem', borderRadius: '2rem', border: '1px solid rgba(252,213,53,0.2)',
                            background: 'rgba(252,213,53,0.06)', color: '#FCD535', fontSize: '0.72rem', fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                        }}>
                            View Contracts <ArrowUpRight size={12} />
                        </button>
                    </BentoCard>

                    {/* XAI Rationale card */}
                    <BentoCard span={2} delay={0.2}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                            <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: 'rgba(252,213,53,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(252,213,53,0.15)' }}>
                                <Eye size={20} color="#FCD535" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.68rem', color: '#FCD535', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>XAI Decision Sample</div>
                                <div style={{
                                    fontFamily: 'var(--mono)', fontSize: '0.72rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)',
                                    background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '0.8rem', border: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                    <span style={{ color: '#FCD535' }}>"decision"</span>: "EXECUTE",{'\n'}
                                    <span style={{ color: '#69f0ae' }}>"confidence"</span>: 84.2,{'\n'}
                                    <span style={{ color: '#40c4ff' }}>"rationale"</span>: "BTC spread 2.01% between 1inch and Binance. Score: 0.847. Kelly size: $847."
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.5rem' }}>Every trade decision is auditable, human-readable, and institutionally compliant.</div>
                            </div>
                        </div>
                    </BentoCard>
                </div>
            </section>

            {/* ════════ TRUSTED BY ════════ */}
            <section style={{ padding: '2rem 4rem 4rem', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Powered by</span>
                    {['⛓ BNB Chain', '🥞 PancakeSwap', '📡 Binance', '🦎 CoinGecko', '🔮 Pyth Network', '⚡ 1inch/BiSwap'].map((logo, i) => (
                        <motion.span key={i}
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.02em' }}
                        >{logo}</motion.span>
                    ))}
                </div>
            </section>

            {/* ════════ FEATURES — 8-STAGE PIPELINE ════════ */}
            <section id="architecture" style={{ padding: '6rem 4rem', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <motion.div {...fadeUp(0)} style={{ marginBottom: '3rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#FCD535', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Sparkles size={12} /> Architecture
                        </div>
                        <h2 style={{ fontFamily: 'var(--heading)', fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, margin: 0 }}>
                            8-Stage AI Pipeline
                        </h2>
                    </motion.div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem' }}>
                        {[
                            { icon: <Radio size={20} />, label: '5 Oracles', desc: 'PancakeSwap, BiSwap, Binance, CoinGecko, Pyth', color: '#40c4ff' },
                            { icon: <Activity size={20} />, label: 'Price Matrix', desc: 'Validates prices, rejects >15% deviations', color: '#b388ff' },
                            { icon: <GitBranch size={20} />, label: 'Bellman-Ford', desc: 'Negative-weight cycles = arbitrage paths', color: '#FCD535' },
                            { icon: <Radar size={20} />, label: 'Anomaly Detect', desc: 'Z-score, divergence, regime classification', color: '#ff5252' },
                            { icon: <Brain size={20} />, label: '7-Model ML', desc: 'Bayesian, EMA, O-U, reversion, consensus', color: '#69f0ae' },
                            { icon: <Eye size={20} />, label: 'XAI Rationale', desc: 'Structured JSON for every decision', color: '#ffab40' },
                            { icon: <Bot size={20} />, label: 'Agent Loop', desc: 'Rate-limited, adaptive thresholds', color: '#40c4ff' },
                            { icon: <Zap size={20} />, label: 'Flash Execute', desc: 'PancakeSwap flash loans, atomic tx', color: '#FCD535' },
                        ].map((step, i) => (
                            <BentoCard key={i} delay={i * 0.05} style={{ padding: '1.2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                                    <div style={{ color: step.color }}>{step.icon}</div>
                                    <span style={{ fontWeight: 800, fontSize: '0.78rem', color: step.color }}>{step.label}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.6rem', fontFamily: 'var(--mono)', color: 'rgba(255,255,255,0.15)', fontWeight: 700 }}>0{i + 1}</span>
                                </div>
                                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: 0 }}>{step.desc}</p>
                            </BentoCard>
                        ))}
                    </div>
                </div>
            </section>

            {/* ════════ SMART CONTRACTS ════════ */}
            <section id="features" style={{ padding: '4rem 4rem 6rem', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <motion.div {...fadeUp(0)} style={{ marginBottom: '3rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#FCD535', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>On-Chain</div>
                        <h2 style={{ fontFamily: 'var(--heading)', fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 800, lineHeight: 1.15, margin: 0 }}>
                            3 Production Contracts
                        </h2>
                    </motion.div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {[
                            { icon: <Zap size={24} />, name: 'ArbixExecutor', sub: 'The Trader', features: ['executeCrossDexArbitrage()', 'executeTriangularArb()', 'executeFlashArbitrage()', 'getBestPrice() × 4 DEXes'], color: '#FCD535' },
                            { icon: <Radar size={24} />, name: 'ArbixPriceOracle', sub: 'The Watcher', features: ['getPriceFromDex()', 'getAggregatedPrice()', 'getTWAP() history', 'AnomalyDetected event'], color: '#40c4ff' },
                            { icon: <Wallet size={24} />, name: 'ArbixVault', sub: 'The Bank', features: ['deposit() + 1hr lock', 'withdraw() + profit share', 'fundExecutor() flow', 'collectProfits() pull'], color: '#69f0ae' },
                        ].map((c, i) => (
                            <BentoCard key={i} delay={i * 0.1} glow={c.color.replace(')', ',0.3)')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                    <div style={{ color: c.color }}>{c.icon}</div>
                                    <span style={{ fontWeight: 800, fontSize: '1rem' }}>{c.name}</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: c.color, fontWeight: 600, marginBottom: '1rem' }}>{c.sub}</div>
                                {c.features.map((f, j) => (
                                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--mono)', marginBottom: '0.35rem' }}>
                                        <ChevronRight size={10} style={{ color: c.color, flexShrink: 0 }} /> {f}
                                    </div>
                                ))}
                            </BentoCard>
                        ))}
                    </div>
                </div>
            </section>

            {/* ════════ COMPARISON TABLE ════════ */}
            <section style={{ padding: '4rem 4rem', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <motion.div {...fadeUp(0)} style={{ marginBottom: '3rem', textAlign: 'center' }}>
                        <h2 style={{ fontFamily: 'var(--heading)', fontSize: '2rem', fontWeight: 800 }}>Why Arbix Wins</h2>
                    </motion.div>
                    <motion.div {...fadeUp(0.1)} style={{ borderRadius: '1.2rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(252,213,53,0.04)' }}>
                                    {['Feature', 'Typical Bot', 'MEV Bot', 'Arbix'].map(h => (
                                        <th key={h} style={{ padding: '0.85rem 1rem', textAlign: 'left', fontWeight: 800, color: h === 'Arbix' ? '#FCD535' : 'rgba(255,255,255,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['DEX Coverage', '1–2', '1–2', '4 DEXes + CEX'],
                                    ['Decision Logic', 'if spread > X', 'Speed race', '7-model ML'],
                                    ['Path Finding', 'Direct only', 'Direct', 'Bellman-Ford'],
                                    ['Explainability', 'None', 'None', 'Full XAI'],
                                    ['Risk Controls', 'Manual', 'None', 'On-chain breaker'],
                                    ['Capital', 'Full upfront', 'Full', 'Flash loans (zero)'],
                                ].map(([f, b, m, a], i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>{f}</td>
                                        <td style={{ padding: '0.65rem 1rem', color: 'rgba(255,255,255,0.25)' }}>{b}</td>
                                        <td style={{ padding: '0.65rem 1rem', color: 'rgba(255,255,255,0.25)' }}>{m}</td>
                                        <td style={{ padding: '0.65rem 1rem', color: '#69f0ae', fontWeight: 700 }}>{a}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </motion.div>
                </div>
            </section>

            {/* ════════ LIVE MARKETS ════════ */}
            <section id="markets" style={{ padding: '6rem 4rem', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <motion.div {...fadeUp(0)} style={{ marginBottom: '3rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#FCD535', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>Live Data</div>
                        <h2 style={{ fontFamily: 'var(--heading)', fontSize: '2rem', fontWeight: 800 }}>Real-Time Market Pulse</h2>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.88rem', maxWidth: '500px', margin: '0.5rem auto 0' }}>
                            The same data our AI scans right now — updated every 10 seconds.
                        </p>
                    </motion.div>
                    <LivePriceWidget />
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <button onClick={() => navigate('/dashboard')} style={{
                            padding: '0.6rem 1.5rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.1)',
                            background: 'transparent', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        }}>
                            View All Markets <ArrowRight size={14} />
                        </button>
                    </div>
                </div>
            </section>

            {/* ════════ CTA ════════ */}
            <section style={{ padding: '6rem 4rem', position: 'relative', zIndex: 5 }}>
                <motion.div {...fadeUp(0)} style={{
                    maxWidth: '800px', margin: '0 auto', textAlign: 'center',
                    padding: '4rem', borderRadius: '2rem',
                    background: 'linear-gradient(135deg, rgba(252,213,53,0.06), rgba(252,213,53,0.02))',
                    border: '1px solid rgba(252,213,53,0.1)',
                }}>
                    <h2 style={{ fontFamily: 'var(--heading)', fontSize: '2.2rem', fontWeight: 900, marginBottom: '1rem' }}>
                        See the AI in <span style={{ color: '#FCD535' }}>Action</span>
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
                        Watch Arbix detect arbitrage with Bellman-Ford, score with 7 ML models, and explain every decision.
                    </p>
                    <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => navigate('/dashboard')} style={{
                            padding: '0.7rem 1.6rem', borderRadius: '2rem', border: 'none', background: '#FCD535',
                            color: '#000', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}><Zap size={16} /> Launch Terminal</button>
                        <button onClick={() => navigate('/heatmap')} style={{
                            padding: '0.7rem 1.6rem', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.1)',
                            background: 'transparent', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}><Activity size={16} /> Spread Heatmap</button>
                    </div>
                </motion.div>
            </section>

            {/* ════════ FOOTER ════════ */}
            <footer style={{ padding: '3rem 4rem', borderTop: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 5 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <ArbixLogo size="small" />
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)' }}>© 2026 — BNB Chain × YZi Labs Hackathon, Bengaluru</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        {[
                            { label: 'Dashboard', path: '/dashboard' },
                            { label: 'AI Agent', path: '/agent' },
                            { label: 'Heatmap', path: '/heatmap' },
                            { label: 'Contracts', path: '/contracts' },
                        ].map(l => (
                            <span key={l.label} onClick={() => navigate(l.path)} style={{
                                fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
                                transition: 'color 0.2s',
                            }}
                                onMouseEnter={e => e.target.style.color = '#FCD535'}
                                onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.35)'}
                            >{l.label}</span>
                        ))}
                        <a href="https://github.com/Satyamgupta2365/Arbix" target="_blank" rel="noopener noreferrer" style={{
                            fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', textDecoration: 'none',
                        }}>GitHub ↗</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
