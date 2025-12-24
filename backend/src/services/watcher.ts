import { parseAbiItem, type Log } from "viem";
import { config } from "../config";
import { publicClient, walletClient } from "../lib/blockchain";
import { signCompleteTransfer, signRejectTransfer } from "../lib/signer";
import { validateTransfer } from "../lib/compliance";
import {
  insertPendingTransfer,
  isTransferProcessed,
  updateTransferStatus,
  incrementProcessAttempts,
  getStuckTransfers,
  getPendingTransfer
} from "../lib/db";

const TRANSFER_PENDING_EVENT = parseAbiItem(
  "event TransferPending(bytes32 indexed transferId, address indexed from, address indexed to, uint256 amount)"
);

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

// Transfer status enum from contract
const TransferStatusEnum = {
  NONE: 0,
  PENDING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  REJECTED: 4
} as const;

function statusToString(status: number): "PENDING" | "COMPLETED" | "CANCELLED" | "REJECTED" {
  switch (status) {
    case TransferStatusEnum.COMPLETED: return "COMPLETED";
    case TransferStatusEnum.CANCELLED: return "CANCELLED";
    case TransferStatusEnum.REJECTED: return "REJECTED";
    default: return "PENDING";
  }
}

let lastWatchedBlock = 0;

export function startWatcher(): void {
  if (!config.tokenAddress) {
    console.log("Watcher disabled: TOKEN_ADDRESS not configured.");
    return;
  }

  console.log(`Watcher started for ${config.tokenAddress}`);

  // Use getLogs polling instead of watchEvent for more reliability
  const pollForEvents = async () => {
    try {
      const currentBlock = await publicClient.getBlockNumber();

      if (lastWatchedBlock === 0) {
        // Start from 100 blocks ago on first run
        lastWatchedBlock = Number(currentBlock) - 100;
      }

      if (Number(currentBlock) <= lastWatchedBlock) {
        return;
      }

      const logs = await publicClient.getLogs({
        address: config.tokenAddress,
        event: TRANSFER_PENDING_EVENT,
        fromBlock: BigInt(lastWatchedBlock + 1),
        toBlock: currentBlock
      });

      for (const log of logs) {
        await processTransferPending(log as Log<bigint, number, false, typeof TRANSFER_PENDING_EVENT>);
      }

      lastWatchedBlock = Number(currentBlock);
    } catch (err) {
      console.error("Watcher poll error:", err);
    }
  };

  // Poll every 3 seconds
  setInterval(pollForEvents, 3000);
  void pollForEvents();

  // Start recovery loop for stuck transfers
  setInterval(recoverStuckTransfers, 60_000);

  // Run recovery immediately on startup
  void recoverStuckTransfers();
}

async function processTransferPending(
  log: Log<bigint, number, false, typeof TRANSFER_PENDING_EVENT>
): Promise<void> {
  const { transferId, from, to, amount } = log.args;

  if (!transferId || !from || !to || amount === undefined) {
    console.error("Missing event args", log.args);
    return;
  }

  // Check DB instead of in-memory Set
  if (isTransferProcessed(transferId)) {
    return;
  }

  console.log(`TransferPending: ${transferId.slice(0, 10)}... from ${from} to ${to} amount ${amount}`);

  // Insert to DB immediately to claim ownership
  insertPendingTransfer({
    transferId,
    fromAddress: from,
    toAddress: to,
    amount: amount.toString(),
    timestamp: Math.floor(Date.now() / 1000),
    blockNumber: Number(log.blockNumber ?? 0),
    transactionHash: log.transactionHash ?? ""
  });

  // Process the transfer
  await processTransfer(transferId, from, to, amount);
}

async function processTransfer(
  transferId: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint
): Promise<void> {
  incrementProcessAttempts(transferId);

  // Check on-chain status first
  try {
    const [, , , , onChainStatus] = await publicClient.readContract({
      address: config.tokenAddress,
      abi: TOKEN_ABI,
      functionName: "getPendingTransfer",
      args: [transferId]
    });

    if (onChainStatus !== TransferStatusEnum.PENDING) {
      console.log(`Transfer ${transferId.slice(0, 10)}... already resolved on-chain (status=${onChainStatus})`);
      updateTransferStatus(transferId, statusToString(onChainStatus));
      return;
    }
  } catch (err) {
    console.error(`Failed to check on-chain status for ${transferId.slice(0, 10)}`, err);
    return;
  }

  // Validate compliance
  const result = await validateTransfer(from, to, amount);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + config.authExpirySeconds);

  try {
    if (result.approved) {
      const signature = await signCompleteTransfer(transferId, from, to, amount, deadline);
      const txHash = await walletClient.writeContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "completeTransfer",
        args: [transferId, deadline, signature]
      });

      console.log(`Submitted completeTransfer for ${transferId.slice(0, 10)}... tx: ${txHash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === "success") {
        updateTransferStatus(transferId, "COMPLETED", txHash);
        console.log(`Completed transfer ${transferId.slice(0, 10)}... confirmed`);
      } else {
        console.error(`Transaction reverted for ${transferId.slice(0, 10)}...`);
        // Status remains PENDING, will be retried
      }
    } else {
      const signature = await signRejectTransfer(transferId, from, to, amount, result.reason, deadline);
      const txHash = await walletClient.writeContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "rejectTransfer",
        args: [transferId, result.reason, deadline, signature]
      });

      console.log(`Submitted rejectTransfer for ${transferId.slice(0, 10)}... reason: ${result.reason} tx: ${txHash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status === "success") {
        updateTransferStatus(transferId, "REJECTED", txHash, result.reason);
        console.log(`Rejected transfer ${transferId.slice(0, 10)}... confirmed`);
      } else {
        console.error(`Rejection transaction reverted for ${transferId.slice(0, 10)}...`);
      }
    }
  } catch (err) {
    console.error(`Failed to process transfer ${transferId.slice(0, 10)}...`, err);
    // Status remains PENDING in DB, recovery loop will retry
  }
}

async function recoverStuckTransfers(): Promise<void> {
  const stuckThresholdMs = 5 * 60 * 1000; // 5 minutes
  const maxAttempts = 10;

  const stuckTransfers = getStuckTransfers(stuckThresholdMs, maxAttempts);

  if (stuckTransfers.length > 0) {
    console.log(`Recovery: found ${stuckTransfers.length} stuck transfers`);
  }

  for (const transfer of stuckTransfers) {
    const transferId = transfer.transfer_id as `0x${string}`;

    // Check on-chain status - maybe it succeeded and we missed confirmation
    try {
      const [, , , , onChainStatus] = await publicClient.readContract({
        address: config.tokenAddress,
        abi: TOKEN_ABI,
        functionName: "getPendingTransfer",
        args: [transferId]
      });

      if (onChainStatus !== TransferStatusEnum.PENDING) {
        console.log(`Recovery: ${transferId.slice(0, 10)}... already resolved (status=${onChainStatus})`);
        updateTransferStatus(transferId, statusToString(onChainStatus));
        continue;
      }

      // Still pending, retry processing
      console.log(`Recovery: retrying ${transferId.slice(0, 10)}... (attempt ${transfer.process_attempts + 1})`);
      await processTransfer(
        transferId,
        transfer.from_address as `0x${string}`,
        transfer.to_address as `0x${string}`,
        BigInt(transfer.amount)
      );
    } catch (err) {
      console.error(`Recovery: failed to process ${transferId.slice(0, 10)}...`, err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
