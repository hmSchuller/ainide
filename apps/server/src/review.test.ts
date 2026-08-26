import { describe, expect, it } from "vitest";
import { ReviewManager } from "./review.js";

describe("ReviewManager", () => {
  it("reports a useful state when no workspace is open", async () => {
    const manager = new ReviewManager(() => undefined);
    const status = await manager.start("working-tree");

    expect(status.running).toBe(false);
    expect(status.available).toBe(false);
    expect(status.message).toContain("workspace");
    await manager.stop();
  });
});
