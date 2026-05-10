import type { Address } from "viem";

export const beeSweeperScoresAddress = "0xA130B42f8571dA5d3ed80C4d1D1e515172f0A760" as Address;

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
