import { expect } from "chai";
import { ethers } from "hardhat";

describe("TradeRegistry", () => {
  it("records a trade", async () => {
    const factory = await ethers.getContractFactory("TradeRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();

    await registry.recordTrade(
      11155111,
      ethers.keccak256(ethers.toUtf8Bytes("swap")),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      1n,
      2n,
      "test"
    );

    expect(await registry.getTradeCount()).to.equal(1n);
  });
});
