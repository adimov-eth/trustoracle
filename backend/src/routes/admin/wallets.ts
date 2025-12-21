import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { isAddress } from "viem";

import { oracleAbi } from "../../abi";
import { config } from "../../config";
import { publicClient, walletClient } from "../../lib/blockchain";
import { getWallets } from "../../lib/db";
import { riskLevelFromNumber } from "../../lib/risk";

const updateSchema = z.object({
  riskLevel: z.union([z.string(), z.number()]),
  validUntil: z.number().int().nonnegative(),
  countryCode: z.string().length(2)
});

const router = new Hono();

router.get("/", (c) => {
  const page = parseNumber(c.req.query("page"), 1);
  const limit = Math.min(parseNumber(c.req.query("limit"), 50), 100);
  const riskLevel = parseRiskLevel(c.req.query("riskLevel"));
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

router.post("/:address/status", zValidator("json", updateSchema), async (c) => {
  if (!config.oracleAddress) {
    return c.json({ error: "ORACLE_NOT_CONFIGURED" }, 500);
  }

  const address = c.req.param("address");
  if (!isAddress(address)) {
    return c.json({ error: "INVALID_ADDRESS" }, 400);
  }

  const payload = c.req.valid("json");
  const riskLevel = parseRiskLevel(String(payload.riskLevel));
  if (riskLevel === null) {
    return c.json({ error: "INVALID_RISK_LEVEL" }, 400);
  }

  const validUntil = payload.validUntil;
  const countryCode = payload.countryCode.toUpperCase();

  const hash = await walletClient.writeContract({
    address: config.oracleAddress,
    abi: oracleAbi,
    functionName: "setWalletStatus",
    args: [address, riskLevel, BigInt(validUntil), toBytes2(countryCode)]
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

function parseRiskLevel(value?: string): number | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();

  if (["0", "1", "2", "3"].includes(normalized)) {
    return Number(normalized);
  }

  if (normalized === "UNKNOWN") return 0;
  if (normalized === "GREEN") return 1;
  if (normalized === "YELLOW") return 2;
  if (normalized === "RED") return 3;

  return null;
}

function toBytes2(code: string): `0x${string}` {
  const hex = Buffer.from(code, "utf8").toString("hex");
  return `0x${hex.padEnd(4, "0")}` as `0x${string}`;
}

export default router;
