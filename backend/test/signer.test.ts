import { expect, test, describe, beforeAll } from "bun:test";

function seedEnv() {
  process.env.SIGNER_PRIVATE_KEY =
    "0x59c6995e998f97a5a0044976fbd3a811cc3bff39b1b2f8d0ea2563f32f2a2e42";
  process.env.XDC_RPC_URL = "https://rpc.apothem.network";
  process.env.CHAIN_ID = "51";
  process.env.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000002";
  process.env.AUTH_EXPIRY_SECONDS = "60";
}

describe("EIP-712 Signer", () => {
  beforeAll(() => {
    seedEnv();
  });

  test("signCompleteTransfer produces valid signature format", async () => {
    const { signCompleteTransfer } = await import("../src/lib/signer");

    const transferId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
    const from = "0x0000000000000000000000000000000000000003" as `0x${string}`;
    const to = "0x0000000000000000000000000000000000000004" as `0x${string}`;
    const amount = 1000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const signature = await signCompleteTransfer(transferId, from, to, amount, deadline);

    // Signature should be 65 bytes hex (132 chars with 0x prefix)
    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  test("signRejectTransfer produces valid signature format", async () => {
    const { signRejectTransfer } = await import("../src/lib/signer");

    const transferId = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as `0x${string}`;
    const from = "0x0000000000000000000000000000000000000005" as `0x${string}`;
    const to = "0x0000000000000000000000000000000000000006" as `0x${string}`;
    const amount = 2000n;
    const reason = "RECIPIENT_STATUS_EXPIRED";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const signature = await signRejectTransfer(transferId, from, to, amount, reason, deadline);

    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
  });

  test("signatures are deterministic for same inputs", async () => {
    const { signCompleteTransfer } = await import("../src/lib/signer");

    const transferId = "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;
    const from = "0x0000000000000000000000000000000000000007" as `0x${string}`;
    const to = "0x0000000000000000000000000000000000000008" as `0x${string}`;
    const amount = 500n;
    const deadline = 1700000000n;

    const sig1 = await signCompleteTransfer(transferId, from, to, amount, deadline);
    const sig2 = await signCompleteTransfer(transferId, from, to, amount, deadline);

    expect(sig1).toBe(sig2);
  });

  test("different inputs produce different signatures", async () => {
    const { signCompleteTransfer } = await import("../src/lib/signer");

    const transferId = "0x2222222222222222222222222222222222222222222222222222222222222222" as `0x${string}`;
    const from = "0x0000000000000000000000000000000000000009" as `0x${string}`;
    const to = "0x000000000000000000000000000000000000000a" as `0x${string}`;
    const amount = 1000n;
    const deadline = 1700000000n;

    const sig1 = await signCompleteTransfer(transferId, from, to, amount, deadline);
    const sig2 = await signCompleteTransfer(transferId, from, to, amount + 1n, deadline); // Different amount

    expect(sig1).not.toBe(sig2);
  });

  test("complete and reject signatures differ for same transfer", async () => {
    const { signCompleteTransfer, signRejectTransfer } = await import("../src/lib/signer");

    const transferId = "0x3333333333333333333333333333333333333333333333333333333333333333" as `0x${string}`;
    const from = "0x000000000000000000000000000000000000000b" as `0x${string}`;
    const to = "0x000000000000000000000000000000000000000c" as `0x${string}`;
    const amount = 1500n;
    const deadline = 1700000000n;

    const completeSig = await signCompleteTransfer(transferId, from, to, amount, deadline);
    const rejectSig = await signRejectTransfer(transferId, from, to, amount, "SOME_REASON", deadline);

    // Different typehashes = different signatures
    expect(completeSig).not.toBe(rejectSig);
  });
});
