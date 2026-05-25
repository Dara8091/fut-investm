const crypto = require('crypto');
const https = require('https');
const logger = require('../config/logger');

class MockProvider {
    get name() { return 'mock'; }

    async generateAddress(asset, userId) {
        const prefix = { USDT_TRC20: 'T', USDT_ERC20: '0x', BTC: '1' };
        const p = prefix[asset] || 'T';
        const rand = crypto.randomBytes(16).toString('hex');
        return { address: `${p}${rand}${userId}`, provider: 'mock' };
    }

    async submitWithdrawal(_asset, _amount, _address) {
        const txHash = `mock_tx_${crypto.randomBytes(16).toString('hex')}`;
        return { txHash, providerTxId: txHash, status: 'completed' };
    }

    async getDepositStatus(providerTxId) {
        return { status: 'completed', confirmations: 3, providerTxId };
    }

    verifyWebhook(_payload, _signature) {
        // Mock provider: never verify in dev, but NEVER return true in production
        if (process.env.NODE_ENV === 'production') return false;
        return true;
    }
}

class CoinbaseCommerceProvider {
    get name() { return 'coinbase_commerce'; }

    constructor(apiKey, webhookSecret) {
        this.apiKey = apiKey;
        this.webhookSecret = webhookSecret;
        this.baseUrl = 'https://api.commerce.coinbase.com';
    }

    _request(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const data = body ? JSON.stringify(body) : null;
            const options = {
                method,
                hostname: url.hostname,
                path: url.pathname,
                headers: {
                    'X-CC-Api-Key': this.apiKey,
                    'X-CC-Version': '2018-03-22',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            };
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (res.statusCode >= 400) {
                            reject(new Error(parsed.error?.message || `Coinbase error ${res.statusCode}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch {
                        reject(new Error(`Coinbase: respuesta inválida (${res.statusCode})`));
                    }
                });
            });
            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    }

    async generateAddress(asset, userId) {
        const name = { USDT_TRC20: 'USDT', USDT_ERC20: 'USDT', BTC: 'BTC' }[asset] || 'USDT';
        try {
            const result = await this._request('POST', '/charges', {
                name: `Depósito fut.invest #${userId}`,
                description: `Depósito de ${name} para usuario #${userId}`,
                pricing_type: 'fixed_price',
                local_price: { amount: '1.00', currency: 'USD' },
                metadata: { userId, asset },
            });
            const address = result.data?.addresses?.[name] || result.data?.addresses?.usdc || result.data?.code || '0x' + crypto.randomBytes(20).toString('hex');
            return { address, provider: 'coinbase_commerce', chargeId: result.data?.id };
        } catch (err) {
            logger.error('Coinbase generateAddress error:', err.message);
            throw err;
        }
    }

    async submitWithdrawal(asset, amount, address) {
        try {
            const result = await this._request('POST', '/withdrawals', {
                amount: { amount: String(amount), currency: asset },
                destination: address,
            });
            return {
                txHash: result.data?.id || `cb_${crypto.randomBytes(16).toString('hex')}`,
                providerTxId: result.data?.id,
                status: result.data?.status || 'pending',
            };
        } catch (err) {
            logger.error('Coinbase submitWithdrawal error:', err.message);
            throw err;
        }
    }

    async getDepositStatus(providerTxId) {
        try {
            const result = await this._request('GET', `/charges/${providerTxId}`);
            const charge = result.data;
            const statusMap = { NEW: 'pending', PENDING: 'processing', COMPLETED: 'completed', EXPIRED: 'failed', CANCELED: 'cancelled' };
            return {
                status: statusMap[charge?.timeline?.slice(-1)[0]?.status] || 'pending',
                confirmations: charge?.confirmations_required || 0,
                providerTxId,
            };
        } catch (err) {
            logger.error('Coinbase getDepositStatus error:', err.message);
            throw err;
        }
    }

    verifyWebhook(payload, signature) {
        if (!this.webhookSecret || !signature) return false;
        const parts = signature.split(',');
        const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
        const sig = parts.find(p => p.startsWith('s='))?.slice(2);
        if (!timestamp || !sig) return false;
        const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
        const computed = crypto.createHmac('sha256', this.webhookSecret)
            .update(signedPayload)
            .digest('hex');
        try {
            return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
        } catch {
            return false;
        }
    }
}

class StripeProvider {
    get name() { return 'stripe'; }

    constructor(apiKey, webhookSecret) {
        this.apiKey = apiKey;
        this.webhookSecret = webhookSecret;
        this.baseUrl = 'https://api.stripe.com/v1';
    }

    _request(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const encoded = body ? Object.entries(body).map(([k, v]) =>
                `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
            ).join('&') : null;
            const options = {
                method,
                hostname: url.hostname,
                path: url.pathname,
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            };
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (parsed.error) reject(new Error(parsed.error.message));
                        else resolve(parsed);
                    } catch {
                        reject(new Error(`Stripe: respuesta inválida (${res.statusCode})`));
                    }
                });
            });
            req.on('error', reject);
            if (encoded) req.write(encoded);
            req.end();
        });
    }

    async generateAddress(asset, userId) {
        try {
            const ephemeralKey = await this._request('POST', '/ephemeral_keys', {
                issuing_card: 'virtual',
                nonce: crypto.randomBytes(16).toString('hex'),
            });
            const address = `stripe_${ephemeralKey.id}_${userId}`;
            return { address, provider: 'stripe', ephemeralKey: ephemeralKey.id };
        } catch (err) {
            logger.error('Stripe generateAddress error:', err.message);
            throw err;
        }
    }

    // Stripe maneja depósitos vía PaymentIntent o Checkout Session
    async createPaymentIntent(asset, amount, userId) {
        try {
            const result = await this._request('POST', '/payment_intents', {
                amount: String(Math.round(amount * 100)),
                currency: asset === 'BTC' ? 'btc' : 'usd',
                metadata: { userId, asset },
                description: `Depósito fut.invest #${userId}`,
            });
            return {
                clientSecret: result.client_secret,
                paymentIntentId: result.id,
                status: result.status,
            };
        } catch (err) {
            logger.error('Stripe createPaymentIntent error:', err.message);
            throw err;
        }
    }

    async submitWithdrawal(asset, amount, address) {
        // Stripe no maneja pagos cripto salida directa; simulamos con Payout
        try {
            const result = await this._request('POST', '/payouts', {
                amount: String(Math.round(amount * 100)),
                currency: 'usd',
                destination: address,
                metadata: { asset },
            });
            return {
                txHash: result.id,
                providerTxId: result.id,
                status: result.status === 'paid' ? 'completed' : 'pending',
            };
        } catch (err) {
            logger.error('Stripe submitWithdrawal error:', err.message);
            throw err;
        }
    }

    async getDepositStatus(providerTxId) {
        try {
            const result = await this._request('GET', `/payment_intents/${providerTxId}`);
            const statusMap = {
                requires_payment_method: 'pending',
                requires_confirmation: 'pending',
                processing: 'processing',
                succeeded: 'completed',
                canceled: 'cancelled',
            };
            return {
                status: statusMap[result.status] || 'pending',
                confirmations: result.amount_received > 0 ? 1 : 0,
                providerTxId,
            };
        } catch (err) {
            logger.error('Stripe getDepositStatus error:', err.message);
            throw err;
        }
    }

    verifyWebhook(payload, signature) {
        if (!this.webhookSecret || !signature) return false;
        const parts = signature.split(',');
        const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
        const sig = parts.find(p => p.startsWith('v1='))?.slice(3);
        if (!timestamp || !sig) return false;
        const payloadStr = `${timestamp}.${JSON.stringify(payload)}`;
        const computed = crypto.createHmac('sha256', this.webhookSecret)
            .update(payloadStr)
            .digest('hex');
        try {
            return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
        } catch {
            return false;
        }
    }
}

function createProvider() {
    const providerName = process.env.PAYMENT_PROVIDER || 'payka';
    switch (providerName) {
        case 'payka': {
            return require('./paykaProvider');
        }
        case 'coinbase_commerce': {
            const apiKey = process.env.COINBASE_API_KEY;
            const webhookSecret = process.env.COINBASE_WEBHOOK_SECRET;
            if (!apiKey) throw new Error('COINBASE_API_KEY requerida para payment provider coinbase_commerce');
            return new CoinbaseCommerceProvider(apiKey, webhookSecret);
        }
        case 'stripe': {
            const secretKey = process.env.STRIPE_SECRET_KEY;
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
            if (!secretKey) throw new Error('STRIPE_SECRET_KEY requerida para payment provider stripe');
            return new StripeProvider(secretKey, webhookSecret);
        }
        case 'mock':
        default:
            return new MockProvider();
    }
}

const provider = createProvider();
logger.info(`Payment provider: ${provider.name}`);

module.exports = provider;
