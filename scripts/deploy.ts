import hre from "hardhat";

async function main() {
  const networkName = hre.network.name;
  const BeeSweeperScores = await hre.ethers.getContractFactory("BeeSweeperScores");
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
