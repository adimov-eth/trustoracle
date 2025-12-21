import { expect, test } from "bun:test";

function seedEnv() {
  process.env.SIGNER_PRIVATE_KEY =
    "0x59c6995e998f97a5a0044976fbd3a811cc3bff39b1b2f8d0ea2563f32f2a2e42";
  process.env.XDC_RPC_URL = "https://rpc.apothem.network";
  process.env.CHAIN_ID = "51";
  process.env.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000002";
  process.env.AUTH_EXPIRY_SECONDS = "60";
}

test("generateAuthorization produces a signature and future expiry", async () => {
  seedEnv();
  const { generateAuthorization } = await import("../src/lib/signer");

  const auth = await generateAuthorization(
    "0x0000000000000000000000000000000000000003",
    "0x0000000000000000000000000000000000000004",
    123n,
    0n
  );

  expect(auth.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  expect(auth.expiry).toBeGreaterThan(Math.floor(Date.now() / 1000));
});
