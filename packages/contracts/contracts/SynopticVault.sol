// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISynopticVault} from "./interfaces/ISynopticVault.sol";

contract SynopticVault is ISynopticVault {
    function updateRules(string calldata agentId, uint256 perTxLimit, uint256 dailyLimit) external override {
        emit SpendRuleUpdated(agentId, perTxLimit, dailyLimit);
    }
}
