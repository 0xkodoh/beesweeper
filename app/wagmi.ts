import { createConfig, http, injected } from "wagmi";
import { baseSepolia } from "viem/chains";

export const targetChain = baseSepolia;

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  ssr: true,
  transports: {
    [baseSepolia.id]: http(),
  },
});
