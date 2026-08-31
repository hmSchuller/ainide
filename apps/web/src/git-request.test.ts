import { describe, expect, it } from "vitest";
import { createGitRequestCoordinator } from "./git-request";

describe("Git request coordination", () => {
  const current = { token: "token", activeProjectId: "/project", workspaceRoot: "/project" };

  it("rejects an older response after a newer request starts", () => {
    const coordinator = createGitRequestCoordinator();
    const first = coordinator.begin();
    const second = coordinator.begin();
    expect(coordinator.isCurrent(first, "/project", "token", current)).toBe(false);
    expect(coordinator.isCurrent(second, "/project", "token", current)).toBe(true);
  });

  it("rejects responses from a switched project or token", () => {
    const coordinator = createGitRequestCoordinator();
    const request = coordinator.begin();
    expect(coordinator.isCurrent(request, "/other", "token", current)).toBe(false);
    expect(coordinator.isCurrent(request, "/project", "other-token", current)).toBe(false);
    expect(coordinator.isCurrent(request, "/project", "token", { ...current, workspaceRoot: "/other" })).toBe(false);
  });
});
