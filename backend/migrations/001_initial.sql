CREATE TABLE IF NOT EXISTS wallets (
    address TEXT PRIMARY KEY,
    risk_level INTEGER NOT NULL,
    valid_until INTEGER NOT NULL,
    last_updated INTEGER NOT NULL,
    country_code TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    update_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    risk_level INTEGER NOT NULL,
    valid_until INTEGER NOT NULL,
    country_code TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (wallet_address) REFERENCES wallets(address)
);

CREATE TABLE IF NOT EXISTS indexer_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_risk_level ON wallets(risk_level);
CREATE INDEX IF NOT EXISTS idx_wallets_valid_until ON wallets(valid_until);
CREATE INDEX IF NOT EXISTS idx_wallets_country ON wallets(country_code);
CREATE INDEX IF NOT EXISTS idx_events_wallet ON status_events(wallet_address);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON status_events(timestamp);
