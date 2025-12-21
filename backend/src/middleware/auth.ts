import type { Context, Next } from "hono";

import { config } from "../config";

export async function requireAdmin(c: Context, next: Next) {
  if (!config.adminApiKey) {
    return c.json({ error: "ADMIN_KEY_NOT_CONFIGURED" }, 503);
  }

  const apiKey = c.req.header("X-Admin-Key");
  if (!apiKey || apiKey !== config.adminApiKey) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  await next();
}
