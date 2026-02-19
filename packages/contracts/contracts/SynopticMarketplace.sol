// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISynopticMarketplace} from "./interfaces/ISynopticMarketplace.sol";
import {ISynopticRegistry} from "./interfaces/ISynopticRegistry.sol";

contract SynopticMarketplace is ISynopticMarketplace, Ownable {
    ISynopticRegistry public registry;

    constructor(address registryAddress) Ownable(msg.sender) {
        require(registryAddress != address(0), "registry required");
        registry = ISynopticRegistry(registryAddress);
    }

    function submitOrder(string calldata orderId, string calldata agentId) external override {
        address agentOwner = registry.owners(agentId);
        require(agentOwner != address(0), "agent not registered");
        require(msg.sender == owner() || msg.sender == agentOwner, "not authorized");

        emit OrderSubmitted(orderId, agentId);
    }

    function setRegistry(address registryAddress) external onlyOwner {
        require(registryAddress != address(0), "registry required");
        registry = ISynopticRegistry(registryAddress);
    }
}
