import { useMemo, useState } from "react";

import { UpdateStatusForm } from "../components/UpdateStatusForm";
import { WalletTable } from "../components/WalletTable";
import { useWallets } from "../hooks/useWallets";
import type { WalletRecord } from "../types/admin";

const RISK_OPTIONS = ["ALL", "GREEN", "YELLOW", "RED", "UNKNOWN"] as const;

export function Wallets() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState<string | undefined>(undefined);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [selected, setSelected] = useState<WalletRecord | null>(null);

  const filters = useMemo(
    () => ({
      page,
      limit: 25,
      search: search || undefined,
      riskLevel,
      expiringSoon,
      sortBy: "lastUpdated",
      sortOrder: "desc" as const
    }),
    [page, search, riskLevel, expiringSoon]
  );

  const { data, isLoading, error, refetch } = useWallets(filters);

  const totalPages = data?.pagination.totalPages ?? 1;

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Wallet Registry</h2>
            <p className="muted">Indexed from on-chain WalletStatusUpdated events.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void refetch()}>
            Refresh
          </button>
        </div>
        <div className="filters">
          <input
            placeholder="Search address"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            value={riskLevel ?? "ALL"}
            onChange={(event) => {
              const value = event.target.value;
              setRiskLevel(value === "ALL" ? undefined : value);
              setPage(1);
            }}
          >
            {RISK_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={expiringSoon}
              onChange={(event) => {
                setExpiringSoon(event.target.checked);
                setPage(1);
              }}
            />
            Expiring soon
          </label>
        </div>
        {isLoading && <p className="muted">Loading wallets...</p>}
        {error && <div className="alert alert-error">{String(error)}</div>}
        {data && data.wallets.length > 0 && (
          <WalletTable wallets={data.wallets} onUpdate={setSelected} />
        )}
        {data && data.wallets.length === 0 && (
          <p className="muted">No wallets match the current filters.</p>
        )}
        <div className="pagination">
          <button
            className="btn btn-ghost"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
      {selected && (
        <UpdateStatusForm
          wallet={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => void refetch()}
        />
      )}
    </div>
  );
}
