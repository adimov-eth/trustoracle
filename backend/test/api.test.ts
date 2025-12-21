import { expect, test } from "bun:test";
import { Hono } from "hono";

function seedEnv() {
  process.env.SIGNER_PRIVATE_KEY =
    "0x59c6995e998f97a5a0044976fbd3a811cc3bff39b1b2f8d0ea2563f32f2a2e42";
  process.env.XDC_RPC_URL = "https://rpc.apothem.network";
  process.env.CHAIN_ID = "51";
  process.env.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000002";
}

test("authorize rejects mismatched chainId", async () => {
  seedEnv();
  const { authorizeRoute } = await import("../src/routes/authorize");

  const app = new Hono();
  app.route("/api/v1/authorize", authorizeRoute);

  const res = await app.request("/api/v1/authorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      from: "0x0000000000000000000000000000000000000003",
      to: "0x0000000000000000000000000000000000000004",
      amount: "1",
      chainId: 1
    })
  });

  expect(res.status).toBe(400);
});

test("status and nonce routes reject invalid wallet params", async () => {
  seedEnv();
  const { statusRoute } = await import("../src/routes/status");
  const { nonceRoute } = await import("../src/routes/nonce");

  const app = new Hono();
  app.route("/api/v1/status", statusRoute);
  app.route("/api/v1/nonce", nonceRoute);

  const statusRes = await app.request("/api/v1/status/not-an-address");
  const nonceRes = await app.request("/api/v1/nonce/not-an-address");

  expect(statusRes.status).toBe(400);
  expect(nonceRes.status).toBe(400);
});
