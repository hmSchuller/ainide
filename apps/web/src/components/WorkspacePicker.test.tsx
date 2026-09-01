import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspacePicker, WorkspacePickerManualEntry } from "./WorkspacePicker";

const recentProjects = [
  { projectId: "/work/first", rootPath: "/work/first", name: "first" },
  { projectId: "/work/second", rootPath: "/work/second", name: "second" },
];

describe("WorkspacePicker", () => {
  it("renders profile-local recent projects in the supplied order", () => {
    const markup = renderToStaticMarkup(<WorkspacePicker recentProjects={recentProjects} busy={false} onOpen={() => undefined} />);

    expect(markup).toContain("Recent projects");
    expect(markup.indexOf("first")).toBeLessThan(markup.indexOf("second"));
    expect(markup).toContain("/work/first");
    expect(markup).toContain("/work/second");
    expect(markup).not.toContain("server-global-project");
  });

  it("starts every session at home while keeping manual entry available", () => {
    const markup = renderToStaticMarkup(<WorkspacePicker recentProjects={[]} busy={false} onOpen={() => undefined} />);

    expect(markup).not.toContain("Recent projects");
    expect(markup).toContain("<code>~</code>");
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('value="~"');
    expect(markup).toContain('placeholder="~/src/project or /Users/you/src/project"');
    expect(markup).toContain("Open project");
  });

  it("presents manual entry and opening before directory browsing", () => {
    const markup = renderToStaticMarkup(<WorkspacePicker recentProjects={[]} busy={false} onOpen={() => undefined} />);

    const manualEntry = markup.indexOf('class="picker-manual-entry"');
    const pathField = markup.indexOf('id="workspace-path"');
    const openAction = markup.indexOf('class="primary-button open-button"');
    const browser = markup.indexOf("Current directory");

    expect(manualEntry).toBeGreaterThan(-1);
    expect(pathField).toBeGreaterThan(manualEntry);
    expect(openAction).toBeGreaterThan(pathField);
    expect(browser).toBeGreaterThan(openAction);
  });

  it("keeps the suggestion list associated with the path entry", () => {
    const markup = renderToStaticMarkup(
      <div>
        <WorkspacePickerManualEntry
          path="~/src"
          suggestions={[{ name: "project", path: "~/src/project" }]}
          activeSuggestion={-1}
          onChange={() => undefined}
          onKeyDown={() => undefined}
          onSuggestionSelect={() => undefined}
        />
        <button className="primary-button open-button" type="button">Open project</button>
        <span>Current directory</span>
      </div>,
    );

    const pathField = markup.indexOf('id="workspace-path"');
    const listbox = markup.indexOf('role="listbox"');
    const openAction = markup.indexOf('class="primary-button open-button"');
    const browser = markup.indexOf("Current directory");

    expect(markup).toContain('aria-controls="workspace-path-suggestions"');
    expect(markup).toContain('class="path-entry picker-path-entry"');
    expect(markup).toContain('aria-expanded="true"');
    expect(listbox).toBeGreaterThan(pathField);
    expect(openAction).toBeGreaterThan(listbox);
    expect(browser).toBeGreaterThan(openAction);
  });
});
