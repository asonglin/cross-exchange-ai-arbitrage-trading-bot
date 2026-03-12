"""
Anomaly Detection — Isolation-Forest-Inspired Market Anomaly Detector
+ Market Regime Classifier
Protects the agent from flash crashes, exchange outages, and suspicious spikes.
"""
import time
import math
from typing import Dict, List, Optional
from collections import defaultdict


class AnomalyDetector:
    """
    Lightweight anomaly detection using statistical methods:
    - Rolling z-score detection (spike/crash detection)
    - Price divergence detection (cross-source validation)
    - Volatility regime classification
    """

    def __init__(self):
        self.price_windows: Dict[str, List[float]] = defaultdict(list)
        self.volatility_windows: Dict[str, List[float]] = defaultdict(list)
        self.anomalies: List[Dict] = []
        self.WINDOW_SIZE = 60  # Keep last 60 data points
        self.current_regime = "UNKNOWN"
        self.regime_history: List[Dict] = []

    def feed_prices(self, matrix: Dict) -> List[Dict]:
        """
        Feed new price data, detect anomalies, classify regime.
        Returns list of newly detected anomalies.
        """
        new_anomalies = []

        for symbol, sources in matrix.items():
            prices = [s["price"] for s in sources.values() if s.get("price", 0) > 0]
            if not prices:
                continue

            avg_price = sum(prices) / len(prices)
            key = symbol

            # Update rolling window
            self.price_windows[key].append(avg_price)
            if len(self.price_windows[key]) > self.WINDOW_SIZE:
                self.price_windows[key] = self.price_windows[key][-self.WINDOW_SIZE:]

            window = self.price_windows[key]

            # ── Spike / Crash Detection (Z-Score) ──
            if len(window) >= 10:
                mean = sum(window) / len(window)
                variance = sum((x - mean) ** 2 for x in window) / len(window)
                std = math.sqrt(variance) if variance > 0 else 0.0001
                z = (avg_price - mean) / std

                if abs(z) > 3.0:
                    anomaly = {
                        "id": f"ANOM-{int(time.time())}-{len(self.anomalies)}",
                        "type": "PRICE_SPIKE" if z > 0 else "PRICE_CRASH",
                        "symbol": symbol,
                        "z_score": round(z, 2),
                        "current_price": round(avg_price, 2),
                        "rolling_mean": round(mean, 2),
                        "deviation_pct": round((avg_price - mean) / mean * 100, 2),
                        "severity": "CRITICAL" if abs(z) > 5 else "HIGH" if abs(z) > 4 else "MODERATE",
                        "timestamp": time.time(),
                    }
                    new_anomalies.append(anomaly)

            # ── Source Divergence Detection ──
            if len(prices) >= 3:
                max_p = max(prices)
                min_p = min(prices)
                divergence = (max_p - min_p) / min_p * 100

                if divergence > 2.0:  # > 2% divergence across sources is abnormal
                    anomaly = {
                        "id": f"ANOM-{int(time.time())}-{len(self.anomalies)}",
                        "type": "SOURCE_DIVERGENCE",
                        "symbol": symbol,
                        "divergence_pct": round(divergence, 2),
                        "max_price": round(max_p, 2),
                        "min_price": round(min_p, 2),
                        "num_sources": len(prices),
                        "severity": "CRITICAL" if divergence > 5 else "HIGH" if divergence > 3 else "MODERATE",
                        "timestamp": time.time(),
                        "possible_cause": "Exchange outage, liquidity drain, or data feed error",
                    }
                    new_anomalies.append(anomaly)

            # ── Volatility tracking ──
            if len(window) >= 2:
                returns = [(window[i] - window[i-1]) / window[i-1] * 100 for i in range(1, len(window))]
                vol = math.sqrt(sum(r**2 for r in returns) / len(returns)) if returns else 0
                self.volatility_windows[key].append(vol)
                if len(self.volatility_windows[key]) > self.WINDOW_SIZE:
                    self.volatility_windows[key] = self.volatility_windows[key][-self.WINDOW_SIZE:]

        # Store anomalies
        self.anomalies.extend(new_anomalies)
        if len(self.anomalies) > 500:
            self.anomalies = self.anomalies[-500:]

        # Update regime
        self._classify_regime()

        return new_anomalies

    def _classify_regime(self):
        """Classify current market regime based on aggregate volatility."""
        all_vols = []
        for key, vols in self.volatility_windows.items():
            if vols:
                all_vols.append(vols[-1])

        if not all_vols:
            self.current_regime = "UNKNOWN"
            return

        avg_vol = sum(all_vols) / len(all_vols)

        # Check for active anomalies (last 5 minutes)
        recent_anomalies = [a for a in self.anomalies if time.time() - a["timestamp"] < 300]
        critical_anomalies = [a for a in recent_anomalies if a["severity"] == "CRITICAL"]

        if critical_anomalies:
            regime = "DISLOCATION"
            description = "⚡ Major price dislocation detected — Maximum opportunity, maximum risk"
        elif avg_vol > 2.0:
            regime = "VOLATILE"
            description = "🔥 High volatility — Many signals, but higher false positive rate"
        elif avg_vol > 0.5:
            regime = "RANGING"
            description = "⚖️ Sideways market — Moderate arb opportunities"
        elif avg_vol > 0.1:
            regime = "TRENDING"
            description = "📈 Trending market — Fewer arb windows, longer hold times"
        else:
            regime = "CALM"
            description = "😴 Very low volatility — Limited opportunities"

        if regime != self.current_regime:
            self.regime_history.append({
                "from": self.current_regime,
                "to": regime,
                "timestamp": time.time(),
            })
            if len(self.regime_history) > 200:
                self.regime_history = self.regime_history[-200:]

        self.current_regime = regime
        self._regime_description = description

    def get_regime(self) -> Dict:
        return {
            "regime": self.current_regime,
            "description": getattr(self, "_regime_description", ""),
            "regime_icon": {
                "DISLOCATION": "⚡", "VOLATILE": "🔥", "RANGING": "⚖️",
                "TRENDING": "📈", "CALM": "😴", "UNKNOWN": "❓",
            }.get(self.current_regime, "❓"),
            "agent_mode": {
                "DISLOCATION": "AGGRESSIVE — Max scanning, wider thresholds",
                "VOLATILE": "CAUTIOUS — Higher confidence required",
                "RANGING": "NORMAL — Standard thresholds",
                "TRENDING": "CONSERVATIVE — Fewer trades, tighter stops",
                "CALM": "MONITORING — Minimal activity",
                "UNKNOWN": "INITIALIZING",
            }.get(self.current_regime, "INITIALIZING"),
            "recent_anomalies": len([a for a in self.anomalies if time.time() - a["timestamp"] < 300]),
            "history": self.regime_history[-10:][::-1],
        }

    def get_recent_anomalies(self, limit: int = 30) -> List[Dict]:
        return self.anomalies[-limit:][::-1]


# Global singleton
anomaly_detector = AnomalyDetector()
