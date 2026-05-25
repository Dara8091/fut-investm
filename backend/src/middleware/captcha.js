const logger = require('../config/logger');

const CAPTCHA_ENABLED = process.env.CAPTCHA_ENABLED === 'true';

async function verifyCaptcha(token) {
    if (!CAPTCHA_ENABLED || !token) return false;

    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
        logger.error('CAPTCHA: RECAPTCHA_SECRET_KEY no configurado — registro bloqueado por seguridad');
        return false; // bloquear si no hay config (fail-secure)
    }

    try {
        const https = require('https');
        const url = new URL('https://www.google.com/recaptcha/api/siteverify');
        url.searchParams.set('secret', secret);
        url.searchParams.set('response', token);

        const response = await new Promise((resolve, reject) => {
            https.get(url.toString(), (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); }
                });
            }).on('error', reject);
        });

        return response.success === true;
    } catch (err) {
        logger.warn('Error verificando captcha:', err.message);
        return false;
    }
}

function captchaRequired(req, res, next) {
    if (!CAPTCHA_ENABLED) return next();

    const token = req.body?.['g-recaptcha-response'] || req.headers['x-captcha-token'];
    if (!token) {
        return res.status(400).json({ error: 'Captcha requerido' });
    }

    verifyCaptcha(token).then(valid => {
        if (!valid) return res.status(400).json({ error: 'Captcha inválido. Intenta de nuevo.' });
        next();
    });
}

module.exports = { captchaRequired, verifyCaptcha, CAPTCHA_ENABLED };
