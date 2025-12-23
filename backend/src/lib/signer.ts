import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config";

const COMPLETE_TRANSFER_TYPES = {
  CompleteTransfer: [
    { name: "transferId", type: "bytes32" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

const REJECT_TRANSFER_TYPES = {
  RejectTransfer: [
    { name: "transferId", type: "bytes32" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "reason", type: "string" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

function getDomain() {
  return {
    name: "TrustSignal Token",
    version: "1",
    chainId: BigInt(config.chainId),
    verifyingContract: config.tokenAddress
  } as const;
}

export async function signCompleteTransfer(
  transferId: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
  deadline: bigint
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(config.signerPrivateKey);

  return account.signTypedData({
    domain: getDomain(),
    types: COMPLETE_TRANSFER_TYPES,
    primaryType: "CompleteTransfer",
    message: { transferId, from, to, amount, deadline }
  });
}

export async function signRejectTransfer(
  transferId: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
  reason: string,
  deadline: bigint
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(config.signerPrivateKey);

  return account.signTypedData({
    domain: getDomain(),
    types: REJECT_TRANSFER_TYPES,
    primaryType: "RejectTransfer",
    message: { transferId, from, to, amount, reason, deadline }
  });
}
