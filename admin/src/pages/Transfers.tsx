import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

import { getTransfers, retryTransfer, completeTransfer, rejectTransfer } from "../lib/api";
import type { TransferRecord, TransferStatus } from "../types/admin";

const STATUS_OPTIONS = ["ALL", "PENDING", "COMPLETED", "REJECTED", "CANCELLED"] as const;

export function Transfers() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filters = useMemo(
    () => ({
      page,
      limit: 25,
      status
    }),
    [page, status]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["transfers", filters],
    queryFn: () => getTransfers(filters),
    refetchInterval: 10000
  });

  const handleRetry = async (transferId: string) => {
    setRetrying(transferId);
    try {
      await retryTransfer(transferId);
      void refetch();
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetrying(null);
    }
  };

  const handleComplete = async (transferId: string) => {
    setCompleting(transferId);
    try {
      await completeTransfer(transferId);
      void refetch();
    } catch (err) {
      console.error("Complete failed:", err);
    } finally {
      setCompleting(null);
    }
  };

  const handleReject = async (transferId: string) => {
    const reason = rejectReason.trim() || "ADMIN_REJECTED";
    setRejecting(transferId);
    try {
      await rejectTransfer(transferId, reason);
      setRejectReason("");
      void refetch();
    } catch (err) {
      console.error("Reject failed:", err);
    } finally {
      setRejecting(null);
    }
  };

  const columns: ColumnDef<TransferRecord>[] = [
    {
      header: "Transfer ID",
      accessorKey: "transferId",
      cell: (info) => <span className="mono">{shorten(info.getValue<string>())}</span>
    },
    {
      header: "From",
      accessorKey: "from",
      cell: (info) => <span className="mono">{shorten(info.getValue<string>())}</span>
    },
    {
      header: "To",
      accessorKey: "to",
      cell: (info) => <span className="mono">{shorten(info.getValue<string>())}</span>
    },
    {
      header: "Amount",
      accessorKey: "amount",
      cell: (info) => formatAmount(info.getValue<string>())
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (info) => {
        const value = info.getValue<TransferStatus>();
        return <span className={`badge ${getStatusBadgeClass(value)}`}>{value}</span>;
      }
    },
    {
      header: "Timestamp",
      accessorKey: "timestamp",
      cell: (info) => formatDate(info.getValue<number>())
    },
    {
      header: "Attempts",
      accessorKey: "processAttempts"
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) => {
        const transfer = row.original;
        if (transfer.status !== "PENDING") return null;

        const isProcessing = completing === transfer.transferId || rejecting === transfer.transferId;
        const showRejectInput = rejecting === transfer.transferId;

        return (
          <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost"
              style={{ color: "var(--green)", fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
              onClick={() => void handleComplete(transfer.transferId)}
              disabled={isProcessing}
            >
              {completing === transfer.transferId ? "..." : "✓"}
            </button>
            {showRejectInput ? (
              <>
                <input
                  type="text"
                  placeholder="Reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ width: "80px", fontSize: "0.75rem", padding: "0.2rem" }}
                  autoFocus
                />
                <button
                  className="btn btn-ghost"
                  style={{ color: "var(--red)", fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                  onClick={() => void handleReject(transfer.transferId)}
                >
                  Reject
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                  onClick={() => { setRejecting(null); setRejectReason(""); }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost"
                style={{ color: "var(--red)", fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                onClick={() => setRejecting(transfer.transferId)}
                disabled={isProcessing}
              >
                ✗
              </button>
            )}
            {transfer.processAttempts > 0 && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
                onClick={() => void handleRetry(transfer.transferId)}
                disabled={isProcessing || retrying === transfer.transferId}
              >
                {retrying === transfer.transferId ? "..." : "Retry"}
              </button>
            )}
          </div>
        );
      }
    }
  ];

  const table = useReactTable({
    data: data?.transfers ?? [],
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  const totalPages = data?.pagination.totalPages ?? 1;

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Transfer Queue</h2>
            <p className="muted">Track and manage pending transfers.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void refetch()}>
            Refresh
          </button>
        </div>
        <div className="filters">
          <select
            value={status ?? "ALL"}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(value === "ALL" ? undefined : value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        {isLoading && <p className="muted">Loading transfers...</p>}
        {error && <div className="alert alert-error">{String(error)}</div>}
        {data && data.transfers.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th key={header.id}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.transfers.length === 0 && (
          <p className="muted">No transfers match the current filters.</p>
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

function formatAmount(amountWei: string) {
  try {
    const wei = BigInt(amountWei);
    const decimals = 18;
    const divisor = BigInt(10 ** decimals);
    const whole = wei / divisor;
    const fraction = wei % divisor;

    if (fraction === 0n) {
      return `${whole.toLocaleString()} TST`;
    }

    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
    return fractionStr
      ? `${whole.toLocaleString()}.${fractionStr} TST`
      : `${whole.toLocaleString()} TST`;
  } catch {
    return amountWei;
  }
}

function getStatusBadgeClass(status: TransferStatus): string {
  switch (status) {
    case "COMPLETED":
      return "badge-green";
    case "PENDING":
      return "badge-yellow";
    case "REJECTED":
      return "badge-red";
    case "CANCELLED":
      return "badge-neutral";
    default:
      return "badge-neutral";
  }
}
