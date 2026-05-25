const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const logger = require('../config/logger');

const MIGRATIONS_TABLE = '_migrations';

async function ensureMigrationsTable() {
    const createTableSQL = db._type === 'postgres'
        ? `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), checksum TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0)`
        : `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')), checksum TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0)`;
    await db.exec(createTableSQL);
}

function fileChecksum(filePath) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf-8')).digest('hex').slice(0, 16);
}

async function getAppliedMigrations() {
    const rows = await db.prepare(`SELECT name, checksum FROM ${MIGRATIONS_TABLE} ORDER BY id`).all();
    return new Map(rows.map(r => [r.name, r.checksum]));
}

async function runMigrations() {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    const migrationsDir = path.join(__dirname, 'versions');

    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
        fs.writeFileSync(path.join(migrationsDir, '001_initial.sql'),
            fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));
        logger.info('Migración base creada: 001_initial.sql');
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        if (applied.has(file)) {
            const cs = fileChecksum(path.join(migrationsDir, file));
            if (applied.get(file) !== cs) {
                throw new Error(`Migración ${file} fue modificada después de aplicarse. Checksum mismatch.`);
            }
            continue;
        }

        const start = Date.now();
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const cs = fileChecksum(path.join(migrationsDir, file));

        try {
            // Strip PRAGMA lines — already set by database.js and can't run inside a transaction
            let cleanSql = sql.split('\n').filter(l => !l.trim().toUpperCase().startsWith('PRAGMA')).join('\n');

            // For SQLite, replace PostgreSQL-specific syntax
            if (db._type === 'sqlite') {
                cleanSql = cleanSql.replace(/\$\d+/g, '?');
                cleanSql = cleanSql.replace(/\bNOW\(\)/g, "(datetime('now'))");
                cleanSql = cleanSql.replace(/\bCURRENT_DATE\b/g, "(date('now'))");
                cleanSql = cleanSql.replace(/\bTIMESTAMPTZ\b/g, 'TEXT');
                cleanSql = cleanSql.replace(/\bBOOLEAN\b/g, 'INTEGER');
                cleanSql = cleanSql.replace(/\bNUMERIC\(\d+,\d+\)/g, 'REAL');
                cleanSql = cleanSql.replace(/\bTRUE\b/g, '1');
                cleanSql = cleanSql.replace(/\bFALSE\b/g, '0');
                cleanSql = cleanSql.replace(/\bSERIAL PRIMARY KEY\b/g, 'INTEGER PRIMARY KEY AUTOINCREMENT');
                // Replace ON CONFLICT DO NOTHING with INSERT OR IGNORE (handle multi-line)
                cleanSql = cleanSql.replace(/INSERT INTO/gi, 'INSERT OR IGNORE INTO');
                cleanSql = cleanSql.replace(/\s*ON CONFLICT \([^)]+\) DO NOTHING/gi, '');
                // Remove SQL comments
                cleanSql = cleanSql.replace(/--.*$/gm, '');
            }

            // Split SQL into individual statements and execute them
            const statements = cleanSql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i];
                try {
                    await db.exec(stmt);
                } catch (err) {
                    console.error(`FAIL statement ${i}:`);
                    console.error(stmt.slice(0, 500));
                    console.error('Error:', err.message);
                    throw err;
                }
            }

            const insertSQL = db._type === 'postgres'
                ? `INSERT INTO ${MIGRATIONS_TABLE} (name, checksum, duration_ms) VALUES ($1, $2, $3)`
                : `INSERT INTO ${MIGRATIONS_TABLE} (name, checksum, duration_ms) VALUES (?, ?, ?)`;

            await db.prepare(insertSQL).run(file, cs, Date.now() - start);

            logger.info(`Migración aplicada: ${file} (${Date.now() - start}ms)`);
        } catch (err) {
            logger.error(`Error aplicando migración ${file}: ${err.message}`);
            throw err;
        }
    }

    logger.info(`Migraciones: ${files.length} totales, ${files.length - applied.size} nuevas`);
}

module.exports = { runMigrations };
