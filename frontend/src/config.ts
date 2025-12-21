const env = import.meta.env;

export const APP_NAME = env.VITE_APP_NAME ?? "TrustSignal Console";
export const CHAIN_ID = Number(env.VITE_CHAIN_ID ?? 51);
export const RPC_URL = env.VITE_RPC_URL ?? "https://rpc.apothem.network";
export const EXPLORER_URL =
  env.VITE_EXPLORER_URL ?? "https://explorer.apothem.network";

const DEFAULT_ORACLE = "0x24a1BA1CB110336e8cE7b5371ebC6F765bE567D0";
const DEFAULT_TOKEN = "0xEB7C8AA57a947181443CBfFa61fa641af8A5b6a5";

export const ORACLE_ADDRESS = (env.VITE_ORACLE_ADDRESS ?? DEFAULT_ORACLE) as
  | `0x${string}`
  | undefined;
export const TOKEN_ADDRESS = (env.VITE_TOKEN_ADDRESS ?? DEFAULT_TOKEN) as
  | `0x${string}`
  | undefined;

export const BACKEND_URL = env.VITE_BACKEND_URL ?? "http://localhost:3000";

export const TOKEN_SYMBOL = env.VITE_TOKEN_SYMBOL ?? "TST";
export const TOKEN_DECIMALS = Number(env.VITE_TOKEN_DECIMALS ?? 18);
