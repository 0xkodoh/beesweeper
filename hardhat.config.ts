import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import type { HardhatUserConfig } from "hardhat/config";

const privateKey = process.env.PRIVATE_KEY;
const baseSepoliaRpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? process.env.RPC_URL ?? "";
const baseMainnetRpcUrl = process.env.BASE_MAINNET_RPC_URL ?? "";
const accounts = privateKey ? [privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    baseSepolia: {
      url: baseSepoliaRpcUrl,
      chainId: 84532,
      accounts,
    },
    base: {
      url: baseMainnetRpcUrl,
      chainId: 8453,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY ?? "",
    },
  },
};

export default config;
