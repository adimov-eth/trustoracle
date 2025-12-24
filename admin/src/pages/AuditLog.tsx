import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getAuditLog } from "../lib/api";
import type { AuditEntry } from "../types/admin";

const TARGET_TYPE_OPTIONS = ["all", "wallet", "transfer"] as const;
const LIMIT_OPTIONS = [50, 100, 200] as const;

export function AuditLog() {
  const [targetType, setTargetType] = useState<string | undefined>(undefined);
  const [limit, setLimit] = useState<number>(50);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const filters = useMemo(
    () => ({
      targetType,
      limit
    }),
    [targetType, limit]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["auditLog", filters],
    queryFn: () => getAuditLog(filters),
    refetchInterval: 30000
  });

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Audit Log</h2>
            <p className="muted">System activity and compliance events.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void refetch()}>
            Refresh
          </button>
        </div>
        <div className="filters">
          <select
            value={targetType ?? "all"}
            onChange={(event) => {
              const value = event.target.value;
              setTargetType(value === "all" ? undefined : value);
            }}
          >
            {TARGET_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All types" : option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            {LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} entries
              </option>
            ))}
          </select>
        </div>
        {isLoading && <p className="muted">Loading audit log...</p>}
        {error && <div className="alert alert-error">{String(error)}</div>}
        {data && data.entries.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Tx Hash</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <>
                    <tr key={entry.id}>
                      <td>{formatDate(entry.timestamp)}</td>
                      <td>{entry.action}</td>
                      <td className="mono">{shorten(entry.actor)}</td>
                      <td>
                        <span className="muted">{entry.targetType}:</span>{" "}
                        <span className="mono">{shorten(entry.targetId)}</span>
                      </td>
                      <td>
                        {entry.txHash ? (
                          <a
                            href={`https://explorer.apothem.network/txs/${entry.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mono"
                          >
                            {shorten(entry.txHash)}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          onClick={() => toggleRow(entry.id)}
                        >
                          {expandedRows.has(entry.id) ? "Hide" : "Show"}
                        </button>
                      </td>
                    </tr>
                    {expandedRows.has(entry.id) && (
                      <tr key={`${entry.id}-details`}>
                        <td colSpan={6}>
                          <AuditDetails entry={entry} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.entries.length === 0 && (
          <p className="muted">No audit entries found.</p>
        )}
        {data && (
          <p className="muted">
            Showing {data.entries.length} of {data.total} total entries.
          </p>
        )}
      </div>
    </div>
  );
}

function AuditDetails({ entry }: { entry: AuditEntry }) {
  return (
    <div style={{ padding: "1rem", background: "var(--surface-2)", borderRadius: "4px" }}>
      {entry.oldValue !== undefined && (
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>Old Value:</strong>
          <pre className="mono" style={{ margin: "0.25rem 0", fontSize: "0.85em", overflow: "auto" }}>
            {JSON.stringify(entry.oldValue, null, 2)}
          </pre>
        </div>
      )}
      {entry.newValue !== undefined && (
        <div style={{ marginBottom: "0.5rem" }}>
          <strong>New Value:</strong>
          <pre className="mono" style={{ margin: "0.25rem 0", fontSize: "0.85em", overflow: "auto" }}>
            {JSON.stringify(entry.newValue, null, 2)}
          </pre>
        </div>
      )}
      {entry.metadata !== undefined && (
        <div>
          <strong>Metadata:</strong>
          <pre className="mono" style={{ margin: "0.25rem 0", fontSize: "0.85em", overflow: "auto" }}>
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
      {entry.oldValue === undefined && entry.newValue === undefined && entry.metadata === undefined && (
        <span className="muted">No additional details available.</span>
      )}
    </div>
  );
}

function shorten(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDate(timestamp: number) {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
