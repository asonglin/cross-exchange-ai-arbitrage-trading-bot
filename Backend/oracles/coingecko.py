"""
CoinGecko Oracle — Aggregated Market Data
Free API, no key needed. Provides aggregated prices from 700+ exchanges.
Rate-limit aware: caches for 30s, backs off on 429 responses.
"""
import httpx
import time
from typing import Dict, List, Optional

# CoinGecko uses slug IDs, not ticker symbols
SYMBOL_TO_CG_ID = {
    "BTCUSDT": "bitcoin",
    "ETHUSDT": "ethereum",
    "BNBUSDT": "binancecoin",
    "SOLUSDT": "solana",
    "XRPUSDT": "ripple",
    "DOGEUSDT": "dogecoin",
    "ADAUSDT": "cardano",
    "AVAXUSDT": "avalanche-2",
    "DOTUSDT": "polkadot",
    "MATICUSDT": "matic-network",
}

# CoinGecko free tier updates every 30-60s — no point fetching faster
CACHE_TTL = 30
BACKOFF_SECONDS = 60  # Back off for 60s on rate limit


class CoinGeckoOracle:
    BASE_URL = "https://api.coingecko.com/api/v3"

    def __init__(self):
        self.name = "coingecko"
        self.last_fetch_ms = 0
        self._cache = {}
        self._cache_ts = 0
        self._backoff_until = 0  # Rate-limit backoff timestamp

    async def get_all_prices(self, symbols: List[str]) -> List[Dict]:
        """Fetch all coin prices in a single CoinGecko call (rate-limit friendly)."""
        t0 = time.time()

        # Return cache if still fresh or in rate-limit backoff
        if time.time() - self._cache_ts < CACHE_TTL and self._cache:
            return list(self._cache.values())
        if time.time() < self._backoff_until and self._cache:
            return list(self._cache.values())

        cg_ids = [SYMBOL_TO_CG_ID[s] for s in symbols if s in SYMBOL_TO_CG_ID]
        if not cg_ids:
            return []

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.get(
                    f"{self.BASE_URL}/simple/price",
                    params={
                        "ids": ",".join(cg_ids),
                        "vs_currencies": "usd",
                        "include_24hr_vol": "true",
                        "include_24hr_change": "true",
                        "include_last_updated_at": "true",
                    },
                )
                if res.status_code == 429:
                    # Rate limited — back off and serve cache
                    self._backoff_until = time.time() + BACKOFF_SECONDS
                    return list(self._cache.values()) if self._cache else []
                if res.status_code != 200:
                    print(f"⚠️ CoinGecko status {res.status_code}")
                    return list(self._cache.values()) if self._cache else []

                data = res.json()
                latency = round((time.time() - t0) * 1000, 1)
                self.last_fetch_ms = latency

                results = []
                for symbol in symbols:
                    cg_id = SYMBOL_TO_CG_ID.get(symbol)
                    if not cg_id or cg_id not in data:
                        continue
                    d = data[cg_id]
                    price = float(d.get("usd", 0))
                    if price <= 0:
                        continue  # Skip zero prices
                    entry = {
                        "source": self.name,
                        "symbol": symbol,
                        "price": price,
                        "bid": price,
                        "ask": price,
                        "spread_bps": 0,
                        "volume_24h": float(d.get("usd_24h_vol", 0)),
                        "change_pct": float(d.get("usd_24h_change", 0)),
                        "high_24h": 0,
                        "low_24h": 0,
                        "latency_ms": latency,
                        "timestamp": time.time(),
                    }
                    results.append(entry)
                    self._cache[symbol] = entry

                self._cache_ts = time.time()
                return results

        except Exception as e:
            print(f"❌ CoinGecko error: {e}")
            return list(self._cache.values()) if self._cache else []

    async def get_price(self, symbol: str) -> Optional[Dict]:
        """Get single price (uses batch internally)."""
        all_prices = await self.get_all_prices([symbol])
        return all_prices[0] if all_prices else None


coingecko_oracle = CoinGeckoOracle()
