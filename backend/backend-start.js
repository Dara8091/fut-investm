#!/usr/bin/env node
// backend-start.js — Inicia migraciones y servidor para tests
const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Ejecutar migraciones
const { runMigrations } = require('./src/db/migrations');
const db = require('./src/config/database');

const isPostgres = db._type === 'postgres';
const p = isPostgres ? (n) => `$${n}` : () => '?';

runMigrations()
    .then(async () => {
        console.log('Migraciones completadas');

        // Seed demo user for e2e tests if not exists
        if (process.env.NODE_ENV === 'test' || process.env.DB_PATH?.includes('e2e')) {
            const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').get();
            if (userCount.count === 0) {
                console.log('Insertando datos semilla para e2e...');
                const bcrypt = require('bcryptjs');
                const hash = bcrypt.hashSync('Demo123!', 10);

                const userSql = isPostgres
                    ? 'INSERT INTO users (email, password_hash, full_name, role, tier, email_verified) VALUES ($1, $2, $3, $4, $5, TRUE)'
                    : 'INSERT INTO users (email, password_hash, full_name, role, tier, email_verified) VALUES (?, ?, ?, ?, ?, 1)';
                const result = await db.prepare(userSql).run('demo@futinvest.io', hash, 'Inversor VIP', 'investor', 'black');
                const userId = result.lastInsertRowid;

                const accSql = isPostgres
                    ? 'INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES ($1, 12450.75, 342.10, 1.85)'
                    : 'INSERT INTO accounts (user_id, balance, accumulated_earnings, daily_roi) VALUES (?, 12450.75, 342.10, 1.85)';
                await db.prepare(accSql).run(userId);

                const contSql = isPostgres
                    ? "INSERT INTO contracts (user_id, contract_ref, amount, tier, roi_range_min, roi_range_max, harvested, harvest_target) VALUES ($1, 'F-9982', 6000, 'black', 1.8, 2.5, 3870, 12000)"
                    : "INSERT INTO contracts (user_id, contract_ref, amount, tier, roi_range_min, roi_range_max, harvested, harvest_target) VALUES (?, 'F-9982', 6000, 'black', 1.8, 2.5, 3870, 12000)";
                await db.prepare(contSql).run(userId);

                const contSql2 = isPostgres
                    ? "INSERT INTO contracts (user_id, contract_ref, amount, tier, roi_range_min, roi_range_max, harvested, harvest_target) VALUES ($1, 'F-8742', 4000, 'gold', 1.5, 2.0, 1312, 8000)"
                    : "INSERT INTO contracts (user_id, contract_ref, amount, tier, roi_range_min, roi_range_max, harvested, harvest_target) VALUES (?, 'F-8742', 4000, 'gold', 1.5, 2.0, 1312, 8000)";
                await db.prepare(contSql2).run(userId);

                const nodeSql = isPostgres
                    ? "INSERT INTO network_nodes (user_id, name, role, points_left, points_right, volume) VALUES ($1, 'Tu (Raiz)', 'Principal', 12500, 8400, 20900)"
                    : "INSERT INTO network_nodes (user_id, name, role, points_left, points_right, volume) VALUES (?, 'Tu (Raiz)', 'Principal', 12500, 8400, 20900)";
                await db.prepare(nodeSql).run(userId);

                const nodeSql2 = isPostgres
                    ? "INSERT INTO network_nodes (user_id, parent_id, side, name, role, points_left, points_right, volume) VALUES ($1, 1, 'left', 'Lider Izquierdo', 'Lado Izquierdo', 7200, 5300, 12500)"
                    : "INSERT INTO network_nodes (user_id, parent_id, side, name, role, points_left, points_right, volume) VALUES (?, 1, 'left', 'Lider Izquierdo', 'Lado Izquierdo', 7200, 5300, 12500)";
                await db.prepare(nodeSql2).run(userId);

                const nodeSql3 = isPostgres
                    ? "INSERT INTO network_nodes (user_id, parent_id, side, name, role, points_left, points_right, volume) VALUES ($1, 1, 'right', 'Lider Derecho', 'Lado Derecho', 4100, 4300, 8400)"
                    : "INSERT INTO network_nodes (user_id, parent_id, side, name, role, points_left, points_right, volume) VALUES (?, 1, 'right', 'Lider Derecho', 'Lado Derecho', 4100, 4300, 8400)";
                await db.prepare(nodeSql3).run(userId);

                const rates = [2.14, 1.98, 1.87, 2.32, 1.65];
                const dates = ['2026-05-22', '2026-05-21', '2026-05-20', '2026-05-19', '2026-05-18'];
                for (let i = 0; i < rates.length; i++) {
                    const roiSql = isPostgres
                        ? 'INSERT INTO roi_history (user_id, rate, gain, date) VALUES ($1, $2, $3, $4)'
                        : 'INSERT INTO roi_history (user_id, rate, gain, date) VALUES (?, ?, ?, ?)';
                    await db.prepare(roiSql).run(userId, rates[i], 10000 * rates[i] / 100, dates[i]);
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
                for (const cfg of feeConfigs) {
                    const feeSql = isPostgres
                        ? 'INSERT INTO fee_config (asset, network, withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (asset, network) DO NOTHING'
                        : 'INSERT OR IGNORE INTO fee_config (asset, network, withdrawal_fee, deposit_fee, min_withdrawal, max_withdrawal, confirmations) VALUES (?, ?, ?, ?, ?, ?, ?)';
                    await db.prepare(feeSql).run(cfg.asset, cfg.network, cfg.withdrawal_fee, cfg.deposit_fee, cfg.min_withdrawal, cfg.max_withdrawal, cfg.confirmations);
                }

                const riskSql = isPostgres
                    ? "INSERT INTO risk_profiles (user_id, profile_type, max_drawdown, max_position_pct, leverage_limit, auto_hedge, stop_loss_pct) VALUES ($1, 'moderate', 10, 25, 1, FALSE, 5) ON CONFLICT (user_id) DO NOTHING"
                    : "INSERT OR IGNORE INTO risk_profiles (user_id, profile_type, max_drawdown, max_position_pct, leverage_limit, auto_hedge, stop_loss_pct) VALUES (?, 'moderate', 10, 25, 1, 0, 5)";
                await db.prepare(riskSql).run(userId);

                console.log('Datos semilla e2e insertados.');
            }
        }

        // Iniciar servidor
        require('./src/index');
    })
    .catch(err => {
        console.error('Error en migraciones:', err);
        process.exit(1);
    });
