/**
 * QuickNode Streams Filter Function
 *
 * Deploy this filter via the QuickNode Dashboard when configuring a
 * `block_with_receipts` stream targeting the Monad testnet.
 *
 * The filter pre-extracts ERC-20 transfers, contract deployments, and
 * per-block metrics so the webhook receives clean, structured data.
 *
 * Dataset: block_with_receipts
 * Destination: POST /webhooks/quicknode/monad
 */
function main(stream) {
  const blocks = stream.data;
  return blocks.map(function (block) {
    var txs = block.transactions || [];
    return {
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      transactionCount: txs.length,
      transfers: txs
        .filter(function (tx) {
          return tx.input && tx.input.startsWith("0xa9059cbb");
        })
        .map(function (tx) {
          return {
            txHash: tx.hash,
            from: tx.from,
            to: tx.to,
            tokenContract: tx.to,
            input: tx.input,
            blockNumber: block.number
          };
        }),
      deployments: txs
        .filter(function (tx) {
          return tx.to === null;
        })
        .map(function (tx) {
          return {
            txHash: tx.hash,
            deployer: tx.from,
            contractAddress: tx.contractAddress,
            blockNumber: block.number
          };
        })
    };
  });
}
