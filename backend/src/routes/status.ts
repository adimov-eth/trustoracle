import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { getWalletStatus } from "../lib/blockchain";
import { queryNotaryNode } from "../lib/notary";
import { riskLevelFromNumber } from "../lib/risk";

const statusSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export const statusRoute = new Hono();

statusRoute.get("/:wallet", zValidator("param", statusSchema), async (c) => {
  const { wallet } = c.req.valid("param");

  const [onChainStatus, notaryStatus] = await Promise.all([
    getWalletStatus(wallet as `0x${string}`),
    queryNotaryNode(wallet)
  ]);

  const onChainRisk = riskLevelFromNumber(onChainStatus.riskLevel);

  return c.json({
    riskLevel: onChainRisk,
    validUntil: onChainStatus.validUntil,
    countryCode: onChainStatus.countryCode,
    onChainSynced: onChainRisk === notaryStatus.riskLevel
  });
});
