import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

import { getTransfers, retryTransfer } from "../lib/api";
import type { TransferRecord, TransferStatus } from "../types/admin";

const STATUS_OPTIONS = ["ALL", "PENDING", "COMPLETED", "REJECTED", "CANCELLED"] as const;

export function Transfers() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [retrying, setRetrying] = useState<string | null>(null);

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
        if (transfer.status === "PENDING" && transfer.processAttempts > 0) {
          return (
            <button
              className="btn btn-ghost"
              onClick={() => void handleRetry(transfer.transferId)}
              disabled={retrying === transfer.transferId}
            >
              {retrying === transfer.transferId ? "Retrying..." : "Retry"}
            </button>
          );
        }
        return null;
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

function formatAmount(amount: string) {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
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
