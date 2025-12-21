import { expect, test } from "bun:test";

function seedEnv() {
  process.env.SIGNER_PRIVATE_KEY =
    "0x59c6995e998f97a5a0044976fbd3a811cc3bff39b1b2f8d0ea2563f32f2a2e42";
  process.env.XDC_RPC_URL = "https://rpc.apothem.network";
  process.env.CHAIN_ID = "51";
  process.env.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000002";
}

test("hashAuthorization is deterministic and sensitive to inputs", async () => {
  seedEnv();
  const { hashAuthorization } = await import("../src/lib/signer");

  const baseHash = hashAuthorization(
    "0x0000000000000000000000000000000000000003",
    "0x0000000000000000000000000000000000000004",
    10n,
    0n,
    1700000000
  );

  const sameHash = hashAuthorization(
    "0x0000000000000000000000000000000000000003",
    "0x0000000000000000000000000000000000000004",
    10n,
    0n,
    1700000000
  );

  const differentHash = hashAuthorization(
    "0x0000000000000000000000000000000000000003",
    "0x0000000000000000000000000000000000000004",
    11n,
    0n,
    1700000000
  );

  expect(baseHash).toBe(sameHash);
  expect(baseHash).not.toBe(differentHash);
});
