const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { perRouteUserLimiter, userLimiter } = require('../middleware/rateLimit');
const futinvestProfile = require('../controllers/futinvestProfileController');

const router = Router();

router.get('/profile', authenticate, rls, perRouteUserLimiter, futinvestProfile.getFutInvestProfile);
router.get('/stats', authenticate, rls, perRouteUserLimiter, futinvestProfile.getFutInvestStats);
router.post('/settings', authenticate, rls, perRouteUserLimiter, userLimiter, futinvestProfile.updateFutInvestSettings);

module.exports = router;
