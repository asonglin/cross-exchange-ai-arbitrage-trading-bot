"""
Price Matrix — In-Memory Multi-Source Price Aggregator
Maintains a real-time matrix of prices from all oracles.
"""
import time
import asyncio
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

from oracles.binance import binance_oracle
from oracles.coingecko import coingecko_oracle
from oracles.pancakeswap import pancakeswap_oracle
from oracles.jupiter import jupiter_oracle
from oracles.oneinch import oneinch_oracle


TOP_COINS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
]

ORACLES = {
    "binance": binance_oracle,
    "coingecko": coingecko_oracle,
    "pancakeswap": pancakeswap_oracle,
    "jupiter": jupiter_oracle,
    "1inch": oneinch_oracle,
}


class PriceMatrix:
    """
    Maintains a matrix[symbol][source] = PricePoint
    Updated every cycle by collecting from all oracles in parallel.
    """

    def __init__(self):
        # matrix[symbol][source] = price_point_dict
        self.matrix: Dict[str, Dict[str, Dict]] = defaultdict(dict)
        self.last_update = 0
        self.update_count = 0
        self.source_latencies: Dict[str, float] = {}
        self.source_status: Dict[str, str] = {}

    async def update(self) -> Dict:
        """Fetch from ALL oracles in parallel, update the matrix."""
        t0 = time.time()

        # Fire all oracle fetches simultaneously
        tasks = {
            name: asyncio.create_task(oracle.get_all_prices(TOP_COINS))
            for name, oracle in ORACLES.items()
        }

        results = {}
        for name, task in tasks.items():
            try:
                data = await asyncio.wait_for(task, timeout=15)
                results[name] = data or []
                self.source_status[name] = "online"
            except asyncio.TimeoutError:
                results[name] = []
                self.source_status[name] = "timeout"
            except Exception as e:
                results[name] = []
                self.source_status[name] = f"error: {str(e)[:50]}"

        # Populate matrix — only accept valid prices (> 0)
        for source_name, price_list in results.items():
            for pp in price_list:
                symbol = pp["symbol"]
                price = pp.get("price", 0)
                if price and price > 0:
                    self.matrix[symbol][source_name] = pp
                else:
                    # Remove stale zero-price entries
                    self.matrix.get(symbol, {}).pop(source_name, None)
            self.source_latencies[source_name] = ORACLES[source_name].last_fetch_ms

        self.last_update = time.time()
        self.update_count += 1

        return self.get_summary()

    def get_summary(self) -> Dict:
        """Get a summary of the current state."""
        total_points = sum(len(sources) for sources in self.matrix.values())
        return {
            "update_count": self.update_count,
            "last_update": self.last_update,
            "symbols_tracked": len(self.matrix),
            "total_price_points": total_points,
            "source_status": dict(self.source_status),
            "source_latencies": dict(self.source_latencies),
        }

    def get_prices_for_symbol(self, symbol: str) -> Dict[str, Dict]:
        """Get all source prices for a specific symbol."""
        return dict(self.matrix.get(symbol, {}))

    def get_full_matrix(self) -> Dict:
        """Return the entire matrix as a serializable dict."""
        return {
            symbol: {
                source: {
                    "price": pp["price"],
                    "bid": pp.get("bid", pp["price"]),
                    "ask": pp.get("ask", pp["price"]),
                    "spread_bps": pp.get("spread_bps", 0),
                    "volume_24h": pp.get("volume_24h", 0),
                    "latency_ms": pp.get("latency_ms", 0),
                    "timestamp": pp.get("timestamp", 0),
                }
                for source, pp in sources.items()
            }
            for symbol, sources in self.matrix.items()
        }

    def get_spreads(self) -> List[Dict]:
        """Calculate all pairwise spreads for all symbols.
        Hard cap: only report spreads ≤ 10%. Anything higher is bad data, not a real opportunity."""
        MAX_SPREAD_PCT = 10.0  # Hard cap — anything above this is data noise
        spreads = []
        for symbol, sources in self.matrix.items():
            source_names = list(sources.keys())
            for i in range(len(source_names)):
                for j in range(i + 1, len(source_names)):
                    s1, s2 = source_names[i], source_names[j]
                    p1 = sources[s1]["price"]
                    p2 = sources[s2]["price"]
                    if p1 > 0 and p2 > 0:
                        spread_pct = abs(p1 - p2) / min(p1, p2) * 100
                        if spread_pct > MAX_SPREAD_PCT:
                            continue  # Data noise — skip
                        buy_on = s1 if p1 < p2 else s2
                        sell_on = s2 if p1 < p2 else s1
                        spreads.append({
                            "symbol": symbol,
                            "source_a": s1,
                            "source_b": s2,
                            "price_a": p1,
                            "price_b": p2,
                            "spread_pct": round(spread_pct, 4),
                            "spread_bps": round(spread_pct * 100, 2),
                            "direction": f"BUY on {buy_on} → SELL on {sell_on}",
                            "buy_price": min(p1, p2),
                            "sell_price": max(p1, p2),
                            "gross_profit_per_1000": round((max(p1, p2) - min(p1, p2)) / min(p1, p2) * 1000, 4),
                        })
        spreads.sort(key=lambda x: x["spread_pct"], reverse=True)
        return spreads


# Global singleton
price_matrix = PriceMatrix()
