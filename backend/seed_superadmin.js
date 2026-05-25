require('dotenv').config();
const db = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function seed() {
    // Demo user for testing
    const demoExists = await db.prepare("SELECT id FROM users WHERE email = 'demo@futinvest.io'").get();
    if (!demoExists) {
        const demoHash = bcrypt.hashSync('Demo123!', 10);
        const demo = await db.prepare(
            "INSERT INTO users (email, password_hash, full_name, role, tier, email_verified, kyc_status, totp_enabled) VALUES (?, ?, ?, 'investor', 'black', 1, 'approved', 0)"
        ).run('demo@futinvest.io', demoHash, 'Inversor VIP');
        await db.prepare('INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES (?, 12450.75, 342.10, 1.85)').run(demo.lastInsertRowid);
        console.log('Demo user creado: demo@futinvest.io / Demo123!');
    } else {
        console.log('Demo user ya existe');
    }

    const saExists = await db.prepare("SELECT id FROM users WHERE role = 'superadmin'").get();
    if (!saExists) {
        const hash = bcrypt.hashSync('Admin2026!Super', 10);
        const sa = await db.prepare(
            "INSERT INTO users (email, password_hash, full_name, role, tier, email_verified, kyc_status) VALUES (?, ?, ?, 'superadmin', 'black', 1, 'approved')"
        ).run('admin@futinvest.io', hash, 'Super Administrador');
        await db.prepare('INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES (?, 0, 0, 0)').run(sa.lastInsertRowid);
        console.log('Super Admin creado: admin@futinvest.io / Admin2026!Super');
    } else {
        console.log('Super Admin ya existe');
    }

    const mwResult = await db.prepare('SELECT COUNT(*) as c FROM master_wallet_config').get();
    const mwCount = mwResult?.c || 0;
    if (mwCount === 0) {
        const wallets = [
            ['BTC', '1PaykaMasterBTC777AdminWallet999'],
            ['USDT_TRC20', 'TPaykaMasterTRC20AdminWallet999'],
            ['USDT_ERC20', '0xPaykaMasterERC20AdminWallet999'],
            ['ETH', '0xPaykaMasterETHAdminWallet999'],
            ['SOL', 'PaykaMasterSOLAdminWallet999x'],
            ['BNB', '0xPaykaMasterBNBAdminWallet999'],
            ['LTC', 'LPaykaMasterLTCAdminWallet999'],
        ];
        const insert = db.prepare('INSERT OR IGNORE INTO master_wallet_config (asset, wallet_address) VALUES (?, ?)');
        for (const [asset, addr] of wallets) await insert.run(asset, addr);
        console.log('Master Wallets Payka creadas:', wallets.length);
    } else {
        console.log('Master Wallets ya existen:', mwCount);
    }

    // Seed fee_config for payment quotes
    const feeCount = (await db.prepare('SELECT COUNT(*) as c FROM fee_config').get())?.c || 0;
    if (feeCount === 0) {
        const fees = [
            ['USDT', 'TRC20', 1.0, 0, 10, 50000, 1],
            ['USDT', 'ERC20', 3.0, 0, 10, 50000, 12],
            ['BTC', 'BTC', 0.0001, 0, 0.001, 10, 3],
            ['ETH', 'ERC20', 0.005, 0, 0.01, 100, 12],
            ['SOL', 'SOL', 0.01, 0, 0.1, 50000, 1],
            ['BNB', 'BSC', 0.001, 0, 0.01, 50000, 15],
        ];
        const insertFee = db.prepare('INSERT OR IGNORE INTO fee_config (asset, network, withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const f of fees) await insertFee.run(...f);
        console.log('Fee configs creadas:', fees.length);
    } else {
        console.log('Fee configs ya existen:', feeCount);
    }

    await db.close();
}

seed().catch(err => {
    console.error('Error seeding:', err);
    process.exit(1);
});
