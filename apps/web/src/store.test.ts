import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
  });
});

import { findPaneForPath, useAppStore } from "./store";

describe("store tab rename", () => {
  beforeEach(() => {
    useAppStore.setState({
      tabs: [{ path: "src/old.ts", name: "old.ts", content: "a", savedContent: "a", language: "typescript" }],
      panes: {
        primary: { tabPaths: ["src/old.ts"], activePath: "src/old.ts" },
        secondary: { tabPaths: [], activePath: undefined },
      },
      secondaryOpen: false,
      focusedPaneId: "primary",
    });
  });

  it("updates tab paths and pane state when a file is renamed", () => {
    useAppStore.getState().renameTabPath("src/old.ts", "src/new.ts");
    const state = useAppStore.getState();
    expect(state.tabs[0]?.path).toBe("src/new.ts");
    expect(state.panes.primary.tabPaths).toEqual(["src/new.ts"]);
    expect(state.panes.primary.activePath).toBe("src/new.ts");
    expect(findPaneForPath(state.panes, "src/new.ts")).toBe("primary");
  });
});
