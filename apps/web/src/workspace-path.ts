/** Return true for absolute POSIX, drive-letter, and UNC-style paths. */
export function isAbsoluteWorkspacePath(value: string): boolean {
  return typeof value === "string" && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/]/.test(value));
}

interface ParsedPath {
  root: string;
  parts: string[];
  separator: "/" | "\\";
  tilde: boolean;
}

function parsePath(value: string): ParsedPath | undefined {
  if (!value || value.includes("\0") || value.startsWith("~other-user")) return undefined;
  const separator: "/" | "\\" = value.includes("\\") ? "\\" : "/";
  if (value === "~") return { root: "~", parts: [], separator, tilde: true };

  let rest = value;
  let root = "";
  let tilde = false;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    root = "~";
    rest = value.slice(2);
    tilde = true;
  } else if (/^[A-Za-z]:[\\/]/.test(value)) {
    root = `${value.slice(0, 2)}${separator}`;
    rest = value.slice(3);
  } else if (value.startsWith("/")) {
    root = "/";
    rest = value.slice(1);
  } else if (/^\\\\[^\\/]+[\\/]/.test(value)) {
    const normalized = value.replaceAll("\\", "/");
    const uncParts = normalized.slice(2).split("/").filter(Boolean);
    if (uncParts.length < 2) return undefined;
    root = `//${uncParts.slice(0, 2).join("/")}${separator}`;
    rest = uncParts.slice(2).join("/");
  } else {
    return undefined;
  }

  const parts = rest.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return undefined;
  return { root, parts, separator, tilde };
}

function formatPath(parsed: ParsedPath): string {
  if (!parsed.parts.length) return parsed.root;
  const suffix = parsed.parts.join(parsed.separator);
  if (parsed.root === "~") return `~${parsed.separator}${suffix}`;
  if (parsed.root === "/") return `/${suffix}`;
  return `${parsed.root}${suffix}`;
}

function sameRoot(left: string, right: string): boolean {
  const normalize = (value: string) => value.replaceAll("\\", "/");
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  const windowsRoot = /^[A-Za-z]:\/$/.test(leftNormalized) || leftNormalized.startsWith("//") || /^[A-Za-z]:\/$/.test(rightNormalized) || rightNormalized.startsWith("//");
  return windowsRoot ? leftNormalized.toLowerCase() === rightNormalized.toLowerCase() : leftNormalized === rightNormalized;
}

function relativeTo(pathValue: ParsedPath, homeValue: ParsedPath): string[] | undefined {
  if (pathValue.tilde || homeValue.tilde || !sameRoot(pathValue.root, homeValue.root)) return undefined;
  const windowsPath = pathValue.root.startsWith("//") || /^[A-Za-z]:/.test(pathValue.root);
  const pathParts = windowsPath ? pathValue.parts.map((part) => part.toLowerCase()) : pathValue.parts;
  const homeParts = windowsPath ? homeValue.parts.map((part) => part.toLowerCase()) : homeValue.parts;
  if (pathParts.length < homeParts.length || !homeParts.every((part, index) => pathParts[index] === part)) return undefined;
  return pathValue.parts.slice(homeParts.length);
}

/** Render a canonical server path relative to the server-reported home as ~. */
export function displayWorkspacePath(pathValue: string, homePath?: string): string {
  const parsed = parsePath(pathValue);
  if (!parsed) return pathValue;
  if (parsed.tilde) return formatPath(parsed);
  if (homePath) {
    const home = parsePath(homePath);
    const relative = home && relativeTo(parsed, home);
    if (relative) return relative.length ? `~${parsed.separator}${relative.join(parsed.separator)}` : "~";
  }
  return formatPath(parsed);
}

/** Return the lexical parent, retaining ~ and the input platform separator. */
export function parentWorkspacePath(pathValue: string): string | undefined {
  const parsed = parsePath(pathValue);
  if (!parsed) return undefined;
  if (!parsed.parts.length) return parsed.tilde ? undefined : parsed.root;
  return formatPath({ ...parsed, parts: parsed.parts.slice(0, -1) });
}

/** Return a child path using the separator used by the parent path. */
export function joinWorkspacePath(parent: string, child: string): string | undefined {
  const parsed = parsePath(parent);
  if (!parsed || !child || child.includes("/") || child.includes("\\") || child === "." || child === "..") return undefined;
  return formatPath({ ...parsed, parts: [...parsed.parts, child] });
}

export interface WorkspacePathCompletion {
  parentPath: string;
  query: string;
}

/** Split a typed path into the one parent directory and final segment to query. */
export function workspacePathCompletion(value: string): WorkspacePathCompletion | undefined {
  const trimmed = value.trim();
  const parsed = parsePath(trimmed);
  if (!parsed || parsed.tilde && !parsed.parts.length) return undefined;
  const trailingSeparator = /[\\/]$/.test(trimmed);
  if (trailingSeparator) {
    const parent = parsed.parts.length ? formatPath(parsed) : parsed.root;
    return { parentPath: parent, query: "" };
  }
  const parent = parentWorkspacePath(trimmed);
  const query = parsed.parts.at(-1);
  return parent && query ? { parentPath: parent, query } : undefined;
}
