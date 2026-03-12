/**
 * Verifies all 3 Arbix contracts on BscScan.
 * Run: npx hardhat run scripts/verify.js --network bsc
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployedPath = path.join(__dirname, "deployed.json");
  if (!fs.existsSync(deployedPath)) {
    console.error("❌ deployed.json not found — run deploy.js first");
    process.exit(1);
  }
  const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
  const { ArbixPriceOracle, ArbixExecutor, ArbixVault } = deployed.contracts;

  console.log("\n🔍 Verifying contracts on BscScan...\n");

  for (const [name, args] of [
    ["ArbixPriceOracle", { address: ArbixPriceOracle.address, constructorArguments: [] }],
    ["ArbixExecutor",    { address: ArbixExecutor.address, constructorArguments: [deployer.address] }],
    ["ArbixVault",       { address: ArbixVault.address, constructorArguments: [ArbixExecutor.address] }],
  ]) {
    try {
      console.log("Verifying " + name + " at " + args.address + "...");
      await hre.run("verify:verify", args);
      console.log("   ✅ " + name + " verified!\n");
    } catch (e) {
      if (e.message.includes("Already Verified")) {
        console.log("   ✅ Already verified\n");
      } else {
        console.error("   ❌ " + e.message + "\n");
      }
    }
  }

  console.log("✅ Verification complete! Jury can see source on BscScan.");
}

main().catch((e) => { console.error(e); process.exit(1); });
