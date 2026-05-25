const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');
const emailService = require('../services/emailService');
const analytics = require('../config/analytics');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;
const RESET_TOKEN_HOURS = 1;
const trackConversion = analytics.trackConversion;
const { recordFailedAttempt, clearAttempts } = require('../middleware/lockout');

function parseUserAgent(ua) {
    const info = { name: 'Unknown', type: 'unknown', os: 'Unknown', browser: 'Unknown' };
    if (!ua) return info;

    if (/mobile/i.test(ua)) info.type = 'mobile';
    else if (/tablet/i.test(ua)) info.type = 'tablet';
    else info.type = 'desktop';

    if (/windows/i.test(ua)) info.os = 'Windows';
    else if (/mac os/i.test(ua)) info.os = 'macOS';
    else if (/android/i.test(ua)) info.os = 'Android';
    else if (/ios/i.test(ua)) info.os = 'iOS';
    else if (/linux/i.test(ua)) info.os = 'Linux';

    if (/chrome/i.test(ua)) info.browser = 'Chrome';
    else if (/firefox/i.test(ua)) info.browser = 'Firefox';
    else if (/safari/i.test(ua)) info.browser = 'Safari';
    else if (/edge/i.test(ua)) info.browser = 'Edge';

    info.name = `${info.os} ${info.browser}`;
    return info;
}

async function generateTokenPair(user) {
    const accessToken = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86400000).toISOString();

    await db.prepare(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)'
    ).run(user.id, tokenHash, expiresAt);

    return { accessToken, refreshToken };
}

async function register(req, res) {
    try {
        const { email, password, fullName } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña requeridos' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const referralCode = 'FI' + crypto.randomBytes(4).toString('hex').toUpperCase();

        const existing = await db.prepare('SELECT id, email_verified FROM users WHERE email = $1').get(email);
        if (existing) {
            if (existing.email_verified) {
                return res.status(409).json({ error: 'El email ya está registrado' });
            }
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await db.prepare('UPDATE users SET verification_token = $1, verification_sent = NOW(), updated_at = NOW() WHERE id = $2').run(tokenHash, existing.id);
            emailService.sendVerificationEmail(email, token).catch(e => logger.warn('Error email:', e.message));
            return res.status(200).json({ message: 'El email ya existe pero no está verificado. Re-enviamos el enlace de verificación.' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

        const result = await db.prepare(
            'INSERT INTO users (email, password_hash, full_name, verification_token, verification_sent, referral_code) VALUES ($1, $2, $3, $4, NOW(), $5)'
        ).run(email, hash, fullName || 'Inversor', verificationHash, referralCode);

        const userId = result.lastInsertRowid;
        await db.prepare('INSERT INTO accounts (user_id, balance) VALUES ($1, 0)').run(userId);
        await db.prepare('INSERT INTO onboarding_progress (user_id) VALUES ($1)').run(userId);

        const user = { id: userId, email, role: 'investor' };
        const tokens = await generateTokenPair(user);

        emailService.sendVerificationEmail(email, verificationToken).catch(e => logger.warn('Error email:', e.message));

        trackConversion(userId, 'signup', { email });

        res.status(201).json({
            ...tokens,
            user: { id: userId, email, fullName: fullName || 'Inversor', role: 'investor', tier: 'gold', emailVerified: false }
        });
    } catch (err) {
        logger.error('Error en register:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña requeridos' });
        }

        const user = await db.prepare('SELECT * FROM users WHERE email = $1').get(email);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            recordFailedAttempt(email);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        clearAttempts(email);

        if (!user.email_verified && process.env.REQUIRE_EMAIL_VERIFICATION !== 'false') {
            return res.status(403).json({ error: 'Email no verificado. Revisa tu bandeja de entrada.', needsVerification: true });
        }

        const tokens = await generateTokenPair(user);

        const sessionToken = crypto.randomBytes(32).toString('hex');
        const ua = req.headers['user-agent'] || '';
        const deviceInfo = parseUserAgent(ua);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.prepare(
            "UPDATE user_sessions SET revoked = TRUE WHERE user_id = $1 AND is_current = TRUE"
        ).run(user.id);

        await db.prepare(
            "INSERT INTO user_sessions (user_id, session_token, device_name, device_type, os, browser, ip_address, user_agent, is_current, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)"
        ).run(user.id, sessionToken, deviceInfo.name, deviceInfo.type, deviceInfo.os, deviceInfo.browser, req.ip, ua, expiresAt);

        trackConversion(user.id, 'login', { email: user.email });

        res.json({
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                tier: user.tier,
                kycStatus: user.kyc_status,
                totpEnabled: !!user.totp_enabled,
                emailVerified: !!user.email_verified,
            }
        });
    } catch (err) {
        logger.error('Error en login:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function refresh(req, res) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token requerido' });
        }

        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const stored = await db.prepare(
            'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()'
        ).get(tokenHash);

        if (!stored) {
            return res.status(401).json({ error: 'Refresh token inválido o expirado' });
        }

        const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(stored.user_id);
        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        await db.prepare('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1').run(stored.id);

        const tokens = await generateTokenPair(user);

        res.json(tokens);
    } catch (err) {
        logger.error('Error en refresh:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function verifyEmail(req, res) {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Token requerido' });

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await db.prepare(
            'SELECT id, email FROM users WHERE verification_token = $1 AND email_verified = FALSE'
        ).get(tokenHash);

        if (!user) {
            return res.status(400).json({ error: 'Token inválido o expirado. Solicita un nuevo enlace.' });
        }

        await db.prepare(
            "UPDATE users SET email_verified = TRUE, verification_token = NULL, updated_at = NOW() WHERE id = $1"
        ).run(user.id);

        logger.info(`Email verificado: ${user.email}`);
        res.json({ message: 'Email verificado correctamente. Ya puedes iniciar sesión.' });
    } catch (err) {
        logger.error('Error en verifyEmail:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function resendVerification(req, res) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requerido' });

        const user = await db.prepare('SELECT id, email_verified FROM users WHERE email = $1').get(email);
        if (!user) return res.status(200).json({ message: 'Si el email existe, recibirás instrucciones.' });
        if (user.email_verified) return res.status(200).json({ message: 'El email ya está verificado. Inicia sesión.' });

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await db.prepare('UPDATE users SET verification_token = $1, verification_sent = NOW(), updated_at = NOW() WHERE id = $2').run(tokenHash, user.id);

        emailService.sendVerificationEmail(email, token).catch(e => logger.warn('Error email:', e.message));

        res.json({ message: 'Si el email existe, recibirás instrucciones.' });
    } catch (err) {
        logger.error('Error en resendVerification:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email requerido' });
        }

        const user = await db.prepare('SELECT id, email FROM users WHERE email = $1').get(email);
        if (!user) {
            return res.status(200).json({ message: 'Si el email existe, recibirás instrucciones.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 3600000).toISOString();

        await db.prepare('UPDATE reset_tokens SET used = TRUE WHERE user_id = $1').run(user.id);
        await db.prepare(
            'INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)'
        ).run(user.id, tokenHash, expiresAt);

        emailService.sendPasswordResetEmail(email, token).catch(e => logger.warn('Error email:', e.message));
        logger.info(`Password reset solicitado para ${email}`);

        res.json({ message: 'Si el email existe, recibirás instrucciones.' });
    } catch (err) {
        logger.error('Error en forgotPassword:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function resetPassword(req, res) {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const stored = await db.prepare(
            'SELECT * FROM reset_tokens WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()'
        ).get(tokenHash);

        if (!stored) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        const hash = bcrypt.hashSync(newPassword, 10);
        await db.prepare('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2').run(hash, stored.user_id);
        await db.prepare('UPDATE reset_tokens SET used = TRUE WHERE id = $1').run(stored.id);
        await db.prepare('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1').run(stored.user_id);

        res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (err) {
        logger.error('Error en resetPassword:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function me(req, res) {
    try {
        const user = await db.prepare(
            'SELECT id, email, full_name, role, tier, kyc_status, totp_enabled, email_verified, email_notifications, push_enabled, referral_code, referred_by FROM users WHERE id = $1'
        ).get(req.user.userId);

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        res.json({
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
        });
    } catch (err) {
        logger.error('Error en me:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { register, login, refresh, verifyEmail, resendVerification, forgotPassword, resetPassword, me };
