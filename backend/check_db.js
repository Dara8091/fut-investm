const db = require('better-sqlite3')('./data/fut_invest.db');

const sa = db.prepare("SELECT id, email, role FROM users WHERE role = 'superadmin'").get();
console.log('Super Admin:', sa);

const mw = db.prepare('SELECT asset, wallet_address FROM master_wallet_config').all();
console.log('Master Wallets:', JSON.stringify(mw, null, 2));

const sc = db.prepare('SELECT key, value FROM system_config').all();
console.log('System Config:', JSON.stringify(sc, null, 2));

db.close();
