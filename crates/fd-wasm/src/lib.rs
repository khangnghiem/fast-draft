//! WASM bridge for FD — exposes the Rust document engine to JavaScript.
//!
//! Compiled via `wasm-pack build --target web` and loaded in VS Code webview.

mod code_intel;
mod crud;
mod export;
mod keyboard;
mod notes;
mod pointer;
mod props;
mod render2d;
mod responses;
mod search;
mod selection;
mod svg;

use fd_core::id::NodeId;
use fd_core::layout::Viewport;
use fd_core::model::{NodeKind, Properties};
use fd_editor::commands::CommandStack;
use fd_editor::input::PointerType;
use fd_editor::sync::{GraphMutation, SyncEngine, expand_group_to_children};
use fd_editor::tools::{
    ArrowTool, EllipseTool, EraserTool, LassoTool, PenTool, RectTool, ResizeHandle, SelectTool,
    TextTool, ToolKind,
};
use fd_render::hit::SpatialIndex;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use wasm_bindgen::prelude::*;

/// The main WASM-facing canvas controller.
///
/// Holds the sync engine, command stack, and active tool. All interaction
/// from the webview JS goes through this struct.
#[wasm_bindgen]
pub struct FdCanvas {
    pub(crate) engine: SyncEngine,
    pub(crate) commands: CommandStack,
    pub(crate) active_tool: ToolKind,
    /// Previous tool — used for Apple Pencil Pro squeeze toggle.
    pub(crate) prev_tool: ToolKind,
    pub(crate) select_tool: SelectTool,
    pub(crate) rect_tool: RectTool,
    pub(crate) ellipse_tool: EllipseTool,
    pub(crate) pen_tool: PenTool,
    pub(crate) text_tool: TextTool,
    pub(crate) arrow_tool: ArrowTool,
    pub(crate) eraser_tool: EraserTool,
    pub(crate) lasso_tool: LassoTool,
    /// Pending text flush after eraser gesture (batched to pointer-up).
    pub(crate) erase_pending_flush: bool,
    pub(crate) width: f64,
    pub(crate) height: f64,
    /// Suppress text-changed messages during programmatic updates.
    pub(crate) suppress_sync: bool,
    /// Dark mode flag — `false` = light (default), `true` = dark.
    pub(crate) dark_mode: bool,
    /// Sketchy hand-drawn rendering mode.
    pub(crate) sketchy_mode: bool,
    /// Cached canvas theme — rebuilt only on `set_theme()`, not per-frame.
    pub(crate) cached_theme: render2d::CanvasTheme,
    pub(crate) hovered_id: Option<fd_core::id::NodeId>,
    pub(crate) pressed_id: Option<fd_core::id::NodeId>,
    /// Timestamp (ms) when hover started on the current node.
    pub(crate) hover_start_ms: f64,
    /// Pointer-down scene position — used to detect click vs drag.
    pub(crate) pointer_down_pos: Option<(f32, f32)>,
    /// Style clipboard for Copy/Paste Style (⌥⌘C / ⌥⌘V).
    pub(crate) style_clipboard: Option<Properties>,
    /// Whether we already duplicated during this drag (Alt+drag).
    pub(crate) alt_duplicated: bool,
    /// Scene-space position where Alt was first detected during a drag.
    pub(crate) alt_press_pos: Option<(f32, f32)>,
    /// Bounds snapshots of original node(s) captured at duplication time.
    pub(crate) alt_clone_origins: Vec<(f32, f32, f32, f32)>,
    /// Cached spatial index for O(log N) hit testing.
    pub(crate) spatial_index: Option<SpatialIndex>,
    /// Hash of resolved bounds — used to detect layout-unchanged text edits.
    pub(crate) bounds_hash: u64,
    /// Current pointer device type — updated each pointer event from JS.
    pub(crate) pointer_type: PointerType,
    /// Currently edited text node ID to suppress from Vello rendering (prevents ghosting)
    pub(crate) suppressed_text_id: Option<String>,
}

// ─── Lifecycle & Core APIs ───────────────────────────────────────────────

#[wasm_bindgen]
impl FdCanvas {
    /// Create a new canvas controller with the given dimensions.
    #[wasm_bindgen(constructor)]
    pub fn new(width: f64, height: f64) -> Self {
        console_error_panic_hook_setup();

        // Seed the core ID generator to prevent multi-session ID collisions
        fd_core::id::NodeId::seed_prefix_counter(js_sys::Date::now() as u64);

        let viewport = Viewport {
            width: width as f32,
            height: height as f32,
        };
        let engine = SyncEngine::new(viewport);

        Self {
            engine,
            commands: CommandStack::new(200),
            active_tool: ToolKind::Hand,
            prev_tool: ToolKind::Hand,
            select_tool: SelectTool::new(),
            rect_tool: RectTool::new(),
            ellipse_tool: EllipseTool::new(),
            pen_tool: PenTool::new(),
            text_tool: TextTool::new(),
            arrow_tool: ArrowTool::new(),
            eraser_tool: EraserTool::new(),
            lasso_tool: LassoTool::new(),
            erase_pending_flush: false,
            width,
            height,
            suppress_sync: false,
            dark_mode: false,
            sketchy_mode: false,
            cached_theme: render2d::CanvasTheme::light(),
            hovered_id: None,
            pressed_id: None,
            hover_start_ms: 0.0,
            pointer_down_pos: None,
            style_clipboard: None,
            alt_duplicated: false,
            alt_press_pos: None,
            alt_clone_origins: Vec::new(),
            spatial_index: None,
            bounds_hash: 0,
            pointer_type: PointerType::Mouse,
            suppressed_text_id: None,
        }
    }

    /// Set the FD source text, re-parsing into the scene graph.
    /// Returns a JSON string: `{"ok":true,"layout_changed":bool}`
    pub fn set_text(&mut self, text: &str) -> String {
        if text == self.engine.current_text() {
            return r#"{"ok":true,"layout_changed":false,"duplicate_ids":[]}"#.to_string();
        }
        self.suppress_sync = true;
        let result = self.engine.set_text(text);
        self.engine.resolve();
        self.suppress_sync = false;
        if result.is_err() {
            return r#"{"ok":false,"layout_changed":false,"duplicate_ids":[]}"#.to_string();
        }
        let new_hash = self.compute_bounds_hash();
        let layout_changed = new_hash != self.bounds_hash;
        self.bounds_hash = new_hash;
        if layout_changed {
            self.rebuild_spatial_index();
        }

        // Scan for duplicate IDs to warn the user
        let mut seen = std::collections::HashSet::new();
        let mut duplicates = Vec::new();
        for w in self.engine.graph.graph.node_weights() {
            if !seen.insert(w.id) {
                duplicates.push(w.id.as_str());
            }
        }
        let duplicates_json = if duplicates.is_empty() {
            "[]".to_string()
        } else {
            duplicates.sort();
            duplicates.dedup();
            let arr = duplicates
                .iter()
                .map(|s| format!("\"{}\"", s))
                .collect::<Vec<_>>()
                .join(",");
            format!("[{}]", arr)
        };

        let lc = if layout_changed { "true" } else { "false" };
        format!(
            r#"{{"ok":true,"layout_changed":{},"duplicate_ids":{}}}"#,
            lc, duplicates_json
        )
    }

    /// Import a Mermaid diagram, converting it to FD format.
    pub fn import_mermaid(&mut self, mermaid_text: &str) -> bool {
        let imported = match fd_core::parse_mermaid(mermaid_text) {
            Ok(g) => g,
            Err(_) => return false,
        };
        let imported_fd = fd_core::emitter::emit_document(&imported);
        let current = self.engine.current_text().to_string();
        let combined = if current.trim().is_empty() {
            imported_fd
        } else {
            format!("{}\n\n{}", current.trim_end(), imported_fd)
        };
        self.suppress_sync = true;
        let result = self.engine.set_text(&combined);
        self.engine.resolve();
        self.suppress_sync = false;
        result.is_ok()
    }

    /// Get the current FD source text (synced from graph).
    pub fn get_text(&mut self) -> String {
        self.engine.current_text().to_string()
    }

    /// Set the canvas theme.
    pub fn set_theme(&mut self, is_dark: bool) {
        self.dark_mode = is_dark;
        self.cached_theme = if is_dark {
            render2d::CanvasTheme::dark()
        } else {
            render2d::CanvasTheme::light()
        };
    }

    /// Enable or disable sketchy (hand-drawn) rendering mode.
    pub fn set_sketchy_mode(&mut self, enabled: bool) {
        self.sketchy_mode = enabled;
    }

    /// Check if sketchy rendering mode is enabled.
    pub fn get_sketchy_mode(&self) -> bool {
        self.sketchy_mode
    }

    /// Get the current theme as a JSON object.
    pub fn get_theme_json(&self) -> String {
        let contract = if self.dark_mode {
            fd_core::theme::ThemeContract::dark()
        } else {
            fd_core::theme::ThemeContract::light()
        };
        contract.to_json()
    }

    /// Check if any edge in the scene has a flow animation.
    pub fn has_active_flows(&self) -> bool {
        self.engine.graph.edges.iter().any(|e| e.flow.is_some())
    }

    /// Resize the canvas.
    pub fn resize(&mut self, width: f64, height: f64) {
        self.width = width;
        self.height = height;
        self.engine.viewport = Viewport {
            width: width as f32,
            height: height as f32,
        };
        let interacting = self.select_tool.dragging
            || self.select_tool.resize_handle.is_some()
            || self.rect_tool.is_drawing()
            || self.pen_tool.is_drawing()
            || self.ellipse_tool.is_drawing()
            || self.arrow_tool.drawing;
        if !interacting {
            self.engine.resolve();
        }
    }

    /// Switch the active tool, remembering the previous one.
    pub fn set_tool(&mut self, name: &str) {
        let new_tool = match name {
            "select" => ToolKind::Select,
            "hand" => ToolKind::Hand,
            "rect" => ToolKind::Rect,
            "ellipse" => ToolKind::Ellipse,
            "pen" => ToolKind::Pen,
            "text" => ToolKind::Text,
            "arrow" => ToolKind::Arrow,
            "frame" => ToolKind::Frame,
            "eraser" => ToolKind::Eraser,
            "lasso" => ToolKind::Lasso,
            _ => ToolKind::Select,
        };
        if new_tool != self.active_tool {
            self.prev_tool = self.active_tool;
            self.active_tool = new_tool;
        }
    }

    /// Set the current pointer device type (0=mouse, 1=touch, 2=pen).
    /// Called from JS before each pointer event to adapt hit radii and handle sizes.
    pub fn set_pointer_type(&mut self, ptype: u8) {
        self.pointer_type = PointerType::from_u8(ptype);
    }

    /// Suppress rendering of a specific text node during inline WYSIWYG editing.
    pub fn set_suppressed_text_node(&mut self, id: Option<String>) {
        self.suppressed_text_id = id;
    }

    /// Resolve the effective tool for the current pointer event.
    /// Hand + Apple Pencil → Select (input-aware Hand: finger=pan, pencil=select).
    pub(crate) fn effective_tool(&self) -> ToolKind {
        if self.active_tool == ToolKind::Hand && self.pointer_type == PointerType::Pen {
            ToolKind::Select
        } else {
            self.active_tool
        }
    }

    /// Get the visual handle size for the current pointer type (for JS rendering).
    pub fn get_handle_visual_size(&self) -> f32 {
        self.pointer_type.handle_visual_size()
    }

    /// Whether to show only corner handles (true for touch).
    pub fn get_corners_only(&self) -> bool {
        self.pointer_type.corners_only()
    }

    /// Get the arrow tool's live preview line or the select tool's snap target during drag.
    pub fn get_arrow_preview(&self) -> String {
        if self.active_tool == ToolKind::Select {
            match self.select_tool.preview_target() {
                Some(id) => format!(r#"{{"target_id":"{}"}}"#, id.as_str()),
                None => String::new(),
            }
        } else if self.active_tool == ToolKind::Arrow {
            match self.arrow_tool.preview_line() {
                Some((x1, y1, x2, y2)) => {
                    let target_part = match self.arrow_tool.preview_target() {
                        Some(id) => format!(r#","target_id":"{}""#, id.as_str()),
                        None => String::new(),
                    };
                    format!(
                        r#"{{"x1":{},"y1":{},"x2":{},"y2":{}{}}}"#,
                        x1, y1, x2, y2, target_part
                    )
                }
                None => String::new(),
            }
        } else {
            String::new()
        }
    }

    /// Get the current tool name.
    pub fn get_tool_name(&self) -> String {
        keyboard::tool_kind_to_name(self.active_tool).to_string()
    }

    /// Get the CSS resize cursor for a given scene-space position.
    /// Returns empty string if no resize handle is under the point.
    pub fn get_resize_cursor_at(&self, x: f32, y: f32) -> String {
        match self.hit_test_resize_handle(x, y) {
            Some(ResizeHandle::TopLeft) | Some(ResizeHandle::BottomRight) => {
                "nwse-resize".to_string()
            }
            Some(ResizeHandle::TopRight) | Some(ResizeHandle::BottomLeft) => {
                "nesw-resize".to_string()
            }
            Some(ResizeHandle::TopCenter) | Some(ResizeHandle::BottomCenter) => {
                "ns-resize".to_string()
            }
            Some(ResizeHandle::MiddleLeft) | Some(ResizeHandle::MiddleRight) => {
                "ew-resize".to_string()
            }
            Some(ResizeHandle::EdgeStart) | Some(ResizeHandle::EdgeEnd) => "crosshair".to_string(),
            None => String::new(),
        }
    }

    /// Insert a new node (used by JS Drag-to-Create from toolbar).
    /// Bypasses JS string construction to enforce WASM defaults.
    pub fn insert_node_at(&mut self, kind_str: &str, x: f32, y: f32, w: f32, h: f32) -> bool {
        use fd_core::model::{
            ArrowKind, Color, Constraint, CurveKind, Edge, EdgeAnchor, LayoutMode, Paint,
            SceneNode, Stroke, StrokeCap, StrokeJoin,
        };

        if kind_str == "arrow" {
            let edge_id = NodeId::with_prefix("edge");
            let mut edge = Edge {
                id: edge_id,
                from: EdgeAnchor::Point(x, y),
                to: EdgeAnchor::Point(x + w, y + h),
                text_child: None,
                props: Default::default(),
                use_styles: Default::default(),
                arrow: ArrowKind::End,
                curve: CurveKind::Smooth,
                spec: None,
                animations: Default::default(),
                flow: None,
                label_offset: None,
            };
            edge.props.stroke = Some(Stroke {
                paint: Paint::Solid(if self.dark_mode {
                    Color::rgba(0.8, 0.8, 0.8, 1.0)
                } else {
                    Color::rgba(0.2, 0.2, 0.2, 1.0)
                }),
                width: 2.0,
                cap: StrokeCap::Round,
                join: StrokeJoin::Round,
            });
            let mutations = vec![GraphMutation::AddEdge {
                edge: Box::new(edge),
            }];
            self.apply_mutations(mutations);
            self.engine.flush_to_text();
            return true;
        }

        let id = NodeId::with_prefix(kind_str);
        let mut node = match kind_str {
            "rect" | "pen" => {
                let mut n = SceneNode::new(
                    id,
                    NodeKind::Rect {
                        width: 0.0,
                        height: 0.0,
                    },
                );
                n.props.stroke = Some(Stroke {
                    paint: Paint::Solid(if self.dark_mode {
                        Color::rgba(0.8, 0.8, 0.8, 1.0)
                    } else {
                        Color::rgba(0.2, 0.2, 0.2, 1.0)
                    }),
                    width: 2.5,
                    cap: StrokeCap::Round,
                    join: StrokeJoin::Round,
                });
                n.props.corner_radius = Some(8.0);
                n
            }
            "ellipse" => {
                let mut n = SceneNode::new(id, NodeKind::Ellipse { rx: 0.0, ry: 0.0 });
                n.props.stroke = Some(Stroke {
                    paint: Paint::Solid(if self.dark_mode {
                        Color::rgba(0.8, 0.8, 0.8, 1.0)
                    } else {
                        Color::rgba(0.2, 0.2, 0.2, 1.0)
                    }),
                    width: 2.5,
                    cap: StrokeCap::Round,
                    join: StrokeJoin::Round,
                });
                n
            }
            "frame" => {
                let mut n = SceneNode::new(
                    id,
                    NodeKind::Frame {
                        width: 0.0,
                        height: 0.0,
                        clip: false,
                        layout: LayoutMode::default(),
                    },
                );
                n.props.fill = Some(Paint::Solid(if self.dark_mode {
                    Color::rgba(0.15, 0.15, 0.15, 1.0)
                } else {
                    Color::rgba(0.97, 0.97, 0.97, 1.0)
                }));
                n.props.stroke = Some(Stroke {
                    paint: Paint::Solid(if self.dark_mode {
                        Color::rgba(0.3, 0.3, 0.3, 1.0)
                    } else {
                        Color::rgba(0.7, 0.7, 0.7, 1.0)
                    }),
                    width: 1.0,
                    cap: StrokeCap::Butt,
                    join: StrokeJoin::Miter,
                });
                n
            }
            "text" => SceneNode::new(
                id,
                NodeKind::Text {
                    content: "Text".to_string(),
                    max_width: None,
                },
            ),
            _ => SceneNode::new(
                id,
                NodeKind::Rect {
                    width: 0.0,
                    height: 0.0,
                },
            ), // Default fallback
        };

        node.constraints.push(Constraint::Position { x, y });

        let mutations = vec![
            GraphMutation::AddNode {
                parent_id: NodeId::intern("root"),
                node: Box::new(node),
            },
            GraphMutation::ResizeNode {
                id,
                width: w,
                height: h,
                dx: 0.0,
                dy: 0.0,
            },
        ];

        self.apply_mutations(mutations);
        self.engine.flush_to_text();
        true
    }

    /// Undo the last action.
    pub fn undo(&mut self) -> bool {
        let result = self.commands.undo(&mut self.engine);
        if let Some((_desc, is_snapshot)) = &result {
            if !is_snapshot {
                self.engine.resolve();
            }
            self.engine.flush_to_text();
        }
        result.is_some()
    }

    /// Redo the last undone action.
    pub fn redo(&mut self) -> bool {
        let result = self.commands.redo(&mut self.engine);
        if let Some((_desc, is_snapshot)) = &result {
            if !is_snapshot {
                self.engine.resolve();
            }
            self.engine.flush_to_text();
        }
        result.is_some()
    }

    /// Check if text changed due to canvas interaction (for sync back to editor).
    pub fn has_pending_text_change(&self) -> bool {
        !self.suppress_sync
    }

    /// Push a text snapshot for undo support.
    pub fn push_undo_snapshot(&mut self, text_before: &str, text_after: &str) {
        self.commands
            .push_snapshot(text_before.to_string(), text_after.to_string(), "paste");
    }

    /// Format the document using the default config (dedup + sort, no hoist).
    /// Returns `true` if the document was changed.
    pub fn format_and_dedup(&mut self) -> bool {
        let config = fd_core::FormatConfig::default();
        self.run_format(&config)
    }

    /// Format the document with granular options.
    /// Returns JSON: `{"changed":bool,"lines_before":N,"lines_after":N,"summary":"..."}`
    pub fn format_with_options(&mut self, dedup: bool, sort: bool, hoist: bool) -> String {
        let config = fd_core::FormatConfig {
            dedup_use: dedup,
            dedup_ids: true, // always dedup collision IDs
            hoist_styles: hoist,
            sort_nodes: sort,
        };
        let text_before = self.engine.current_text().to_string();
        let lines_before = text_before.lines().count();
        let changed = self.run_format(&config);
        let text_after = self.engine.current_text().to_string();
        let lines_after = text_after.lines().count();

        // Build a human-readable summary
        let summary = if changed {
            let mut parts = Vec::new();
            if sort {
                parts.push("sorted");
            }
            if dedup {
                parts.push("deduped");
            }
            if hoist {
                parts.push("hoisted styles");
            }
            let delta = lines_before as i64 - lines_after as i64;
            if delta > 0 {
                parts.push("trimmed");
            }
            parts.join(", ")
        } else {
            "already clean".to_string()
        };

        format!(
            r#"{{"changed":{},"lines_before":{},"lines_after":{},"summary":"{}"}}"#,
            changed, lines_before, lines_after, summary
        )
    }
}

impl FdCanvas {
    /// Internal: run format pipeline and update engine state.
    fn run_format(&mut self, config: &fd_core::FormatConfig) -> bool {
        let text_before = self.engine.current_text().to_string();
        match fd_core::format_document(&text_before, config) {
            Ok(formatted) if formatted != text_before => {
                self.suppress_sync = true;
                let _ = self.engine.set_text(&formatted);
                self.engine.resolve();
                self.suppress_sync = false;
                self.rebuild_spatial_index();
                true
            }
            _ => false,
        }
    }
}

// ─── Private helpers ─────────────────────────────────────────────────────

impl FdCanvas {
    pub(crate) fn hit_test(&self, x: f32, y: f32) -> Option<NodeId> {
        let node_hit = if let Some(ref index) = self.spatial_index {
            index.query_point(x, y)
        } else {
            fd_render::hit::hit_test(&self.engine.graph, self.engine.current_bounds(), x, y)
        };
        node_hit.or_else(|| {
            fd_render::hit::hit_test_edge(&self.engine.graph, self.engine.current_bounds(), x, y)
        })
    }

    pub(crate) fn rebuild_spatial_index(&mut self) {
        self.spatial_index = Some(SpatialIndex::build(
            &self.engine.graph,
            self.engine.current_bounds(),
        ));
    }

    fn compute_bounds_hash(&self) -> u64 {
        let mut hasher = DefaultHasher::new();
        let bounds = self.engine.current_bounds();
        let mut entries: Vec<_> = bounds.iter().collect();
        entries.sort_by_key(|(idx, _)| idx.index());
        for (idx, b) in entries {
            idx.index().hash(&mut hasher);
            b.x.to_bits().hash(&mut hasher);
            b.y.to_bits().hash(&mut hasher);
            b.width.to_bits().hash(&mut hasher);
            b.height.to_bits().hash(&mut hasher);
        }
        hasher.finish()
    }

    pub(crate) fn apply_mutations(&mut self, mutations: Vec<GraphMutation>) -> bool {
        if mutations.is_empty() {
            return false;
        }
        let all_drag_ops = mutations.iter().all(|m| {
            matches!(
                m,
                GraphMutation::MoveNode { .. }
                    | GraphMutation::ResizeNode { .. }
                    | GraphMutation::UpdateEdge { .. }
                    | GraphMutation::UpdatePath { .. }
            )
        });
        let co_selected: Vec<fd_core::id::NodeId> = mutations
            .iter()
            .filter_map(|m| match m {
                GraphMutation::MoveNode { id, .. } => Some(*id),
                _ => None,
            })
            .collect();
        for mutation in mutations {
            self.commands.execute_with_co_selected(
                &mut self.engine,
                mutation,
                "canvas edit",
                &co_selected,
            );
        }
        if !all_drag_ops {
            self.engine.resolve();
            self.rebuild_spatial_index();
        }
        true
    }

    /// Bundles the standard post-mutation lifecycle to ensure layout is
    /// resolved before spatial indices and UI receive the updated state.
    pub(crate) fn sync_mutation_cycle(&mut self) {
        self.engine.mark_dirty();
        self.engine.resolve();
        self.engine.flush_to_text();
        self.rebuild_spatial_index();
    }

    /// Immediately erase a single node from the scene graph.
    pub(crate) fn erase_node_immediately(&mut self, id: NodeId) {
        let Some(idx) = self.engine.graph.index_of(id) else {
            return;
        };
        let parent_idx = self.engine.graph.parent(idx);

        if let Some(p_idx) = parent_idx
            && p_idx != self.engine.graph.root
        {
            let is_container = matches!(
                self.engine.graph.graph[p_idx].kind,
                NodeKind::Group
                    | NodeKind::Frame { .. }
                    | NodeKind::Rect { .. }
                    | NodeKind::Ellipse { .. }
            );
            if is_container {
                let root = self.engine.graph.root;
                self.engine.graph.reparent_node(idx, root);
                expand_group_to_children(&self.engine.graph, p_idx, &mut self.engine.bounds, None);
            }
        }

        let mutation = GraphMutation::RemoveNode { id };
        self.commands
            .execute(&mut self.engine, mutation, "eraser delete");
        self.engine.resolve();
        self.eraser_tool.erased_ids.push(id);
        self.erase_pending_flush = true;

        if let Some(p_idx) = parent_idx {
            self.cascade_empty_groups(p_idx);
        }
    }

    fn cascade_empty_groups(&mut self, start_idx: fd_core::NodeIndex) {
        let mut cursor = start_idx;
        loop {
            if cursor == self.engine.graph.root {
                break;
            }
            if self.engine.graph.graph.node_weight(cursor).is_none() {
                break;
            }
            let is_container = matches!(
                self.engine.graph.graph[cursor].kind,
                NodeKind::Group | NodeKind::Frame { .. }
            );
            if !is_container {
                break;
            }
            if !self.engine.graph.children(cursor).is_empty() {
                break;
            }

            let id = self.engine.graph.graph[cursor].id;
            let next_parent = self.engine.graph.parent(cursor);
            let mutation = GraphMutation::RemoveNode { id };
            self.commands
                .execute(&mut self.engine, mutation, "eraser cascade");
            self.engine.resolve();
            self.eraser_tool.erased_ids.push(id);

            match next_parent {
                Some(p) => cursor = p,
                None => break,
            }
        }
    }

    /// Check if the pointer hits a resize handle for the currently selected node.
    pub(crate) fn hit_test_resize_handle(&self, x: f32, y: f32) -> Option<ResizeHandle> {
        let id = self.select_tool.first_selected()?;
        let radius = self.pointer_type.handle_hit_radius();

        // Check if it's an edge
        if let Some(edge) = self.engine.graph.edges.iter().find(|e| e.id == id) {
            let start = match &edge.from {
                fd_core::model::EdgeAnchor::Node(nid) => self
                    .engine
                    .graph
                    .index_of(*nid)
                    .and_then(|idx| self.engine.bounds.get(&idx))
                    .map(|b| (b.x + b.width / 2.0, b.y + b.height / 2.0)),
                fd_core::model::EdgeAnchor::Point(x, y) => Some((*x, *y)),
            };
            let end = match &edge.to {
                fd_core::model::EdgeAnchor::Node(nid) => self
                    .engine
                    .graph
                    .index_of(*nid)
                    .and_then(|idx| self.engine.bounds.get(&idx))
                    .map(|b| (b.x + b.width / 2.0, b.y + b.height / 2.0)),
                fd_core::model::EdgeAnchor::Point(x, y) => Some((*x, *y)),
            };
            if let Some((sx, sy)) = start {
                let dx = x - sx;
                let dy = y - sy;
                if dx * dx + dy * dy <= radius * radius {
                    return Some(ResizeHandle::EdgeStart);
                }
            }
            if let Some((ex, ey)) = end {
                let dx = x - ex;
                let dy = y - ey;
                if dx * dx + dy * dy <= radius * radius {
                    return Some(ResizeHandle::EdgeEnd);
                }
            }
            return None;
        }

        let idx = self.engine.graph.index_of(id)?;

        if matches!(self.engine.graph.graph[idx].kind, NodeKind::Group) {
            return None;
        }

        let b = self.engine.current_bounds().get(&idx)?;
        let is_text = matches!(self.engine.graph.graph[idx].kind, NodeKind::Text { .. });

        let bx = b.x;
        let by = b.y;
        let bw = b.width;
        let bh = b.height;

        if is_text {
            let handles = [
                (bx, by + bh / 2.0, ResizeHandle::MiddleLeft),
                (bx + bw, by + bh / 2.0, ResizeHandle::MiddleRight),
            ];
            for (hx, hy, handle) in handles {
                let dx = x - hx;
                let dy = y - hy;
                if dx * dx + dy * dy <= radius * radius {
                    return Some(handle);
                }
            }
        } else {
            // Corners always present; midpoints skipped for touch (too close for fingers)
            let mut handles: Vec<(f32, f32, ResizeHandle)> = vec![
                (bx, by, ResizeHandle::TopLeft),
                (bx + bw, by, ResizeHandle::TopRight),
                (bx, by + bh, ResizeHandle::BottomLeft),
                (bx + bw, by + bh, ResizeHandle::BottomRight),
            ];
            if !self.pointer_type.corners_only() {
                handles.extend([
                    (bx + bw / 2.0, by, ResizeHandle::TopCenter),
                    (bx, by + bh / 2.0, ResizeHandle::MiddleLeft),
                    (bx + bw, by + bh / 2.0, ResizeHandle::MiddleRight),
                    (bx + bw / 2.0, by + bh, ResizeHandle::BottomCenter),
                ]);
            }
            for (hx, hy, handle) in handles {
                let dx = x - hx;
                let dy = y - hy;
                if dx * dx + dy * dy <= radius * radius {
                    return Some(handle);
                }
            }
        }
        None
    }

    /// Compute smart alignment guides during drag/resize.
    pub(crate) fn compute_smart_guides(&self) -> Vec<(f64, f64, f64, f64)> {
        let is_dragging = self.select_tool.resize_handle.is_some()
            || (self.active_tool == ToolKind::Select && self.pressed_id.is_some());

        if !is_dragging {
            return vec![];
        }

        let selected_id = match self.select_tool.first_selected() {
            Some(id) => id,
            None => return vec![],
        };
        let selected_idx = match self.engine.graph.index_of(selected_id) {
            Some(idx) => idx,
            None => return vec![],
        };
        let sb = match self.engine.current_bounds().get(&selected_idx) {
            Some(b) => b,
            None => return vec![],
        };

        let snap_threshold = 5.0_f32;
        let mut guides = Vec::new();

        let s_left = sb.x;
        let s_cx = sb.x + sb.width / 2.0;
        let s_right = sb.x + sb.width;
        let s_top = sb.y;
        let s_cy = sb.y + sb.height / 2.0;
        let s_bottom = sb.y + sb.height;

        let w = self.width;
        let h = self.height;

        for (&idx, b) in self.engine.current_bounds() {
            if idx == selected_idx || idx == self.engine.graph.root {
                continue;
            }

            let o_left = b.x;
            let o_cx = b.x + b.width / 2.0;
            let o_right = b.x + b.width;
            let o_top = b.y;
            let o_cy = b.y + b.height / 2.0;
            let o_bottom = b.y + b.height;

            let x_refs = [(s_left, o_left), (s_cx, o_cx), (s_right, o_right)];
            for (sv, ov) in x_refs {
                if (sv - ov).abs() < snap_threshold {
                    guides.push((ov as f64, 0.0, ov as f64, h));
                }
            }

            let y_refs = [(s_top, o_top), (s_cy, o_cy), (s_bottom, o_bottom)];
            for (sv, ov) in y_refs {
                if (sv - ov).abs() < snap_threshold {
                    guides.push((0.0, ov as f64, w, ov as f64));
                }
            }
        }

        guides.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        });
        guides.dedup_by(|a, b| (a.0 - b.0).abs() < 0.5 && (a.1 - b.1).abs() < 0.5);

        if guides.len() > 4 {
            guides.truncate(4);
        }

        guides
    }
}

// ─── Panic hook for WASM debugging ───────────────────────────────────────

fn console_error_panic_hook_setup() {
    #[cfg(target_arch = "wasm32")]
    {
        use std::sync::Once;
        static SET_HOOK: Once = Once::new();
        SET_HOOK.call_once(|| {
            std::panic::set_hook(Box::new(|info| {
                let msg = format!("FD WASM panic: {info}");
                web_sys::console::error_1(&msg.into());
            }));
        });
    }
}
