const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const asyncHandler = require('../middleware/asyncHandler');
const {
    generateDepositAddress, handleWebhook, getDepositStatus, quoteWithdrawal, exportCSV,
    getBankTransferInfo, requestCardDeposit, getDepositMethods
} = require('../controllers/paymentController');
const { depositLimiter, quoteLimiter, cardDepositLimiter, exportLimiter, webhookLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

router.get('/methods', authenticate, rls, perRouteUserLimiter, getDepositMethods);
router.post('/deposit/address', authenticate, rls, perRouteUserLimiter, depositLimiter, asyncHandler(generateDepositAddress));
router.get('/deposit/:transactionId/status', authenticate, rls, perRouteUserLimiter, getDepositStatus);
router.get('/deposit/bank-info', authenticate, rls, perRouteUserLimiter, getBankTransferInfo);
router.post('/deposit/card', authenticate, rls, perRouteUserLimiter, cardDepositLimiter, requestCardDeposit);
router.post('/webhook', webhookLimiter, asyncHandler(handleWebhook));
router.post('/quote', authenticate, rls, perRouteUserLimiter, quoteLimiter, quoteWithdrawal);
router.get('/export/csv', authenticate, rls, perRouteUserLimiter, exportLimiter, exportCSV);

module.exports = router;
