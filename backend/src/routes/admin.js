const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
    requireAdmin, getPendingWithdrawals, getAllWithdrawals,
    approveWithdrawal, rejectWithdrawal,
    getFeeConfig, updateFeeConfig, getUserList, getDashboardStats
} = require('../controllers/adminController');
const { adminLimiter, feeConfigLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin, perRouteUserLimiter, adminLimiter);

/**
 * @swagger
 * /api/admin/withdrawals/pending:
 *   get:
 *     tags: [Admin]
 *     summary: Listar retiros pendientes
 *     security: [{ bearerAuth: [] }]
 */
router.get('/withdrawals/pending', getPendingWithdrawals);

/**
 * @swagger
 * /api/admin/withdrawals:
 *   get:
 *     tags: [Admin]
 *     summary: Listar todos los retiros (filtro por status)
 *     security: [{ bearerAuth: [] }]
 */
router.get('/withdrawals', getAllWithdrawals);

/**
 * @swagger
 * /api/admin/withdrawals/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Aprobar y enviar retiro al proveedor
 *     security: [{ bearerAuth: [] }]
 */
router.post('/withdrawals/:id/approve', approveWithdrawal);

/**
 * @swagger
 * /api/admin/withdrawals/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Rechazar retiro pendiente
 *     security: [{ bearerAuth: [] }]
 */
router.post('/withdrawals/:id/reject', rejectWithdrawal);

/**
 * @swagger
 * /api/admin/fees:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener configuración de fees
 *     security: [{ bearerAuth: [] }]
 */
router.get('/fees', getFeeConfig);

/**
 * @swagger
 * /api/admin/fees/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Actualizar fee config
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/fees/:id', feeConfigLimiter, updateFeeConfig);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Listar todos los usuarios
 *     security: [{ bearerAuth: [] }]
 */
router.get('/users', getUserList);

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Estadísticas del dashboard admin
 *     security: [{ bearerAuth: [] }]
 */
router.get('/stats', getDashboardStats);

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: Exportar logs de auditoría
 *     security: [{ bearerAuth: [] }]
 */
router.get('/audit-logs', async (req, res) => {
    const { startDate, endDate, format } = req.query;
    const db = require('../config/database');
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (startDate) { query += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND created_at <= ?'; params.push(endDate); }

    query += ' ORDER BY created_at DESC LIMIT 1000';
    const logs = db.prepare(query).all(...params);

    if (format === 'csv') {
        const headers = ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'old_value', 'new_value', 'ip_address', 'user_agent', 'created_at'];
        const csv = [headers.join(',')];
        for (const log of logs) {
            csv.push(headers.map(h => {
                const val = log[h] || '';
                return `"${String(val).replace(/"/g, '""')}"`;
            }).join(','));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
        return res.send(csv.join('\n'));
    }

    res.json(logs);
});

module.exports = router;
