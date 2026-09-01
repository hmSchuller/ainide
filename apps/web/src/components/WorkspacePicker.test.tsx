import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspacePicker } from "./WorkspacePicker";

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

  it("keeps manual entry and the last-workspace hint when recents are empty", () => {
    const markup = renderToStaticMarkup(<WorkspacePicker initialPath="/old/workspace" recentProjects={[]} busy={false} onOpen={() => undefined} />);

    expect(markup).not.toContain("Recent projects");
    expect(markup).toContain('value="/old/workspace"');
    expect(markup).toContain('placeholder="/Users/you/src/project"');
  });
});
