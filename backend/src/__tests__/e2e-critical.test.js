/**
 * E2E Tests - Critical Flows
 * Run: npm test -- --testPathPattern='e2e-critical'
 */

const request = require('supertest');
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-e2e';
process.env.TOTP_SECRET = 'test-totp-e2e';
process.env.APP_SECRET = 'test-app-e2e';

let app;
let authToken;
let userId;

beforeAll(async () => {
    // Import app after env setup
    app = require('../src/index');
});

afterAll(async () => {
    if (app && app.close) {
        await app.close();
    }
});

describe('E2E: Critical Flows', () => {
    
    // Test 1: User Registration
    describe('POST /api/auth/register', () => {
        it('should register a new user successfully', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'e2e@test.com',
                    password: 'Test123!',
                    fullName: 'E2E Test User',
                });

            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('token');
            expect(res.body).toHaveProperty('user');
            expect(res.body.user.email).toBe('e2e@test.com');
            
            authToken = res.body.token;
            userId = res.body.user.id;
        });

        it('should reject duplicate email', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'e2e@test.com',
                    password: 'Test123!',
                    fullName: 'Duplicate User',
                });

            expect(res.statusCode).toBe(409);
        });

        it('should reject weak password', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'weak@test.com',
                    password: '123',
                    fullName: 'Weak User',
                });

            expect(res.statusCode).toBe(400);
        });
    });

    // Test 2: User Login
    describe('POST /api/auth/login', () => {
        it('should login with correct credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'e2e@test.com',
                    password: 'Test123!',
                });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body).toHaveProperty('user');
        });

        it('should reject wrong password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'e2e@test.com',
                    password: 'WrongPassword123!',
                });

            expect(res.statusCode).toBe(401);
        });

        it('should reject non-existent email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@test.com',
                    password: 'Test123!',
                });

            expect(res.statusCode).toBe(401);
        });
    });

    // Test 3: Get Profile
    describe('GET /api/profile', () => {
        it('should get user profile with auth token', async () => {
            const res = await request(app)
                .get('/api/profile')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('account');
            expect(res.body.user.email).toBe('e2e@test.com');
        });

        it('should reject without auth token', async () => {
            const res = await request(app)
                .get('/api/profile');

            expect(res.statusCode).toBe(401);
        });
    });

    // Test 4: Wallet Operations
    describe('Wallet Operations', () => {
        it('should generate deposit address', async () => {
            const res = await request(app)
                .post('/api/wallet/deposit')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ asset: 'USDT_TRC20' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('address');
            expect(res.body).toHaveProperty('asset');
        });

        it('should create withdrawal request', async () => {
            const res = await request(app)
                .post('/api/wallet/withdraw')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    asset: 'USDT_TRC20',
                    amount: 100,
                    address: 'TXYZabc123def456ghi789jkl012mno345pq',
                });

            // May fail if balance is 0, but should not crash
            expect([200, 201, 400]).toContain(res.statusCode);
        });
    });

    // Test 5: FutInvest Arbitrage
    describe('FutInvest Arbitrage', () => {
        it('should scan for arbitrage opportunities', async () => {
            const res = await request(app)
                .get('/api/futinvest/scan?symbol=BTC/USDT&amount=100');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('opportunity');
        });

        it('should scan all pairs', async () => {
            const res = await request(app)
                .get('/api/futinvest/scan-all?amount=100');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('opportunities');
        });

        it('should get arbitrage status', async () => {
            const res = await request(app)
                .get('/api/futinvest/status');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('status');
        });
    });

    // Test 6: Health Check
    describe('GET /api/health', () => {
        it('should return healthy status', async () => {
            const res = await request(app)
                .get('/api/health');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('timestamp');
        });
    });

    // Test 7: Security - 2FA
    describe('Security - 2FA', () => {
        it('should get 2FA setup info', async () => {
            const res = await request(app)
                .get('/api/security/2fa/setup')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('secret');
            expect(res.body).toHaveProperty('qrCode');
        });
    });

    // Test 8: Settings
    describe('Settings', () => {
        it('should update notification preferences', async () => {
            const res = await request(app)
                .post('/api/settings/notifications')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    emailNotifications: true,
                    pushEnabled: false,
                });

            expect([200, 201]).toContain(res.statusCode);
        });

        it('should get referral stats', async () => {
            const res = await request(app)
                .get('/api/referrals/stats')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('referralCount');
            expect(res.body).toHaveProperty('referralEarnings');
        });
    });
});
