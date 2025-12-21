import "dotenv/config";
import { createWalletClient, http } from "viem";
import { defineChain } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.XDC_RPC_URL;
const privateKey = process.env.SIGNER_PRIVATE_KEY;
const oracleAddress = process.env.ORACLE_ADDRESS as `0x${string}` | undefined;
const greenWallet = process.env.GREEN_WALLET as `0x${string}` | undefined;
const yellowWallet = process.env.YELLOW_WALLET as `0x${string}` | undefined;
const redWallet = process.env.RED_WALLET as `0x${string}` | undefined;

if (!rpcUrl || !privateKey || !oracleAddress || !greenWallet || !yellowWallet || !redWallet) {
  console.error(
    "Missing XDC_RPC_URL, SIGNER_PRIVATE_KEY, ORACLE_ADDRESS, GREEN_WALLET, YELLOW_WALLET, or RED_WALLET in .env"
  );
  process.exit(1);
}

const chainId = Number(process.env.CHAIN_ID || 51);
const chain = defineChain({
  id: chainId,
  name: "XDC",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});

const account = privateKeyToAccount(privateKey as `0x${string}`);
const client = createWalletClient({
  account,
  chain,
  transport: http(rpcUrl)
});

const abi = [
  {
    type: "function",
    name: "setWalletStatusBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallets", type: "address[]" },
      { name: "riskLevels", type: "uint8[]" },
      { name: "validUntils", type: "uint40[]" },
      { name: "countryCodes", type: "bytes2[]" }
    ],
    outputs: []
  }
];

const now = Math.floor(Date.now() / 1000);
const validUntil = BigInt(now + 30 * 24 * 60 * 60);

const wallets = [greenWallet, yellowWallet, redWallet];
const riskLevels = [1, 2, 3];
const validUntils = [validUntil, validUntil, validUntil];
const countryCodes = [toBytes2("US"), toBytes2("US"), toBytes2("US")];

const hash = await client.writeContract({
  address: oracleAddress,
  abi,
  functionName: "setWalletStatusBatch",
  args: [wallets, riskLevels, validUntils, countryCodes]
});

console.log("Submitted tx:", hash);

function toBytes2(code: string): `0x${string}` {
  const hex = Buffer.from(code, "utf8").toString("hex");
  return `0x${hex.padEnd(4, "0")}` as `0x${string}`;
}
