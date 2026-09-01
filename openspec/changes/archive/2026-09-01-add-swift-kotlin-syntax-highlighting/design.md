## Context

See `proposal.md` for the motivation. The web client derives an editor tab's Monaco language ID
from its filename through one extension map in `apps/web/src/file-language.ts`. Every normal file
open, restored tab, and reference path already uses that helper. Monaco's current runtime includes
the built-in `swift` and `kotlin` basic language definitions, while the project-specific language
surface helper only configures the existing TypeScript and JavaScript defaults.

The store's open-file rename action currently updates a tab's path and display name but leaves its
language ID untouched. This is observable when a user changes an open file's extension.

## Goals / Non-Goals

**Goals:**

- Make filename-based language detection the single source of truth for Swift and Kotlin.
- Cover Kotlin source files and Kotlin scripts without adding separate language concepts.
- Keep references and ACP prompt context aligned with the language ID already used by the tab.
- Make extension-changing renames preserve correct highlighting without disturbing buffer contents,
  dirty state, or pane ownership.
- Keep the change limited to the web editor surface.

**Non-Goals:**

- Swift or Kotlin language servers, compiler integration, diagnostics, formatting, or build/run
  actions.
- Custom Monaco grammars or language registrations.
- Mapping generated or compiled Swift artifacts such as `.swiftinterface` or `.swiftmodule`.
- A language picker or user-configurable language overrides.

## Decisions

### 1. Extend the existing suffix map

Add `swift: "swift"`, `kt: "kotlin"`, and `kts: "kotlin"` to the existing lowercase extension
map. The helper already lowercases the final suffix, so uppercase filenames receive the same
behavior. This also handles names such as `Package.swift` and `build.gradle.kts` without basename
special cases.

**Alternative considered:** Detect language from file contents or project metadata. Rejected because
it would add reads and ambiguous behavior to a path-based mechanism that already covers the needed
source-file conventions.

### 2. Use Monaco's built-in language IDs

Pass the standard `swift` and `kotlin` IDs through the existing `language` prop. Do not change
`configureMonacoLanguageSurface`; it exists to mute the TypeScript and JavaScript language service,
whereas Swift and Kotlin are highlighter-only languages with no project-specific worker configured.

**Alternative considered:** Introduce custom IDs or register duplicate grammars. Rejected because
the current Monaco runtime already supplies the standard definitions and custom registration would
add bundle and maintenance cost without improving highlighting.

### 3. Recalculate language on tab rename

When the store updates an open tab's path after a successful rename, derive the new tab language
from the destination path along with its display name. Keep the existing content, saved content,
dirty state, conflict state, pane paths, and active path unchanged.

**Alternative considered:** Reopen the file after rename. Rejected because it risks losing visible
unsaved content and duplicates existing rename lifecycle behavior. Recomputing in the store also
keeps editor tabs and reference capture consistent.

### 4. Verify plumbing separately from Monaco rendering

Use unit tests for extension mapping and extension-changing tab renames. Existing reference
serialization and ACP-context tests can verify that the language string is carried through, while
the normal `Editor` wiring remains unchanged. A manual browser check should confirm Swift and
Kotlin tokenization in both panes because static tests cannot render Monaco tokens.

## Risks / Trade-offs

- [Risk] A future Monaco runtime could remove or rename a basic language ID. -> [Mitigation] Keep
  the standard IDs, verify the supported runtime during browser smoke testing, and avoid custom
  registration until the dependency actually requires it.
- [Risk] Renaming an open file changes its language and can recreate the path-keyed Monaco model.
  -> [Mitigation] Update only the tab metadata and retain the current visible buffer and dirty
  state; verify rename behavior with an unsaved buffer.
- [Risk] Generic Monaco editor suggestions or other core behavior may still apply to these
  languages. -> [Mitigation] Register no language-specific providers and make no claim of a Swift
  or Kotlin language service; the scope is syntax highlighting and existing editor behavior only.
- [Risk] Generated Swift interface files remain plaintext. -> [Mitigation] Keep the explicit
  `.swift` scope and revisit additional suffixes only as a separate requirement.

## Migration Plan

No data or protocol migration is required. Ship the web mapping, rename synchronization, and tests
together. Existing tabs derive their language when opened or restored; open tabs renamed after the
change derive it from the destination path. Rollback is limited to reverting the web changes.
