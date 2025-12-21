import { defineChain } from "viem";

import { CHAIN_ID, EXPLORER_URL, RPC_URL } from "./config";

export const xdcApothem = defineChain({
  id: CHAIN_ID,
  name: "XDC Apothem",
  network: "xdc-apothem",
  nativeCurrency: {
    name: "XDC",
    symbol: "XDC",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "XDC Apothem Explorer",
      url: EXPLORER_URL
    }
  },
  testnet: true
});
