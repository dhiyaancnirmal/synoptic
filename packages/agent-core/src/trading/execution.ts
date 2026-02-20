export function validateUnsignedTxData(data: string): boolean {
  return typeof data === "string" && data.length > 2 && data !== "0x";
}
