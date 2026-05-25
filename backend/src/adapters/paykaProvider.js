// ============================================
// Payka Payment Provider — Centraliza TODOS los depósitos
// en la billetera maestra del Super Admin.
// ============================================
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');

const MASTER_WALLET_PREFIXES = {
    BTC: '1',
    USDT_TRC20: 'T',
    USDT_ERC20: '0x',
    ETH: '0x',
    SOL: '',
    BNB: '0x',
    LTC: 'L',
};

class PaykaProvider {
    get name() { return 'payka'; }

    _getMasterWallet(asset) {
        const envVar = `MASTER_WALLET_${asset}`;
        const envAddr = process.env[envVar];
        if (envAddr) return envAddr;

        const row = db.prepare(
            "SELECT wallet_address FROM master_wallet_config WHERE asset = ? AND active = 1"
        ).get(asset);

        if (row && row.wallet_address) return row.wallet_address;

        const prefix = MASTER_WALLET_PREFIXES[asset] || 'T';
        return `${prefix}PaykaMaster${asset}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }

    async generateAddress(asset, userId) {
        const masterAddr = this._getMasterWallet(asset);

        const depositAddr = db.prepare(
            "INSERT INTO payment_addresses (user_id, asset, address, provider, active) VALUES (?, ?, ?, 'payka', 1)"
        ).run(userId, asset, masterAddr);

        return {
            address: masterAddr,
            provider: 'payka',
            masterWallet: true,
            paymentAddressId: depositAddr.lastInsertRowid,
        };
    }

    async submitWithdrawal(asset, amount, address) {
        const masterAddr = this._getMasterWallet(asset);
        const txHash = `payka_${crypto.randomBytes(16).toString('hex')}`;

        logger.info(`[Payka] Retiro simulado: ${amount} ${asset} desde ${masterAddr} → ${address}`);

        return {
            txHash,
            providerTxId: txHash,
            status: 'completed',
            provider: 'payka',
        };
    }

    async getDepositStatus(providerTxId) {
        return { status: 'completed', confirmations: 3, providerTxId };
    }

    verifyWebhook(payload, signature) {
        const secret = process.env.PAYKA_WEBHOOK_SECRET;
        if (!secret || !signature) return false;
        const parts = signature.split(',');
        const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
        const sig = parts.find(p => p.startsWith('s='))?.slice(3);
        if (!timestamp || !sig) return false;
        const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
        const computed = crypto.createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');
        try {
            return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
        } catch {
            return false;
        }
    }

    async consolidateFunds(asset, amount, targetAddress) {
        const masterAddr = this._getMasterWallet(asset);
        if (!masterAddr) throw new Error(`No hay billetera maestra configurada para ${asset}`);

        const txHash = `payka_consolidate_${crypto.randomBytes(16).toString('hex')}`;

        db.prepare(
            `INSERT INTO transactions (user_id, type, asset, amount, status, wallet_address, provider, metadata)
             VALUES (1, 'deposit', ?, ?, 'completed', ?, 'payka', ?)`
        ).run(
            asset, amount, targetAddress,
            JSON.stringify({ consolidation: true, from: masterAddr, to: targetAddress })
        );

        logger.info(`[Payka] Consolidación: ${amount} ${asset} → ${targetAddress}`);
        return { txHash, status: 'completed' };
    }

    getMasterWalletBalance(asset) {
        const masterAddr = this._getMasterWallet(asset);
        const totalDeposits = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'deposit' AND status = 'completed' AND wallet_address = ?"
        ).get(masterAddr);

        const totalWithdrawals = db.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'withdraw' AND status = 'completed' AND wallet_address = ?"
        ).get(masterAddr);

        return {
            asset,
            address: masterAddr,
            totalDeposited: totalDeposits.total,
            totalWithdrawn: totalWithdrawals.total,
            balance: totalDeposits.total - totalWithdrawals.total,
        };
    }

    getAllMasterBalances() {
        const assets = ['BTC', 'USDT_TRC20', 'USDT_ERC20', 'ETH', 'SOL', 'BNB', 'LTC'];
        return assets.map(a => this.getMasterWalletBalance(a));
    }
}

const payka = new PaykaProvider();
module.exports = payka;
