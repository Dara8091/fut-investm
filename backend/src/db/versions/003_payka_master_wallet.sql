-- ============================================
-- Migración 003: Super Admin + Payka Master Wallet
-- ============================================

CREATE TABLE IF NOT EXISTS master_wallet_config (
    id              SERIAL PRIMARY KEY,
    asset           TEXT    NOT NULL UNIQUE,
    wallet_address  TEXT    NOT NULL,
    network         TEXT    NOT NULL DEFAULT 'mainnet',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fund_consolidations (
    id              SERIAL PRIMARY KEY,
    from_asset      TEXT    NOT NULL,
    to_asset        TEXT    NOT NULL,
    amount          NUMERIC(18,8) NOT NULL CHECK(amount > 0),
    from_address    TEXT    NOT NULL,
    to_address      TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
    tx_hash         TEXT,
    approved_by     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS system_config (
    key             TEXT    NOT NULL PRIMARY KEY,
    value           TEXT    NOT NULL,
    description     TEXT,
    updated_by      INTEGER,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_master_wallet_asset ON master_wallet_config(asset, active);
CREATE INDEX IF NOT EXISTS idx_consolidations_status ON fund_consolidations(status);
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

-- Insertar configuración por defecto
INSERT INTO system_config (key, value, description) VALUES
    ('platform_name', 'fut.invest', 'Nombre de la plataforma'),
    ('maintenance_mode', 'false', 'Modo mantenimiento (true/false)'),
    ('min_deposit_usd', '10', 'Depósito mínimo en USD'),
    ('max_deposit_usd', '500000', 'Depósito máximo en USD'),
    ('default_roi_min', '1.5', 'ROI mínimo por defecto (%)'),
    ('default_roi_max', '2.5', 'ROI máximo por defecto (%)'),
    ('payka_enabled', 'true', 'Payka como proveedor principal'),
    ('auto_consolidate', 'false', 'Consolidación automática de fondos')
ON CONFLICT (key) DO NOTHING;
