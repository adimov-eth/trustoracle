import { expect, test, describe, beforeAll } from "bun:test";
import { Hono } from "hono";

function seedEnv() {
  process.env.SIGNER_PRIVATE_KEY =
    "0x59c6995e998f97a5a0044976fbd3a811cc3bff39b1b2f8d0ea2563f32f2a2e42";
  process.env.XDC_RPC_URL = "https://rpc.apothem.network";
  process.env.CHAIN_ID = "51";
  process.env.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000002";
}

describe("API Routes", () => {
  beforeAll(() => {
    seedEnv();
  });

  test("status route rejects invalid wallet address", async () => {
    const { statusRoute } = await import("../src/routes/status");

    const app = new Hono();
    app.route("/api/v1/status", statusRoute);

    const res = await app.request("/api/v1/status/not-an-address");
    expect(res.status).toBe(400);
  });

  test("status route accepts valid address format", async () => {
    const { statusRoute } = await import("../src/routes/status");

    const app = new Hono();
    app.route("/api/v1/status", statusRoute);

    // This will fail to get actual data but should pass validation
    const res = await app.request("/api/v1/status/0x0000000000000000000000000000000000000003");
    // Should not be 400 (validation error)
    expect(res.status).not.toBe(400);
  });

});
