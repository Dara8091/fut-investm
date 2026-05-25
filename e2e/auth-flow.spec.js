// ============================================
// fut.invest - E2E: Auth + Dashboard Flow
// ============================================
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('fut.invest — Flujo de Autenticación', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('Muestra modal de login al cargar', async ({ page }) => {
        await expect(page.locator('#auth-modal')).toBeVisible();
        await expect(page.locator('#auth-modal-title')).toContainText('Iniciar Sesión');
    });

    test('Cambia a modo registro', async ({ page }) => {
        await page.click('#auth-toggle-btn');
        await expect(page.locator('#auth-modal-title')).toContainText('Crear Cuenta');
        await expect(page.locator('#auth-name-group')).toBeVisible();
    });

    test('Error con credenciales inválidas', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(1500);
        await page.waitForSelector('#auth-modal', { state: 'visible', timeout: 5000 });
        await page.fill('#auth-email', 'nadie@correo.com');
        await page.fill('#auth-password', 'wrong');
        // Dispatch submit event directly (page.click doesn't trigger form.submit in this context)
        await page.evaluate(() => {
            document.getElementById('auth-form')
                .dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(5000);
        await expect(page.locator('#auth-error')).not.toBeEmpty();
    });

    test('Login exitoso con demo', async ({ page }) => {
        await page.fill('#auth-email', 'demo@futinvest.io');
        await page.fill('#auth-password', 'Demo123!');
        await page.click('#auth-submit-btn');
        await page.waitForTimeout(1500);
        await expect(page.locator('#auth-modal')).not.toBeVisible();
        await expect(page.locator('.live-indicator.live')).toBeVisible();
    });

    test('Continúa como invitado (Demo Local)', async ({ page }) => {
        await page.click('#auth-skip-btn');
        await expect(page.locator('#auth-modal')).not.toBeVisible();
        await expect(page.locator('.live-indicator.demo')).toBeVisible();
    });

    test('Dashboard muestra balance y ROI después de login', async ({ page }) => {
        await page.fill('#auth-email', 'demo@futinvest.io');
        await page.fill('#auth-password', 'Demo123!');
        await page.click('#auth-submit-btn');
        await page.waitForTimeout(2000);
        await expect(page.locator('#live-balance')).not.toBeEmpty();
        await expect(page.locator('#live-roi-percentage')).not.toBeEmpty();
    });

    test('Navega entre tabs', async ({ page }) => {
        await page.click('#auth-skip-btn');
        await page.click('.nav-item[data-tab="wallet"]');
        await expect(page.locator('#tab-wallet')).toBeVisible();
        await expect(page.locator('#current-page-title')).toContainText('Billetera');

        await page.click('.nav-item[data-tab="network"]');
        await expect(page.locator('#tab-network')).toBeVisible();
        await expect(page.locator('#current-page-title')).toContainText('Red');
    });

    test('Alterna modo oscuro', async ({ page }) => {
        await page.click('#auth-skip-btn');
        const themeToggle = page.locator('.theme-toggle');
        await expect(themeToggle).toBeVisible();
        // HTML starts with data-theme="dark", first click toggles to light
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await themeToggle.click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await themeToggle.click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
});

test.describe('fut.invest — Payment Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.setItem('futinvest_onboarding_done', 'true'));
        // Login as demo user
        await page.fill('#auth-email', 'demo@futinvest.io');
        await page.fill('#auth-password', 'Demo123!');
        await page.click('#auth-submit-btn');
        await page.waitForTimeout(2000);
    });

    test('Muestra sección de billetera después de login', async ({ page }) => {
        await page.click('.nav-item[data-tab="wallet"]');
        await expect(page.locator('#tab-wallet')).toBeVisible();
        await expect(page.locator('#wallet-balance')).toBeVisible();
    });

    test('Genera dirección de depósito', async ({ page }) => {
        await page.click('.nav-item[data-tab="wallet"]');
        await page.selectOption('#deposit-asset', 'USDT_TRC20');
        await page.fill('#deposit-amount', '100');
        await page.click('#btn-generate-deposit');
        await page.waitForTimeout(1500);
        await expect(page.locator('#deposit-address-display')).toBeVisible();
    });

    test('Validación de retiro con datos inválidos', async ({ page }) => {
        await page.click('.nav-item[data-tab="wallet"]');
        // Invalid address (too short) with valid amount
        await page.fill('#wallet-address', 'T123');
        await page.fill('#wallet-amount', '100');
        // Button should be disabled (invalid address)
        await expect(page.locator('#btn-show-qr')).toBeDisabled();
    });
});

test.describe('fut.invest — Admin Panel', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Login with admin credentials (need to set up admin user via API)
        await page.fill('#auth-email', 'demo@futinvest.io');
        await page.fill('#auth-password', 'Demo123!');
        await page.click('#auth-submit-btn');
        await page.waitForTimeout(2000);
    });

    test('Admin tab no visible para usuario normal', async ({ page }) => {
        // demo user is not admin, admin tab should be hidden
        await expect(page.locator('.nav-item[data-tab="admin"]')).not.toBeVisible();
    });
});

test.describe('fut.invest — API Health', () => {
    test('Backend health endpoint responde', async ({ request }) => {
        const response = await request.get('http://localhost:3001/api/health');
        const body = await response.json();
        console.log('Health response:', response.status(), body);
        expect(response.ok()).toBeTruthy();
        expect(body.status).toBe('ok');
    });

    test('Login API con credenciales demo', async ({ request }) => {
        const response = await request.post('http://localhost:3001/api/auth/login', {
            data: { email: 'demo@futinvest.io', password: 'Demo123!' }
        });
        const body = await response.json();
        console.log('Login response:', response.status(), body);
        expect(response.ok()).toBeTruthy();
        expect(body).toHaveProperty('accessToken');
        expect(body).toHaveProperty('user');
        expect(body.user.email).toBe('demo@futinvest.io');
    });

    test('Dashboard API retorna datos después de login', async ({ request }) => {
        const loginRes = await request.post('http://localhost:3001/api/auth/login', {
            data: { email: 'demo@futinvest.io', password: 'Demo123!' }
        });
        const { accessToken } = await loginRes.json();

        const dashRes = await request.get('http://localhost:3001/api/dashboard', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        expect(dashRes.ok()).toBeTruthy();
        const dash = await dashRes.json();
        expect(dash).toHaveProperty('balance');
        expect(dash).toHaveProperty('activeCapital');
    });

    test('Wallet API retorna transacciones', async ({ request }) => {
        const loginRes = await request.post('http://localhost:3001/api/auth/login', {
            data: { email: 'demo@futinvest.io', password: 'Demo123!' }
        });
        const { accessToken } = await loginRes.json();

        const txRes = await request.get('http://localhost:3001/api/wallet/transactions', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        expect(txRes.ok()).toBeTruthy();
        const tx = await txRes.json();
        expect(tx).toHaveProperty('transactions');
    });

    test('Payment quote API retorna cotización', async ({ request }) => {
        const loginRes = await request.post('http://localhost:3001/api/auth/login', {
            data: { email: 'demo@futinvest.io', password: 'Demo123!' }
        });
        const { accessToken } = await loginRes.json();

        const quoteRes = await request.post('http://localhost:3001/api/payments/quote', {
            headers: { Authorization: `Bearer ${accessToken}` },
            data: { asset: 'USDT', network: 'TRC20', amount: 100 }
        });
        expect(quoteRes.ok()).toBeTruthy();
        const quote = await quoteRes.json();
        expect(quote).toHaveProperty('fee');
        expect(quote).toHaveProperty('netAmount');
    });

    test('Admin API rechaza usuario sin rol admin', async ({ request }) => {
        const loginRes = await request.post('http://localhost:3001/api/auth/login', {
            data: { email: 'demo@futinvest.io', password: 'Demo123!' }
        });
        const { accessToken } = await loginRes.json();

        const adminRes = await request.get('http://localhost:3001/api/admin/stats', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        expect(adminRes.status()).toBe(403);
    });
});
