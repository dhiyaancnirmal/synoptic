import type { ActivityEvent } from "./activity.js";
import type { Payment } from "./payment.js";
import type { Trade } from "./trade.js";

export type WsEvent =
  | { type: "agent.status"; agentId: string; status: string }
  | { type: "payment.update"; payment: Payment }
  | { type: "trade.update"; trade: Trade }
  | { type: "activity.new"; event: ActivityEvent }
  | { type: "price.update"; pair: string; price: number; time: number };
