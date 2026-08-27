import { describe, expect, it } from "vitest";
import { copyTextToClipboard } from "./clipboard";

describe("clipboard helpers", () => {
  it("writes text to the clipboard when available", async () => {
    const writes: string[] = [];
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: async (text: string) => { writes.push(text); } } },
    });
    await expect(copyTextToClipboard("src/a.ts")).resolves.toBe(true);
    expect(writes).toEqual(["src/a.ts"]);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
  });
});
