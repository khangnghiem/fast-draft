//! WASM bridge for FD — exposes the Rust document engine to JavaScript.
//!
//! Compiled via `wasm-pack build --target web` and loaded in VS Code webview.

mod render2d;

use fd_core::id::NodeId;
use fd_core::layout::Viewport;
use fd_core::model::Annotation;
use fd_editor::commands::CommandStack;
use fd_editor::input::InputEvent;
use fd_editor::sync::{GraphMutation, SyncEngine};
use fd_editor::tools::{RectTool, SelectTool, Tool, ToolKind};
use wasm_bindgen::prelude::*;
use web_sys::CanvasRenderingContext2d;

/// The main WASM-facing canvas controller.
///
/// Holds the sync engine, command stack, and active tool. All interaction
/// from the webview JS goes through this struct.
#[wasm_bindgen]
pub struct FdCanvas {
    engine: SyncEngine,
    commands: CommandStack,
    active_tool: ToolKind,
    select_tool: SelectTool,
    rect_tool: RectTool,
    width: f64,
    height: f64,
    /// Suppress text-changed messages during programmatic updates.
    suppress_sync: bool,
}

#[wasm_bindgen]
impl FdCanvas {
    /// Create a new canvas controller with the given dimensions.
    #[wasm_bindgen(constructor)]
    pub fn new(width: f64, height: f64) -> Self {
        // Set up panic hook for better error messages in console
        console_error_panic_hook_setup();

        let viewport = Viewport {
            width: width as f32,
            height: height as f32,
        };
        let engine = SyncEngine::new(viewport);

        Self {
            engine,
            commands: CommandStack::new(200),
            active_tool: ToolKind::Select,
            select_tool: SelectTool::new(),
            rect_tool: RectTool::new(),
            width,
            height,
            suppress_sync: false,
        }
    }

    /// Set the FD source text, re-parsing into the scene graph.
    /// Returns `true` on success, `false` on parse error.
    pub fn set_text(&mut self, text: &str) -> bool {
        self.suppress_sync = true;
        let result = self.engine.set_text(text);
        self.engine.resolve();
        self.suppress_sync = false;
        result.is_ok()
    }

    /// Get the current FD source text (synced from graph).
    pub fn get_text(&mut self) -> String {
        self.engine.current_text().to_string()
    }

    /// Render the scene to a Canvas2D context.
    pub fn render(&self, ctx: &CanvasRenderingContext2d) {
        let selected_id = self.select_tool.selected.map(|id| id.as_str().to_string());
        render2d::render_scene(
            ctx,
            &self.engine.graph,
            self.engine.current_bounds(),
            self.width,
            self.height,
            selected_id.as_deref(),
        );
    }

    /// Resize the canvas.
    pub fn resize(&mut self, width: f64, height: f64) {
        self.width = width;
        self.height = height;
        self.engine.viewport = Viewport {
            width: width as f32,
            height: height as f32,
        };
        self.engine.resolve();
    }

    /// Handle pointer down event. Returns true if the graph changed.
    pub fn handle_pointer_down(&mut self, x: f32, y: f32, pressure: f32) -> bool {
        let event = InputEvent::from_pointer_down(x, y, pressure);
        let hit = self.hit_test(x, y);
        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect => self.rect_tool.handle(&event, hit),
            _ => vec![],
        };
        self.apply_mutations(mutations)
    }

    /// Handle pointer move event. Returns true if the graph changed.
    pub fn handle_pointer_move(&mut self, x: f32, y: f32, pressure: f32) -> bool {
        let event = InputEvent::from_pointer_move(x, y, pressure);
        let hit = self.hit_test(x, y);
        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect => self.rect_tool.handle(&event, hit),
            _ => vec![],
        };
        self.apply_mutations(mutations)
    }

    /// Handle pointer up event. Returns true if the graph changed.
    pub fn handle_pointer_up(&mut self, x: f32, y: f32) -> bool {
        let event = InputEvent::from_pointer_up(x, y);
        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, None),
            ToolKind::Rect => self.rect_tool.handle(&event, None),
            _ => vec![],
        };
        let changed = self.apply_mutations(mutations);
        // Flush text after gesture ends
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Switch the active tool.
    pub fn set_tool(&mut self, name: &str) {
        self.active_tool = match name {
            "select" => ToolKind::Select,
            "rect" => ToolKind::Rect,
            "ellipse" => ToolKind::Ellipse,
            "pen" => ToolKind::Pen,
            "text" => ToolKind::Text,
            _ => ToolKind::Select,
        };
    }

    /// Get the currently selected node ID, or empty string if none.
    pub fn get_selected_id(&self) -> String {
        self.select_tool
            .selected
            .map(|id| id.as_str().to_string())
            .unwrap_or_default()
    }

    /// Select a node by its ID (e.g. from text editor cursor).
    /// Returns `true` if the node was found and selected.
    pub fn select_by_id(&mut self, node_id: &str) -> bool {
        if node_id.is_empty() {
            self.select_tool.selected = None;
            return true;
        }
        let id = NodeId::intern(node_id);
        if self.engine.graph.get_by_id(id).is_some() {
            self.select_tool.selected = Some(id);
            true
        } else {
            false
        }
    }

    /// Undo the last action.
    pub fn undo(&mut self) -> bool {
        let result = self.commands.undo(&mut self.engine);
        if result.is_some() {
            self.engine.resolve();
            self.engine.flush_to_text();
        }
        result.is_some()
    }

    /// Redo the last undone action.
    pub fn redo(&mut self) -> bool {
        let result = self.commands.redo(&mut self.engine);
        if result.is_some() {
            self.engine.resolve();
            self.engine.flush_to_text();
        }
        result.is_some()
    }

    /// Check if text changed due to canvas interaction (for sync back to editor).
    pub fn has_pending_text_change(&self) -> bool {
        !self.suppress_sync
    }

    // ─── Annotation APIs ─────────────────────────────────────────────────

    /// Get annotations for a node as JSON array.
    /// Returns `[]` if node not found or has no annotations.
    pub fn get_annotations_json(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        let annotations = self
            .engine
            .graph
            .get_by_id(id)
            .map(|n| &n.annotations)
            .cloned()
            .unwrap_or_default();
        serde_json::to_string(&annotations).unwrap_or_else(|_| "[]".to_string())
    }

    /// Set annotations for a node from a JSON array.
    /// Returns `true` on success.
    pub fn set_annotations_json(&mut self, node_id: &str, json: &str) -> bool {
        let annotations: Vec<Annotation> = match serde_json::from_str(json) {
            Ok(a) => a,
            Err(_) => return false,
        };
        let id = NodeId::intern(node_id);
        let mutations = vec![GraphMutation::SetAnnotations { id, annotations }];
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Hit-test for annotation badge dots.
    /// Returns the node ID if the point hits a badge, or empty string.
    pub fn hit_test_badge(&self, x: f32, y: f32) -> String {
        for idx in self.engine.graph.graph.node_indices() {
            let node = &self.engine.graph.graph[idx];
            if node.annotations.is_empty() {
                continue;
            }
            if let Some(bounds) = self.engine.current_bounds().get(&idx) {
                // Badge is at top-right corner + 2px
                let cx = bounds.x + bounds.width + 2.0;
                let cy = bounds.y - 2.0;
                let radius = 7.0; // Slightly larger hit area than visual
                let dx = x - cx;
                let dy = y - cy;
                if dx * dx + dy * dy <= radius * radius {
                    return node.id.as_str().to_string();
                }
            }
        }
        String::new()
    }
}

// ─── Private helpers ─────────────────────────────────────────────────────

impl FdCanvas {
    fn hit_test(&self, x: f32, y: f32) -> Option<NodeId> {
        fd_render::hit::hit_test(&self.engine.graph, self.engine.current_bounds(), x, y)
    }

    fn apply_mutations(&mut self, mutations: Vec<GraphMutation>) -> bool {
        if mutations.is_empty() {
            return false;
        }
        for mutation in mutations {
            self.commands
                .execute(&mut self.engine, mutation, "canvas edit");
        }
        self.engine.resolve();
        true
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

// ─── Standalone validation functions (no canvas needed) ──────────────────

/// Validate FD source text. Returns JSON: `{"ok":true}` or `{"ok":false,"error":"..."}`.
#[wasm_bindgen]
pub fn validate(source: &str) -> String {
    match fd_core::parser::parse_document(source) {
        Ok(_) => r#"{"ok":true}"#.to_string(),
        Err(e) => {
            let escaped = e.replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"ok":false,"error":"{escaped}"}}"#)
        }
    }
}

/// Parse FD source and return the scene graph as JSON for the tree preview.
/// Returns JSON `{"ok":true,"nodes":[...]}` or `{"ok":false,"error":"..."}`.
#[wasm_bindgen]
pub fn parse_to_json(source: &str) -> String {
    match fd_core::parser::parse_document(source) {
        Ok(graph) => {
            let nodes = collect_node_tree(&graph, graph.root);
            match serde_json::to_string(&nodes) {
                Ok(json) => format!(r#"{{"ok":true,"nodes":{json}}}"#),
                Err(e) => format!(r#"{{"ok":false,"error":"Serialization error: {e}"}}"#),
            }
        }
        Err(e) => {
            let escaped = e.replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"ok":false,"error":"{escaped}"}}"#)
        }
    }
}

/// Recursively collect nodes into a serializable tree structure.
fn collect_node_tree(graph: &fd_core::SceneGraph, idx: fd_core::NodeIndex) -> serde_json::Value {
    let node = &graph.graph[idx];
    let kind_str = match &node.kind {
        fd_core::NodeKind::Root => "root",
        fd_core::NodeKind::Group { .. } => "group",
        fd_core::NodeKind::Rect { .. } => "rect",
        fd_core::NodeKind::Ellipse { .. } => "ellipse",
        fd_core::NodeKind::Path { .. } => "path",
        fd_core::NodeKind::Text { .. } => "text",
    };
    let children: Vec<serde_json::Value> = graph
        .children(idx)
        .into_iter()
        .map(|child_idx| collect_node_tree(graph, child_idx))
        .collect();

    let mut obj = serde_json::json!({
        "id": node.id.as_str(),
        "kind": kind_str,
    });
    if let fd_core::NodeKind::Text { content } = &node.kind {
        obj["text"] = serde_json::Value::String(content.clone());
    }
    if let fd_core::NodeKind::Rect { width, height } = &node.kind {
        obj["width"] = serde_json::json!(width);
        obj["height"] = serde_json::json!(height);
    }
    if !children.is_empty() {
        obj["children"] = serde_json::Value::Array(children);
    }
    if !node.annotations.is_empty() {
        obj["annotations"] =
            serde_json::to_value(&node.annotations).unwrap_or(serde_json::Value::Null);
    }
    obj
}
