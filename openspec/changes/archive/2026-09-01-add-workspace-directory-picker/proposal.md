## Why

The workspace opener currently assumes that users already know the complete absolute
filesystem path to a project. This makes first-time opening and switching to an unfamiliar
local directory unnecessarily difficult, especially in a browser where a native folder
dialog cannot provide the server with a usable filesystem path.

## What Changes

- Replace the path-only workspace opener with a server-backed directory picker that starts
  every picker session at the user's home directory, displayed as `~`.
- Accept `~` and `~/...` paths in addition to canonical absolute paths, expanding and
  validating them on the server before project open.
- Discover only the immediate child directories of the current path; do not recursively
  scan, search, or preload deeper descendants.
- Provide direct child suggestions, one-level navigation, Home and Parent controls, and an
  explicit action to open the current directory.
- Keep profile-local recent projects as direct-open shortcuts, while keeping filesystem
  navigation independent from the recent list.
- **BREAKING:** Stop reading or writing the browser `ainide:last-workspace` value as a
  picker fallback. Profiles with no recent projects start at `~` and browse from there.
- Preserve the existing validated project-open behavior, session-token checks, project
  session persistence, and server-global active-project semantics.
- Return non-blocking, user-visible errors for missing, inaccessible, invalid, or
  non-directory paths without changing the recent-project list.

## Capabilities

### New Capabilities

- `workspace-directory-picker`: Browser-backed, home-rooted, one-level filesystem
  navigation and tilde-aware project path selection.

### Modified Capabilities

## Impact

- `apps/web`: Replace the current path-only picker behavior with a navigable directory
  picker, path suggestions, keyboard interactions, and deterministic picker initialization.
- `apps/server`: Add an authenticated pre-workspace directory-children operation with
  tilde expansion, canonical path handling, and immediate-child-only listing.
- `packages/shared`: Add shared request/response types for directory picker data if needed
  by the HTTP contract.
- Tests: Cover tilde expansion, canonical paths, one-level listing, navigation errors,
  picker reset-to-home behavior, suggestions, and unchanged recent-project semantics.
- Documentation: Describe browser-based directory navigation and the fact that picker
  sessions always begin at `~`.
