export type RiskLevel = "UNKNOWN" | "GREEN" | "YELLOW" | "RED";

export type WalletRecord = {
  address: string;
  riskLevel: RiskLevel;
  validUntil: number;
  lastUpdated: number;
  countryCode: string;
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
