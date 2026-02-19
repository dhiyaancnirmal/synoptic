// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISynopticRegistry {
    event AgentRegistered(string indexed agentId, address indexed owner);

    function registerAgent(string calldata agentId, address owner) external;
}
