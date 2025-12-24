import { Hono } from "hono";

import { oracleAbi } from "../../abi";
import { config } from "../../config";
import { publicClient, walletClient } from "../../lib/blockchain";
import { getWallets, insertAuditLog } from "../../lib/db";
import { riskLevelFromNumber, parseRiskLevelNumber } from "../../lib/risk";
import { parseStatusUpdate } from "../../domain/walletStatus";

const router = new Hono();

router.get("/", (c) => {
  const page = parseNumber(c.req.query("page"), 1);
  const limit = Math.min(parseNumber(c.req.query("limit"), 50), 100);
  const riskLevel = parseRiskLevelNumber(c.req.query("riskLevel"));
  const countryCode = c.req.query("countryCode")?.toUpperCase();
  const search = c.req.query("search");
  const expiringSoon = c.req.query("expiringSoon") === "true";
  const sortBy = c.req.query("sortBy");
  const sortOrder = c.req.query("sortOrder") === "asc" ? "asc" : "desc";

  const { wallets, total } = getWallets({
    page,
    limit,
    riskLevel: riskLevel === null ? undefined : riskLevel,
    countryCode,
    search,
    expiringSoon,
    sortBy,
    sortOrder
  });

  return c.json({
    wallets: wallets.map((wallet) => ({
      address: wallet.address,
      riskLevel: riskLevelFromNumber(wallet.risk_level),
      validUntil: wallet.valid_until,
      lastUpdated: wallet.last_updated,
      countryCode: wallet.country_code,
      firstSeen: wallet.first_seen,
      updateCount: wallet.update_count
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
});

router.post("/", async (c) => {
  if (!config.oracleAddress) {
    return c.json({ error: "ORACLE_NOT_CONFIGURED" }, 500);
  }

  const payload = await c.req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || !payload.address) {
    return c.json({ error: "INVALID_BODY" }, 400);
  }

  const parsed = parseStatusUpdate({
    address: payload.address,
    payload
  });
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }

  const hash = await walletClient.writeContract({
    address: config.oracleAddress,
    abi: oracleAbi,
    functionName: "setWalletStatus",
    args: [
      parsed.value.address,
      parsed.value.riskLevel,
      BigInt(parsed.value.validUntil),
      parsed.value.countryCodeBytes
    ]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  insertAuditLog({
    timestamp: Math.floor(Date.now() / 1000),
    action: "WALLET_STATUS_CREATED",
    actor: "admin",
    target_type: "wallet",
    target_id: parsed.value.address,
    old_value: null,
    new_value: JSON.stringify({
      riskLevel: riskLevelFromNumber(parsed.value.riskLevel),
      validUntil: parsed.value.validUntil,
      countryCode: parsed.value.countryCode
    }),
    tx_hash: hash,
    metadata: null
  });

  return c.json({
    success: true,
    transactionHash: hash,
    blockNumber: Number(receipt.blockNumber)
  });
});

router.post("/:address/status", async (c) => {
  if (!config.oracleAddress) {
    return c.json({ error: "ORACLE_NOT_CONFIGURED" }, 500);
  }

  const payload = await c.req.json().catch(() => null);
  const parsed = parseStatusUpdate({
    address: c.req.param("address"),
    payload
  });
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }

  // Get current status for audit log
  let oldStatus: string | null = null;
  try {
    const [riskLevel, validUntil, , countryCode] = await publicClient.readContract({
      address: config.oracleAddress,
      abi: oracleAbi,
      functionName: "getWalletStatus",
      args: [parsed.value.address]
    });
    if (Number(riskLevel) !== 0) {
      oldStatus = JSON.stringify({
        riskLevel: riskLevelFromNumber(Number(riskLevel)),
        validUntil: Number(validUntil),
        countryCode: countryCode
      });
    }
  } catch {
    // Wallet may not exist yet
  }

  const hash = await walletClient.writeContract({
    address: config.oracleAddress,
    abi: oracleAbi,
    functionName: "setWalletStatus",
    args: [
      parsed.value.address,
      parsed.value.riskLevel,
      BigInt(parsed.value.validUntil),
      parsed.value.countryCodeBytes
    ]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  insertAuditLog({
    timestamp: Math.floor(Date.now() / 1000),
    action: oldStatus ? "WALLET_STATUS_UPDATED" : "WALLET_STATUS_CREATED",
    actor: "admin",
    target_type: "wallet",
    target_id: parsed.value.address,
    old_value: oldStatus,
    new_value: JSON.stringify({
      riskLevel: riskLevelFromNumber(parsed.value.riskLevel),
      validUntil: parsed.value.validUntil,
      countryCode: parsed.value.countryCode
    }),
    tx_hash: hash,
    metadata: null
  });

  return c.json({
    success: true,
    transactionHash: hash,
    blockNumber: Number(receipt.blockNumber)
  });
});

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default router;
