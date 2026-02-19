// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISynopticVault {
    event SpendRuleUpdated(string indexed agentId, uint256 perTxLimit, uint256 dailyLimit);

    function updateRules(string calldata agentId, uint256 perTxLimit, uint256 dailyLimit) external;
}
