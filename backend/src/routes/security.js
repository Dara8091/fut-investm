const { Router } = require('express');
const { toggle2FA, verifyTOTP, get2FAStatus } = require('../controllers/securityController');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { twoFaLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

router.post('/toggle-2fa', authenticate, rls, perRouteUserLimiter, twoFaLimiter, toggle2FA);
router.post('/verify-totp', authenticate, rls, perRouteUserLimiter, twoFaLimiter, verifyTOTP);
router.get('/2fa-status', authenticate, rls, perRouteUserLimiter, twoFaLimiter, get2FAStatus);

module.exports = router;
