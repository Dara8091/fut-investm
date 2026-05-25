const { Router } = require('express');
const { withdraw, deposit, getTransactions } = require('../controllers/walletController');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { withdrawRules, depositRules, handleValidationErrors } = require('../middleware/validate');
const { withdrawLimiter, depositLimiter, userLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

router.post('/withdraw', authenticate, rls, perRouteUserLimiter, withdrawLimiter, withdrawRules, handleValidationErrors, withdraw);
router.post('/deposit', authenticate, rls, perRouteUserLimiter, depositLimiter, depositRules, handleValidationErrors, deposit);
router.get('/transactions', authenticate, rls, perRouteUserLimiter, userLimiter, getTransactions);

module.exports = router;
