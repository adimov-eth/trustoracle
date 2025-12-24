import { Hono } from "hono";

import { config } from "../../config";
import { publicClient, walletClient } from "../../lib/blockchain";
import { signCompleteTransfer, signRejectTransfer } from "../../lib/signer";
import { validateTransfer } from "../../lib/compliance";
import {
  getAllTransfers,
  getPendingTransfer,
  updateTransferStatus,
  incrementProcessAttempts,
  insertAuditLog,
  type TransferStatus
} from "../../lib/db";

const router = new Hono();

const TOKEN_ABI = [
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

const TransferStatusEnum = {
  NONE: 0,
  PENDING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  REJECTED: 4
} as const;

function statusToString(status: number): TransferStatus {
  switch (status) {
    case TransferStatusEnum.COMPLETED: return "COMPLETED";
    case TransferStatusEnum.CANCELLED: return "CANCELLED";
    case TransferStatusEnum.REJECTED: return "REJECTED";
    default: return "PENDING";
  }
}

router.get("/", (c) => {
  const page = parseNumber(c.req.query("page"), 1);
  const limit = Math.min(parseNumber(c.req.query("limit"), 50), 100);
  const statusParam = c.req.query("status");

  const validStatuses: TransferStatus[] = ["PENDING", "COMPLETED", "REJECTED", "CANCELLED"];
  const status = statusParam && validStatuses.includes(statusParam as TransferStatus)
    ? (statusParam as TransferStatus)
    : undefined;

  const { transfers, total } = getAllTransfers({ page, limit, status });

  return c.json({
    transfers: transfers.map((t) => ({
      transferId: t.transfer_id,
      from: t.from_address,
      to: t.to_address,
      amount: t.amount,
      timestamp: t.timestamp,
      blockNumber: t.block_number,
      transactionHash: t.transaction_hash,
      status: t.status,
      processAttempts: t.process_attempts,
      lastAttempt: t.last_attempt,
      completionHash: t.completion_hash,
      rejectionReason: t.rejection_reason,
      createdAt: t.created_at
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
});

router.get("/:transferId", (c) => {
  const transferId = c.req.param("transferId");
  const transfer = getPendingTransfer(transferId);

  if (!transfer) {
    return c.json({ error: "TRANSFER_NOT_FOUND" }, 404);
  }

  return c.json({
    transferId: transfer.transfer_id,
    from: transfer.from_address,
    to: transfer.to_address,
    amount: transfer.amount,
    timestamp: transfer.timestamp,
    blockNumber: transfer.block_number,
    transactionHash: transfer.transaction_hash,
    status: transfer.status,
    processAttempts: transfer.process_attempts,
    lastAttempt: transfer.last_attempt,
    completionHash: transfer.completion_hash,
    rejectionReason: transfer.rejection_reason,
    createdAt: transfer.created_at
  });
});

router.post("/:transferId/retry", async (c) => {
  if (!config.tokenAddress) {
    return c.json({ error: "TOKEN_NOT_CONFIGURED" }, 500);
  }

  const transferId = c.req.param("transferId") as `0x${string}`;
  const transfer = getPendingTransfer(transferId);

  if (!transfer) {
    return c.json({ error: "TRANSFER_NOT_FOUND" }, 404);
  }

  if (transfer.status !== "PENDING") {
    return c.json({ error: "TRANSFER_NOT_PENDING", currentStatus: transfer.status }, 400);
  }

  // Check on-chain status first
  try {
    const [, , , , onChainStatus] = await publicClient.readContract({
      address: config.tokenAddress,
      abi: TOKEN_ABI,
      functionName: "getPendingTransfer",
      args: [transferId]
    });

    if (onChainStatus !== TransferStatusEnum.PENDING) {
      const newStatus = statusToString(onChainStatus);
      updateTransferStatus(transferId, newStatus);

      insertAuditLog({
        timestamp: Math.floor(Date.now() / 1000),
        action: "TRANSFER_STATUS_SYNCED",
        actor: "admin",
        target_type: "transfer",
        target_id: transferId,
        old_value: transfer.status,
        new_value: newStatus,
        tx_hash: null,
        metadata: JSON.stringify({ source: "manual_retry", onChainStatus })
      });

      return c.json({
        success: true,
        message: "Transfer already resolved on-chain",
        status: newStatus
      });
    }
  } catch (err) {
    return c.json({ error: "CHAIN_READ_ERROR", details: String(err) }, 500);
  }

  // Process the transfer
  incrementProcessAttempts(transferId);

  const from = transfer.from_address as `0x${string}`;
  const to = transfer.to_address as `0x${string}`;
  const amount = BigInt(transfer.amount);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + config.authExpirySeconds);

  try {
    const result = await validateTransfer(from, to, amount);

    if (result.approved) {
      const signature = await signCompleteTransfer(transferId, from, to, amount, deadline);
      const txHash = await walletClient.writeContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "completeTransfer",
        args: [transferId, deadline, signature]
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === "success") {
        updateTransferStatus(transferId, "COMPLETED", txHash);

        insertAuditLog({
          timestamp: Math.floor(Date.now() / 1000),
          action: "TRANSFER_COMPLETED",
          actor: "admin",
          target_type: "transfer",
          target_id: transferId,
          old_value: "PENDING",
          new_value: "COMPLETED",
          tx_hash: txHash,
          metadata: JSON.stringify({ source: "manual_retry" })
        });

        return c.json({
          success: true,
          status: "COMPLETED",
          transactionHash: txHash,
          blockNumber: Number(receipt.blockNumber)
        });
      } else {
        return c.json({ error: "TRANSACTION_REVERTED", transactionHash: txHash }, 500);
      }
    } else {
      const signature = await signRejectTransfer(transferId, from, to, amount, result.reason, deadline);
      const txHash = await walletClient.writeContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "rejectTransfer",
        args: [transferId, result.reason, deadline, signature]
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === "success") {
        updateTransferStatus(transferId, "REJECTED", txHash, result.reason);

        insertAuditLog({
          timestamp: Math.floor(Date.now() / 1000),
          action: "TRANSFER_REJECTED",
          actor: "admin",
          target_type: "transfer",
          target_id: transferId,
          old_value: "PENDING",
          new_value: "REJECTED",
          tx_hash: txHash,
          metadata: JSON.stringify({ source: "manual_retry", reason: result.reason })
        });

        return c.json({
          success: true,
          status: "REJECTED",
          reason: result.reason,
          transactionHash: txHash,
          blockNumber: Number(receipt.blockNumber)
        });
      } else {
        return c.json({ error: "TRANSACTION_REVERTED", transactionHash: txHash }, 500);
      }
    }
  } catch (err) {
    return c.json({ error: "PROCESS_ERROR", details: String(err) }, 500);
  }
});

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default router;
