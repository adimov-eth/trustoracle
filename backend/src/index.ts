import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { config } from "./config";
import { nonceRoute } from "./routes/nonce";
import { statusRoute } from "./routes/status";
import adminRouter from "./routes/admin";
import transfersRouter from "./routes/transfers";
import { initDatabase } from "./lib/db";
import { startSyncLoop } from "./services/sync";
import { startIndexer, getIndexerStatus } from "./services/indexer";
import { startWatcher } from "./services/watcher";
import { publicClient } from "./lib/blockchain";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

initDatabase();
void startIndexer();
startWatcher();

console.log("=== Backend started ===");

// Enhanced health check
app.get("/health", async (c) => {
  const checks = {
    database: true,
    rpc: false,
    indexer: getIndexerStatus()
  };

  try {
    const blockNumber = await publicClient.getBlockNumber();
    checks.rpc = true;

    const blocksBehind = checks.indexer.latestBlock > 0
      ? Number(blockNumber) - checks.indexer.latestBlock
      : -1;

    const status = checks.rpc && checks.database && blocksBehind < 100
      ? "ok"
      : blocksBehind >= 100
        ? "degraded"
        : "down";

    return c.json({
      status,
      checks: {
        database: checks.database,
        rpc: checks.rpc,
        currentBlock: Number(blockNumber),
        lastIndexedBlock: checks.indexer.latestBlock,
        blocksBehind,
        eventsIndexed: checks.indexer.eventsCount
      }
    });
  } catch (err) {
    return c.json({
      status: "down",
      checks: {
        database: checks.database,
        rpc: false,
        error: err instanceof Error ? err.message : "RPC connection failed"
      }
    }, 503);
  }
});

app.route("/api/v1/status", statusRoute);
app.route("/api/v1/nonce", nonceRoute);
app.route("/api/v1/admin", adminRouter);
app.route("/api/v1/transfers", transfersRouter);

startSyncLoop();

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down...");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default {
  port: config.port,
  fetch: app.fetch
};
