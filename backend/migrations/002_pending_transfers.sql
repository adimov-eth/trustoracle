CREATE TABLE IF NOT EXISTS pending_transfers (
    transfer_id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    process_attempts INTEGER DEFAULT 0,
    last_attempt INTEGER,
    completion_hash TEXT,
    rejection_reason TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_from ON pending_transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_transfers(status);
CREATE INDEX IF NOT EXISTS idx_pending_timestamp ON pending_transfers(timestamp);
