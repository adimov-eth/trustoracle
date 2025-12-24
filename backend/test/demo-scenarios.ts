/**
 * Demo Scenarios for Investor Presentation
 *
 * Shows all three transfer behaviors:
 * 1. INSTANT: Low-value transfer between GREEN wallets
 * 2. ESCROWED: High-value transfer between GREEN wallets
 * 3. BLOCKED: Transfer to RED/UNKNOWN wallet
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xdcTestnet } from "viem/chains";

const RPC_URL = "https://rpc.apothem.network";
const TOKEN_ADDRESS = "0xf103aBe6039c49259Ee7c014a40603545476F6ef" as const;
const PRIVATE_KEY = "<REDACTED_PRIVATE_KEY>" as const;
const GREEN_RECIPIENT = "0x59391B6FabC6E221B155C37ecAe98eC3A0218f9d" as const;
const RED_WALLET = "0x1111111111111111111111111111111111111111" as const;

const TOKEN_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
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
const publicClient = createPublicClient({ chain: xdcTestnet, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: xdcTestnet, transport: http(RPC_URL) });

async function getBalance(address: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [address]
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scenario1_InstantTransfer() {
  console.log("\n" + "=".repeat(60));
  console.log("SCENARIO 1: INSTANT TRANSFER (low-value, GREEN to GREEN)");
  console.log("=".repeat(60));

  const amount = parseUnits("500", 18); // Under 10k threshold
  const recipientBefore = await getBalance(GREEN_RECIPIENT);

  console.log(`\nSending ${formatUnits(amount, 18)} TST (under 10k threshold)...`);

  const txHash = await walletClient.writeContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "transfer",
    args: [GREEN_RECIPIENT, amount]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const recipientAfter = await getBalance(GREEN_RECIPIENT);
  const gained = recipientAfter - recipientBefore;

  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  console.log(`Recipient gained: ${formatUnits(gained, 18)} TST`);

  if (gained === amount) {
    console.log("\n✅ SUCCESS: Transfer completed INSTANTLY (no escrow)");
  } else {
    console.log("\n❌ UNEXPECTED: Transfer didn't complete instantly");
  }
}

async function scenario2_EscrowedTransfer() {
  console.log("\n" + "=".repeat(60));
  console.log("SCENARIO 2: ESCROWED TRANSFER (high-value, GREEN to GREEN)");
  console.log("=".repeat(60));

  const amount = parseUnits("15000", 18); // Over 10k threshold
  const recipientBefore = await getBalance(GREEN_RECIPIENT);

  console.log(`\nSending ${formatUnits(amount, 18)} TST (over 10k threshold)...`);

  const txHash = await walletClient.writeContract({
    address: TOKEN_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "transfer",
    args: [GREEN_RECIPIENT, amount]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  const recipientAfterEscrow = await getBalance(GREEN_RECIPIENT);
  const gainedImmediately = recipientAfterEscrow - recipientBefore;

  if (gainedImmediately === 0n) {
    console.log("Transfer is ESCROWED (recipient has not received tokens yet)");
    console.log("Waiting for backend to validate and complete...");
  }

  // Wait for backend to process
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const current = await getBalance(GREEN_RECIPIENT);
    const gained = current - recipientBefore;
    process.stdout.write(`\r  Checking... ${(i + 1) * 3}s - Recipient gained: ${formatUnits(gained, 18)} TST`);

    if (gained === amount) {
      console.log("\n\n✅ SUCCESS: Backend APPROVED and COMPLETED the transfer");
      return;
    }
  }

  console.log("\n\n❌ TIMEOUT: Transfer not completed within 60 seconds");
}

async function scenario3_BlockedTransfer() {
  console.log("\n" + "=".repeat(60));
  console.log("SCENARIO 3: BLOCKED TRANSFER (to RED wallet)");
  console.log("=".repeat(60));

  const amount = parseUnits("100", 18);
  console.log(`\nAttempting to send ${formatUnits(amount, 18)} TST to RED wallet...`);

  try {
    await walletClient.writeContract({
      address: TOKEN_ADDRESS,
      abi: TOKEN_ABI,
      functionName: "transfer",
      args: [RED_WALLET, amount]
    });

    console.log("\n❌ UNEXPECTED: Transfer should have been blocked");
  } catch (err: unknown) {
    const error = err as { shortMessage?: string };
    const reason = error.shortMessage?.match(/reason:\n(.+)/)?.[1] || "Unknown";
    console.log(`Transaction REVERTED: ${reason}`);
    console.log("\n✅ SUCCESS: Blocked transfer was REJECTED at contract level");
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         TRUSTSIGNAL TOKEN - DEMO SCENARIOS                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const senderBalance = await getBalance(account.address);
  console.log(`\nSender: ${account.address}`);
  console.log(`Balance: ${formatUnits(senderBalance, 18)} TST`);

  await scenario1_InstantTransfer();
  await scenario2_EscrowedTransfer();
  await scenario3_BlockedTransfer();

  console.log("\n" + "=".repeat(60));
  console.log("ALL SCENARIOS COMPLETE");
  console.log("=".repeat(60));

  const finalBalance = await getBalance(account.address);
  console.log(`\nFinal sender balance: ${formatUnits(finalBalance, 18)} TST`);
}

main().catch(err => {
  console.error("Demo failed:", err);
  process.exit(1);
});
