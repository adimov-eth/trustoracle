import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.XDC_RPC_URL;
const chainId = Number(process.env.CHAIN_ID ?? 51);
const oracleAddress = process.env.ORACLE_ADDRESS as `0x${string}` | undefined;
const tokenAddress = process.env.TOKEN_ADDRESS as `0x${string}` | undefined;
const senderKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
const signerKey =
  (process.env.SIGNER_PRIVATE_KEY as `0x${string}` | undefined) ?? senderKey;
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3000";

if (!rpcUrl || !oracleAddress || !tokenAddress || !senderKey || !signerKey) {
  console.error(
    "Missing XDC_RPC_URL, ORACLE_ADDRESS, TOKEN_ADDRESS, DEPLOYER_PRIVATE_KEY, or SIGNER_PRIVATE_KEY in .env"
  );
  process.exit(1);
}

const chain = defineChain({
  id: chainId,
  name: "XDC",
  nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
});

const senderAccount = privateKeyToAccount(senderKey);
const signerAccount = privateKeyToAccount(signerKey);

const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl)
});

const senderClient = createWalletClient({
  chain,
  account: senderAccount,
  transport: http(rpcUrl)
});

const signerClient = createWalletClient({
  chain,
  account: signerAccount,
  transport: http(rpcUrl)
});

const receiver = resolveReceiver(senderAccount.address);
const amount = parseEther(process.env.TEST_AMOUNT ?? "15000");

const oracleAbi = [
  {
    type: "function",
    name: "authNonces",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "nonce", type: "uint256" }]
  },
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
] as const;

const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "transferWithAuth",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      {
        name: "auth",
        type: "tuple",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "expiry", type: "uint40" },
          { name: "signature", type: "bytes" }
        ]
      }
    ],
    outputs: [{ name: "success", type: "bool" }]
  }
] as const;

async function main() {
  await assertBackendReady();

  await setGreenStatuses();

  const beforeBalance = (await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [receiver]
  })) as bigint;

  const beforeNonce = (await publicClient.readContract({
    address: oracleAddress,
    abi: oracleAbi,
    functionName: "authNonces",
    args: [senderAccount.address]
  })) as bigint;

  const authorization = await requestAuthorization();

  const txHash = await senderClient.writeContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "transferWithAuth",
    args: [receiver, amount, [
      authorization.from,
      authorization.to,
      authorization.amount,
      authorization.nonce,
      authorization.expiry,
      authorization.signature
    ]]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const afterBalance = (await publicClient.readContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [receiver]
  })) as bigint;

  const afterNonce = (await publicClient.readContract({
    address: oracleAddress,
    abi: oracleAbi,
    functionName: "authNonces",
    args: [senderAccount.address]
  })) as bigint;

  console.log("Receiver:", receiver);
  console.log("Transfer hash:", receipt.transactionHash);
  console.log("Balance before:", beforeBalance.toString());
  console.log("Balance after:", afterBalance.toString());
  console.log("Nonce before:", beforeNonce.toString());
  console.log("Nonce after:", afterNonce.toString());

  if (afterBalance - beforeBalance !== amount) {
    throw new Error("Balance did not increase by expected amount");
  }
  if (afterNonce !== beforeNonce + 1n) {
    throw new Error("Nonce did not increment by 1");
  }
}

async function assertBackendReady() {
  const res = await fetch(`${backendUrl}/health`);
  if (!res.ok) {
    throw new Error(`Backend not ready: ${res.status}`);
  }
}

async function setGreenStatuses() {
  const now = Math.floor(Date.now() / 1000);
  const validUntil = BigInt(now + 30 * 24 * 60 * 60);

  const wallets = [senderAccount.address, receiver];
  const riskLevels = [1, 1];
  const validUntils = [validUntil, validUntil];
  const countryCodes = [toBytes2("US"), toBytes2("US")];

  const txHash = await signerClient.writeContract({
    address: oracleAddress,
    abi: oracleAbi,
    functionName: "setWalletStatusBatch",
    args: [wallets, riskLevels, validUntils, countryCodes]
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

async function requestAuthorization() {
  const res = await fetch(`${backendUrl}/api/v1/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: senderAccount.address,
      to: receiver,
      amount: amount.toString(),
      chainId
    })
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.reason || body.error || "Authorization failed");
  }

  return {
    from: body.authorization.from as `0x${string}`,
    to: body.authorization.to as `0x${string}`,
    amount: BigInt(body.authorization.amount),
    nonce: BigInt(body.authorization.nonce),
    expiry: Number(body.authorization.expiry),
    signature: body.authorization.signature as `0x${string}`
  };
}

function resolveReceiver(sender: `0x${string}`): `0x${string}` {
  const envReceiver = (process.env.TEST_RECEIVER || process.env.GREEN_WALLET) as
    | `0x${string}`
    | undefined;

  if (envReceiver && envReceiver.toLowerCase() !== sender.toLowerCase()) {
    return envReceiver;
  }

  const generated = privateKeyToAccount(generatePrivateKey()).address;
  if (generated.toLowerCase() === sender.toLowerCase()) {
    throw new Error("Generated receiver matches sender, set TEST_RECEIVER instead");
  }
  return generated;
}

function toBytes2(code: string): `0x${string}` {
  const hex = Buffer.from(code, "utf8").toString("hex");
  return `0x${hex.padEnd(4, "0")}` as `0x${string}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
