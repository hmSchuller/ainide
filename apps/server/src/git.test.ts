import { describe, expect, it } from "vitest";
import { parseGitPorcelain } from "./git.js";

describe("parseGitPorcelain", () => {
  it("parses ordinary, untracked, renamed, and conflicted files", () => {
    const output = [" M src/app.ts", "A  added.ts", "?? scratch.txt", "R  new.ts", "old.ts", "UU conflict.ts", ""].join("\0");
    expect(parseGitPorcelain(output)).toEqual([
      { path: "src/app.ts", status: "modified" },
      { path: "added.ts", status: "added" },
      { path: "scratch.txt", status: "untracked" },
      { path: "new.ts", status: "renamed" },
      { path: "conflict.ts", status: "conflicted" },
    ]);
  });

  it("also accepts the line-oriented porcelain form", () => {
    expect(parseGitPorcelain(" M src/app.ts\n?? scratch.txt\n")).toEqual([
      { path: "src/app.ts", status: "modified" },
      { path: "scratch.txt", status: "untracked" },
    ]);
  });
});
