# Inline Editing

> R3.27, R3.28 | Status: done

## Inline Text Editing (R3.28)

### Trigger

| Action                                  | Result                                    |
| --------------------------------------- | ----------------------------------------- |
| Double-click text node                  | Open inline editor with current text      |
| Double-click shape (rect/ellipse/frame) | Create text child + open inline editor    |
| Double-click empty canvas               | Create new text node + open inline editor |

### Editor Overlay

A floating `<textarea>` is positioned over the node in screen coordinates:

- **Position/size** — matches the node's bounding box, scaled by camera zoom
- **Background** — shape nodes use their `fill` color; text nodes use themed default (`#1E1E2E` dark / `#FFFFFF` light); shapes without fill use themed fallback
- **Text color** — auto-contrasted against background via luminance threshold (dark bg → white text, light bg → dark text)
- **Font** — matches node's `font-family`, `font-weight`, `font-size` scaled to zoom level
- **Border radius** — ellipses use `50%`, rects use actual `corner` value, text nodes use `4px`
- **Text alignment** — respects node's `align:` property via CSS `text-align`
- **Vertical alignment** — dynamic `padding-top` based on textarea height vs text height for `top|middle|bottom`

### Keyboard Behavior

| Key           | Action                                    |
| ------------- | ----------------------------------------- |
| Enter         | Commit text and close editor              |
| Escape        | Revert to original value and close editor |
| Click outside | Commit text and close editor              |

### Live Sync

Every keystroke updates Code Mode in real-time:

1. `input` event fires on textarea
2. Call `set_node_prop("label", value)` via WASM
3. WASM creates/updates text child node in SceneGraph
4. `emit_document()` → new FD source → push to VS Code editor
5. Canvas re-renders with updated text

If value is unchanged from original → **skip** `set_node_prop` (prevents style flattening from `resolve_style()`).

### Commit Guard

A `committed` flag prevents double-invocation:

- Enter keydown → removes textarea from DOM → triggers blur
- Blur fires `setTimeout(commit, 100)` which would race
- The `committed` flag ensures `syncTextToExtension()` runs exactly once

## Layer Rename (R3.27)

### Trigger

Double-click a layer name in the Layers panel → opens inline `<input>` field.

### Behavior

- Input pre-filled with current `@id` (without `@` prefix)
- Enter → commit rename
- Escape → cancel
- Blur → commit

### Scope

Rename updates the `@id` **everywhere** in the document:

- Node declaration (`rect @old_id {` → `rect @new_id {`)
- Constraint references (`center_in: @old_id` → `center_in: @new_id`)
- Edge references (`from: @old_id` → `from: @new_id`)
- Style references (if any)

Uses **word-boundary safe** replacement to avoid partial matches (e.g. renaming `@btn` doesn't break `@btn_label`).

### Sanitization

- Strip leading/trailing whitespace
- Replace spaces with underscores
- Remove characters invalid in FD identifiers
- Reject empty string (keep original)

## Edge Cases

- **Empty text on commit** → removes text child node (shape) or keeps empty text node
- **Very long text** → textarea scrolls; text wraps within node bounds on canvas
- **Rename to existing `@id`** → parser rejects duplicate, error shown
- **Rename while animations reference the `@id`** → `anim` blocks stay attached (they're children, not references)
- **Double-click during drag** → prevented by dead-zone check (pointer-up at same position = click, not drag)
- **Press animation suppression** → `clear_pressed()` called before opening editor to prevent shape jump from `:press` animation state

## Implementation Notes

| Module             | File                        | Key Functions                                |
| ------------------ | --------------------------- | -------------------------------------------- |
| Inline editor (JS) | `fd-vscode/webview/main.js` | `openInlineEditor()`, `commit()`             |
| WASM prop setter   | `crates/fd-wasm/src/lib.rs` | `set_node_prop("label", ...)`                |
| Text child mgmt    | `crates/fd-wasm/src/lib.rs` | Creates/updates/removes `text` child node    |
| Layer rename (JS)  | `fd-vscode/webview/main.js` | `refreshLayersPanel()` inline rename handler |
| Graph-wide rename  | `crates/fd-wasm/src/lib.rs` | `set_text()` re-parse with new `@id`         |

## Test Coverage

| Test                | Location         | What it covers                                           |
| ------------------- | ---------------- | -------------------------------------------------------- |
| E2E: inline editing | `e2e-ux.test.ts` | Double-click open, enter commit, escape revert (3 tests) |
| E2E: hex luminance  | `e2e-ux.test.ts` | Auto-contrast text color (1 test)                        |
| E2E: rename         | `e2e-ux.test.ts` | Sanitization, word-boundary safety (3 tests)             |
