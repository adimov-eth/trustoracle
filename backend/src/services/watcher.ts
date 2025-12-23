import { parseAbiItem, type Log } from "viem";
import { config } from "../config";
import { publicClient, walletClient } from "../lib/blockchain";
import { signCompleteTransfer, signRejectTransfer } from "../lib/signer";
import { validateTransfer } from "../lib/compliance";

const TRANSFER_PENDING_EVENT = parseAbiItem(
  "event TransferPending(bytes32 indexed transferId, address indexed from, address indexed to, uint256 amount)"
);

const processedTransfers = new Set<string>();

const TOKEN_ABI = [
  {
    name: "completeTransfer",
    type: "function",
    inputs: [
      { name: "transferId", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    name: "rejectTransfer",
    type: "function",
    inputs: [
      { name: "transferId", type: "bytes32" },
      { name: "reason", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    name: "getPendingTransfer",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "transferId", type: "bytes32" }],
    outputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "status", type: "uint8" }
    ]
  }
] as const;

export function startWatcher(): void {
  if (!config.tokenAddress) {
    console.log("Watcher disabled: TOKEN_ADDRESS not configured.");
    return;
  }

  console.log(`Watcher started for ${config.tokenAddress}`);

  publicClient.watchEvent({
    address: config.tokenAddress,
    event: TRANSFER_PENDING_EVENT,
    poll: true,
    pollingInterval: 3000,
    onLogs: async (logs) => {
      for (const log of logs) {
        await processTransferPending(log as Log<bigint, number, false, typeof TRANSFER_PENDING_EVENT>);
      }
    }
  });
}

async function processTransferPending(
  log: Log<bigint, number, false, typeof TRANSFER_PENDING_EVENT>
): Promise<void> {
  const { transferId, from, to, amount } = log.args;

  if (!transferId || !from || !to || amount === undefined) {
    console.error("Missing event args", log.args);
    return;
  }

  // Deduplicate
  if (processedTransfers.has(transferId)) {
    return;
  }
  processedTransfers.add(transferId);

  console.log(`TransferPending: ${transferId.slice(0, 10)}... from ${from} to ${to} amount ${amount}`);

  // Check if still pending
  const [, , , , status] = await publicClient.readContract({
    address: config.tokenAddress,
    abi: TOKEN_ABI,
    functionName: "getPendingTransfer",
    args: [transferId]
  });

  if (status !== 1) {
    console.log(`Transfer ${transferId.slice(0, 10)}... no longer pending (status=${status})`);
    return;
  }

  // Validate compliance
  const result = await validateTransfer(from, to, amount);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + config.authExpirySeconds);

  await executeWithRetry(async () => {
    if (result.approved) {
      const signature = await signCompleteTransfer(transferId, from, to, amount, deadline);
      const txHash = await walletClient.writeContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "completeTransfer",
        args: [transferId, deadline, signature]
      });
      console.log(`Completed transfer ${transferId.slice(0, 10)}... tx: ${txHash}`);
    } else {
      const signature = await signRejectTransfer(transferId, from, to, amount, result.reason, deadline);
      const txHash = await walletClient.writeContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "rejectTransfer",
        args: [transferId, result.reason, deadline, signature]
      });
      console.log(`Rejected transfer ${transferId.slice(0, 10)}... reason: ${result.reason} tx: ${txHash}`);
    }
  }, `process transfer ${transferId.slice(0, 10)}`);
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  description: string,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Failed to ${description} after ${maxRetries} attempts`, err);
        return undefined;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`Retrying ${description} in ${delay}ms (attempt ${attempt}/${maxRetries})`);
      await sleep(delay);
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
