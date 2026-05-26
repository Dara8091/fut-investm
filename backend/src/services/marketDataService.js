const https = require('https');
const http = require('http');
const logger = require('../config/logger');

const CACHE = { data: null, timestamp: 0, TTL: 60000 };
const CACHE_GLOBAL = { data: null, timestamp: 0, TTL: 300000 };
const CACHE_FEAR = { data: null, timestamp: 0, TTL: 3600000 };

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: { 'User-Agent': 'futinvest/2.0' },
            timeout: 8000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function getMarketOverview() {
    const now = Date.now();
    if (CACHE_GLOBAL.data && now - CACHE_GLOBAL.timestamp < CACHE_GLOBAL.TTL) {
        return CACHE_GLOBAL.data;
    }
    try {
        const data = await fetchJSON('https://api.coingecko.com/api/v3/global');
        const g = data.data;
        const result = {
            totalMarketCap: g.total_market_cap?.usd || 0,
            totalVolume: g.total_volume?.usd || 0,
            btcDominance: g.market_cap_percentage?.btc || 0,
            ethDominance: g.market_cap_percentage?.eth || 0,
            activeCryptocurrencies: g.active_cryptocurrencies || 0,
            markets: g.markets || 0,
            marketCapChange24h: g.market_cap_change_percentage_24h_usd || 0,
            updatedAt: new Date().toISOString(),
        };
        CACHE_GLOBAL.data = result;
        CACHE_GLOBAL.timestamp = now;
        return result;
    } catch (err) {
        logger.warn('CoinGecko global API error:', err.message);
        return CACHE_GLOBAL.data || { error: 'Datos no disponibles' };
    }
}

async function getTopCoins(limit = 20) {
    const now = Date.now();
    if (CACHE.data && now - CACHE.timestamp < CACHE.TTL) {
        return CACHE.data;
    }
    try {
        const data = await fetchJSON(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d`
        );
        const result = data.map(c => ({
            id: c.id,
            symbol: c.symbol.toUpperCase(),
            name: c.name,
            image: c.image,
            price: c.current_price,
            marketCap: c.market_cap,
            volume24h: c.total_volume,
            change1h: c.price_change_percentage_1h_in_currency,
            change24h: c.price_change_percentage_24h_in_currency,
            change7d: c.price_change_percentage_7d_in_currency,
            circulatingSupply: c.circulating_supply,
            totalSupply: c.total_supply,
            ath: c.ath,
            athChange: c.ath_change_percentage,
            rank: c.market_cap_rank,
        }));
        CACHE.data = result;
        CACHE.timestamp = now;
        return result;
    } catch (err) {
        logger.warn('CoinGecko markets API error:', err.message);
        return CACHE.data || [];
    }
}

async function getGainersLosers(limit = 10) {
    try {
        const data = await fetchJSON(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`
        );
        const sorted = data.filter(c => c.price_change_percentage_24h_in_currency != null)
            .sort((a, b) => b.price_change_percentage_24h_in_currency - a.price_change_percentage_24h_in_currency);
        return {
            gainers: sorted.slice(0, limit).map(c => ({
                symbol: c.symbol.toUpperCase(),
                name: c.name,
                price: c.current_price,
                change24h: c.price_change_percentage_24h_in_currency,
                image: c.image,
            })),
            losers: sorted.slice(-limit).reverse().map(c => ({
                symbol: c.symbol.toUpperCase(),
                name: c.name,
                price: c.current_price,
                change24h: c.price_change_percentage_24h_in_currency,
                image: c.image,
            })),
        };
    } catch (err) {
        logger.warn('Gainers/Losers API error:', err.message);
        return { gainers: [], losers: [], error: err.message };
    }
}

async function getFearAndGreed() {
    const now = Date.now();
    if (CACHE_FEAR.data && now - CACHE_FEAR.timestamp < CACHE_FEAR.TTL) {
        return CACHE_FEAR.data;
    }
    try {
        const data = await fetchJSON('https://api.alternative.me/fng/?limit=1');
        const item = data.data[0];
        const result = {
            value: parseInt(item.value),
            classification: item.value_classification,
            timestamp: item.timestamp,
        };
        CACHE_FEAR.data = result;
        CACHE_FEAR.timestamp = now;
        return result;
    } catch (err) {
        logger.warn('Fear & Greed API error:', err.message);
        return CACHE_FEAR.data || { value: 50, classification: 'Neutral', error: err.message };
    }
}

async function getCoinDetail(id) {
    try {
        const data = await fetchJSON(
            `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=true`
        );
        return {
            id: data.id,
            name: data.name,
            symbol: data.symbol.toUpperCase(),
            price: data.market_data.current_price?.usd,
            marketCap: data.market_data.market_cap?.usd,
            volume24h: data.market_data.total_volume?.usd,
            change24h: data.market_data.price_change_percentage_24h,
            change7d: data.market_data.price_change_percentage_7d,
            change30d: data.market_data.price_change_percentage_30d,
            ath: data.market_data.ath?.usd,
            atl: data.market_data.atl?.usd,
            circulatingSupply: data.market_data.circulating_supply,
            maxSupply: data.market_data.max_supply,
            description: data.description?.en?.slice(0, 500) || '',
            sparkline: data.market_data.sparkline_7d?.price || [],
            image: data.image?.large || data.image?.small,
        };
    } catch (err) {
        logger.warn('Coin detail API error:', err.message);
        return { error: err.message };
    }
}

async function searchCoins(query) {
    if (!query || query.length < 2) return [];
    try {
        const data = await fetchJSON(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
        return (data.coins || []).slice(0, 10).map(c => ({
            id: c.id,
            name: c.name,
            symbol: c.symbol.toUpperCase(),
            marketCapRank: c.market_cap_rank,
        }));
    } catch (err) {
        logger.warn('Search API error:', err.message);
        return [];
    }
}

module.exports = {
    getMarketOverview,
    getTopCoins,
    getGainersLosers,
    getFearAndGreed,
    getCoinDetail,
    searchCoins,
};
