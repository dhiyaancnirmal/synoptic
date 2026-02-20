export function canSpend(currentSpentUsd: number, limitUsd: number, requestUsd: number): boolean {
  return currentSpentUsd + requestUsd <= limitUsd;
}
