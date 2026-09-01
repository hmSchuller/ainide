import { describe, expect, it } from "vitest";
import { deduplicateRecentProjects, projectRefFromMutation, readLastWorkspace, readRecentProjects, rememberRecentProject, writeRecentProjects } from "./recent-projects";
import type { ProjectRef } from "@ainide/shared";

function profileStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function project(projectId: string, rootPath = projectId, name = projectId.split("/").pop() ?? projectId): ProjectRef {
  return { projectId, rootPath, name };
}

describe("recent project storage", () => {
  it("returns an empty list for missing, malformed, invalid, or unavailable storage", () => {
    expect(readRecentProjects(undefined)).toEqual([]);
    expect(readRecentProjects({ getItem: () => "not json" })).toEqual([]);
    expect(readRecentProjects({ getItem: () => JSON.stringify({ projectId: "/project" }) })).toEqual([]);
    expect(readRecentProjects({ getItem: () => { throw new Error("storage unavailable"); } })).toEqual([]);
  });

  it("keeps each browser profile's list independent and ordered by successful use", () => {
    const work = profileStorage();
    const privateProfile = profileStorage();
    const workProject = project("/work/project", "/work/project", "work");
    const privateProject = project("/private/project", "/private/project", "private");

    writeRecentProjects([workProject], work);
    writeRecentProjects([privateProject], privateProfile);

    expect(readRecentProjects(work)).toEqual([workProject]);
    expect(readRecentProjects(privateProfile)).toEqual([privateProject]);
  });

  it("deduplicates by resolved project identity and refreshes metadata", () => {
    const oldProject = project("/resolved/project", "/resolved/project", "old-name");
    const otherProject = project("/other/project");
    const refreshedProject = project("/resolved/project", "/resolved/project", "new-name");

    expect(rememberRecentProject([oldProject, otherProject, oldProject], refreshedProject)).toEqual([refreshedProject, otherProject]);
    expect(deduplicateRecentProjects([oldProject, otherProject, oldProject])).toEqual([oldProject, otherProject]);
  });

  it("uses the canonical project returned by a successful mutation only", () => {
    expect(projectRefFromMutation({ rootPath: "/resolved/project", name: "project" }, "/resolved/project")).toEqual(project("/resolved/project"));
    expect(projectRefFromMutation(null, null)).toBeUndefined();
    expect(projectRefFromMutation({ rootPath: "/resolved/project", name: "project" }, null)).toBeUndefined();
  });

  it("filters malformed entries while preserving valid stored order", () => {
    const storage = profileStorage({
      "ainide:recent-projects": JSON.stringify([
        project("/first"),
        { projectId: "/invalid" },
        project("/second"),
        project("/first", "/first", "stale duplicate"),
      ]),
    });

    expect(readRecentProjects(storage)).toEqual([project("/first"), project("/second")]);
  });

  it("does not throw when recent or last-workspace writes fail", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota exceeded"); },
    };

    expect(() => writeRecentProjects([project("/project")], storage)).not.toThrow();
    expect(() => writeRecentProjects([project("/project")], undefined)).not.toThrow();
    expect(() => writeRecentProjects([project("/project")], storage)).not.toThrow();
    expect(() => readLastWorkspace({ getItem: () => { throw new Error("storage unavailable"); } })).not.toThrow();
  });
});
