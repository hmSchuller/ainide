import { describe, expect, it } from "vitest";
import { diffLines } from "./line-diff";

describe("line diff", () => {
  it("handles empty baseline and current files", () => {
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines("", "added")).toEqual([
      { kind: "addition", startLine: 1, endLine: 1 },
    ]);
    expect(diffLines("removed", "")).toEqual([
      { kind: "deletion", startLine: 1, endLine: 1, anchorLine: 1 },
    ]);
  });

  it("aligns repeated lines deterministically", () => {
    expect(diffLines("one\nrepeat\ntwo\nrepeat", "one\ntwo\nrepeat")).toEqual([
      { kind: "deletion", startLine: 2, endLine: 2, anchorLine: 2 },
    ]);
  });

  it("reports replacements as modifications", () => {
    expect(diffLines("one\ntwo\nthree", "one\nchanged\nthree")).toEqual([
      { kind: "modification", startLine: 2, endLine: 2 },
    ]);
  });

  it("reports insertions in the current-buffer range", () => {
    expect(diffLines("one\nthree", "one\ntwo\nthree\nfour")).toEqual([
      { kind: "addition", startLine: 2, endLine: 2 },
      { kind: "addition", startLine: 4, endLine: 4 },
    ]);
  });

  it("anchors deletions at the beginning, middle, and EOF", () => {
    expect(diffLines("removed\none\ntwo\nend", "one\ntwo\nend")).toEqual([
      { kind: "deletion", startLine: 1, endLine: 1, anchorLine: 1 },
    ]);
    expect(diffLines("one\nremoved\ntwo\nend", "one\ntwo\nend")).toEqual([
      { kind: "deletion", startLine: 2, endLine: 2, anchorLine: 2 },
    ]);
    expect(diffLines("one\ntwo\nremoved", "one\ntwo")).toEqual([
      { kind: "deletion", startLine: 2, endLine: 2, anchorLine: 2 },
    ]);
  });

  it("reports mixed hunks in current-buffer order", () => {
    expect(diffLines("one\ntwo\nthree\nremove\nfive\nsix\nremove-eof", "zero\ntwo\nchanged\nfive\nnew\nsix")).toEqual([
      { kind: "modification", startLine: 1, endLine: 1 },
      { kind: "modification", startLine: 3, endLine: 3 },
      { kind: "addition", startLine: 5, endLine: 5 },
      { kind: "deletion", startLine: 6, endLine: 6, anchorLine: 6 },
    ]);
  });
});
