export interface Metrics {
  incrementCounter(name: string): void;
  observeDuration(name: string, milliseconds: number): void;
  snapshot(): { counters: Record<string, number>; durationMs: Record<string, number[]> };
}

export function createInMemoryMetrics(): Metrics {
  const counters = new Map<string, number>();
  const durationMs = new Map<string, number[]>();

  return {
    incrementCounter(name: string) {
      counters.set(name, (counters.get(name) ?? 0) + 1);
    },
    observeDuration(name: string, milliseconds: number) {
      const current = durationMs.get(name) ?? [];
      current.push(milliseconds);
      durationMs.set(name, current);
    },
    snapshot() {
      return {
        counters: Object.fromEntries(counters.entries()),
        durationMs: Object.fromEntries(durationMs.entries())
      };
    }
  };
}
