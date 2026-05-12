"use client";

import { createAppKit } from "@reown/appkit/react";
import { base } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { http } from "wagmi";

export const targetChain = base;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const networks = [base] as [typeof base];
const metadata = {
  name: "BeeSweeper",
  description: "Clear the hive. Avoid the bees. Submit scores onchain.",
  url: "https://beesweeper.vercel.app",
  icons: ["https://beesweeper.vercel.app/favicon.ico"],
};

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: base,
  projectId,
  metadata,
  themeMode: "dark",
  enableEIP6963: true,
  enableCoinbase: true,
  enableInjected: true,
  enableWalletConnect: true,
  enableNetworkSwitch: true,
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeVariables: {
    "--w3m-accent": "#F8C342",
    "--w3m-color-mix": "#07121F",
    "--w3m-color-mix-strength": 24,
    "--w3m-border-radius-master": "2px",
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
