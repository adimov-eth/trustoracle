import { Hono } from "hono";

import { oracleAbi } from "../../abi";
import { config } from "../../config";
import { publicClient, walletClient } from "../../lib/blockchain";
import { getWallets } from "../../lib/db";
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
