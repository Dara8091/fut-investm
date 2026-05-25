const { Router } = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { auditLog } = require('../middleware/audit');
const { removeAllSubscriptions } = require('../services/webPushService');
const { passwordChangeLimiter, accountDeleteLimiter, kycLimiter, notificationLimiter, pushSubscribeLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();
router.use(authenticate, rls);

router.post('/change-password', passwordChangeLimiter, perRouteUserLimiter, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(req.user.userId);
        if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(403).json({ error: 'Contraseña actual incorrecta' });
        }

        const hash = bcrypt.hashSync(newPassword, 10);
        await db.prepare('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2').run(hash, req.user.userId);
        await db.prepare('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1').run(req.user.userId);

        auditLog(req.user.userId, 'password_changed', 'users', req.user.userId, null, null, null, req);
        logger.info(`Contraseña cambiada para user #${req.user.userId}`);
        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (err) {
        logger.error('Error en change-password:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/notifications', async (req, res) => {
    try {
        const user = await db.prepare('SELECT email_notifications, push_enabled FROM users WHERE id = $1').get(req.user.userId);
        res.json({
            emailNotifications: user?.email_notifications ?? true,
            pushEnabled: user?.push_enabled ?? false,
        });
    } catch (err) {
        logger.error('Error en get notifications:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/notifications', notificationLimiter, perRouteUserLimiter, async (req, res) => {
    try {
        const { emailNotifications, pushEnabled } = req.body;
        await db.prepare(
            `UPDATE users SET email_notifications = $1, push_enabled = $2, updated_at = NOW() WHERE id = $3`
        ).run(emailNotifications ? true : false, pushEnabled ? true : false, req.user.userId);
        res.json({ message: 'Preferencias actualizadas.' });
    } catch (err) {
        logger.error('Error en update notifications:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/push-subscribe', pushSubscribeLimiter, perRouteUserLimiter, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription?.endpoint) return res.status(400).json({ error: 'Suscripción inválida' });

        const webPushService = require('../services/webPushService');
        webPushService.addSubscription(req.user.userId, subscription);
        res.json({ message: 'Suscripción registrada.' });
    } catch (err) {
        logger.error('Error en push-subscribe:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/push-unsubscribe', pushSubscribeLimiter, perRouteUserLimiter, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            removeAllSubscriptions(req.user.userId);
        } else {
            const webPushService = require('../services/webPushService');
            webPushService.removeSubscription(req.user.userId, endpoint);
        }
        res.json({ message: 'Suscripción eliminada.' });
    } catch (err) {
        logger.error('Error en push-unsubscribe:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.delete('/account', accountDeleteLimiter, perRouteUserLimiter, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Contraseña requerida' });

        const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(req.user.userId);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(403).json({ error: 'Contraseña incorrecta' });
        }

        const deleteTx = db.transaction(async () => {
            const anonymized = `deleted_${req.user.userId}_${Date.now()}@anonymized.futinvest.io`;
            await db.prepare(
                `UPDATE users SET email = $1, password_hash = '', full_name = 'Usuario Eliminado',
                 kyc_status = 'rejected', kyc_document_url = NULL, verification_token = NULL,
                 totp_enabled = FALSE, email_verified = FALSE, updated_at = NOW()
                 WHERE id = $2`
            ).run(anonymized, req.user.userId);

            await db.prepare('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1').run(req.user.userId);
            removeAllSubscriptions(req.user.userId);
        });

        await deleteTx();

        auditLog(req.user.userId, 'account_deleted', 'users', req.user.userId, null, null, null, req);
        logger.info(`Cuenta eliminada: user #${req.user.userId}`);
        res.json({ message: 'Cuenta eliminada correctamente.' });
    } catch (err) {
        logger.error('Error en delete account:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.post('/kyc', kycLimiter, perRouteUserLimiter, async (req, res) => {
    try {
        const { documentType, fileBase64, mimeType } = req.body;
        if (!documentType || !fileBase64) {
            return res.status(400).json({ error: 'Tipo de documento y archivo requeridos' });
        }

        const validTypes = ['id_front', 'id_back', 'passport', 'selfie', 'proof_of_address'];
        if (!validTypes.includes(documentType)) {
            return res.status(400).json({ error: 'Tipo de documento inválido' });
        }

        const MAX_SIZE = 10 * 1024 * 1024;
        const decoded = Buffer.from(fileBase64, 'base64');
        if (decoded.length > MAX_SIZE) {
            return res.status(400).json({ error: 'Archivo demasiado grande (máx 10MB)' });
        }

        const fileHash = crypto.createHash('sha256').update(decoded).digest('hex');
        const fileUrl = `data:${mimeType || 'image/jpeg'};base64,${fileBase64}`;

        await db.prepare('DELETE FROM kyc_documents WHERE user_id = $1 AND document_type = $2 AND status = \'pending\'')
            .run(req.user.userId, documentType);

        await db.prepare(
            `INSERT INTO kyc_documents (user_id, document_type, file_url, file_hash) VALUES ($1, $2, $3, $4)`
        ).run(req.user.userId, documentType, fileUrl, fileHash);

        const user = await db.prepare('SELECT kyc_status FROM users WHERE id = $1').get(req.user.userId);
        if (user?.kyc_status === 'pending') {
            await db.prepare('UPDATE users SET kyc_status = \'pending\', updated_at = NOW() WHERE id = $1')
                .run(req.user.userId);
        }

        auditLog(req.user.userId, 'kyc_document_uploaded', 'kyc_documents', null, null, null, null, req);
        logger.info(`KYC document uploaded: user #${req.user.userId}, type=${documentType}`);
        res.json({ message: 'Documento subido correctamente. Revisaremos tu verificación pronto.' });
    } catch (err) {
        logger.error('Error en KYC upload:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
