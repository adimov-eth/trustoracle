// Shared Token ABI fragments for transfer operations
// Used by watcher and admin transfer routes

export const TOKEN_ABI = [
  {
    name: "completeTransfer",
    type: "function",
    inputs: [
      { name: "transferId", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    name: "rejectTransfer",
    type: "function",
    inputs: [
      { name: "transferId", type: "bytes32" },
      { name: "reason", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    name: "getPendingTransfer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "transferId", type: "bytes32" }],
    outputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "status", type: "uint8" }
    ]
  }
] as const;

// Transfer status enum from contract
export const TransferStatusEnum = {
  NONE: 0,
  PENDING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  REJECTED: 4
} as const;

export type TransferStatusString = "PENDING" | "COMPLETED" | "CANCELLED" | "REJECTED";

export function statusToString(status: number): TransferStatusString {
  switch (status) {
    case TransferStatusEnum.COMPLETED: return "COMPLETED";
    case TransferStatusEnum.CANCELLED: return "CANCELLED";
    case TransferStatusEnum.REJECTED: return "REJECTED";
    default: return "PENDING";
  }
}
