const db = require('./src/config/database');
const bcrypt = require('bcryptjs');

// Check if users table exists
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
console.log('Users table exists:', !!tableCheck);

// Check demo user
const demoExists = db.prepare("SELECT id FROM users WHERE email = 'demo@futinvest.io'").get();
console.log('demoExists:', demoExists);
console.log('!demoExists:', !demoExists);

if (!demoExists) {
    console.log('Creating demo user...');
    const demoHash = bcrypt.hashSync('Demo123!', 10);
    const demo = db.prepare(
        "INSERT INTO users (email, password_hash, full_name, role, tier, email_verified, kyc_status, totp_enabled) VALUES (?, ?, ?, 'investor', 'black', 1, 'approved', 0)"
    ).run('demo@futinvest.io', demoHash, 'Inversor VIP');
    db.prepare('INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES (?, 12450.75, 342.10, 1.85)').run(demo.lastInsertRowid);
    console.log('Demo user created: demo@futinvest.io / Demo123!');
} else {
    console.log('Demo user ya existe');
}

// Verify
const verifyDemo = db.prepare("SELECT id, email, role FROM users WHERE email = 'demo@futinvest.io'").get();
console.log('Verified demo user:', verifyDemo);

db.close();
