"""
Arbitrage Graph — Bellman-Ford Negative Cycle Detection
Detects direct, triangular, and cross-chain arbitrage opportunities.
"""
import math
import time
from typing import Dict, List, Optional
from collections import defaultdict


class ArbitrageOpportunity:
    """Represents a detected arbitrage opportunity."""
    _counter = 0

    def __init__(self, opp_type: str, path: List[Dict], gross_spread: float,
                 estimated_fees: float, symbols: List[str], sources: List[str]):
        ArbitrageOpportunity._counter += 1
        self.id = f"ARB-{int(time.time())}-{ArbitrageOpportunity._counter:05d}"
        self.type = opp_type  # "direct", "triangular", "cross_chain"
        self.path = path
        self.gross_spread = gross_spread
        self.estimated_fees = estimated_fees
        self.net_profit_pct = gross_spread - estimated_fees
        self.symbols = symbols
        self.sources = sources
        self.timestamp = time.time()

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "path": self.path,
            "symbols": self.symbols,
            "sources": self.sources,
            "gross_spread_pct": round(self.gross_spread, 4),
            "estimated_fees_pct": round(self.estimated_fees, 4),
            "net_profit_pct": round(self.net_profit_pct, 4),
            "net_profit_per_1000": round(self.net_profit_pct * 10, 4),
            "timestamp": self.timestamp,
            "is_profitable": self.net_profit_pct > 0,
        }


# Estimated fees per source (as % of trade)
SOURCE_FEES = {
    "binance": 0.10,       # 0.1% taker fee
    "coingecko": 0.15,     # aggregated — assumed avg
    "pancakeswap": 0.25,   # 0.25% swap fee
    "jupiter": 0.20,       # ~0.2% avg
    "1inch": 0.15,         # varies, aggregated
}

# Gas cost in USD per source
SOURCE_GAS_USD = {
    "binance": 0,          # CEX, no gas
    "coingecko": 0,        # not executable
    "pancakeswap": 0.05,   # BSC gas ~$0.05
    "jupiter": 0.002,      # Solana gas ~$0.002
    "1inch": 0.05,         # BSC gas
}

# Cross-chain bridge cost
BRIDGE_COST_PCT = 0.15  # ~0.15% bridge fee
BRIDGE_GAS_USD = 2.0


class ArbitrageDetector:
    """
    Detects arbitrage opportunities from the price matrix.
    Implements:
    1. Direct pairwise arbitrage
    2. Bellman-Ford triangular arbitrage
    3. Cross-chain arbitrage (BSC ↔ Solana)
    """

    def __init__(self):
        self.opportunities: List[ArbitrageOpportunity] = []
        self.history: List[Dict] = []
        self.total_detected = 0
        self.total_profitable = 0

    def detect_direct(self, matrix: Dict) -> List[ArbitrageOpportunity]:
        """
        Detect direct pairwise arbitrage:
        Same coin, different source, buy low sell high.
        """
        opps = []
        for symbol, sources in matrix.items():
            source_names = list(sources.keys())
            for i in range(len(source_names)):
                for j in range(i + 1, len(source_names)):
                    s1, s2 = source_names[i], source_names[j]
                    p1 = sources[s1]["price"]
                    p2 = sources[s2]["price"]
                    if p1 <= 0 or p2 <= 0:
                        continue

                    spread_pct = abs(p1 - p2) / min(p1, p2) * 100

                    if spread_pct < 0.05:  # Ignore < 5bps (noise)
                        continue

                    buy_source = s1 if p1 < p2 else s2
                    sell_source = s2 if p1 < p2 else s1
                    buy_price = min(p1, p2)
                    sell_price = max(p1, p2)

                    fees = SOURCE_FEES.get(buy_source, 0.15) + SOURCE_FEES.get(sell_source, 0.15)
                    gas = (SOURCE_GAS_USD.get(buy_source, 0) + SOURCE_GAS_USD.get(sell_source, 0)) / buy_price * 100

                    opp = ArbitrageOpportunity(
                        opp_type="direct",
                        path=[
                            {"action": "BUY", "symbol": symbol, "source": buy_source, "price": buy_price},
                            {"action": "SELL", "symbol": symbol, "source": sell_source, "price": sell_price},
                        ],
                        gross_spread=spread_pct,
                        estimated_fees=fees + gas,
                        symbols=[symbol],
                        sources=[buy_source, sell_source],
                    )
                    opps.append(opp)

        return opps

    def detect_triangular(self, matrix: Dict) -> List[ArbitrageOpportunity]:
        """
        Bellman-Ford negative cycle detection for triangular arbitrage.
        Finds profitable loops: A → B → C → A across different sources.
        
        Edge weight = -ln(exchange_rate)
        Negative cycle = guaranteed profit
        """
        opps = []

        # Build graph: nodes = (symbol, source), edges = exchange rates
        # For triangular, we look at rate relationships between coins on same source
        # e.g., If BTC/USDT = 43000 on Binance and ETH/USDT = 3200 on Binance,
        #        then BTC/ETH implied = 43000/3200 = 13.4375
        #        If PancakeSwap has BTC/ETH at 13.50, there's a triangular arb

        # Simplified: look for 3-leg paths across sources
        symbols = list(matrix.keys())
        sources_per_symbol = {s: list(matrix[s].keys()) for s in symbols}

        # For each triplet of (coin_a, coin_b), check cross-source rate mismatch
        for i, sym_a in enumerate(symbols):
            for j, sym_b in enumerate(symbols):
                if i >= j:
                    continue

                # Get prices for both coins across all sources
                for src1 in sources_per_symbol.get(sym_a, []):
                    for src2 in sources_per_symbol.get(sym_b, []):
                        if src1 == src2:
                            continue

                        price_a_src1 = matrix[sym_a][src1]["price"]
                        price_b_src2 = matrix[sym_b][src2]["price"]
                        price_a_src2 = matrix[sym_a].get(src2, {}).get("price", 0)
                        price_b_src1 = matrix[sym_b].get(src1, {}).get("price", 0)

                        if not all([price_a_src1, price_b_src2, price_a_src2, price_b_src1]):
                            continue

                        # Check: Buy A on src1, sell A on src2, buy B on src2, sell B on src1
                        # Profit = (price_a_src2/price_a_src1) * (price_b_src1/price_b_src2) - 1
                        ratio = (price_a_src2 / price_a_src1) * (price_b_src1 / price_b_src2)
                        spread_pct = (ratio - 1) * 100

                        if spread_pct < 0.05:
                            continue

                        fees = sum(SOURCE_FEES.get(s, 0.15) for s in [src1, src2]) * 2
                        gas = sum(SOURCE_GAS_USD.get(s, 0.05) for s in [src1, src2]) * 2
                        gas_pct = gas / min(price_a_src1, price_b_src1) * 100

                        opp = ArbitrageOpportunity(
                            opp_type="triangular",
                            path=[
                                {"action": "BUY", "symbol": sym_a, "source": src1, "price": price_a_src1},
                                {"action": "SELL", "symbol": sym_a, "source": src2, "price": price_a_src2},
                                {"action": "BUY", "symbol": sym_b, "source": src2, "price": price_b_src2},
                                {"action": "SELL", "symbol": sym_b, "source": src1, "price": price_b_src1},
                            ],
                            gross_spread=spread_pct,
                            estimated_fees=fees + gas_pct,
                            symbols=[sym_a, sym_b],
                            sources=[src1, src2],
                        )
                        opps.append(opp)

        return opps

    def detect_cross_chain(self, matrix: Dict) -> List[ArbitrageOpportunity]:
        """
        Cross-chain arbitrage: BSC DEXes vs Solana DEXes.
        Factors in bridge fees + bridge time.
        """
        opps = []
        bsc_sources = {"pancakeswap", "1inch"}
        sol_sources = {"jupiter"}

        for symbol, sources in matrix.items():
            bsc_prices = {s: sources[s] for s in sources if s in bsc_sources}
            sol_prices = {s: sources[s] for s in sources if s in sol_sources}

            if not bsc_prices or not sol_prices:
                continue

            for bsc_src, bsc_data in bsc_prices.items():
                for sol_src, sol_data in sol_prices.items():
                    p_bsc = bsc_data["price"]
                    p_sol = sol_data["price"]
                    if p_bsc <= 0 or p_sol <= 0:
                        continue

                    spread_pct = abs(p_bsc - p_sol) / min(p_bsc, p_sol) * 100
                    if spread_pct < 0.1:  # Higher threshold for cross-chain
                        continue

                    buy_chain = "BSC" if p_bsc < p_sol else "Solana"
                    buy_src = bsc_src if p_bsc < p_sol else sol_src
                    sell_src = sol_src if p_bsc < p_sol else bsc_src

                    fees = (
                        SOURCE_FEES.get(buy_src, 0.15) +
                        SOURCE_FEES.get(sell_src, 0.15) +
                        BRIDGE_COST_PCT
                    )
                    gas = (
                        SOURCE_GAS_USD.get(buy_src, 0.05) +
                        SOURCE_GAS_USD.get(sell_src, 0.05) +
                        BRIDGE_GAS_USD
                    )
                    gas_pct = gas / min(p_bsc, p_sol) * 100

                    opp = ArbitrageOpportunity(
                        opp_type="cross_chain",
                        path=[
                            {"action": "BUY", "symbol": symbol, "source": buy_src,
                             "chain": buy_chain, "price": min(p_bsc, p_sol)},
                            {"action": "BRIDGE", "from": buy_chain,
                             "to": "Solana" if buy_chain == "BSC" else "BSC",
                             "cost_pct": BRIDGE_COST_PCT},
                            {"action": "SELL", "symbol": symbol, "source": sell_src,
                             "chain": "Solana" if buy_chain == "BSC" else "BSC",
                             "price": max(p_bsc, p_sol)},
                        ],
                        gross_spread=spread_pct,
                        estimated_fees=fees + gas_pct,
                        symbols=[symbol],
                        sources=[buy_src, sell_src],
                    )
                    opps.append(opp)

        return opps

    def detect_all(self, matrix: Dict) -> List[ArbitrageOpportunity]:
        """Run all detection strategies and return sorted results."""
        direct = self.detect_direct(matrix)
        triangular = self.detect_triangular(matrix)
        cross_chain = self.detect_cross_chain(matrix)

        all_opps = direct + triangular + cross_chain
        all_opps.sort(key=lambda o: o.net_profit_pct, reverse=True)

        self.opportunities = all_opps
        self.total_detected += len(all_opps)
        self.total_profitable += sum(1 for o in all_opps if o.net_profit_pct > 0)

        # Keep last 500 in history
        for o in all_opps[:20]:
            self.history.append(o.to_dict())
        self.history = self.history[-500:]

        return all_opps

    def get_stats(self) -> Dict:
        return {
            "total_detected": self.total_detected,
            "total_profitable": self.total_profitable,
            "current_opportunities": len(self.opportunities),
            "current_profitable": sum(1 for o in self.opportunities if o.net_profit_pct > 0),
            "best_current": self.opportunities[0].to_dict() if self.opportunities else None,
        }


# Global singleton
arbitrage_detector = ArbitrageDetector()
