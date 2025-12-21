import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().optional(),
  SIGNER_PRIVATE_KEY: z.string().min(1),
  XDC_RPC_URL: z.string().url(),
  CHAIN_ID: z.string().optional(),
  ORACLE_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  AUTH_EXPIRY_SECONDS: z.string().optional(),
  ENABLE_SYNC: z.string().optional(),
  SYNC_WALLETS: z.string().optional(),
  NOTARY_NODE_URL: z.string().optional()
});

const env = envSchema.parse(process.env);

export const config = {
  port: Number(env.PORT ?? 3000),
  signerPrivateKey: env.SIGNER_PRIVATE_KEY as `0x${string}`,
  rpcUrl: env.XDC_RPC_URL,
  chainId: Number(env.CHAIN_ID ?? 51),
  oracleAddress: env.ORACLE_ADDRESS as `0x${string}`,
  tokenAddress: env.TOKEN_ADDRESS as `0x${string}`,
  authExpirySeconds: Number(env.AUTH_EXPIRY_SECONDS ?? 300),
  enableSync: (env.ENABLE_SYNC ?? "false").toLowerCase() === "true",
  syncWallets: env.SYNC_WALLETS ? env.SYNC_WALLETS.split(",").map((w) => w.trim()).filter(Boolean) : [],
  notaryNodeUrl: env.NOTARY_NODE_URL ?? ""
};
