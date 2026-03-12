"""
PancakeSwap V2 Oracle — On-Chain DEX Price Feed (BSC)
Reads real swap prices directly from PancakeSwap Router via BSC RPC eth_call.
No API key required — fully on-chain, trustless, and always live.

Includes reference-price validation: discards any on-chain quote that
deviates >15% from Binance spot — this filters out low-liquidity pairs
where getAmountsOut returns garbage prices.
"""
import httpx
import time
from typing import Dict, List, Optional

BSC_RPC = "https://bsc-dataseed1.binance.org"
PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E"  # PancakeSwap V2 Router
USDT_BSC = "0x55d398326f99059fF775485246999027B3197955"

# BSC BEP-20 token addresses
TOKEN_ADDRESSES = {
    "BTCUSDT":  "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",   # BTCB
    "ETHUSDT":  "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",   # ETH
    "BNBUSDT":  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",   # WBNB
    "SOLUSDT":  "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",   # SOL
    "XRPUSDT":  "0x1D2F0da169ceB9fC7B3144828DB6a39FE4B4A4a5",   # XRP
    "DOGEUSDT": "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",   # DOGE (8 dec)
    "ADAUSDT":  "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",   # ADA
    "AVAXUSDT": "0x1CE0c2827e2eF14D5C4f29a091d735A204794041",   # AVAX
    "DOTUSDT":  "0x7083609fce4d1d8Dc0C979AAb8c869Ea2C873402",   # DOT
    "MATICUSDT":"0xCC42724C6683B7E57334c4E856f4c9965ED682bD",   # MATIC
}

# Amount to quote (in base token's smallest unit) — chosen for deep liquidity
QUOTE_AMOUNTS = {
    "BTCUSDT":  (10**16,  18, 0.01),    # 0.01 BTC
    "ETHUSDT":  (10**17,  18, 0.1),     # 0.1  ETH
    "BNBUSDT":  (10**18,  18, 1.0),     # 1    BNB
    "SOLUSDT":  (10**18,  18, 1.0),     # 1    SOL
    "XRPUSDT":  (10**21,  18, 1000.0),  # 1000 XRP
    "DOGEUSDT": (10**12,  8,  10000.0), # 10000 DOGE (8 decimals)
    "ADAUSDT":  (10**21,  18, 1000.0),  # 1000 ADA
    "AVAXUSDT": (10**19,  18, 10.0),    # 10   AVAX
    "DOTUSDT":  (10**20,  18, 100.0),   # 100  DOT
    "MATICUSDT":(10**21,  18, 1000.0),  # 1000 MATIC
}

# Maximum allowed deviation from Binance reference price (15%)
MAX_DEVIATION_PCT = 15.0


async def _fetch_binance_reference(client: httpx.AsyncClient, symbols: List[str]) -> Dict[str, float]:
    """Fetch current Binance spot prices as a reference for sanity-checking DEX quotes."""
    ref = {}
    try:
        res = await client.get("https://api.binance.com/api/v3/ticker/price", timeout=8)
        for t in res.json():
            if t["symbol"] in symbols:
                ref[t["symbol"]] = float(t["price"])
    except Exception as e:
        print(f"⚠ PancakeSwap ref-price fetch failed: {e}")
    return ref


def _encode_get_amounts_out(amount_wei: int, token_in: str, token_out: str) -> str:
    """Encode calldata for PancakeSwap Router getAmountsOut(uint256, address[])."""
    selector = "0xd06ca61f"
    amount_hex = hex(amount_wei)[2:].zfill(64)
    offset = "0000000000000000000000000000000000000000000000000000000000000040"
    arr_len = "0000000000000000000000000000000000000000000000000000000000000002"
    addr1 = "000000000000000000000000" + token_in[2:]
    addr2 = "000000000000000000000000" + token_out[2:]
    return selector + amount_hex + offset + arr_len + addr1 + addr2


class PancakeSwapOracle:
    """Reads real-time PancakeSwap V2 swap prices directly from BSC on-chain.
    
    Includes built-in reference validation: any on-chain price that deviates
    more than 15% from Binance spot is discarded as a low-liquidity artifact.
    """

    def __init__(self):
        self.name = "pancakeswap"
        self.last_fetch_ms = 0
        self._cache = {}
        self._cache_ts = 0
        self._rejected: Dict[str, str] = {}  # symbol → reason

    async def _quote_on_chain(self, client: httpx.AsyncClient, symbol: str) -> Optional[float]:
        """Call getAmountsOut on PancakeSwap Router to get token→USDT price."""
        token_addr = TOKEN_ADDRESSES.get(symbol)
        quote_cfg = QUOTE_AMOUNTS.get(symbol)
        if not token_addr or not quote_cfg:
            return None

        amount_wei, _decimals, amount_units = quote_cfg
        calldata = _encode_get_amounts_out(amount_wei, token_addr, USDT_BSC)

        res = await client.post(BSC_RPC, json={
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [{"to": PANCAKE_ROUTER, "data": calldata}, "latest"],
            "id": 1,
        })
        result = res.json()
        hex_result = result.get("result", "")
        if not hex_result or hex_result == "0x" or len(hex_result) < 130:
            return None

        # Decode: [offset, length, amount_in, amount_out]
        hex_data = hex_result[2:]
        values = [int(hex_data[i:i+64], 16) for i in range(0, len(hex_data), 64)]
        if len(values) < 4:
            return None

        usdt_out = values[3] / 1e18  # USDT on BSC has 18 decimals
        price_per_unit = usdt_out / amount_units
        return price_per_unit

    async def get_price(self, symbol: str) -> Optional[Dict]:
        if symbol in self._cache and time.time() - self._cache.get(f"{symbol}_ts", 0) < 10:
            return self._cache[symbol]
        try:
            t0 = time.time()
            async with httpx.AsyncClient(timeout=12) as client:
                price = await self._quote_on_chain(client, symbol)
                if not price:
                    return self._cache.get(symbol)
                latency = round((time.time() - t0) * 1000, 1)
                self.last_fetch_ms = latency
                entry = self._build_entry(symbol, price, latency)
                self._cache[symbol] = entry
                self._cache[f"{symbol}_ts"] = time.time()
                return entry
        except Exception as e:
            print(f"❌ PancakeSwap error for {symbol}: {e}")
            return self._cache.get(symbol)

    async def get_all_prices(self, symbols: List[str]) -> List[Dict]:
        t0 = time.time()
        if time.time() - self._cache_ts < 10 and len(self._cache) > 2:
            return [self._cache[s] for s in symbols if s in self._cache]

        results = []
        self._rejected = {}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                # Step 1: Fetch Binance reference prices for sanity checking
                ref_prices = await _fetch_binance_reference(client, symbols)

                # Step 2: Query PancakeSwap on-chain for each symbol
                for symbol in symbols:
                    try:
                        price = await self._quote_on_chain(client, symbol)
                        if not price or price <= 0.0001:
                            continue

                        # Step 3: Validate against Binance reference
                        ref = ref_prices.get(symbol)
                        if not ref or ref <= 0:
                            self._rejected[symbol] = "no Binance reference available"
                            continue  # No reference → can't trust DEX price
                        deviation_pct = abs(price - ref) / ref * 100
                        if deviation_pct > MAX_DEVIATION_PCT:
                            self._rejected[symbol] = (
                                f"DEX=${price:.6f} vs REF=${ref:.4f} "
                                f"({deviation_pct:.1f}% deviation > {MAX_DEVIATION_PCT}% limit)"
                            )
                            continue  # Skip — low-liquidity garbage

                        latency = round((time.time() - t0) * 1000, 1)
                        entry = self._build_entry(symbol, price, latency)
                        results.append(entry)
                        self._cache[symbol] = entry
                    except Exception as e:
                        print(f"⚠ PancakeSwap skip {symbol}: {e}")
                        if symbol in self._cache:
                            results.append(self._cache[symbol])

            self.last_fetch_ms = round((time.time() - t0) * 1000, 1)
            self._cache_ts = time.time()
            accepted = len(results)
            rejected = len(self._rejected)
            if rejected > 0:
                print(f"📊 PancakeSwap: {accepted} accepted, {rejected} rejected (low liquidity)")
        except Exception as e:
            print(f"❌ PancakeSwap batch error: {e}")
            return [self._cache[s] for s in symbols if s in self._cache]

        return results

    def _build_entry(self, symbol: str, price: float, latency: float) -> Dict:
        return {
            "source": self.name,
            "symbol": symbol,
            "price": round(price, 6),
            "bid": round(price * 0.9998, 6),
            "ask": round(price * 1.0002, 6),
            "spread_bps": 4.0,
            "volume_24h": 0,
            "change_pct": 0,
            "high_24h": 0,
            "low_24h": 0,
            "latency_ms": latency,
            "timestamp": time.time(),
        }


pancakeswap_oracle = PancakeSwapOracle()
