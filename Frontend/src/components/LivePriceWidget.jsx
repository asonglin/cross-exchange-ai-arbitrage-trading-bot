import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const LivePriceWidget = () => {
    const [prices, setPrices] = useState([]);

    useEffect(() => {
        const fetchPrices = async () => {
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
                const data = await res.json();
                const top = data
                    .filter(d => d.symbol.endsWith('USDT'))
                    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                    .slice(0, 6);
                setPrices(top);
            } catch { }
        };
        fetchPrices();
        const interval = setInterval(fetchPrices, 10000);
        return () => clearInterval(interval);
    }, []);

    const icons = { BTC: '₿', ETH: 'Ξ', BNB: '🔶', SOL: '◎', XRP: '✕', DOGE: 'Ð', USDC: '$', USDT: '₮', ADA: '₳', AVAX: '🔺' };

    if (prices.length === 0) return null;

    return (
        <div className="live-prices-grid">
            {prices.map((coin, i) => {
                const sym = coin.symbol.replace('USDT', '');
                const change = parseFloat(coin.priceChangePercent);
                return (
                    <motion.div
                        key={coin.symbol}
                        className="live-price-card"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.08 }}
                    >
                        <div className="lpc-top">
                            <span className="lpc-icon">{icons[sym] || sym.charAt(0)}</span>
                            <span className={`lpc-change ${change >= 0 ? 'up' : 'down'}`}>
                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                            </span>
                        </div>
                        <div className="lpc-name">{sym}</div>
                        <div className="lpc-price">${parseFloat(coin.lastPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        <div className="lpc-vol">Vol: {(parseFloat(coin.quoteVolume) / 1e9).toFixed(2)}B</div>
                    </motion.div>
                );
            })}
        </div>
    );
};

export default LivePriceWidget;
