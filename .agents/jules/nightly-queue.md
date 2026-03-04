# Jules Nightly Task Queue

> Prioritized backlog for overnight Jules sessions. Tasks are executed top-down.
> Mark `[x]` when a PR is merged. Mark `[!]` if session failed — add notes.

---

## Priority 1 — High Impact, Focused Scope

### [1] R3.19: Alt-Draw-From-Center

- **Requirement**: R3.19 _(planned)_
- **Scope**: `crates/fd-editor/src/tools.rs` (RectTool, EllipseTool draw handlers)
- **Tests**: `rect_tool_alt_draw_from_center`, `ellipse_tool_alt_draw_from_center`, `alt_draw_releases_on_keyup`
- **Acceptance**: Holding Alt/⌥ during drag-to-create anchors the start point as center; releasing Alt mid-draw reverts to top-left anchor
- **Estimated sessions**: 1
- **Status**: [ ]

### [2] R3.15: Live Preview Ghost During Drag-to-Create

- **Requirement**: R3.15 _(planned)_
- **Scope**: `crates/fd-editor/src/tools.rs`, `crates/fd-render/src/render2d.rs`, `fd-vscode/webview/src/canvas-render.js`
- **Tests**: `rect_tool_preview_bounds_match_drag`, `ellipse_tool_preview_during_draw`, `pen_tool_smooth_curve_preview`
- **Acceptance**: Dashed outline ghost appears during drag-to-create for rect/ellipse; smooth curve preview during pen draw; ghost disappears on pointer-up
- **Estimated sessions**: 1
- **Status**: [ ]

### [3] R3.35: Detach Snap Animation

- **Requirement**: R3.35 _(planned)_
- **Scope**: `fd-vscode/webview/src/canvas-render.js`, `crates/fd-editor/src/sync.rs` (existing `last_detach` API)
- **Tests**: `detach_animation_fires_on_reparent`, `detach_animation_duration_under_200ms`
- **Acceptance**: Purple glow on near-detach, rubber-band line, scale pop + glow on detach; all animations <200ms
- **Estimated sessions**: 1
- **Status**: [ ]

### [4] Export to Excalidraw JSON

- **Requirement**: NEW → R3.55
- **Scope**: `crates/fd-core/src/export_excalidraw.rs` (new), `crates/fd-wasm/src/lib.rs` (WASM binding)
- **Tests**: `export_rect_to_excalidraw`, `export_ellipse_to_excalidraw`, `export_text_to_excalidraw`, `export_edge_to_excalidraw`, `roundtrip_fd_excalidraw_shapes`
- **Acceptance**: `export_excalidraw(graph) -> String` returns valid Excalidraw JSON; rect/ellipse/text/arrow elements mapped correctly; canvas command ⌘⇧X triggers export
- **Estimated sessions**: 2
- **Status**: [ ]

### [5] Export to HTML+CSS+JS

- **Requirement**: NEW → R3.56
- **Scope**: `crates/fd-core/src/export_html.rs` (new), `crates/fd-wasm/src/lib.rs`
- **Tests**: `export_html_single_rect`, `export_html_nested_layout`, `export_html_animations`, `export_html_theme_colors`
- **Acceptance**: `export_html(graph) -> String` returns standalone HTML page with inline CSS; shapes → `<div>` with border-radius/background; text → `<p>`; layout constraints → flexbox; animations → CSS transitions; canvas command triggers export
- **Estimated sessions**: 2
- **Status**: [ ]

---

## Priority 2 — Medium Complexity Features

### [6] R1.18: Mermaid Import

- **Requirement**: R1.18 _(planned)_
- **Scope**: `crates/fd-core/src/import_mermaid.rs` (new), `crates/fd-core/src/parser.rs` (detect mermaid blocks)
- **Tests**: `import_mermaid_flowchart_lr`, `import_mermaid_flowchart_td`, `import_mermaid_sequence`, `import_mermaid_state`, `import_mermaid_edges_preserved`
- **Acceptance**: `import_mermaid(source) -> Result<SceneGraph, String>` parses `flowchart`, `sequenceDiagram`, `stateDiagram` into FD nodes + edges
- **Estimated sessions**: 2
- **Status**: [ ]

### [7] R3.32: Image Embedding

- **Requirement**: R3.32 _(planned)_
- **Scope**: `crates/fd-core/src/model.rs` (NodeKind::Image), `crates/fd-core/src/parser.rs`, `crates/fd-core/src/emitter.rs`, `fd-vscode/webview/src/canvas-render.js`
- **Tests**: `parse_image_node`, `emit_image_node`, `roundtrip_image_base64`, `roundtrip_image_file_ref`
- **Acceptance**: `image @id { src: "path" }` or `image @id { src: "data:..."  }` parsed; drag-and-drop in canvas creates image node; rendered via `drawImage`
- **Estimated sessions**: 2
- **Status**: [ ]

### [8] R3.22: Pressure-Sensitive Stroke Width

- **Requirement**: R3.22 _(planned)_
- **Scope**: `crates/fd-editor/src/tools.rs` (PenTool), `crates/fd-core/src/model.rs` (Path pressure data), `crates/fd-render/src/render2d.rs`
- **Tests**: `pen_tool_captures_pressure`, `pen_tool_pressure_to_width`, `roundtrip_path_pressure_data`
- **Acceptance**: Pen tool maps `pointerEvent.pressure` to stroke width in real-time; pressure data stored per path point; rendered as variable-width stroke
- **Estimated sessions**: 2
- **Status**: [ ]

### [9] R3.5: Path Editing (Phase 1 — Node Manipulation)

- **Requirement**: R3.5 _(planned)_
- **Scope**: `crates/fd-editor/src/tools.rs` (PathEditTool new), `crates/fd-core/src/model.rs` (PathPoint, ControlHandle)
- **Tests**: `path_edit_select_point`, `path_edit_move_point`, `path_edit_add_point`, `path_edit_delete_point`
- **Acceptance**: Double-click path enters edit mode; click selects points; drag moves points; click on segment adds point; Delete removes point; Esc exits edit mode
- **Estimated sessions**: 3
- **Status**: [ ]

### [10] R3.23: Freehand Shape Recognition

- **Requirement**: R3.23 _(planned)_
- **Scope**: `crates/fd-editor/src/tools.rs` (PenTool post-draw), `crates/fd-core/src/shape_detect.rs` (new)
- **Tests**: `detect_rectangle_shape`, `detect_circle_shape`, `detect_line_shape`, `detect_triangle_shape`, `no_detect_complex_path`
- **Acceptance**: After pen stroke, detect if shape is near-rectangular/circular/triangular; show "Snap to Shape" toast; confirm replaces path with clean shape
- **Estimated sessions**: 2
- **Status**: [ ]

---

## Priority 3 — AI & Advanced Features

### [11] AI Assist on Selection (Canvas)

- **Requirement**: NEW → R4.20
- **Scope**: `fd-vscode/src/extension.ts`, `fd-vscode/webview/src/canvas-ui.js`, `crates/fd-wasm/src/lib.rs` (selection → FD text extraction)
- **Tests**: `extract_selected_nodes_as_fd`, `ai_assist_replaces_selection`, `ai_assist_preserves_unselected`
- **Acceptance**: Select nodes on canvas → click "✦ AI Assist" → AI receives `.fd` text of selected nodes → returns redesigned `.fd` → bidi-sync renders changes live; undo reverts entire AI edit
- **Estimated sessions**: 3
- **Status**: [ ]

### [12] Fine Pen Tools — Taper & Smoothing

- **Requirement**: NEW → R3.57
- **Scope**: `crates/fd-core/src/model.rs` (PenSettings: taper_start, taper_end, smoothing), `crates/fd-editor/src/tools.rs`, `crates/fd-render/src/render2d.rs`
- **Tests**: `pen_taper_start_narrows`, `pen_taper_end_narrows`, `pen_smoothing_reduces_points`, `roundtrip_pen_settings`
- **Acceptance**: Pen tool supports `taper_start: Npx`, `taper_end: Npx`, `smoothing: 0-1`; settings in properties panel when pen tool active
- **Estimated sessions**: 2
- **Status**: [ ]

### [13] Animation Timeline Panel

- **Requirement**: NEW → R3.58
- **Scope**: `fd-vscode/webview/src/timeline.js` (new), `fd-vscode/src/webview-html.ts`, `crates/fd-wasm/src/lib.rs` (animation query API)
- **Tests**: `timeline_shows_when_triggers`, `timeline_drag_adjusts_duration`, `timeline_scrub_previews_state`
- **Acceptance**: Bottom panel shows visual keyframe timeline; each `when` block → track with duration bar; drag endpoints to adjust timing; scrub to preview
- **Estimated sessions**: 3
- **Status**: [ ]

### [14] R2.3: Incremental Re-Parse

- **Requirement**: R2.3 _(planned)_
- **Scope**: `crates/fd-core/src/parser.rs`, `crates/fd-core/src/model.rs` (change tracking)
- **Tests**: `incremental_parse_single_node_change`, `incremental_parse_add_node`, `incremental_parse_delete_node`, `incremental_parse_matches_full_parse`
- **Acceptance**: `parse_incremental(old_graph, old_text, new_text, edit_range) -> SceneGraph` re-parses only affected nodes; result identical to full parse; measurably faster for single-node edits
- **Estimated sessions**: 3
- **Status**: [ ]

---

## Priority 4 — Code Quality & Testing

### [15] Missing Tests: Pen Tool (R3.4)

- **Requirement**: R3.4 (test gap)
- **Scope**: `crates/fd-editor/src/tools.rs`
- **Tests**: `pen_tool_creates_path`, `pen_tool_catmull_rom_smoothing`, `pen_tool_minimum_points`, `pen_tool_undo_removes_path`
- **Acceptance**: 4+ pen tool unit tests pass; test matrix updated
- **Estimated sessions**: 1
- **Status**: [ ]

### [16] Missing Tests: Extension AI Features (R4.7–R4.11)

- **Requirement**: R4.7–R4.11 (test gap, marked ❌ in test matrix)
- **Scope**: `fd-vscode/test/` (TypeScript tests)
- **Tests**: `spec_view_export_generates_markdown`, `ai_refine_sends_correct_prompt`, `multi_provider_key_routing`, `auto_format_ordering`, `inline_spec_view_renders`
- **Acceptance**: 5+ TypeScript tests covering AI/spec extension features; test matrix updated from ❌ to ✅
- **Estimated sessions**: 1
- **Status**: [ ]

### [17] Fix TODOs/FIXMEs Across Codebase

- **Requirement**: QUALITY
- **Scope**: All Rust + TypeScript files (run `rg -n "TODO|FIXME|HACK|XXX"`)
- **Tests**: Context-dependent — each fix gets its own test
- **Acceptance**: Top 10 TODOs/FIXMEs resolved or converted to tracked issues
- **Estimated sessions**: 1
- **Status**: [ ]

### [18] Functions Over 30 Lines — Refactor

- **Requirement**: QUALITY (GEMINI.md rule)
- **Scope**: All Rust crates (run `rg -c "" --type rust | sort -t: -k2 -nr` to find long files, then check function lengths)
- **Tests**: Existing tests must still pass after refactor
- **Acceptance**: No Rust function exceeds 30 lines; all tests pass; clippy clean
- **Estimated sessions**: 1
- **Status**: [ ]

### [19] Clippy Pedantic Lints

- **Requirement**: QUALITY
- **Scope**: All Rust crates — add `#![warn(clippy::pedantic)]` and fix warnings
- **Tests**: `cargo clippy --workspace -- -W clippy::pedantic` passes
- **Acceptance**: Zero pedantic clippy warnings; no `#[allow]` escape hatches except justified ones
- **Estimated sessions**: 1
- **Status**: [ ]

### [20] Documentation — Crate-Level Docs

- **Requirement**: QUALITY
- **Scope**: `crates/fd-core/src/lib.rs`, `crates/fd-editor/src/lib.rs`, `crates/fd-render/src/lib.rs`
- **Tests**: `cargo doc --workspace --no-deps` succeeds with no warnings
- **Acceptance**: Each crate has `//!` module docs; all public items have `///` doc comments; `cargo doc` clean
- **Estimated sessions**: 1
- **Status**: [ ]

### [21] R3.34: Community Library Directory (Research)

- **Requirement**: R3.34 _(planned)_
- **Scope**: Design doc only — `.agents/jules/specs/community-library.md`
- **Tests**: N/A (research task)
- **Acceptance**: Spec document with API design, storage format, security model, and search UX
- **Estimated sessions**: 1
- **Status**: [ ]

---

## Queue Management

**Nightly capacity**: 4–6 sessions (quality over quantity)
**Selection rule**: Pick top unchecked `[ ]` items; skip items with `estimated sessions > 2` unless queue is empty
**Failure handling**: Mark `[!]` with session ID and error; retry next night with refined prompt
