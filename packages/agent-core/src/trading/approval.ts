export function needsApproval(currentAllowance: bigint, requiredAmount: bigint): boolean {
  return currentAllowance < requiredAmount;
}
