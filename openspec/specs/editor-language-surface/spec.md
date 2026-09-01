# editor-language-surface Specification

## Purpose

Keeps the Edit-mode editor a highlighted TypeScript and JavaScript buffer with syntax-only checking, instead of an in-browser language service that invents a project.

## Requirements

### Requirement: TypeScript and JavaScript are highlighted buffers

The Edit surface SHALL treat TypeScript and JavaScript files as highlighted text buffers. It SHALL NOT present semantic diagnostics, type-aware completions, type hover, signature help, code actions, go-to-definition, rename, or inlay hints from an in-browser TypeScript language service. Syntax highlighting and ordinary editor commands (Find, Go to line, multi-cursor, undo, context menu) SHALL remain available.

#### Scenario: Package import is not marked missing

- **WHEN** the user opens a TypeScript file that imports a workspace package such as `@nestjs/common`
- **THEN** the editor does not show a semantic cannot-find-module diagnostic for that import

#### Scenario: Language-service completions and Quick Fix are not offered

- **WHEN** the user types or selects code in a TypeScript or JavaScript buffer
- **THEN** the editor does not show TypeScript language-service completions, signature help, or a Quick Fix lightbulb

#### Scenario: Hover does not show language-service types

- **WHEN** the user hovers a symbol in a TypeScript or JavaScript buffer
- **THEN** the editor does not show a type tooltip from the TypeScript language service

#### Scenario: Highlighting and editor commands still work

- **WHEN** the user opens a TypeScript file and uses Find, Go to line, or the editor context menu
- **THEN** the file is syntax-highlighted and those commands still work

### Requirement: Syntax-only validation remains

The Edit surface SHALL still report syntax errors in TypeScript and JavaScript buffers, such as unmatched braces or unterminated strings. It SHALL NOT report semantic errors that require project context (module resolution, types, or path aliases). Decorator and JSX syntax used by typical TypeScript projects SHALL NOT be reported as errors solely because the in-browser checker lacks a workspace tsconfig.

#### Scenario: Unmatched brace is still marked

- **WHEN** the user leaves an unmatched `{` in a TypeScript or JavaScript file
- **THEN** the editor shows a syntax diagnostic for that error

#### Scenario: Semantic module errors stay hidden

- **WHEN** a TypeScript file imports a module the in-browser checker cannot resolve
- **THEN** no semantic module-resolution diagnostic is shown

#### Scenario: Decorators and JSX are not false syntax errors

- **WHEN** the user opens a TypeScript file that uses decorators or JSX
- **THEN** the editor does not mark that syntax as invalid for lack of workspace compiler options

### Requirement: Other languages and editor chrome stay as they are

JSON, CSS, SCSS, HTML, and other mapped languages SHALL keep their existing highlighting and validation. Split panes, auto-save, view state, and reference-kit context menu actions SHALL keep working. The system SHALL NOT add a user-facing setting to re-enable the TypeScript language service.

#### Scenario: JSON validation is unchanged

- **WHEN** the user opens a JSON file
- **THEN** JSON highlighting and validation still run as they did before this capability

#### Scenario: Both editor panes share the same language-surface behavior

- **WHEN** TypeScript files are open in the primary pane, the secondary pane, or both
- **THEN** neither pane shows TypeScript language-service semantics, completions, hover, or Quick Fix

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
