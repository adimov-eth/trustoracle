// API client for TrustSignal backend
// With escrow pattern, authorization requests are no longer needed
// The backend automatically processes pending transfers

import { BACKEND_URL } from "./config";

export type HealthStatus = {
  status: "ok" | "degraded" | "down";
  checks: {
    database: boolean;
    rpc: boolean;
    currentBlock?: number;
    lastIndexedBlock?: number;
    blocksBehind?: number;
    eventsIndexed?: number;
    error?: string;
  };
};

export async function checkHealth(): Promise<HealthStatus> {
  const res = await fetch(`${BACKEND_URL}/health`);
  return res.json() as Promise<HealthStatus>;
}

// Pending transfers

export type PendingTransfer = {
  transferId: string;
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  status: "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED";
  rejectionReason?: string;
  completionHash?: string;
};

export async function getPendingTransfers(address: string): Promise<PendingTransfer[]> {
  const res = await fetch(`${BACKEND_URL}/api/v1/transfers/${address}`);
  if (!res.ok) {
    return [];
  }
  const data = await res.json() as { transfers: PendingTransfer[] };
  return data.transfers;
}
