import { Hono } from "hono";

import { requireAdmin } from "../../middleware/auth";
import { getLastSyncedBlock, getStatistics } from "../../lib/db";
import walletsRouter from "./wallets";

const admin = new Hono();

admin.use("/*", requireAdmin);

admin.get("/statistics", (c) => {
  const stats = getStatistics();
  return c.json({
    ...stats,
    lastSyncedBlock: getLastSyncedBlock()
  });
});

admin.route("/wallets", walletsRouter);

export default admin;
