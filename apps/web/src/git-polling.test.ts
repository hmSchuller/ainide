import { describe, expect, it, vi } from "vitest";
import { createGitPollingScheduler } from "./git-polling";

function environment() {
  let visible = true;
  let focused = true;
  let nextTimer = 0;
  const timers = new Map<number, () => void>();
  const listeners = new Map<string, Set<() => void>>();
  const emit = (event: "focus" | "blur" | "visibilitychange") => { listeners.get(event)?.forEach((listener) => { listener(); }); };
  return {
    env: {
      isVisible: () => visible,
      isFocused: () => focused,
      schedule: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id; },
      cancel: (timer: unknown) => { timers.delete(timer as number); },
      on: (event: "focus" | "blur" | "visibilitychange", callback: () => void) => { const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event, set); },
      off: (event: "focus" | "blur" | "visibilitychange", callback: () => void) => { listeners.get(event)?.delete(callback); },
    },
    setActive(nextVisible: boolean, nextFocused: boolean) { visible = nextVisible; focused = nextFocused; emit("visibilitychange"); emit("focus"); },
    fire(event: "focus" | "blur" | "visibilitychange") { emit(event); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => { callback(); }); },
    pending() { return timers.size; },
  };
}

describe("focus-aware Git polling", () => {
  it("refreshes immediately, then no more often than the configured interval", async () => {
    const clock = environment();
    const refresh = vi.fn(async () => undefined);
    const scheduler = createGitPollingScheduler(refresh, { environment: clock.env, intervalMs: 2_000 });

    scheduler.start();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(clock.pending()).toBe(1);
    clock.tick();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(clock.pending()).toBe(1);
  });

  it("stops while inactive and refreshes once when active again", async () => {
    const clock = environment();
    const refresh = vi.fn(async () => undefined);
    const scheduler = createGitPollingScheduler(refresh, { environment: clock.env });
    scheduler.start();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    clock.setActive(false, true);
    expect(clock.pending()).toBe(0);
    clock.fire("focus");
    expect(refresh).toHaveBeenCalledTimes(1);
    clock.setActive(true, true);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it("does not overlap a slow request", async () => {
    const clock = environment();
    let resolve: (() => void) | undefined;
    const refresh = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const scheduler = createGitPollingScheduler(refresh, { environment: clock.env });
    scheduler.start();
    expect(refresh).toHaveBeenCalledTimes(1);
    clock.tick();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve?.();
    await vi.waitFor(() => expect(clock.pending()).toBe(1));
    scheduler.stop();
  });

  it("keeps the scheduler retryable after a failed refresh", async () => {
    const clock = environment();
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error("Git unavailable"))
      .mockResolvedValue(undefined);
    const scheduler = createGitPollingScheduler(refresh, { environment: clock.env });
    scheduler.start();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(clock.pending()).toBe(1);
    clock.tick();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    scheduler.stop();
  });
});
