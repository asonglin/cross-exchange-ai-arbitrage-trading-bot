/**
 * ARBIX — Deploy all 3 contracts to BSC
 * Run: npx hardhat run scripts/deploy.js --network bsc
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║       ARBIX CONTRACT DEPLOYMENT         ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log("Deployer: ", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceBNB = hre.ethers.formatEther(balance);
  console.log("Balance:  ", balanceBNB, "BNB");

  if (parseFloat(balanceBNB) < 0.01) {
    console.error("\n❌ Need at least 0.01 BNB for gas. Send BNB to:", deployer.address);
    process.exit(1);
  }

  console.log("Network:  ", hre.network.name, "\n");

  // 1. Deploy ArbixPriceOracle
  console.log("📦 [1/3] Deploying ArbixPriceOracle...");
  const Oracle = await hre.ethers.getContractFactory("ArbixPriceOracle");
  const oracle = await Oracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddr = await oracle.getAddress();
  console.log("   ✅ ArbixPriceOracle:", oracleAddr);

  // 2. Deploy ArbixExecutor (arg: agent = deployer)
  console.log("\n📦 [2/3] Deploying ArbixExecutor...");
  const Executor = await hre.ethers.getContractFactory("ArbixExecutor");
  const executor = await Executor.deploy(deployer.address);
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  console.log("   ✅ ArbixExecutor:", executorAddr);

  // 3. Deploy ArbixVault (arg: executor address)
  console.log("\n📦 [3/3] Deploying ArbixVault...");
  const Vault = await hre.ethers.getContractFactory("ArbixVault");
  const vault = await Vault.deploy(executorAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("   ✅ ArbixVault:", vaultAddr);

  // Save
  const isTestnet = hre.network.name === "bscTestnet";
  const scanBase = isTestnet ? "https://testnet.bscscan.com/address/" : "https://bscscan.com/address/";
  const out = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      ArbixPriceOracle: { address: oracleAddr, bscscan: scanBase + oracleAddr },
      ArbixExecutor:    { address: executorAddr, bscscan: scanBase + executorAddr },
      ArbixVault:       { address: vaultAddr, bscscan: scanBase + vaultAddr },
    },
  };
  fs.writeFileSync(path.join(__dirname, "deployed.json"), JSON.stringify(out, null, 2));

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║         DEPLOYMENT COMPLETE ✅           ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("\n📋 Addresses:");
  console.log("   ArbixPriceOracle:", oracleAddr);
  console.log("   ArbixExecutor:   ", executorAddr);
  console.log("   ArbixVault:      ", vaultAddr);
  console.log("\n🔍 BscScan:");
  console.log("   " + scanBase + oracleAddr);
  console.log("   " + scanBase + executorAddr);
  console.log("   " + scanBase + vaultAddr);
  console.log("\n📁 Saved to: scripts/deployed.json");
  console.log("\n⏭  Next: npx hardhat run scripts/verify.js --network " + hre.network.name);
}

main().catch((e) => { console.error(e); process.exit(1); });
