## Why

Starting a new agent in a workspace with many provider sessions explodes the new-agent modal in height: each provider renders all recent sessions inline (up to 20 per provider), pushing Start-new entries and Cancel off-screen with no scroll containment.

## What Changes

- Collapse each provider's recent sessions behind a zero-preview toggle (`Recent sessions (N)`, collapsed by default) so Start-new entries stay visible without scrolling.
- Contain the picker dialog with a viewport-bounded max-height and make the provider list the single scroll region so the modal works on all screen sizes.
- Keep resume behavior unchanged: selecting a recent session still starts that provider and loads that session; loading / empty / unavailable states stay as muted one-liners with no toggle.
- Per-provider expand state is independent and resets on close (no persistence).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `acp-agent-sessions`: picker presentation of recent resumable sessions changes from always-expanded inline lists to collapsed-by-default disclosure, plus dialog height containment and scroll behavior.

## Impact

- Web only: `AcpProviderPicker.tsx` (RecentSessions disclosure + toggle), `styles.css` (dialog max-height, list scroll; shared with `ProjectAgentSettingsDialog` — needs visual check).
- No server, protocol, persistence, or API changes; `MAX_PROVIDER_SESSIONS = 20` bound unchanged.
- Component tests for picker states need updating/extension (collapsed default, expand, scroll containment via CSS).
