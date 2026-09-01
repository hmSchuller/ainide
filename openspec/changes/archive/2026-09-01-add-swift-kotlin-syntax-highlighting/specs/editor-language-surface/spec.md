## ADDED Requirements

### Requirement: Swift and Kotlin are syntax-highlighted buffers

The Edit surface SHALL recognize `.swift` files as Swift buffers and `.kt` and `.kts` files as
Kotlin buffers. These buffers SHALL provide syntax highlighting and ordinary editor behavior such
as editing, bracket matching, Find, Go to line, multi-cursor, undo, and the context menu. Swift and
Kotlin buffers SHALL NOT add language-server diagnostics, type-aware completions, hover, signature
help, code actions, go-to-definition, rename, formatting, or compilation behavior.

#### Scenario: Swift source uses Swift highlighting

- **WHEN** the user opens a file whose name ends in `.swift` in Edit mode
- **THEN** the editor renders the file with Swift syntax highlighting and keeps ordinary editing
  commands available

#### Scenario: Kotlin source uses Kotlin highlighting

- **WHEN** the user opens a file whose name ends in `.kt` in Edit mode
- **THEN** the editor renders the file with Kotlin syntax highlighting and keeps ordinary editing
  commands available

#### Scenario: Kotlin script uses Kotlin highlighting

- **WHEN** the user opens a file whose name ends in `.kts` in Edit mode
- **THEN** the editor renders the file with Kotlin syntax highlighting rather than plaintext

#### Scenario: Highlighter-only behavior does not introduce language services

- **WHEN** the user edits a Swift or Kotlin buffer
- **THEN** the editor does not present Swift or Kotlin language-server diagnostics, completions,
  hover information, code actions, formatting, or compilation results

#### Scenario: References preserve Swift and Kotlin language identity

- **WHEN** the user captures a Swift or Kotlin file or selection as a reference
- **THEN** the reference and any serialized prompt context identify it with the corresponding
  `swift` or `kotlin` language ID

#### Scenario: Renaming an open file updates its highlighting language

- **WHEN** the user renames an open file across a supported language extension boundary, such as
  from `.txt` to `.swift` or from `.swift` to `.kt`
- **THEN** the open editor buffer follows the new filename and uses the corresponding language
  highlighting without requiring the file to be closed and reopened
