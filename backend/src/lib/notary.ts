import { config } from "../config";
import { getWalletStatus } from "./blockchain";
import { riskLevelFromNumber } from "./risk";
import type { NotaryStatus, RiskLevel } from "@trustsignal/shared/types/oracle";

export async function queryNotaryNode(wallet: string): Promise<NotaryStatus> {
  if (config.notaryNodeUrl) {
    try {
      return await fetchFromNotaryNode(wallet);
    } catch (error) {
      console.warn("Notary node fetch failed, falling back to on-chain status.", error);
    }
  }

  const onChainStatus = await getWalletStatus(wallet as `0x${string}`);

  if (onChainStatus.riskLevel === 0) {
    return { riskLevel: "UNKNOWN", validUntil: 0, countryCode: "" };
  }

  const riskLevel = riskLevelFromNumber(onChainStatus.riskLevel);

  return {
    riskLevel,
    validUntil: onChainStatus.validUntil,
    countryCode: onChainStatus.countryCode
  };
}

async function fetchFromNotaryNode(wallet: string): Promise<NotaryStatus> {
  const base = config.notaryNodeUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/status/${wallet}`);

  if (!res.ok) {
    throw new Error(`Notary node error: ${res.status}`);
  }

  const data = (await res.json()) as {
    riskLevel?: RiskLevel | number;
    validUntil?: number;
    countryCode?: string;
  };

  const riskLevel =
    typeof data.riskLevel === "number"
      ? riskLevelFromNumber(data.riskLevel)
      : data.riskLevel ?? "UNKNOWN";

  return {
    riskLevel,
    validUntil: Number(data.validUntil ?? 0),
    countryCode: data.countryCode ?? ""
  };
}
