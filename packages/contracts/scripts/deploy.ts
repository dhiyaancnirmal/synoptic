import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { network, ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying scaffold contracts with:", deployer.address);

  const Registry = await ethers.getContractFactory("SynopticRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const registryAddress = await registry.getAddress();

  const Marketplace = await ethers.getContractFactory("SynopticMarketplace");
  const marketplace = await Marketplace.deploy(registryAddress);
  await marketplace.waitForDeployment();

  const Vault = await ethers.getContractFactory("SynopticVault");
  const vault = await Vault.deploy(registryAddress);
  await vault.waitForDeployment();

  const deployment = {
    network: network.name,
    chainId: Number(network.config.chainId ?? 0),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      SynopticRegistry: registryAddress,
      SynopticMarketplace: await marketplace.getAddress(),
      SynopticVault: await vault.getAddress()
    }
  };

  console.log("SynopticRegistry:", deployment.contracts.SynopticRegistry);
  console.log("SynopticMarketplace:", deployment.contracts.SynopticMarketplace);
  console.log("SynopticVault:", deployment.contracts.SynopticVault);

  const deploymentsDir = join(process.cwd(), "deployments");
  await mkdir(deploymentsDir, { recursive: true });
  const outputPath = join(deploymentsDir, `${network.name}.json`);
  await writeFile(outputPath, JSON.stringify(deployment, null, 2));
  console.log("Saved deployment metadata:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
