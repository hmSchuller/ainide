import { describe, expect, it } from "vitest";
import { emptyProjectBag, snapshotFromBag } from "./project-ui";
import { persistTerminalCollapsed, readTerminalCollapsedPreference, shouldShowReferenceDock, terminalPanelVisible } from "./layout-prefs";

describe("layout preferences", () => {
  it("defaults the terminal panel to collapsed when no preference exists", () => {
    const storage = { getItem: () => null, setItem: () => undefined };
    expect(readTerminalCollapsedPreference(storage)).toBe(true);
  });

  it("restores a saved terminal collapse preference", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    persistTerminalCollapsed(false, storage);
    expect(readTerminalCollapsedPreference(storage)).toBe(false);
    persistTerminalCollapsed(true, storage);
    expect(readTerminalCollapsedPreference(storage)).toBe(true);
  });

  it("does not serialize terminal collapse into disk snapshots", () => {
    const bag = emptyProjectBag();
    const snapshot = snapshotFromBag({ rootPath: "/proj-a", name: "a" }, bag);
    expect(JSON.stringify(snapshot)).not.toContain("terminalCollapsed");
    expect(JSON.stringify(snapshot)).not.toContain("ainide:terminal-collapsed");
  });

  it("hides the reference dock until the kit has items", () => {
    expect(shouldShowReferenceDock(0)).toBe(false);
    expect(shouldShowReferenceDock(1)).toBe(true);
    expect(shouldShowReferenceDock(0)).toBe(false);
  });

  it("shows the utility terminal panel in every primary mode", () => {
    expect(terminalPanelVisible("edit")).toBe(true);
    expect(terminalPanelVisible("review")).toBe(true);
    expect(terminalPanelVisible("agents")).toBe(true);
    expect(terminalPanelVisible("lazygit")).toBe(true);
  });
});
