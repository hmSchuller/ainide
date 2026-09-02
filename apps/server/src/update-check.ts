import { promises as fs } from "node:fs";
import path from "node:path";
import { isNewerRelease } from "@ainide/shared";
import { configFilePath } from "./config.js";
import { resolveLocalVersion } from "./version.js";

export const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_FETCH_TIMEOUT_MS = 2000;

const REPO = "hmSchuller/ainide";
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateCheckResult {
  latest?: string;
  notesUrl?: string;
}

export interface UpdateCheckDeps {
  cachePath?: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export interface StartupUpdate {
  current: string;
  latest?: string;
  notesUrl?: string;
  notice?: string;
}

export interface StartupUpdateDeps {
  resolveVersion?: () => Promise<string>;
  check?: () => Promise<UpdateCheckResult>;
}

interface CacheFile {
  checkedAt: number;
  latest?: string;
  notesUrl?: string;
}

export function updateCheckFilePath(): string {
  return process.env.AINIDE_UPDATE_CHECK ?? path.join(path.dirname(configFilePath()), "update-check.json");
}

/**
 * Returns the latest non-prerelease release, honoring a 6-hour cache and the
 * `AINIDE_NO_UPDATE_CHECK=1` kill switch. The check is fail-silent: any network,
 * HTTP, parse, or "no release yet" condition resolves to an empty result without
 * logging or throwing, and leaves any existing cache untouched.
 */
export async function checkForUpdate(deps: UpdateCheckDeps = {}): Promise<UpdateCheckResult> {
  if (process.env.AINIDE_NO_UPDATE_CHECK === "1") return {};
  const cachePath = deps.cachePath ?? updateCheckFilePath();
  const now = deps.now ?? (() => Date.now());
  const fetchImpl = deps.fetchImpl ?? fetch;

  const cached = await readCache(cachePath);
  if (cached && now() - cached.checkedAt < UPDATE_CACHE_TTL_MS) {
    return { ...(cached.latest ? { latest: cached.latest } : {}), ...(cached.notesUrl ? { notesUrl: cached.notesUrl } : {}) };
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
    const response = await fetchImpl(LATEST_RELEASE_URL, { signal: controller.signal });
    if (!response.ok) return {};
    const payload = (await response.json()) as { tag_name?: unknown; html_url?: unknown; prerelease?: unknown };
    const tag = typeof payload.tag_name === "string" ? payload.tag_name.trim() : "";
    if (!tag || payload.prerelease === true) return {};
    const result: UpdateCheckResult = { latest: tag, ...(typeof payload.html_url === "string" ? { notesUrl: payload.html_url } : {}) };
    await writeCache(cachePath, { checkedAt: now(), ...result });
    return result;
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Resolves the local version, runs the update check, and derives the optional
 * startup notice line. The notice is present only when a newer release is known.
 */
export async function resolveStartupUpdate(deps: StartupUpdateDeps = {}): Promise<StartupUpdate> {
  const resolveVersion = deps.resolveVersion ?? resolveLocalVersion;
  const check = deps.check ?? checkForUpdate;
  const current = await resolveVersion();
  const result = await check();
  const notice = formatUpdateNotice(current, result.latest, result.notesUrl);
  return {
    current,
    ...(result.latest ? { latest: result.latest } : {}),
    ...(result.notesUrl ? { notesUrl: result.notesUrl } : {}),
    ...(notice ? { notice } : {}),
  };
}

/**
 * Returns the terminal update line for a known newer release, or undefined when
 * no newer release is available.
 */
export function formatUpdateNotice(current: string, latest: string | undefined, notesUrl?: string): string | undefined {
  if (!latest || !isNewerRelease(latest, current)) return undefined;
  const link = notesUrl ? ` Release notes: ${notesUrl}` : "";
  return `ainide ${latest} is available (you are running ${current}). Run "ainide update", then restart.${link}`;
}

async function readCache(cachePath: string): Promise<CacheFile | undefined> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(cachePath, "utf8"));
    return parseCache(raw);
  } catch {
    return undefined;
  }
}

function parseCache(value: unknown): CacheFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.checkedAt !== "number" || !Number.isFinite(record.checkedAt)) return undefined;
  const cache: CacheFile = { checkedAt: record.checkedAt };
  if (typeof record.latest === "string" && record.latest) cache.latest = record.latest;
  if (typeof record.notesUrl === "string" && record.notesUrl) cache.notesUrl = record.notesUrl;
  return cache;
}

async function writeCache(cachePath: string, cache: CacheFile): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // Caching is best effort; a write failure must never break startup.
  }
}
