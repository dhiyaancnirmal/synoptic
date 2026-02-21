/**
 * QuickNode Streams Filter Function
 *
 * Dataset: block_with_receipts
 * Destination: POST /webhooks/quicknode/monad
 *
 * This filter enriches each block with:
 * - ERC-20 transfer extraction (recipient + decoded amount when possible)
 * - Contract deployment extraction
 * - Method selector extraction from tx input calldata
 */
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

function readSelector(input) {
  if (!input || typeof input !== "string") return null;
  if (!input.startsWith("0x") || input.length < 10) return null;
  return input.slice(0, 10).toLowerCase();
}

function decodeTransferCall(input) {
  if (!input || typeof input !== "string") return {};
  if (!input.toLowerCase().startsWith(ERC20_TRANSFER_SELECTOR)) return {};
  const raw = input.startsWith("0x") ? input.slice(2) : input;
  const payload = raw.slice(8);
  if (payload.length < 128) return {};
  const recipientWord = payload.slice(0, 64);
  const amountWord = payload.slice(64, 128);
  try {
    const recipient = `0x${recipientWord.slice(24)}`.toLowerCase();
    const amount = BigInt(`0x${amountWord}`).toString(10);
    return { recipient, amount };
  } catch (_err) {
    return {};
  }
}

function main(stream) {
  const blocks = stream.data || [];
  return blocks.map(function (block) {
    const txs = block.transactions || [];
    const selectors = {};

    const transfers = txs
      .filter(function (tx) {
        return tx.input && tx.input.toLowerCase().startsWith(ERC20_TRANSFER_SELECTOR);
      })
      .map(function (tx) {
        const decoded = decodeTransferCall(tx.input);
        return {
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          tokenContract: tx.to,
          input: tx.input,
          amount: decoded.amount,
          recipient: decoded.recipient,
          blockNumber: block.number
        };
      });

    txs.forEach(function (tx) {
      const selector = readSelector(tx.input);
      if (!selector) return;
      selectors[selector] = (selectors[selector] || 0) + 1;
    });

    return {
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      transactionCount: txs.length,
      transfers: transfers,
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
        }),
      methodSelectors: Object.keys(selectors).map(function (selector) {
        return { selector, count: selectors[selector] };
      })
    };
  });
}
