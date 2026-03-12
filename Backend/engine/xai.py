"""
XAI Engine — Explainable AI Decision Generator
Produces human-readable, auditable rationale for every agent decision.
"""
import time
import uuid
from typing import Dict, List, Optional


class XAIEngine:
    """
    For every opportunity the agent evaluates, generates a complete
    Explainability Matrix — a structured, human-readable JSON rationale.
    """

    def __init__(self):
        self.decisions: List[Dict] = []
        self.total_decisions = 0

    def generate_rationale(self, opportunity, scoring: Dict, matrix: Dict) -> Dict:
        """
        Generate a full XAI rationale for a scored opportunity.
        This is the core "why did the AI do this?" output.
        """
        opp = opportunity
        self.total_decisions += 1

        # Build fee breakdown
        fee_breakdown = {}
        for step in opp.path:
            src = step.get("source", step.get("from", "unknown"))
            action = step["action"]
            if action == "BRIDGE":
                fee_breakdown["bridge_fee"] = f"{step.get('cost_pct', 0.15)}%"
                fee_breakdown["bridge_gas"] = "$2.00 est."
            else:
                from engine.arbitrage_graph import SOURCE_FEES, SOURCE_GAS_USD
                fee_breakdown[f"{action.lower()}_{src}_fee"] = f"{SOURCE_FEES.get(src, 0.15)}%"
                fee_breakdown[f"{action.lower()}_{src}_gas"] = f"${SOURCE_GAS_USD.get(src, 0.05)}"

        fee_breakdown["total_estimated"] = f"{opp.estimated_fees:.4f}%"

        # Build path description
        path_desc = []
        for step in opp.path:
            if step["action"] == "BRIDGE":
                path_desc.append(f"🌉 Bridge {step['from']} → {step['to']}")
            else:
                price_str = f"${step['price']:,.2f}" if step.get('price') else "N/A"
                source = step.get('source', 'unknown')
                chain = step.get('chain', '')
                chain_str = f" ({chain})" if chain else ""
                path_desc.append(f"{'🟢' if step['action'] == 'BUY' else '🔴'} {step['action']} {step['symbol']} on {source}{chain_str} @ {price_str}")

        # Comparable past trades
        comparable = []
        for past in self.decisions[-50:]:
            if past.get("opportunity_type") == opp.type and any(s in past.get("symbols", []) for s in opp.symbols):
                comparable.append({
                    "id": past["decision_id"],
                    "profit": f"{past.get('net_profit_pct', 0):.4f}%",
                    "confidence": past.get("confidence", 0),
                    "time_ago": f"{int(time.time() - past.get('timestamp', time.time()))}s ago",
                })
                if len(comparable) >= 3:
                    break

        # Build the full rationale
        decision = scoring["verdict"]
        should_execute = "EXECUTE" in decision

        rationale = {
            "decision_id": f"DEC-{int(time.time())}-{self.total_decisions:06d}",
            "timestamp": time.time(),
            "timestamp_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "opportunity_id": opp.id,
            "opportunity_type": opp.type,
            "symbols": opp.symbols,
            "sources": opp.sources,

            "decision": "EXECUTE" if should_execute else "SKIP",
            "verdict": decision,
            "confidence": scoring["confidence"],
            "risk": scoring["risk"],

            "execution_path": path_desc,
            "path_details": opp.path,

            "profit_analysis": {
                "gross_spread": f"{opp.gross_spread:.4f}%",
                "total_fees": f"{opp.estimated_fees:.4f}%",
                "net_profit": f"{opp.net_profit_pct:.4f}%",
                "net_profit_per_1000_usd": f"${opp.net_profit_pct * 10:.4f}",
                "is_profitable": opp.net_profit_pct > 0,
            },

            "reasoning": scoring["breakdown"],

            "fee_breakdown": fee_breakdown,

            "position_sizing": {
                "kelly_optimal": f"{scoring['kelly_fraction'] * 100:.2f}%",
                "kelly_capped": f"{scoring['kelly_capped'] * 100:.2f}%",
                "recommended_size_usd": f"${scoring['position_size_usd']:.2f}",
                "max_loss_estimate": f"${scoring['position_size_usd'] * opp.estimated_fees / 100:.2f}",
            },

            "comparable_past_trades": comparable,

            "meta": {
                "agent_version": "ArbiNet-AI-v2.0",
                "detection_method": {
                    "direct": "Pairwise cross-source spread comparison",
                    "triangular": "Bellman-Ford negative cycle detection",
                    "cross_chain": "BSC ↔ Solana bridge-adjusted spread analysis",
                }.get(opp.type, "Unknown"),
                "data_sources_used": len(opp.sources),
                "total_decisions_made": self.total_decisions,
            },
        }

        self.decisions.append(rationale)
        # Keep last 1000 decisions
        if len(self.decisions) > 1000:
            self.decisions = self.decisions[-1000:]

        return rationale

    def get_recent_decisions(self, limit: int = 50) -> List[Dict]:
        return self.decisions[-limit:][::-1]

    def get_stats(self) -> Dict:
        if not self.decisions:
            return {"total": 0, "executes": 0, "skips": 0, "execute_rate": 0}

        executes = sum(1 for d in self.decisions if d["decision"] == "EXECUTE")
        return {
            "total": len(self.decisions),
            "executes": executes,
            "skips": len(self.decisions) - executes,
            "execute_rate": round(executes / len(self.decisions) * 100, 1),
            "avg_confidence": round(sum(d["confidence"] for d in self.decisions) / len(self.decisions), 1),
            "avg_risk": round(sum(d["risk"] for d in self.decisions) / len(self.decisions), 1),
        }


# Global singleton
xai_engine = XAIEngine()
