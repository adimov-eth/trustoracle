import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { config } from "../config";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(currentDir, "..", "..", "migrations");
const dbPath = resolve(process.cwd(), config.adminDbPath);
const dbDir = dirname(dbPath);

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

export interface WalletRecord {
  address: string;
  risk_level: number;
  valid_until: number;
  last_updated: number;
  country_code: string;
  first_seen: number;
  update_count: number;
}

export interface WalletFilters {
  page?: number;
  limit?: number;
  riskLevel?: number;
  countryCode?: string;
  search?: string;
  expiringSoon?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export function initDatabase(): void {
  // Run all migrations in order
  const migration1 = readFileSync(resolve(migrationsDir, "001_initial.sql"), "utf8");
  const migration2 = readFileSync(resolve(migrationsDir, "002_pending_transfers.sql"), "utf8");
  const migration3 = readFileSync(resolve(migrationsDir, "003_audit_log.sql"), "utf8");
  db.exec(migration1);
  db.exec(migration2);
  db.exec(migration3);
}

export function upsertWallet(wallet: WalletRecord): void {
  const stmt = db.prepare(`
    INSERT INTO wallets (
      address,
      risk_level,
      valid_until,
      last_updated,
      country_code,
      first_seen,
      update_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      risk_level = excluded.risk_level,
      valid_until = excluded.valid_until,
      last_updated = excluded.last_updated,
      country_code = excluded.country_code,
      update_count = wallets.update_count + 1
  `);

  stmt.run(
    wallet.address,
    wallet.risk_level,
    wallet.valid_until,
    wallet.last_updated,
    wallet.country_code,
    wallet.first_seen,
    wallet.update_count
  );
}

export function insertEvent(event: {
  wallet_address: string;
  risk_level: number;
  valid_until: number;
  country_code: string;
  block_number: number;
  transaction_hash: string;
  timestamp: number;
}): void {
  const stmt = db.prepare(`
    INSERT INTO status_events (
      wallet_address,
      risk_level,
      valid_until,
      country_code,
      block_number,
      transaction_hash,
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    event.wallet_address,
    event.risk_level,
    event.valid_until,
    event.country_code,
    event.block_number,
    event.transaction_hash,
    event.timestamp
  );
}

export function getWallets(filters: WalletFilters): {
  wallets: WalletRecord[];
  total: number;
} {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.riskLevel !== undefined) {
    conditions.push("risk_level = ?");
    params.push(filters.riskLevel);
  }

  if (filters.countryCode) {
    conditions.push("country_code = ?");
    params.push(filters.countryCode.toUpperCase());
  }

  if (filters.search) {
    conditions.push("LOWER(address) LIKE ?");
    params.push(`%${filters.search.toLowerCase()}%`);
  }

  if (filters.expiringSoon) {
    const now = Math.floor(Date.now() / 1000);
    const soon = now + 7 * 24 * 60 * 60;
    conditions.push("valid_until BETWEEN ? AND ?");
    params.push(now, soon);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sortByMap: Record<string, string> = {
    lastUpdated: "last_updated",
    validUntil: "valid_until",
    riskLevel: "risk_level",
    updateCount: "update_count",
    firstSeen: "first_seen",
    address: "address"
  };

  const sortColumn = sortByMap[filters.sortBy ?? "lastUpdated"] ?? "last_updated";
  const sortOrder = filters.sortOrder === "asc" ? "ASC" : "DESC";

  const walletsStmt = db.prepare(`
    SELECT * FROM wallets
    ${whereClause}
    ORDER BY ${sortColumn} ${sortOrder}
    LIMIT ? OFFSET ?
  `);

  const wallets = walletsStmt.all(...params, limit, offset) as WalletRecord[];

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM wallets
    ${whereClause}
  `);

  const totalRow = countStmt.get(...params) as { total: number } | undefined;

  return {
    wallets,
    total: totalRow?.total ?? 0
  };
}

export function getStatistics(): {
  totalWallets: number;
  byRiskLevel: Record<number, number>;
  byCountry: Record<string, number>;
  expiringSoon: number;
  expired: number;
} {
  const totalRow = db.prepare("SELECT COUNT(*) as total FROM wallets").get() as
    | { total: number }
    | undefined;

  const byRiskLevel: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  };

  const riskRows = db
    .prepare("SELECT risk_level as riskLevel, COUNT(*) as count FROM wallets GROUP BY risk_level")
    .all() as Array<{ riskLevel: number; count: number }>;

  for (const row of riskRows) {
    byRiskLevel[row.riskLevel] = row.count;
  }

  const countryRows = db
    .prepare("SELECT country_code as countryCode, COUNT(*) as count FROM wallets GROUP BY country_code")
    .all() as Array<{ countryCode: string; count: number }>;

  const byCountry: Record<string, number> = {};
  for (const row of countryRows) {
    byCountry[row.countryCode] = row.count;
  }

  const now = Math.floor(Date.now() / 1000);
  const soon = now + 7 * 24 * 60 * 60;

  const expiringRow = db
    .prepare("SELECT COUNT(*) as total FROM wallets WHERE valid_until BETWEEN ? AND ?")
    .get(now, soon) as { total: number } | undefined;

  const expiredRow = db
    .prepare("SELECT COUNT(*) as total FROM wallets WHERE valid_until < ?")
    .get(now) as { total: number } | undefined;

  return {
    totalWallets: totalRow?.total ?? 0,
    byRiskLevel,
    byCountry,
    expiringSoon: expiringRow?.total ?? 0,
    expired: expiredRow?.total ?? 0
  };
}

export function getLastSyncedBlock(): number {
  const stmt = db.prepare("SELECT value FROM indexer_state WHERE key = 'last_synced_block'");
  const result = stmt.get() as { value: string } | undefined;
  return result ? Number(result.value) : 0;
}

export function setLastSyncedBlock(block: number): void {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO indexer_state (key, value) VALUES ('last_synced_block', ?)"
  );
  stmt.run(block.toString());
}

export function getEventCount(): number {
  const stmt = db.prepare("SELECT COUNT(*) as total FROM status_events");
  const result = stmt.get() as { total: number } | undefined;
  return result?.total ?? 0;
}

// ============ Pending Transfers ============

export type TransferStatus = "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED";

export interface PendingTransferRecord {
  transfer_id: string;
  from_address: string;
  to_address: string;
  amount: string;
  timestamp: number;
  block_number: number;
  transaction_hash: string;
  status: TransferStatus;
  process_attempts: number;
  last_attempt: number | null;
  completion_hash: string | null;
  rejection_reason: string | null;
  created_at: number;
}

export function insertPendingTransfer(transfer: {
  transferId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
}): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO pending_transfers (
      transfer_id, from_address, to_address, amount, timestamp,
      block_number, transaction_hash, status, process_attempts, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
  `);
  stmt.run(
    transfer.transferId,
    transfer.fromAddress.toLowerCase(),
    transfer.toAddress.toLowerCase(),
    transfer.amount,
    transfer.timestamp,
    transfer.blockNumber,
    transfer.transactionHash,
    Math.floor(Date.now() / 1000)
  );
}

export function getPendingTransfer(transferId: string): PendingTransferRecord | null {
  const stmt = db.prepare("SELECT * FROM pending_transfers WHERE transfer_id = ?");
  return (stmt.get(transferId) as PendingTransferRecord) ?? null;
}

export function getPendingTransfersByAddress(address: string): PendingTransferRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM pending_transfers
    WHERE from_address = ? OR to_address = ?
    ORDER BY timestamp DESC
    LIMIT 50
  `);
  const normalized = address.toLowerCase();
  return stmt.all(normalized, normalized) as PendingTransferRecord[];
}

export function isTransferProcessed(transferId: string): boolean {
  const stmt = db.prepare("SELECT 1 FROM pending_transfers WHERE transfer_id = ?");
  const result = stmt.get(transferId);
  // bun:sqlite returns null when no row found, not undefined
  return result != null;
}

export function updateTransferStatus(
  transferId: string,
  status: TransferStatus,
  completionHash?: string,
  rejectionReason?: string
): void {
  const stmt = db.prepare(`
    UPDATE pending_transfers
    SET status = ?, completion_hash = ?, rejection_reason = ?, last_attempt = ?
    WHERE transfer_id = ?
  `);
  stmt.run(status, completionHash ?? null, rejectionReason ?? null, Math.floor(Date.now() / 1000), transferId);
}

export function incrementProcessAttempts(transferId: string): void {
  const stmt = db.prepare(`
    UPDATE pending_transfers
    SET process_attempts = process_attempts + 1, last_attempt = ?
    WHERE transfer_id = ?
  `);
  stmt.run(Math.floor(Date.now() / 1000), transferId);
}

export function getStuckTransfers(thresholdMs: number, maxAttempts: number): PendingTransferRecord[] {
  const thresholdSec = Math.floor(thresholdMs / 1000);
  const cutoff = Math.floor(Date.now() / 1000) - thresholdSec;
  const stmt = db.prepare(`
    SELECT * FROM pending_transfers
    WHERE status = 'PENDING'
      AND process_attempts < ?
      AND (last_attempt IS NULL OR last_attempt < ?)
    ORDER BY timestamp ASC
    LIMIT 20
  `);
  return stmt.all(maxAttempts, cutoff) as PendingTransferRecord[];
}

export interface TransferFilters {
  page?: number;
  limit?: number;
  status?: TransferStatus;
}

export function getAllTransfers(filters: TransferFilters): {
  transfers: PendingTransferRecord[];
  total: number;
} {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const transfersStmt = db.prepare(`
    SELECT * FROM pending_transfers
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);

  const transfers = transfersStmt.all(...params, limit, offset) as PendingTransferRecord[];

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM pending_transfers
    ${whereClause}
  `);

  const totalRow = countStmt.get(...params) as { total: number } | undefined;

  return {
    transfers,
    total: totalRow?.total ?? 0
  };
}

// ============ Audit Log ============

export interface AuditLogEntry {
  id?: number;
  timestamp: number;
  action: string;
  actor: string | null;
  target_type: string;
  target_id: string;
  old_value: string | null;
  new_value: string | null;
  tx_hash: string | null;
  metadata: string | null;
}

export interface AuditLogFilters {
  targetType?: string;
  targetId?: string;
  limit?: number;
}

export function insertAuditLog(entry: Omit<AuditLogEntry, "id">): void {
  const stmt = db.prepare(`
    INSERT INTO audit_log (
      timestamp, action, actor, target_type, target_id,
      old_value, new_value, tx_hash, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    entry.timestamp,
    entry.action,
    entry.actor,
    entry.target_type,
    entry.target_id,
    entry.old_value,
    entry.new_value,
    entry.tx_hash,
    entry.metadata
  );
}

export function getAuditLog(filters: AuditLogFilters): AuditLogEntry[] {
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 100;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.targetType) {
    conditions.push("target_type = ?");
    params.push(filters.targetType);
  }

  if (filters.targetId) {
    conditions.push("target_id = ?");
    params.push(filters.targetId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const stmt = db.prepare(`
    SELECT * FROM audit_log
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(...params, limit) as AuditLogEntry[];
}
