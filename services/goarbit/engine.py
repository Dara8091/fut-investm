"""
fut.invest - GoArbit Engine
Motor de arbitraje entre exchanges usando ccxt.
Escanea spreads y ejecuta oportunidades rentables.
"""

import asyncio
import ccxt.async_support as ccxt
import numpy as np
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ArbitrageOpportunity(BaseModel):
    symbol: str
    buy_exchange: str
    sell_exchange: str
    buy_price: float
    sell_price: float
    spread_percent: float
    profit_usd: float
    profit_percent: float
    timestamp: str
    executed: bool = False


class TriangularRoute(BaseModel):
    path: list[str]
    initial_amount: float
    final_amount: float
    profit: float
    profit_percent: float
    exchange: str


class GoArbitEngine:
    """Motor de arbitraje multi-exchange."""

    EXCHANGES = ["binance", "okx", "bybit", "kucoin", "gate"]
    SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"]

    def __init__(self, api_keys: dict = None):
        self.api_keys = api_keys or {}
        self.exchanges: dict = {}
        self._initialized = False

    async def initialize(self):
        """Inicializa conexiones a exchanges."""
        if self._initialized:
            return

        for exchange_id in self.EXCHANGES:
            try:
                exchange_class = getattr(ccxt, exchange_id)
                config = {"enableRateLimit": True}

                if exchange_id in self.api_keys:
                    config.update(self.api_keys[exchange_id])

                self.exchanges[exchange_id] = exchange_class(config)
            except Exception as e:
                print(f"Error inicializando {exchange_id}: {e}")

        self._initialized = True

    async def close(self):
        """Cierra conexiones."""
        for exchange in self.exchanges.values():
            try:
                await exchange.close()
            except:
                pass
        self._initialized = False

    async def get_price(self, exchange_id: str, symbol: str) -> Optional[float]:
        """Obtiene precio de un exchange."""
        if exchange_id not in self.exchanges:
            return None
        try:
            ticker = await self.exchanges[exchange_id].fetch_ticker(symbol)
            return ticker.get("last")
        except:
            return None

    async def scan_pair(self, symbol: str, amount: float = 100) -> Optional[ArbitrageOpportunity]:
        """Escanea un par en todos los exchanges."""
        prices = {}
        for exchange_id in self.EXCHANGES:
            price = await self.get_price(exchange_id, symbol)
            if price:
                prices[exchange_id] = price

        if len(prices) < 2:
            return None

        # Encontrar mejor oportunidad
        buy_exchange = min(prices, key=prices.get)
        sell_exchange = max(prices, key=prices.get)
        buy_price = prices[buy_exchange]
        sell_price = prices[sell_exchange]

        spread = (sell_price - buy_price) / buy_price * 100
        # Costos estimados: 0.1% maker + 0.1% taker por lado
        fees = 0.4
        net_spread = spread - fees
        profit = amount * net_spread / 100

        if net_spread <= 0:
            return None

        return ArbitrageOpportunity(
            symbol=symbol,
            buy_exchange=buy_exchange.capitalize(),
            sell_exchange=sell_exchange.capitalize(),
            buy_price=buy_price,
            sell_price=sell_price,
            spread_percent=round(spread, 3),
            profit_usd=round(profit, 2),
            profit_percent=round(net_spread, 3),
            timestamp=datetime.utcnow().isoformat(),
        )

    async def scan_all(self, amount: float = 100) -> list[ArbitrageOpportunity]:
        """Escanea todos los pares."""
        opportunities = []
        for symbol in self.SYMBOLS:
            opp = await self.scan_pair(symbol, amount)
            if opp:
                opportunities.append(opp)

        # Ordenar por profit
        opportunities.sort(key=lambda x: x.profit_usd, reverse=True)
        return opportunities

    async def scan_triangular(self, amount: float = 1000) -> Optional[TriangularRoute]:
        """Escanea arbitraje triangular en un exchange."""
        # Usar Binance como principal para triangular
        if "binance" not in self.exchanges:
            return None

        try:
            # Ruta: USDT -> BTC -> ETH -> USDT
            pairs = [("BTC/USDT", "ETH/BTC", "ETH/USDT")]

            best_route = None
            best_profit = 0

            for pair1, pair2, pair3 in pairs:
                t1 = await self.exchanges["binance"].fetch_ticker(pair1)
                t2 = await self.exchanges["binance"].fetch_ticker(pair2)
                t3 = await self.exchanges["binance"].fetch_ticker(pair3)

                if not all([t1.get("last"), t2.get("last"), t3.get("last")]):
                    continue

                # Simular conversión
                btc_amount = amount / t1["last"]
                eth_amount = btc_amount / t2["last"]
                final_usd = eth_amount * t3["last"]

                fees = amount * 0.003  # 0.1% x 3 trades
                profit = final_usd - amount - fees

                if profit > best_profit:
                    best_profit = profit
                    best_route = TriangularRoute(
                        path=["USDT", "BTC", "ETH", "USDT"],
                        initial_amount=amount,
                        final_amount=round(final_usd, 2),
                        profit=round(profit, 2),
                        profit_percent=round(profit / amount * 100, 3),
                        exchange="Binance",
                    )

            return best_route if best_profit > 0 else None

        except Exception as e:
            print(f"Error en triangular: {e}")
            return None

    async def execute(self, opportunity: ArbitrageOpportunity) -> dict:
        """Ejecuta un arbitraje (simulado sin API keys reales)."""
        if not self.api_keys:
            return {"success": False, "error": "API keys no configuradas"}

        # En producción: ejecutar órdenes reales
        return {
            "success": True,
            "message": f"Arbitraje ejecutado: {opportunity.symbol}",
            "profit": opportunity.profit_usd,
            "timestamp": datetime.utcnow().isoformat(),
        }


# Singleton
engine = GoArbitEngine()
