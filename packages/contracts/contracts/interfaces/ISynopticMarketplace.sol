// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISynopticMarketplace {
    event OrderSubmitted(string indexed orderId, string indexed agentId);

    function submitOrder(string calldata orderId, string calldata agentId) external;
}
