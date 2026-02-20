export interface SchedulerHandle {
  stop: () => void;
}

export function startScheduler(run: () => Promise<void>, intervalMs: number): SchedulerHandle {
  const handle = setInterval(() => {
    void run();
  }, intervalMs);

  return {
    stop: () => clearInterval(handle)
  };
}
