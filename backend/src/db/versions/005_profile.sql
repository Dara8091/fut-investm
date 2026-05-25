-- ============================================
-- fut.invest - Migration 005: Profile Features
-- ============================================
-- API Keys, Investment Goals, Sessions/Devices,
-- Risk Profile, Achievements, Audit Log exposure

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    name            TEXT    NOT NULL,
    key_hash        TEXT    NOT NULL UNIQUE,
    prefix          TEXT    NOT NULL,
    permissions     TEXT    NOT NULL DEFAULT 'read',
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Investment Goals
CREATE TABLE IF NOT EXISTS investment_goals (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    name            TEXT    NOT NULL,
    target_amount   NUMERIC(18,8) NOT NULL CHECK(target_amount > 0),
    current_amount  NUMERIC(18,8) NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
    deadline        TIMESTAMPTZ,
    priority        TEXT    NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
    status          TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Active Sessions / Devices
CREATE TABLE IF NOT EXISTS user_sessions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    session_token   TEXT    NOT NULL UNIQUE,
    device_name     TEXT    NOT NULL DEFAULT 'Unknown',
    device_type     TEXT    NOT NULL DEFAULT 'unknown' CHECK(device_type IN ('desktop','mobile','tablet','unknown')),
    os              TEXT    NOT NULL DEFAULT 'Unknown',
    browser         TEXT    NOT NULL DEFAULT 'Unknown',
    ip_address      TEXT,
    user_agent      TEXT,
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Risk Profile
CREATE TABLE IF NOT EXISTS risk_profiles (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL UNIQUE,
    profile_type    TEXT    NOT NULL DEFAULT 'moderate' CHECK(profile_type IN ('conservative','moderate','aggressive')),
    max_drawdown    NUMERIC(18,8) NOT NULL DEFAULT 10,
    max_position_pct NUMERIC(18,8) NOT NULL DEFAULT 25,
    leverage_limit  NUMERIC(18,8) NOT NULL DEFAULT 1,
    auto_hedge      BOOLEAN NOT NULL DEFAULT FALSE,
    stop_loss_pct   NUMERIC(18,8) NOT NULL DEFAULT 5,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Achievements (system-defined, not user-specific)
CREATE TABLE IF NOT EXISTS achievement_defs (
    id              SERIAL PRIMARY KEY,
    code            TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    description     TEXT    NOT NULL,
    icon            TEXT    NOT NULL DEFAULT 'trophy',
    tier            TEXT    NOT NULL DEFAULT 'bronze' CHECK(tier IN ('bronze','silver','gold','platinum')),
    requirement     TEXT    NOT NULL
);

-- User Achievements (earned)
CREATE TABLE IF NOT EXISTS user_achievements (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    achievement_id  INTEGER NOT NULL,
    earned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    progress        NUMERIC(18,8) NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (achievement_id) REFERENCES achievement_defs(id),
    UNIQUE(user_id, achievement_id)
);

-- Seed achievement definitions
INSERT INTO achievement_defs (code, name, description, icon, tier, requirement) VALUES
    ('first_deposit', 'Primer Depósito', 'Realizaste tu primer depósito', 'account_balance_wallet', 'bronze', 'deposit_count >= 1'),
    ('first_withdraw', 'Primera Retiro', 'Realizaste tu primer retiro', 'send', 'bronze', 'withdraw_count >= 1'),
    ('roi_master', 'Maestro del ROI', 'Alcanzaste 10% de ROI acumulado', 'trending_up', 'silver', 'total_roi >= 10'),
    ('network_leader', 'Líder de Red', 'Tienes 10+ referidos activos', 'account_group', 'gold', 'active_referrals >= 10'),
    ('whale', 'Ballena', 'Balance superior a $50,000', 'diamond', 'platinum', 'balance >= 50000'),
    ('early_adopter', 'Adoptador Temprano', 'Cuenta creada en el primer año', 'rocket', 'silver', 'created_at <= 2027-01-01')
ON CONFLICT (code) DO NOTHING;

-- Insert risk profile for existing users that don't have one
INSERT INTO risk_profiles (user_id, profile_type, max_drawdown, max_position_pct, leverage_limit, auto_hedge, stop_loss_pct)
SELECT id, 'moderate', 10, 25, 1, 0, 5 FROM users
WHERE id NOT IN (SELECT user_id FROM risk_profiles);
