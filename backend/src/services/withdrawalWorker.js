const db = require('../config/database');
const logger = require('../config/logger');
const provider = require('../adapters/paymentProvider');
const { sendNotification } = require('./notificationService');

const BATCH_SIZE = parseInt(process.env.WITHDRAWAL_BATCH_SIZE || 10);
const POLL_INTERVAL = parseInt(process.env.WITHDRAWAL_POLL_INTERVAL_MS || 30000);
const isPostgres = db._type === 'postgres';

let intervalHandle = null;

async function processBatch() {
    const sql = isPostgres
        ? `SELECT wq.*, u.email, u.full_name FROM withdrawal_queue wq JOIN users u ON u.id = wq.user_id WHERE wq.status = 'pending' ORDER BY wq.created_at ASC LIMIT $1`
        : `SELECT wq.*, u.email, u.full_name FROM withdrawal_queue wq JOIN users u ON u.id = wq.user_id WHERE wq.status = 'pending' ORDER BY wq.created_at ASC LIMIT ?`;

    const pending = await db.prepare(sql).all(BATCH_SIZE);

    if (pending.length === 0) return;

    logger.info(`Procesando lote de ${pending.length} retiros pendientes`);

    for (const item of pending) {
        try {
            const result = await provider.submitWithdrawal(item.asset, item.amount, item.address);

            if (result && result.txHash) {
                const updateTx = db.transaction(async () => {
                    const updSql1 = isPostgres
                        ? `UPDATE withdrawal_queue SET status = 'processing', provider = $1, provider_tx_id = $2, processed_at = NOW() WHERE id = $3`
                        : `UPDATE withdrawal_queue SET status = 'processing', provider = ?, provider_tx_id = ?, processed_at = datetime('now') WHERE id = ?`;
                    await db.prepare(updSql1).run(result.provider || provider.name, result.providerTxId || result.txHash, item.id);

                    const updSql2 = isPostgres
                        ? `UPDATE transactions SET status = 'processing', tx_hash = $1, provider = $2, provider_tx_id = $3, updated_at = NOW() WHERE id = $4`
                        : `UPDATE transactions SET status = 'processing', tx_hash = ?, provider = ?, provider_tx_id = ?, updated_at = datetime('now') WHERE id = ?`;
                    await db.prepare(updSql2).run(result.txHash, provider.name, result.providerTxId, item.transaction_id);
                });

                await updateTx();

                logger.info(`Retiro #${item.id} procesado: ${result.txHash}`);
                sendNotification(item.user_id, 'withdrawal_processed', { txHash: result.txHash, amount: item.amount }).catch(() => {});
            }
        } catch (err) {
            logger.error(`Error procesando retiro #${item.id}:`, err);
            try {
                const failSql = isPostgres
                    ? `UPDATE withdrawal_queue SET status = 'failed', error_message = $1, processed_at = NOW() WHERE id = $2`
                    : `UPDATE withdrawal_queue SET status = 'failed', error_message = ?, processed_at = datetime('now') WHERE id = ?`;
                await db.prepare(failSql).run(err.message, item.id);
            } catch (updateErr) {
                logger.error('Error actualizando estado fallido:', updateErr);
            }
        }
    }
}

function start() {
    if (intervalHandle) return;
    logger.info(`Withdrawal worker iniciado (batch: ${BATCH_SIZE}, intervalo: ${POLL_INTERVAL}ms)`);
    processBatch();
    intervalHandle = setInterval(processBatch, POLL_INTERVAL);
}

function stop() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        logger.info('Withdrawal worker detenido');
    }
}

module.exports = { start, stop };
