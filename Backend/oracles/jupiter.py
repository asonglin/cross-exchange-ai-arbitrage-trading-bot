"""
Jupiter / Pyth Oracle — Solana Ecosystem Price Feed
Uses Pyth Network's Hermes API for decentralized, real-time oracle prices.
Pyth is the native oracle for Jupiter, Raydium, and all Solana DeFi.
Free, no auth, sub-second latency.
Batched requests (max 4 per call) to avoid Hermes 404 on long URLs.

Includes reference-price validation: discards any Pyth price that deviates
>15% from Binance spot (e.g. MATIC/POL rebrand mismatch).
"""
import asyncio
import httpx
import time
from typing import Dict, List, Optional

# Pyth Network price feed IDs (hex) — verified against hermes.pyth.network
# Source: https://pyth.network/developers/price-feed-ids
PYTH_FEEDS = {
    "BTCUSDT":   "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "ETHUSDT":   "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "SOLUSDT":   "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "BNBUSDT":   "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
    "XRPUSDT":   "0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
    "DOGEUSDT":  "0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",
    "ADAUSDT":   "0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d",
    "AVAXUSDT":  "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
    "DOTUSDT":   "0xca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b",
    "MATICUSDT": "0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472",
}

# Reverse map: feed_id -> symbol
FEED_TO_SYMBOL = {v: k for k, v in PYTH_FEEDS.items()}

HERMES_URL = "https://hermes.pyth.network/v2/updates/price/latest"
BATCH_SIZE = 4  # Hermes 404s on long URLs; keep ≤ 4 feeds per request

# Maximum allowed deviation from Binance reference price (15%)
MAX_DEVIATION_PCT = 15.0


async def _fetch_binance_reference(client: httpx.AsyncClient, symbols: List[str]) -> Dict[str, float]:
    """Fetch current Binance spot prices as a reference for sanity-checking."""
    ref = {}
    try:
        res = await client.get("https://api.binance.com/api/v3/ticker/price", timeout=8)
        for t in res.json():
            if t["symbol"] in symbols:
                ref[t["symbol"]] = float(t["price"])
    except Exception as e:
        print(f"⚠ Jupiter ref-price fetch failed: {e}")
    return ref


class JupiterOracle:
    """Uses Pyth Network for Solana-ecosystem oracle prices.
    
    Includes built-in reference validation: any Pyth price that deviates
    more than 15% from Binance spot is discarded (e.g. MATIC/POL rebrand).
    """

    def __init__(self):
        self.name = "jupiter"
        self.last_fetch_ms = 0
        self._cache = {}
        self._cache_ts = 0
        self._rejected: Dict[str, str] = {}

    async def get_price(self, symbol: str) -> Optional[Dict]:
        feed_id = PYTH_FEEDS.get(symbol)
        if not feed_id:
            return None
        if symbol in self._cache and time.time() - self._cache.get(f"{symbol}_ts", 0) < 10:
            return self._cache[symbol]
        try:
            t0 = time.time()
            async with httpx.AsyncClient(timeout=12) as client:
                res = await client.get(HERMES_URL, params={"ids[]": feed_id})
                if res.status_code != 200:
                    return self._cache.get(symbol)
                data = res.json()
                for parsed in data.get("parsed", []):
                    fid = "0x" + parsed["id"]
                    if fid == feed_id:
                        price = self._extract_price(parsed)
                        if price:
                            latency = round((time.time() - t0) * 1000, 1)
                            self.last_fetch_ms = latency
                            entry = self._build_entry(symbol, price, latency)
                            self._cache[symbol] = entry
                            self._cache[f"{symbol}_ts"] = time.time()
                            return entry
            return self._cache.get(symbol)
        except Exception as e:
            print(f"❌ Jupiter/Pyth error for {symbol}: {e}")
            return self._cache.get(symbol)

    async def _fetch_batch(self, client: httpx.AsyncClient, batch_symbols: List[str],
                           feed_ids: Dict[str, str], t0: float) -> List[Dict]:
        """Fetch a single batch of ≤ BATCH_SIZE feeds from Hermes."""
        params = [("ids[]", PYTH_FEEDS[s]) for s in batch_symbols]
        results = []
        try:
            res = await client.get(HERMES_URL, params=params)
            if res.status_code != 200:
                return results
            data = res.json()
            latency = round((time.time() - t0) * 1000, 1)
            self.last_fetch_ms = latency
            for parsed in data.get("parsed", []):
                fid = "0x" + parsed["id"]
                symbol = feed_ids.get(fid)
                if not symbol:
                    continue
                price = self._extract_price(parsed)
                if price and price > 0:
                    entry = self._build_entry(symbol, price, latency)
                    results.append(entry)
                    self._cache[symbol] = entry
        except Exception as e:
            print(f"❌ Jupiter/Pyth batch-chunk error: {e}")
        return results

    async def get_all_prices(self, symbols: List[str]) -> List[Dict]:
        t0 = time.time()
        if time.time() - self._cache_ts < 10 and len(self._cache) > 2:
            return [self._cache[s] for s in symbols if s in self._cache]

        valid = [s for s in symbols if s in PYTH_FEEDS]
        if not valid:
            return []

        feed_ids = {PYTH_FEEDS[s]: s for s in valid}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # Step 1: Fetch Binance reference prices for sanity checking
                ref_prices = await _fetch_binance_reference(client, valid)

                # Step 2: Fetch from Pyth in batches
                batches = [valid[i:i + BATCH_SIZE] for i in range(0, len(valid), BATCH_SIZE)]
                tasks = [self._fetch_batch(client, batch, feed_ids, t0) for batch in batches]
                batch_results = await asyncio.gather(*tasks)

                # Step 3: Validate against reference prices
                results = []
                self._rejected = {}
                for br in batch_results:
                    for entry in br:
                        symbol = entry["symbol"]
                        price = entry["price"]
                        ref = ref_prices.get(symbol)
                        if not ref or ref <= 0:
                            self._rejected[symbol] = "no Binance reference available"
                            self._cache.pop(symbol, None)
                            continue
                        deviation_pct = abs(price - ref) / ref * 100
                        if deviation_pct > MAX_DEVIATION_PCT:
                            self._rejected[symbol] = (
                                f"PYTH=${price:.6f} vs REF=${ref:.4f} "
                                f"({deviation_pct:.1f}% deviation > {MAX_DEVIATION_PCT}% limit)"
                            )
                            self._cache.pop(symbol, None)
                            continue
                        results.append(entry)

                self._cache_ts = time.time()
                rejected = len(self._rejected)
                if rejected > 0:
                    print(f"📊 Jupiter/Pyth: {len(results)} accepted, {rejected} rejected (price mismatch)")
                return results

        except Exception as e:
            print(f"❌ Jupiter/Pyth batch error: {e}")
            return [self._cache[s] for s in symbols if s in self._cache]

    def _extract_price(self, parsed: Dict) -> Optional[float]:
        """Extract USD price from Pyth parsed response."""
        price_data = parsed.get("price", {})
        try:
            price = int(price_data["price"]) * (10 ** int(price_data["expo"]))
            return price if price > 0 else None
        except (KeyError, ValueError):
            return None

    def _build_entry(self, symbol: str, price: float, latency: float) -> Dict:
        return {
            "source": self.name,
            "symbol": symbol,
            "price": round(price, 6),
            "bid": round(price * 0.9997, 6),
            "ask": round(price * 1.0003, 6),
            "spread_bps": 6.0,
            "volume_24h": 0,
            "change_pct": 0,
            "high_24h": 0,
            "low_24h": 0,
            "latency_ms": latency,
            "timestamp": time.time(),
        }


jupiter_oracle = JupiterOracle()
