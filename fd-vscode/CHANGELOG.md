# Changelog

## [0.6.13] — 2026-02-22

### Added

- **Edge flow animations**: Unlocks R5.8 requirement `flow:` properties on edges (`flow: pulse Nms` and `flow: dash Nms`). Pulse renders a traveling dot from start to finish. Dash renders marching dashes along the stroke. Driven by real-time `requestAnimationFrame` loop in the Webview.

## [0.6.12] — 2026-02-22

### Fixed

- **Command stack undo tests**: Added 5 comprehensive integration tests covering `ResizeNode`, `SetStyle`, redo stack eviction logic, and max depth capping for the frontend `SyncEngine` transaction system. 146 workspace tests passing.

## [0.6.11] — 2026-02-22

### Fixed

- **Gradient fill roundtrip**: `fill: linear(...)` and `fill: radial(...)` were emitted correctly but couldn't be re-parsed (parser only accepted solid hex). Both `parse_node_property` and `parse_style_block` now use `parse_paint()` which handles all three paint types.
- **Radial gradient stop parsing**: first gradient stop in `radial(...)` form no longer requires a leading comma (was silently producing empty stop lists).
- **Shadow roundtrip**: shadow was parsed correctly but never emitted, so it was silently dropped after the first `emit_document`. Fixed emitter to write `shadow: (ox,oy,blur,#COLOR)` and parser to read it back.
- Added 5 new roundtrip tests: `roundtrip_linear_gradient_fill`, `roundtrip_radial_gradient_fill`, `roundtrip_shadow`, `roundtrip_path_kind`, `roundtrip_gradient_in_named_style`.

## [0.6.10] — 2026-02-22

### Added

- **Real path rendering**: `NodeKind::Path` now renders via proper Canvas2D path commands (`moveTo`, `lineTo`, `quadraticCurveTo`, `bezierCurveTo`, `closePath`) from all `PathCmd` variants. Previously just showed a dashed placeholder rect.
- **Gradient fills in canvas**: `LinearGradient` and `RadialGradient` paint types now create real `CanvasGradient` objects. Linear uses bounding-box + angle math; radial is centered in the bounding box.
- **Drop shadows in canvas**: `Style.shadow` (blur, offset_x, offset_y, color) is applied via Canvas2D shadow properties before fill, cleared after so stroke is unaffected.

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
