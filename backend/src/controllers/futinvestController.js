const db = require('../config/database');
const logger = require('../config/logger');
const pythonClient = require('../services/pythonClient');

async function scanPair(req, res) {
    try {
        const { symbol, amount } = req.query;
        const userId = req.user.userId;

        // Intentar escaneo real con Python
        const result = await pythonClient.scanPair(symbol, parseFloat(amount) || 100);

        if (result) {
            // Guardar en BD para historial
            await db.prepare(
                'INSERT INTO arbitrage_opportunities (symbol, buy_exchange, sell_exchange, spread, profit, profit_percent, is_profitable, executed) VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE)'
            ).run(result.symbol, result.buy_exchange, result.sell_exchange, result.spread_percent, result.profit_usd, result.profit_percent);

            return res.json({ opportunity: result });
        }

        // Fallback: simulación
        const spread = (Math.random() * 2).toFixed(3);
        const profit = (parseFloat(amount) * spread / 100).toFixed(2);
        const opp = {
            symbol,
            buyExchange: 'Binance',
            sellExchange: 'OKX',
            buyPrice: 42000,
            sellPrice: 42000 * (1 + spread / 100),
            spreadPercent: parseFloat(spread),
            profit: parseFloat(profit),
            profitPercent: parseFloat(spread),
        };

        res.json({ opportunity: opp });
    } catch (err) {
        logger.error('Error en scanPair:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function scanAll(req, res) {
    try {
        const { amount } = req.query;
        const userId = req.user.userId;

        // Intentar escaneo real con Python
        const results = await pythonClient.scanAll(parseFloat(amount) || 100);

        if (results && results.length > 0) {
            return res.json({ opportunities: results });
        }

        // Fallback: simulación
        const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
        const opps = pairs.map(sym => {
            const spread = (Math.random() * 1.5).toFixed(3);
            const profit = (parseFloat(amount) * spread / 100).toFixed(2);
            return {
                symbol: sym,
                buyExchange: 'Binance',
                sellExchange: 'OKX',
                buyPrice: 42000,
                sellPrice: 42000 * (1 + spread / 100),
                spreadPercent: parseFloat(spread),
                profit: parseFloat(profit),
            };
        });

        res.json({ opportunities: opps });
    } catch (err) {
        logger.error('Error en scanAll:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function scanTriangular(req, res) {
    try {
        const { amount } = req.query;

        // Intentar escaneo triangular con Python
        const result = await pythonClient.scanTriangular(parseFloat(amount) || 1000);

        if (result) {
            return res.json({ best: result });
        }

        // Fallback: simulación
        const path = ['USDT', 'BTC', 'ETH', 'USDT'];
        const profitPercent = (Math.random() * 0.5).toFixed(3);
        const profit = (parseFloat(amount) * profitPercent / 100).toFixed(2);
        const finalAmount = (parseFloat(amount) + parseFloat(profit)).toFixed(2);

        res.json({
            best: {
                path,
                initialAmount: parseFloat(amount),
                finalAmount: parseFloat(finalAmount),
                profit: parseFloat(profit),
                profitPercent: parseFloat(profitPercent),
                exchange: 'Binance',
            }
        });
    } catch (err) {
        logger.error('Error en scanTriangular:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function executeArbitrage(req, res) {
    try {
        const userId = req.user.userId;
        const { symbol, amount, buyExchange, sellExchange, buyPrice, sellPrice } = req.body;

        // Verificar balance
        const account = await db.prepare('SELECT balance FROM accounts WHERE user_id = $1').get(userId);
        if (!account || account.balance < amount) {
            return res.status(400).json({ error: 'Balance insuficiente' });
        }

        // Ejecutar con Python si está disponible
        const result = await pythonClient.execute({
            symbol,
            buy_exchange: buyExchange,
            sell_exchange: sellExchange,
            buy_price: buyPrice,
            sell_price: sellPrice,
            spread_percent: ((sellPrice - buyPrice) / buyPrice * 100),
            profit_usd: amount * ((sellPrice - buyPrice) / buyPrice * 100 - 0.4) / 100,
            profit_percent: ((sellPrice - buyPrice) / buyPrice * 100 - 0.4),
        });

        if (result && result.success) {
            // Actualizar balance
            const profit = result.profit || (amount * 0.01);
            await db.prepare('UPDATE accounts SET balance = balance + $1 WHERE user_id = $2').run(profit, userId);

            // Registrar transacción
            await db.prepare(
                'INSERT INTO transactions (user_id, type, asset, amount, fee, status, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)'
            ).run(userId, 'arbitrage', symbol, profit, profit * 0.1, 'completed', JSON.stringify({
                buyExchange, sellExchange, buyPrice, sellPrice, profit, txHash: 'simulated_' + Date.now()
            }));

            return res.json({ success: true, message: 'Arbitraje ejecutado', profit });
        }

        // Simulación fallback
        const spread = ((sellPrice - buyPrice) / buyPrice * 100);
        const fees = 0.4;
        const profit = amount * (spread - fees) / 100;

        if (profit <= 0) {
            return res.status(400).json({ error: 'Arbitraje no rentable después de comisiones' });
        }

        await db.prepare('UPDATE accounts SET balance = balance + $1 WHERE user_id = $2').run(profit, userId);

        res.json({ success: true, message: 'Arbitraje ejecutado (simulado)', profit: profit.toFixed(2) });
    } catch (err) {
        logger.error('Error en executeArbitrage:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = {
    scanPair,
    scanAll,
    scanTriangular,
    executeArbitrage,
};
