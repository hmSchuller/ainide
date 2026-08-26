export const AUTO_SAVE_DELAY_MS = 1000;

export interface AutoSaver {
  schedule: (path: string) => void;
  flush: (path: string) => Promise<void>;
  cancel: (path: string) => void;
}

export function createAutoSaver(runSave: (path: string) => Promise<void>, delayMs = AUTO_SAVE_DELAY_MS): AutoSaver {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Map<string, Promise<void>>();

  const run = async (path: string) => {
    const pending = inflight.get(path);
    if (pending) await pending;
    const promise = runSave(path);
    inflight.set(path, promise);
    try {
      await promise;
    } finally {
      if (inflight.get(path) === promise) inflight.delete(path);
    }
  };

  return {
    schedule(path) {
      const timer = timers.get(path);
      if (timer) clearTimeout(timer);
      timers.set(path, setTimeout(() => {
        timers.delete(path);
        void run(path);
      }, delayMs));
    },
    async flush(path) {
      const timer = timers.get(path);
      if (timer) {
        clearTimeout(timer);
        timers.delete(path);
      }
      await run(path);
    },
    cancel(path) {
      const timer = timers.get(path);
      if (timer) {
        clearTimeout(timer);
        timers.delete(path);
      }
    },
  };
}
