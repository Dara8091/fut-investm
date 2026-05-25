// ============================================
// Payment Gateway Controller
// ============================================
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');
const provider = require('../adapters/paymentProvider');
const { auditLog } = require('../middleware/audit');
const { sendNotification } = require('../services/notificationService');

// -------------------------------------------------------
// Generar dirección de depósito única por transacción
// -------------------------------------------------------
async function generateDepositAddress(req, res) {
    const userId = req.user.userId;
    const { asset, amount } = req.body;

    if (!asset) {
        return res.status(400).json({ error: 'Activo requerido' });
    }

    try {
        const result = await provider.generateAddress(asset, userId);
        const parsedAmount = amount ? parseFloat(amount) : null;

        const insertTx = db.prepare(
            `INSERT INTO transactions (user_id, type, asset, amount, status, wallet_address, provider, metadata)
             VALUES (?, 'deposit', ?, ?, 'pending', ?, ?, ?)`
        );
        const txResult = insertTx.run(
            userId, asset, parsedAmount || 0,
            result.address, result.provider,
            JSON.stringify({ generatedAt: new Date().toISOString() })
        );

        db.prepare(
            `INSERT INTO payment_addresses (user_id, asset, address, provider) VALUES (?, ?, ?, ?)`
        ).run(userId, asset, result.address, result.provider);

        auditLog(userId, 'deposit_address_generated', 'payment_address', txResult.lastInsertRowid,
            null, { address: result.address, asset }, null, req);

        res.json({
            success: true,
            address: result.address,
            asset,
            transactionId: txResult.lastInsertRowid,
            message: `Dirección generada para depósito en ${asset}. Envía los fondos a la dirección mostrada.`
        });
    } catch (err) {
        logger.error('Error generando dirección:', err);
        res.status(502).json({ error: `Error del proveedor de pagos: ${err.message}` });
    }
}

// -------------------------------------------------------
// Webhook unificado (HMAC verification + idempotency)
// -------------------------------------------------------
async function handleWebhook(req, res) {
    const signature = req.headers['x-signature'] || req.headers['x-webhook-signature'] || '';
    const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['x-webhook-id'] || crypto.randomUUID();
    const providerName = provider.name;

    // Idempotency check
    const existing = db.prepare('SELECT id, processed, error FROM webhook_events WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing) {
        logger.info(`Webhook duplicado ignorado: ${idempotencyKey}`);
        return res.json({ received: true, duplicated: true, processed: existing.processed });
    }

    // HMAC verification
    if (!provider.verifyWebhook(req.body, signature)) {
        logger.warn(`Webhook con firma inválida: ${idempotencyKey}`);
        return res.status(401).json({ error: 'Firma inválida' });
    }

    // Store event
    db.prepare(
        `INSERT INTO webhook_events (idempotency_key, provider, event_type, payload) VALUES (?, ?, ?, ?)`
    ).run(idempotencyKey, providerName, req.body.event || 'unknown', JSON.stringify(req.body));

    logger.info(`Webhook recibido: ${idempotencyKey} (${req.body.event || 'unknown'})`);

    // Procesar según tipo de evento
    const eventType = req.body.event || req.body.type;

    if (eventType === 'charge:confirmed' || eventType === 'payment_intent.succeeded' || eventType === 'deposit:confirmed') {
        await processConfirmedDeposit(req.body, idempotencyKey);
    }

    res.json({ received: true, idempotencyKey });
}

async function processConfirmedDeposit(payload, idempotencyKey) {
    const address = payload.address || payload.data?.address;
    const txHash = payload.transactionId || payload.data?.id || idempotencyKey;
    const amount = parseFloat(payload.amount || payload.data?.amount || 0);
    const asset = payload.asset || payload.data?.asset || 'USDT';

    if (!address || amount <= 0) {
        logger.warn(`Webhook deposit sin datos válidos: ${idempotencyKey}`);
        return;
    }

    let capturedUserId = null;
    let capturedAssetName = null;

    const tx = db.transaction(() => {
        const paymentAddr = db.prepare(
            'SELECT p.user_id, p.asset FROM payment_addresses p WHERE p.address = ? AND p.active = 1'
        ).get(address);

        if (!paymentAddr) {
            logger.warn(`Dirección no encontrada para webhook: ${address}`);
            return;
        }

        const userId = paymentAddr.user_id;
        const assetName = paymentAddr.asset;
        capturedUserId = userId;
        capturedAssetName = assetName;

        // Actualizar transacción pendiente
        const txPending = db.prepare(
            "SELECT id FROM transactions WHERE wallet_address = ? AND type = 'deposit' AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
        ).get(address);

        if (txPending) {
            db.prepare(
                'UPDATE transactions SET status = ?, tx_hash = ?, updated_at = datetime(\'now\') WHERE id = ?'
            ).run('completed', txHash, txPending.id);

            // Acreditar balance
            db.prepare(
                'UPDATE accounts SET balance = balance + ?, updated_at = datetime(\'now\') WHERE user_id = ?'
            ).run(amount, userId);

            auditLog(userId, 'deposit_confirmed', 'transaction', txPending.id,
                null, { amount, asset: assetName, txHash }, null, null);
        }
    });

    try {
        tx();
        if (capturedUserId) {
            sendNotification(capturedUserId, 'depósito_confirmado', {
                amount,
                asset: capturedAssetName,
                txHash,
                status: 'completed',
            });
        }
        logger.info(`Depósito procesado: ${amount} ${asset} vía ${idempotencyKey}`);
    } catch (err) {
        logger.error('Error procesando depósito:', err);
        db.prepare('UPDATE webhook_events SET processed = 0, error = ? WHERE idempotency_key = ?')
            .run(err.message, idempotencyKey);
    }

    db.prepare('UPDATE webhook_events SET processed = 1 WHERE idempotency_key = ?').run(idempotencyKey);
}

// -------------------------------------------------------
// Consultar estado de depósito (polling frontend)
// -------------------------------------------------------
function getDepositStatus(req, res) {
    const userId = req.user.userId;
    const { transactionId } = req.params;

    const tx = db.prepare(
        'SELECT id, type, asset, amount, status, tx_hash, created_at, updated_at FROM transactions WHERE id = ? AND user_id = ? AND type = ?'
    ).get(transactionId, userId, 'deposit');

    if (!tx) {
        return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    let providerStatus = null;
    if (tx.status === 'pending' || tx.status === 'processing') {
        providerStatus = { status: 'pending', confirmations: 0 };
    }

    res.json({ transaction: tx, provider: providerStatus });
}

// -------------------------------------------------------
// Cotización de retiro (fee + net amount)
// -------------------------------------------------------
async function quoteWithdrawal(req, res) {
    try {
        const { asset, network, amount } = req.body;

        if (!asset || !network || !amount) {
            return res.status(400).json({ error: 'asset, network y amount requeridos' });
        }

        const parsed = parseFloat(amount);
        if (isNaN(parsed) || parsed <= 0) {
            return res.status(400).json({ error: 'Monto inválido' });
        }

        const config = await db.prepare(
            'SELECT * FROM fee_config WHERE asset = $1 AND network = $2 AND active = TRUE'
        ).get(asset, network);

        if (!config) {
            return res.status(400).json({ error: 'Red no soportada para este activo' });
        }

        if (parsed < config.min_withdrawal) {
            return res.status(400).json({ error: `Monto mínimo: ${config.min_withdrawal} ${asset}` });
        }

        const fee = config.withdrawal_fee;
        const netAmount = parsed - fee;

        res.json({
            asset,
            network,
            grossAmount: parsed,
            fee,
            netAmount,
            minWithdrawal: config.min_withdrawal,
            maxWithdrawal: config.max_withdrawal,
        });
    } catch (err) {
        logger.error('Error en quoteWithdrawal:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// -------------------------------------------------------
// Exportar transacciones a CSV
// -------------------------------------------------------
function exportCSV(req, res) {
    const userId = req.user.userId;

    const txs = db.prepare(
        'SELECT created_at, type, asset, amount, fee, status, tx_hash, wallet_address FROM transactions WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);

    const header = 'Fecha,Tipo,Activo,Monto,Comisión,Estado,TxHash,Dirección\n';
    const rows = txs.map(t =>
        `"${t.created_at}","${t.type}","${t.asset}",${t.amount},${t.fee},"${t.status}","${t.tx_hash || ''}","${t.wallet_address || ''}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${userId}_${Date.now()}.csv"`);
    res.send(header + rows);
}

function getBankTransferInfo(req, res) {
    res.json({
        bankName: 'FutInvest Financial Inc.',
        accountName: 'FutInvest LLC',
        accountNumber: '1234-5678-9012-3456',
        swiftCode: 'FUTIUS42',
        routingNumber: '026-073-008',
        address: '100 Financial District, New York, NY 10004, USA',
        notes: 'Incluye tu ID de usuario como referencia. El depósito puede tardar 1-3 días hábiles.',
        currencies: ['USD', 'EUR'],
        minAmount: 100,
    });
}

function requestCardDeposit(req, res) {
    const userId = req.user.userId;
    const { amount, currency } = req.body;

    if (!amount || amount < 50) return res.status(400).json({ error: 'Monto mínimo: $50' });
    const fee = Math.round((amount * 0.029 + 0.30) * 100) / 100;

    const tx = db.prepare(
        "INSERT INTO transactions (user_id, type, asset, amount, fee, status, metadata) VALUES (?, 'deposit', ?, ?, ?, 'pending', ?)"
    ).run(userId, currency || 'USD', amount, fee, JSON.stringify({ method: 'card', provider: 'stripe' }));

    res.json({
        success: true,
        transactionId: tx.lastInsertRowid,
        amount,
        fee,
        netAmount: amount - fee,
        currency: currency || 'USD',
        paymentUrl: `https://pay.stripe.com/checkout?amount=${Math.round(amount * 100)}&currency=${(currency || 'USD').toLowerCase()}&tx=${tx.lastInsertRowid}`,
        message: 'Redirigiendo a pasarela de pago...',
    });
}

function getDepositMethods(req, res) {
    res.json({
        methods: [
            {
                id: 'crypto',
                name: 'Criptomonedas',
                icon: 'currency_bitcoin',
                description: 'Deposita USDT o BTC desde tu wallet externa',
                currencies: ['USDT_TRC20', 'USDT_ERC20', 'BTC'],
                minAmount: 10,
                processingTime: 'instantáneo',
                enabled: true,
            },
            {
                id: 'bank',
                name: 'Transferencia Bancaria',
                icon: 'account_balance',
                description: 'Depósito vía transferencia SWIFT o SEPA',
                currencies: ['USD', 'EUR'],
                minAmount: 100,
                maxAmount: 100000,
                processingTime: '1-3 días hábiles',
                enabled: true,
            },
            {
                id: 'card',
                name: 'Tarjeta de Crédito/Débito',
                icon: 'credit_card',
                description: 'Pago instantáneo con Visa, Mastercard, Amex',
                currencies: ['USD', 'EUR'],
                minAmount: 50,
                maxAmount: 10000,
                fee: '2.9% + $0.30',
                processingTime: 'instantáneo',
                enabled: true,
            },
        ],
    });
}

module.exports = { generateDepositAddress, handleWebhook, getDepositStatus, quoteWithdrawal, exportCSV, getBankTransferInfo, requestCardDeposit, getDepositMethods };
