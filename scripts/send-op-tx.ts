import hre from "hardhat";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function deployContracts() {
  const networkName = hre.network?.name || "unknown";
  console.log(`Deploying contracts to network: ${networkName}`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  // Deploy SettlementToken
  console.log("\nDeploying SettlementToken...");
  const Token = await ethers.getContractFactory("SettlementToken");
  const token = await Token.deploy("Settlement Token", "ST");
  await token.waitForDeployment();
  console.log("SettlementToken:", await token.getAddress());

  // Deploy TenantRegistry
  console.log("Deploying TenantRegistry...");
  const Registry = await ethers.getContractFactory("TenantRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log("TenantRegistry:", await registry.getAddress());

  // Deploy MarketFactory
  console.log("Deploying MarketFactory...");
  const Factory = await ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("MarketFactory:", await factory.getAddress());

  // Create initial sample markets with JSON metadata
  console.log("\nCreating sample markets...");

  const sampleMarkets = [
    {
      metadata: JSON.stringify({
        question: "Will NVDA trade above $150 by EOY 2026?",
        category: "stocks",
        stockSymbol: "NVDA",
        outcomes: ["YES", "NO"],
        direction: "above",
        priceTarget: "150",
        timeframe: "EOY 2026",
      }),
      outcomes: 2,
      fee: 200,
      category: "stocks",
    },
    {
      metadata: JSON.stringify({
        question: "Will Bitcoin (BTC) trade above $100,000 by EOY 2026?",
        category: "crypto",
        cryptoSymbol: "BTC",
        outcomes: ["YES", "NO"],
        direction: "above",
        priceTarget: "100000",
        timeframe: "EOY 2026",
      }),
      outcomes: 2,
      fee: 200,
      category: "crypto",
    },
    {
      metadata: JSON.stringify({
        question: "Will AAPL trade above $250 by EOY 2026?",
        category: "stocks",
        stockSymbol: "AAPL",
        outcomes: ["YES", "NO"],
        direction: "above",
        priceTarget: "250",
        timeframe: "EOY 2026",
      }),
      outcomes: 2,
      fee: 150,
      category: "stocks",
    },
  ];

  const marketAddresses: string[] = [];
  for (const m of sampleMarkets) {
    const tx = await factory.createMarket(
      await token.getAddress(),
      m.metadata,
      m.outcomes,
      m.fee,
      m.category,
      ethers.ZeroAddress,
    );
    await tx.wait();
    const idx = Number(await factory.getMarketCount()) - 1;
    const addr = await factory.allMarkets(idx);
    marketAddresses.push(addr);
    console.log(`  Created ${m.category} market: ${addr}`);
  }

  console.log("\n✅ Deployment Completed!");

  const result = {
    network: networkName,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    token: await token.getAddress(),
    tenantRegistry: await registry.getAddress(),
    factory: await factory.getAddress(),
    markets: marketAddresses,
  };

  // Write deployments.json to root and frontend/public
  const writeFile = (filePath: string) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8");
    console.log("Wrote:", filePath);
  };

  const root = path.resolve(__dirname, "..");
  writeFile(path.join(root, "deployments.json"));
  writeFile(path.join(root, "frontend", "public", "deployments.json"));

  return result;
}

deployContracts().catch((error) => {
  console.error("Deployment error:", error);
  process.exitCode = 1;
});
