const crypto = require('crypto');
const db = require('../config/database');

async function toggle2FA(req, res) {
    try {
        const userId = req.user.userId;
        const { enabled } = req.body;

        await db.prepare('UPDATE users SET totp_enabled = $1, updated_at = NOW() WHERE id = $2').run(enabled, userId);

        res.json({
            success: true,
            totpEnabled: !!enabled,
            message: enabled ? '2FA activado correctamente' : '2FA desactivado correctamente'
        });
    } catch (err) {
        require('../config/logger').error('Error en toggle2FA:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function verifyTOTP(req, res) {
    try {
        const { code } = req.body;

        if (!code || code.length !== 6) {
            return res.status(400).json({ error: 'Código de 6 dígitos requerido' });
        }

        const user = await db.prepare('SELECT totp_enabled FROM users WHERE id = $1').get(req.user.userId);
        if (!user?.totp_enabled) {
            return res.status(400).json({ error: '2FA no está habilitado para esta cuenta' });
        }

        const secret = process.env.TOTP_SECRET;
        if (!secret) {
            return res.status(500).json({ error: '2FA no configurado: contacte al administrador' });
        }
        const epoch = Math.floor(Date.now() / 1000);
        const counter = Math.floor(epoch / 30);

        for (let offset = -1; offset <= 1; offset++) {
            const c = counter + offset;
            const counterBuf = Buffer.alloc(8);
            counterBuf.writeUint32BE(0, 0);
            counterBuf.writeUint32BE(c, 4);

            const hmac = crypto.createHmac('sha1', secret).update(counterBuf).digest();
            const offsetByte = hmac[hmac.length - 1] & 0xf;
            const codeNum = ((hmac[offsetByte] & 0x7f) << 24) |
                            ((hmac[offsetByte + 1] & 0xff) << 16) |
                            ((hmac[offsetByte + 2] & 0xff) << 8) |
                            (hmac[offsetByte + 3] & 0xff);
            const computedCode = (codeNum % 1000000).toString().padStart(6, '0');

            if (computedCode === code) {
                return res.json({ success: true, message: 'Código TOTP válido' });
            }
        }

        return res.status(401).json({ error: 'Código inválido o expirado' });
    } catch (err) {
        require('../config/logger').error('Error en verifyTOTP:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function get2FAStatus(req, res) {
    try {
        const user = await db.prepare('SELECT totp_enabled FROM users WHERE id = $1').get(req.user.userId);
        res.json({ totpEnabled: !!user?.totp_enabled });
    } catch (err) {
        require('../config/logger').error('Error en get2FAStatus:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { toggle2FA, verifyTOTP, get2FAStatus };
