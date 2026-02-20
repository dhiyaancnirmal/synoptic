// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ServiceRegistry {
    struct RecordServiceInput {
        string serviceType;
        uint256 paymentAmount;
        bytes32 paymentTxHash;
        uint256 targetChainId;
        string targetTxHashOrRef;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        string metadata;
    }

    struct ServiceRecord {
        address agent;
        string serviceType;
        uint256 paymentAmount;
        bytes32 paymentTxHash;
        uint256 targetChainId;
        string targetTxHashOrRef;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        string metadata;
        uint256 timestamp;
    }

    ServiceRecord[] public services;
    mapping(address => uint256[]) public agentServices;

    event ServiceRecorded(
        uint256 indexed serviceIndex,
        address indexed agent,
        string serviceType,
        uint256 targetChainId,
        string targetTxHashOrRef
    );

    function recordService(RecordServiceInput calldata input) external returns (uint256 serviceIndex) {
        serviceIndex = services.length;
        services.push();
        ServiceRecord storage record = services[serviceIndex];
        record.agent = msg.sender;
        record.serviceType = input.serviceType;
        record.paymentAmount = input.paymentAmount;
        record.paymentTxHash = input.paymentTxHash;
        record.targetChainId = input.targetChainId;
        record.targetTxHashOrRef = input.targetTxHashOrRef;
        record.tokenIn = input.tokenIn;
        record.tokenOut = input.tokenOut;
        record.amountIn = input.amountIn;
        record.amountOut = input.amountOut;
        record.metadata = input.metadata;
        record.timestamp = block.timestamp;

        agentServices[msg.sender].push(serviceIndex);

        emit ServiceRecorded(
            serviceIndex,
            msg.sender,
            input.serviceType,
            input.targetChainId,
            input.targetTxHashOrRef
        );
    }

    function getServiceCount() external view returns (uint256) {
        return services.length;
    }

    function getAgentServiceCount(address agent) external view returns (uint256) {
        return agentServices[agent].length;
    }
}
