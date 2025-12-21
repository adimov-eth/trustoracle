import "@rainbow-me/rainbowkit/styles.css";
import "./style.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";

import App from "./App";
import { APP_NAME, RPC_URL } from "./config";
import { xdcApothem } from "./chain";

const config = createConfig({
  chains: [xdcApothem],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [xdcApothem.id]: http(RPC_URL)
  }
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          appInfo={{ appName: APP_NAME }}
          theme={lightTheme({
            accentColor: "#f25c2f",
            accentColorForeground: "#1b120c",
            borderRadius: "medium",
            fontStack: "rounded"
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
