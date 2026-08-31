import { describe, expect, it } from "vitest";
import type { EditorTab } from "./types";
import { applyDiskToTabs, captureProjectBag, emptyProjectBag, eventBelongsToActiveProject, knownProjectSeed, snapshotFromBag } from "./project-ui";

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return { path: "src/a.ts", name: "a.ts", content: "clean", savedContent: "clean", language: "typescript", ...overrides };
}

describe("project UI bags", () => {
  it("keeps dirty buffer contents across switch-and-back", () => {
    const dirty = emptyProjectBag();
    dirty.tabs = [tab({ content: "UNSAVED", savedContent: "clean" })];
    const bags: Record<string, ReturnType<typeof captureProjectBag>> = {};
    bags["/proj-a"] = captureProjectBag(dirty);
    const other = emptyProjectBag();
    other.tabs = [tab({ path: "b.ts", name: "b.ts", content: "other", savedContent: "other" })];
    bags["/proj-b"] = captureProjectBag(other);
    const restored = bags["/proj-a"];
    expect(restored.tabs[0]?.content).toBe("UNSAVED");
    expect(restored.tabs[0]?.savedContent).toBe("clean");
  });

  it("ignores events for a non-active projectId", () => {
    const event = { type: "file_changed" as const, projectId: "/hidden", path: "src/a.ts", change: "changed" as const };
    expect(eventBelongsToActiveProject(event, "/active")).toBe(false);
    expect(eventBelongsToActiveProject({ ...event, projectId: "/active" }, "/active")).toBe(true);
  });

  it("reloads clean tabs from disk and flags dirty conflicts after activate", () => {
    const tabs = [
      tab({ path: "clean.ts", name: "clean.ts", content: "old", savedContent: "old" }),
      tab({ path: "dirty.ts", name: "dirty.ts", content: "UNSAVED", savedContent: "old" }),
    ];
    const next = applyDiskToTabs(tabs, {
      "clean.ts": { content: "hidden-agent-change" },
      "dirty.ts": { content: "disk" },
    });
    expect(next[0]?.content).toBe("hidden-agent-change");
    expect(next[0]?.savedContent).toBe("hidden-agent-change");
    expect(next[1]?.content).toBe("UNSAVED");
    expect(next[1]?.conflict?.externalContent).toBe("disk");
  });

  it("seeds the picker from last-workspace only when no known projects exist", () => {
    expect(knownProjectSeed([], "/old/path")).toBe("/old/path");
    expect(knownProjectSeed([{ projectId: "/known", rootPath: "/known", name: "known" }], "/old/path")).toBe("/known");
  });

  it("keeps reference kits isolated in bags but excludes them from disk snapshots", () => {
    const first = emptyProjectBag();
    first.referenceKit = [{ id: "a", path: "src/a.ts", startLine: 2, endLine: 3, wholeFile: false, content: "a", language: "typescript" }];
    first.referenceTargetId = "agent-a";
    const second = emptyProjectBag();
    second.referenceKit = [{ id: "b", path: "src/b.ts", wholeFile: true, content: "b", language: "typescript" }];
    const firstBag = captureProjectBag(first);
    const secondBag = captureProjectBag(second);
    expect(firstBag.referenceKit).toHaveLength(1);
    expect(secondBag.referenceKit[0]?.path).toBe("src/b.ts");
    expect(JSON.stringify(snapshotFromBag({ rootPath: "/proj-a", name: "a" }, firstBag))).not.toContain("referenceKit");
    expect(JSON.stringify(snapshotFromBag({ rootPath: "/proj-a", name: "a" }, firstBag))).not.toContain("agent-a");
  });

  it("restores Agents mode and records same-kind sessions without replacing them", () => {
    const bag = emptyProjectBag();
    bag.mode = "agents";
    bag.terminals = [
      { id: "one", title: "Implement", command: "ignored", cwd: "/proj-a", alive: true, kind: "agent", projectId: "/proj-a" },
      { id: "two", title: "Plan next task", command: "ignored", cwd: "/proj-a", alive: false, kind: "agent", projectId: "/proj-a" },
      { id: "shell", title: "Shell", command: "sh", cwd: "/proj-a", alive: true, kind: "shell", projectId: "/proj-a" },
    ];
    const snapshot = snapshotFromBag({ rootPath: "/proj-a", name: "a" }, captureProjectBag(bag));
    expect(snapshot.mode).toBe("agents");
    expect(snapshot.agentSessions).toEqual([{ title: "Implement" }, { title: "Plan next task" }]);
    expect(snapshot.terminalKinds).toEqual(["shell"]);
  });

  it("restores LazyGit mode and records same-kind sessions without replacing them", () => {
    const bag = emptyProjectBag();
    bag.mode = "lazygit";
    bag.terminals = [
      { id: "lazy", title: "Lazygit", command: "ignored", cwd: "/proj-a", alive: true, kind: "lazygit", projectId: "/proj-a" },
      { id: "shell", title: "Shell", command: "sh", cwd: "/proj-a", alive: true, kind: "shell", projectId: "/proj-a" },
    ];
    const snapshot = snapshotFromBag({ rootPath: "/proj-a", name: "a" }, captureProjectBag(bag));
    expect(snapshot.mode).toBe("lazygit");
    expect(snapshot.terminalKinds).toEqual(["lazygit", "shell"]);
  });

  it("keeps ACP history and drafts in the project bag but persists only safe descriptors", () => {
    const bag = emptyProjectBag();
    bag.acpSessions = [{
      id: "acp-1",
      title: "Implement",
      projectId: "/proj-a",
      providerId: "cursor",
      providerLabel: "Cursor",
      acpSessionId: "provider-1",
      authMethods: [],
      status: "live",
      capabilities: { canCancel: true, canClose: false, canLoad: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
      configOptions: [],
      pendingRequests: [],
      activePrompt: false,
      resumability: "resumable",
    }];
    bag.acpHistory["acp-1"] = [{ type: "message", id: "message-1", role: "agent", text: "history" }];
    bag.acpDrafts["acp-1"] = { text: "draft", references: [{ id: "ref-1", path: "src/a.ts", startLine: 2, endLine: 3, wholeFile: false, content: "code", language: "typescript" }] };
    const captured = captureProjectBag(bag);
    expect(captured.acpHistory["acp-1"]).toEqual([{ type: "message", id: "message-1", role: "agent", text: "history" }]);
    expect(captured.acpDrafts["acp-1"]?.references[0]?.startLine).toBe(2);
    const snapshot = snapshotFromBag({ rootPath: "/proj-a", name: "a" }, captured);
    expect(snapshot.acpSessions).toEqual([{ id: "acp-1", title: "Implement", providerId: "cursor", acpSessionId: "provider-1", resumability: "resumable" }]);
    expect(JSON.stringify(snapshot)).not.toContain("history");
    expect(JSON.stringify(snapshot)).not.toContain("draft");
  });
});
