import { encodeAbiParameters, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { config } from "../config";

export type Authorization = {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  expiry: number;
  signature: `0x${string}`;
};

export async function generateAuthorization(
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
  nonce: bigint
): Promise<Authorization> {
  const expiry = Math.floor(Date.now() / 1000) + config.authExpirySeconds;

  const messageHash = hashAuthorization(from, to, amount, nonce, expiry);
  const account = privateKeyToAccount(config.signerPrivateKey);
  const signature = (await account.signMessage({ message: { raw: messageHash } })) as `0x${string}`;

  return { from, to, amount, nonce, expiry, signature };
}

export function hashAuthorization(
  from: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
  nonce: bigint,
  expiry: number
): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint40" },
      { type: "uint256" },
      { type: "address" }
    ],
    [from, to, amount, nonce, BigInt(expiry), BigInt(config.chainId), config.oracleAddress]
  );

  return keccak256(encoded);
}
