import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { config } from "../config";
import { oracleAbi } from "../abi";

const chain = defineChain({
  id: config.chainId,
  name: "XDC",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } }
});

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl)
});

export const walletClient = createWalletClient({
  chain,
  account: privateKeyToAccount(config.signerPrivateKey),
  transport: http(config.rpcUrl)
});

export type WalletStatus = {
  riskLevel: number;
  validUntil: number;
  lastUpdated: number;
  countryCode: string;
};

export type StatusUpdate = {
  wallet: `0x${string}`;
  riskLevel: number;
  validUntil: number;
  countryCode: string;
};

export async function getWalletStatus(wallet: `0x${string}`): Promise<WalletStatus> {
  const result = (await publicClient.readContract({
    address: config.oracleAddress,
    abi: oracleAbi,
    functionName: "walletStatus",
    args: [wallet]
  })) as readonly [number, bigint, bigint, `0x${string}`];

  const [riskLevel, validUntil, lastUpdated, countryCode] = result;

  return {
    riskLevel: Number(riskLevel),
    validUntil: Number(validUntil),
    lastUpdated: Number(lastUpdated),
    countryCode: bytes2ToString(countryCode)
  };
}

export async function getNonce(wallet: `0x${string}`): Promise<bigint> {
  const nonce = (await publicClient.readContract({
    address: config.oracleAddress,
    abi: oracleAbi,
    functionName: "authNonces",
    args: [wallet]
  })) as bigint;

  return nonce;
}

export async function batchUpdateStatuses(updates: StatusUpdate[]): Promise<`0x${string}`> {
  if (updates.length === 0) {
    throw new Error("No status updates provided");
  }

  const wallets = updates.map((update) => update.wallet);
  const riskLevels = updates.map((update) => update.riskLevel);
  const validUntils = updates.map((update) => BigInt(update.validUntil));
  const countryCodes = updates.map((update) => toBytes2(update.countryCode));

  return walletClient.writeContract({
    address: config.oracleAddress,
    abi: oracleAbi,
    functionName: "setWalletStatusBatch",
    args: [wallets, riskLevels, validUntils, countryCodes]
  });
}

function bytes2ToString(value: `0x${string}`): string {
  const hex = value.replace(/^0x/, "");
  if (!hex) return "";
  return Buffer.from(hex, "hex").toString("utf8").replace(/\u0000/g, "");
}

function toBytes2(code: string): `0x${string}` {
  const hex = Buffer.from(code, "utf8").toString("hex");
  return `0x${hex.padEnd(4, "0")}` as `0x${string}`;
}
