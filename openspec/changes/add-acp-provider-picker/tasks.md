## 1. Shared Session Contract

- [x] 1.1 Add explicit provider/user title provenance to the shared ACP session and persisted descriptor types, and verify `npm run build -w @ainide/shared` succeeds.
- [x] 1.2 Update descriptor parsing and snapshot serialization so new provenance is round-tripped and older descriptors without provenance are treated as user-owned, and verify persistence tests cover legacy and new records.
- [x] 1.3 Make the ACP create request title optional at the shared web API boundary while retaining a non-empty title in public session responses, and verify API request-shape tests cover omitted titles.

## 2. ACP Server Title Lifecycle

- [x] 2.1 Initialize title-less ACP sessions with the validated configured provider label as provider-owned provisional metadata, and verify a title-less session creation test succeeds without creating a PTY session.
- [x] 2.2 Normalize valid `session_info_update` titles and publish title-only changes through the existing sequenced, project-scoped status event path, and verify browser-facing event tests observe the generated title.
- [x] 2.3 Ignore empty, null, malformed, or invalid provider title updates without blanking the current title, and verify focused normalization and manager tests cover each invalid form.
- [x] 2.4 Set title provenance to user when the rename operation succeeds and reject subsequent provider title replacements, and verify live-session tests cover renaming before and after provider updates.
- [x] 2.5 Persist accepted provider titles and user title provenance without persisting protocol streams, credentials, or provider environment values, and verify serialized session tests contain only allowed metadata.
- [x] 2.6 Restore title provenance with ACP sessions, treating missing legacy provenance as user-owned, and verify restart tests preserve a user rename when the restored provider advertises a different title.

## 3. Provider Picker UX

- [x] 3.1 Add an accessible in-app new-agent picker that renders only configured ACP provider labels with loading, retryable error, and empty-provider states, and verify component tests exclude free-form IDs and PTY entries.
- [x] 3.2 Replace the native title/provider prompts with the picker and launch the selected provider immediately, and verify interaction tests show no title prompt, no second provider prompt, and no PTY fallback.
- [x] 3.3 Disable duplicate selection while a provider is starting, close or transition the picker after successful creation, focus the new session, and verify startup-state tests cover rapid repeated selection.
- [x] 3.4 Keep the picker available after a provider startup failure while leaving existing sessions unchanged, and verify error-path tests allow retrying the same or another configured provider.
- [x] 3.5 Display the provider-label provisional title and later provider-generated title in the workbench without changing provider identity or session status, and verify workbench tests cover asynchronous title replacement.
- [x] 3.6 Preserve the existing rename action while preventing later provider updates from overwriting a user-selected title, and verify workbench interaction tests cover rename precedence.

## 4. Session Reconciliation and Isolation

- [x] 4.1 Upsert an ACP create response by local session ID instead of blindly appending it, and verify a creation-race test preserves an event-delivered provider title without duplicate sessions.
- [x] 4.2 Preserve title updates and ownership through reconnect snapshots and active-project switching, and verify tests cover hidden-project isolation and return to the original project.
- [x] 4.3 Confirm multiple selections of the same configured provider create independent sessions with independent title ownership, status, and history, and verify mixed-session tests cover concurrent launches.

## 5. Integration Verification

- [x] 5.1 Update user-facing agent configuration and usage documentation to describe the provider-only picker, immediate launch, provisional titles, and provider/user title precedence, and verify the documented flow matches the UI.
- [x] 5.2 Run `npm run typecheck` and `npm test` from the repository root, and verify ACP API, server, persistence, picker, race, and workbench tests all pass.
- [x] 5.3 Run `npm run build` from the repository root and verify the production frontend and server build with no generated artifacts added to the change.
