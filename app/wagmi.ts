import { createConfig, http, injected } from "wagmi";
import { base } from "viem/chains";

export const targetChain = base;

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [injected()],
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});
