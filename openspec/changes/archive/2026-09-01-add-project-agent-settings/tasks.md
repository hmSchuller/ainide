## 1. Shared types

- [x] 1.1 Add shared types for the agent-settings read response (`{ all: AcpProviderDescriptor[]; disabled: string[] }`) and the update request (`{ rootPath: string; disabledAgents: string[] }`) to `packages/shared/src/index.ts`, and verify `npm run build -w @ainide/shared` succeeds.

## 2. Server: config persistence

- [x] 2.1 Extend `AinideConfig` with a `projects` section (map of rootPath → `{ disabledAgents: string[] }`) and add defensive parsing in `apps/server/src/config.ts`, treating an absent or malformed section as empty; verify a new case in `config.test.ts` covers a valid section, an absent section, and a malformed section.
- [x] 2.2 Add an atomic config write (temp file in the same directory + rename) that persists the current in-memory config; verify a `config.test.ts` case confirms the file is rewritten with the new section and no leftover temp file remains after a successful write.
- [x] 2.3 Hold the in-memory `projects` structure as a `Map` (or `Object.create(null)`) and verify a `config.test.ts` case sets and reads back a banlist for a root path that is a reserved object key (`__proto__`) and for a path containing spaces and non-ASCII, with no dropped or corrupted entry.

## 3. Server: agent-settings API

- [x] 3.1 Add a read endpoint returning `{ all, disabled }` for the active project and an update endpoint accepting `{ rootPath, disabledAgents }` in the request body, wired in `apps/server/src/server.ts`; verify a `server.test.ts` case reads back the effective list and then updates it.
- [x] 3.2 Validate the update: reject a `rootPath` that is not a known or open project (no config entry created) and give no effect to disabled ids not present in `acpAgents`; verify `server.test.ts` cases for an unknown project (rejected) and an unconfigured id (ignored).
- [x] 3.3 Make an update mutate the in-memory config and persist to disk so it takes effect without a restart; verify a `server.test.ts` case updates the banlist and then confirms both the in-memory provider list and the on-disk config reflect it.

## 4. Server: project-aware provider list

- [x] 4.1 Make `AcpSessionManager.providers()` omit the active project's disabled agents while keeping the full list available to the settings read; verify a `manager.test.ts` case shows a disabled agent omitted for its project but still present for another project.

## 5. Web: API client

- [x] 5.1 Add client functions to read a project's agent settings and to update its banlist in `apps/web/src/api.ts`; verify an `api.test.ts` case exercises both against the test server/fixture.

## 6. Web: picker filtering

- [x] 6.1 Make the ACP provider picker offer only the enabled-for-project agents (all minus disabled), including the all-disabled empty state; verify an `AcpProviderPicker.test.tsx` case hides a disabled provider and shows the empty state when every provider is disabled.

## 7. Web: project settings surface

- [x] 7.1 Add a "Project settings…" entry to the project switcher that opens a dialog listing every configured agent with a toggle for its disabled state; verify a component test opens the dialog and reflects the active project's current disabled set.
- [x] 7.2 Wire a toggle to call the update API and refresh the picker; verify a component/integration test that toggling an agent updates the banlist and the picker no longer offers it.

## 8. Verification

- [x] 8.1 Run `npm run typecheck` and `npm test` from the repo root and verify both pass with no new failures.
