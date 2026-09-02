#!/usr/bin/env bash
# One-command local install for ainide. Everything lives under the user's home
# directory; no sudo is required. On a clean machine this:
#   1. verifies prerequisites (Git, Node.js) and stops before writing anything
#    if either is missing,
#   2. clones the public repository into ~/.ainide/src,
#   3. installs dependencies from the committed lockfile and builds,
#   4. downloads and checksum-verifies the pinned optional tools into ~/.ainide/tools,
#   5. installs the `ainide` launcher to ~/.local/bin.
set -euo pipefail

# Defaults match the distribution spec; the AINIDE_REPO_URL and AINIDE_BIN_DIR
# overrides exist so a fork or a scratch test harness can redirect the source
# and the launcher without touching the real install locations.
REPO_URL="${AINIDE_REPO_URL:-https://github.com/hmSchuller/ainide.git}"
AINIDE_HOME="${AINIDE_HOME:-$HOME/.ainide}"
SRC_DIR="$AINIDE_HOME/src"
TOOLS_DIR="${AINIDE_TOOLS_DIR:-$AINIDE_HOME/tools}"
BIN_DIR="${AINIDE_BIN_DIR:-$HOME/.local/bin}"
LAUNCHER_DEST="$BIN_DIR/ainide"

step() { printf '\n==> %s\n' "$*"; }
die() { echo "ainide install: $*" >&2; exit 1; }

# --- 1. Prerequisites (checked before any filesystem writes: no partial install). ---
missing=""
command -v git >/dev/null 2>&1 || missing="$missing git"
command -v node >/dev/null 2>&1 || missing="$missing node"
command -v npm >/dev/null 2>&1 || missing="$missing npm"
if [ -n "$missing" ]; then
  echo "ainide install: missing prerequisite(s):$missing" >&2
  for tool in $missing; do
    case "$tool" in
      git)  echo "  - $tool: install Git with 'xcode-select --install' or 'brew install git'." >&2 ;;
      node) echo "  - $tool: install Node.js 18+ with 'brew install node' (also provides npm)." >&2 ;;
      npm)  echo "  - $tool: npm ships with Node.js; install Node 18+ with 'brew install node'." >&2 ;;
    esac
  done
  echo "No changes were made." >&2
  exit 1
fi

# --- 2. Source: clone once into a stable directory. ---
step "Preparing source at $SRC_DIR"
if [ -d "$SRC_DIR/.git" ]; then
  echo "Existing clone found; reusing it."
elif [ -e "$SRC_DIR" ]; then
  die "$SRC_DIR exists but is not a git clone. Remove it and re-run this installer."
else
  git clone "$REPO_URL" "$SRC_DIR"
fi

# --- 3. Dependencies + build. ---
step "Installing dependencies and building"
( cd "$SRC_DIR" && npm ci && npm run build )

# --- 4. Pinned optional tools (download, checksum-verify, extract). ---
step "Installing pinned tools into $TOOLS_DIR"
mkdir -p "$TOOLS_DIR"
os="$(uname -s)"; mach="$(uname -m)"
arch_key=""
case "$os-$mach" in
  Darwin-arm64)  arch_key="darwin-arm64" ;;
  Darwin-x86_64) arch_key="darwin-x64" ;;
  *) echo "No pinned tool artifacts for $os-$mach; skipping bundled tools (they will resolve from your PATH if installed)." ;;
esac

if [ -n "$arch_key" ]; then
  plan="$(node -e '
    const fs = require("node:fs");
    const [arch, manifestPath] = process.argv.slice(1);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const tool of manifest.tools || []) {
      const artifact = (tool.artifacts || {})[arch];
      if (!artifact) { console.error("# " + tool.name + ": no " + arch + " artifact; skipping (resolves from PATH)."); continue; }
      console.log([tool.name, artifact.url, artifact.sha256, tool.entry].join("\t"));
    }
  ' "$arch_key" "$SRC_DIR/tools/versions.json")"

  while IFS="$(printf '\t')" read -r name url sha entry; do
    [ -z "${name:-}" ] && continue
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' RETURN
    echo "  - $name"
    if ! curl -fsSL "$url" -o "$work/download"; then
      die "could not download $name from $url"
    fi
    actual="$(shasum -a 256 "$work/download" | awk '{print $1}')"
    if [ "$actual" != "$sha" ]; then
      die "checksum mismatch for $name: expected $sha but got $actual. Refusing to install."
    fi
    tar -xzf "$work/download" -C "$work" "$entry"
    install -m 0755 "$work/$entry" "$TOOLS_DIR/$name"
  done <<< "$plan"
  echo "Installed tools: $(ls -1 "$TOOLS_DIR" 2>/dev/null | tr '\n' ' ')"
fi

# --- 5. Launcher. ---
step "Installing launcher to $LAUNCHER_DEST"
mkdir -p "$BIN_DIR"
cp "$SRC_DIR/bin/ainide" "$LAUNCHER_DEST"
chmod +x "$LAUNCHER_DEST"

# --- 6. PATH line. ---
echo
if printf '%s' "$PATH" | tr ':' '\n' | grep -Fxq "$BIN_DIR"; then
  echo "Done. 'ainide' is already on your PATH."
else
  echo "Done. Add this line to your shell profile (e.g. ~/.zshrc) and start a new shell:"
  echo
  printf '    export PATH="%s:$PATH"\n' "$BIN_DIR"
  echo
fi
echo
echo "Then run:  ainide"
