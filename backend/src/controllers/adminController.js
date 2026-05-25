const db = require('../config/database');
const logger = require('../config/logger');
const provider = require('../adapters/paymentProvider');
const { auditLog } = require('../middleware/audit');

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
    }
    next();
}

async function getPendingWithdrawals(req, res) {
    try {
        const { limit = 20, offset = 0 } = req.query;
        const items = await db.prepare(
            `SELECT wq.*, u.email, u.full_name FROM withdrawal_queue wq
             JOIN users u ON u.id = wq.user_id
             WHERE wq.status = 'pending'
             ORDER BY wq.created_at ASC LIMIT $1 OFFSET $2`
        ).all(parseInt(limit), parseInt(offset));

        const total = await db.prepare(
            "SELECT COUNT(*) as c FROM withdrawal_queue WHERE status = 'pending'"
        ).get();

        res.json({ withdrawals: items, total: total.c, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
        logger.error('Error en getPendingWithdrawals:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getAllWithdrawals(req, res) {
    try {
        const { status, limit = 50, offset = 0 } = req.query;
        let query = `SELECT wq.*, u.email, u.full_name FROM withdrawal_queue wq JOIN users u ON u.id = wq.user_id`;
        let countQuery = `SELECT COUNT(*) as c FROM withdrawal_queue wq JOIN users u ON u.id = wq.user_id`;
        const params = [];
        const countParams = [];

        if (status) {
            const clause = ` WHERE wq.status = $1`;
            query += clause;
            countQuery += clause;
            params.push(status);
            countParams.push(status);
        }
        query += ` ORDER BY wq.created_at DESC LIMIT $` + (params.length + 1) + ` OFFSET $` + (params.length + 2);
        params.push(parseInt(limit), parseInt(offset));

        const items = await db.prepare(query).all(...params);
        const total = await db.prepare(countQuery).get(...countParams);
        res.json({ withdrawals: items, total: total.c, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
        logger.error('Error en getAllWithdrawals:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function approveWithdrawal(req, res) {
    try {
        const { id } = req.params;
        const adminId = req.user.userId;

        const item = await db.prepare('SELECT * FROM withdrawal_queue WHERE id = $1 AND status = $2').get(id, 'pending');
        if (!item) {
            return res.status(404).json({ error: 'Retiro no encontrado o ya procesado' });
        }

        const result = await provider.submitWithdrawal(item.asset, item.amount, item.address);

        const updateTx = db.transaction(async () => {
            await db.prepare(
                `UPDATE withdrawal_queue SET status = 'processing', provider = $1, provider_tx_id = $2, approved_by = $3, approved_at = NOW() WHERE id = $4`
            ).run(result.provider || provider.name, result.providerTxId || result.txHash, adminId, id);

            await db.prepare(
                `UPDATE transactions SET status = 'processing', tx_hash = $1, provider = $2, provider_tx_id = $3, updated_at = NOW() WHERE id = $4`
            ).run(result.txHash, provider.name, result.providerTxId, item.transaction_id);

            // NOTA: El balance YA fue restado en walletController al crear el retiro
            // No restar de nuevo para evitar doble cobro
        });

        await updateTx();

        auditLog(adminId, 'withdrawal_approved', 'withdrawal_queue', id,
            { status: 'pending' }, { status: 'processing', providerTxId: result.txHash }, null, req);

        logger.info(`Retiro #${id} aprobado por admin #${adminId}, tx: ${result.txHash}`);
        res.json({ success: true, message: 'Retiro aprobado y enviado al proveedor', txHash: result.txHash });
    } catch (err) {
        logger.error(`Error aprobando retiro #${req.params.id}:`, err);
        res.status(502).json({ error: `Error del proveedor: ${err.message}` });
    }
}

async function rejectWithdrawal(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.userId;

        const item = await db.prepare('SELECT * FROM withdrawal_queue WHERE id = $1 AND status = $2').get(id, 'pending');
        if (!item) {
            return res.status(404).json({ error: 'Retiro no encontrado o ya procesado' });
        }

        const rejectTx = db.transaction(async () => {
            await db.prepare(
                `UPDATE withdrawal_queue SET status = 'cancelled', error_message = $1, approved_by = $2, approved_at = NOW() WHERE id = $3`
            ).run(reason || 'Rechazado por administrador', adminId, id);

            await db.prepare(
                `UPDATE transactions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`
            ).run(item.transaction_id);
        });

        await rejectTx();

        auditLog(adminId, 'withdrawal_rejected', 'withdrawal_queue', id,
            { status: 'pending' }, { status: 'cancelled', reason }, null, req);

        res.json({ success: true, message: 'Retiro rechazado' });
    } catch (err) {
        logger.error('Error en rejectWithdrawal:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getFeeConfig(req, res) {
    try {
        const configs = await db.prepare('SELECT * FROM fee_config WHERE active = TRUE').all();
        res.json({ feeConfigs: configs });
    } catch (err) {
        logger.error('Error en getFeeConfig:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function updateFeeConfig(req, res) {
    try {
        const { id } = req.params;
        const { withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations } = req.body;

        const old = await db.prepare('SELECT * FROM fee_config WHERE id = $1').get(id);
        if (!old) return res.status(404).json({ error: 'Configuración no encontrada' });

        await db.prepare(
            `UPDATE fee_config SET withdrawal_fee = COALESCE($1, withdrawal_fee), deposit_fee = COALESCE($2, deposit_fee),
             min_withdrawal = COALESCE($3, min_withdrawal), max_withdrawal = COALESCE($4, max_withdrawal),
             confirmations = COALESCE($5, confirmations), updated_at = NOW() WHERE id = $6`
        ).run(withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations, id);

        auditLog(req.user.userId, 'fee_config_updated', 'fee_config', id, old, req.body, null, req);
        res.json({ success: true, message: 'Configuración actualizada' });
    } catch (err) {
        logger.error('Error en updateFeeConfig:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getUserList(req, res) {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const users = await db.prepare(
            'SELECT id, email, full_name, role, tier, kyc_status, totp_enabled, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2'
        ).all(parseInt(limit), parseInt(offset));

        const total = await db.prepare('SELECT COUNT(*) as c FROM users').get();
        res.json({ users, total: total.c, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (err) {
        logger.error('Error en getUserList:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getDashboardStats(req, res) {
    try {
        const totalUsers = await db.prepare('SELECT COUNT(*) as c FROM users').get();
        const totalDeposits = await db.prepare("SELECT COALESCE(SUM(amount),0) as c FROM transactions WHERE type = 'deposit' AND status = 'completed'").get();
        const totalWithdrawals = await db.prepare("SELECT COALESCE(SUM(amount),0) as c FROM transactions WHERE type = 'withdraw' AND status = 'completed'").get();
        const pendingWithdrawals = await db.prepare("SELECT COUNT(*) as c FROM withdrawal_queue WHERE status = 'pending'").get();
        const totalFees = await db.prepare("SELECT COALESCE(SUM(fee),0) as c FROM transactions WHERE status = 'completed'").get();
        const totalUsersToday = await db.prepare("SELECT COUNT(*) as c FROM users WHERE DATE(created_at) = CURRENT_DATE").get();

        res.json({
            stats: {
                totalUsers: totalUsers.c,
                totalDeposits: totalDeposits.c,
                totalWithdrawals: totalWithdrawals.c,
                pendingWithdrawals: pendingWithdrawals.c,
                totalFees: totalFees.c,
                totalUsersToday: totalUsersToday.c,
            }
        });
    } catch (err) {
        logger.error('Error en getDashboardStats:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { requireAdmin, getPendingWithdrawals, getAllWithdrawals, approveWithdrawal, rejectWithdrawal, getFeeConfig, updateFeeConfig, getUserList, getDashboardStats };
