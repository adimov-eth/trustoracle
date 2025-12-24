import { ADMIN_API_KEY, BACKEND_URL } from "./config";
import type {
  AuditLogResponse,
  StatisticsResponse,
  TransfersResponse,
  WalletsResponse
} from "../types/admin";

async function adminFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": ADMIN_API_KEY,
      ...(options.headers ?? {})
    }
  });

  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }

  return data;
}

export function getWallets(params: {
  page?: number;
  limit?: number;
  riskLevel?: string;
  countryCode?: string;
  search?: string;
  expiringSoon?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<WalletsResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });
  return adminFetch(`/api/v1/admin/wallets?${query.toString()}`);
}

export function getStatistics(): Promise<StatisticsResponse> {
  return adminFetch("/api/v1/admin/statistics");
}

export function updateWalletStatus(
  address: string,
  data: { riskLevel: string; validUntil: number; countryCode: string }
): Promise<{ success: boolean; transactionHash: string; blockNumber: number }> {
  return adminFetch(`/api/v1/admin/wallets/${address}/status`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function createWallet(data: {
  address: string;
  riskLevel: string;
  validUntil: number;
  countryCode: string;
}): Promise<{ success: boolean; transactionHash: string; blockNumber: number }> {
  return adminFetch("/api/v1/admin/wallets", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function getTransfers(params: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<TransfersResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });
  return adminFetch(`/api/v1/admin/transfers?${query.toString()}`);
}

export function retryTransfer(
  transferId: string
): Promise<{ success: boolean; message: string }> {
  return adminFetch(`/api/v1/admin/transfers/${transferId}/retry`, {
    method: "POST"
  });
}

export function getAuditLog(params: {
  targetType?: string;
  targetId?: string;
  limit?: number;
}): Promise<AuditLogResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    query.set(key, String(value));
  });
  return adminFetch(`/api/v1/admin/audit?${query.toString()}`);
}
