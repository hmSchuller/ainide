export interface GitPollingEnvironment {
  isVisible: () => boolean;
  isFocused: () => boolean;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
  on: (event: "focus" | "blur" | "visibilitychange", callback: () => void) => void;
  off: (event: "focus" | "blur" | "visibilitychange", callback: () => void) => void;
}

export interface GitPollingScheduler {
  start: () => void;
  stop: () => void;
}

export function createBrowserGitPollingEnvironment(): GitPollingEnvironment {
  return {
    isVisible: () => document.visibilityState === "visible",
    isFocused: () => document.hasFocus(),
    schedule: (callback, delay) => window.setTimeout(callback, delay),
    cancel: (timer) => window.clearTimeout(timer as number),
    on: (event, callback) => {
      if (event === "visibilitychange") document.addEventListener(event, callback);
      else window.addEventListener(event, callback);
    },
    off: (event, callback) => {
      if (event === "visibilitychange") document.removeEventListener(event, callback);
      else window.removeEventListener(event, callback);
    },
  };
}

export function createGitPollingScheduler(
  refresh: () => Promise<void | boolean>,
  options: { environment?: GitPollingEnvironment; intervalMs?: number } = {},
): GitPollingScheduler {
  const environment = options.environment ?? createBrowserGitPollingEnvironment();
  const intervalMs = options.intervalMs ?? 2_000;
  let started = false;
  let active = false;
  let running = false;
  let timer: unknown;

  const clearTimer = () => {
    if (timer === undefined) return;
    environment.cancel(timer);
    timer = undefined;
  };

  const schedule = () => {
    if (!started || !active || running || timer !== undefined) return;
    timer = environment.schedule(() => {
      timer = undefined;
      void run();
    }, intervalMs);
  };

  const run = async () => {
    if (!started || !active || running) return;
    running = true;
    try {
      await refresh();
    } catch {
      // The caller reports refresh failures; the scheduler must remain retryable.
    } finally {
      running = false;
      schedule();
    }
  };

  const syncActivity = () => {
    const nextActive = environment.isVisible() && environment.isFocused();
    if (nextActive === active) {
      if (nextActive) schedule();
      return;
    }
    active = nextActive;
    clearTimer();
    if (active) void run();
  };

  const onActivityChange = () => syncActivity();

  return {
    start: () => {
      if (started) return;
      started = true;
      environment.on("focus", onActivityChange);
      environment.on("blur", onActivityChange);
      environment.on("visibilitychange", onActivityChange);
      syncActivity();
    },
    stop: () => {
      if (!started) return;
      started = false;
      active = false;
      clearTimer();
      environment.off("focus", onActivityChange);
      environment.off("blur", onActivityChange);
      environment.off("visibilitychange", onActivityChange);
    },
  };
}
