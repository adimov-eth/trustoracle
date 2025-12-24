import { Hono } from "hono";
import { isAddress } from "viem";
import { getPendingTransfersByAddress, getPendingTransfer } from "../lib/db";

const router = new Hono();

// Get transfers for an address (both sent and received)
router.get("/:address", (c) => {
  const address = c.req.param("address");

  if (!isAddress(address)) {
    return c.json({ error: "INVALID_ADDRESS" }, 400);
  }

  const transfers = getPendingTransfersByAddress(address);

  // Transform to API format
  const formatted = transfers.map((t) => ({
    transferId: t.transfer_id,
    from: t.from_address,
    to: t.to_address,
    amount: t.amount,
    timestamp: t.timestamp,
    status: t.status,
    rejectionReason: t.rejection_reason,
    completionHash: t.completion_hash
  }));

  return c.json({ transfers: formatted });
});

// Get specific transfer by ID
router.get("/id/:transferId", (c) => {
  const transferId = c.req.param("transferId");

  if (!transferId.startsWith("0x") || transferId.length !== 66) {
    return c.json({ error: "INVALID_TRANSFER_ID" }, 400);
  }

  const transfer = getPendingTransfer(transferId);

  if (!transfer) {
    return c.json({ error: "NOT_FOUND" }, 404);
  }

  return c.json({
    transfer: {
      transferId: transfer.transfer_id,
      from: transfer.from_address,
      to: transfer.to_address,
      amount: transfer.amount,
      timestamp: transfer.timestamp,
      status: transfer.status,
      rejectionReason: transfer.rejection_reason,
      completionHash: transfer.completion_hash
    }
  });
});

export default router;
