import { isAddress } from "viem";

import { parseRiskLevelInput, riskLevelToNumber, type RiskLevelNumber } from "../lib/risk";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type StatusUpdate = {
  address: `0x${string}`;
  riskLevel: RiskLevelNumber;
  validUntil: number;
  countryCode: string;
  countryCodeBytes: `0x${string}`;
};

export function parseStatusUpdate(input: {
  address: string;
  payload: unknown;
}): Result<StatusUpdate> {
  const address = parseAddress(input.address);
  if (!address.ok) return address;

  const payload = parsePayload(input.payload);
  if (!payload.ok) return payload;

  const riskLevel = parseRiskLevel(payload.value.riskLevel);
  if (!riskLevel.ok) return riskLevel;

  const validUntil = parseValidUntil(payload.value.validUntil);
  if (!validUntil.ok) return validUntil;

  const countryCode = parseCountryCode(payload.value.countryCode);
  if (!countryCode.ok) return countryCode;

  return ok({
    address: address.value,
    riskLevel: riskLevel.value,
    validUntil: validUntil.value,
    countryCode: countryCode.value,
    countryCodeBytes: toBytes2(countryCode.value)
  });
}

function parseAddress(value: string): Result<`0x${string}`> {
  if (!isAddress(value)) {
    return err("INVALID_ADDRESS");
  }
  return ok(value as `0x${string}`);
}

function parsePayload(
  value: unknown
): Result<{ riskLevel: unknown; validUntil: unknown; countryCode: unknown }> {
  if (!value || typeof value !== "object") {
    return err("INVALID_BODY");
  }

  const record = value as Record<string, unknown>;
  return ok({
    riskLevel: record.riskLevel,
    validUntil: record.validUntil,
    countryCode: record.countryCode
  });
}

function parseRiskLevel(value: unknown): Result<RiskLevelNumber> {
  const parsed = parseRiskLevelInput(value);
  if (!parsed) {
    return err("INVALID_RISK_LEVEL");
  }
  return ok(riskLevelToNumber(parsed));
}

function parseValidUntil(value: unknown): Result<number> {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return err("INVALID_VALID_UNTIL");
  }
  if (!Number.isInteger(numeric) || numeric < 0) {
    return err("INVALID_VALID_UNTIL");
  }
  return ok(numeric);
}

function parseCountryCode(value: unknown): Result<string> {
  if (typeof value !== "string") {
    return err("INVALID_COUNTRY_CODE");
  }

  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return err("INVALID_COUNTRY_CODE");
  }

  return ok(normalized);
}

function toBytes2(code: string): `0x${string}` {
  const hex = Buffer.from(code, "utf8").toString("hex");
  return `0x${hex.padEnd(4, "0")}` as `0x${string}`;
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err<T>(error: string): Result<T> {
  return { ok: false, error };
}
