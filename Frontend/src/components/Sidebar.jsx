import {
    Activity,
    BarChart3, Brain,
    FileCode2,
    Grid3X3,
    History,
    LayoutDashboard,
    Settings,
    Target, Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ArbixLogo from './ArbixLogo';

const Sidebar = ({ active = 'dashboard', topCoins = [], selectedCoin, onSelectCoin }) => {
    const navItems = [
        { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard', id: 'dashboard' },
        { to: '/coins', icon: <BarChart3 size={18} />, label: 'Markets', id: 'coins' },
        { to: '/agent', icon: <Brain size={18} />, label: 'AI Agent', id: 'agent' },
        { to: '/analytics', icon: <Activity size={18} />, label: 'Analytics', id: 'analytics' },
        { to: '/heatmap', icon: <Grid3X3 size={18} />, label: 'Heatmap', id: 'heatmap' },
        { to: '/history', icon: <History size={18} />, label: 'History', id: 'history' },
        { to: '/contracts', icon: <FileCode2 size={18} />, label: 'Contracts', id: 'contracts' },
        { to: '/settings', icon: <Settings size={18} />, label: 'Settings', id: 'settings' },
    ];

    return (
        <aside className="sidebar-new">
            <div className="sidebar-logo">
                <ArbixLogo size="small" />
            </div>

            <div className="sidebar-section-label">Terminal</div>
            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <Link
                        key={item.id}
                        to={item.to}
                        className={`sidebar-link ${active === item.id ? 'active' : ''}`}
                    >
                        {item.icon} {item.label}
                    </Link>
                ))}
                {active === 'dashboard' && (
                    <Link to="/agent" className="sidebar-link">
                        <Target size={18} /> Opportunities
                    </Link>
                )}
            </nav>

            {active === 'dashboard' && (
                <>
                    <div className="sidebar-section-label">Account</div>
                    <nav className="sidebar-nav">
                        <Link to="/analytics" className="sidebar-link">
                            <Wallet size={18} /> Portfolio
                        </Link>
                        <Link to="/settings" className="sidebar-link">
                            <Settings size={18} /> Settings
                        </Link>
                    </nav>
                </>
            )}

            {/* Live market mini-feed in sidebar (Dashboard only) */}
            {active === 'dashboard' && topCoins.length > 0 && (
                <>
                    <div className="sidebar-section-label" style={{ marginTop: '1.5rem' }}>Live Prices</div>
                    <div className="sidebar-prices">
                        {topCoins.slice(0, 5).map(c => {
                            const change = parseFloat(c.priceChangePercent);
                            return (
                                <div
                                    key={c.symbol}
                                    className="sidebar-price-row"
                                    onClick={() => onSelectCoin?.(c.symbol)}
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedCoin === c.symbol ? 'rgba(252,213,53,0.06)' : 'transparent',
                                    }}
                                >
                                    <span className="spr-symbol">{c.symbol.replace('USDT', '')}</span>
                                    <span className="spr-price">${parseFloat(c.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    <span className={`spr-change ${change >= 0 ? 'up' : 'down'}`}>
                                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            <div className="sidebar-footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <div className="status-dot-inline live" />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>Connected</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>BNB Chain • 14ms</div>
            </div>
        </aside>
    );
};

export default Sidebar;
