/**
 * Hardhat deployment script for AgentSentinel on Pharos testnet.
 *
 * Run on PowerShell, bash, or zsh:
 *   npx hardhat run scripts/deploy.ts --network pharosTestnet
 *
 * Prerequisites (one-time):
 *   1. cp .env.example .env       (PowerShell:  Copy-Item .env.example .env)
 *   2. Edit .env and fill PHAROS_RPC_URL + DEPLOYER_PRIVATE_KEY
 *   3. npm install
 */
import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  // ---- pre-flight ---------------------------------------------------------
  if (network.name === "pharosTestnet") {
    const cfg = network.config as { url?: string; accounts?: string[] };
    if (!cfg.url) {
      throw new Error("PHAROS_RPC_URL is empty. Set it in .env before deploying.");
    }
    if (!cfg.accounts || cfg.accounts.length === 0) {
      throw new Error(
        "DEPLOYER_PRIVATE_KEY is empty. Set it in .env (without 0x or with 0x; both work).",
      );
    }
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available. Check DEPLOYER_PRIVATE_KEY in .env.");
  }
  const deployer = signers[0];
  const balance  = await ethers.provider.getBalance(deployer.address);
  console.log("Network         :", network.name);
  console.log("Deployer        :", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "native");

  if (balance === 0n && network.name !== "hardhat") {
    console.warn(
      "WARNING: deployer balance is 0. Get testnet PHAR from the Pharos faucet first.",
    );
  }

  // ---- 1. SentinelRegistry -----------------------------------------------
  console.log("\n[1/4] Deploying SentinelRegistry ...");
  const Registry = await ethers.getContractFactory("SentinelRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("       SentinelRegistry @", registryAddr);

  // ---- 2. SentinelAuditLog -----------------------------------------------
  console.log("\n[2/4] Deploying SentinelAuditLog ...");
  const AuditLog = await ethers.getContractFactory("SentinelAuditLog");
  const audit = await AuditLog.deploy(registryAddr);
  await audit.waitForDeployment();
  const auditAddr = await audit.getAddress();
  console.log("       SentinelAuditLog @", auditAddr);

  // ---- 3. SentinelPayments -----------------------------------------------
  console.log("\n[3/4] Deploying SentinelPayments ...");
  const Payments = await ethers.getContractFactory("SentinelPayments");
  const payments = await Payments.deploy(registryAddr, deployer.address);
  await payments.waitForDeployment();
  const paymentsAddr = await payments.getAddress();
  console.log("       SentinelPayments @", paymentsAddr);

  // ---- 4. Register skill version v1.0.0 ----------------------------------
  console.log("\n[4/4] Registering skill version v1.0.0 ...");
  const tx = await registry.registerVersion(
    "v1.0.0",
    ethers.id("AgentSentinel@1.0.0"),
    "ipfs://<spec-cid-placeholder>",
    ethers.parseEther("0.05"),
  );
  await tx.wait();
  console.log("       Registered. tx:", tx.hash);

  // ---- summary -----------------------------------------------------------
  console.log("\n=== Deployment summary ===");
  console.log(JSON.stringify({
    network: network.name,
    deployer: deployer.address,
    contracts: {
      SentinelRegistry: registryAddr,
      SentinelAuditLog: auditAddr,
      SentinelPayments: paymentsAddr,
    },
    skillVersion: "v1.0.0",
  }, null, 2));
}

main().catch((err) => {
  console.error("\nDeployment failed:");
  console.error(err);
  process.exitCode = 1;
});
