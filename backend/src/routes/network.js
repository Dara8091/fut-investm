const { Router } = require('express');
const { getNetwork } = require('../controllers/networkController');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { perRouteUserLimiter, userLimiter } = require('../middleware/rateLimit');

const router = Router();

router.get('/', authenticate, rls, perRouteUserLimiter, userLimiter, getNetwork);

module.exports = router;
