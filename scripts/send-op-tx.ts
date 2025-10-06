import { ethers } from "hardhat";

async function deployContracts() {
  // Use ethers directly from hardhat

  console.log("Deploying contracts using the OP chain type");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  // Deploy all contracts
  console.log("\nDeploying SettlementToken...");
  const Token = await ethers.getContractFactory("SettlementToken");
  const token = await Token.deploy("Settlement Token", "ST");
  await token.waitForDeployment();

  console.log("Deploying MarketFactory...");
  const Factory = await ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  console.log("Creating first market...");
  const tx = await factory.createMarket(
    await token.getAddress(),
    "Q: Will ETH price be above $4000 by end of month?",
    2,
    200
  );
  await tx.wait();

  const marketAddress = await factory.markets(0);
  const market = await ethers.getContractAt("Market", marketAddress);

  console.log("\n✅ Deployment Completed!");
  console.log("SettlementToken:", await token.getAddress());
  console.log("MarketFactory:", await factory.getAddress());
  console.log("Market:", marketAddress);

  return { token, factory, market };
}

// Run the deployment
deployContracts().catch((error) => {
  console.error("Deployment error:", error);
  process.exitCode = 1;
});