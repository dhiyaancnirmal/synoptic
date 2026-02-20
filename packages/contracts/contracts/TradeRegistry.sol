// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TradeRegistry {
    struct TradeRecord {
        address agent;
        uint256 sourceChainId;
        bytes32 sourceTxHash;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 timestamp;
        string strategyReason;
    }

    TradeRecord[] public trades;
    mapping(address => uint256[]) public agentTrades;

    event TradeRecorded(
        uint256 indexed tradeIndex,
        address indexed agent,
        uint256 sourceChainId,
        bytes32 sourceTxHash,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        string strategyReason
    );

    function recordTrade(
        uint256 sourceChainId,
        bytes32 sourceTxHash,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        string calldata strategyReason
    ) external {
        uint256 index = trades.length;
        trades.push(
            TradeRecord({
                agent: msg.sender,
                sourceChainId: sourceChainId,
                sourceTxHash: sourceTxHash,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                amountOut: amountOut,
                timestamp: block.timestamp,
                strategyReason: strategyReason
            })
        );

        agentTrades[msg.sender].push(index);

        emit TradeRecorded(
            index,
            msg.sender,
            sourceChainId,
            sourceTxHash,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            strategyReason
        );
    }

    function getTradeCount() external view returns (uint256) {
        return trades.length;
    }

    function getAgentTradeCount(address agent) external view returns (uint256) {
        return agentTrades[agent].length;
    }
}
