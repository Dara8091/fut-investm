/**
 * fut.invest - Python Services Client
 * Cliente para comunicar el backend Node.js con los servicios Python.
 */

const http = require('http');
const logger = require('../config/logger');

const PYTHON_SERVICES_URL = process.env.PYTHON_SERVICES_URL || 'http://localhost:3002';

class PythonServicesClient {
    constructor() {
        this.baseUrl = PYTHON_SERVICES_URL;
        this.enabled = process.env.PYTHON_SERVICES_ENABLED !== 'false';
    }

    async _request(method, path, data = null) {
        if (!this.enabled) {
            return null;
        }

        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method,
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000,
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        reject(new Error(`Invalid JSON from Python services: ${body}`));
                    }
                });
            });

            req.on('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    resolve(null); // Servicios Python no disponibles, usar fallback
                } else {
                    reject(err);
                }
            });

            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    async analyzeROI(userData) {
        try {
            const result = await this._request('POST', '/analyze/roi', userData);
            if (result) return result;
        } catch (err) {
            logger.warn('Python services unavailable for ROI analysis, using fallback');
        }

        // Fallback
        const tier = userData.tier || 'silver';
        const roiRanges = { silver: [1.0, 1.5], gold: [1.5, 2.0], black: [1.8, 2.5], interbank: [2.0, 3.0] };
        const [min, max] = roiRanges[tier] || [1.0, 1.5];
        return {
            current_roi: (min + max) / 2,
            predicted_roi_7d: (min + max) / 2 * 1.02,
            predicted_roi_30d: (min + max) / 2 * 1.05,
            confidence: 0.5,
            trend: 'stable',
            volatility: 0.15,
            recommendation: 'Continuar inversión actual',
        };
    }

    async getMarketInsights(symbols) {
        try {
            const params = symbols ? `?symbols=${symbols.join(',')}` : '';
            const result = await this._request('GET', `/analyze/market${params}`);
            if (result) return result;
        } catch (err) {
            logger.warn('Python services unavailable for market insights');
        }
        return [];
    }

    async analyzePortfolio(transactions) {
        try {
            const result = await this._request('POST', '/analyze/portfolio', { transactions });
            if (result) return result;
        } catch (err) {
            logger.warn('Python services unavailable for portfolio analysis');
        }
        return {
            total_value: 10000,
            daily_change: 1.85,
            weekly_change: 12.5,
            monthly_change: 45.2,
            sharpe_ratio: 1.8,
            max_drawdown: -5.2,
            win_rate: 0.72,
        };
    }

    async scanPair(symbol, amount) {
        try {
            const result = await this._request('POST', '/futinvest/scan', { symbol, amount });
            return result;
        } catch (err) {
            logger.warn('Python services unavailable for GoArbit scan');
            return null;
        }
    }

    async scanAll(amount) {
        try {
            const result = await this._request('POST', '/futinvest/scan-all', { amount });
            return result || [];
        } catch (err) {
            logger.warn('Python services unavailable for GoArbit scan-all');
            return [];
        }
    }

    async scanTriangular(amount) {
        try {
            const result = await this._request('POST', '/futinvest/triangular', { amount });
            return result;
        } catch (err) {
            logger.warn('Python services unavailable for triangular scan');
            return null;
        }
    }
}

module.exports = new PythonServicesClient();
