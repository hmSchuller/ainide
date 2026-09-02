export interface VersionInfo {
  current: string;
  latest?: string;
  notesUrl?: string;
}

/**
 * Compares the numeric version core (major.minor.patch) of two version strings,
 * ignoring any leading `v`, git-describe distance suffix (e.g. `-3-gabc1234`),
 * semver pre-release/build labels, and anything after the third number.
 * Returns -1, 0, or 1 when a is less than, equal to, or greater than b.
 */
export function compareVersions(a: string, b: string): number {
  const left = versionCore(a);
  const right = versionCore(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

/**
 * Reports whether a known `latest` release is strictly newer than `current`.
 * Returns false when either side is missing or the versions are not comparable
 * as newer.
 */
export function isNewerRelease(latest: string | undefined, current: string | undefined): boolean {
  if (!latest || !current) return false;
  return compareVersions(latest, current) > 0;
}

function versionCore(value: string): [number, number, number] {
  const match = value.replace(/^[vV]/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}
