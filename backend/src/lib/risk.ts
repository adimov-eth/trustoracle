export type RiskLevel = "UNKNOWN" | "GREEN" | "YELLOW" | "RED";

export function riskLevelFromNumber(level: number): RiskLevel {
  if (level === 1) return "GREEN";
  if (level === 2) return "YELLOW";
  if (level === 3) return "RED";
  return "UNKNOWN";
}

export function riskLevelToNumber(level: RiskLevel): number {
  if (level === "GREEN") return 1;
  if (level === "YELLOW") return 2;
  if (level === "RED") return 3;
  return 0;
}
