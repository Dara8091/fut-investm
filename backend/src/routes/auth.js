const { Router } = require('express');
const {
    register, login, refresh, verifyEmail, resendVerification,
    forgotPassword, resetPassword, me
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { registerRules, loginRules, handleValidationErrors } = require('../middleware/validate');
const { authLimiter, registerLimiter, refreshLimiter, forgotPasswordLimiter, resetPasswordLimiter, emailResendLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');
const { lockoutMiddleware } = require('../middleware/lockout');

const router = Router();

router.post('/register', registerLimiter, registerRules, handleValidationErrors, register);
router.post('/login', authLimiter, lockoutMiddleware, loginRules, handleValidationErrors, login);
router.post('/refresh', refreshLimiter, refresh);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', emailResendLimiter, resendVerification);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.get('/me', authenticate, rls, perRouteUserLimiter, me);

module.exports = router;
