require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const https = require('https');
const http = require('http');

const path = require('path');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const logger = require('./config/logger');
const { apiLimiter, authLimiter, userLimiter, depositLimiter, withdrawLimiter, webhookLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const walletRoutes = require('./routes/wallet');
const securityRoutes = require('./routes/security');
// const _networkRoutes = require('./routes/network');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const paykaRoutes = require('./routes/payka');
const futinvestRoutes = require('./routes/futinvest');
const futinvestProfileRoutes = require('./routes/futinvestProfile');
const onboardingRoutes = require('./routes/onboarding');
const metricsRoutes = require('./routes/metrics');
const settingsRoutes = require('./routes/settings');
const referralsRoutes = require('./routes/referrals');
const profileRoutes = require('./routes/profile');
const v1Router = require('./routes/v1');
const withdrawalWorker = require('./services/withdrawalWorker');
const notificationService = require('./services/notificationService');
const { runMigrations } = require('./db/migrations');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// Startup Security Checks
// ============================================
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_me_in_production') {
    if (isProduction) {
        logger.error('FATAL: JWT_SECRET no configurado o usa valor por defecto. Genera uno con: openssl rand -base64 48');
        process.exit(1);
    }
    logger.warn('JWT_SECRET no configurado — usando default (SOLO para desarrollo)');
    process.env.JWT_SECRET = 'dev-secret-do-not-use-in-production';
}

if (!process.env.TOTP_SECRET || process.env.TOTP_SECRET === 'change_me_in_production') {
    if (isProduction) {
        logger.error('FATAL: TOTP_SECRET no configurado. Genera uno con: openssl rand -base64 32');
        process.exit(1);
    }
    logger.warn('TOTP_SECRET no configurado — usando default (SOLO para desarrollo)');
    process.env.TOTP_SECRET = 'dev-totp-secret-do-not-use-in-production';
}

if (!process.env.APP_SECRET || process.env.APP_SECRET === 'change_me_in_production') {
    if (isProduction) {
        logger.error('FATAL: APP_SECRET no configurado. Genera uno con: openssl rand -hex 32');
        process.exit(1);
    }
    logger.warn('APP_SECRET no configurado — usando default (SOLO para desarrollo)');
    process.env.APP_SECRET = 'dev-app-secret-do-not-use-in-production';
}

if (isProduction) {
    logger.info('Security checks passed: JWT_SECRET, TOTP_SECRET, APP_SECRET configurados');
}

// ============================================
// Sentry (error tracking)
// ============================================
if (process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
    app.use(Sentry.Handlers.requestHandler());
}

// ============================================
// Security Middleware
// ============================================
const connectSrc = isProduction
    ? ["'self'", process.env.FRONTEND_URL || 'http://localhost:8000']
    : ["'self'", "ws:", "wss:", "http://localhost:*"];

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: connectSrc,
            frameAncestors: ["'none'"],
            formAction: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// HTTPS enforcement (production only)
if (isProduction) {
    app.use((req, res, next) => {
        const proto = req.headers['x-forwarded-proto'] || req.protocol;
        if (proto !== 'https') {
            return res.status(403).json({ error: 'Se requiere HTTPS' });
        }
        next();
    });
}

const { correlationIdMiddleware } = require('./middleware/correlationId');
const { wafMiddleware } = require('./middleware/waf');
const csrfOriginCheck = require('./middleware/csrf');
const { sanitizeInputs } = require('./middleware/sanitize');

app.use(correlationIdMiddleware);

if (process.env.WAF_ENABLED !== 'false') {
    app.use(wafMiddleware);
}

app.use(express.json({ limit: '1mb' }));

// Sanitize ALL user inputs (XSS, null bytes, control chars)
app.use(sanitizeInputs);

// ============================================
// Static files (legal pages, docs)
// ============================================
const publicPath = path.resolve(__dirname, '../../public');
if (fs.existsSync(publicPath)) {
    app.use('/legal', express.static(publicPath));
}

// ============================================
// Metrics middleware (after auth, before routes)
// ============================================
const { prometheusMiddleware } = require('./middleware/prometheus');
const { metricsMiddleware } = require('./middleware/metrics');
app.use('/api/', metricsMiddleware);

// ============================================
// HTTP Request Logging
// ============================================
const morganStream = { write: (message) => logger.http(message.trim()) };
app.use(morgan('combined', { stream: morganStream }));

// ============================================
// CORS — SOLO origen desde FRONTEND_URL
// ============================================
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:8000')
    .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        logger.warn(`CORS bloqueado: ${origin} no está en FRONTEND_URL=${allowedOrigins.join(',')}`);
        return callback(new Error(`Origen no permitido: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Idempotency-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials: true,
    maxAge: 86400
}));

// CSRF protection via Origin/Referer check (mutating requests only)
if (isProduction && process.env.CSRF_ENABLED !== 'false') {
    app.use('/api/', csrfOriginCheck(allowedOrigins));
}

// ============================================
// Rate Limiting
// ============================================
app.use('/api/', apiLimiter);

// Prometheus metrics (before auth, public)
if (process.env.METRICS_ENABLED !== 'false') {
    const prometheus = require('prom-client');
    app.get('/api/metrics/prometheus', async (req, res) => {
        res.setHeader('Content-Type', prometheus.register.contentType);
        res.send(await prometheus.register.metrics());
    });
    app.use(prometheusMiddleware);
}

// ============================================
// Swagger UI
// ============================================
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'fut.invest - API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
}));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// ============================================
// Run migrations on startup
// ============================================
if (process.env.DB_TYPE !== 'postgres') {
    runMigrations().catch(err => {
        logger.error('Error ejecutando migraciones:', err);
        process.exit(1);
    });
}

// ============================================
// Routes — API v1
// ============================================
app.use('/api/v1', v1Router);

// ============================================
// Routes — Legacy /api/* (backward compat)
// Per-endpoint limiters must be BEFORE generic
// route to take effect
// ============================================
if (isProduction) {
    app.use('/api/auth', authLimiter);
}
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wallet', userLimiter, walletRoutes);
app.use('/api/wallet/withdraw', withdrawLimiter);
app.use('/api/security', userLimiter, securityRoutes);
app.use('/api/payments/deposit', depositLimiter);
app.use('/api/payments/webhook', webhookLimiter);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payka', paykaRoutes);
app.use('/api/futinvest', futinvestRoutes);
app.use('/api/futinvest-profile', futinvestProfileRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/metrics', metricsRoutes);

// Sentry error handler (must be before express error handler)
if (process.env.SENTRY_DSN) {
    const Sentry = require('@sentry/node');
    app.use(Sentry.Handlers.errorHandler());
}

// ============================================
// 404 Handler — SPA fallback + API 404
// ============================================
app.use((req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/legal/')) {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
    const publicPath = path.resolve(__dirname, '../../public/404.html');
    if (fs.existsSync(publicPath)) {
        return res.status(404).sendFile(publicPath);
    }
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ============================================
// Error Handler
// ============================================
app.use((err, req, res, _next) => {
    if (err.message?.startsWith('Origen no permitido')) {
        return res.status(403).json({ error: err.message });
    }
    logger.error('Error no manejado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// Create HTTP server (para Socket.IO)
// ============================================
const certPath = path.join(__dirname, '../certs');
const keyPath = path.join(certPath, 'key.pem');
const certFile = path.join(certPath, 'cert.pem');

let server;
if (fs.existsSync(keyPath) && fs.existsSync(certFile)) {
    server = https.createServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certFile),
    }, app);
    logger.info('HTTPS habilitado');
} else {
    server = http.createServer(app);
}

// ============================================
// Socket.IO (WebSocket para ROI en tiempo real)
// ============================================
// WebSocket connection rate limiting (IP-based)
const wsConnections = new Map();
const WS_MAX_CONNS_PER_IP = 5;
const WS_RATE_WINDOW_MS = 60000;
const WS_RATE_MAX = 10;

const io = new Server(server, {
    cors: {
        origin: allowedOrigins.length ? allowedOrigins : '*',
        methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e6, // 1MB max per message
});

// Middleware de autenticación JWT + rate limit para Socket.IO
io.use((socket, next) => {
    const clientIp = socket.handshake.address || socket.conn.remoteAddress || 'unknown';

    // Rate limit por IP
    if (!wsConnections.has(clientIp)) {
        wsConnections.set(clientIp, { count: 0, resetAt: Date.now() + WS_RATE_WINDOW_MS });
    }
    const entry = wsConnections.get(clientIp);
    if (Date.now() > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = Date.now() + WS_RATE_WINDOW_MS;
    }
    entry.count++;
    if (entry.count > WS_RATE_MAX) {
        return next(new Error('Demasiadas conexiones WebSocket desde esta IP'));
    }

    // Máximas conexiones concurrentes por IP
    const activeFromIp = Array.from(io.sockets.sockets.values())
        .filter(s => (s.handshake.address || s.conn.remoteAddress) === clientIp).length;
    if (activeFromIp >= WS_MAX_CONNS_PER_IP) {
        return next(new Error('Máximo de conexiones WebSocket concurrentes alcanzado'));
    }

    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        return next(new Error('Token requerido'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        next();
    } catch {
        next(new Error('Token inválido o expirado'));
    }
});

// Cleanup old WS rate entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of wsConnections) {
        if (now > entry.resetAt) wsConnections.delete(ip);
    }
}, 300000);

io.on('connection', (socket) => {
    logger.info(`WebSocket autenticado: ${socket.id} (user: ${socket.userId})`);

    socket.join(`roi:${socket.userId}`);

    socket.join(`user:${socket.userId}`);
    notificationService.trackConnection(socket.userId, socket.id);

    socket.on('disconnect', () => {
        notificationService.trackDisconnection(socket.userId, socket.id);
        logger.info(`WebSocket desconectado: ${socket.id}`);
    });
});

notificationService.setIO(io);

// Emitir ROI updates cada 4s (solo a los suscriptores del usuario)
setInterval(() => {
    const rate = 1.5 + Math.random() * 1.0;
    const timestamp = new Date().toISOString();
    // Broadcast global (todos los usuarios conectados reciben la misma tasa)
    io.emit('roi:update', { rate, timestamp });
}, 4000);

// ============================================
// Start
// ============================================
if (process.env.WITHDRAWAL_WORKER_ENABLED !== 'false') {
    withdrawalWorker.start();
}

server.listen(PORT, () => {
    logger.info(`fut.invest API corriendo en puerto ${PORT}`);
    logger.info(`Modo: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Docs: http://localhost:${PORT}/api/docs`);
    logger.info(`WebSocket: puerto ${PORT}`);
    logger.info(`CORS permitido para: ${allowedOrigins.join(', ') || 'todos (dev)'}`);
});
