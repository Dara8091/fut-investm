const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { runMigrations } = require('./migrations');
const db = require('../config/database');

runMigrations().then(() => {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count > 0) {
        console.log('Migraciones ejecutadas correctamente. Base de datos ya contiene datos.');
        return;
    }

    console.log('Migraciones ejecutadas. Insertando datos semilla...');
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('Demo123!', 10);

    const insertUser = db.prepare(`INSERT INTO users (email, password_hash, full_name, role, tier, email_verified) VALUES (?, ?, ?, ?, ?, 1)`);
    const result = insertUser.run('demo@futinvest.io', hash, 'Inversor VIP', 'investor', 'black');
    const userId = result.lastInsertRowid;

    db.prepare(`INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES (?, 12450.75, 342.10, 1.85)`).run(userId);
    db.prepare(`INSERT INTO contracts (user_id, contract_ref, amount, tier, roi_range_min, roi_range_max, harvested, harvest_target) VALUES (?, 'F-9982', 6000, 'black', 1.8, 2.5, 3870, 12000)`).run(userId);
    db.prepare(`INSERT INTO contracts (user_id, contract_ref, amount, tier, roi_range_min, roi_range_max, harvested, harvest_target) VALUES (?, 'F-8742', 4000, 'gold', 1.5, 2.0, 1312, 8000)`).run(userId);
    db.prepare(`INSERT INTO network_nodes (user_id, name, role, points_left, points_right, volume) VALUES (?, 'Tú (Raíz)', 'Principal', 12500, 8400, 20900)`).run(userId);
    db.prepare(`INSERT INTO network_nodes (user_id, parent_id, side, name, role, points_left, points_right, volume) VALUES (?, 1, 'left', 'Líder Izquierdo', 'Lado Izquierdo', 7200, 5300, 12500)`).run(userId);
    db.prepare(`INSERT INTO network_nodes (user_id, parent_id, side, name, role, points_left, points_right, volume) VALUES (?, 1, 'right', 'Líder Derecho', 'Lado Derecho', 4100, 4300, 8400)`).run(userId);

    const rates = [2.14, 1.98, 1.87, 2.32, 1.65];
    const dates = ['2026-05-22', '2026-05-21', '2026-05-20', '2026-05-19', '2026-05-18'];
    for (let i = 0; i < rates.length; i++) {
        db.prepare(`INSERT INTO roi_history (user_id, rate, gain, date) VALUES (?, ?, ?, ?)`).run(userId, rates[i], 10000 * rates[i] / 100, dates[i]);
    }

    const feeConfigs = [
        { asset: 'USDT', network: 'TRC20', withdrawal_fee: 2.0, deposit_fee: 0, min_withdrawal: 10, max_withdrawal: 50000, confirmations: 1 },
        { asset: 'USDT', network: 'ERC20', withdrawal_fee: 8.0, deposit_fee: 0, min_withdrawal: 20, max_withdrawal: 50000, confirmations: 12 },
        { asset: 'BTC', network: 'BTC', withdrawal_fee: 0.0005, deposit_fee: 0, min_withdrawal: 0.001, max_withdrawal: 10, confirmations: 3 },
        { asset: 'ETH', network: 'ERC20', withdrawal_fee: 0.005, deposit_fee: 0, min_withdrawal: 0.01, max_withdrawal: 100, confirmations: 12 },
        { asset: 'SOL', network: 'SOL', withdrawal_fee: 0.01, deposit_fee: 0, min_withdrawal: 0.1, max_withdrawal: 1000, confirmations: 1 },
        { asset: 'BNB', network: 'BSC', withdrawal_fee: 0.001, deposit_fee: 0, min_withdrawal: 0.01, max_withdrawal: 500, confirmations: 15 },
        { asset: 'LTC', network: 'LTC', withdrawal_fee: 0.001, deposit_fee: 0, min_withdrawal: 0.01, max_withdrawal: 500, confirmations: 6 },
    ];
    const insertFee = db.prepare(`INSERT OR IGNORE INTO fee_config (asset, network, withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations) VALUES (@asset, @network, @withdrawal_fee, @deposit_fee, @min_withdrawal, @max_withdrawal, @confirmations)`);
    for (const cfg of feeConfigs) insertFee.run(cfg);

    // === SUPER ADMIN + PAYKA MASTER WALLET ===
    const superAdminExists = db.prepare("SELECT id FROM users WHERE role = 'superadmin'").get();
    if (!superAdminExists) {
        const superHash = bcrypt.hashSync('Admin2026!Super', 10);
        const saResult = db.prepare(
            `INSERT INTO users (email, password_hash, full_name, role, tier, email_verified, kyc_status) VALUES (?, ?, ?, 'superadmin', 'black', 1, 'approved')`
        ).run('admin@futinvest.io', superHash, 'Super Administrador');
        const superAdminId = saResult.lastInsertRowid;

        db.prepare(`INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES (?, 0, 0, 0)`).run(superAdminId);

        // Master Wallet Addresses (Payka) — TODOS los depósitos van aquí
        const masterWallets = [
            { asset: 'BTC', address: '1PaykaMasterBTC777AdminWallet999' },
            { asset: 'USDT_TRC20', address: 'TPaykaMasterTRC20AdminWallet999' },
            { asset: 'USDT_ERC20', address: '0xPaykaMasterERC20AdminWallet999' },
            { asset: 'ETH', address: '0xPaykaMasterETHAdminWallet999' },
            { asset: 'SOL', address: 'PaykaMasterSOLAdminWallet999x' },
            { asset: 'BNB', address: '0xPaykaMasterBNBAdminWallet999' },
            { asset: 'LTC', address: 'LPaykaMasterLTCAdminWallet999' },
        ];
        const insertMaster = db.prepare(
            `INSERT OR IGNORE INTO master_wallet_config (asset, wallet_address) VALUES (?, ?)`
        );
        for (const w of masterWallets) insertMaster.run(w.asset, w.address);

        console.log('Super Admin creado + Payka Master Wallets configuradas.');
    }

    console.log('Datos semilla insertados correctamente.');
}).catch(err => {
    console.error('Error en migraciones:', err);
    process.exit(1);
});
