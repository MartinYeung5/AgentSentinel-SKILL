import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

const PHAROS_RPC_URL =
  process.env.PHAROS_RPC_URL || "https://testnet.dplabs-internal.com";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const PHAROS_CHAIN_ID = Number(process.env.PHAROS_CHAIN_ID || 688689);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      // local in-memory chain for `npm run deploy:local`
    },
    pharosTestnet: {
      url: PHAROS_RPC_URL,
      chainId: PHAROS_CHAIN_ID,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test-solidity",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
