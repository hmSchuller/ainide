import { describe, expect, it } from "vitest";
import { persistBuildSelection, readBuildSelections, resolveBuildSelection, BUILD_SELECTIONS_KEY } from "./build-selections";

function memoryStorage(): { values: Map<string, string>; getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

const commands = [
  { label: "Build", command: "npm run build" },
  { label: "Test", command: "npm test" },
  { label: "Lint", command: "npm run lint" },
];

describe("build command selection", () => {
  it("defaults to the first defined command when nothing is remembered", () => {
    expect(resolveBuildSelection(commands, undefined)).toBe("Build");
  });

  it("restores the remembered label when it is still defined", () => {
    expect(resolveBuildSelection(commands, "Lint")).toBe("Lint");
  });

  it("falls back to the first command when the remembered label no longer exists", () => {
    expect(resolveBuildSelection(commands, "Deploy")).toBe("Build");
  });

  it("resolves to undefined for an empty command list", () => {
    expect(resolveBuildSelection([], "Build")).toBeUndefined();
    expect(resolveBuildSelection([], undefined)).toBeUndefined();
  });

  it("persists selections per project without leaking between projects", () => {
    const storage = memoryStorage();
    persistBuildSelection("/proj-a", "Lint", storage);
    persistBuildSelection("/proj-b", "Test", storage);
    expect(readBuildSelections(storage)).toEqual({ "/proj-a": "Lint", "/proj-b": "Test" });
    persistBuildSelection("/proj-a", "Test", storage);
    expect(readBuildSelections(storage)).toEqual({ "/proj-a": "Test", "/proj-b": "Test" });
    expect(storage.values.get(BUILD_SELECTIONS_KEY)).toContain('"/proj-b":"Test"');
  });

  it("ignores malformed stored selections", () => {
    const storage = memoryStorage();
    storage.values.set(BUILD_SELECTIONS_KEY, JSON.stringify({ "/proj-a": 42, "/proj-b": "", "/proj-c": "ok" }));
    expect(readBuildSelections(storage)).toEqual({ "/proj-c": "ok" });
    storage.values.set(BUILD_SELECTIONS_KEY, "not json");
    expect(readBuildSelections(storage)).toEqual({});
  });
});