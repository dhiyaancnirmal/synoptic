// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISynopticRegistry} from "./interfaces/ISynopticRegistry.sol";

contract SynopticRegistry is ISynopticRegistry, Ownable {
    mapping(string => address) public owners;

    constructor() Ownable(msg.sender) {}

    function registerAgent(string calldata agentId, address owner) external override onlyOwner {
        require(bytes(agentId).length > 0, "agentId required");
        require(owner != address(0), "owner required");
        require(owners[agentId] == address(0), "agent already registered");

        owners[agentId] = owner;
        emit AgentRegistered(agentId, owner);
    }
}
