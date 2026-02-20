import { expect } from "chai";
import { ethers } from "hardhat";

describe("ServiceRegistry", () => {
  it("records a Monad tx-hash service reference", async () => {
    const factory = await ethers.getContractFactory("ServiceRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();

    await registry.recordService({
      serviceType: "trade_execute",
      paymentAmount: 0n,
      paymentTxHash: ethers.ZeroHash,
      targetChainId: 10143,
      targetTxHashOrRef: "0x5f57a3df761f4b6a2b7f3946eb0f64cb3d77e2fe7b77131f8f77bc7f95ab57f0",
      tokenIn: ethers.ZeroAddress,
      tokenOut: ethers.ZeroAddress,
      amountIn: 1n,
      amountOut: 2n,
      metadata: "momentum"
    });

    expect(await registry.getServiceCount()).to.equal(1n);
  });

  it("records a HyperCore fill/order reference", async () => {
    const factory = await ethers.getContractFactory("ServiceRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();

    await registry.recordService({
      serviceType: "trade_execute",
      paymentAmount: 0n,
      paymentTxHash: ethers.ZeroHash,
      targetChainId: 998,
      targetTxHashOrRef: "fill:0xabc123:order:42",
      tokenIn: ethers.ZeroAddress,
      tokenOut: ethers.ZeroAddress,
      amountIn: 1n,
      amountOut: 2n,
      metadata: "rebalance"
    });

    expect(await registry.getAgentServiceCount((await ethers.getSigners())[0].address)).to.equal(1n);
  });
});
