import { getWalletStatus } from "./blockchain";
import { riskLevelFromNumber } from "./risk";

export type ComplianceResult =
  | { approved: true }
  | { approved: false; reason: string };

export async function validateTransfer(
  from: `0x${string}`,
  to: `0x${string}`,
  _amount: bigint
): Promise<ComplianceResult> {
  const [fromStatus, toStatus] = await Promise.all([
    getWalletStatus(from),
    getWalletStatus(to)
  ]);

  const fromRisk = riskLevelFromNumber(fromStatus.riskLevel);
  const toRisk = riskLevelFromNumber(toStatus.riskLevel);

  // Blocked wallets
  if (fromRisk === "RED") return { approved: false, reason: "SENDER_BLOCKED" };
  if (toRisk === "RED") return { approved: false, reason: "RECIPIENT_BLOCKED" };

  // Expired status
  const now = Math.floor(Date.now() / 1000);
  if (fromStatus.validUntil < now) return { approved: false, reason: "SENDER_STATUS_EXPIRED" };
  if (toStatus.validUntil < now) return { approved: false, reason: "RECIPIENT_STATUS_EXPIRED" };

  // Unknown wallets need KYC
  if (fromRisk === "UNKNOWN") return { approved: false, reason: "SENDER_NOT_VERIFIED" };
  if (toRisk === "UNKNOWN") return { approved: false, reason: "RECIPIENT_NOT_VERIFIED" };

  return { approved: true };
}
