import { Hono } from "hono";

import { getAuditLog } from "../../lib/db";

const router = new Hono();

router.get("/", (c) => {
  const targetType = c.req.query("targetType");
  const targetId = c.req.query("targetId");
  const limit = parseNumber(c.req.query("limit"), 100);

  const entries = getAuditLog({
    targetType,
    targetId,
    limit: Math.min(limit, 500)
  });

  return c.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      actor: entry.actor,
      targetType: entry.target_type,
      targetId: entry.target_id,
      oldValue: entry.old_value,
      newValue: entry.new_value,
      txHash: entry.tx_hash,
      metadata: entry.metadata ? JSON.parse(entry.metadata) : null
    })),
    count: entries.length
  });
});

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default router;
