import hre from "hardhat";

type DeployableContractFactory = {
  deploy: () => Promise<{
    getAddress: () => Promise<string>;
    waitForDeployment: () => Promise<void>;
  }>;
};

type HardhatRuntimeWithEthers = typeof hre & {
  ethers: {
    getContractFactory: (name: string) => Promise<DeployableContractFactory>;
  };
};

async function main() {
  const hardhat = hre as HardhatRuntimeWithEthers;
  const networkName = hardhat.network.name;
  const BeeSweeperScores = await hardhat.ethers.getContractFactory("BeeSweeperScores");
  const beeSweeperScores = await BeeSweeperScores.deploy();

  await beeSweeperScores.waitForDeployment();

  const address = await beeSweeperScores.getAddress();
  console.log(`Network: ${networkName}`);
  console.log(`BeeSweeperScores deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
