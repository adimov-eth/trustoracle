const env = import.meta.env;

export const APP_NAME = env.VITE_APP_NAME ?? "TrustSignal Admin";
export const BACKEND_URL = env.VITE_BACKEND_URL ?? "http://localhost:3000";
export const ADMIN_API_KEY = env.VITE_ADMIN_API_KEY ?? "";
export const EXPLORER_URL =
  env.VITE_EXPLORER_URL ?? "https://explorer.apothem.network";
export const CHAIN_ID = Number(env.VITE_CHAIN_ID ?? 51);
