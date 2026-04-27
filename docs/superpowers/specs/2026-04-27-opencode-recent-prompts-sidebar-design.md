# OpenCode Recent Prompt Sidebar Design

> Paths in this design assume khangnghiem's local OpenCode setup. On other machines, substitute the equivalent OpenCode config directory, usually `$XDG_CONFIG_HOME/opencode/` or `~/.config/opencode/`.

## Goal

Show the latest submitted user prompt in OpenCode's right sidebar so the prompt remains visible while assistant output scrolls. This avoids forking or patching OpenCode core UI.

## Scope

Build a local OpenCode plugin that:

- renders in the existing TUI sidebar slots,
- shows only the latest user prompt for the focused session,
- excludes slash commands,
- keeps state in memory only for v1,
- displays a single-line preview,
- fails closed if the sidebar/plugin APIs are unavailable.

Out of scope for v1: disk persistence, prompt history beyond one item, click-to-copy, click-to-resubmit, search, redaction, custom rich UI, and upstream OpenCode changes.

## Gate-Zero Verification

Runtime spike against local OpenCode `1.14.28` passed.

Evidence:

- Temporary plugin path was added to `/Users/khangnghiem/.config/opencode/opencode.json` only during the run, then restored.
- `opencode -c` was launched in a pseudo-TTY and `Ctrl+B` was sent to toggle the sidebar.
- Marker log showed OpenCode invoked all sidebar slots in a real session route:
  - `tui:init`
  - `slot:setup`
  - `slot:registered:recent-prompts.spike`
  - `slot:sidebar_title:none:{"name":"session","params":{"sessionID":"..."}}`
  - `slot:sidebar_content:none:route={"name":"session","params":{"sessionID":"..."}}:messages=100:latest=none`
  - `slot:sidebar_footer:none:{"name":"session","params":{"sessionID":"..."}}`
- Temporary entries were removed from both OpenCode config files after verification.

Conclusion: local OpenCode can load a TUI plugin from config and call `sidebar_title`, `sidebar_content`, and `sidebar_footer`. The render path is viable without core edits. The `latest=none` marker means the spike validated slot invocation and session-state availability, not final prompt-shape extraction; the implementation still needs helper tests against representative message shapes.

## User Decisions

- Show only the latest prompt, not a full prompt history.
- Slash commands do not count as prompts.
- v1 may be memory-only and lost on OpenCode restart.
- Preview is single-line.
- Runtime sidebar spike must pass before implementation planning.

## Architecture

### Plugin module

The plugin is a local OpenCode TUI plugin module exporting:

```ts
export default {
  id: "recent-prompts",
  tui: async (api) => {
    api.slots.register({
      id: "recent-prompts-sidebar",
      setup() {},
      slots: {
        sidebar_title(props) {},
        sidebar_content(props) {},
        sidebar_footer(props) {},
      },
    })
  },
}
```

The exact slot names are local OpenCode API names from `@opencode-ai/plugin/dist/tui.d.ts`:

- `sidebar_title`
- `sidebar_content`
- `sidebar_footer`

### State source

v1 should prefer reading the focused session's existing message state during sidebar render instead of maintaining a separate persistent store.

The spike confirmed `api.route.current` exposes the focused session route:

```ts
{ name: "session", params: { sessionID: "..." } }
```

The plugin can derive `sessionID` from `api.route.current.params.sessionID` when `api.route.current.name === "session"`, then call `api.state.session.messages(sessionID)`. If `messages()` is asynchronous or takes more than roughly 5 ms during sidebar render, switch to an in-memory event-listener cache instead of blocking the slot render path.

If message shape is insufficient or differs across versions, implementation may add an in-memory event listener cache as fallback. The fallback must still be keyed by session id and must not write to disk.

### Rendering

`sidebar_content` renders a compact text panel:

```text
Recent Prompt
<80-character single-line preview, plus ellipsis when truncated>
```

If no user prompt exists for the focused session, render:

```text
Recent Prompt
No prompt yet
```

The plugin must not auto-open the sidebar. Existing user keybinding remains the source of truth; current local config maps `sidebar_toggle` to `ctrl+b`.

## Prompt Selection Rules

A message counts as a prompt only when all of these are true:

1. message role is user,
2. text content is non-empty after trimming,
3. text does not begin with `/`,
4. message is not a tool result or synthetic system/user wrapper,
5. message belongs to the focused session.

When multiple user prompts exist, choose the newest by message order or timestamp. If both are available, prefer timestamp and use message order as fallback.

## Text Processing

For display:

- strip ANSI escape sequences and control characters,
- collapse whitespace and newlines into single spaces,
- trim leading/trailing whitespace,
- cap raw extracted text at 4096 bytes before sanitization,
- show the first 80 display characters,
- append `…` when truncated.

The full prompt is not persisted in v1. The 4096-byte raw cap protects memory if a user pastes a large file as a prompt, including inputs that collapse heavily during sanitization.

## Configuration

v1 uses minimal configuration:

```json
{
  "enabled": true,
  "maxPromptBytes": 4096,
  "previewChars": 80
}
```

Malformed config must fall back to defaults. Invalid values must not throw during OpenCode startup.

Persistence-related config is intentionally deferred to v2 because prompt text may contain secrets.

## Error Handling

- Sidebar API unavailable: log once and no-op.
- Route is not a session: render nothing or an empty state.
- Session id missing: render empty state.
- Message state read fails: render empty state and log once.
- Unexpected message shape: skip that message.
- Rendering failure: catch locally; never crash OpenCode.

## Privacy and Security

v1 is memory-only. It does not write prompts to disk.

The README must warn that prompts may contain secrets and that the sidebar makes recent prompt text more visible during screen sharing. No redaction is included in v1 because redaction rules can create false confidence; persistence and redaction belong in v2.

## Test Plan

Manual/runtime tests:

1. Start OpenCode with the plugin enabled.
2. Open or continue a session.
3. Toggle sidebar with `ctrl+b`.
4. Submit a normal prompt and confirm the sidebar shows its single-line preview.
5. Submit a slash command and confirm it does not replace the prompt preview.
6. Submit a multi-line prompt and confirm whitespace collapses to one line.
7. Submit a long prompt and confirm the preview truncates with `…`.
8. Restart OpenCode and confirm v1 does not retain old prompt state beyond session message state available from OpenCode.
9. Disable or remove the plugin and confirm OpenCode starts normally.

Automated checks:

- Unit-test text sanitization and truncation helpers.
- Unit-test prompt-selection logic against representative message shapes.
- Run a pseudo-TTY smoke test similar to the gate-zero spike to verify `sidebar_content` is invoked in local OpenCode.

## Implementation Notes

- Use `/Users/khangnghiem/.config/opencode/opencode.json` as the authoritative OpenCode plugin config path.
- During development, add the local plugin path only temporarily unless the user asks to keep it installed.
- Do not search broad config/cache/Homebrew paths. Use exact files and tightly scoped package files only.
- Do not commit generated scratch files or marker logs.
