const db = require('../config/database');
const logger = require('../config/logger');
const pythonClient = require('../services/pythonClient');

async function getFutInvestProfile(req, res) {
    try {
        const userId = req.user.userId;

        const stats = await db.prepare(`
            SELECT 
                COUNT(*) as total_scans,
                COUNT(CASE WHEN is_profitable = TRUE THEN 1 END) as profitable_opportunities,
                COALESCE(SUM(CASE WHEN executed = TRUE THEN profit ELSE 0 END), 0) as total_profit,
                COALESCE(MAX(CASE WHEN executed = TRUE THEN profit ELSE 0 END), 0) as best_profit,
                COUNT(CASE WHEN executed = TRUE THEN 1 END) as executed_count
            FROM arbitrage_opportunities
            WHERE id IN (
                SELECT CAST(json_extract(metadata, '$.opportunityId') AS INTEGER)
                FROM transactions
                WHERE user_id = $1 AND type = 'arbitrage'
            )
        `).get(userId);

        const recentScans = await db.prepare(`
            SELECT symbol, buy_exchange, sell_exchange, spread, profit, profit_percent, is_profitable, executed, created_at
            FROM arbitrage_opportunities
            WHERE id IN (
                SELECT CAST(json_extract(metadata, '$.opportunityId') AS INTEGER)
                FROM transactions
                WHERE user_id = $1 AND type = 'arbitrage'
            )
            ORDER BY created_at DESC
            LIMIT $2
        `).all(userId, 10);

        const executedTrades = await db.prepare(`
            SELECT t.id, t.amount, t.fee, t.status, t.created_at,
                   json_extract(t.metadata, '$.buyExchange') as buy_exchange,
                   json_extract(t.metadata, '$.sellExchange') as sell_exchange,
                   json_extract(t.metadata, '$.profit') as profit,
                   json_extract(t.metadata, '$.txHash') as tx_hash
            FROM transactions t
            WHERE t.user_id = $1 AND t.type = 'arbitrage'
            ORDER BY t.created_at DESC
            LIMIT $2
        `).all(userId, 10);

        const enabled = process.env.FUTINVEST_ENABLED !== 'false';
        const autoExecute = process.env.FUTINVEST_AUTO_EXECUTE === 'true';
        const minProfit = parseFloat(process.env.FUTINVEST_MIN_PROFIT_USD || '1.0');
        const platformFee = parseFloat(process.env.FUTINVEST_PLATFORM_FEE_PERCENT || '10');

        res.json({
            enabled,
            config: {
                autoExecute,
                minProfit,
                platformFee,
                maxTrade: parseFloat(process.env.FUTINVEST_MAX_TRADE_USD || '10000'),
            },
            stats: {
                totalScans: stats.total_scans || 0,
                profitableOpportunities: stats.profitable_opportunities || 0,
                totalProfit: parseFloat(stats.total_profit) || 0,
                bestProfit: parseFloat(stats.best_profit) || 0,
                executedCount: stats.executed_count || 0,
            },
            recentScans,
            executedTrades,
        });
    } catch (err) {
        logger.error('Error en getFutInvestProfile:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getFutInvestStats(req, res) {
    try {
        const userId = req.user.userId;
        const days = parseInt(req.query.days) || 30;

        const dailyStats = await db.prepare(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as scans,
                COUNT(CASE WHEN is_profitable = TRUE THEN 1 END) as profitable,
                COALESCE(SUM(CASE WHEN executed = TRUE THEN profit ELSE 0 END), 0) as profit
            FROM arbitrage_opportunities
            WHERE created_at >= DATE('now', '-' || $1 || ' days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `).all(days);

        const pairStats = await db.prepare(`
            SELECT 
                symbol,
                COUNT(*) as scans,
                COUNT(CASE WHEN is_profitable = TRUE THEN 1 END) as profitable,
                COALESCE(AVG(CASE WHEN is_profitable = TRUE THEN profit ELSE NULL END), 0) as avg_profit,
                COALESCE(MAX(profit), 0) as max_profit
            FROM arbitrage_opportunities
            WHERE created_at >= DATE('now', '-' || $1 || ' days')
            GROUP BY symbol
            ORDER BY scans DESC
        `).all(days);

        const exchangeStats = await db.prepare(`
            SELECT 
                buy_exchange as exchange,
                COUNT(*) as buy_count,
                COUNT(CASE WHEN is_profitable = TRUE THEN 1 END) as profitable_count,
                COALESCE(AVG(profit), 0) as avg_profit
            FROM arbitrage_opportunities
            WHERE created_at >= DATE('now', '-' || $1 || ' days')
            GROUP BY buy_exchange
            ORDER BY buy_count DESC
        `).all(days);

        res.json({
            dailyStats,
            pairStats,
            exchangeStats,
            period: `${days} days`,
        });
    } catch (err) {
        logger.error('Error en getFutInvestStats:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function updateFutInvestSettings(req, res) {
    try {
        const userId = req.user.userId;
        const { autoExecute, minProfit, maxTrade } = req.body;

        const updates = [];
        const params = [];

        if (autoExecute !== undefined) {
            updates.push('auto_execute = $' + (params.length + 1));
            params.push(autoExecute ? 'true' : 'false');
        }
        if (minProfit !== undefined) {
            updates.push('min_profit_usd = $' + (params.length + 1));
            params.push(minProfit.toString());
        }
        if (maxTrade !== undefined) {
            updates.push('max_trade_usd = $' + (params.length + 1));
            params.push(maxTrade.toString());
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Sin campos para actualizar' });
        }

        updates.push('updated_at = NOW()');
        params.push(userId);

        await db.prepare(`
            INSERT INTO arbitrage_config (key, value, description, updated_at)
            VALUES 
                ('user_auto_execute_' || $` + params.length + `, $1, 'Auto-execute para usuario', NOW()),
                ('user_min_profit_' || $` + params.length + `, $2, 'Min profit para usuario', NOW()),
                ('user_max_trade_' || $` + params.length + `, $3, 'Max trade para usuario', NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `).run(...params.slice(0, -1), params[params.length - 1]);

        res.json({ success: true, message: 'Configuración de FutInvest actualizada' });
    } catch (err) {
        logger.error('Error en updateFutInvestSettings:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = {
    getFutInvestProfile,
    getFutInvestStats,
    updateFutInvestSettings,
};
