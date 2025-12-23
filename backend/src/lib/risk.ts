import type { RiskLevel, RiskLevelNumber } from "@trustsignal/shared/types/oracle";

export type { RiskLevel, RiskLevelNumber };

const riskLevelValues: RiskLevel[] = ["UNKNOWN", "GREEN", "YELLOW", "RED"];

export function riskLevelFromNumber(level: number): RiskLevel {
  if (level === 1) return "GREEN";
  if (level === 2) return "YELLOW";
  if (level === 3) return "RED";
  return "UNKNOWN";
}

export function riskLevelToNumber(level: RiskLevel): RiskLevelNumber {
  if (level === "GREEN") return 1;
  if (level === "YELLOW") return 2;
  if (level === "RED") return 3;
  return 0;
}

export function parseRiskLevelInput(value: unknown): RiskLevel | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value <= 3) {
      return riskLevelFromNumber(value);
    }
    return null;
  }

  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;

  if (normalized.length === 1 && normalized >= "0" && normalized <= "3") {
    return riskLevelFromNumber(Number(normalized));
  }

  if (riskLevelValues.includes(normalized as RiskLevel)) {
    return normalized as RiskLevel;
  }

  return null;
}

export function parseRiskLevelNumber(value: unknown): RiskLevelNumber | null {
  const parsed = parseRiskLevelInput(value);
  return parsed ? riskLevelToNumber(parsed) : null;
}
