/**
 * After deploying, run this to automatically patch Backend/main.py
 * with the real deployed contract addresses.
 *
 * Run: node scripts/update-backend.js
 */

const fs = require("fs");
const path = require("path");

const deployedPath = path.join(__dirname, "deployed.json");
if (!fs.existsSync(deployedPath)) {
  console.error("❌ deployed.json not found. Run deploy.js first.");
  process.exit(1);
}

const deployed = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
const { ArbixPriceOracle, ArbixExecutor, ArbixVault } = deployed.contracts;

const backendPath = path.join(__dirname, "../../Backend/main.py");
let content = fs.readFileSync(backendPath, "utf8");

// Replace the CONTRACTS dict entries
// Match pattern: "address": "0x0000...000"  (the zero addresses)
const replacements = [
  {
    contract: "ArbixExecutor",
    address: ArbixExecutor.address,
  },
  {
    contract: "ArbixPriceOracle",
    address: ArbixPriceOracle.address,
  },
  {
    contract: "ArbixVault",
    address: ArbixVault.address,
  },
];

// Find the CONTRACTS block and replace addresses
// Strategy: replace all occurrences of 0x0000000000000000000000000000000000000000 in order
let zeroAddr = "0x0000000000000000000000000000000000000000";
let i = 0;
let updated = content;

for (const r of replacements) {
  const idx = updated.indexOf(`"address": "${zeroAddr}"`);
  if (idx === -1) {
    console.log(`⚠️  Could not find zero address for ${r.contract} — may already be updated`);
    continue;
  }
  updated =
    updated.slice(0, idx) +
    `"address": "${r.address}"` +
    updated.slice(idx + `"address": "${zeroAddr}"`.length);
  console.log(`✅ Updated ${r.contract}: ${r.address}`);
}

// Also update status from "compiled" to "deployed"
updated = updated.replace(/"status": "compiled"/g, '"status": "deployed"');
console.log('✅ Updated status: compiled → deployed');

fs.writeFileSync(backendPath, updated);
console.log(`\n✅ Backend/main.py patched with deployed addresses.`);
console.log("   Restart your backend to apply changes.");
