const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { perRouteUserLimiter, userLimiter } = require('../middleware/rateLimit');
const { scanPair, scanAll, scanTriangular, executeArbitrage } = require('../controllers/futinvestController');

const router = Router();

// Public endpoints (no auth required for scanning)
router.get('/status', (req, res) => res.json({ status: 'ok', enabled: process.env.GOARBIT_ENABLED !== 'false' }));
router.get('/scan', scanPair);
router.get('/scan-all', scanAll);
router.get('/triangular', scanTriangular);

// Authenticated endpoints
router.post('/execute', authenticate, rls, perRouteUserLimiter, userLimiter, executeArbitrage);

module.exports = router;
