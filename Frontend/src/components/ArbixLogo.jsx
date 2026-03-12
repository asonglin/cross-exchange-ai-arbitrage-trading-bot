
const ArbixLogo = ({ size = 'default' }) => {
    const sizes = {
        small: { icon: 24, text: '1rem', gap: '0.4rem' },
        default: { icon: 32, text: '1.5rem', gap: '0.5rem' },
        large: { icon: 40, text: '2rem', gap: '0.6rem' },
    };
    const s = sizes[size];
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
            <svg width={s.icon} height={s.icon} viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="10" fill="#FCD535" />
                <path d="M20 8L28 28H22L20 22.5L18 28H12L20 8Z" fill="#000" strokeLinejoin="round" />
                <circle cx="20" cy="14" r="2" fill="#000" opacity="0.3" />
            </svg>
            <span style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: s.text,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: '#fff',
            }}>
                ARB<span style={{ color: '#FCD535' }}>IX</span>
            </span>
        </div>
    );
};

export default ArbixLogo;
