require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
// Only use accounts if key looks valid (64 hex chars)
const accounts = (PRIVATE_KEY && PRIVATE_KEY.length === 64) ? [`0x${PRIVATE_KEY}`] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    bsc: {
      url: "https://bsc-dataseed1.binance.org/",
      chainId: 56,
      accounts: accounts,
      gasPrice: 3000000000, // 3 gwei — BSC standard
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: accounts,
      gasPrice: 10000000000, // 10 gwei
    },
    hardhat: {
      // local testing
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY || "",
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
    },
  },
  paths: {
    sources: "./contracts",   // .sol files in contracts/ subfolder
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
