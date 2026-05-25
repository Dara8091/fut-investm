const db = require('./src/config/database');
const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = 'demo@futinvest.io'").get();
console.log(JSON.stringify(user, null, 2));
db.close();
