import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { base } from "viem/chains";

export const targetChain = base;

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const connectors = [
  injected(),
  coinbaseWallet({
    appName: "BeeSweeper",
  }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "BeeSweeper",
            description: "Clear the hive. Avoid the bees.",
            url: "https://beesweeper.xyz",
            icons: [],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});
