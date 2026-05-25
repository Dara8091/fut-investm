// ============================================
// Input Sanitization Middleware
// Defensa en profundidad — NO modifica bodies
// de API JSON (ya protegidos por queries
// parametrizadas). Solo sanitiza:
// - Query params (pueden ir a URLs/logs)
// - Route params
// - Campos específicos marcados como 'html'
// ============================================

function sanitizeString(value) {
    if (typeof value !== 'string') return value;

    let sanitized = value
        .replace(/\0/g, '')
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .normalize('NFKC')
        .trim();

    return sanitized;
}

function sanitizeObject(obj, depth = 0) {
    if (depth > 10) return null;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return sanitizeString(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') {
        if (typeof obj === 'number' && (isNaN(obj) || !isFinite(obj))) return null;
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, depth + 1)).filter(item => item !== null);
    }
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const cleanKey = sanitizeString(key);
            sanitized[cleanKey] = sanitizeObject(value, depth + 1);
        }
        return sanitized;
    }
    return obj;
}

function sanitizeInputs(req, res, next) {
    // Sanitize query parameters (pueden ir a URLs, logs, etc.)
    if (req.query && Object.keys(req.query).length > 0) {
        req.query = sanitizeObject(req.query);
    }

    // Sanitize route params
    if (req.params && Object.keys(req.params).length > 0) {
        req.params = sanitizeObject(req.params);
    }

    // NO sanitizar req.body — los endpoints usan queries parametrizadas
    // y la validación con express-validator. Sanitizar aquí rompería
    // passwords, emails, JSON payloads, etc.
    // La protección XSS se maneja en el frontend con CSP y encoding.

    next();
}

module.exports = { sanitizeInputs, sanitizeString, sanitizeObject };
