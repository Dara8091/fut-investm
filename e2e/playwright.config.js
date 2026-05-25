// playwright.config.js — fut.invest E2E Tests
const { defineConfig } = require('@playwright/test');
const path = require('path');

module.exports = defineConfig({
    testDir: '.',
    timeout: 30000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:8000',
        headless: true,
        screenshot: 'only-on-failure',
    },
    webServer: [
        {
            command: 'npx http-server .. -p 8000 -c-1',
            port: 8000,
            cwd: __dirname,
            reuseExistingServer: true,
        },
        {
            command: 'node backend-start.js',
            port: 3001,
            cwd: path.join(__dirname, '../backend'),
            reuseExistingServer: true,
            env: { NODE_ENV: 'test', JWT_SECRET: 'test-secret-e2e', DB_PATH: './data/e2e.db', REQUIRE_EMAIL_VERIFICATION: 'false' },
        },
    ],
});
