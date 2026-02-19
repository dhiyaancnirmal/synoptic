// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISynopticMarketplace} from "./interfaces/ISynopticMarketplace.sol";

contract SynopticMarketplace is ISynopticMarketplace {
    function submitOrder(string calldata orderId, string calldata agentId) external override {
        emit OrderSubmitted(orderId, agentId);
    }
}
