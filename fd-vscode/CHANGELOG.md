# Changelog

## [0.6.6] — 2026-02-22

### Added

- **Format Document** (`Option+Shift+F`): auto-formats `.fd` files using the bundled `fd-lsp --format` binary. Runs the full `parse → dedup_use → emit` pipeline with canonical style ordering.
- **Format settings**: `fd.format.dedupeStyles` (default: `true`) and `fd.format.hoistStyles` (default: `false`) in VS Code settings.
- **Pen tool bezier smoothing**: freehand strokes are now smoothed with Catmull-Rom → cubic Bézier on pointer-up (max 64 sample points). Live `LineTo` preview during drawing.
- **Apple Pencil Pro modifier+squeeze combos**: `Shift+squeeze` → Pen, `Ctrl+squeeze` → Select, `Alt+squeeze` → Rect, `Ctrl+Shift+squeeze` → Ellipse.
- **Comment preservation** (`R1.16`): `#` comment lines are now round-tripped through parse and emit, preserving them in the `.fd` file.
- **Lint diagnostics** (`R4.10`): `lint_document` checks for anonymous IDs, duplicate `use:` references, and unused `style {}` blocks.
- **AI Refine** (`fd.aiRefine` / `fd.aiRefineAll`): AI-powered node restyling and semantic ID assignment via Gemini, OpenAI, Anthropic, Ollama, or OpenRouter.
- **Spec View** (`FD: Show Spec View`): displays structured annotations (`## description / status / priority / accept / tag`).
- **Export Spec** (`FD: Export Spec to Markdown`): generates a markdown requirements report from `##` annotations.
- **Annotation pins**: interactive badge dots on canvas nodes for viewing/editing annotations inline.
- **Namespaced imports**: `import "path.fd" as ns` with `ns.style_name` references.
- **Edge animations**: `flow: pulse | dash` and `trigger: hover | press` animations on edges.
- **Generic nodes**: untyped placeholder nodes for diagram-style layouts.

### Changed

- Canvas uses Apple-inspired light/dark theme (Catppuccin Mocha dark mode).
- Node IDs are now type-prefixed (`rect_1`, `ellipse_2`, `path_3`, `text_4`) instead of `_anon_N`.
- Minimum default shape size on click-without-drag: 100×100 px.
- Undo of `RemoveNode` now restores to the actual parent (not always `root`).

### Fixed

- Parser `label:` property in `ModalResult` context (`ErrMode::Cut`).
- Canvas panning correctly applied to hit-tests for badges, context menus, and drag/drop.

### Changed

- Renamed extension from `ftd-vscode` to `fast-draft`
- File extension changed from `.ftd` to `.fd`
- Language ID changed from `ftd` to `fd`
- All command prefixes changed from `ftd.*` to `fd.*`

## [0.1.0] — 2026-02-21

### Added

- Syntax highlighting for `.fd` files via TextMate grammar
- Live parser validation with error diagnostics
- Interactive canvas editor (WASM-powered Canvas2D rendering)
- Tree preview command (`FD: Show Tree Preview`)
- Bidirectional sync between text editor and canvas
- Select and Rectangle tools with keyboard shortcuts
- Undo/Redo support (Cmd+Z / Cmd+Shift+Z)
