"""
╔══════════════════════════════════════════════════════════════╗
║              ARBIX — ArbiNet AI Backend v2.0                ║
║   Autonomous Cross-Market AI Arbitrage Agent                ║
║                                                              ║
║   • 5 Oracle Sources (Binance, CoinGecko, PancakeSwap,     ║
║     Jupiter, 1inch)                                          ║
║   • Bellman-Ford Triangular Arbitrage Detection             ║
║   • Cross-Chain Arbitrage (BSC ↔ Solana)                    ║
║   • XAI Explainable Decision Engine                         ║
║   • Anomaly Detection + Market Regime Classifier            ║
║   • Portfolio Tracking + Drawdown Circuit Breaker          ║
╚══════════════════════════════════════════════════════════════╝
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import httpx
import json
import math
import time
import websockets as ws_client
from contextlib import asynccontextmanager

# ── Engine Imports ──
from engine.agent import agent, agent_loop
from engine.price_matrix import price_matrix
from engine.arbitrage_graph import arbitrage_detector
from engine.scoring import scoring_engine
from engine.ml_scoring import ml_scoring_engine
from engine.xai import xai_engine
from engine.portfolio import portfolio_engine
from engine.anomaly import anomaly_detector

# ── Supabase Config ──
SUPABASE_URL = "https://icdqhsxbceugjeasunom.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljZHFoc3hiY2V1Z2plYXN1bm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzg3OTYsImV4cCI6MjA4NzcxNDc5Nn0.pqgUr7js-DlvweLQ3J5jNlYh_lcKJuLEbNqnZKMFKUU"
SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

TOP_COINS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT"
]


# ── Background task: Store prices to Supabase every 60s ──
async def supabase_price_sync():
    """Syncs top 10 coin prices from Binance to Supabase every 60 seconds."""
    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get("https://api.binance.com/api/v3/ticker/24hr")
                all_tickers = response.json()
                rows = []
                for ticker in all_tickers:
                    if ticker["symbol"] in TOP_COINS:
                        rows.append({
                            "symbol": ticker["symbol"],
                            "price": float(ticker["lastPrice"]),
                            "change_percent": float(ticker["priceChangePercent"]),
                            "high_24h": float(ticker["highPrice"]),
                            "low_24h": float(ticker["lowPrice"]),
                            "volume": float(ticker["volume"]),
                        })
                if rows:
                    insert_url = f"{SUPABASE_URL}/rest/v1/coin_prices"
                    res = await client.post(insert_url, headers=SUPABASE_HEADERS, json=rows)
                    if res.status_code in (200, 201):
                        print(f"✅ Synced {len(rows)} prices to Supabase")
        except Exception as e:
            print(f"❌ Supabase sync error: {e}")
        await asyncio.sleep(60)


async def cleanup_old_data():
    """Deletes price records older than 24 hours."""
    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                from datetime import datetime, timedelta, timezone
                cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%S')
                delete_url = f"{SUPABASE_URL}/rest/v1/coin_prices?recorded_at=lt.{cutoff}"
                await client.delete(delete_url, headers=SUPABASE_HEADERS)
        except Exception as e:
            print(f"❌ Cleanup error: {e}")
        await asyncio.sleep(600)


# ── Track which trade IDs we've already synced ──
_synced_trade_ids = set()

async def supabase_trade_sync():
    """Syncs new trades from the portfolio engine to Supabase every 30 seconds."""
    global _synced_trade_ids
    while True:
        try:
            trades = portfolio_engine.get_recent_trades(200)
            new_trades = [t for t in trades if t["id"] not in _synced_trade_ids]
            if new_trades:
                from datetime import datetime, timezone
                rows = []
                for t in new_trades:
                    rows.append({
                        "trade_id": t["id"],
                        "opportunity_id": t.get("opportunity_id", ""),
                        "decision_id": t.get("decision_id", ""),
                        "trade_type": t.get("type", "unknown"),
                        "symbols": ",".join(t.get("symbols", [])),
                        "sources": ",".join(t.get("sources", [])),
                        "position_size": t.get("position_size", 0),
                        "spread_pct": t.get("net_profit_pct", 0),
                        "pnl": t.get("pnl", 0),
                        "won": t.get("won", False),
                        "confidence": t.get("confidence", 0),
                        "risk": t.get("risk", 0),
                        "gas_cost": t.get("cost_breakdown", {}).get("gas", 0),
                        "slippage_cost": t.get("cost_breakdown", {}).get("slippage", 0),
                        "total_costs": t.get("cost_breakdown", {}).get("total_costs", 0),
                        "executed_at": datetime.fromtimestamp(t.get("timestamp", 0), tz=timezone.utc).isoformat(),
                    })
                if rows:
                    async with httpx.AsyncClient(timeout=15) as client:
                        insert_url = f"{SUPABASE_URL}/rest/v1/trade_history"
                        res = await client.post(insert_url, headers=SUPABASE_HEADERS, json=rows)
                        if res.status_code in (200, 201):
                            _synced_trade_ids.update(t["id"] for t in new_trades)
                            print(f"✅ Synced {len(rows)} trades to Supabase")
                        else:
                            print(f"⚠️ Trade sync response: {res.status_code} {res.text[:200]}")
        except Exception as e:
            print(f"❌ Trade sync error: {e}")
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: launch the AI agent + background tasks."""
    tasks = [
        asyncio.create_task(agent_loop()),           # 🧠 AI Agent heartbeat
        asyncio.create_task(supabase_price_sync()),   # 📡 Supabase sync
        asyncio.create_task(cleanup_old_data()),       # 🧹 Data cleanup
        asyncio.create_task(supabase_trade_sync()),    # 💰 Trade history sync
    ]
    print("╔══════════════════════════════════════════════╗")
    print("║      🚀 ARBIX ArbiNet AI v2.0 STARTED       ║")
    print("║  5 Oracles │ Bellman-Ford │ XAI │ Portfolio  ║")
    print("╚══════════════════════════════════════════════╝")
    yield
    for t in tasks:
        t.cancel()
    print("🛑 Arbix Backend stopped")


# ── Safe JSON encoder that replaces inf/nan with null ──
class SafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            default=str,
            separators=(",", ":"),
        ).encode("utf-8")


def _sanitize(obj):
    """Recursively replace inf/nan floats with None so JSON doesn't crash."""
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    return obj


app = FastAPI(title="Arbix ArbiNet AI", version="2.0", lifespan=lifespan, default_response_class=SafeJSONResponse)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════
#  CORE API ROUTES
# ══════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {
        "name": "Arbix ArbiNet AI",
        "version": "2.0",
        "status": agent.state,
        "uptime": agent.get_status()["uptime"],
        "scan_count": agent.scan_count,
    }


# ── Agent Routes ──

@app.get("/api/agent/status")
async def get_agent_status():
    """Full agent status: state, performance, regime, thresholds."""
    return agent.get_status()


@app.get("/api/agent/activity")
async def get_agent_activity(limit: int = 50):
    """Agent activity log — state transitions, scans, trades."""
    return agent.get_activity_log(limit)


# ── Opportunity & Decision Routes ──

@app.get("/api/agent/opportunities")
async def get_opportunities():
    """Current detected arbitrage opportunities."""
    opps = arbitrage_detector.opportunities
    return {
        "count": len(opps),
        "profitable": sum(1 for o in opps if o.net_profit_pct > 0),
        "opportunities": [o.to_dict() for o in opps[:30]],
        "stats": arbitrage_detector.get_stats(),
    }


@app.get("/api/agent/decisions")
async def get_decisions(limit: int = 50):
    """XAI decision audit trail — full rationale for every decision."""
    return _sanitize({
        "decisions": xai_engine.get_recent_decisions(limit),
        "stats": xai_engine.get_stats(),
    })


@app.get("/api/agent/decisions/{decision_id}")
async def get_decision_detail(decision_id: str):
    """Get a specific decision by ID."""
    for d in xai_engine.decisions:
        if d["decision_id"] == decision_id:
            return _sanitize(d)
    return {"error": "Decision not found"}


# ── Portfolio Routes ──

@app.get("/api/agent/portfolio")
async def get_portfolio():
    """Portfolio: balance, P&L, equity curve, recent trades."""
    return {
        "performance": portfolio_engine.get_performance(),
        "equity_curve": portfolio_engine.get_equity_curve()[-200:],
        "recent_trades": portfolio_engine.get_recent_trades(20),
    }


@app.get("/api/agent/performance")
async def get_performance():
    """Performance metrics: win rate, Sharpe, drawdown."""
    return portfolio_engine.get_performance()


@app.get("/api/agent/trades")
async def get_trades(limit: int = 50):
    """Recent trades with full cost breakdown."""
    return portfolio_engine.get_recent_trades(limit)


@app.get("/api/trades/history")
async def get_trade_history(limit: int = 200):
    """Get full trade history from Supabase."""
    try:
        url = (
            f"{SUPABASE_URL}/rest/v1/trade_history"
            f"?order=executed_at.desc"
            f"&limit={limit}"
            f"&select=*"
        )
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, headers=SUPABASE_HEADERS)
            data = res.json()
            if isinstance(data, list):
                return {"trades": data, "count": len(data)}
            return {"trades": [], "count": 0, "note": "Table may not exist yet"}
    except Exception as e:
        # Fallback to in-memory trades
        return {
            "trades": portfolio_engine.get_recent_trades(limit),
            "count": len(portfolio_engine.trades),
            "source": "memory",
        }


@app.get("/api/trades/stats")
async def get_trade_stats():
    """Trade statistics summary."""
    trades = portfolio_engine.get_recent_trades(500)
    total = len(trades)
    wins = sum(1 for t in trades if t.get("won"))
    losses = total - wins
    total_pnl = sum(t.get("pnl", 0) for t in trades)
    total_volume = sum(t.get("position_size", 0) for t in trades)
    total_gas = sum(t.get("cost_breakdown", {}).get("gas", 0) for t in trades)
    total_slippage = sum(t.get("cost_breakdown", {}).get("slippage", 0) for t in trades)
    avg_confidence = sum(t.get("confidence", 0) for t in trades) / max(total, 1)
    best_trade = max(trades, key=lambda t: t.get("pnl", 0), default=None)
    worst_trade = min(trades, key=lambda t: t.get("pnl", 0), default=None)

    return _sanitize({
        "total_trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate": round(wins / max(total, 1) * 100, 1),
        "total_pnl": round(total_pnl, 4),
        "total_volume": round(total_volume, 2),
        "total_gas_costs": round(total_gas, 4),
        "total_slippage": round(total_slippage, 4),
        "avg_confidence": round(avg_confidence, 1),
        "avg_pnl_per_trade": round(total_pnl / max(total, 1), 4),
        "best_trade": best_trade,
        "worst_trade": worst_trade,
    })


@app.get("/api/agent/ml-accuracy")
async def get_ml_accuracy():
    """ML scoring engine accuracy stats: calibration curve, Brier score, accuracy by tier."""
    return ml_scoring_engine.get_accuracy_stats()


@app.get("/api/agent/calibration-curve")
async def get_calibration_curve():
    """Bayesian calibration curve: predicted confidence vs actual accuracy."""
    return ml_scoring_engine.calibrator.get_calibration_curve()


# ── Price Matrix Routes ──

@app.get("/api/prices/matrix")
async def get_price_matrix():
    """Full multi-source price matrix."""
    return {
        "matrix": price_matrix.get_full_matrix(),
        "summary": price_matrix.get_summary(),
    }


@app.get("/api/prices/multi/{symbol}")
async def get_multi_prices(symbol: str):
    """All source prices for a specific symbol."""
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym += "USDT"
    return {
        "symbol": sym,
        "sources": price_matrix.get_prices_for_symbol(sym),
    }


@app.get("/api/prices/spreads")
async def get_spreads():
    """Current spreads across all source pairs."""
    spreads = price_matrix.get_spreads()
    return {
        "count": len(spreads),
        "spreads": spreads[:50],
    }


# ── Market Intelligence Routes ──

@app.get("/api/market/regime")
async def get_market_regime():
    """Current market regime classification."""
    return anomaly_detector.get_regime()


@app.get("/api/market/anomalies")
async def get_anomalies(limit: int = 30):
    """Recent market anomalies."""
    all_anomalies = anomaly_detector.anomalies
    recent = anomaly_detector.get_recent_anomalies(limit)
    return {
        "anomalies": recent,
        "total_count": len(all_anomalies),
        "regime": anomaly_detector.get_regime(),
    }


# ── Legacy Routes (backward compatible) ──

@app.get("/price/{symbol}")
async def get_price(symbol: str):
    url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol.upper()}"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()


# ══════════════════════════════════════════════════════════
#  AGENT CONFIGURATION
# ══════════════════════════════════════════════════════════

@app.get("/api/agent/config")
async def get_agent_config():
    """Return current agent thresholds and config."""
    return {
        "min_confidence": agent.min_confidence,
        "min_spread_pct": agent.min_spread_pct,
        "max_risk": agent.max_risk,
        "scan_interval": getattr(agent, 'scan_interval', 5),
        "max_position_usd": getattr(agent, 'max_position_usd', 500),
        "circuit_breaker_drawdown": getattr(agent, 'circuit_breaker_drawdown', 5.0),
        "cooldown_seconds": getattr(agent, 'cooldown_seconds', 30),
    }


@app.post("/api/agent/config")
async def update_agent_config(config: dict):
    """Update agent thresholds in real-time."""
    updated = {}
    if "min_confidence" in config:
        v = max(0, min(100, int(config["min_confidence"])))
        agent.min_confidence = v
        updated["min_confidence"] = v
    if "min_spread_pct" in config:
        v = max(0.001, min(5.0, float(config["min_spread_pct"])))
        agent.min_spread_pct = v
        updated["min_spread_pct"] = v
    if "max_risk" in config:
        v = max(0, min(100, int(config["max_risk"])))
        agent.max_risk = v
        updated["max_risk"] = v
    if "scan_interval" in config:
        v = max(1, min(60, int(config["scan_interval"])))
        agent.scan_interval = v
        updated["scan_interval"] = v
    if "max_position_usd" in config:
        v = max(10, min(10000, float(config["max_position_usd"])))
        agent.max_position_usd = v
        updated["max_position_usd"] = v
    if "circuit_breaker_drawdown" in config:
        v = max(0.5, min(20.0, float(config["circuit_breaker_drawdown"])))
        agent.circuit_breaker_drawdown = v
        updated["circuit_breaker_drawdown"] = v
    if "cooldown_seconds" in config:
        v = max(5, min(300, int(config["cooldown_seconds"])))
        agent.cooldown_seconds = v
        updated["cooldown_seconds"] = v
    return {"status": "updated", "config": updated}


# ══════════════════════════════════════════════════════════
#  BNB CHAIN ON-CHAIN DATA
# ══════════════════════════════════════════════════════════

BSC_RPC = "https://bsc-dataseed1.binance.org"
BSC_TESTNET_RPC = "https://data-seed-prebsc-1-s1.binance.org:8545"

@app.get("/api/chain/gas")
async def get_bnb_gas():
    """Fetch BNB Chain gas price."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(BSC_RPC, json={
                "jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1
            })
            data = res.json()
            gas_wei = int(data["result"], 16)
            return {
                "gas_price_gwei": gas_wei / 1e9,
                "gas_price_wei": gas_wei,
                "chain": "BNB Smart Chain",
                "network": "mainnet",
            }
    except Exception as e:
        return {"error": str(e), "gas_price_gwei": 3.0}


@app.get("/api/chain/block")
async def get_latest_block():
    """Fetch latest BNB Chain block info."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(BSC_RPC, json={
                "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1
            })
            block_hex = res.json()["result"]
            block_num = int(block_hex, 16)

            # Get block details
            res2 = await client.post(BSC_RPC, json={
                "jsonrpc": "2.0", "method": "eth_getBlockByNumber",
                "params": [block_hex, False], "id": 2
            })
            block = res2.json().get("result", {})
            return {
                "block_number": block_num,
                "timestamp": int(block.get("timestamp", "0x0"), 16),
                "tx_count": len(block.get("transactions", [])),
                "gas_used": int(block.get("gasUsed", "0x0"), 16),
                "gas_limit": int(block.get("gasLimit", "0x0"), 16),
                "miner": block.get("miner", ""),
                "chain": "BNB Smart Chain",
            }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/chain/balance/{address}")
async def get_bnb_balance(address: str):
    """Fetch BNB balance for an address."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(BSC_RPC, json={
                "jsonrpc": "2.0", "method": "eth_getBalance",
                "params": [address, "latest"], "id": 1
            })
            balance_wei = int(res.json()["result"], 16)
            return {
                "address": address,
                "balance_bnb": balance_wei / 1e18,
                "balance_wei": balance_wei,
                "chain": "BNB Smart Chain",
            }
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/chain/stats")
async def get_chain_stats():
    """Combined chain health stats."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Gas price
            gas_res = await client.post(BSC_RPC, json={
                "jsonrpc": "2.0", "method": "eth_gasPrice", "params": [], "id": 1
            })
            gas_gwei = int(gas_res.json()["result"], 16) / 1e9

            # Latest block
            block_res = await client.post(BSC_RPC, json={
                "jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 2
            })
            block_num = int(block_res.json()["result"], 16)

            # BNB price from our matrix
            bnb_prices = price_matrix.get_prices_for_symbol("BNBUSDT")
            bnb_price = bnb_prices.get("binance", {}).get("price", 0) if bnb_prices else 0

            # Estimate tx cost
            gas_limit_swap = 250000  # typical PancakeSwap swap
            tx_cost_bnb = (gas_gwei * gas_limit_swap) / 1e9
            tx_cost_usd = tx_cost_bnb * bnb_price if bnb_price else 0

            return {
                "chain": "BNB Smart Chain",
                "block_number": block_num,
                "gas_price_gwei": round(gas_gwei, 2),
                "bnb_price_usd": round(bnb_price, 2),
                "estimated_swap_cost_bnb": round(tx_cost_bnb, 6),
                "estimated_swap_cost_usd": round(tx_cost_usd, 4),
                "network_status": "healthy",
                "block_time_seconds": 3,
                "tps_estimate": 60,
            }
    except Exception as e:
        return {"error": str(e), "network_status": "error"}



@app.get("/api/prices/history/{symbol}")
async def get_price_history(symbol: str, hours: int = 24):
    try:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%S')
        url = (
            f"{SUPABASE_URL}/rest/v1/coin_prices"
            f"?symbol=eq.{symbol.upper()}"
            f"&recorded_at=gte.{cutoff}"
            f"&order=recorded_at.asc"
            f"&select=price,change_percent,high_24h,low_24h,volume,recorded_at"
        )
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, headers=SUPABASE_HEADERS)
            return res.json()
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/prices/chart/{symbol}")
async def get_chart_data(symbol: str, interval: str = "5m", hours: int = 24):
    """
    Fetch 24h chart data for ANY coin.
    Returns Binance klines + Supabase stored points merged together.
    """
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym += "USDT"

    # Calculate how many klines we need for the requested hours
    interval_minutes = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240}
    mins = interval_minutes.get(interval, 5)
    limit = min(int((hours * 60) / mins), 1000)

    result = {"symbol": sym, "interval": interval, "hours": hours, "klines": [], "supabase_points": []}

    async with httpx.AsyncClient(timeout=15) as client:
        # 1. Fetch klines from Binance (works for ANY coin)
        try:
            kline_url = (
                f"https://api.binance.com/api/v3/klines"
                f"?symbol={sym}&interval={interval}&limit={limit}"
            )
            res = await client.get(kline_url)
            klines_raw = res.json()
            if isinstance(klines_raw, list):
                result["klines"] = [
                    {
                        "time": int(k[0]),           # open time ms
                        "open": float(k[1]),
                        "high": float(k[2]),
                        "low": float(k[3]),
                        "close": float(k[4]),
                        "volume": float(k[5]),
                    }
                    for k in klines_raw
                ]
        except Exception as e:
            print(f"⚠️ Binance klines error for {sym}: {e}")

        # 2. Also fetch Supabase stored points (for coins being tracked)
        try:
            from datetime import datetime, timedelta, timezone as tz
            cutoff = (datetime.now(tz.utc) - timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%S')
            supa_url = (
                f"{SUPABASE_URL}/rest/v1/coin_prices"
                f"?symbol=eq.{sym}"
                f"&recorded_at=gte.{cutoff}"
                f"&order=recorded_at.asc"
                f"&select=price,recorded_at"
            )
            supa_res = await client.get(supa_url, headers=SUPABASE_HEADERS)
            supa_data = supa_res.json()
            if isinstance(supa_data, list):
                result["supabase_points"] = supa_data
        except Exception as e:
            print(f"⚠️ Supabase history error for {sym}: {e}")

        # 3. If this is a non-top-10 coin, seed its price into Supabase for future tracking
        if sym not in TOP_COINS and result["klines"]:
            try:
                latest = result["klines"][-1]
                row = {
                    "symbol": sym,
                    "price": latest["close"],
                    "change_percent": 0.0,
                    "high_24h": max(k["high"] for k in result["klines"]),
                    "low_24h": min(k["low"] for k in result["klines"]),
                    "volume": sum(k["volume"] for k in result["klines"][-12:]),
                }
                insert_url = f"{SUPABASE_URL}/rest/v1/coin_prices"
                await client.post(insert_url, headers=SUPABASE_HEADERS, json=[row])
            except Exception:
                pass

    return result


@app.get("/api/prices/latest")
async def get_latest_prices():
    try:
        results = []
        async with httpx.AsyncClient(timeout=10) as client:
            for symbol in TOP_COINS:
                url = (
                    f"{SUPABASE_URL}/rest/v1/coin_prices"
                    f"?symbol=eq.{symbol}"
                    f"&order=recorded_at.desc"
                    f"&limit=1"
                    f"&select=symbol,price,change_percent,high_24h,low_24h,volume,recorded_at"
                )
                res = await client.get(url, headers=SUPABASE_HEADERS)
                data = res.json()
                if data and isinstance(data, list) and len(data) > 0:
                    results.append(data[0])
        return results
    except Exception as e:
        return {"error": str(e)}


# ══════════════════════════════════════════════════════════
#  WEBSOCKETS
# ══════════════════════════════════════════════════════════

@app.websocket("/ws/agent")
async def ws_agent(websocket: WebSocket):
    """
    Live WebSocket stream of ALL agent activity:
    state transitions, opportunities, decisions, trades, anomalies.
    """
    await websocket.accept()
    agent.subscribers.append(websocket)
    print(f"📡 Agent WebSocket connected ({len(agent.subscribers)} total)")

    try:
        # Send current status on connect
        await websocket.send_json({
            "type": "status",
            "data": agent.get_status(),
        })

        # Keep alive — listen for pings
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg == "status":
                    await websocket.send_json({"type": "status", "data": agent.get_status()})
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat", "state": agent.state,
                                            "scan_count": agent.scan_count})
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in agent.subscribers:
            agent.subscribers.remove(websocket)
        print(f"📡 Agent WebSocket disconnected ({len(agent.subscribers)} remaining)")


@app.websocket("/ws/trading/{symbol}")
async def ws_trading(websocket: WebSocket, symbol: str):
    """Live Binance ticker stream for a single symbol."""
    await websocket.accept()
    binance_ws_url = f"wss://stream.binance.com:9443/ws/{symbol.lower()}@ticker"

    try:
        async with ws_client.connect(
            binance_ws_url, ping_interval=20, ping_timeout=10, close_timeout=5
        ) as bws:
            while True:
                try:
                    data = await asyncio.wait_for(bws.recv(), timeout=30)
                    msg = json.loads(data)
                    await websocket.send_json({
                        "symbol": msg.get("s", symbol),
                        "price": msg.get("c", "0"),
                        "change": msg.get("P", "0"),
                        "high": msg.get("h", "0"),
                        "low": msg.get("l", "0"),
                        "volume": msg.get("v", "0"),
                    })
                except asyncio.TimeoutError:
                    continue
                except WebSocketDisconnect:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
            await websocket.close()
        except:
            pass


@app.websocket("/ws/spreads")
async def ws_spreads(websocket: WebSocket):
    """Live spread heatmap data — updates every 5 seconds."""
    await websocket.accept()
    try:
        while True:
            spreads = price_matrix.get_spreads()
            regime = anomaly_detector.get_regime()
            await websocket.send_json({
                "type": "spreads",
                "spreads": spreads[:30],
                "regime": regime["regime"],
                "timestamp": time.time(),
            })
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass


# ═══════════════════════════════════════════════════════════
# ║         SMART CONTRACTS API ENDPOINTS                   ║
# ═══════════════════════════════════════════════════════════

# Contract addresses (BSC Mainnet — deployed or pending)
CONTRACTS = {
    "executor": {
        "name": "ArbixExecutor",
        "address": "0x2df9e83a350027991170ab82a83FBD1836d76d3B",
        "status": "deployed",
        "description": "Flash-loan powered multi-DEX arbitrage executor",
        "functions": [
            {"name": "executeCrossDexArbitrage", "type": "write", "gas": "~280,000", "desc": "Two-leg cross-DEX arbitrage"},
            {"name": "executeTriangularArbitrage", "type": "write", "gas": "~350,000", "desc": "Three-leg single-DEX arbitrage"},
            {"name": "executeFlashArbitrage", "type": "write", "gas": "~400,000", "desc": "Flash loan arbitrage via PancakeSwap"},
            {"name": "getBestPrice", "type": "read", "gas": "0", "desc": "Query best price across 4 DEXes"},
            {"name": "calculateArbitrageProfit", "type": "read", "gas": "0", "desc": "Simulate profit between 2 DEXes"},
            {"name": "getStats", "type": "read", "gas": "0", "desc": "Get executor performance stats"},
            {"name": "getRecentTrades", "type": "read", "gas": "0", "desc": "Get on-chain trade history"},
        ],
        "safety": ["Circuit breaker", "Daily loss limit", "Min profit guard", "Deadline guard", "Pause mechanism"],
    },
    "oracle": {
        "name": "ArbixPriceOracle",
        "address": "0x73764D77B6736a2643Ea6fB773AeBb79FaFc7a83",
        "status": "deployed",
        "description": "On-chain multi-DEX price aggregator with TWAP & anomaly detection",
        "functions": [
            {"name": "getPriceFromDex", "type": "read", "gas": "0", "desc": "Get price from specific DEX"},
            {"name": "getAggregatedPrice", "type": "read", "gas": "0", "desc": "Aggregated price + spread"},
            {"name": "recordPrice", "type": "write", "gas": "~120,000", "desc": "Record price for TWAP"},
            {"name": "getTWAP", "type": "read", "gas": "0", "desc": "Get time-weighted average price"},
        ],
        "safety": ["Anomaly detection", "Multi-source aggregation", "TWAP smoothing"],
    },
    "vault": {
        "name": "ArbixVault",
        "address": "0xde18515788bd4bE6FA3C09AFd7957E1A47aEc307",
        "status": "deployed",
        "description": "Multi-sig vault for arbitrage capital management",
        "functions": [
            {"name": "deposit", "type": "write", "gas": "~80,000", "desc": "Deposit tokens into vault"},
            {"name": "withdraw", "type": "write", "gas": "~100,000", "desc": "Withdraw with profit share"},
            {"name": "fundExecutor", "type": "write", "gas": "~60,000", "desc": "Fund executor for trading"},
            {"name": "collectProfits", "type": "write", "gas": "~80,000", "desc": "Collect profits from executor"},
            {"name": "getVaultBalance", "type": "read", "gas": "0", "desc": "Get vault token balance"},
        ],
        "safety": ["Lock period", "Performance fee cap", "Non-reentrancy", "Emergency withdraw"],
    },
}

# Deployed DEX routers used by contracts
DEX_ROUTERS = {
    "pancakeswap": {"address": "0x10ED43C718714eb63d5aA57B78B54704E256024E", "name": "PancakeSwap V2", "fee": "0.25%"},
    "biswap":      {"address": "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8", "name": "BiSwap V2",      "fee": "0.10%"},
    "thena":       {"address": "0xd4ae6eCA985340Dd434D38F470aCCce4DC78D109", "name": "THENA",          "fee": "0.30%"},
    "babyswap":    {"address": "0x325E343f1dE602396E256B67eFd1F61C3A6B38Bd", "name": "BabySwap",       "fee": "0.30%"},
}

BSC_TOKENS = {
    "WBNB":  {"address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "decimals": 18},
    "USDT":  {"address": "0x55d398326f99059fF775485246999027B3197955", "decimals": 18},
    "BUSD":  {"address": "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", "decimals": 18},
    "USDC":  {"address": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "decimals": 18},
    "BTCB":  {"address": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", "decimals": 18},
    "ETH":   {"address": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", "decimals": 18},
}


@app.get("/api/contracts")
async def get_contracts():
    """Get all smart contract info."""
    return {
        "contracts": CONTRACTS,
        "dex_routers": DEX_ROUTERS,
        "tokens": BSC_TOKENS,
        "network": {
            "name": "BNB Smart Chain Testnet",
            "chain_id": 97,
            "rpc": "https://data-seed-prebsc-1-s1.binance.org:8545",
            "explorer": "https://testnet.bscscan.com",
        },
    }


@app.post("/api/agent/execute")
async def manual_execute_trade(body: dict):
    """Manually execute a detected arbitrage opportunity via the agent."""
    opp_id = body.get("opportunity_id")
    if not opp_id:
        return {"status": "error", "message": "No opportunity_id provided"}

    # Find the opportunity in the detector's current list
    target_opp = None
    for opp in arbitrage_detector.opportunities:
        if opp.id == opp_id:
            target_opp = opp
            break

    if not target_opp:
        return {"status": "queued", "message": f"Opportunity {opp_id} expired — agent will scan for next best"}

    try:
        # Score through both engines (same pipeline the agent uses)
        full_matrix = price_matrix.matrix
        legacy_scoring = scoring_engine.score(target_opp, full_matrix)
        ml_scoring = ml_scoring_engine.score(target_opp, full_matrix)

        # ML engine is primary scorer
        scoring = ml_scoring
        confidence = scoring.get("final_confidence", scoring.get("confidence", 50))

        # Generate XAI rationale (same as agent run_cycle)
        rationale = xai_engine.generate_rationale(target_opp, scoring, full_matrix)

        # Enrich with ML analysis
        rationale["ml_analysis"] = {
            "algorithm_agreement": ml_scoring.get("algorithm_agreement"),
            "bayesian_calibration": ml_scoring.get("bayesian_calibration"),
            "volatility_adjustment": ml_scoring.get("volatility_adjustment"),
            "raw_confidence": ml_scoring.get("raw_confidence"),
            "legacy_confidence": legacy_scoring.get("confidence"),
        }

        # Force EXECUTE decision for manual trades (override any HOLD)
        rationale["decision"] = "EXECUTE"

        # Execute through portfolio engine (expects full rationale dict)
        trade = portfolio_engine.execute_trade(rationale)

        if trade and isinstance(trade, dict) and trade.get("id"):
            # Record outcome in ML feedback loop
            ml_scoring_engine.record_trade_outcome(
                confidence=confidence,
                was_profitable=trade.get("won", True),
            )
            return {
                "status": "executed",
                "opportunity_id": opp_id,
                "confidence": round(confidence, 1),
                "trade": {
                    "symbol": ", ".join(trade.get("symbols", [])),
                    "pnl": round(trade.get("pnl", 0), 4),
                    "result": "WIN" if trade.get("won") else "LOSS",
                    "spread_pct": round(target_opp.net_profit_pct, 4),
                },
                "rationale": {
                    "primary_reason": rationale.get("verdict", "Manual execution"),
                    "confidence": round(confidence, 1),
                }
            }
        else:
            return {
                "status": "blocked",
                "message": "Trade blocked by circuit breaker or risk limits",
                "confidence": round(confidence, 1),
            }

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/contracts/simulate")
async def simulate_arbitrage(
    token_in: str = "USDT",
    token_out: str = "WBNB",
    amount: float = 1000.0,
):
    """Simulate cross-DEX arbitrage profit using on-chain getAmountsOut."""
    token_in_addr = BSC_TOKENS.get(token_in, {}).get("address")
    token_out_addr = BSC_TOKENS.get(token_out, {}).get("address")
    if not token_in_addr or not token_out_addr:
        return {"error": "Unknown token"}

    decimals_in = BSC_TOKENS[token_in]["decimals"]
    amount_wei = int(amount * (10 ** decimals_in))

    # getAmountsOut selector
    selector = "0xd06ca61f"
    amount_hex = hex(amount_wei)[2:].zfill(64)
    # offset to array
    offset = "0000000000000000000000000000000000000000000000000000000000000040"
    array_len = "0000000000000000000000000000000000000000000000000000000000000002"
    addr_in = token_in_addr[2:].lower().zfill(64)
    addr_out = token_out_addr[2:].lower().zfill(64)
    calldata = selector + amount_hex + offset + array_len + addr_in + addr_out

    raw_results = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for dex_name, dex_info in DEX_ROUTERS.items():
            try:
                payload = {
                    "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                    "params": [{"to": dex_info["address"], "data": calldata}, "latest"]
                }
                res = await client.post("https://bsc-dataseed1.binance.org", json=payload)
                data = res.json()
                result_hex = data.get("result", "0x")
                # getAmountsOut returns ABI-encoded uint256[]: offset(32) + length(32) + elements
                # For a 2-token path: offset + len(2) + amountIn + amountOut
                # The output amount is the LAST 32-byte word
                if result_hex and len(result_hex) > 66 and not data.get("error"):
                    out_hex = result_hex[-64:]
                    out_wei = int(out_hex, 16)
                    decimals_out = BSC_TOKENS[token_out]["decimals"]
                    out_human = out_wei / (10 ** decimals_out)
                    raw_results[dex_name] = {
                        "amount_out": round(out_human, 8),
                        "router": dex_info["address"],
                        "fee": dex_info["fee"],
                    }
            except Exception:
                pass

    # ------- Liquidity sanity filter -------
    # Use the BEST quote as reference — the DEX with the most liquidity
    # returns the closest-to-correct output. Any pool returning less than
    # 10% of the best quote has negligible liquidity and would cause
    # massive slippage on a real trade. We exclude those from the spread.
    results = {}
    if raw_results:
        best_out = max(v["amount_out"] for v in raw_results.values())
        for dex_name, info in raw_results.items():
            out = info["amount_out"]
            # Skip if output is basically zero
            if out <= 0:
                continue
            # Skip if output is < 10% of the best quote (no real liquidity)
            if best_out > 0 and out < best_out * 0.10:
                continue
            results[dex_name] = info

    # Find arbitrage opportunity
    if len(results) >= 2:
        sorted_dexes = sorted(results.items(), key=lambda x: x[1]["amount_out"])
        cheapest = sorted_dexes[0]
        most_expensive = sorted_dexes[-1]
        spread_pct = ((most_expensive[1]["amount_out"] - cheapest[1]["amount_out"]) / cheapest[1]["amount_out"]) * 100

        return {
            "token_in": token_in,
            "token_out": token_out,
            "amount_in": amount,
            "dex_prices": results,
            "best_buy": cheapest[0],
            "best_sell": most_expensive[0],
            "spread_pct": round(spread_pct, 4),
            "estimated_profit": round(spread_pct * amount / 100, 4),
            "profitable": spread_pct > 0.1,
            "excluded_dexes": {k: v for k, v in raw_results.items() if k not in results},
        }

    return {"token_in": token_in, "token_out": token_out, "dex_prices": results, "profitable": False, "excluded_dexes": {k: v for k, v in raw_results.items() if k not in results}}


@app.get("/api/contracts/reserves/{token_a}/{token_b}")
async def get_pair_reserves(token_a: str, token_b: str):
    """Get liquidity reserves for a token pair across DEXes."""
    addr_a = BSC_TOKENS.get(token_a, {}).get("address")
    addr_b = BSC_TOKENS.get(token_b, {}).get("address")
    if not addr_a or not addr_b:
        return {"error": "Unknown token"}

    # getPair(address,address) selector: 0xe6a43905
    selector = "0xe6a43905"
    a_hex = addr_a[2:].lower().zfill(64)
    b_hex = addr_b[2:].lower().zfill(64)
    calldata = selector + a_hex + b_hex

    factories = {
        "pancakeswap": "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
        "biswap": "0x858E3312ed3A876947EA49d572A7C42DE08af7EE",
    }

    results = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for dex_name, factory_addr in factories.items():
            try:
                # Get pair address
                payload = {
                    "jsonrpc": "2.0", "id": 1, "method": "eth_call",
                    "params": [{"to": factory_addr, "data": calldata}, "latest"]
                }
                res = await client.post("https://bsc-dataseed1.binance.org", json=payload)
                data = res.json()
                pair_hex = data.get("result", "0x")
                pair_addr = "0x" + pair_hex[-40:]

                if pair_addr == "0x" + "0" * 40:
                    results[dex_name] = {"pair": None, "reserves": None}
                    continue

                # Get reserves from pair
                reserves_selector = "0x0902f1ac"
                payload2 = {
                    "jsonrpc": "2.0", "id": 2, "method": "eth_call",
                    "params": [{"to": pair_addr, "data": reserves_selector}, "latest"]
                }
                res2 = await client.post("https://bsc-dataseed1.binance.org", json=payload2)
                data2 = res2.json()
                reserves_hex = data2.get("result", "0x")

                if len(reserves_hex) >= 130:
                    r0 = int(reserves_hex[2:66], 16)
                    r1 = int(reserves_hex[66:130], 16)
                    dec_a = BSC_TOKENS[token_a]["decimals"]
                    dec_b = BSC_TOKENS[token_b]["decimals"]
                    results[dex_name] = {
                        "pair": pair_addr,
                        "reserve_a": round(r0 / (10 ** dec_a), 4),
                        "reserve_b": round(r1 / (10 ** dec_b), 4),
                        "reserve_a_raw": r0,
                        "reserve_b_raw": r1,
                    }
                else:
                    results[dex_name] = {"pair": pair_addr, "reserves": "error"}
            except Exception as e:
                results[dex_name] = {"error": str(e)}

    return {
        "token_a": token_a,
        "token_b": token_b,
        "reserves": results,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
