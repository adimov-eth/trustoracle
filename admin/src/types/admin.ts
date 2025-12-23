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
