import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./unified-diff";

describe("parseUnifiedDiff", () => {
  it("classifies unified diff lines", () => {
    const diff = [
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,3 @@",
      " context",
      "-removed",
      "+added",
      "\\ No newline at end of file",
    ].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual([
      { kind: "header", text: "--- a/src/app.ts" },
      { kind: "header", text: "+++ b/src/app.ts" },
      { kind: "hunk", text: "@@ -1,3 +1,3 @@" },
      { kind: "context", text: " context" },
      { kind: "deletion", text: "-removed" },
      { kind: "addition", text: "+added" },
      { kind: "meta", text: "\\ No newline at end of file" },
    ]);
  });

  it("returns an empty list for blank diffs", () => {
    expect(parseUnifiedDiff("   ")).toEqual([]);
  });
});
