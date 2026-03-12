"""
Scoring Engine — AI Confidence & Risk Assessment
Calculates confidence scores, risk scores, and Kelly Criterion position sizing.
"""
import math
import time
from typing import Dict, List, Optional
from collections import defaultdict


class ScoringEngine:
    """
    Scores each arbitrage opportunity with:
    - Confidence (0-100): How likely is this opportunity real and capturable?
    - Risk (0-100): How risky is the execution?
    - Kelly Fraction: Optimal position sizing
    """

    def __init__(self):
        # Rolling statistics for z-score calculations
        self.spread_history: Dict[str, List[float]] = defaultdict(list)
        self.MAX_HISTORY = 200

    def _update_history(self, key: str, value: float):
        """Track rolling spread history for z-score computation."""
        self.spread_history[key].append(value)
        if len(self.spread_history[key]) > self.MAX_HISTORY:
            self.spread_history[key] = self.spread_history[key][-self.MAX_HISTORY:]

    def _z_score(self, key: str, value: float) -> float:
        """How many std deviations above mean is this spread?"""
        hist = self.spread_history.get(key, [])
        if len(hist) < 5:
            return 1.0  # Not enough data, assume neutral
        mean = sum(hist) / len(hist)
        variance = sum((x - mean) ** 2 for x in hist) / len(hist)
        std = math.sqrt(variance) if variance > 0 else 0.0001
        return (value - mean) / std

    def score(self, opportunity, matrix: Dict) -> Dict:
        """
        Score an opportunity with confidence + risk + position sizing.
        Returns a full scoring breakdown.
        """
        opp = opportunity
        spread_key = f"{'-'.join(opp.symbols)}_{'-'.join(opp.sources)}"
        self._update_history(spread_key, opp.gross_spread)

        # ── CONFIDENCE SCORING (0-100) ──

        # 1. Spread Strength (0-30 points)
        z = self._z_score(spread_key, opp.gross_spread)
        spread_strength = min(30, max(0, z * 10 + 10))
        spread_label = "STRONG" if z > 1.5 else "MODERATE" if z > 0.5 else "WEAK"

        # 2. Profitability (0-25 points)
        if opp.net_profit_pct > 0.5:
            profit_score = 25
            profit_label = "HIGHLY PROFITABLE"
        elif opp.net_profit_pct > 0.1:
            profit_score = 15
            profit_label = "PROFITABLE"
        elif opp.net_profit_pct > 0:
            profit_score = 8
            profit_label = "MARGINALLY PROFITABLE"
        else:
            profit_score = 0
            profit_label = "UNPROFITABLE"

        # 3. Source Reliability (0-20 points)
        reliable_sources = {"binance", "coingecko"}
        dex_sources = {"pancakeswap", "jupiter", "1inch"}
        source_count = len(opp.sources)
        has_reliable = any(s in reliable_sources for s in opp.sources)
        source_score = 10 * source_count + (5 if has_reliable else 0)
        source_score = min(20, source_score)
        source_label = "HIGH RELIABILITY" if has_reliable else "DEX ONLY"

        # 4. Volume / Liquidity (0-15 points)
        vol_scores = []
        for sym in opp.symbols:
            for src in opp.sources:
                vol = matrix.get(sym, {}).get(src, {}).get("volume_24h", 0)
                if vol > 1_000_000_000:
                    vol_scores.append(15)
                elif vol > 100_000_000:
                    vol_scores.append(10)
                elif vol > 10_000_000:
                    vol_scores.append(5)
                else:
                    vol_scores.append(2)
        volume_score = min(15, sum(vol_scores) / max(len(vol_scores), 1))
        volume_label = "DEEP LIQUIDITY" if volume_score > 10 else "MODERATE" if volume_score > 5 else "THIN"

        # 5. Data Freshness (0-10 points)
        ages = []
        for sym in opp.symbols:
            for src in opp.sources:
                ts = matrix.get(sym, {}).get(src, {}).get("timestamp", 0)
                if ts:
                    ages.append(time.time() - ts)
        avg_age = sum(ages) / max(len(ages), 1)
        if avg_age < 2:
            freshness_score = 10
            freshness_label = "REAL-TIME"
        elif avg_age < 10:
            freshness_score = 7
            freshness_label = "FRESH"
        elif avg_age < 30:
            freshness_score = 4
            freshness_label = "AGING"
        else:
            freshness_score = 1
            freshness_label = "STALE"

        confidence = round(spread_strength + profit_score + source_score + volume_score + freshness_score)
        confidence = min(100, max(0, confidence))

        # ── RISK SCORING (0-100) ──

        # Slippage risk
        if opp.type == "cross_chain":
            slippage_risk = 35
            slippage_label = "HIGH — Cross-chain bridge slippage"
        elif opp.type == "triangular":
            slippage_risk = 25
            slippage_label = "MODERATE — Multi-leg execution"
        else:
            slippage_risk = 10
            slippage_label = "LOW — Direct pair"

        # Fee uncertainty
        fee_ratio = opp.estimated_fees / max(opp.gross_spread, 0.001)
        if fee_ratio > 0.8:
            fee_risk = 30
            fee_label = "HIGH — Fees eat most of spread"
        elif fee_ratio > 0.5:
            fee_risk = 15
            fee_label = "MODERATE — Significant fee impact"
        else:
            fee_risk = 5
            fee_label = "LOW — Fees well covered"

        # Timing risk (spread could close)
        timing_risk = 15 if avg_age > 5 else 5
        timing_label = "ELEVATED — Data latency" if avg_age > 5 else "LOW — Fresh data"

        # Execution complexity
        exec_risk = len(opp.path) * 5
        exec_label = f"{len(opp.path)}-step execution"

        risk = min(100, slippage_risk + fee_risk + timing_risk + exec_risk)

        # ── KELLY CRITERION ──
        # f* = (p * b - q) / b
        # p = estimated win probability, b = net profit ratio, q = 1-p
        win_prob = confidence / 100
        avg_win = opp.net_profit_pct / 100 if opp.net_profit_pct > 0 else 0.001
        avg_loss = opp.estimated_fees / 100
        b = avg_win / max(avg_loss, 0.0001)
        q = 1 - win_prob
        kelly = max(0, min(1, (win_prob * b - q) / max(b, 0.001)))

        # Position sizing (on $10,000 portfolio)
        portfolio = 10000
        max_per_trade = 0.15  # Max 15% per trade
        kelly_capped = min(kelly, max_per_trade)
        position_size = round(portfolio * kelly_capped, 2)

        return {
            "confidence": confidence,
            "risk": risk,
            "verdict": self._verdict(confidence, risk),
            "position_size_usd": position_size,
            "kelly_fraction": round(kelly, 4),
            "kelly_capped": round(kelly_capped, 4),
            "breakdown": {
                "confidence_factors": {
                    "spread_strength": {"score": round(spread_strength, 1), "max": 30, "z_score": round(z, 2), "label": spread_label},
                    "profitability": {"score": profit_score, "max": 25, "net_pct": round(opp.net_profit_pct, 4), "label": profit_label},
                    "source_reliability": {"score": round(source_score, 1), "max": 20, "sources": opp.sources, "label": source_label},
                    "liquidity_depth": {"score": round(volume_score, 1), "max": 15, "label": volume_label},
                    "data_freshness": {"score": freshness_score, "max": 10, "avg_age_s": round(avg_age, 1), "label": freshness_label},
                },
                "risk_factors": {
                    "slippage": {"score": slippage_risk, "label": slippage_label},
                    "fee_impact": {"score": fee_risk, "ratio": round(fee_ratio, 2), "label": fee_label},
                    "timing": {"score": timing_risk, "label": timing_label},
                    "execution_complexity": {"score": exec_risk, "label": exec_label},
                },
            },
        }

    def _verdict(self, confidence: int, risk: int) -> str:
        if confidence >= 75 and risk <= 30:
            return "🟢 STRONG EXECUTE"
        elif confidence >= 60 and risk <= 50:
            return "🟡 EXECUTE WITH CAUTION"
        elif confidence >= 40:
            return "🟠 MONITOR — Borderline"
        else:
            return "🔴 SKIP — Too risky or low confidence"


# Global singleton
scoring_engine = ScoringEngine()
