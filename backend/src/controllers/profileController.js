const db = require('../config/database');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../config/logger');

async function getProfile(req, res) {
    try {
        const userId = req.user.userId;

        const user = await db.prepare('SELECT id, email, full_name, role, tier, kyc_status, totp_enabled, email_verified, email_notifications, push_enabled, referral_code, referred_by, created_at, updated_at FROM users WHERE id = $1').get(userId);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const account = await db.prepare('SELECT balance, accumulated_earnings, daily_roi FROM accounts WHERE user_id = $1').get(userId) || { balance: 0, accumulated_earnings: 0, daily_roi: 1.85 };

        const activeContracts = await db.prepare("SELECT COUNT(*) as count FROM contracts WHERE user_id = $1 AND status = 'active'").get(userId);
        const recentTx = await db.prepare("SELECT id, type, asset, amount, fee, status, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5").all(userId);
        const pendingWithdrawals = await db.prepare("SELECT COUNT(*) as count FROM withdrawal_queue WHERE user_id = $1 AND status = 'pending'").get(userId);

        const feeConfigs = await db.prepare('SELECT asset, network, withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations, active FROM fee_config WHERE active = TRUE').all();

        const cryptoAssets = [...new Set(feeConfigs.map(f => `${f.asset}_${f.network}`))];
        const depositMethods = [
            { id: 'crypto', name: 'Criptomonedas', icon: 'currency_bitcoin', currencies: cryptoAssets, enabled: true },
            { id: 'bank', name: 'Transferencia Bancaria', icon: 'account_balance', currencies: ['USD', 'EUR'], enabled: true, info: 'Banco: FutInvest Inc.\nCuenta: 1234-5678-9012-3456\nSWIFT: FUTIUS42\nBeneficiario: FutInvest LLC' },
            { id: 'card', name: 'Tarjeta de Crédito/Débito', icon: 'credit_card', currencies: ['USD', 'EUR'], enabled: true, info: 'Monto mínimo: $50\nComisión: 2.9% + $0.30\nProcesado por Stripe' },
        ];

        const withdrawalMethods = feeConfigs.map(f => ({
            id: `${f.asset}_${f.network}`,
            name: `${f.asset} (${f.network})`,
            icon: 'currency_bitcoin',
            enabled: true,
            minAmount: f.min_withdrawal,
            maxAmount: f.max_withdrawal,
            fee: f.withdrawal_fee,
            confirmations: f.confirmations,
        }));

        // FutInvest Profile Data
        const futinvesEnabled = process.env.FUTINVEST_ENABLED !== 'false';
        const futinvesProfileEnabled = process.env.FUTINVEST_PROFILE_SHOW_STATS !== 'false';
        let futinvesData = null;

        if (futinvesEnabled && futinvesProfileEnabled) {
            try {
                const futinvesStats = await db.prepare(`
                    SELECT
                        COUNT(*) as total_scans,
                        COUNT(CASE WHEN is_profitable = 1 THEN 1 END) as profitable_opportunities,
                        COALESCE(SUM(CASE WHEN executed = 1 THEN profit ELSE 0 END), 0) as total_profit,
                        COALESCE(MAX(CASE WHEN executed = 1 THEN profit ELSE 0 END), 0) as best_profit,
                        COUNT(CASE WHEN executed = 1 THEN 1 END) as executed_count
                    FROM arbitrage_opportunities
                `).get();

                const maxHistory = parseInt(process.env.FUTINVEST_PROFILE_MAX_HISTORY || '50');
                const recentScans = await db.prepare(`
                    SELECT symbol, buy_exchange, sell_exchange, spread as spread_percent, profit, profit_percent, is_profitable, executed, created_at
                    FROM arbitrage_opportunities
                    ORDER BY created_at DESC
                    LIMIT $1
                `).all(maxHistory);

                const executedTrades = await db.prepare(`
                    SELECT t.id, t.amount, t.fee, t.status, t.created_at,
                           json_extract(t.metadata, '$.buyExchange') as buy_exchange,
                           json_extract(t.metadata, '$.sellExchange') as sell_exchange,
                           json_extract(t.metadata, '$.profit') as profit,
                           json_extract(t.metadata, '$.txHash') as tx_hash
                    FROM transactions t
                    WHERE t.user_id = $1 AND t.type = 'arbitrage'
                    ORDER BY t.created_at DESC
                    LIMIT $2
                `).all(userId, 20);

                futinvesData = {
                    enabled: true,
                    config: {
                        autoExecute: process.env.FUTINVEST_AUTO_EXECUTE === 'true',
                        minProfit: parseFloat(process.env.FUTINVEST_PROFILE_DEFAULT_MIN_PROFIT || '1.0'),
                        maxTrade: parseFloat(process.env.FUTINVEST_PROFILE_DEFAULT_MAX_TRADE || '10000'),
                        platformFee: parseFloat(process.env.FUTINVEST_PLATFORM_FEE_PERCENT || '10'),
                        autoScanInterval: parseInt(process.env.FUTINVEST_PROFILE_AUTO_SCAN_INTERVAL || '30'),
                        supportedExchanges: process.env.FUTINVEST_SUPPORTED_EXCHANGES ? process.env.FUTINVEST_SUPPORTED_EXCHANGES.split(',') : ['binance', 'okx', 'bybit'],
                        supportedSymbols: process.env.FUTINVEST_SUPPORTED_SYMBOLS ? process.env.FUTINVEST_SUPPORTED_SYMBOLS.split(',') : ['BTC/USDT', 'ETH/USDT'],
                    },
                    stats: {
                        totalScans: futinvesStats?.total_scans || 0,
                        profitableOpportunities: futinvesStats?.profitable_opportunities || 0,
                        totalProfit: parseFloat(futinvesStats?.total_profit || 0),
                        bestProfit: parseFloat(futinvesStats?.best_profit || 0),
                        executedCount: futinvesStats?.executed_count || 0,
                    },
                    recentScans: recentScans || [],
                    executedTrades: executedTrades || [],
                };
            } catch (err) {
                logger.warn('Error cargando datos FutInvest para perfil:', err.message);
                futinvesData = { enabled: true, config: {}, stats: {}, recentScans: [], executedTrades: [] };
            }
        }

        res.json({
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                tier: user.tier,
                kycStatus: user.kyc_status,
                totpEnabled: !!user.totp_enabled,
                emailVerified: !!user.email_verified,
                emailNotifications: !!user.email_notifications,
                pushEnabled: !!user.push_enabled,
                referralCode: user.referral_code,
                referredBy: user.referred_by,
                memberSince: user.created_at,
            },
            account: {
                balance: account.balance,
                accumulatedEarnings: account.accumulated_earnings,
                dailyRoi: account.daily_roi,
            },
            activeContracts: activeContracts.count,
            pendingWithdrawals: pendingWithdrawals.count,
            recentTransactions: recentTx,
            depositMethods,
            withdrawalMethods,
            futinves: futinvesData,
        });
    } catch (err) {
        logger.error('Error en getProfile:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function updateProfile(req, res) {
    try {
        const userId = req.user.userId;
        const { fullName, emailNotifications, pushEnabled } = req.body;

        const updates = [];
        const params = [];
        if (fullName !== undefined) { updates.push('full_name = $' + (params.length + 1)); params.push(fullName); }
        if (emailNotifications !== undefined) { updates.push('email_notifications = $' + (params.length + 1)); params.push(emailNotifications); }
        if (pushEnabled !== undefined) { updates.push('push_enabled = $' + (params.length + 1)); params.push(pushEnabled); }

        if (updates.length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

        updates.push("updated_at = NOW()");
        params.push(userId);
        await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = $` + params.length).run(...params);

        res.json({ success: true, message: 'Perfil actualizado' });
    } catch (err) {
        logger.error('Error en updateProfile:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getApiKeys(req, res) {
    try {
        const userId = req.user.userId;
        const keys = await db.prepare(
            "SELECT id, name, prefix, permissions, last_used_at, expires_at, revoked, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC"
        ).all(userId);
        res.json({ keys: keys.map(k => ({
            ...k,
            isExpired: k.expires_at ? new Date(k.expires_at) < new Date() : false,
        }))});
    } catch (err) {
        logger.error('Error en getApiKeys:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function createApiKey(req, res) {
    try {
        const userId = req.user.userId;
        const { name, permissions, expiresAt } = req.body;
        if (!name) return res.status(400).json({ error: 'Nombre requerido' });

        const rawKey = `fi_${crypto.randomBytes(24).toString('hex')}`;
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const prefix = rawKey.slice(0, 8);

        await db.prepare(
            "INSERT INTO api_keys (user_id, name, key_hash, prefix, permissions, expires_at) VALUES ($1, $2, $3, $4, $5, $6)"
        ).run(userId, name, keyHash, prefix, permissions || 'read', expiresAt || null);

        logger.info(`API key created: user #${userId}, name=${name}`);
        res.json({ key: rawKey, prefix, message: 'API key creada. Guarda esta clave, no se mostrará de nuevo.' });
    } catch (err) {
        logger.error('Error en createApiKey:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function revokeApiKey(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const result = await db.prepare(
            "UPDATE api_keys SET revoked = TRUE WHERE id = $1 AND user_id = $2 AND revoked = FALSE"
        ).run(id, userId);
        if (result.changes === 0) return res.status(404).json({ error: 'API key no encontrada' });
        logger.info(`API key revoked: user #${userId}, key_id=${id}`);
        res.json({ success: true, message: 'API key revocada' });
    } catch (err) {
        logger.error('Error en revokeApiKey:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getGoals(req, res) {
    try {
        const userId = req.user.userId;
        const goals = await db.prepare(
            "SELECT id, name, target_amount, current_amount, deadline, priority, status, notes, created_at, updated_at FROM investment_goals WHERE user_id = $1 ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC"
        ).all(userId);
        res.json({ goals: goals.map(g => ({
            ...g,
            progress_pct: g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0,
        }))});
    } catch (err) {
        logger.error('Error en getGoals:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function createGoal(req, res) {
    try {
        const userId = req.user.userId;
        const { name, targetAmount, deadline, priority, notes } = req.body;
        if (!name || !targetAmount) return res.status(400).json({ error: 'Nombre y monto objetivo requeridos' });

        await db.prepare(
            "INSERT INTO investment_goals (user_id, name, target_amount, deadline, priority, notes) VALUES ($1, $2, $3, $4, $5, $6)"
        ).run(userId, name, targetAmount, deadline || null, priority || 'medium', notes || null);

        logger.info(`Goal created: user #${userId}, name=${name}`);
        res.json({ success: true, message: 'Objetivo creado' });
    } catch (err) {
        logger.error('Error en createGoal:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function updateGoal(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { name, targetAmount, currentAmount, deadline, priority, status, notes } = req.body;

        const updates = [];
        const params = [];
        if (name !== undefined) { updates.push('name = $' + (params.length + 1)); params.push(name); }
        if (targetAmount !== undefined) { updates.push('target_amount = $' + (params.length + 1)); params.push(targetAmount); }
        if (currentAmount !== undefined) { updates.push('current_amount = $' + (params.length + 1)); params.push(currentAmount); }
        if (deadline !== undefined) { updates.push('deadline = $' + (params.length + 1)); params.push(deadline); }
        if (priority !== undefined) { updates.push('priority = $' + (params.length + 1)); params.push(priority); }
        if (status !== undefined) { updates.push('status = $' + (params.length + 1)); params.push(status); }
        if (notes !== undefined) { updates.push('notes = $' + (params.length + 1)); params.push(notes); }
        updates.push("updated_at = NOW()");
        params.push(id, userId);

        const result = await db.prepare(`UPDATE investment_goals SET ${updates.join(', ')} WHERE id = $` + (params.length - 1) + ` AND user_id = $` + params.length).run(...params);
        if (result.changes === 0) return res.status(404).json({ error: 'Objetivo no encontrado' });

        res.json({ success: true, message: 'Objetivo actualizado' });
    } catch (err) {
        logger.error('Error en updateGoal:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function deleteGoal(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const result = await db.prepare("DELETE FROM investment_goals WHERE id = $1 AND user_id = $2").run(id, userId);
        if (result.changes === 0) return res.status(404).json({ error: 'Objetivo no encontrado' });
        res.json({ success: true, message: 'Objetivo eliminado' });
    } catch (err) {
        logger.error('Error en deleteGoal:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getSecurityLog(req, res) {
    try {
        const userId = req.user.userId;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const logs = await db.prepare(
            "SELECT id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2"
        ).all(userId, limit);
        res.json({ logs: logs.map(l => ({
            ...l,
            old_value: l.old_value ? JSON.parse(l.old_value) : null,
            new_value: l.new_value ? JSON.parse(l.new_value) : null,
        }))});
    } catch (err) {
        logger.error('Error en getSecurityLog:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getSessions(req, res) {
    try {
        const userId = req.user.userId;
        const sessions = await db.prepare(
            "SELECT id, device_name, device_type, os, browser, ip_address, last_active_at, is_current, revoked, created_at FROM user_sessions WHERE user_id = $1 AND revoked = FALSE ORDER BY last_active_at DESC"
        ).all(userId);
        res.json({ sessions });
    } catch (err) {
        logger.error('Error en getSessions:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function revokeSession(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const result = await db.prepare(
            "UPDATE user_sessions SET revoked = TRUE WHERE id = $1 AND user_id = $2 AND is_current = FALSE"
        ).run(id, userId);
        if (result.changes === 0) return res.status(404).json({ error: 'Sesión no encontrada o es la sesión actual' });
        res.json({ success: true, message: 'Sesión cerrada' });
    } catch (err) {
        logger.error('Error en revokeSession:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function revokeAllSessions(req, res) {
    try {
        const userId = req.user.userId;
        const result = await db.prepare(
            "UPDATE user_sessions SET revoked = TRUE WHERE user_id = $1 AND is_current = FALSE AND revoked = FALSE"
        ).run(userId);
        logger.info(`All sessions revoked: user #${userId}, count=${result.changes}`);
        res.json({ success: true, message: `${result.changes} sesiones cerradas`, count: result.changes });
    } catch (err) {
        logger.error('Error en revokeAllSessions:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getWithdrawalLimits(req, res) {
    try {
        const userId = req.user.userId;
        const today = new Date().toISOString().slice(0, 10);
        const monthStart = today.slice(0, 7) + '-01';

        const dailyUsed = await db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = $1 AND type = 'withdraw' AND status = 'completed' AND created_at >= $2"
        ).get(userId, today);

        const monthlyUsed = await db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = $1 AND type = 'withdraw' AND status = 'completed' AND created_at >= $2"
        ).get(userId, monthStart);

        const user = await db.prepare('SELECT tier FROM users WHERE id = $1').get(userId);
        const limits = {
            silver: { daily: 5000, monthly: 20000 },
            gold: { daily: 15000, monthly: 50000 },
            black: { daily: 50000, monthly: 200000 },
        };
        const tierLimits = limits[user?.tier] || limits.silver;

        res.json({
            daily: { limit: tierLimits.daily, used: dailyUsed.total, remaining: Math.max(0, tierLimits.daily - dailyUsed.total) },
            monthly: { limit: tierLimits.monthly, used: monthlyUsed.total, remaining: Math.max(0, tierLimits.monthly - monthlyUsed.total) },
            tier: user?.tier || 'silver',
        });
    } catch (err) {
        logger.error('Error en getWithdrawalLimits:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getRiskProfile(req, res) {
    try {
        const userId = req.user.userId;
        let profile = await db.prepare('SELECT * FROM risk_profiles WHERE user_id = $1').get(userId);
        if (!profile) {
            await db.prepare(
                "INSERT INTO risk_profiles (user_id) VALUES ($1)"
            ).run(userId);
            profile = await db.prepare('SELECT * FROM risk_profiles WHERE user_id = $1').get(userId);
        }
        res.json({ profile });
    } catch (err) {
        logger.error('Error en getRiskProfile:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function updateRiskProfile(req, res) {
    try {
        const userId = req.user.userId;
        const { profileType, maxDrawdown, maxPositionPct, leverageLimit, autoHedge, stopLossPct } = req.body;

        const updates = [];
        const params = [];
        if (profileType !== undefined) { updates.push('profile_type = $' + (params.length + 1)); params.push(profileType); }
        if (maxDrawdown !== undefined) { updates.push('max_drawdown = $' + (params.length + 1)); params.push(maxDrawdown); }
        if (maxPositionPct !== undefined) { updates.push('max_position_pct = $' + (params.length + 1)); params.push(maxPositionPct); }
        if (leverageLimit !== undefined) { updates.push('leverage_limit = $' + (params.length + 1)); params.push(leverageLimit); }
        if (autoHedge !== undefined) { updates.push('auto_hedge = $' + (params.length + 1)); params.push(autoHedge); }
        if (stopLossPct !== undefined) { updates.push('stop_loss_pct = $' + (params.length + 1)); params.push(stopLossPct); }
        updates.push("updated_at = NOW()");
        params.push(userId);

        const existing = await db.prepare('SELECT id FROM risk_profiles WHERE user_id = $1').get(userId);
        if (existing) {
            await db.prepare(`UPDATE risk_profiles SET ${updates.join(', ')} WHERE user_id = $` + params.length).run(...params);
        } else {
            const columns = ['user_id', ...updates.map(u => u.split(' = ')[0])];
            const placeholders = ['$1', ...updates.map((_, i) => '$' + (i + 2))];
            await db.prepare(`INSERT INTO risk_profiles (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`).run(userId, ...params.slice(0, -1));
        }

        res.json({ success: true, message: 'Perfil de riesgo actualizado' });
    } catch (err) {
        logger.error('Error en updateRiskProfile:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getPerformanceChart(req, res) {
    try {
        const userId = req.user.userId;
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const data = await db.prepare(
            "SELECT date, rate, gain FROM roi_history WHERE user_id = $1 ORDER BY date DESC LIMIT $2"
        ).all(userId, days);
        res.json({ data: data.reverse() });
    } catch (err) {
        logger.error('Error en getPerformanceChart:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getAssetAllocation(req, res) {
    try {
        const userId = req.user.userId;
        const account = await db.prepare('SELECT balance FROM accounts WHERE user_id = $1').get(userId);
        if (!account || account.balance === 0) {
            return res.json({ allocation: [], totalBalance: 0 });
        }

        const contracts = await db.prepare(
            "SELECT tier, SUM(amount) as total FROM contracts WHERE user_id = $1 AND status = 'active' GROUP BY tier"
        ).all(userId);

        const totalContract = contracts.reduce((sum, c) => sum + c.total, 0);
        const allocation = contracts.map(c => ({
            asset: `Contrato ${c.tier.toUpperCase()}`,
            amount: c.total,
            percentage: Math.round((c.total / (account.balance + totalContract)) * 100),
        }));

        if (account.balance > 0) {
            allocation.push({
                asset: 'Balance Disponible',
                amount: account.balance,
                percentage: Math.round((account.balance / (account.balance + totalContract)) * 100),
            });
        }

        res.json({ allocation, totalBalance: account.balance + totalContract });
    } catch (err) {
        logger.error('Error en getAssetAllocation:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getKycDocuments(req, res) {
    try {
        const userId = req.user.userId;
        const docs = await db.prepare(
            "SELECT id, document_type, file_url, status, created_at FROM kyc_documents WHERE user_id = $1 ORDER BY created_at DESC"
        ).all(userId);
        res.json({ documents: docs });
    } catch (err) {
        logger.error('Error en getKycDocuments:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function getProfileCompletion(req, res) {
    try {
        const userId = req.user.userId;
        const user = await db.prepare('SELECT email_verified, totp_enabled, kyc_status, referral_code FROM users WHERE id = $1').get(userId);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const steps = [];
        const checks = {
            email_verified: { label: 'Email verificado', done: !!user.email_verified },
            totp_enabled: { label: '2FA activado', done: !!user.totp_enabled },
            kyc_approved: { label: 'KYC aprobado', done: user.kyc_status === 'approved' },
            has_referral_code: { label: 'Código de referido generado', done: !!user.referral_code },
        };

        const account = await db.prepare('SELECT balance FROM accounts WHERE user_id = $1').get(userId);
        checks.has_deposit = { label: 'Primer depósito', done: account && account.balance > 0 };

        const goals = await db.prepare("SELECT COUNT(*) as count FROM investment_goals WHERE user_id = $1 AND status = 'active'").get(userId);
        checks.has_goal = { label: 'Objetivo de inversión', done: goals.count > 0 };

        for (const [key, val] of Object.entries(checks)) {
            steps.push({ key, label: val.label, done: val.done });
        }

        const doneCount = steps.filter(s => s.done).length;
        const percent = Math.round((doneCount / steps.length) * 100);

        res.json({ percent, steps, total: steps.length, completed: doneCount });
    } catch (err) {
        logger.error('Error en getProfileCompletion:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = {
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
};
