// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISynopticVault} from "./interfaces/ISynopticVault.sol";
import {ISynopticRegistry} from "./interfaces/ISynopticRegistry.sol";

contract SynopticVault is ISynopticVault, Ownable {
    ISynopticRegistry public registry;

    constructor(address registryAddress) Ownable(msg.sender) {
        require(registryAddress != address(0), "registry required");
        registry = ISynopticRegistry(registryAddress);
    }

    function updateRules(string calldata agentId, uint256 perTxLimit, uint256 dailyLimit) external override {
        address agentOwner = registry.owners(agentId);
        require(agentOwner != address(0), "agent not registered");
        require(msg.sender == owner() || msg.sender == agentOwner, "not authorized");

        emit SpendRuleUpdated(agentId, perTxLimit, dailyLimit);
    }

    function setRegistry(address registryAddress) external onlyOwner {
        require(registryAddress != address(0), "registry required");
        registry = ISynopticRegistry(registryAddress);
    }
}
