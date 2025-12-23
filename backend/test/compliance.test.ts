import { expect, test, describe, mock, beforeEach } from "bun:test";

// Mock the blockchain module
const mockGetWalletStatus = mock(() => Promise.resolve({
  riskLevel: 1, // GREEN
  validUntil: Math.floor(Date.now() / 1000) + 86400, // 1 day from now
  lastUpdated: Math.floor(Date.now() / 1000),
  countryCode: "0x5553" // US
}));

mock.module("../src/lib/blockchain", () => ({
  getWalletStatus: mockGetWalletStatus,
  publicClient: {},
  walletClient: {}
}));

// Seed environment before importing compliance
function seedEnv() {
  process.env.SIGNER_PRIVATE_KEY =
    "0x59c6995e998f97a5a0044976fbd3a811cc3bff39b1b2f8d0ea2563f32f2a2e42";
  process.env.XDC_RPC_URL = "https://rpc.apothem.network";
  process.env.CHAIN_ID = "51";
  process.env.ORACLE_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKEN_ADDRESS = "0x0000000000000000000000000000000000000002";
}

seedEnv();

describe("Compliance Validation", () => {
  const from = "0x0000000000000000000000000000000000000001" as `0x${string}`;
  const to = "0x0000000000000000000000000000000000000002" as `0x${string}`;
  const amount = 1000n;

  beforeEach(() => {
    mockGetWalletStatus.mockClear();
  });

  test("approves GREEN to GREEN transfer", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation(() => Promise.resolve({
      riskLevel: 1, // GREEN
      validUntil: Math.floor(Date.now() / 1000) + 86400,
      lastUpdated: Math.floor(Date.now() / 1000),
      countryCode: "0x5553"
    }));

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(true);
  });

  test("rejects RED sender", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === from) {
        return Promise.resolve({
          riskLevel: 3, // RED
          validUntil: Math.floor(Date.now() / 1000) + 86400,
          lastUpdated: Math.floor(Date.now() / 1000),
          countryCode: "0x5553"
        });
      }
      return Promise.resolve({
        riskLevel: 1, // GREEN
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("SENDER_BLOCKED");
    }
  });

  test("rejects RED recipient", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === to) {
        return Promise.resolve({
          riskLevel: 3, // RED
          validUntil: Math.floor(Date.now() / 1000) + 86400,
          lastUpdated: Math.floor(Date.now() / 1000),
          countryCode: "0x5553"
        });
      }
      return Promise.resolve({
        riskLevel: 1, // GREEN
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("RECIPIENT_BLOCKED");
    }
  });

  test("rejects expired sender status", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === from) {
        return Promise.resolve({
          riskLevel: 1, // GREEN
          validUntil: Math.floor(Date.now() / 1000) - 86400, // Expired yesterday
          lastUpdated: Math.floor(Date.now() / 1000) - 172800,
          countryCode: "0x5553"
        });
      }
      return Promise.resolve({
        riskLevel: 1,
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("SENDER_STATUS_EXPIRED");
    }
  });

  test("rejects expired recipient status", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === to) {
        return Promise.resolve({
          riskLevel: 1, // GREEN
          validUntil: Math.floor(Date.now() / 1000) - 86400, // Expired
          lastUpdated: Math.floor(Date.now() / 1000) - 172800,
          countryCode: "0x5553"
        });
      }
      return Promise.resolve({
        riskLevel: 1,
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("RECIPIENT_STATUS_EXPIRED");
    }
  });

  test("rejects UNKNOWN sender", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === from) {
        return Promise.resolve({
          riskLevel: 0, // UNKNOWN
          validUntil: Math.floor(Date.now() / 1000) + 86400,
          lastUpdated: Math.floor(Date.now() / 1000),
          countryCode: "0x0000"
        });
      }
      return Promise.resolve({
        riskLevel: 1,
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("SENDER_NOT_VERIFIED");
    }
  });

  test("rejects UNKNOWN recipient", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === to) {
        return Promise.resolve({
          riskLevel: 0, // UNKNOWN
          validUntil: Math.floor(Date.now() / 1000) + 86400,
          lastUpdated: Math.floor(Date.now() / 1000),
          countryCode: "0x0000"
        });
      }
      return Promise.resolve({
        riskLevel: 1,
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("RECIPIENT_NOT_VERIFIED");
    }
  });

  test("approves YELLOW to GREEN transfer", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === from) {
        return Promise.resolve({
          riskLevel: 2, // YELLOW
          validUntil: Math.floor(Date.now() / 1000) + 86400,
          lastUpdated: Math.floor(Date.now() / 1000),
          countryCode: "0x5553"
        });
      }
      return Promise.resolve({
        riskLevel: 1, // GREEN
        validUntil: Math.floor(Date.now() / 1000) + 86400,
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(true);
  });

  test("rejection priority: RED > expired > UNKNOWN", async () => {
    const { validateTransfer } = await import("../src/lib/compliance");

    // Both sender RED and recipient expired - should report SENDER_BLOCKED (RED wins)
    mockGetWalletStatus.mockImplementation((address: string) => {
      if (address === from) {
        return Promise.resolve({
          riskLevel: 3, // RED
          validUntil: Math.floor(Date.now() / 1000) - 86400, // Also expired
          lastUpdated: Math.floor(Date.now() / 1000),
          countryCode: "0x5553"
        });
      }
      return Promise.resolve({
        riskLevel: 1,
        validUntil: Math.floor(Date.now() / 1000) - 86400, // Expired
        lastUpdated: Math.floor(Date.now() / 1000),
        countryCode: "0x5553"
      });
    });

    const result = await validateTransfer(from, to, amount);
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reason).toBe("SENDER_BLOCKED");
    }
  });
});
