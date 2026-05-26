const db = require('../config/database');
const { listCurrencies } = require('../config/currencies');
const pythonClient = require('../services/pythonClient');
const marketData = require('../services/marketDataService');

async function getDashboard(req, res) {
    try {
        const userId = req.user.userId;

        const account = await db.prepare('SELECT * FROM accounts WHERE user_id = $1').get(userId);
        if (!account) {
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }

        const contracts = await db.prepare('SELECT * FROM contracts WHERE user_id = $1 AND status = $2').all(userId, 'active');

        const roiHistory = await db.prepare(
            'SELECT rate, gain, date FROM roi_history WHERE user_id = $1 ORDER BY date DESC LIMIT 5'
        ).all(userId);

        const user = await db.prepare('SELECT tier, full_name FROM users WHERE id = $1').get(userId);

        // Análisis avanzado de ROI con Python
        let roiAnalysis = null;
        try {
            roiAnalysis = await pythonClient.analyzeROI({
                balance: account.balance,
                tier: user.tier,
                roi_history: roiHistory.map(r => r.rate),
            });
        } catch (pyErr) {
            // Fallback si Python no está disponible
            roiAnalysis = {
                current_roi: account.daily_roi,
                predicted_roi_7d: account.daily_roi * 1.02,
                predicted_roi_30d: account.daily_roi * 1.05,
                confidence: 0.5,
                trend: 'stable',
                volatility: 0.15,
                recommendation: 'Continuar inversión actual',
            };
        }

        const balancesRaw = await db.prepare(
            "SELECT asset, SUM(CASE WHEN type IN ('deposit','roi_payout') THEN amount WHEN type='withdraw' THEN -amount ELSE 0 END) as balance FROM transactions WHERE user_id = $1 AND status = 'completed' GROUP BY asset"
        ).all(userId);

        const currencies = listCurrencies();
        const balances = currencies.map(c => {
            const match = balancesRaw.find(b => b.asset === c.code);
            return { code: c.code, name: c.name, symbol: c.symbol, decimals: c.decimals, balance: match ? match.balance : 0, networks: c.networks };
        });

        // Market overview data (non-blocking, may fail gracefully)
        let marketOverview = null;
        let fearGreed = null;
        let topCoins = [];
        try {
            [marketOverview, fearGreed, topCoins] = await Promise.allSettled([
                marketData.getMarketOverview(),
                marketData.getFearAndGreed(),
                marketData.getTopCoins(10),
            ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null));
        } catch (e) {
            // Market data is optional, don't fail the dashboard
        }

        res.json({
            balance: account.balance,
            accumulatedEarnings: account.accumulated_earnings,
            dailyRoi: account.daily_roi,
            tier: user.tier,
            fullName: user.full_name,
            activeCapital: contracts.reduce((sum, c) => sum + c.amount, 0),
            contracts: contracts.map(c => ({
                ref: c.contract_ref,
                amount: c.amount,
                tier: c.tier,
                roiMin: c.roi_range_min,
                roiMax: c.roi_range_max,
                harvested: c.harvested,
                harvestTarget: c.harvest_target,
                progress: (c.harvested / c.harvest_target) * 100
            })),
            roiHistory,
            roiAnalysis,
            balances,
            currencies,
            marketOverview: marketOverview || null,
            fearGreed: fearGreed || null,
            topCoins: topCoins || [],
        });
    } catch (err) {
        require('../config/logger').error('Error en getDashboard:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { getDashboard };
