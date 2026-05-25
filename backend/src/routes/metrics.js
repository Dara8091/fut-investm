const { Router } = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../controllers/adminController');
const { metricsLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

router.use(authenticate, requireAdmin, perRouteUserLimiter, metricsLimiter);

router.get('/hourly', (req, res) => {
    const { hours = 24 } = req.query;
    const data = db.prepare(
        `SELECT hour, endpoint, method, SUM(count) as total, AVG(response_time_ms) as avg_ms
         FROM metrics_hourly
         WHERE hour >= datetime('now', ?)
         GROUP BY hour, endpoint
         ORDER BY hour DESC LIMIT 200`
    ).all(`-${parseInt(hours)} hours`);
    res.json({ metrics: data });
});

router.get('/summary', (req, res) => {
    const summary = {
        totalRequests: db.prepare("SELECT COALESCE(SUM(count),0) as c FROM metrics_hourly WHERE hour >= datetime('now', '-24 hours')").get().c,
        avgResponseTime: db.prepare("SELECT COALESCE(AVG(response_time_ms),0) as c FROM metrics_hourly WHERE hour >= datetime('now', '-24 hours')").get().c,
        errorCount: db.prepare("SELECT COUNT(*) as c FROM metrics_hourly WHERE status_code >= 400 AND hour >= datetime('now', '-24 hours')").get().c,
        uniqueUsers: db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM metrics_hourly WHERE user_id IS NOT NULL AND hour >= datetime('now', '-24 hours')").get().c,
        topEndpoints: db.prepare(
            `SELECT endpoint, SUM(count) as total, AVG(response_time_ms) as avg_ms
             FROM metrics_hourly WHERE hour >= datetime('now', '-24 hours')
             GROUP BY endpoint ORDER BY total DESC LIMIT 10`
        ).all(),
    };
    res.json({ summary });
});

module.exports = router;
