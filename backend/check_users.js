const db = require('./src/config/database');
const users = db.prepare("SELECT id, email, role FROM users").all();
console.log('Users:', JSON.stringify(users, null, 2));
db.close();
