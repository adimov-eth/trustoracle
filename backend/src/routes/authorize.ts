import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { config } from "../config";
import { getNonce } from "../lib/blockchain";
import { queryNotaryNode } from "../lib/notary";
import { generateAuthorization } from "../lib/signer";

const authorizeSchema = z.object({
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+$/),
  chainId: z.number().int()
});

export const authorizeRoute = new Hono();

authorizeRoute.post("/", zValidator("json", authorizeSchema), async (c) => {
  const { from, to, amount, chainId } = c.req.valid("json");

  if (chainId !== config.chainId) {
    return c.json({ error: "INVALID_CHAIN_ID" }, 400);
  }

  const [senderStatus, receiverStatus] = await Promise.all([
    queryNotaryNode(from),
    queryNotaryNode(to)
  ]);

  if (senderStatus.riskLevel === "RED") {
    return c.json({ error: "TRANSFER_DENIED", reason: "SENDER_BLOCKED" }, 403);
  }
  if (receiverStatus.riskLevel === "RED") {
    return c.json({ error: "TRANSFER_DENIED", reason: "RECEIVER_BLOCKED" }, 403);
  }
  if (senderStatus.riskLevel === "UNKNOWN") {
    return c.json({ error: "TRANSFER_DENIED", reason: "SENDER_NOT_VERIFIED" }, 403);
  }
  if (receiverStatus.riskLevel === "UNKNOWN") {
    return c.json({ error: "TRANSFER_DENIED", reason: "RECEIVER_NOT_VERIFIED" }, 403);
  }

  const nonce = await getNonce(from as `0x${string}`);
  const authorization = await generateAuthorization(
    from as `0x${string}`,
    to as `0x${string}`,
    BigInt(amount),
    nonce
  );

  return c.json({
    authorization: {
      from: authorization.from,
      to: authorization.to,
      amount: authorization.amount.toString(),
      nonce: authorization.nonce.toString(),
      expiry: authorization.expiry,
      signature: authorization.signature
    }
  });
});
