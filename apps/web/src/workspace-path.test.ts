import { describe, expect, it } from "vitest";
import { displayWorkspacePath, isAbsoluteWorkspacePath, parentWorkspacePath, workspacePathCompletion } from "./workspace-path";

describe("workspace picker paths", () => {
  it("renders the server home and nested paths as tilde paths", () => {
    expect(displayWorkspacePath("/Users/me", "/Users/me")).toBe("~");
    expect(displayWorkspacePath("/Users/me/projects/app", "/Users/me")).toBe("~/projects/app");
    expect(displayWorkspacePath("/Users/other", "/Users/me")).toBe("/Users/other");
  });

  it("handles POSIX and Windows parents including roots", () => {
    expect(parentWorkspacePath("/Users/me/projects")).toBe("/Users/me");
    expect(parentWorkspacePath("/")).toBe("/");
    expect(parentWorkspacePath("C:\\Users\\me\\projects")).toBe("C:\\Users\\me");
    expect(parentWorkspacePath("C:\\")).toBe("C:\\");
    expect(displayWorkspacePath("C:\\Users\\me\\projects", "C:\\Users\\me")).toBe("~\\projects");
  });

  it("limits completion to one immediate parent and preserves malformed input", () => {
    expect(workspacePathCompletion("~/projects/ap")).toEqual({ parentPath: "~/projects", query: "ap" });
    expect(workspacePathCompletion("C:\\Users\\me\\")).toEqual({ parentPath: "C:\\Users\\me", query: "" });
    expect(workspacePathCompletion("relative/path")).toBeUndefined();
    expect(displayWorkspacePath("~other-user/project", "/Users/me")).toBe("~other-user/project");
    expect(isAbsoluteWorkspacePath("/tmp")).toBe(true);
    expect(isAbsoluteWorkspacePath("C:\\tmp")).toBe(true);
    expect(isAbsoluteWorkspacePath("tmp")).toBe(false);
  });
});
