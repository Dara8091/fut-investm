const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { requireSuperAdmin, getMasterWallets, updateMasterWallet, getSystemConfig, updateSystemConfig, consolidateFunds, getConsolidationHistory, getPlatformSummary, toggleMaintenance, toggleUserBan, changeUserRole } = require('../controllers/paykaAdminController');
const { paykaLimiter, consolidateLimiter, maintenanceLimiter, userActionLimiter, systemConfigLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

// All Payka admin routes require auth + superadmin role
router.use(authenticate, requireSuperAdmin, perRouteUserLimiter, paykaLimiter);

// Master Wallet Management
router.get('/wallets', getMasterWallets);
router.patch('/wallets/:id', updateMasterWallet);

// Fund Consolidation
router.post('/consolidate', consolidateLimiter, consolidateFunds);
router.get('/consolidations', getConsolidationHistory);

// Platform Summary (all deposits, withdrawals, balances)
router.get('/summary', getPlatformSummary);

// System Configuration
router.get('/config', getSystemConfig);
router.patch('/config', systemConfigLimiter, updateSystemConfig);

// Platform Controls
router.post('/maintenance', maintenanceLimiter, toggleMaintenance);
router.post('/users/:userId/ban', userActionLimiter, toggleUserBan);
router.post('/users/:userId/role', userActionLimiter, changeUserRole);

module.exports = router;
