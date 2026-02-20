import hre, { ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const registryFactory = await ethers.getContractFactory("ServiceRegistry");
  const registry = await registryFactory.deploy();
  await registry.waitForDeployment();
  const deploymentTx = registry.deploymentTransaction();
  const receipt = deploymentTx ? await deploymentTx.wait() : null;

  console.log(
    JSON.stringify({
      contract: "ServiceRegistry",
      address: await registry.getAddress(),
      deployer: deployer.address,
      deploymentTxHash: deploymentTx?.hash ?? null,
      blockNumber: receipt?.blockNumber ?? null,
      network: hre.network.name,
      chainId: Number(network.chainId)
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
