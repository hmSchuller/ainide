import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectAgentSettings } from "@ainide/shared";
import {
  addBuildRow,
  emptyBuildRow,
  ProjectAgentSettingsDialog,
  removeBuildRow,
  trimBuildRows,
  updateBuildRow,
  validateBuildRows,
} from "./ProjectAgentSettingsDialog";

const settings: ProjectAgentSettings = {
  all: [
    { id: "cursor", label: "Cursor" },
    { id: "opencode", label: "OpenCode" },
    { id: "gemini", label: "Gemini" },
  ],
  disabled: ["gemini"],
};

const props = {
  settings,
  builds: [],
  loading: false,
  onRetry: () => undefined,
  onToggle: () => undefined,
  onSaveBuilds: async () => undefined,
  onClose: () => undefined,
};

describe("ProjectAgentSettingsDialog", () => {
  it("lists every configured agent and reflects the active project's disabled set", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} />);
    expect(markup).toContain("Cursor");
    expect(markup).toContain("OpenCode");
    expect(markup).toContain("Gemini");
    expect(markup.match(/Disabled for this project/g)?.length).toBe(1);
    expect(markup.match(/Available in this project/g)?.length).toBe(2);
  });

  it("updates which agents are disabled when the set changes", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} settings={{ ...settings, disabled: ["cursor", "gemini"] }} />);
    expect(markup.match(/Disabled for this project/g)?.length).toBe(2);
    expect(markup.match(/Available in this project/g)?.length).toBe(1);
  });

  it("shows a configured-empty state when no agents exist", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} settings={{ all: [], disabled: [] }} />);
    expect(markup).toContain("No ACP providers configured");
  });

  it("renders the build commands section with a row per stored command and an add control", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} builds={[{ label: "Build", command: "npm run build" }, { label: "Test", command: "npm test" }]} />);
    expect(markup).toContain("Build commands");
    expect(markup).toContain("Build command 1 label");
    expect(markup).toContain("Build command 1 command");
    expect(markup).toContain("Build command 2 label");
    expect(markup).toContain("Build command 2 command");
    expect(markup).toContain("Remove build command 1");
    expect(markup).toContain("Remove build command 2");
    expect(markup).toContain("+ Add command");
    expect(markup).toContain("Done");
  });
});

describe("build command draft rows", () => {
  it("adds and removes rows while preserving the remaining edits", () => {
    const rows = [{ label: "Build", command: "npm run build" }];
    const added = addBuildRow(rows);
    expect(added).toEqual([rows[0], emptyBuildRow()]);
    const removed = removeBuildRow(added, 1);
    expect(removed).toEqual(rows);
    expect(removeBuildRow(removed, 0)).toEqual([]);
  });

  it("updates a single row by index", () => {
    const rows = [{ label: "Build", command: "npm run build" }, { label: "Test", command: "npm test" }];
    const updated = updateBuildRow(rows, 1, { command: "npm run test:ci" });
    expect(updated[1]).toEqual({ label: "Test", command: "npm run test:ci" });
    expect(updated[0]).toEqual(rows[0]);
  });

  it("trims label and command on save", () => {
    expect(trimBuildRows([{ label: " Build ", command: " npm run build " }])).toEqual([{ label: "Build", command: "npm run build" }]);
  });

  it("blocks saving rows with blank or over-limit fields and over-limit lists", () => {
    expect(validateBuildRows([])).toBeTruthy();
    expect(validateBuildRows([{ label: "", command: "x" }])).toBeTruthy();
    expect(validateBuildRows([{ label: "x", command: "  " }])).toBeTruthy();
    expect(validateBuildRows([{ label: "x".repeat(81), command: "y" }])).toBeTruthy();
    expect(validateBuildRows([{ label: "x", command: "y".repeat(501) }])).toBeTruthy();
    expect(validateBuildRows(Array.from({ length: 21 }, (_, index) => ({ label: `L${index}`, command: "c" })))).toBeTruthy();
  });

  it("accepts rows with trimmed non-empty fields within the limits", () => {
    expect(validateBuildRows([{ label: " Build ", command: " npm run build " }])).toBeUndefined();
    expect(validateBuildRows([{ label: "x".repeat(80), command: "y".repeat(500) }])).toBeUndefined();
    expect(validateBuildRows(Array.from({ length: 20 }, (_, index) => ({ label: `L${index}`, command: "c" })))).toBeUndefined();
  });
});