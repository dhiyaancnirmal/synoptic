import type { McpOrderStatusInput, McpOrderStatusOutput } from "@synoptic/types/mcp";
import { fetchOrder } from "../api.js";

export async function getOrderStatus(input: McpOrderStatusInput): Promise<McpOrderStatusOutput> {
  const data = await fetchOrder(input.orderId);
  return { order: data.order };
}
