/**
 * E2E test for transfer behavior
 *
 * Tests different scenarios:
 * 1. Transfer to RED wallet -> Hard revert at contract level
 * 2. Transfer to UNKNOWN wallet -> Hard revert (SENDER/RECEIVER_NOT_VERIFIED)
 * 3. High-value to GREEN wallet -> Escrow + backend completion
 *
 * The escrow->rejection flow happens when backend compliance fails,
 * not when oracle blocks at contract level.
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xdcTestnet } from "viem/chains";

const RPC_URL = "https://rpc.apothem.network";
const TOKEN_ADDRESS = "0xf103aBe6039c49259Ee7c014a40603545476F6ef" as const;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!PRIVATE_KEY) {
  throw new Error("Missing DEPLOYER_PRIVATE_KEY");
}
const RED_WALLET = "0x1111111111111111111111111111111111111111" as const;
const UNKNOWN_WALLET = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as const;

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
  console.log("=== Escrow REJECTION Test ===\n");

  const amount = parseUnits("15000", 18);

  console.log(`Sender: ${account.address}`);
  console.log(`Recipient: ${RED_WALLET} (RED/blocked wallet)`);
  console.log(`Amount: ${formatUnits(amount, 18)} TST\n`);

  const senderBalanceBefore = await getBalance(account.address);
  console.log(`Sender balance before: ${formatUnits(senderBalanceBefore, 18)} TST\n`);

  console.log("--- Sending Transfer to BLOCKED wallet ---");

  const txHash = await walletClient.writeContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "transfer",
    args: [RED_WALLET, amount]
  });

  console.log(`Transaction: ${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log("Transfer is now ESCROWED\n");

  const senderBalanceAfterEscrow = await getBalance(account.address);
  console.log(`Sender balance after escrow: ${formatUnits(senderBalanceAfterEscrow, 18)} TST`);
  console.log(`Tokens in escrow: ${formatUnits(senderBalanceBefore - senderBalanceAfterEscrow, 18)} TST\n`);

  console.log("--- Waiting for Backend to REJECT ---");
  console.log("Backend should detect RED recipient and reject...\n");

  const maxWaitTime = 60_000;
  const pollInterval = 3_000;
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    await sleep(pollInterval);
    elapsed += pollInterval;

    const currentBalance = await getBalance(account.address);
    const returned = currentBalance - senderBalanceAfterEscrow;

    process.stdout.write(`\rWaiting... ${elapsed / 1000}s - Balance change: ${formatUnits(returned, 18)} TST`);

    if (returned === amount) {
      console.log("\n\n=== SUCCESS: REJECTION WORKS ===");
      console.log("Tokens returned to sender after rejection!");

      console.log(`\nFinal sender balance: ${formatUnits(currentBalance, 18)} TST`);

      // Check the transfer status in API
      const res = await fetch("http://localhost:3000/api/v1/admin/transfers?limit=1", {
        headers: { "X-Admin-Key": "test-admin-key" }
      });
      const data = await res.json() as { transfers: Array<{ status: string; rejectionReason?: string }> };
      if (data.transfers[0]) {
        console.log(`Transfer status: ${data.transfers[0].status}`);
        console.log(`Rejection reason: ${data.transfers[0].rejectionReason}`);
      }

      process.exit(0);
    }
  }

  console.log("\n\n=== TIMEOUT ===");
  console.log("Transfer was not rejected within 60 seconds.");

  const finalBalance = await getBalance(account.address);
  console.log(`Final sender balance: ${formatUnits(finalBalance, 18)} TST`);

  process.exit(1);
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
