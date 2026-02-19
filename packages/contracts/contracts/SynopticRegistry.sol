// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISynopticRegistry} from "./interfaces/ISynopticRegistry.sol";

contract SynopticRegistry is ISynopticRegistry {
    mapping(string => address) public owners;

    function registerAgent(string calldata agentId, address owner) external override {
        owners[agentId] = owner;
        emit AgentRegistered(agentId, owner);
    }
}
