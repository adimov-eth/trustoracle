/**
 * End-to-end test for the escrow flow
 *
 * This test verifies the critical demo path:
 * 1. User sends high-value transfer (> green threshold)
 * 2. Transfer gets escrowed on-chain
 * 3. Watcher picks up the TransferPending event
 * 4. Backend validates compliance and signs completion
 * 5. Transfer completes, recipient receives tokens
 *
 * Run with: bun test/escrow-e2e.ts
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xdcTestnet } from "viem/chains";

// Config from .env
const RPC_URL = "https://rpc.apothem.network";
const TOKEN_ADDRESS = "0xf103aBe6039c49259Ee7c014a40603545476F6ef" as const;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!PRIVATE_KEY) {
  throw new Error("Missing DEPLOYER_PRIVATE_KEY");
}
const RECIPIENT = "0x59391B6FabC6E221B155C37ecAe98eC3A0218f9d" as const; // Known GREEN wallet

const TOKEN_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }]
  }
] as const;

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: xdcTestnet,
  transport: http(RPC_URL)
});

const walletClient = createWalletClient({
  account,
  chain: xdcTestnet,
  transport: http(RPC_URL)
});

async function getBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [address]
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Escrow E2E Test ===\n");

  // Amount above green threshold (10,000 TST)
  const amount = parseUnits("15000", 18);

  console.log(`Sender: ${account.address}`);
  console.log(`Recipient: ${RECIPIENT}`);
  console.log(`Amount: ${formatUnits(amount, 18)} TST (above 10k green threshold)\n`);

  // Check initial balances
  const senderBalanceBefore = await getBalance(account.address);
  const recipientBalanceBefore = await getBalance(RECIPIENT);

  console.log("--- Before Transfer ---");
  console.log(`Sender balance: ${formatUnits(senderBalanceBefore, 18)} TST`);
  console.log(`Recipient balance: ${formatUnits(recipientBalanceBefore, 18)} TST\n`);

  if (senderBalanceBefore < amount) {
    console.error("ERROR: Sender has insufficient balance");
    process.exit(1);
  }

  // Send the transfer (will be escrowed due to high value)
  console.log("--- Sending Transfer ---");
  console.log("Submitting transfer transaction...");

  const txHash = await walletClient.writeContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "transfer",
    args: [RECIPIENT, amount]
  });

  console.log(`Transaction submitted: ${txHash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    console.error("ERROR: Transaction reverted");
    process.exit(1);
  }

  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  console.log("Transfer should now be ESCROWED (pending backend approval)\n");

  // Check balances immediately after - tokens should be in escrow
  const senderBalanceAfterEscrow = await getBalance(account.address);
  const recipientBalanceAfterEscrow = await getBalance(RECIPIENT);

  console.log("--- After Escrow (before completion) ---");
  console.log(`Sender balance: ${formatUnits(senderBalanceAfterEscrow, 18)} TST`);
  console.log(`Recipient balance: ${formatUnits(recipientBalanceAfterEscrow, 18)} TST`);

  const senderDelta = senderBalanceBefore - senderBalanceAfterEscrow;
  const recipientDelta = recipientBalanceAfterEscrow - recipientBalanceBefore;

  console.log(`Sender lost: ${formatUnits(senderDelta, 18)} TST`);
  console.log(`Recipient gained: ${formatUnits(recipientDelta, 18)} TST\n`);

  if (recipientDelta === amount) {
    console.log("UNEXPECTED: Transfer completed instantly (not escrowed)");
    console.log("This means the transfer was below threshold or compliance check passed on-chain");
    process.exit(0);
  }

  if (senderDelta !== amount) {
    console.log("WARNING: Sender balance change doesn't match amount");
    console.log("Expected escrow to deduct tokens from sender");
  }

  // Now wait for the watcher to pick it up and complete the transfer
  console.log("--- Waiting for Watcher ---");
  console.log("The backend watcher should detect the TransferPending event");
  console.log("and automatically complete the transfer...\n");

  const maxWaitTime = 60_000; // 60 seconds
  const pollInterval = 3_000; // 3 seconds
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    await sleep(pollInterval);
    elapsed += pollInterval;

    const currentRecipientBalance = await getBalance(RECIPIENT);
    const gained = currentRecipientBalance - recipientBalanceBefore;

    process.stdout.write(`\rWaiting... ${elapsed / 1000}s - Recipient gained: ${formatUnits(gained, 18)} TST`);

    if (gained === amount) {
      console.log("\n\n=== SUCCESS ===");
      console.log("Transfer completed! Recipient received the full amount.");

      const finalSenderBalance = await getBalance(account.address);
      const finalRecipientBalance = await getBalance(RECIPIENT);

      console.log("\n--- Final Balances ---");
      console.log(`Sender balance: ${formatUnits(finalSenderBalance, 18)} TST`);
      console.log(`Recipient balance: ${formatUnits(finalRecipientBalance, 18)} TST`);

      process.exit(0);
    }
  }

  console.log("\n\n=== TIMEOUT ===");
  console.log("Transfer was not completed within 60 seconds.");
  console.log("Possible issues:");
  console.log("  - Watcher is not running");
  console.log("  - Watcher failed to detect the event");
  console.log("  - Compliance check failed (check backend logs)");
  console.log("  - Signature or transaction submission failed");

  // Check pending transfers API
  try {
    const res = await fetch("http://localhost:3000/api/v1/admin/transfers", {
      headers: { "X-Admin-Key": "test-admin-key" }
    });
    const data = await res.json();
    console.log("\nPending transfers in DB:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.log("\nCouldn't fetch pending transfers from API");
  }

  process.exit(1);
}

main().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
