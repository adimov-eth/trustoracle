import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { getNonce } from "../lib/blockchain";

const nonceSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export const nonceRoute = new Hono();

nonceRoute.get("/:wallet", zValidator("param", nonceSchema), async (c) => {
  const { wallet } = c.req.valid("param");
  const nonce = await getNonce(wallet as `0x${string}`);
  return c.json({ nonce: nonce.toString() });
});
