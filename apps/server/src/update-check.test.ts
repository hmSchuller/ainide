import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, formatUpdateNotice, resolveStartupUpdate, UPDATE_CACHE_TTL_MS, UPDATE_FETCH_TIMEOUT_MS } from "./update-check.js";

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as unknown as Response;
}

describe("checkForUpdate", () => {
  let cacheDir: string;
  let cachePath: string;
  const saved = { value: undefined as string | undefined };

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(os.tmpdir(), "ainide-update-"));
    cachePath = path.join(cacheDir, "update-check.json");
    saved.value = process.env.AINIDE_NO_UPDATE_CHECK;
    delete process.env.AINIDE_NO_UPDATE_CHECK;
  });

  afterEach(async () => {
    if (saved.value === undefined) delete process.env.AINIDE_NO_UPDATE_CHECK;
    else process.env.AINIDE_NO_UPDATE_CHECK = saved.value;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("fetches and caches a release on a cache miss", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: "v2.0.0", html_url: "https://x/v2.0.0", prerelease: false }));
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 });
    expect(result).toEqual({ latest: "v2.0.0", notesUrl: "https://x/v2.0.0" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const cached = JSON.parse(await readFile(cachePath, "utf8"));
    expect(cached).toEqual({ checkedAt: 1000, latest: "v2.0.0", notesUrl: "https://x/v2.0.0" });
  });

  it("serves a fresh cache without fetching (cache hit)", async () => {
    await writeFile(cachePath, JSON.stringify({ checkedAt: 1000, latest: "v2.0.0", notesUrl: "https://x/v2.0.0" }));
    const fetchImpl = vi.fn();
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 + UPDATE_CACHE_TTL_MS - 1 });
    expect(result).toEqual({ latest: "v2.0.0", notesUrl: "https://x/v2.0.0" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refetches when the cache is older than the TTL", async () => {
    await writeFile(cachePath, JSON.stringify({ checkedAt: 1000, latest: "v1.0.0" }));
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: "v3.0.0", html_url: "https://x/v3.0.0" }));
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 + UPDATE_CACHE_TTL_MS + 1 });
    expect(result.latest).toBe("v3.0.0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does nothing before any I/O when AINIDE_NO_UPDATE_CHECK=1", async () => {
    process.env.AINIDE_NO_UPDATE_CHECK = "1";
    const fetchImpl = vi.fn();
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 });
    expect(result).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(readFile(cachePath, "utf8")).rejects.toThrow();
  });

  it("fails silent on a network error and writes no cache", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); });
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 });
    expect(result).toEqual({});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(readFile(cachePath, "utf8")).rejects.toThrow();
  });

  it("fails silent on an HTTP error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "Internal Server Error" }, 500));
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 });
    expect(result).toEqual({});
  });

  it("returns empty when there is no release yet (404)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "Not Found" }, 404));
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 });
    expect(result).toEqual({});
    await expect(readFile(cachePath, "utf8")).rejects.toThrow();
  });

  it("filters out prereleases", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tag_name: "v2.0.0-rc.1", html_url: "https://x", prerelease: true }));
    const result = await checkForUpdate({ cachePath, fetchImpl, now: () => 1000 });
    expect(result).toEqual({});
    await expect(readFile(cachePath, "utf8")).rejects.toThrow();
  });

  it("aborts a stalled fetch so a slow release endpoint cannot block startup", async () => {
    const slow = (init?: RequestInit | undefined) => new Promise<Response>((_resolve, reject) => {
      const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const viFetch = vi.fn((input: string, init?: RequestInit) => {
      expect(typeof input).toBe("string");
      return slow(init);
    }) as unknown as typeof fetch;
    const started = Date.now();
    const result = await checkForUpdate({ cachePath, now: () => 1000, fetchImpl: viFetch });
    expect(result).toEqual({});
    expect(Date.now() - started).toBeLessThan(UPDATE_FETCH_TIMEOUT_MS + 2500);
    expect(viFetch).toHaveBeenCalled();
  });
});

describe("formatUpdateNotice", () => {
  it("returns the update line when a newer release is known", () => {
    const line = formatUpdateNotice("v1.0.0", "v2.0.0", "https://x/v2.0.0");
    expect(line).toContain("v2.0.0");
    expect(line).toContain("v1.0.0");
    expect(line).toContain("ainide update");
    expect(line).toContain("https://x/v2.0.0");
  });
  it("returns undefined when already up to date", () => {
    expect(formatUpdateNotice("v2.0.0", "v2.0.0")).toBeUndefined();
  });
  it("returns undefined when the local version is newer", () => {
    expect(formatUpdateNotice("v3.0.0", "v2.0.0")).toBeUndefined();
  });
  it("returns undefined when no release is known", () => {
    expect(formatUpdateNotice("v1.0.0", undefined)).toBeUndefined();
  });
});

describe("resolveStartupUpdate", () => {
  it("includes a notice only when the latest release is newer", async () => {
    const update = await resolveStartupUpdate({
      resolveVersion: async () => "v1.0.0",
      check: async () => ({ latest: "v2.0.0", notesUrl: "https://x/v2.0.0" }),
    });
    expect(update.current).toBe("v1.0.0");
    expect(update.latest).toBe("v2.0.0");
    expect(update.notice).toContain("v2.0.0");
  });
  it("omits the notice when already up to date", async () => {
    const update = await resolveStartupUpdate({
      resolveVersion: async () => "v2.0.0",
      check: async () => ({ latest: "v2.0.0", notesUrl: "https://x/v2.0.0" }),
    });
    expect(update.notice).toBeUndefined();
  });
  it("omits the notice when the check found nothing", async () => {
    const update = await resolveStartupUpdate({
      resolveVersion: async () => "v2.0.0",
      check: async () => ({}),
    });
    expect(update.notice).toBeUndefined();
    expect(update.latest).toBeUndefined();
  });
});
