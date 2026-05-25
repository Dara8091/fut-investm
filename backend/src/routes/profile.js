const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const {
    getProfile, updateProfile,
    getApiKeys, createApiKey, revokeApiKey,
    getGoals, createGoal, updateGoal, deleteGoal,
    getSecurityLog,
    getSessions, revokeSession, revokeAllSessions,
    getWithdrawalLimits,
    getRiskProfile, updateRiskProfile,
    getPerformanceChart,
    getAssetAllocation,
    getKycDocuments,
    getProfileCompletion,
} = require('../controllers/profileController');
const { profileLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

router.get('/', authenticate, rls, perRouteUserLimiter, profileLimiter, getProfile);
router.patch('/', authenticate, rls, perRouteUserLimiter, profileLimiter, updateProfile);

router.get('/api-keys', authenticate, rls, perRouteUserLimiter, getApiKeys);
router.post('/api-keys', authenticate, rls, perRouteUserLimiter, createApiKey);
router.delete('/api-keys/:id', authenticate, rls, perRouteUserLimiter, revokeApiKey);

router.get('/goals', authenticate, rls, perRouteUserLimiter, getGoals);
router.post('/goals', authenticate, rls, perRouteUserLimiter, createGoal);
router.patch('/goals/:id', authenticate, rls, perRouteUserLimiter, updateGoal);
router.delete('/goals/:id', authenticate, rls, perRouteUserLimiter, deleteGoal);

router.get('/security-log', authenticate, rls, perRouteUserLimiter, getSecurityLog);

router.get('/sessions', authenticate, rls, perRouteUserLimiter, getSessions);
router.delete('/sessions/:id', authenticate, rls, perRouteUserLimiter, revokeSession);
router.delete('/sessions/all', authenticate, rls, perRouteUserLimiter, revokeAllSessions);

router.get('/withdrawal-limits', authenticate, rls, perRouteUserLimiter, getWithdrawalLimits);

router.get('/risk-profile', authenticate, rls, perRouteUserLimiter, getRiskProfile);
router.patch('/risk-profile', authenticate, rls, perRouteUserLimiter, updateRiskProfile);

router.get('/performance-chart', authenticate, rls, perRouteUserLimiter, getPerformanceChart);

router.get('/asset-allocation', authenticate, rls, perRouteUserLimiter, getAssetAllocation);

router.get('/kyc-documents', authenticate, rls, perRouteUserLimiter, getKycDocuments);

router.get('/completion', authenticate, rls, perRouteUserLimiter, getProfileCompletion);

module.exports = router;
