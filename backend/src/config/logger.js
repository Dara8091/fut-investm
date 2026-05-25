const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

// Ensure log directory exists
const fs = require('fs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 10, // Keep last 10 files
            tailable: true,
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 10, // Keep last 10 files
            tailable: true,
        }),
        // Separate access log for HTTP requests
        new winston.transports.File({
            filename: path.join(logDir, 'access.log'),
            maxsize: 5242880,
            maxFiles: 5,
            tailable: true,
        }),
    ],
});

// Console transport with colorization in development
logger.add(new winston.transports.Console({
    format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    silent: process.env.NODE_ENV === 'test', // Silence logs in tests
}));

module.exports = logger;
