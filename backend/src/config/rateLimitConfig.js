/**
 * Rate Limiting Configuration for Production
 * Stricter limits for production environment
 */

const productionLimits = {
    // Global API
    api: { windowMs: 15 * 60 * 1000, max: 50 }, // 50 req/15min
    
    // Auth endpoints
    auth: { windowMs: 15 * 60 * 1000, max: 3 }, // 3 attempts/15min
    register: { windowMs: 60 * 60 * 1000, max: 2 }, // 2 registrations/hour
    forgotPassword: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 requests/hour
    resetPassword: { windowMs: 15 * 60 * 1000, max: 3 }, // 3 resets/15min
    
    // Financial endpoints
    deposit: { windowMs: 60 * 1000, max: 3 }, // 3 deposits/min
    withdraw: { windowMs: 60 * 1000, max: 3 }, // 3 withdrawals/min
    
    // User data
    profile: { windowMs: 60 * 1000, max: 10 }, // 10 profile updates/min
    settings: { windowMs: 60 * 1000, max: 10 }, // 10 settings changes/min
    
    // Admin
    admin: { windowMs: 60 * 1000, max: 20 }, // 20 admin actions/min
    
    // FutInvest arbitrage
    futinvest: { windowMs: 60 * 1000, max: 10 }, // 10 scans/min
    
    // Webhooks
    webhook: { windowMs: 60 * 1000, max: 20 }, // 20 webhooks/min
    
    // Export
    export: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 exports/hour
    
    // Account deletion
    deleteAccount: { windowMs: 60 * 60 * 1000, max: 1 }, // 1 deletion/hour
};

module.exports = { productionLimits };
