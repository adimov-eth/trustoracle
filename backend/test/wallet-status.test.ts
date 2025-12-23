import { expect, test } from "bun:test";

import { parseStatusUpdate } from "../src/domain/walletStatus";

const address = "0x0000000000000000000000000000000000000001";

test("parseStatusUpdate normalizes and encodes values", () => {
  const result = parseStatusUpdate({
    address,
    payload: { riskLevel: 1, validUntil: 1700000000, countryCode: "us" }
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.value.address).toBe(address);
  expect(result.value.riskLevel).toBe(1);
  expect(result.value.validUntil).toBe(1700000000);
  expect(result.value.countryCode).toBe("US");
  expect(result.value.countryCodeBytes).toBe("0x5553");
});

test("parseStatusUpdate rejects invalid input", () => {
  const result = parseStatusUpdate({
    address: "not-an-address",
    payload: { riskLevel: "GREEN", validUntil: -1, countryCode: "USA" }
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;

  expect(result.error).toBe("INVALID_ADDRESS");
});
