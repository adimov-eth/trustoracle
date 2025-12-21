import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { config } from "./config";
import { authorizeRoute } from "./routes/authorize";
import { nonceRoute } from "./routes/nonce";
import { statusRoute } from "./routes/status";
import { startSyncLoop } from "./services/sync";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/v1/authorize", authorizeRoute);
app.route("/api/v1/status", statusRoute);
app.route("/api/v1/nonce", nonceRoute);

startSyncLoop();

export default {
  port: config.port,
  fetch: app.fetch
};
