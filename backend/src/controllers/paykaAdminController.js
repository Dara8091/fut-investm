// ============================================
// Payka Admin Controller — Control total del
// Super Admin sobre billeteras maestras y fondos
// ============================================
const db = require('../config/database');
const logger = require('../config/logger');
const payka = require('../adapters/paykaProvider');
const { auditLog } = require('../middleware/audit');

// Solo superadmin
function requireSuperAdmin(req, res, next) {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Acceso denegado: se requiere rol superadmin' });
    }
    next();
}

// Obtener todas las billeteras maestras y sus saldos
function getMasterWallets(req, res) {
    const wallets = db.prepare(
        'SELECT id, asset, wallet_address, network, active, updated_at FROM master_wallet_config ORDER BY asset'
    ).all();

    const balances = wallets.map(w => {
        const balance = payka.getMasterWalletBalance(w.asset);
        return { ...w, ...balance };
    });

    res.json({ wallets: balances });
}

// Actualizar dirección de billetera maestra
function updateMasterWallet(req, res) {
    const { id } = req.params;
    const { wallet_address, active } = req.body;

    const old = db.prepare('SELECT * FROM master_wallet_config WHERE id = ?').get(id);
    if (!old) return res.status(404).json({ error: 'Billetera no encontrada' });

    db.prepare(
        'UPDATE master_wallet_config SET wallet_address = COALESCE(?, wallet_address), active = COALESCE(?, active), updated_at = datetime(\'now\') WHERE id = ?'
    ).run(wallet_address, active !== undefined ? active : old.active, id);

    auditLog(req.user.userId, 'master_wallet_updated', 'master_wallet_config', id, old, req.body, null, req);
    logger.info(`[Payka Admin] Billetera maestra #${id} actualizada por admin #${req.user.userId}`);

    res.json({ success: true, message: 'Billetera maestra actualizada' });
}

// Obtener configuración del sistema
function getSystemConfig(req, res) {
    const configs = db.prepare('SELECT * FROM system_config').all();
    res.json({ config: configs });
}

// Actualizar configuración del sistema
function updateSystemConfig(req, res) {
    const { key, value } = req.body;

    const old = db.prepare('SELECT * FROM system_config WHERE key = ?').get(key);
    if (!old) return res.status(404).json({ error: 'Configuración no encontrada' });

    db.prepare(
        'UPDATE system_config SET value = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE key = ?'
    ).run(value, req.user.userId, key);

    auditLog(req.user.userId, 'system_config_updated', 'system_config', null, old, { key, value }, null, req);
    logger.info(`[Payka Admin] Config "${key}" actualizada a "${value}"`);

    res.json({ success: true, message: 'Configuración actualizada' });
}

// Consolidar fondos de una billetera maestra a otra dirección
function consolidateFunds(req, res) {
    const { asset, amount, targetAddress } = req.body;

    if (!asset || !amount || !targetAddress) {
        return res.status(400).json({ error: 'asset, amount y targetAddress requeridos' });
    }

    const balance = payka.getMasterWalletBalance(asset);
    if (amount > balance.balance) {
        return res.status(400).json({ error: `Saldo insuficiente. Disponible: ${balance.balance} ${asset}` });
    }

    try {
        const result = payka.consolidateFunds(asset, amount, targetAddress);

        db.prepare(
            `INSERT INTO fund_consolidations (from_asset, to_asset, amount, from_address, to_address, status, tx_hash, approved_by)
             VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`
        ).run(asset, asset, amount, balance.address, targetAddress, result.txHash, req.user.userId);

        auditLog(req.user.userId, 'funds_consolidated', 'fund_consolidations', null, null,
            { asset, amount, targetAddress, txHash: result.txHash }, null, req);

        res.json({ success: true, txHash: result.txHash, message: `Fondos consolidados: ${amount} ${asset}` });
    } catch (err) {
        logger.error('[Payka Admin] Error consolidando fondos:', err);
        res.status(500).json({ error: err.message });
    }
}

// Obtener historial de consolidaciones
function getConsolidationHistory(req, res) {
    const { limit = 50, offset = 0 } = req.query;
    const items = db.prepare(
        'SELECT * FROM fund_consolidations ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(parseInt(limit), parseInt(offset));

    const total = db.prepare('SELECT COUNT(*) as c FROM fund_consolidations').get().c;
    res.json({ consolidations: items, total });
}

// Obtener resumen total de la plataforma (todos los depósitos, retiros, saldos)
function getPlatformSummary(req, res) {
    const totalDeposits = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM transactions WHERE type = 'deposit' AND status = 'completed'"
    ).get();

    const totalWithdrawals = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM transactions WHERE type = 'withdraw' AND status = 'completed'"
    ).get();

    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const activeUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'investor'").get().c;

    const masterBalances = payka.getAllMasterBalances();
    const totalMasterBalance = masterBalances.reduce((sum, b) => sum + b.balance, 0);

    res.json({
        summary: {
            totalDeposits: totalDeposits.total,
            totalDepositCount: totalDeposits.count,
            totalWithdrawals: totalWithdrawals.total,
            totalWithdrawalCount: totalWithdrawals.count,
            totalUsers,
            activeUsers,
            totalMasterBalance,
            masterBalances,
        }
    });
}

// Controlar modo mantenimiento
function toggleMaintenance(req, res) {
    const { enabled } = req.body;
    db.prepare(
        'UPDATE system_config SET value = ?, updated_by = ?, updated_at = datetime(\'now\') WHERE key = \'maintenance_mode\''
    ).run(enabled ? 'true' : 'false', req.user.userId);

    auditLog(req.user.userId, 'maintenance_toggled', 'system_config', null, null, { enabled }, null, req);
    res.json({ success: true, maintenanceMode: enabled });
}

// Banear / desbanear usuario
function toggleUserBan(req, res) {
    const { userId } = req.params;
    const { banned } = req.body;

    const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'No se puede banear al superadmin' });

    db.prepare(
        'UPDATE users SET email = ? WHERE id = ?'
    ).run(banned ? `banned_${user.email}` : user.email.replace('banned_', ''), userId);

    auditLog(req.user.userId, banned ? 'user_banned' : 'user_unbanned', 'users', userId, null, { email: user.email }, null, req);
    res.json({ success: true, message: banned ? 'Usuario baneado' : 'Usuario desbaneado' });
}

// Cambiar rol de usuario
function changeUserRole(req, res) {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['investor', 'admin', 'superadmin'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }

    const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const oldRole = user.role;
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

    auditLog(req.user.userId, 'user_role_changed', 'users', userId, { role: oldRole }, { role }, null, req);
    res.json({ success: true, message: `Rol de ${user.email} cambiado a ${role}` });
}

module.exports = {
    requireSuperAdmin,
    getMasterWallets,
    updateMasterWallet,
    getSystemConfig,
    updateSystemConfig,
    consolidateFunds,
    getConsolidationHistory,
    getPlatformSummary,
    toggleMaintenance,
    toggleUserBan,
    changeUserRole,
};
