import { config } from "../config";
import { batchUpdateStatuses } from "../lib/blockchain";
import { queryNotaryNode } from "../lib/notary";
import { riskLevelToNumber } from "../lib/risk";

export async function syncWalletStatuses(wallets: `0x${string}`[]): Promise<void> {
  if (wallets.length === 0) {
    return;
  }

  const updates = await Promise.all(
    wallets.map(async (wallet) => {
      const status = await queryNotaryNode(wallet);
      return {
        wallet,
        riskLevel: riskLevelToNumber(status.riskLevel),
        validUntil: status.validUntil,
        countryCode: status.countryCode
      };
    })
  );

  await batchUpdateStatuses(updates);
}

export function startSyncLoop(): void {
  if (!config.enableSync || config.syncWallets.length === 0) {
    return;
  }

  const wallets = config.syncWallets as `0x${string}`[];

  const run = async () => {
    try {
      await syncWalletStatuses(wallets);
    } catch (error) {
      console.error("Status sync failed", error);
    }
  };

  void run();
  setInterval(run, 5 * 60 * 1000);
}
