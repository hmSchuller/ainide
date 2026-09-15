import { describe, expect, it } from "vitest";
import { persistTerminalCollapsed, readTerminalCollapsedPreference, readAgentNavigatorCollapsedPreference, persistAgentNavigatorCollapsed, shouldDismissExplorerPresentation, shouldShowReferenceDock, terminalPanelVisible, workbenchClassName } from "./layout-prefs";
import { emptyProjectBag, snapshotFromBag } from "./project-ui";

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

  it("hides the explorer in Review and Agents modes", () => {
    expect(workbenchClassName("review")).toBe("workbench review-mode");
    expect(workbenchClassName("agents")).toBe("workbench agents-mode");
    expect(shouldDismissExplorerPresentation("review")).toBe(true);
    expect(shouldDismissExplorerPresentation("agents")).toBe(true);
    for (const mode of ["edit", "lazygit"] as const) {
      expect(workbenchClassName(mode)).toBe("workbench");
      expect(shouldDismissExplorerPresentation(mode)).toBe(false);
    }
  });

  it("defaults the agent navigator to expanded and persists collapse preference", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readAgentNavigatorCollapsedPreference(storage)).toBe(false);
    persistAgentNavigatorCollapsed(true, storage);
    expect(readAgentNavigatorCollapsedPreference(storage)).toBe(true);
  });
});
