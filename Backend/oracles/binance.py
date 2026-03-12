"""
Binance Oracle — CEX Price Feed
Fetches real-time prices, 24h stats, and orderbook depth from Binance REST API.
"""
import httpx
import asyncio
import time
from typing import Dict, List, Optional


class BinanceOracle:
    BASE_URL = "https://api.binance.com/api/v3"

    def __init__(self):
        self.name = "binance"
        self.last_fetch_ms = 0

    async def get_price(self, symbol: str) -> Optional[Dict]:
        """Fetch single ticker price + 24h stats."""
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(f"{self.BASE_URL}/ticker/24hr", params={"symbol": symbol})
                if res.status_code != 200:
                    return None
                d = res.json()
                latency = round((time.time() - t0) * 1000, 1)
                self.last_fetch_ms = latency
                return {
                    "source": self.name,
                    "symbol": symbol,
                    "price": float(d["lastPrice"]),
                    "bid": float(d["bidPrice"]),
                    "ask": float(d["askPrice"]),
                    "spread_bps": round((float(d["askPrice"]) - float(d["bidPrice"])) / float(d["lastPrice"]) * 10000, 2),
                    "volume_24h": float(d["quoteVolume"]),
                    "change_pct": float(d["priceChangePercent"]),
                    "high_24h": float(d["highPrice"]),
                    "low_24h": float(d["lowPrice"]),
                    "latency_ms": latency,
                    "timestamp": time.time(),
                }
        except Exception as e:
            print(f"❌ Binance error for {symbol}: {e}")
            return None

    async def get_all_prices(self, symbols: List[str]) -> List[Dict]:
        """Fetch all symbols in parallel."""
        tasks = [self.get_price(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, dict)]

    async def get_orderbook_depth(self, symbol: str, limit: int = 20) -> Optional[Dict]:
        """Fetch orderbook depth to estimate slippage."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(f"{self.BASE_URL}/depth", params={"symbol": symbol, "limit": limit})
                if res.status_code != 200:
                    return None
                d = res.json()
                bid_depth = sum(float(b[1]) * float(b[0]) for b in d["bids"][:10])
                ask_depth = sum(float(a[1]) * float(a[0]) for a in d["asks"][:10])
                return {
                    "source": self.name,
                    "symbol": symbol,
                    "bid_depth_usd": round(bid_depth, 2),
                    "ask_depth_usd": round(ask_depth, 2),
                    "total_depth_usd": round(bid_depth + ask_depth, 2),
                    "best_bid": float(d["bids"][0][0]) if d["bids"] else 0,
                    "best_ask": float(d["asks"][0][0]) if d["asks"] else 0,
                }
        except Exception as e:
            print(f"❌ Binance depth error for {symbol}: {e}")
            return None


binance_oracle = BinanceOracle()
