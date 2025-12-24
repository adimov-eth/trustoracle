import type { WalletStatus } from "@trustsignal/shared/types/oracle";

export type WalletRecord = Omit<WalletStatus, "lastUpdated"> & {
  address: string;
  lastUpdated: number;
  firstSeen: number;
  updateCount: number;
};

export type WalletsResponse = {
  wallets: WalletRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type StatisticsResponse = {
  totalWallets: number;
  byRiskLevel: Record<number, number>;
  byCountry: Record<string, number>;
  expiringSoon: number;
  expired: number;
  lastSyncedBlock: number;
};

export type TransferStatus = "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED";

export type TransferRecord = {
  transferId: string;
  from: string;
  to: string;
  amount: string;
  status: TransferStatus;
  timestamp: number;
  processAttempts: number;
  rejectionReason?: string;
  completionHash?: string;
};

export type TransfersResponse = {
  transfers: TransferRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type AuditEntry = {
  id: number;
  timestamp: number;
  action: string;
  actor: string;
  targetType: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
  txHash?: string;
  metadata?: unknown;
};

export type AuditLogResponse = {
  entries: AuditEntry[];
  total: number;
};
