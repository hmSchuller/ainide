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

import type { TerminalSession } from "@ainide/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { useAppStore } from "../store";
import { BuildRunner, findLiveBuild, resolveSelectedBuild } from "./BuildRunner";

beforeEach(() => {
  vi.unstubAllGlobals();
  useAppStore.setState({ buildCommands: [], buildSelections: {}, activeProjectId: undefined });
});

function session(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: "s1",
    title: "Build",
    command: "npm run build",
    cwd: "/proj-a",
    alive: true,
    kind: "build",
    projectId: "/proj-a",
    ...overrides,
  };
}

const commands = [
  { label: "Build", command: "npm run build" },
  { label: "Test", command: "npm test" },
];

describe("BuildRunner", () => {
  it("shows the empty state: hint, disabled dropdown, and disabled run control", () => {
    const markup = renderToStaticMarkup(<BuildRunner onOpenSettings={() => undefined} />);
    expect(markup).toContain("No build commands");
    expect(markup).toContain("Settings");
    expect(markup).toContain("<select");
    expect(markup).toContain("disabled");
    expect(markup).toContain("▶");
  });

  it("resolves the remembered selection in definition order", () => {
    expect(resolveSelectedBuild(commands, undefined)?.label).toBe("Build");
    expect(resolveSelectedBuild(commands, "Test")?.label).toBe("Test");
    expect(resolveSelectedBuild(commands, "Deploy")?.label).toBe("Build");
    expect(resolveSelectedBuild([], "Build")).toBeUndefined();
  });

  it("derives the live build for the active project only", () => {
    expect(findLiveBuild([session({ id: "running", alive: true })], "/proj-a")?.id).toBe("running");
    expect(findLiveBuild([session({ id: "running", alive: true })], "/proj-b")).toBeUndefined();
    expect(findLiveBuild([session({ id: "done", alive: false })], "/proj-a")).toBeUndefined();
    expect(findLiveBuild([session({ id: "shell", kind: "shell" })], "/proj-a")).toBeUndefined();
    expect(findLiveBuild([session({ id: "other", projectId: "/proj-b", alive: true })], "/proj-a")).toBeUndefined();
  });
});