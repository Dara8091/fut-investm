const { Router } = require('express');
const marketData = require('../services/marketDataService');
const { apiLimiter } = require('../middleware/rateLimit');

const router = Router();

router.get('/overview', apiLimiter, async (req, res) => {
    try {
        const data = await marketData.getMarketOverview();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/top', apiLimiter, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const data = await marketData.getTopCoins(limit);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/movers', apiLimiter, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 20);
        const data = await marketData.getGainersLosers(limit);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/fear-greed', apiLimiter, async (req, res) => {
    try {
        const data = await marketData.getFearAndGreed();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/coin/:id', apiLimiter, async (req, res) => {
    try {
        const data = await marketData.getCoinDetail(req.params.id);
        if (data.error) return res.status(404).json({ error: data.error });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/search', apiLimiter, async (req, res) => {
    try {
        const data = await marketData.searchCoins(req.query.q);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
