import { describe, expect, it } from "vitest";
import { diffLines } from "./line-diff";
import { applyDiskToTabs, captureProjectBag, emptyProjectBag, eventBelongsToActiveProject, explorerPathsForGitChanges, gitChangeType, gitStatusEqual, gitStatusPaths, snapshotFromBag } from "./project-ui";
import type { EditorTab } from "./types";

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return { path: "src/a.ts", name: "a.ts", content: "clean", savedContent: "clean", language: "typescript", ...overrides };
}

describe("project UI bags", () => {
  it("normalizes Git file ordering and reconciles the previous/current path union", () => {
    const previous = { branch: "main", dirty: true, isRepository: true, files: [{ path: "src/b.ts", status: "modified" as const }, { path: "src/a.ts", status: "added" as const }], summary: { filesChanged: 2, insertions: 1, deletions: 0 } };
    const current = { ...previous, files: [{ path: "src/a.ts", status: "added" as const }, { path: "src/c.ts", status: "deleted" as const }] };
    expect(gitStatusEqual(previous, { ...previous, files: [...previous.files].reverse() })).toBe(true);
    expect(gitStatusPaths(previous, current)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(explorerPathsForGitChanges({ "": true, src: true, docs: true, closed: false }, ["src/c.ts"])).toEqual(["", "src"]);
    expect(gitChangeType(previous, current, "src/c.ts")).toBe("deleted");
    expect(gitChangeType(previous, { ...previous, files: [...previous.files, { path: "new.ts", status: "untracked" as const }] }, "new.ts")).toBe("created");
    expect(gitChangeType(previous, { ...previous, files: [] }, "src/b.ts")).toBe("changed");
    expect(gitStatusEqual({ ...previous, head: "one" }, { ...previous, head: "two" })).toBe(false);
    expect(gitStatusPaths(undefined, { ...previous, files: [{ path: "new.ts", status: "renamed", previousPath: "old.ts" }] })).toEqual(["new.ts", "old.ts"]);
  });

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

  it("derives markers from the visible buffer while preserving disk conflicts", () => {
    const baseline = "one\ntwo\n";
    const dirty = tab({ content: "one\nTWO\n", savedContent: baseline });
    expect(diffLines(baseline, dirty.content)).toEqual([{ kind: "modification", startLine: 2, endLine: 2 }]);

    const reloaded = applyDiskToTabs([tab({ content: baseline, savedContent: baseline })], { "src/a.ts": { content: "one\nthree\n" } })[0]!;
    expect(diffLines(baseline, reloaded.content)).toEqual([{ kind: "modification", startLine: 2, endLine: 2 }]);

    const conflict = applyDiskToTabs([dirty], { "src/a.ts": { content: "one\nexternal\n" } })[0]!;
    expect(conflict.content).toBe(dirty.content);
    expect(conflict.conflict?.externalContent).toBe("one\nexternal\n");
    expect(diffLines(baseline, conflict.content)).toEqual([{ kind: "modification", startLine: 2, endLine: 2 }]);
  });

  it("preserves binary and unreadable file states during disk reconciliation", () => {
    const tabs = [tab({ path: "image.png" }), tab({ path: "missing.ts" })];
    const next = applyDiskToTabs(tabs, {
      "image.png": { binary: true },
      "missing.ts": { error: "File deleted on disk" },
    });
    expect(next[0]).toMatchObject({ path: "image.png", content: "clean", binary: true });
    expect(next[1]).toMatchObject({ path: "missing.ts", content: "clean", error: "File deleted on disk" });
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
      titleSource: "user",
      acpSessionId: "provider-1",
      authMethods: [],
      status: "live",
      capabilities: { canCancel: true, canClose: false, canLoad: false, canList: false, canResume: false, canSetConfig: false, canReadTextFile: true, canWriteTextFile: true, canUseTerminal: true, canRequestPermission: true, canElicit: true },
      configOptions: [],
      availableCommands: [],
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
    expect(snapshot.acpSessions).toEqual([{ id: "acp-1", title: "Implement", titleSource: "user", providerId: "cursor", acpSessionId: "provider-1", resumability: "resumable" }]);
    expect(JSON.stringify(snapshot)).not.toContain("history");
    expect(JSON.stringify(snapshot)).not.toContain("draft");
  });
});
