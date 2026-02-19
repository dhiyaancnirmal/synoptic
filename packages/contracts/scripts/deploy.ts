import { ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying scaffold contracts with:", deployer.address);

  const Registry = await ethers.getContractFactory("SynopticRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const Marketplace = await ethers.getContractFactory("SynopticMarketplace");
  const marketplace = await Marketplace.deploy();
  await marketplace.waitForDeployment();

  const Vault = await ethers.getContractFactory("SynopticVault");
  const vault = await Vault.deploy();
  await vault.waitForDeployment();

  console.log("SynopticRegistry:", await registry.getAddress());
  console.log("SynopticMarketplace:", await marketplace.getAddress());
  console.log("SynopticVault:", await vault.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
