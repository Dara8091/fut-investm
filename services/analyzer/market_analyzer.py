"""
fut.invest - Market Analysis Service
Predicción de ROI, análisis de tendencias y métricas de portafolio.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel


class ROIAnalysis(BaseModel):
    current_roi: float
    predicted_roi_7d: float
    predicted_roi_30d: float
    confidence: float
    trend: str  # "up", "down", "stable"
    volatility: float
    recommendation: str


class MarketInsight(BaseModel):
    symbol: str
    price: float
    change_24h: float
    volume_24h: float
    signal: str  # "buy", "sell", "hold"
    strength: float


class PortfolioMetrics(BaseModel):
    total_value: float
    daily_change: float
    weekly_change: float
    monthly_change: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float


class MarketAnalyzer:
    """Analizador de mercado con predicción de ROI."""

    def __init__(self):
        self._historical_data: dict = {}
        self._models: dict = {}

    def analyze_roi(self, user_data: dict) -> ROIAnalysis:
        """Analiza y predice el ROI del usuario."""
        balance = user_data.get("balance", 10000)
        history = user_data.get("roi_history", [])

        if len(history) < 7:
            # Datos insuficientes, usar simulación basada en tier
            tier = user_data.get("tier", "silver")
            roi_ranges = {
                "silver": (1.0, 1.5),
                "gold": (1.5, 2.0),
                "black": (1.8, 2.5),
                "interbank": (2.0, 3.0),
            }
            min_roi, max_roi = roi_ranges.get(tier, (1.0, 1.5))
            current_roi = np.random.uniform(min_roi, max_roi)
        else:
            current_roi = history[-1]

        # Predicción simple con media móvil ponderada
        if len(history) >= 7:
            weights = np.exp(np.linspace(-1, 0, len(history)))
            weights /= weights.sum()
            predicted_7d = np.average(history[-7:], weights=weights[-7:])
            predicted_30d = np.average(history, weights=weights)
        else:
            predicted_7d = current_roi * 1.02
            predicted_30d = current_roi * 1.05

        # Calcular tendencia
        if len(history) >= 3:
            recent = history[-3:]
            trend = "up" if recent[-1] > recent[0] else "down" if recent[-1] < recent[0] else "stable"
        else:
            trend = "stable"

        # Volatilidad
        volatility = np.std(history[-7:]) if len(history) >= 7 else 0.15

        # Confianza basada en cantidad de datos
        confidence = min(0.95, 0.5 + len(history) * 0.05)

        # Recomendación
        if predicted_7d > current_roi * 1.05:
            recommendation = "Aumentar inversión - tendencia positiva"
        elif predicted_7d < current_roi * 0.95:
            recommendation = "Mantener posición - posible corrección"
        else:
            recommendation = "Continuar inversión actual"

        return ROIAnalysis(
            current_roi=round(current_roi, 2),
            predicted_roi_7d=round(predicted_7d, 2),
            predicted_roi_30d=round(predicted_30d, 2),
            confidence=round(confidence, 2),
            trend=trend,
            volatility=round(volatility, 4),
            recommendation=recommendation,
        )

    def get_market_insights(self, symbols: list[str] = None) -> list[MarketInsight]:
        """Obtiene insights del mercado para símbolos clave."""
        if symbols is None:
            symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT"]

        # Simulación de datos de mercado (en producción usar ccxt)
        base_prices = {
            "BTC/USDT": 42000,
            "ETH/USDT": 2200,
            "SOL/USDT": 98,
            "BNB/USDT": 310,
        }

        insights = []
        for symbol in symbols:
            base = base_prices.get(symbol, 100)
            change = np.random.uniform(-5, 5)
            price = base * (1 + change / 100)

            # Señal basada en momentum simulado
            momentum = np.random.uniform(-1, 1)
            if momentum > 0.3:
                signal = "buy"
                strength = min(1.0, momentum)
            elif momentum < -0.3:
                signal = "sell"
                strength = min(1.0, abs(momentum))
            else:
                signal = "hold"
                strength = 0.5

            insights.append(MarketInsight(
                symbol=symbol,
                price=round(price, 2),
                change_24h=round(change, 2),
                volume_24h=round(np.random.uniform(1000000, 50000000), 0),
                signal=signal,
                strength=round(strength, 2),
            ))

        return insights

    def calculate_portfolio_metrics(self, transactions: list[dict]) -> PortfolioMetrics:
        """Calcula métricas avanzadas del portafolio."""
        if not transactions:
            return PortfolioMetrics(
                total_value=10000,
                daily_change=1.85,
                weekly_change=12.5,
                monthly_change=45.2,
                sharpe_ratio=1.8,
                max_drawdown=-5.2,
                win_rate=0.72,
            )

        df = pd.DataFrame(transactions)
        df["date"] = pd.to_datetime(df.get("created_at", df.get("date", [])))
        df = df.sort_values("date")

        # Calcular retornos diarios
        daily_returns = []
        for i in range(1, len(df)):
            ret = (df.iloc[i].get("amount", 0) - df.iloc[i-1].get("amount", 0)) / df.iloc[i-1].get("amount", 1)
            daily_returns.append(ret)

        if daily_returns:
            sharpe = np.mean(daily_returns) / (np.std(daily_returns) + 1e-8) * np.sqrt(365)
            max_dd = min(0, min(np.minimum.accumulate(daily_returns)))
            win_rate = sum(1 for r in daily_returns if r > 0) / len(daily_returns)
        else:
            sharpe = 1.8
            max_dd = -0.05
            win_rate = 0.72

        return PortfolioMetrics(
            total_value=round(df.iloc[-1].get("amount", 10000), 2),
            daily_change=round(np.mean(daily_returns[-1:]) * 100 if daily_returns else 1.85, 2),
            weekly_change=round(np.mean(daily_returns[-7:]) * 100 if len(daily_returns) >= 7 else 12.5, 2),
            monthly_change=round(np.mean(daily_returns[-30:]) * 100 if len(daily_returns) >= 30 else 45.2, 2),
            sharpe_ratio=round(sharpe, 2),
            max_drawdown=round(max_dd * 100, 2),
            win_rate=round(win_rate, 2),
        )


# Singleton
analyzer = MarketAnalyzer()
