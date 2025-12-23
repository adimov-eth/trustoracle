import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { config } from "../config";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsPath = resolve(currentDir, "..", "..", "migrations", "001_initial.sql");
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
  const schema = readFileSync(migrationsPath, "utf8");
  db.exec(schema);
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
