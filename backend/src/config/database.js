const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let db;

if (DB_TYPE === 'postgres') {
    const { Pool } = require('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    db = {
        _type: 'postgres',
        _pool: pool,

        async exec(sql) {
            await pool.query(sql);
        },

        prepare(sql) {
            return {
                async run(...params) {
                    const result = await pool.query(sql, params);
                    return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
                },
                async get(...params) {
                    const result = await pool.query(sql, params);
                    return result.rows[0] || null;
                },
                async all(...params) {
                    const result = await pool.query(sql, params);
                    return result.rows;
                },
            };
        },

        transaction(fn) {
            return async (...args) => {
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    const txDb = {
                        _type: 'postgres',
                        async exec(sql) {
                            await client.query(sql);
                        },
                        prepare(sql) {
                            return {
                                async run(...params) {
                                    const result = await client.query(sql, params);
                                    return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
                                },
                                async get(...params) {
                                    const result = await client.query(sql, params);
                                    return result.rows[0] || null;
                                },
                                async all(...params) {
                                    const result = await client.query(sql, params);
                                    return result.rows;
                                },
                            };
                        },
                    };
                    const result = await fn.call({ db: txDb }, ...args);
                    await client.query('COMMIT');
                    return result;
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
            };
        },

        async pragma() {},

        async close() {
            await pool.end();
        },
    };

    logger.info('Database: PostgreSQL (Supabase) conectado');
} else {
    const Database = require('better-sqlite3');
    const rawPath = process.env.DB_PATH || './data/fut_invest.db';
    const dbPath = rawPath === ':memory:' ? ':memory:' : path.resolve(__dirname, '../../', rawPath);

    if (rawPath !== ':memory:') {
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    const sqliteDb = new Database(dbPath);
    if (rawPath !== ':memory:') {
        sqliteDb.pragma('journal_mode = WAL');
        sqliteDb.pragma('synchronous = NORMAL');
        sqliteDb.pragma('cache_size = -64000');
        sqliteDb.pragma('busy_timeout = 5000');
    }
    sqliteDb.pragma('foreign_keys = ON');

    // Wrap SQLite to provide async-compatible API
    db = {
        _type: 'sqlite',

        async exec(sql) {
            let sqliteSql = sql;
            if (db._type === 'sqlite') {
                sqliteSql = sqliteSql.replace(/\bNOW\(\)/g, "(datetime('now'))");
                sqliteSql = sqliteSql.replace(/\bCURRENT_DATE\b/g, "(date('now'))");
            }
            sqliteDb.exec(sqliteSql);
        },

        prepare(sql) {
            // For SQLite, convert $N placeholders to ? and NOW() to datetime('now')
            let sqliteSql = sql;
            if (db._type === 'sqlite') {
                sqliteSql = sqliteSql.replace(/\$\d+/g, '?');
                sqliteSql = sqliteSql.replace(/\bNOW\(\)/g, "(datetime('now'))");
                sqliteSql = sqliteSql.replace(/\bCURRENT_DATE\b/g, "(date('now'))");
            }
            const stmt = sqliteDb.prepare(sqliteSql);
            return {
                async run(...params) {
                    const result = stmt.run(...params);
                    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
                },
                async get(...params) {
                    return stmt.get(...params) || null;
                },
                async all(...params) {
                    return stmt.all(...params);
                },
            };
        },

        transaction(fn) {
            const sqliteTx = sqliteDb.transaction(fn);
            return async (...args) => {
                return sqliteTx(...args);
            };
        },

        async pragma(value) {
            return sqliteDb.pragma(value);
        },

        async close() {
            sqliteDb.close();
        },
    };

    logger.info(`Database: SQLite (${rawPath === ':memory:' ? 'memoria' : dbPath})`);
}

module.exports = db;
