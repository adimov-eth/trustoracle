export type RiskLevel = "UNKNOWN" | "GREEN" | "YELLOW" | "RED";
export type RiskLevelNumber = 0 | 1 | 2 | 3;

export type WalletStatus = {
  riskLevel: RiskLevel;
  validUntil: number;
  lastUpdated?: number;
  countryCode: string;
};

export type Authorization = {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  expiry: number;
  signature: `0x${string}`;
};

export type AuthorizationWire = Omit<Authorization, "amount" | "nonce"> & {
  amount: string;
  nonce: string;
};

export type NotaryStatus = {
  riskLevel: RiskLevel;
  validUntil: number;
  countryCode: string;
};
