## 1. Language Detection

- [x] 1.1 Extend the centralized filename-to-language mapping so `.swift` resolves to `swift` and `.kt` and `.kts` resolve to `kotlin`; verify unit coverage includes normal, script, uppercase, and unknown-extension cases.
- [x] 1.2 Confirm the existing editor open, snapshot restore, split-pane, and reference paths continue to consume the centralized language resolver without adding a second language-detection mechanism; verify the web typecheck passes.

## 2. Open Tab Rename Behavior

- [x] 2.1 Recompute an open tab's language ID from its destination path when a file is renamed, while preserving its content, saved content, dirty state, conflict state, pane membership, and active path; verify store tests cover renames into and out of Swift and Kotlin extensions.

## 3. Reference Metadata

- [x] 3.1 Verify Swift and Kotlin file and selection references carry `swift` and `kotlin` language IDs into serialized reference text and ACP prompt context; extend focused web tests for `.swift`, `.kt`, and `.kts` if existing coverage does not exercise the resolver.

## 4. Verification

- [x] 4.1 Run the focused web tests and confirm extension mapping, rename synchronization, reference metadata, existing Monaco configuration, and existing editor behavior pass without server or shared-protocol changes.
- [x] 4.2 Run `npm run typecheck` and `npm run build` from the repository root to verify the web-only change introduces no TypeScript or bundling regressions.
- [x] 4.3 In the running app, open Swift, Kotlin, and Kotlin script files in Edit mode, verify language-appropriate tokenization and ordinary editing in both panes, confirm no language-service UI is introduced, capture references, and rename an open file across supported extensions while retaining an unsaved buffer.
