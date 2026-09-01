## Why

The Edit surface currently maps Swift and Kotlin source files to `plaintext`, even though the
bundled Monaco runtime provides syntax definitions for both languages. This makes common local
projects harder to read without requiring the full language-service behavior of an IDE.

## What Changes

- Map `.swift` files to Monaco's `swift` language ID.
- Map `.kt` and `.kts` files to Monaco's `kotlin` language ID.
- Keep Swift and Kotlin as syntax-highlighted buffers only; do not add LSP integration,
  diagnostics, completions, hover, formatting, compilation, or build features.
- Preserve existing tab, split-pane, auto-save, conflict, and editor-command behavior.
- Preserve Swift and Kotlin language metadata when files are captured as references or attached
  to ACP prompts.
- Recompute the language ID when an open file is renamed across extensions so its highlighting
  follows the new filename.

## Capabilities

### New Capabilities

### Modified Capabilities

- `editor-language-surface`: Extend the highlighted-buffer language coverage to Swift and Kotlin
  while keeping them outside the in-browser language-service surface.

## Impact

- `apps/web/src/file-language.ts`: Add Swift and Kotlin extension mappings.
- `apps/web/src/store.ts`: Keep an open tab's language ID synchronized after an extension-changing
  rename.
- `apps/web` tests: Add mapping and rename coverage, plus retain existing editor-surface tests.
- No server, shared protocol, or dependency changes are expected.
