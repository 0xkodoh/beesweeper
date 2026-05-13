import type { Address } from "viem";

export const beeSweeperScoresAddress = "0xd2A1b3D33A7Ebb1F2E877de2187574114DacDF24" as Address;

export const beeSweeperScoresAbi = [
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "score", type: "uint256" },
      { name: "difficulty", type: "string" },
      { name: "completionTime", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ScoreSubmitted",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "score", type: "uint256", indexed: false },
      { name: "difficulty", type: "string", indexed: false },
      { name: "completionTime", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;
