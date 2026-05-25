-- ============================================
-- Migración 004: GoArbit — Motor de Arbitraje
-- ============================================

CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
    id              SERIAL PRIMARY KEY,
    symbol          TEXT    NOT NULL,
    buy_exchange    TEXT    NOT NULL,
    sell_exchange   TEXT    NOT NULL,
    buy_price       NUMERIC(18,8) NOT NULL,
    sell_price      NUMERIC(18,8) NOT NULL,
    spread          NUMERIC(18,8) NOT NULL,
    profit          NUMERIC(18,8) NOT NULL DEFAULT 0,
    profit_percent  NUMERIC(18,8) NOT NULL DEFAULT 0,
    amount          NUMERIC(18,8) NOT NULL DEFAULT 0,
    is_profitable   BOOLEAN NOT NULL DEFAULT FALSE,
    executed        BOOLEAN NOT NULL DEFAULT FALSE,
    executed_by     INTEGER,
    executed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (executed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS arbitrage_exchange_config (
    id              SERIAL PRIMARY KEY,
    exchange_name   TEXT    NOT NULL UNIQUE,
    api_key         TEXT,
    api_secret      TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    fee_rate        NUMERIC(18,8) NOT NULL DEFAULT 0.001,
    min_trade_usd   NUMERIC(18,8) NOT NULL DEFAULT 10,
    max_trade_usd   NUMERIC(18,8) NOT NULL DEFAULT 50000,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arbitrage_config (
    key             TEXT    NOT NULL PRIMARY KEY,
    value           TEXT    NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arb_opportunities_symbol ON arbitrage_opportunities(symbol);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_profitable ON arbitrage_opportunities(is_profitable, created_at);
CREATE INDEX IF NOT EXISTS idx_arb_opportunities_executed ON arbitrage_opportunities(executed);
CREATE INDEX IF NOT EXISTS idx_arb_exchange_enabled ON arbitrage_exchange_config(exchange_name, enabled);

-- Configuración por defecto
INSERT INTO arbitrage_config (key, value, description) VALUES
    ('enabled', 'true', 'Motor de arbitraje habilitado'),
    ('scan_interval_ms', '10000', 'Intervalo de escaneo en milisegundos'),
    ('min_profit_usd', '1.0', 'Ganancia mínima para ejecutar arbitraje'),
    ('min_profit_percent', '0.1', 'Porcentaje mínimo de ganancia'),
    ('max_trade_usd', '10000', 'Monto máximo por operación de arbitraje'),
    ('platform_fee_percent', '10', 'Comisión de la plataforma sobre ganancias'),
    ('user_profit_percent', '90', 'Porcentaje de ganancia para el usuario'),
    ('auto_execute', 'false', 'Ejecución automática de oportunidades rentables'),
    ('supported_exchanges', 'binance,okx,kraken,bybit,kucoin,gate', 'Exchanges habilitados para escaneo'),
    ('supported_symbols', 'BTC/USDT,ETH/USDT,BNB/USDT,SOL/USDT,LTC/USDT', 'Pares de trading soportados')
ON CONFLICT (key) DO NOTHING;

-- Insertar configuración de exchanges por defecto
INSERT INTO arbitrage_exchange_config (exchange_name, fee_rate, min_trade_usd, max_trade_usd) VALUES
    ('binance', 0.001, 10, 50000),
    ('okx', 0.0008, 10, 50000),
    ('kraken', 0.0016, 10, 50000),
    ('bybit', 0.001, 10, 50000),
    ('kucoin', 0.001, 10, 50000),
    ('gate', 0.0015, 10, 50000)
ON CONFLICT (exchange_name) DO NOTHING;
