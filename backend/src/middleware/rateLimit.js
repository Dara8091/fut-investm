// ============================================
// Rate Limiter Global por Usuario/Ruta
// Máximo 5 intentos por ruta por usuario
// ============================================
const { redisIncr } = require('../config/redis');

const inMemoryStore = new Map();

async function redisOrMemoryIncr(key, windowMs, _max) {
    const redisCount = await redisIncr(key, windowMs);
    if (redisCount !== null) return redisCount;

    if (!inMemoryStore.has(key)) {
        inMemoryStore.set(key, { count: 0, resetAt: Date.now() + windowMs });
    }
    const entry = inMemoryStore.get(key);
    if (Date.now() > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = Date.now() + windowMs;
    }
    entry.count++;
    return entry.count;
}

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore) {
        if (now > entry.resetAt) inMemoryStore.delete(key);
    }
}, 300000);

function createLimiter({ windowMs, max, message, keyGenerator }) {
    return async (req, res, next) => {
        // Skip rate limiting in test environment
        if (process.env.NODE_ENV === 'test') return next();

        const key = keyGenerator ? keyGenerator(req) : req.ip;
        const count = await redisOrMemoryIncr(`rl:${key}`, windowMs, max);
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
        res.setHeader('X-RateLimit-Reset', Math.ceil((Date.now() + windowMs) / 1000));
        if (count > max) {
            return res.status(429).json({ error: message || 'Demasiadas peticiones. Intenta de nuevo más tarde.' });
        }
        next();
    };
}

// === GLOBAL: 5 intentos por ruta por usuario (60s window) ===
const perRouteUserLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const userId = req.user?.userId || 'anon';
        const route = `${req.method}:${req.path}`;
        const ip = req.ip || 'unknown';
        return `perRoute:${userId}:${route}:${ip}`;
    },
    message: 'Demasiadas peticiones a este endpoint. Máximo 5 intentos por minuto.',
});

// === AUTH endpoints ===
const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const email = req.body?.email || 'unknown';
        const ip = req.ip || 'unknown';
        return `auth:${email}:${ip}`;
    },
    message: 'Demasiados intentos de autenticación. Espera 15 minutos.',
});

const registerLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => {
        const email = req.body?.email || 'unknown';
        const ip = req.ip || 'unknown';
        return `register:${email}:${ip}`;
    },
    message: 'Máximo 3 registros por hora desde esta IP/email.',
});

const refreshLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.ip || 'unknown',
    message: 'Demasiados intentos de refresh. Espera 1 minuto.',
});

const forgotPasswordLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const email = req.body?.email || 'unknown';
        const ip = req.ip || 'unknown';
        return `forgot:${email}:${ip}`;
    },
    message: 'Demasiadas solicitudes. Espera 1 hora.',
});

const resetPasswordLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const email = req.body?.email || 'unknown';
        const ip = req.ip || 'unknown';
        return `reset:${email}:${ip}`;
    },
    message: 'Demasiadas solicitudes de restablecimiento. Espera 15 minutos.',
});

// === FINANCIAL endpoints ===
const depositLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:deposit`,
    message: 'Demasiadas solicitudes de depósito. Espera 1 minuto.',
});

const withdrawLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:withdraw`,
    message: 'Demasiadas solicitudes de retiro. Espera 1 minuto.',
});

const quoteLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:quote`,
    message: 'Demasiadas cotizaciones. Espera 1 minuto.',
});

const cardDepositLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:card`,
    message: 'Demasiados pagos con tarjeta. Espera 1 minuto.',
});

// === USER DATA endpoints ===
const userLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const userId = req.user?.userId || 'anon';
        const route = `${req.method}:${req.path}`;
        return `user:${userId}:${route}`;
    },
    message: 'Demasiadas peticiones. Espera 1 minuto.',
});

// === ADMIN/PAYKA endpoints ===
const adminLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `admin:${req.user?.userId || 'anon'}`,
    message: 'Demasiadas acciones administrativas. Espera 1 minuto.',
});

const paykaLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `payka:${req.user?.userId || 'anon'}`,
    message: 'Demasiadas acciones Payka. Espera 1 minuto.',
});

// === WEBHOOK ===
const webhookLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Demasiados webhooks.',
});

// === GENERAL API ===
const apiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Límite de peticiones excedido.',
});

// === KYC ===
const kycLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:kyc`,
    message: 'Máximo 5 documentos por hora.',
});

// === PASSWORD CHANGE ===
const passwordChangeLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:password`,
    message: 'Demasiados cambios de contraseña. Espera 1 hora.',
});

// === ACCOUNT DELETE ===
const accountDeleteLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:delete`,
    message: 'Demasiados intentos de eliminación.',
});

// === EMAIL VERIFICATION RESEND ===
const emailResendLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const email = req.body?.email || 'unknown';
        const ip = req.ip || 'unknown';
        return `emailResend:${email}:${ip}`;
    },
    message: 'Demasiados reenvíos. Espera 1 hora.',
});

// === NOTIFICATIONS ===
const notificationLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:notif`,
    message: 'Demasiadas actualizaciones de notificaciones.',
});

// === PUSH SUBSCRIBE ===
const pushSubscribeLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:push`,
    message: 'Demasiadas suscripciones push.',
});

// === REFERRAL ===
const referralLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:referral`,
    message: 'Demasiadas consultas de referidos.',
});

// === ONBOARDING ===
const onboardingLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:onboarding`,
    message: 'Demasiados pasos de onboarding.',
});

// === PROFILE ===
const profileLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:profile`,
    message: 'Demasiadas actualizaciones de perfil.',
});

// === 2FA ===
const twoFaLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:2fa`,
    message: 'Demasiados intentos 2FA. Espera 1 minuto.',
});

// === METRICS ===
const metricsLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `metrics:${req.user?.userId || 'anon'}`,
    message: 'Demasiadas consultas de métricas.',
});

// === EXPORT CSV ===
const exportLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.user?.userId || 'anon'}:export`,
    message: 'Máximo 5 exportaciones por hora.',
});

// === CONSOLIDATE FUNDS ===
const consolidateLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `consolidate:${req.user?.userId || 'anon'}`,
    message: 'Demasiadas consolidaciones. Espera 1 hora.',
});

// === MAINTENANCE TOGGLE ===
const maintenanceLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `maintenance:${req.user?.userId || 'anon'}`,
    message: 'Demasiados cambios de mantenimiento.',
});

// === USER BAN/ROLE ===
const userActionLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `userAction:${req.user?.userId || 'anon'}`,
    message: 'Demasiadas acciones sobre usuarios.',
});

// === FEE CONFIG ===
const feeConfigLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => `feeConfig:${req.user?.userId || 'anon'}`,
    message: 'Demasiados cambios de comisiones.',
});

// === SYSTEM CONFIG ===
const systemConfigLimiter = createLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `sysConfig:${req.user?.userId || 'anon'}`,
    message: 'Demasiados cambios de configuración.',
});

module.exports = {
    perRouteUserLimiter,
    authLimiter,
    registerLimiter,
    refreshLimiter,
    forgotPasswordLimiter,
    resetPasswordLimiter,
    depositLimiter,
    withdrawLimiter,
    quoteLimiter,
    cardDepositLimiter,
    userLimiter,
    adminLimiter,
    paykaLimiter,
    webhookLimiter,
    apiLimiter,
    kycLimiter,
    passwordChangeLimiter,
    accountDeleteLimiter,
    emailResendLimiter,
    notificationLimiter,
    pushSubscribeLimiter,
    referralLimiter,
    onboardingLimiter,
    profileLimiter,
    twoFaLimiter,
    metricsLimiter,
    exportLimiter,
    consolidateLimiter,
    maintenanceLimiter,
    userActionLimiter,
    feeConfigLimiter,
    systemConfigLimiter,
    createLimiter,
};
