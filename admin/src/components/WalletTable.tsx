import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

import type { WalletRecord } from "../types/admin";

export function WalletTable({
  wallets,
  onUpdate
}: {
  wallets: WalletRecord[];
  onUpdate: (wallet: WalletRecord) => void;
}) {
  const columns: ColumnDef<WalletRecord>[] = [
    {
      header: "Address",
      accessorKey: "address",
      cell: (info) => (
        <span className="mono">{shorten(info.getValue<string>())}</span>
      )
    },
    {
      header: "Risk",
      accessorKey: "riskLevel",
      cell: (info) => {
        const value = info.getValue<WalletRecord["riskLevel"]>();
        return <span className={`badge badge-${value.toLowerCase()}`}>{value}</span>;
      }
    },
    {
      header: "Country",
      accessorKey: "countryCode"
    },
    {
      header: "Valid until",
      accessorKey: "validUntil",
      cell: (info) => formatDate(info.getValue<number>())
    },
    {
      header: "Last updated",
      accessorKey: "lastUpdated",
      cell: (info) => formatDate(info.getValue<number>(), true)
    },
    {
      header: "Updates",
      accessorKey: "updateCount"
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) => (
        <button className="btn btn-ghost" onClick={() => onUpdate(row.original)}>
          Update
        </button>
      )
    }
  ];

  const table = useReactTable({
    data: wallets,
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
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
  );
}

function shorten(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(timestamp: number, includeTime = false) {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {})
  });
}
