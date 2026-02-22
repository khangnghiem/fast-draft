//! WASM bridge for FD — exposes the Rust document engine to JavaScript.
//!
//! Compiled via `wasm-pack build --target web` and loaded in VS Code webview.

mod render2d;

use fd_core::id::NodeId;
use fd_core::layout::Viewport;
use fd_core::model::{Annotation, Color, Constraint, NodeKind, Paint, SceneNode};
use fd_editor::commands::CommandStack;
use fd_editor::input::{InputEvent, Modifiers};
use fd_editor::shortcuts::{ShortcutAction, ShortcutMap};
use fd_editor::sync::{GraphMutation, SyncEngine};
use fd_editor::tools::{EllipseTool, PenTool, RectTool, SelectTool, TextTool, Tool, ToolKind};
use fd_render::hit::hit_test_rect;
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
    /// Previous tool — used for Apple Pencil Pro squeeze toggle.
    prev_tool: ToolKind,
    select_tool: SelectTool,
    rect_tool: RectTool,
    ellipse_tool: EllipseTool,
    pen_tool: PenTool,
    text_tool: TextTool,
    width: f64,
    height: f64,
    /// Suppress text-changed messages during programmatic updates.
    suppress_sync: bool,
    /// Dark mode flag — `false` = light (default), `true` = dark.
    dark_mode: bool,
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
            prev_tool: ToolKind::Select,
            select_tool: SelectTool::new(),
            rect_tool: RectTool::new(),
            ellipse_tool: EllipseTool::new(),
            pen_tool: PenTool::new(),
            text_tool: TextTool::new(),
            width,
            height,
            suppress_sync: false,
            dark_mode: false,
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
    pub fn render(&self, ctx: &CanvasRenderingContext2d, time_ms: f64) {
        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();
        let theme = if self.dark_mode {
            render2d::CanvasTheme::dark()
        } else {
            render2d::CanvasTheme::light()
        };
        render2d::render_scene(
            ctx,
            &self.engine.graph,
            self.engine.current_bounds(),
            self.width,
            self.height,
            &selected_ids,
            &theme,
            self.select_tool.marquee_rect,
            time_ms,
        );
    }

    /// Set the canvas theme.
    pub fn set_theme(&mut self, is_dark: bool) {
        self.dark_mode = is_dark;
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
    #[allow(clippy::too_many_arguments)]
    pub fn handle_pointer_down(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        shift: bool,
        ctrl: bool,
        alt: bool,
        meta: bool,
    ) -> bool {
        let mods = Modifiers {
            shift,
            ctrl,
            alt,
            meta,
        };
        let event = InputEvent::from_pointer_down(x, y, pressure, mods);
        let hit = self.hit_test(x, y);
        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
        };
        let changed = self.apply_mutations(mutations);
        // Marquee start also counts as a visual change (need re-render)
        changed || self.select_tool.marquee_start.is_some()
    }

    /// Handle pointer move event. Returns true if the graph changed.
    #[allow(clippy::too_many_arguments)]
    pub fn handle_pointer_move(
        &mut self,
        x: f32,
        y: f32,
        pressure: f32,
        shift: bool,
        ctrl: bool,
        alt: bool,
        meta: bool,
    ) -> bool {
        let mods = Modifiers {
            shift,
            ctrl,
            alt,
            meta,
        };
        let event = InputEvent::from_pointer_move(x, y, pressure, mods);
        let hit = self.hit_test(x, y);
        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
        };
        let changed = self.apply_mutations(mutations);
        // Marquee drag also counts as visual change
        changed || self.select_tool.marquee_rect.is_some()
    }

    /// Handle pointer up event. Returns true if the graph changed.
    pub fn handle_pointer_up(
        &mut self,
        x: f32,
        y: f32,
        shift: bool,
        ctrl: bool,
        alt: bool,
        meta: bool,
    ) -> bool {
        let mods = Modifiers {
            shift,
            ctrl,
            alt,
            meta,
        };

        // Finalize marquee selection before handling pointer-up
        let marquee_changed = if let Some((rx, ry, rw, rh)) = self.select_tool.marquee_rect {
            if rw > 2.0 || rh > 2.0 {
                let hits = hit_test_rect(
                    &self.engine.graph,
                    self.engine.current_bounds(),
                    rx,
                    ry,
                    rw,
                    rh,
                );
                if mods.shift {
                    // Shift: add to existing selection
                    for id in hits {
                        if !self.select_tool.selected.contains(&id) {
                            self.select_tool.selected.push(id);
                        }
                    }
                } else {
                    self.select_tool.selected = hits;
                }
            }
            self.select_tool.marquee_start = None;
            self.select_tool.marquee_rect = None;
            true
        } else {
            false
        };

        let event = InputEvent::from_pointer_up(x, y, mods);
        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, None),
            ToolKind::Rect => self.rect_tool.handle(&event, None),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, None),
            ToolKind::Pen => self.pen_tool.handle(&event, None),
            ToolKind::Text => self.text_tool.handle(&event, None),
        };
        let changed = self.apply_mutations(mutations);
        // Flush text after gesture ends
        if changed {
            self.engine.flush_to_text();
        }
        changed || marquee_changed
    }

    /// Switch the active tool, remembering the previous one.
    pub fn set_tool(&mut self, name: &str) {
        let new_tool = match name {
            "select" => ToolKind::Select,
            "rect" => ToolKind::Rect,
            "ellipse" => ToolKind::Ellipse,
            "pen" => ToolKind::Pen,
            "text" => ToolKind::Text,
            _ => ToolKind::Select,
        };
        if new_tool != self.active_tool {
            self.prev_tool = self.active_tool;
            self.active_tool = new_tool;
        }
    }

    /// Get the current tool name.
    pub fn get_tool_name(&self) -> String {
        tool_kind_to_name(self.active_tool).to_string()
    }

    /// Get the currently selected node ID, or empty string if none.
    /// Returns the first selected node for backward compatibility.
    pub fn get_selected_id(&self) -> String {
        self.select_tool
            .first_selected()
            .map(|id| id.as_str().to_string())
            .unwrap_or_default()
    }

    /// Get all selected node IDs as a JSON array.
    pub fn get_selected_ids(&self) -> String {
        let ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();
        serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
    }

    /// Select a node by its ID (e.g. from text editor cursor).
    /// Returns `true` if the node was found and selected.
    pub fn select_by_id(&mut self, node_id: &str) -> bool {
        if node_id.is_empty() {
            self.select_tool.selected.clear();
            return true;
        }
        let id = NodeId::intern(node_id);
        if self.engine.graph.get_by_id(id).is_some() {
            self.select_tool.selected = vec![id];
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

    // ─── Keyboard Shortcut API ───────────────────────────────────────────

    /// Handle a keyboard event. Returns a JSON string:
    /// `{"changed":bool, "action":"<action_name>", "tool":"<tool_name>"}`
    pub fn handle_key(
        &mut self,
        key: &str,
        ctrl: bool,
        shift: bool,
        alt: bool,
        meta: bool,
    ) -> String {
        let action = match ShortcutMap::resolve(key, ctrl, shift, alt, meta) {
            Some(a) => a,
            None => return r#"{"changed":false,"action":"none","tool":""}"#.to_string(),
        };

        let (changed, tool_switched) = self.dispatch_action(action);

        let action_name = action_to_name(action);
        let tool_name = tool_kind_to_name(self.active_tool);
        let sync = if changed { "true" } else { "false" };
        let ts = if tool_switched { "true" } else { "false" };

        format!(
            r#"{{"changed":{sync},"action":"{action_name}","tool":"{tool_name}","toolSwitched":{ts}}}"#
        )
    }

    /// Handle Apple Pencil Pro squeeze: toggles between current and previous tool.
    ///
    /// Modifier combos:
    /// - **No modifier**: toggle current ↔ previous tool (original behavior)
    /// - **Shift**: switch to Pen tool
    /// - **Ctrl / Meta**: switch to Select tool
    /// - **Alt**: switch to Rect tool
    /// - **Ctrl+Shift**: switch to Ellipse tool
    ///
    /// Returns the name of the new active tool.
    pub fn handle_stylus_squeeze(
        &mut self,
        shift: bool,
        ctrl: bool,
        alt: bool,
        meta: bool,
    ) -> String {
        let target = if ctrl && shift {
            Some(ToolKind::Ellipse)
        } else if shift {
            Some(ToolKind::Pen)
        } else if ctrl || meta {
            Some(ToolKind::Select)
        } else if alt {
            Some(ToolKind::Rect)
        } else {
            None // plain squeeze: toggle
        };

        if let Some(tool) = target {
            if tool != self.active_tool {
                self.prev_tool = self.active_tool;
                self.active_tool = tool;
            }
        } else {
            std::mem::swap(&mut self.prev_tool, &mut self.active_tool);
        }

        tool_kind_to_name(self.active_tool).to_string()
    }

    /// Delete the currently selected node(s). Returns true if any was deleted.
    pub fn delete_selected(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }
        let ids: Vec<NodeId> = self.select_tool.selected.clone();
        let mutations: Vec<GraphMutation> = ids
            .iter()
            .map(|id| GraphMutation::RemoveNode { id: *id })
            .collect();
        let changed = self.apply_mutations(mutations);
        if changed {
            self.select_tool.selected.clear();
            self.engine.flush_to_text();
        }
        changed
    }

    /// Duplicate the currently selected node(s). Returns true if duplicated.
    pub fn duplicate_selected(&mut self) -> bool {
        let first_id = match self.select_tool.first_selected() {
            Some(id) => id,
            None => return false,
        };
        let original = match self.engine.graph.get_by_id(first_id) {
            Some(node) => node.clone(),
            None => return false,
        };
        let mut cloned = original;
        let new_id = NodeId::anonymous();
        cloned.id = new_id;
        // Offset the duplicate 20px right and down from the original
        cloned.constraints.push(fd_core::model::Constraint::Offset {
            from: first_id,
            dx: 20.0,
            dy: 20.0,
        });

        let mutation = GraphMutation::AddNode {
            parent_id: NodeId::intern("root"),
            node: Box::new(cloned),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.select_tool.selected = vec![new_id];
            self.engine.flush_to_text();
        }
        changed
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

    // ─── Properties Panel API ────────────────────────────────────────────

    /// Get properties of the currently selected node as JSON.
    /// Returns `{}` if no node is selected.
    pub fn get_selected_node_props(&self) -> String {
        let id = match self.select_tool.first_selected() {
            Some(id) => id,
            None => return "{}".to_string(),
        };
        let node = match self.engine.graph.get_by_id(id) {
            Some(n) => n,
            None => return "{}".to_string(),
        };
        let style = self.engine.graph.resolve_style(node);
        let mut props = serde_json::Map::new();

        props.insert(
            "id".into(),
            serde_json::Value::String(id.as_str().to_string()),
        );

        // Kind + dimensions
        match &node.kind {
            NodeKind::Rect { width, height } => {
                props.insert("kind".into(), "rect".into());
                props.insert("width".into(), serde_json::json!(width));
                props.insert("height".into(), serde_json::json!(height));
            }
            NodeKind::Ellipse { rx, ry } => {
                props.insert("kind".into(), "ellipse".into());
                props.insert("width".into(), serde_json::json!(rx * 2.0));
                props.insert("height".into(), serde_json::json!(ry * 2.0));
            }
            NodeKind::Text { content } => {
                props.insert("kind".into(), "text".into());
                props.insert("content".into(), serde_json::Value::String(content.clone()));
            }
            NodeKind::Group { .. } => {
                props.insert("kind".into(), "group".into());
            }
            NodeKind::Path { .. } => {
                props.insert("kind".into(), "path".into());
            }
            NodeKind::Generic => {
                props.insert("kind".into(), "generic".into());
            }
            NodeKind::Root => {
                props.insert("kind".into(), "root".into());
            }
        }

        // Label (for rect/ellipse — optional text centered inside shape)
        if let Some(ref label) = style.label {
            props.insert("label".into(), serde_json::Value::String(label.clone()));
        }

        // Fill
        if let Some(Paint::Solid(c)) = &style.fill {
            props.insert("fill".into(), serde_json::Value::String(c.to_hex()));
        }

        // Stroke
        if let Some(ref stroke) = style.stroke {
            if let Paint::Solid(c) = &stroke.paint {
                props.insert("strokeColor".into(), serde_json::Value::String(c.to_hex()));
            }
            props.insert("strokeWidth".into(), serde_json::json!(stroke.width));
        }

        // Corner radius
        if let Some(r) = style.corner_radius {
            props.insert("cornerRadius".into(), serde_json::json!(r));
        }

        // Opacity
        if let Some(o) = style.opacity {
            props.insert("opacity".into(), serde_json::json!(o));
        }

        // Position from bounds
        if let Some(idx) = self.engine.graph.index_of(id)
            && let Some(bounds) = self.engine.current_bounds().get(&idx)
        {
            props.insert("x".into(), serde_json::json!(bounds.x));
            props.insert("y".into(), serde_json::json!(bounds.y));
        }

        // Font
        if let Some(ref font) = style.font {
            props.insert(
                "fontFamily".into(),
                serde_json::Value::String(font.family.clone()),
            );
            props.insert("fontSize".into(), serde_json::json!(font.size));
            props.insert("fontWeight".into(), serde_json::json!(font.weight));
        }

        serde_json::Value::Object(props).to_string()
    }

    /// Set a property on the currently selected node.
    /// Returns `true` if the property was set.
    pub fn set_node_prop(&mut self, key: &str, value: &str) -> bool {
        let id = match self.select_tool.first_selected() {
            Some(id) => id,
            None => return false,
        };

        let mutation = match key {
            "fill" => {
                if let Some(color) = Color::from_hex(value) {
                    let mut style = self
                        .engine
                        .graph
                        .get_by_id(id)
                        .map(|n| self.engine.graph.resolve_style(n))
                        .unwrap_or_default();
                    style.fill = Some(Paint::Solid(color));
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "strokeColor" => {
                if let Some(color) = Color::from_hex(value) {
                    let mut style = self
                        .engine
                        .graph
                        .get_by_id(id)
                        .map(|n| self.engine.graph.resolve_style(n))
                        .unwrap_or_default();
                    let mut stroke = style.stroke.unwrap_or_default();
                    stroke.paint = Paint::Solid(color);
                    style.stroke = Some(stroke);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "strokeWidth" => {
                if let Ok(w) = value.parse::<f32>() {
                    let mut style = self
                        .engine
                        .graph
                        .get_by_id(id)
                        .map(|n| self.engine.graph.resolve_style(n))
                        .unwrap_or_default();
                    let mut stroke = style.stroke.unwrap_or_default();
                    stroke.width = w;
                    style.stroke = Some(stroke);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "cornerRadius" => {
                if let Ok(r) = value.parse::<f32>() {
                    let mut style = self
                        .engine
                        .graph
                        .get_by_id(id)
                        .map(|n| self.engine.graph.resolve_style(n))
                        .unwrap_or_default();
                    style.corner_radius = Some(r);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "opacity" => {
                if let Ok(o) = value.parse::<f32>() {
                    let mut style = self
                        .engine
                        .graph
                        .get_by_id(id)
                        .map(|n| self.engine.graph.resolve_style(n))
                        .unwrap_or_default();
                    style.opacity = Some(o);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "width" | "height" => {
                let v = match value.parse::<f32>() {
                    Ok(v) => v,
                    Err(_) => return false,
                };
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let (cur_w, cur_h) = match &node.kind {
                        NodeKind::Rect { width, height } => (*width, *height),
                        NodeKind::Ellipse { rx, ry } => (*rx * 2.0, *ry * 2.0),
                        _ => return false,
                    };
                    let (new_w, new_h) = if key == "width" {
                        (v, cur_h)
                    } else {
                        (cur_w, v)
                    };
                    GraphMutation::ResizeNode {
                        id,
                        width: new_w,
                        height: new_h,
                    }
                } else {
                    return false;
                }
            }
            "content" => GraphMutation::SetText {
                id,
                content: value.to_string(),
            },
            "label" => {
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let mut style = self.engine.graph.resolve_style(node);
                    style.label = if value.is_empty() {
                        None
                    } else {
                        Some(value.to_string())
                    };
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            _ => return false,
        };

        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Get the scene-space bounds of a node by its ID.
    /// Returns `{}` if the node is not found.
    pub fn get_node_bounds(&self, node_id: &str) -> String {
        let id = fd_core::id::NodeId::intern(node_id);
        if let Some(idx) = self.engine.graph.index_of(id)
            && let Some(bounds) = self.engine.current_bounds().get(&idx)
        {
            return format!(
                r#"{{"x":{},"y":{},"width":{},"height":{}}}"#,
                bounds.x, bounds.y, bounds.width, bounds.height
            );
        }
        "{}".to_string()
    }

    /// Create a node at a specific position (for drag-and-drop).
    /// `kind` is \"rect\", \"ellipse\", or \"text\".
    /// Returns `true` if the node was created.
    pub fn create_node_at(&mut self, kind: &str, x: f32, y: f32) -> bool {
        let id = NodeId::anonymous();
        let node_kind = match kind {
            "rect" => NodeKind::Rect {
                width: 100.0,
                height: 80.0,
            },
            "ellipse" => NodeKind::Ellipse { rx: 50.0, ry: 40.0 },
            "text" => NodeKind::Text {
                content: "Text".to_string(),
            },
            _ => return false,
        };
        let mut node = SceneNode::new(id, node_kind);
        node.constraints.push(Constraint::Absolute { x, y });

        // Set a default fill for shapes
        if kind != "text" {
            node.style.fill = Some(Paint::Solid(Color::rgba(0.8, 0.8, 0.85, 1.0)));
        }

        let mutation = GraphMutation::AddNode {
            parent_id: NodeId::intern("root"),
            node: Box::new(node),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.select_tool.selected = vec![id];
            self.engine.flush_to_text();
        }
        changed
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

    /// Dispatch a shortcut action. Returns (graph_changed, tool_switched).
    fn dispatch_action(&mut self, action: ShortcutAction) -> (bool, bool) {
        match action {
            // Tool switching
            ShortcutAction::ToolSelect => {
                self.set_tool("select");
                (false, true)
            }
            ShortcutAction::ToolRect => {
                self.set_tool("rect");
                (false, true)
            }
            ShortcutAction::ToolEllipse => {
                self.set_tool("ellipse");
                (false, true)
            }
            ShortcutAction::ToolPen => {
                self.set_tool("pen");
                (false, true)
            }
            ShortcutAction::ToolText => {
                self.set_tool("text");
                (false, true)
            }
            // Screenbrush: Tab toggles between two most-used tools
            ShortcutAction::ToggleLastTool => {
                std::mem::swap(&mut self.prev_tool, &mut self.active_tool);
                (false, true)
            }

            // Edit
            ShortcutAction::Undo => (self.undo(), false),
            ShortcutAction::Redo => (self.redo(), false),
            ShortcutAction::Delete => (self.delete_selected(), false),
            ShortcutAction::Duplicate => (self.duplicate_selected(), false),
            // Screenbrush: ⌘Delete = clear selected
            ShortcutAction::ClearAll => (self.delete_selected(), false),
            ShortcutAction::Deselect => {
                self.select_tool.selected.clear();
                (false, false)
            }

            // Currently handled by JS (clipboard, zoom, z-order, help)
            // These return (false, false) so JS can handle them
            ShortcutAction::SelectAll
            | ShortcutAction::Copy
            | ShortcutAction::Cut
            | ShortcutAction::Paste
            | ShortcutAction::ZoomIn
            | ShortcutAction::ZoomOut
            | ShortcutAction::ZoomToFit
            | ShortcutAction::PanStart
            | ShortcutAction::PanEnd
            | ShortcutAction::SendBackward
            | ShortcutAction::BringForward
            | ShortcutAction::SendToBack
            | ShortcutAction::BringToFront
            | ShortcutAction::ShowHelp => (false, false),
        }
    }
}

fn tool_kind_to_name(kind: ToolKind) -> &'static str {
    match kind {
        ToolKind::Select => "select",
        ToolKind::Rect => "rect",
        ToolKind::Ellipse => "ellipse",
        ToolKind::Pen => "pen",
        ToolKind::Text => "text",
    }
}

fn action_to_name(action: ShortcutAction) -> &'static str {
    match action {
        ShortcutAction::ToolSelect => "toolSelect",
        ShortcutAction::ToolRect => "toolRect",
        ShortcutAction::ToolEllipse => "toolEllipse",
        ShortcutAction::ToolPen => "toolPen",
        ShortcutAction::ToolText => "toolText",
        ShortcutAction::ToggleLastTool => "toggleLastTool",
        ShortcutAction::Undo => "undo",
        ShortcutAction::Redo => "redo",
        ShortcutAction::Delete => "delete",
        ShortcutAction::SelectAll => "selectAll",
        ShortcutAction::Duplicate => "duplicate",
        ShortcutAction::Copy => "copy",
        ShortcutAction::Cut => "cut",
        ShortcutAction::Paste => "paste",
        ShortcutAction::ClearAll => "clearAll",
        ShortcutAction::ZoomIn => "zoomIn",
        ShortcutAction::ZoomOut => "zoomOut",
        ShortcutAction::ZoomToFit => "zoomToFit",
        ShortcutAction::PanStart => "panStart",
        ShortcutAction::PanEnd => "panEnd",
        ShortcutAction::SendBackward => "sendBackward",
        ShortcutAction::BringForward => "bringForward",
        ShortcutAction::SendToBack => "sendToBack",
        ShortcutAction::BringToFront => "bringToFront",
        ShortcutAction::Deselect => "deselect",
        ShortcutAction::ShowHelp => "showHelp",
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
        fd_core::NodeKind::Generic => "generic",
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
