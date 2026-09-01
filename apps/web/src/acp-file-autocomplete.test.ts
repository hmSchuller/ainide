import { describe, expect, it } from "vitest";
import { filterAcpFiles, insertAcpFile, matchAcpFileToken, moveAcpFileIndex } from "./acp-file-autocomplete";

const files = [
  { name: "app.ts", path: "src/app.ts", type: "file" as const },
  { name: "README.md", path: "README.md", type: "file" as const },
  { name: "app.test.ts", path: "test/app.test.ts", type: "file" as const },
  { name: "src", path: "src", type: "directory" as const },
];

describe("ACP file autocomplete", () => {
  it("matches @ at the prompt start and after whitespace", () => {
    expect(matchAcpFileToken("@", 1)).toEqual({ query: "", start: 0, end: 1 });
    expect(matchAcpFileToken("Review @src/ap", 14)).toEqual({ query: "src/ap", start: 7, end: 14 });
    expect(matchAcpFileToken("before @src/ap after", 14)).toEqual({ query: "src/ap", start: 7, end: 14 });
  });

  it("does not match embedded or completed whitespace-separated tokens", () => {
    expect(matchAcpFileToken("path/@app", 9)).toBeUndefined();
    expect(matchAcpFileToken("@src/app ", 9)).toBeUndefined();
  });

  it("filters files, ranks path matches, and excludes directories or unsafe paths", () => {
    expect(filterAcpFiles([...files, { name: "secret", path: "../secret", type: "file" }], "app").map((file) => file.path)).toEqual(["src/app.ts", "test/app.test.ts"]);
    expect(filterAcpFiles(files, "").map((file) => file.path)).toEqual(["README.md", "src/app.ts", "test/app.test.ts"]);
    expect(filterAcpFiles(files, "missing")).toEqual([]);
  });

  it("inserts a path while preserving surrounding text and caret", () => {
    const match = matchAcpFileToken("before @src/ap after", 14);
    expect(insertAcpFile("before @src/ap after", match!, { path: "src/app.ts" })).toEqual({ text: "before @src/app.ts  after", caret: 19, mention: "@src/app.ts " });
    expect(moveAcpFileIndex(0, -1, 2)).toBe(1);
  });
});
