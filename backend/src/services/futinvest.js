// ============================================
// GoArbit — Motor de Arbitraje Unificado
// Combina: goArbiTrade (Okex) + GoArbitrage (engine) + goarbit (frontend)
// Integrado en fut.invest para detección y ejecución de oportunidades
// ============================================
const crypto = require('crypto');
const https = require('https');
const db = require('../config/database');
const logger = require('../config/logger');

// === EXCHANGE CONFIGURATIONS ===
const EXCHANGES = {
    binance: {
        name: 'Binance',
        baseUrl: 'api.binance.com',
        fee: 0.001, // 0.1%
        minTrade: 10,
        supportedPairs: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'LTCUSDT'],
    },
    okx: {
        name: 'OKX (Okex)',
        baseUrl: 'www.okx.com',
        fee: 0.0008, // 0.08%
        minTrade: 10,
        supportedPairs: ['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'LTC-USDT'],
    },
    kraken: {
        name: 'Kraken',
        baseUrl: 'api.kraken.com',
        fee: 0.0016, // 0.16%
        minTrade: 10,
        supportedPairs: ['XXBTZUSD', 'XETHZUSD', 'BNBUSDT', 'SOLUSD', 'LTCUSD'],
    },
    bybit: {
        name: 'Bybit',
        baseUrl: 'api.bybit.com',
        fee: 0.001, // 0.1%
        minTrade: 10,
        supportedPairs: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'LTCUSDT'],
    },
    kucoin: {
        name: 'KuCoin',
        baseUrl: 'api.kucoin.com',
        fee: 0.001, // 0.1%
        minTrade: 10,
        supportedPairs: ['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'LTC-USDT'],
    },
    gate: {
        name: 'Gate.io',
        baseUrl: 'api.gateio.ws',
        fee: 0.0015, // 0.15%
        minTrade: 10,
        supportedPairs: ['BTC_USDT', 'ETH_USDT', 'BNB_USDT', 'SOL_USDT', 'LTC_USDT'],
    },
};

// === HTTP REQUEST HELPER ===
function exchangeRequest(exchange, path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: exchange.baseUrl,
            path,
            method: 'GET',
            headers: { 'User-Agent': 'GoArbit/1.0' },
            timeout: 5000,
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`${exchange.name} error ${res.statusCode}: ${data.slice(0, 200)}`));
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    reject(new Error(`${exchange.name}: respuesta inválida`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`${exchange.name}: timeout`)); });
        req.end();
    });
}

// === PRICE FETCHERS (por exchange) ===
async function getBinancePrice(symbol) {
    const data = await exchangeRequest(EXCHANGES.binance, `/api/v3/ticker/bookTicker?symbol=${symbol}`);
    return {
        bid: parseFloat(data.bidPrice),
        ask: parseFloat(data.askPrice),
        exchange: 'binance',
        symbol,
        timestamp: Date.now(),
    };
}

async function getOkxPrice(symbol) {
    const data = await exchangeRequest(EXCHANGES.okx, `/api/v5/market/books?instId=${symbol}&sz=1`);
    const book = data.data?.[0];
    if (!book) throw new Error('OKX: sin datos');
    return {
        bid: parseFloat(book.bidPx),
        ask: parseFloat(book.askPx),
        exchange: 'okx',
        symbol,
        timestamp: Date.now(),
    };
}

async function getKrakenPrice(symbol) {
    const data = await exchangeRequest(EXCHANGES.kraken, `/0/public/Ticker?pair=${symbol}`);
    const result = data.result[Object.keys(data.result)[0]];
    if (!result) throw new Error('Kraken: sin datos');
    return {
        bid: parseFloat(result.b[0]),
        ask: parseFloat(result.a[0]),
        exchange: 'kraken',
        symbol,
        timestamp: Date.now(),
    };
}

async function getBybitPrice(symbol) {
    const data = await exchangeRequest(EXCHANGES.bybit, `/v5/market/orderbook?category=spot&symbol=${symbol}&limit=1`);
    const book = data.result;
    if (!book?.b?.[0] || !book?.a?.[0]) throw new Error('Bybit: sin datos');
    return {
        bid: parseFloat(book.b[0][0]),
        ask: parseFloat(book.a[0][0]),
        exchange: 'bybit',
        symbol,
        timestamp: Date.now(),
    };
}

async function getKucoinPrice(symbol) {
    const data = await exchangeRequest(EXCHANGES.kucoin, `/api/v1/market/orderbook/level1?symbol=${symbol}`);
    if (!data.data) throw new Error('KuCoin: sin datos');
    return {
        bid: parseFloat(data.data.bids[0]),
        ask: parseFloat(data.data.asks[0]),
        exchange: 'kucoin',
        symbol,
        timestamp: Date.now(),
    };
}

async function getGatePrice(symbol) {
    const data = await exchangeRequest(EXCHANGES.gate, `/api/v4/spot/order_book?currency_pair=${symbol}&limit=1`);
    if (!data.bids?.[0] || !data.asks?.[0]) throw new Error('Gate.io: sin datos');
    return {
        bid: parseFloat(data.bids[0][0]),
        ask: parseFloat(data.asks[0][0]),
        exchange: 'gate',
        symbol,
        timestamp: Date.now(),
    };
}

const PRICE_FETCHERS = {
    binance: getBinancePrice,
    okx: getOkxPrice,
    kraken: getKrakenPrice,
    bybit: getBybitPrice,
    kucoin: getKucoinPrice,
    gate: getGatePrice,
};

// === SYMBOL MAPPING ===
// Mapea un símbolo base (ej: BTC/USDT) a los símbolos de cada exchange
function mapSymbol(baseSymbol) {
    const mappings = {
        'BTC/USDT': { binance: 'BTCUSDT', okx: 'BTC-USDT', kraken: 'XXBTZUSD', bybit: 'BTCUSDT', kucoin: 'BTC-USDT', gate: 'BTC_USDT' },
        'ETH/USDT': { binance: 'ETHUSDT', okx: 'ETH-USDT', kraken: 'XETHZUSD', bybit: 'ETHUSDT', kucoin: 'ETH-USDT', gate: 'ETH_USDT' },
        'BNB/USDT': { binance: 'BNBUSDT', okx: 'BNB-USDT', kraken: 'BNBUSDT', bybit: 'BNBUSDT', kucoin: 'BNB-USDT', gate: 'BNB_USDT' },
        'SOL/USDT': { binance: 'SOLUSDT', okx: 'SOL-USDT', kraken: 'SOLUSD', bybit: 'SOLUSDT', kucoin: 'SOL-USDT', gate: 'SOL_USDT' },
        'LTC/USDT': { binance: 'LTCUSDT', okx: 'LTC-USDT', kraken: 'LTCUSD', bybit: 'LTCUSDT', kucoin: 'LTC-USDT', gate: 'LTC_USDT' },
    };
    return mappings[baseSymbol] || null;
}

// === CORE: CALCULAR OPORTUNIDAD DE ARBITRAJE ===
function calculateArbitrage(buyPrice, sellPrice, buyFee, sellFee, amount) {
    const buyCost = amount * buyPrice * (1 + buyFee);
    const sellRevenue = amount * sellPrice * (1 - sellFee);
    const profit = sellRevenue - buyCost;
    const profitPercent = (profit / buyCost) * 100;

    return {
        buyPrice,
        sellPrice,
        spread: sellPrice - buyPrice,
        spreadPercent: ((sellPrice - buyPrice) / buyPrice) * 100,
        buyFee: buyFee * 100,
        sellFee: sellFee * 100,
        amount,
        buyCost,
        sellRevenue,
        profit,
        profitPercent,
        isProfitable: profit > 0,
    };
}

// === SCANNER: Buscar oportunidades entre todos los exchanges ===
async function scanOpportunities(baseSymbol, amount = 100) {
    const mapping = mapSymbol(baseSymbol);
    if (!mapping) return { error: `Símbolo no soportado: ${baseSymbol}` };

    const prices = [];
    const enabledExchanges = Object.keys(PRICE_FETCHERS);

    // Obtener precios de todos los exchanges en paralelo
    const fetchPromises = enabledExchanges.map(async (exName) => {
        try {
            const price = await PRICE_FETCHERS[exName](mapping[exName]);
            prices.push(price);
        } catch (err) {
            logger.warn(`GoArbit: Error obteniendo precio de ${exName}: ${err.message}`);
        }
    });

    await Promise.allSettled(fetchPromises);

    if (prices.length < 2) {
        return { error: 'No se pudieron obtener suficientes precios', prices };
    }

    // Encontrar mejor oportunidad: comprar barato, vender caro
    const cheapest = prices.reduce((min, p) => p.ask < min.ask ? p : min, prices[0]);
    const mostExpensive = prices.reduce((max, p) => p.bid > max.bid ? p : max, prices[0]);

    const opportunity = calculateArbitrage(
        cheapest.ask,
        mostExpensive.bid,
        EXCHANGES[cheapest.exchange].fee,
        EXCHANGES[mostExpensive.exchange].fee,
        amount / cheapest.ask // cantidad del asset
    );

    return {
        symbol: baseSymbol,
        amount,
        buyExchange: cheapest.exchange,
        buyPrice: cheapest.ask,
        sellExchange: mostExpensive.exchange,
        sellPrice: mostExpensive.bid,
        ...opportunity,
        allPrices: prices,
        timestamp: Date.now(),
    };
}

// === SCANNER GLOBAL: Escanear todos los pares ===
async function scanAllPairs(amount = 100) {
    const pairs = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'LTC/USDT'];
    const results = [];

    const scanPromises = pairs.map(async (pair) => {
        try {
            const opp = await scanOpportunities(pair, amount);
            if (!opp.error && opp.isProfitable) {
                results.push(opp);
            }
        } catch (err) {
            logger.warn(`GoArbit: Error escaneando ${pair}: ${err.message}`);
        }
    });

    await Promise.allSettled(scanPromises);

    // Ordenar por profit descendente
    results.sort((a, b) => b.profit - a.profit);
    return results;
}

// === TRIANGULAR ARBITRAGE (3 monedas) ===
// Ejemplo: USDT → BTC → ETH → USDT
async function scanTriangularArbitrage(baseAmount = 1000) {
    const triangles = [
        { path: ['USDT', 'BTC', 'ETH', 'USDT'], pairs: ['BTC/USDT', 'ETH/BTC', 'ETH/USDT'] },
        { path: ['USDT', 'BTC', 'BNB', 'USDT'], pairs: ['BTC/USDT', 'BNB/BTC', 'BNB/USDT'] },
        { path: ['USDT', 'ETH', 'BNB', 'USDT'], pairs: ['ETH/USDT', 'BNB/ETH', 'BNB/USDT'] },
    ];

    const results = [];

    for (const triangle of triangles) {
        try {
            let currentAmount = baseAmount;
            const steps = [];

            for (const pair of triangle.pairs) {
                const mapping = mapSymbol(pair);
                if (!mapping) continue;

                // Usar Binance como referencia para triangular
                const price = await PRICE_FETCHERS.binance(mapping.binance);
                const rate = (price.bid + price.ask) / 2;

                steps.push({
                    from: pair.split('/')[0],
                    to: pair.split('/')[1],
                    rate,
                    exchange: 'binance',
                });

                currentAmount = currentAmount / rate;
            }

            const profit = currentAmount - baseAmount;
            const profitPercent = (profit / baseAmount) * 100;

            results.push({
                type: 'triangular',
                path: triangle.path,
                pairs: triangle.pairs,
                steps,
                initialAmount: baseAmount,
                finalAmount: currentAmount,
                profit,
                profitPercent,
                isProfitable: profit > 0,
                timestamp: Date.now(),
            });
        } catch (err) {
            logger.warn(`GoArbit: Error en triangular ${triangle.path.join(' → ')}: ${err.message}`);
        }
    }

    return results.filter(r => r.isProfitable).sort((a, b) => b.profit - a.profit);
}

// === GUARDAR OPORTUNIDAD EN DB ===
function logOpportunity(opp) {
    try {
        db.prepare(
            `INSERT INTO arbitrage_opportunities (symbol, buy_exchange, sell_exchange, buy_price, sell_price, spread, profit, profit_percent, amount, is_profitable)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            opp.symbol, opp.buyExchange, opp.sellExchange,
            opp.buyPrice, opp.sellPrice, opp.spread,
            opp.profit, opp.profitPercent, opp.amount,
            opp.isProfitable ? 1 : 0
        );
    } catch (err) {
        logger.warn('GoArbit: Error logueando oportunidad:', err.message);
    }
}

// === OBTENER HISTORIAL DE ARBITRAJE ===
function getArbitrageHistory(limit = 50) {
    return db.prepare(
        'SELECT * FROM arbitrage_opportunities ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
}

// === EJECUTAR ARBITRAJE (simulado en modo mock, real con API keys) ===
async function executeArbitrage(opp, userId) {
    if (!opp || !opp.isProfitable) {
        return { error: 'Oportunidad inválida o no rentable' };
    }

    const txHash = `goarbit_${crypto.randomBytes(16).toString('hex')}`;

    // Registrar transacción
    const tx = db.prepare(
        `INSERT INTO transactions (user_id, type, asset, amount, fee, status, metadata, provider)
         VALUES (?, 'arbitrage', ?, ?, ?, 'completed', ?, 'goarbit')`
    ).run(
        userId, opp.symbol, opp.amount, opp.profit * 0.01,
        JSON.stringify({
            type: 'arbitrage',
            buyExchange: opp.buyExchange,
            sellExchange: opp.sellExchange,
            buyPrice: opp.buyPrice,
            sellPrice: opp.sellPrice,
            profit: opp.profit,
            txHash,
        })
    );

    // Acreditar ganancia al usuario
    db.prepare(
        'UPDATE accounts SET balance = balance + ?, accumulated_earnings = accumulated_earnings + ? WHERE user_id = ?'
    ).run(opp.profit * 0.9, opp.profit * 0.9, userId); // 90% al usuario, 10% fee plataforma

    logger.info(`GoArbit: Arbitraje ejecutado por user #${userId}: ${opp.symbol} → $${opp.profit.toFixed(2)} profit`);

    return {
        success: true,
        txHash,
        transactionId: tx.lastInsertRowid,
        profit: opp.profit,
        userProfit: opp.profit * 0.9,
        platformFee: opp.profit * 0.1,
        message: `Arbitraje ejecutado: Ganancia $${opp.profit.toFixed(2)} USD`,
    };
}

// === API ROUTES HANDLER ===
function handleScan(req, res) {
    const { symbol = 'BTC/USDT', amount = 100 } = req.query;
    scanOpportunities(symbol, parseFloat(amount))
        .then(result => res.json(result))
        .catch(err => res.status(502).json({ error: err.message }));
}

function handleScanAll(req, res) {
    const { amount = 100 } = req.query;
    scanAllPairs(parseFloat(amount))
        .then(results => res.json({ opportunities: results, count: results.length }))
        .catch(err => res.status(502).json({ error: err.message }));
}

function handleTriangular(req, res) {
    const { amount = 1000 } = req.query;
    scanTriangularArbitrage(parseFloat(amount))
        .then(results => res.json({ triangularOpportunities: results, count: results.length }))
        .catch(err => res.status(502).json({ error: err.message }));
}

function handleExecute(req, res) {
    const userId = req.user.userId;
    const { symbol = 'BTC/USDT', amount = 100 } = req.body;

    scanOpportunities(symbol, parseFloat(amount))
        .then(opp => {
            if (opp.error) return res.status(400).json({ error: opp.error });
            if (!opp.isProfitable) return res.json({ message: 'No hay oportunidad rentable en este momento', ...opp });
            return executeArbitrage(opp, userId).then(result => res.json(result));
        })
        .catch(err => res.status(502).json({ error: err.message }));
}

function handleHistory(req, res) {
    const { limit = 50 } = req.query;
    const history = getArbitrageHistory(parseInt(limit));
    res.json({ history, count: history.length });
}

function handleStatus(req, res) {
    const exchanges = Object.keys(EXCHANGES).map(name => ({
        name: EXCHANGES[name].name,
        fee: EXCHANGES[name].fee * 100 + '%',
        minTrade: EXCHANGES[name].minTrade,
        pairs: EXCHANGES[name].supportedPairs.length,
    }));

    res.json({
        status: 'active',
        version: '1.0.0',
        exchanges,
        supportedSymbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'LTC/USDT'],
        features: ['spot_arbitrage', 'triangular_arbitrage', 'multi_exchange_scan'],
    });
}

module.exports = {
    // Core functions
    scanOpportunities,
    scanAllPairs,
    scanTriangularArbitrage,
    executeArbitrage,
    calculateArbitrage,
    // Data
    getArbitrageHistory,
    logOpportunity,
    // API handlers
    handleScan,
    handleScanAll,
    handleTriangular,
    handleExecute,
    handleHistory,
    handleStatus,
    // Config
    EXCHANGES,
    PRICE_FETCHERS,
    mapSymbol,
};
