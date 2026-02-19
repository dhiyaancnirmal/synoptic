import { expect } from "chai";
import { ethers } from "hardhat";

describe("Synoptic contracts", () => {
  it("registry restricts registration to owner and prevents overwrite", async () => {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("SynopticRegistry");
    const registry = (await Registry.deploy()) as any;
    await registry.waitForDeployment();

    await expect(registry.connect(alice).registerAgent("agent-1", alice.address))
      .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);

    await expect(registry.registerAgent("agent-1", alice.address))
      .to.emit(registry, "AgentRegistered")
      .withArgs("agent-1", alice.address);

    await expect(registry.registerAgent("agent-1", bob.address)).to.be.revertedWith("agent already registered");
    expect(await registry.owners("agent-1")).to.eq(alice.address);
    expect(await registry.owner()).to.eq(deployer.address);
  });

  it("marketplace submitOrder allows registered agent owner and contract owner", async () => {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("SynopticRegistry");
    const registry = (await Registry.deploy()) as any;
    await registry.waitForDeployment();

    const Marketplace = await ethers.getContractFactory("SynopticMarketplace");
    const marketplace = (await Marketplace.deploy(await registry.getAddress())) as any;
    await marketplace.waitForDeployment();

    await registry.registerAgent("agent-1", alice.address);

    await expect(marketplace.connect(bob).submitOrder("order-1", "agent-1")).to.be.revertedWith("not authorized");

    await expect(marketplace.connect(alice).submitOrder("order-1", "agent-1"))
      .to.emit(marketplace, "OrderSubmitted")
      .withArgs("order-1", "agent-1");

    await expect(marketplace.connect(deployer).submitOrder("order-2", "agent-1"))
      .to.emit(marketplace, "OrderSubmitted")
      .withArgs("order-2", "agent-1");

    await expect(marketplace.submitOrder("order-3", "missing-agent")).to.be.revertedWith("agent not registered");
  });

  it("vault updateRules allows registered agent owner and contract owner", async () => {
    const [deployer, alice, bob] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("SynopticRegistry");
    const registry = (await Registry.deploy()) as any;
    await registry.waitForDeployment();

    const Vault = await ethers.getContractFactory("SynopticVault");
    const vault = (await Vault.deploy(await registry.getAddress())) as any;
    await vault.waitForDeployment();

    await registry.registerAgent("agent-1", alice.address);

    await expect(vault.connect(bob).updateRules("agent-1", 10, 100)).to.be.revertedWith("not authorized");

    await expect(vault.connect(alice).updateRules("agent-1", 10, 100))
      .to.emit(vault, "SpendRuleUpdated")
      .withArgs("agent-1", 10, 100);

    await expect(vault.connect(deployer).updateRules("agent-1", 20, 200))
      .to.emit(vault, "SpendRuleUpdated")
      .withArgs("agent-1", 20, 200);

    await expect(vault.updateRules("missing-agent", 1, 1)).to.be.revertedWith("agent not registered");
  });
});
