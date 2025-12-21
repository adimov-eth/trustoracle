import { useQuery } from "@tanstack/react-query";

import { getWallets } from "../lib/api";

export function useWallets(filters: {
  page: number;
  limit: number;
  riskLevel?: string;
  countryCode?: string;
  search?: string;
  expiringSoon?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  return useQuery({
    queryKey: ["wallets", filters],
    queryFn: () => getWallets(filters),
    refetchInterval: 10000
  });
}
