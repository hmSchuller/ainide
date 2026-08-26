import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutoSaver } from "./auto-save";

describe("createAutoSaver", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces saves until the delay elapses", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const autoSaver = createAutoSaver(async (path) => {
      saves.push(path);
    }, 500);

    autoSaver.schedule("a.ts");
    autoSaver.schedule("a.ts");
    expect(saves).toEqual([]);

    await vi.advanceTimersByTimeAsync(499);
    expect(saves).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toEqual(["a.ts"]);
  });

  it("flush runs a pending save immediately", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const autoSaver = createAutoSaver(async (path) => {
      saves.push(path);
    }, 1000);

    autoSaver.schedule("b.ts");
    await autoSaver.flush("b.ts");
    expect(saves).toEqual(["b.ts"]);
  });

  it("cancel drops a scheduled save", async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const autoSaver = createAutoSaver(async (path) => {
      saves.push(path);
    }, 1000);

    autoSaver.schedule("c.ts");
    autoSaver.cancel("c.ts");
    await vi.advanceTimersByTimeAsync(1000);
    expect(saves).toEqual([]);
  });
});
