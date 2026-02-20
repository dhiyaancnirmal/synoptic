import assert from "node:assert/strict";
import test from "node:test";
import type {
  AttestationAdapter,
  IdentityAdapter,
  PaymentAdapter,
  TradingAdapter
} from "./contracts.js";

test("adapter contracts expose the required methods and payload shapes", async () => {
  const paymentAdapter: PaymentAdapter = {
    async verify(paymentToken) {
      return { authorized: paymentToken.length > 0 };
    },
    async settle(paymentToken) {
      return paymentToken.length > 0
        ? { settled: true, txHash: "0xpayment" }
        : { settled: false, reason: "empty token" };
    }
  };

  const tradingAdapter: TradingAdapter = {
    async checkApproval() {
      return { needsApproval: false, approvalRequestId: "approval-1" };
    },
    async quote() {
      return { quoteResponse: { requestId: "quote-1" }, amountOut: "101" };
    },
    async executeSwap() {
      return { txHash: "0xtrade", status: "confirmed", quoteRequestId: "quote-1", swapRequestId: "swap-1" };
    }
  };

  const attestationAdapter: AttestationAdapter = {
    async recordTrade() {
      return { attestationTxHash: "0xattestation" };
    }
  };

  const identityAdapter: IdentityAdapter = {
    async passport() {
      return { passportId: "passport-1" };
    },
    async session() {
      return { sessionKey: "session-1" };
    }
  };

  const verify = await paymentAdapter.verify("token");
  assert.equal(verify.authorized, true);

  const settle = await paymentAdapter.settle("token");
  assert.equal(settle.settled, true);
  assert.ok(settle.txHash);

  const approval = await tradingAdapter.checkApproval({
    walletAddress: "0xowner",
    token: "0xtoken",
    amount: "1",
    chainId: 11155111
  });
  assert.equal(approval.needsApproval, false);
  assert.equal(typeof approval.approvalRequestId, "string");

  const quote = await tradingAdapter.quote({
    tokenIn: "0x0",
    tokenOut: "0x1",
    amountIn: "1",
    chainId: 11155111,
    swapper: "0xowner"
  });
  assert.equal(typeof quote.quoteResponse.requestId, "string");
  assert.equal(typeof quote.amountOut, "string");

  const swap = await tradingAdapter.executeSwap({ quoteResponse: quote.quoteResponse, signature: "0xsig" });
  assert.equal(swap.status, "confirmed");
  assert.ok(swap.txHash);
  assert.equal(typeof swap.quoteRequestId, "string");
  assert.equal(typeof swap.swapRequestId, "string");

  const attestation = await attestationAdapter.recordTrade({
    sourceChainId: 11155111,
    sourceTxHash: "0xtrade",
    tokenIn: "0x0",
    tokenOut: "0x1",
    amountIn: "1",
    amountOut: "2",
    strategyReason: "signal"
  });
  assert.ok(attestation.attestationTxHash);

  const passport = await identityAdapter.passport({ owner: "0xowner" });
  assert.ok(passport.passportId);

  const session = await identityAdapter.session({
    passportId: passport.passportId,
    delegate: "0xdelegate"
  });
  assert.ok(session.sessionKey);
});
