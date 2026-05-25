"""
fut.invest - Python Services API
API FastAPI que expone los servicios Python al backend Node.js.
"""

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

# Agregar servicios al path
sys.path.insert(0, os.path.dirname(__file__))

from analyzer.market_analyzer import analyzer, ROIAnalysis, MarketInsight, PortfolioMetrics
from goarbit.engine import engine, ArbitrageOpportunity, TriangularRoute


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicializar y cerrar servicios."""
    await engine.initialize()
    yield
    await engine.close()


app = FastAPI(
    title="fut.invest Python Services",
    description="Análisis de mercado y motor de arbitraje",
    version="1.0.0",
    lifespan=lifespan,
)


# === Request Models ===
class ROIRequest(BaseModel):
    balance: float = 10000
    tier: str = "silver"
    roi_history: list[float] = []


class PortfolioRequest(BaseModel):
    transactions: list[dict] = []


class ScanRequest(BaseModel):
    symbol: str = "BTC/USDT"
    amount: float = 100


class ScanAllRequest(BaseModel):
    amount: float = 100


class TriangularRequest(BaseModel):
    amount: float = 1000


class ExecuteRequest(BaseModel):
    symbol: str
    buy_exchange: str
    sell_exchange: str
    buy_price: float
    sell_price: float
    spread_percent: float
    profit_usd: float
    profit_percent: float


# === Analyzer Endpoints ===
@app.post("/analyze/roi", response_model=ROIAnalysis)
async def analyze_roi(req: ROIRequest):
    """Analiza y predice ROI del usuario."""
    try:
        return analyzer.analyze_roi(req.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analyze/market")
async def get_market_insights(symbols: Optional[str] = None):
    """Obtiene insights del mercado."""
    try:
        symbol_list = symbols.split(",") if symbols else None
        return analyzer.get_market_insights(symbol_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/portfolio", response_model=PortfolioMetrics)
async def analyze_portfolio(req: PortfolioRequest):
    """Calcula métricas del portafolio."""
    try:
        return analyzer.calculate_portfolio_metrics(req.transactions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# === GoArbit Endpoints ===
@app.post("/goarbit/scan", response_model=Optional[ArbitrageOpportunity])
async def scan_pair(req: ScanRequest):
    """Escanea un par para oportunidades de arbitraje."""
    try:
        return await engine.scan_pair(req.symbol, req.amount)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/goarbit/scan-all")
async def scan_all(req: ScanAllRequest):
    """Escanea todos los pares."""
    try:
        return await engine.scan_all(req.amount)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/goarbit/triangular", response_model=Optional[TriangularRoute])
async def scan_triangular(req: TriangularRequest):
    """Escanea arbitraje triangular."""
    try:
        return await engine.scan_triangular(req.amount)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/goarbit/execute")
async def execute_arbitrage(req: ExecuteRequest):
    """Ejecuta un arbitraje."""
    try:
        opp = ArbitrageOpportunity(**req.model_dump())
        return await engine.execute(opp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# === Health ===
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "python-services",
        "exchanges": list(engine.exchanges.keys()),
        "initialized": engine._initialized,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_SERVICES_PORT", 3002))
    uvicorn.run(app, host="0.0.0.0", port=port)
