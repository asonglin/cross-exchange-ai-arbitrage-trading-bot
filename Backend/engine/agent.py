"""
Agent — The Autonomous Heartbeat
Orchestrates all engines: price collection → detection → scoring → XAI → execution.
Runs continuously with a state machine and adaptive behavior.
"""
import time
import asyncio
from typing import Dict, List, Optional

from engine.price_matrix import price_matrix
from engine.arbitrage_graph import arbitrage_detector
from engine.scoring import scoring_engine
from engine.ml_scoring import ml_scoring_engine
from engine.xai import xai_engine
from engine.portfolio import portfolio_engine
from engine.anomaly import anomaly_detector


class AgentState:
    INITIALIZING = "INITIALIZING"
    SCANNING = "SCANNING"
    ANALYZING = "ANALYZING"
    OPPORTUNITY_DETECTED = "OPPORTUNITY_DETECTED"
    EXECUTING = "EXECUTING"
    COOLDOWN = "COOLDOWN"
    PAUSED = "PAUSED"
    ERROR = "ERROR"


class Agent:
    """
    The autonomous AI arbitrage agent.
    Runs a continuous loop scanning markets, detecting opportunities,
    and executing trade decisions.
    """

    def __init__(self):
        self.state = AgentState.INITIALIZING
        self.started_at = 0
        self.scan_count = 0
        self.cycle_count = 0
        self.last_scan_time = 0
        self.last_cycle_duration_ms = 0
        self.errors: List[Dict] = []
        self.subscribers: List = []  # WebSocket subscribers

        # Adaptive thresholds (tuned for paper trading — real cost model handles risk)
        self.min_confidence = 35
        self.min_spread_pct = 0.05
        self.max_risk = 80

        # Rate limiter — max 1 trade per 30 seconds to stay realistic
        self.last_trade_time = 0
        self.trade_cooldown_secs = 30  # 1 trade per 30s max

        # Activity log (last N events)
        self.activity_log: List[Dict] = []

    def _log(self, event: str, data: Dict = None):
        entry = {
            "event": event,
            "state": self.state,
            "timestamp": time.time(),
            "data": data or {},
        }
        self.activity_log.append(entry)
        if len(self.activity_log) > 500:
            self.activity_log = self.activity_log[-500:]

    async def _broadcast(self, msg: Dict):
        """Broadcast event to all WebSocket subscribers."""
        dead = []
        for ws in self.subscribers:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.subscribers.remove(ws)

    async def run_cycle(self) -> Dict:
        """Run a single agent cycle: scan → detect → score → decide → execute."""
        t0 = time.time()
        self.cycle_count += 1
        cycle_result = {
            "cycle": self.cycle_count,
            "timestamp": time.time(),
            "state_transitions": [],
            "opportunities_found": 0,
            "trades_executed": 0,
            "decisions": [],
        }

        try:
            # ── Step 1: SCANNING ──
            self.state = AgentState.SCANNING
            self._log("SCAN_START")
            await self._broadcast({"type": "state", "state": self.state, "cycle": self.cycle_count})

            summary = await price_matrix.update()
            self.scan_count += 1
            self.last_scan_time = time.time()
            cycle_result["price_summary"] = summary

            self._log("SCAN_COMPLETE", {"sources": summary["source_status"]})

            # ── Step 2: ANOMALY CHECK ──
            full_matrix = price_matrix.matrix
            anomalies = anomaly_detector.feed_prices(full_matrix)
            regime = anomaly_detector.get_regime()
            cycle_result["regime"] = regime["regime"]
            cycle_result["anomalies"] = len(anomalies)

            if anomalies:
                self._log("ANOMALIES_DETECTED", {"count": len(anomalies),
                                                   "types": [a["type"] for a in anomalies]})
                await self._broadcast({"type": "anomaly", "anomalies": anomalies})

            # Adapt thresholds based on regime
            self._adapt_to_regime(regime["regime"])

            # ── Step 3: ANALYZING ──
            self.state = AgentState.ANALYZING
            await self._broadcast({"type": "state", "state": self.state})

            opportunities = arbitrage_detector.detect_all(full_matrix)
            cycle_result["opportunities_found"] = len(opportunities)

            self._log("ANALYSIS_COMPLETE", {
                "total": len(opportunities),
                "profitable": sum(1 for o in opportunities if o.net_profit_pct > 0),
            })

            if not opportunities:
                self.state = AgentState.SCANNING
                self.last_cycle_duration_ms = round((time.time() - t0) * 1000, 1)
                cycle_result["duration_ms"] = self.last_cycle_duration_ms
                return cycle_result

            # ── Step 4: SCORE & DECIDE (top 10) ──
            self.state = AgentState.OPPORTUNITY_DETECTED
            await self._broadcast({
                "type": "opportunities",
                "count": len(opportunities),
                "best_spread": round(opportunities[0].gross_spread, 4) if opportunities else 0,
            })

            top_opps = opportunities[:10]
            for opp in top_opps:
                # Use BOTH engines: legacy for compatibility, ML for advanced scoring
                legacy_scoring = scoring_engine.score(opp, full_matrix)
                ml_scoring = ml_scoring_engine.score(opp, full_matrix)

                # The ML engine is the primary scorer now
                scoring = ml_scoring
                rationale = xai_engine.generate_rationale(opp, scoring, full_matrix)

                # Enrich rationale with ML-specific data
                rationale["ml_analysis"] = {
                    "algorithm_agreement": ml_scoring.get("algorithm_agreement"),
                    "bayesian_calibration": ml_scoring.get("bayesian_calibration"),
                    "volatility_adjustment": ml_scoring.get("volatility_adjustment"),
                    "raw_confidence": ml_scoring.get("raw_confidence"),
                    "legacy_confidence": legacy_scoring.get("confidence"),
                }

                cycle_result["decisions"].append(rationale)

                await self._broadcast({
                    "type": "decision",
                    "decision_id": rationale["decision_id"],
                    "opportunity_type": rationale["opportunity_type"],
                    "symbols": rationale["symbols"],
                    "decision": rationale["decision"],
                    "confidence": rationale["confidence"],
                    "risk": rationale["risk"],
                    "net_profit": rationale["profit_analysis"]["net_profit"],
                    "verdict": rationale["verdict"],
                    "ml_analysis": rationale.get("ml_analysis"),
                })

                # ── Step 5: EXECUTE if criteria met ──
                # Allow execution for EXECUTE decisions, or decent-confidence opportunities
                is_executable = (rationale["decision"] == "EXECUTE" or
                                 scoring["confidence"] >= 40)
                if (is_executable and
                    scoring["confidence"] >= self.min_confidence and
                    scoring["risk"] <= self.max_risk):

                    # Rate limiter: max 1 auto-trade per minute
                    now = time.time()
                    if now - self.last_trade_time < self.trade_cooldown_secs:
                        continue  # Skip — too soon since last trade

                    self.state = AgentState.EXECUTING
                    await self._broadcast({"type": "state", "state": self.state})

                    # Ensure decision is EXECUTE for portfolio engine
                    rationale["decision"] = "EXECUTE"
                    trade = portfolio_engine.execute_trade(rationale)
                    if trade and isinstance(trade, dict) and trade.get("id"):
                        self.last_trade_time = time.time()  # Update rate limiter
                        cycle_result["trades_executed"] += 1
                        self._log("TRADE_EXECUTED", {
                            "trade_id": trade["id"],
                            "pnl": trade["pnl"],
                            "won": trade["won"],
                        })
                        await self._broadcast({"type": "trade", "trade": trade})

                        # ── FEEDBACK LOOP: teach the ML engine from outcomes ──
                        ml_scoring_engine.record_trade_outcome(
                            confidence=scoring["confidence"],
                            was_profitable=trade["won"],
                        )

        except Exception as e:
            self.state = AgentState.ERROR
            self.errors.append({"error": str(e), "timestamp": time.time()})
            self._log("ERROR", {"error": str(e)})
            print(f"❌ Agent cycle error: {e}")

        # Circuit breaker check
        if portfolio_engine.is_circuit_breaker_active:
            self.state = AgentState.COOLDOWN
            self._log("CIRCUIT_BREAKER_ACTIVE")
        else:
            self.state = AgentState.SCANNING

        self.last_cycle_duration_ms = round((time.time() - t0) * 1000, 1)
        cycle_result["duration_ms"] = self.last_cycle_duration_ms

        return cycle_result

    def _adapt_to_regime(self, regime: str):
        """Adapt agent thresholds based on market regime — real adaptive AI."""
        if regime == "DISLOCATION":
            self.min_confidence = 35  # More aggressive
            self.min_spread_pct = 0.03
            self.max_risk = 80
        elif regime == "VOLATILE":
            self.min_confidence = 60  # More cautious
            self.min_spread_pct = 0.08
            self.max_risk = 60
        elif regime == "RANGING":
            self.min_confidence = 50
            self.min_spread_pct = 0.05
            self.max_risk = 70
        elif regime == "TRENDING":
            self.min_confidence = 65
            self.min_spread_pct = 0.10
            self.max_risk = 55
        else:  # CALM / UNKNOWN
            self.min_confidence = 50
            self.min_spread_pct = 0.05
            self.max_risk = 70

        # Also adapt based on win rate
        perf = portfolio_engine.get_performance()
        if perf["total_trades"] > 20:
            if perf["win_rate"] > 80:
                self.min_confidence = max(30, self.min_confidence - 10)  # Get more aggressive
            elif perf["win_rate"] < 60:
                self.min_confidence = min(80, self.min_confidence + 10)  # Get more conservative

    def get_status(self) -> Dict:
        """Get full agent status."""
        perf = portfolio_engine.get_performance()
        regime = anomaly_detector.get_regime()
        arb_stats = arbitrage_detector.get_stats()
        xai_stats = xai_engine.get_stats()
        matrix_summary = price_matrix.get_summary()
        ml_accuracy = ml_scoring_engine.get_accuracy_stats()

        uptime = time.time() - self.started_at if self.started_at else 0
        hours = int(uptime // 3600)
        minutes = int((uptime % 3600) // 60)
        seconds = int(uptime % 60)

        return {
            "state": self.state,
            "uptime": f"{hours}h {minutes}m {seconds}s",
            "uptime_seconds": round(uptime),
            "scan_count": self.scan_count,
            "cycle_count": self.cycle_count,
            "last_cycle_ms": self.last_cycle_duration_ms,
            "started_at": self.started_at,

            "thresholds": {
                "min_confidence": self.min_confidence,
                "min_spread_pct": self.min_spread_pct,
                "max_risk": self.max_risk,
            },

            "market": {
                "regime": regime["regime"],
                "regime_icon": regime["regime_icon"],
                "regime_description": regime["description"],
                "agent_mode": regime["agent_mode"],
                "sources_online": sum(1 for s in matrix_summary.get("source_status", {}).values() if s == "online"),
                "total_sources": len(matrix_summary.get("source_status", {})),
                "source_status": matrix_summary.get("source_status", {}),
                "source_latencies": matrix_summary.get("source_latencies", {}),
            },

            "detection": arb_stats,
            "decisions": xai_stats,
            "performance": perf,
            "ml_accuracy": ml_accuracy,

            "errors": self.errors[-5:],
            "websocket_subscribers": len(self.subscribers),
        }

    def get_activity_log(self, limit: int = 50) -> List[Dict]:
        return self.activity_log[-limit:][::-1]


# Global singleton
agent = Agent()


async def agent_loop():
    """The continuous autonomous loop — the heartbeat."""
    agent.started_at = time.time()
    agent.state = AgentState.SCANNING
    print("🤖 ArbiNet AI Agent started — autonomous scanning active")

    while True:
        try:
            result = await agent.run_cycle()
            opps = result.get("opportunities_found", 0)
            trades = result.get("trades_executed", 0)
            duration = result.get("duration_ms", 0)

            if opps > 0 or trades > 0:
                print(f"🔍 Cycle {agent.cycle_count}: {opps} opps, {trades} trades, {duration}ms [{agent.state}]")

        except Exception as e:
            print(f"❌ Agent loop error: {e}")

        # Wait between cycles (5 seconds)
        await asyncio.sleep(5)
