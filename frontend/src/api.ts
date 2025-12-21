import { BACKEND_URL, CHAIN_ID } from "./config";

export type AuthorizationResponse = {
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    amount: string;
    nonce: string;
    expiry: number;
    signature: `0x${string}`;
  };
};

export async function requestAuthorization(
  from: `0x${string}`,
  to: `0x${string}`,
  amount: string
): Promise<AuthorizationResponse> {
  const res = await fetch(`${BACKEND_URL}/api/v1/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, amount, chainId: CHAIN_ID })
  });

  const data = (await res.json()) as AuthorizationResponse & {
    error?: string;
    reason?: string;
  };

  if (!res.ok) {
    throw new Error(data.reason || data.error || "Authorization failed");
  }

  return data;
}
