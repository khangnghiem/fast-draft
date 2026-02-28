//! WASM bridge for FD — exposes the Rust document engine to JavaScript.
//!
//! Compiled via `wasm-pack build --target web` and loaded in VS Code webview.

mod render2d;
mod svg;

use fd_core::id::NodeId;
use fd_core::layout::Viewport;
use fd_core::model::{
    Annotation, ArrowKind, Color, Constraint, CurveKind, Edge, LayoutMode, NodeKind, Paint,
    SceneNode, Stroke, StrokeCap, StrokeJoin, TextAlign, TextVAlign,
};
use fd_editor::commands::CommandStack;
use fd_editor::input::{InputEvent, Modifiers};
use fd_editor::shortcuts::{ShortcutAction, ShortcutMap};
use fd_editor::sync::{GraphMutation, SyncEngine};
use fd_editor::tools::{
    ArrowTool, EllipseTool, PenTool, RectTool, ResizeHandle, SelectTool, TextTool, Tool, ToolKind,
};
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
    arrow_tool: ArrowTool,
    width: f64,
    height: f64,
    /// Suppress text-changed messages during programmatic updates.
    suppress_sync: bool,
    /// Dark mode flag — `false` = light (default), `true` = dark.
    dark_mode: bool,
    /// Sketchy hand-drawn rendering mode.
    sketchy_mode: bool,
    hovered_id: Option<fd_core::id::NodeId>,
    pressed_id: Option<fd_core::id::NodeId>,
    /// Deferred drill-down: when pointer-down on a child of a selected
    /// group, keep the group selected for drag; drill into child on
    /// pointer-up without drag.
    pending_drill_target: Option<fd_core::id::NodeId>,
    /// Pointer-down scene position — used to detect click vs drag.
    pointer_down_pos: Option<(f32, f32)>,
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
            arrow_tool: ArrowTool::new(),
            width,
            height,
            suppress_sync: false,
            dark_mode: false,
            sketchy_mode: false,
            hovered_id: None,
            pressed_id: None,
            pending_drill_target: None,
            pointer_down_pos: None,
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

        // Compute smart alignment guides when dragging/resizing
        let guides = self.compute_smart_guides();

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
            self.hovered_id.as_ref().map(|id| id.as_str()),
            self.pressed_id.as_ref().map(|id| id.as_str()),
            &guides,
            self.sketchy_mode,
        );
    }

    /// Set the canvas theme.
    pub fn set_theme(&mut self, is_dark: bool) {
        self.dark_mode = is_dark;
    }

    /// Enable or disable sketchy (hand-drawn) rendering mode.
    pub fn set_sketchy_mode(&mut self, enabled: bool) {
        self.sketchy_mode = enabled;
    }

    /// Check if sketchy rendering mode is enabled.
    pub fn get_sketchy_mode(&self) -> bool {
        self.sketchy_mode
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
        // Start batch so all drag mutations become one undo step
        self.commands.begin_batch(&mut self.engine);

        let mods = Modifiers {
            shift,
            ctrl,
            alt,
            meta,
        };
        let event = InputEvent::from_pointer_down(x, y, pressure, mods);
        let raw_hit = self.hit_test(x, y);

        // Track pointer-down position for click-vs-drag detection
        self.pointer_down_pos = Some((x, y));
        self.pending_drill_target = None;

        let hit = raw_hit.map(|id| {
            // If the raw hit is already selected, keep it
            if self.select_tool.selected.contains(&id) {
                return id;
            }
            let target = self
                .engine
                .graph
                .effective_target(id, &self.select_tool.selected);
            // If the target is a child of an already-selected group,
            // keep the group selected for dragging. Store the child
            // as a pending drill target for click-without-drag.
            for &sel_id in &self.select_tool.selected {
                if self.engine.graph.is_ancestor_of(sel_id, target) {
                    self.pending_drill_target = Some(target);
                    return sel_id;
                }
            }
            target
        });

        let prev_pressed = self.pressed_id;
        self.pressed_id = hit;
        let pressed_changed = prev_pressed != self.pressed_id;

        let prev_hovered = self.hovered_id;
        self.hovered_id = hit;
        let hovered_changed = prev_hovered != self.hovered_id;

        // Check for resize handle hit on currently selected node
        if self.active_tool == ToolKind::Select
            && let Some(handle) = self.hit_test_resize_handle(x, y)
            && let Some(id) = self.select_tool.first_selected()
            && let Some(idx) = self.engine.graph.index_of(id)
            && let Some(b) = self.engine.current_bounds().get(&idx)
        {
            self.select_tool
                .start_resize(handle, (b.x, b.y, b.width, b.height));
            // Forward the event so PointerMove/Up flow works
            let mutations = self.select_tool.handle(&event, hit);
            self.apply_mutations(mutations);
            return true;
        }

        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect | ToolKind::Frame => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
            ToolKind::Arrow => self.arrow_tool.handle(&event, hit),
        };
        let changed = self.apply_mutations(mutations);
        // Marquee start also counts as a visual change (need re-render)
        changed || self.select_tool.marquee_start.is_some() || pressed_changed || hovered_changed
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
        let raw_hit = self.hit_test(x, y);
        let hit = raw_hit.map(|id| {
            self.engine
                .graph
                .effective_target(id, &self.select_tool.selected)
        });

        let prev_hovered = self.hovered_id;
        self.hovered_id = hit;
        let hovered_changed = prev_hovered != self.hovered_id;

        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect | ToolKind::Frame => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
            ToolKind::Arrow => self.arrow_tool.handle(&event, hit),
        };
        let changed = self.apply_mutations(mutations);
        // Marquee drag also counts as visual change
        changed || self.select_tool.marquee_rect.is_some() || hovered_changed
    }

    /// Handle pointer up event. Returns a JSON string:
    /// `{"changed":bool, "toolSwitched":bool, "tool":"<name>"}`
    ///
    /// After a drawing gesture (Rect/Ellipse/Pen/Text) completes,
    /// the tool automatically switches back to Select.
    pub fn handle_pointer_up(
        &mut self,
        x: f32,
        y: f32,
        shift: bool,
        ctrl: bool,
        alt: bool,
        meta: bool,
    ) -> String {
        let mods = Modifiers {
            shift,
            ctrl,
            alt,
            meta,
        };

        // Snapshot previous selection for fresh-select detection
        let prev_selected = self.select_tool.selected.clone();

        // End batch — squash all drag mutations into one undo step
        self.commands.end_batch(&mut self.engine);

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
                    for raw_id in hits {
                        let id = self
                            .engine
                            .graph
                            .effective_target(raw_id, &self.select_tool.selected);
                        if !self.select_tool.selected.contains(&id) {
                            self.select_tool.selected.push(id);
                        }
                    }
                } else {
                    let mut new_selection = Vec::new();
                    for raw_id in hits {
                        let id = self.engine.graph.effective_target(raw_id, &new_selection);
                        if !new_selection.contains(&id) {
                            new_selection.push(id);
                        }
                    }
                    self.select_tool.selected = new_selection;
                }
            }
            self.select_tool.marquee_start = None;
            self.select_tool.marquee_rect = None;
            true
        } else {
            false
        };

        let event = InputEvent::from_pointer_up(x, y, mods);

        let prev_pressed = self.pressed_id;
        self.pressed_id = None;
        let pressed_changed = prev_pressed != self.pressed_id;

        let raw_hit = self.hit_test(x, y);
        let hit = raw_hit.map(|id| {
            self.engine
                .graph
                .effective_target(id, &self.select_tool.selected)
        });

        let prev_hovered = self.hovered_id;
        self.hovered_id = hit;
        let hovered_changed = prev_hovered != self.hovered_id;

        let mutations = match self.active_tool {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect | ToolKind::Frame => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
            ToolKind::Arrow => self.arrow_tool.handle(&event, hit),
        };
        let changed = self.apply_mutations(mutations);
        // Flush text after gesture ends
        if changed {
            self.engine.flush_to_text();
        }

        // Deferred drill-down: if pointer-up without drag, drill into child
        let drill_changed = if let Some(drill_id) = self.pending_drill_target.take() {
            let was_click = self
                .pointer_down_pos
                .map(|(dx, dy)| (x - dx).abs() < 3.0 && (y - dy).abs() < 3.0)
                .unwrap_or(false);
            if was_click {
                self.select_tool.selected = vec![drill_id];
                true
            } else {
                false
            }
        } else {
            false
        };

        // Auto bring-forward on fresh click-select (not drag, not re-select)
        let was_click = self
            .pointer_down_pos
            .map(|(dx, dy)| (x - dx).abs() < 5.0 && (y - dy).abs() < 5.0)
            .unwrap_or(false);
        let zorder_changed = if was_click
            && self.select_tool.selected.len() == 1
            && !prev_selected.contains(&self.select_tool.selected[0])
        {
            if let Some(idx) = self.engine.graph.index_of(self.select_tool.selected[0]) {
                let raised = self.engine.graph.bring_forward(idx);
                if raised {
                    self.engine.flush_to_text();
                }
                raised
            } else {
                false
            }
        } else {
            false
        };

        self.pointer_down_pos = None;

        let visual_changed = changed
            || marquee_changed
            || pressed_changed
            || hovered_changed
            || drill_changed
            || zorder_changed;

        // Auto-switch back to Select after drawing gesture completes
        let tool_switched = self.active_tool != ToolKind::Select;
        if tool_switched {
            self.set_tool("select");
        }
        let tool_name = tool_kind_to_name(self.active_tool);
        let c = if visual_changed { "true" } else { "false" };
        let ts = if tool_switched { "true" } else { "false" };
        format!(r#"{{"changed":{c},"toolSwitched":{ts},"tool":"{tool_name}"}}"#)
    }

    /// Switch the active tool, remembering the previous one.
    pub fn set_tool(&mut self, name: &str) {
        let new_tool = match name {
            "select" => ToolKind::Select,
            "rect" => ToolKind::Rect,
            "ellipse" => ToolKind::Ellipse,
            "pen" => ToolKind::Pen,
            "text" => ToolKind::Text,
            "arrow" => ToolKind::Arrow,
            "frame" => ToolKind::Frame,
            _ => ToolKind::Select,
        };
        if new_tool != self.active_tool {
            self.prev_tool = self.active_tool;
            self.active_tool = new_tool;
        }
    }

    /// Get the arrow tool's live preview line during drag.
    /// Returns JSON `{"x1":..,"y1":..,"x2":..,"y2":..}` or `""` if not dragging.
    pub fn get_arrow_preview(&self) -> String {
        if self.active_tool != ToolKind::Arrow {
            return String::new();
        }
        match self.arrow_tool.preview_line() {
            Some((x1, y1, x2, y2)) => {
                format!(r#"{{"x1":{},"y1":{},"x2":{},"y2":{}}}"#, x1, y1, x2, y2)
            }
            None => String::new(),
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

    /// Clear the pressed interaction state.
    ///
    /// Called from JS when entering inline text editing to suppress
    /// press animations that cause a visual shape jump on double-click.
    pub fn clear_pressed(&mut self) {
        self.pressed_id = None;
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
        self.duplicate_selected_at(20.0, 20.0)
    }

    /// Duplicate selected node(s) with a custom offset. Returns true if duplicated.
    /// Use (0, 0) for Alt+drag clone-in-place.
    pub fn duplicate_selected_at(&mut self, dx: f32, dy: f32) -> bool {
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
        if dx != 0.0 || dy != 0.0 {
            cloned.constraints.push(fd_core::model::Constraint::Offset {
                from: first_id,
                dx,
                dy,
            });
        } else {
            // Clone in-place: copy the original's position constraints
            // (no offset needed — constraints are already cloned)
        }

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

    /// Group the currently selected nodes. Returns true if grouped.
    pub fn group_selected(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }
        let ids: Vec<NodeId> = self.select_tool.selected.clone();
        let new_group_id = NodeId::anonymous();
        let mutation = GraphMutation::GroupNodes { ids, new_group_id };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.select_tool.selected = vec![new_group_id];
            self.engine.flush_to_text();
        }
        changed
    }

    /// Ungroup all selected groups. Returns true if any were ungrouped.
    pub fn ungroup_selected(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }

        // Collect all selected nodes that are groups
        let group_ids: Vec<NodeId> = self
            .select_tool
            .selected
            .iter()
            .copied()
            .filter(|id| {
                self.engine
                    .graph
                    .get_by_id(*id)
                    .is_some_and(|n| matches!(n.kind, fd_core::model::NodeKind::Group { .. }))
            })
            .collect();

        if group_ids.is_empty() {
            return false;
        }

        // Collect children of all groups (for post-ungroup selection)
        let mut all_children: Vec<NodeId> = Vec::new();
        // Also keep non-group selected nodes in the selection
        let non_group_selected: Vec<NodeId> = self
            .select_tool
            .selected
            .iter()
            .copied()
            .filter(|id| !group_ids.contains(id))
            .collect();

        for &gid in &group_ids {
            if let Some(idx) = self.engine.graph.index_of(gid) {
                let children: Vec<NodeId> = self
                    .engine
                    .graph
                    .children(idx)
                    .iter()
                    .map(|c| self.engine.graph.graph[*c].id)
                    .collect();
                all_children.extend(children);
            }
        }

        // Apply ungroup mutations
        let mut changed = false;
        for gid in group_ids {
            let mutation = GraphMutation::UngroupNode { id: gid };
            if self.apply_mutations(vec![mutation]) {
                changed = true;
            }
        }

        if changed {
            // Select the promoted children + any non-group items that were selected
            self.select_tool.selected = non_group_selected;
            self.select_tool.selected.extend(all_children);
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

    // ─── Detach Info API ─────────────────────────────────────────────────

    /// Get last detach event info. Returns JSON:
    /// `{"detached":true,"nodeId":"...","fromGroupId":"..."}` or `""` if none.
    /// Clears the event after reading (one-shot).
    /// Evaluate a drop for structural detach. Returns JSON if detached, empty otherwise.
    /// Clears the event after reading (one-shot).
    pub fn evaluate_drop(&mut self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        if self.engine.evaluate_drop(id) {
            match self.engine.last_detach.take() {
                Some((child_id, parent_id)) => {
                    format!(
                        r#"{{"detached":true,"nodeId":"{}","fromGroupId":"{}"}}"#,
                        child_id.as_str(),
                        parent_id.as_str()
                    )
                }
                None => String::new(),
            }
        } else {
            String::new()
        }
    }

    /// Evaluate if a dragging node is near detaching from its parent group.
    /// Returns JSON `{"parentId":"...","childCx":...,"childCy":...,"parentCx":...,"parentCy":...}`
    /// if the overlap is less than 25%. Otherwise returns an empty string.
    pub fn evaluate_near_detach(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        if let Some((parent_id, (child_cx, child_cy), (parent_cx, parent_cy))) = self.engine.evaluate_near_detach(id) {
            format!(
                r#"{{"parentId":"{}","childCx":{},"childCy":{},"parentCx":{},"parentCy":{}}}"#,
                parent_id.as_str(),
                child_cx,
                child_cy,
                parent_cx,
                parent_cy
            )
        } else {
            String::new()
        }
    }

    // ─── Animation APIs ──────────────────────────────────────────────────

    /// Add an animation to a node by ID.
    /// `trigger` is "hover", "press", or "enter".
    /// `props_json` is a JSON object with optional keys: scale, opacity, rotate, fill, duration, ease.
    /// Returns `true` on success.
    pub fn add_animation_to_node(
        &mut self,
        node_id: &str,
        trigger: &str,
        props_json: &str,
    ) -> bool {
        use fd_core::model::{AnimKeyframe, AnimProperties, AnimTrigger, Easing};

        let id = NodeId::intern(node_id);
        let anim_trigger = match trigger {
            "hover" => AnimTrigger::Hover,
            "press" => AnimTrigger::Press,
            "enter" => AnimTrigger::Enter,
            other => AnimTrigger::Custom(other.to_string()),
        };

        // Parse the properties JSON
        let props_val: serde_json::Value = match serde_json::from_str(props_json) {
            Ok(v) => v,
            Err(_) => return false,
        };

        let mut anim_props = AnimProperties::default();
        if let Some(s) = props_val.get("scale").and_then(|v| v.as_f64()) {
            anim_props.scale = Some(s as f32);
        }
        if let Some(o) = props_val.get("opacity").and_then(|v| v.as_f64()) {
            anim_props.opacity = Some(o as f32);
        }
        if let Some(r) = props_val.get("rotate").and_then(|v| v.as_f64()) {
            anim_props.rotate = Some(r as f32);
        }
        if let Some(color) = props_val
            .get("fill")
            .and_then(|v| v.as_str())
            .and_then(Color::from_hex)
        {
            anim_props.fill = Some(Paint::Solid(color));
        }

        let duration_ms = props_val
            .get("duration")
            .and_then(|v| v.as_u64())
            .unwrap_or(300) as u32;

        let easing = match props_val.get("ease").and_then(|v| v.as_str()) {
            Some("linear") => Easing::Linear,
            Some("ease_in") => Easing::EaseIn,
            Some("ease_out") => Easing::EaseOut,
            Some("ease_in_out") => Easing::EaseInOut,
            _ => Easing::Spring,
        };

        let keyframe = AnimKeyframe {
            trigger: anim_trigger,
            duration_ms,
            easing,
            properties: anim_props,
        };

        // Get current animations and append the new one
        let mut current_anims = self
            .engine
            .graph
            .get_by_id(id)
            .map(|n| n.animations.clone())
            .unwrap_or_default();

        // Remove any existing anim with the same trigger (replace, don't duplicate)
        current_anims.retain(|a| a.trigger != keyframe.trigger);
        current_anims.push(keyframe);

        let mutations = vec![GraphMutation::SetAnimations {
            id,
            animations: current_anims,
        }];
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Get animations for a node as a JSON array.
    /// Returns `[]` if node not found or has no animations.
    pub fn get_node_animations_json(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        let animations = self
            .engine
            .graph
            .get_by_id(id)
            .map(|n| &n.animations)
            .cloned()
            .unwrap_or_default();
        serde_json::to_string(&animations).unwrap_or_else(|_| "[]".to_string())
    }

    /// Remove all animations from a node. Returns `true` if changed.
    pub fn remove_node_animations(&mut self, node_id: &str) -> bool {
        let id = NodeId::intern(node_id);
        let mutations = vec![GraphMutation::SetAnimations {
            id,
            animations: Default::default(),
        }];
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    // ─── Export API ──────────────────────────────────────────────────────

    /// Get the union bounding box of all currently selected nodes (including children).
    /// Returns `[x, y, width, height]` array, or `None` if selection is empty.
    pub fn get_selection_bounds(&self) -> Option<js_sys::Float64Array> {
        if self.select_tool.selected.is_empty() {
            return None;
        }

        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;
        let mut found = false;

        let bounds = self.engine.current_bounds();

        // Recursively find bounds for a node and its children
        #[allow(clippy::too_many_arguments)]
        fn expand_bounds(
            graph: &fd_core::model::SceneGraph,
            bounds_map: &std::collections::HashMap<fd_core::NodeIndex, fd_core::ResolvedBounds>,
            idx: fd_core::NodeIndex,
            min_x: &mut f32,
            min_y: &mut f32,
            max_x: &mut f32,
            max_y: &mut f32,
            found: &mut bool,
        ) {
            if let Some(b) = bounds_map.get(&idx) {
                *min_x = (*min_x).min(b.x);
                *min_y = (*min_y).min(b.y);
                *max_x = (*max_x).max(b.x + b.width);
                *max_y = (*max_y).max(b.y + b.height);
                *found = true;
            }
            for child in graph.children(idx) {
                expand_bounds(graph, bounds_map, child, min_x, min_y, max_x, max_y, found);
            }
        }

        for id in &self.select_tool.selected {
            if let Some(idx) = self.engine.graph.index_of(*id) {
                expand_bounds(
                    &self.engine.graph,
                    bounds,
                    idx,
                    &mut min_x,
                    &mut min_y,
                    &mut max_x,
                    &mut max_y,
                    &mut found,
                );
            }
        }

        if !found {
            return None;
        }

        let arr = js_sys::Float64Array::new_with_length(4);
        arr.set_index(0, min_x as f64);
        arr.set_index(1, min_y as f64);
        arr.set_index(2, (max_x - min_x) as f64);
        arr.set_index(3, (max_y - min_y) as f64);
        Some(arr)
    }

    /// Render only the selected nodes (and their children) to the given context.
    /// Used for "Copy as PNG" exports. Translates context by `offset_x, offset_y`.
    pub fn render_export(&self, ctx: &CanvasRenderingContext2d, offset_x: f64, offset_y: f64) {
        if self.select_tool.selected.is_empty() {
            return;
        }

        let theme = if self.dark_mode {
            render2d::CanvasTheme::dark()
        } else {
            render2d::CanvasTheme::light()
        };

        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        render2d::render_export(
            ctx,
            &self.engine.graph,
            self.engine.current_bounds(),
            &selected_ids,
            &theme,
            offset_x,
            offset_y,
            self.sketchy_mode,
        );
    }

    /// Export the current selection (or entire canvas if empty) as an SVG string.
    pub fn export_svg(&self) -> String {
        let theme = if self.dark_mode {
            render2d::CanvasTheme::dark()
        } else {
            render2d::CanvasTheme::light()
        };

        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        svg::render_svg(
            &self.engine.graph,
            self.engine.current_bounds(),
            &selected_ids,
            &theme,
        )
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
        let style = self.engine.graph.resolve_style(node, &[]);
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
            NodeKind::Frame { width, height, .. } => {
                props.insert("kind".into(), "frame".into());
                props.insert("width".into(), serde_json::json!(width));
                props.insert("height".into(), serde_json::json!(height));
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

        // Text child content (for rect/ellipse — find first Text child)
        if matches!(
            node.kind,
            NodeKind::Rect { .. } | NodeKind::Ellipse { .. } | NodeKind::Frame { .. }
        ) && let Some(idx) = self.engine.graph.index_of(id)
        {
            for child_idx in self.engine.graph.children(idx) {
                if let NodeKind::Text { ref content } = self.engine.graph.graph[child_idx].kind {
                    props.insert("label".into(), serde_json::Value::String(content.clone()));
                    break;
                }
            }
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

        // Text alignment
        if let Some(ref ta) = style.text_align {
            let ta_str = match ta {
                TextAlign::Left => "left",
                TextAlign::Center => "center",
                TextAlign::Right => "right",
            };
            props.insert(
                "textAlign".into(),
                serde_json::Value::String(ta_str.to_string()),
            );
        }
        if let Some(ref tv) = style.text_valign {
            let tv_str = match tv {
                TextVAlign::Top => "top",
                TextVAlign::Middle => "middle",
                TextVAlign::Bottom => "bottom",
            };
            props.insert(
                "textVAlign".into(),
                serde_json::Value::String(tv_str.to_string()),
            );
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
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.style.clone();
                        style.fill = Some(Paint::Solid(color));
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "strokeColor" => {
                if let Some(color) = Color::from_hex(value) {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.style.clone();
                        let resolved = self.engine.graph.resolve_style(node, &[]);
                        let mut stroke = style.stroke.or(resolved.stroke).unwrap_or_default();
                        stroke.paint = Paint::Solid(color);
                        style.stroke = Some(stroke);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "strokeWidth" => {
                if let Ok(w) = value.parse::<f32>() {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.style.clone();
                        let resolved = self.engine.graph.resolve_style(node, &[]);
                        let mut stroke = style.stroke.or(resolved.stroke).unwrap_or_default();
                        stroke.width = w;
                        style.stroke = Some(stroke);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "cornerRadius" => {
                if let Ok(r) = value.parse::<f32>() {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.style.clone();
                        style.corner_radius = Some(r);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "opacity" => {
                if let Ok(o) = value.parse::<f32>() {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.style.clone();
                        style.opacity = Some(o);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "textAlign" => {
                let align = match value {
                    "left" => TextAlign::Left,
                    "right" => TextAlign::Right,
                    _ => TextAlign::Center,
                };
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let mut style = node.style.clone();
                    style.text_align = Some(align);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "textVAlign" => {
                let valign = match value {
                    "top" => TextVAlign::Top,
                    "bottom" => TextVAlign::Bottom,
                    _ => TextVAlign::Middle,
                };
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let mut style = node.style.clone();
                    style.text_valign = Some(valign);
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
                        NodeKind::Frame { width, height, .. } => (*width, *height),
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
                // Find or create a text child node for the shape
                if let Some(parent_idx) = self.engine.graph.index_of(id) {
                    // Find existing text child
                    let existing_text_child = self
                        .engine
                        .graph
                        .children(parent_idx)
                        .into_iter()
                        .find(|&ci| {
                            matches!(self.engine.graph.graph[ci].kind, NodeKind::Text { .. })
                        });

                    if value.is_empty() {
                        // Remove text child if value is empty
                        if let Some(child_idx) = existing_text_child {
                            let child_id = self.engine.graph.graph[child_idx].id;
                            GraphMutation::RemoveNode { id: child_id }
                        } else {
                            return false;
                        }
                    } else if let Some(child_idx) = existing_text_child {
                        // Update existing text child
                        let child_id = self.engine.graph.graph[child_idx].id;
                        GraphMutation::SetText {
                            id: child_id,
                            content: value.to_string(),
                        }
                    } else {
                        // Create new text child node
                        let child_id = NodeId::anonymous();
                        let node = SceneNode::new(
                            child_id,
                            NodeKind::Text {
                                content: value.to_string(),
                            },
                        );
                        GraphMutation::AddNode {
                            parent_id: id,
                            node: Box::new(node),
                        }
                    }
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

    /// Hit-test at scene-space coordinates. Returns the topmost node ID, or empty string.
    pub fn hit_test_at(&self, x: f32, y: f32) -> String {
        self.hit_test(x, y)
            .map(|id| id.as_str().to_string())
            .unwrap_or_default()
    }

    /// Create a node at a specific position (for drag-and-drop).
    /// `kind` is "rect", "ellipse", "text", or "frame".
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
            "frame" => NodeKind::Frame {
                width: 200.0,
                height: 150.0,
                clip: false,
                layout: LayoutMode::Free,
            },
            _ => return false,
        };
        let mut node = SceneNode::new(id, node_kind);
        node.constraints.push(Constraint::Position { x, y });

        // ScreenBrush-style defaults: transparent fill + bezeled stroke
        if kind == "frame" {
            node.style.fill = Some(Paint::Solid(Color::rgba(0.95, 0.95, 0.97, 1.0)));
            node.style.stroke = Some(Stroke {
                paint: Paint::Solid(Color::rgba(0.75, 0.75, 0.8, 1.0)),
                width: 1.0,
                cap: StrokeCap::Butt,
                join: StrokeJoin::Miter,
            });
        } else if kind == "rect" {
            node.style.stroke = Some(Stroke {
                paint: Paint::Solid(Color::rgba(0.2, 0.2, 0.2, 1.0)),
                width: 2.5,
                cap: StrokeCap::Round,
                join: StrokeJoin::Round,
            });
            node.style.corner_radius = Some(8.0);
        } else if kind == "ellipse" {
            node.style.stroke = Some(Stroke {
                paint: Paint::Solid(Color::rgba(0.2, 0.2, 0.2, 1.0)),
                width: 2.5,
                cap: StrokeCap::Round,
                join: StrokeJoin::Round,
            });
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

    /// Create an edge between two nodes.
    /// Returns the new edge ID, or empty string on failure.
    pub fn create_edge(&mut self, from_id: &str, to_id: &str) -> String {
        let from = NodeId::intern(from_id);
        let to = NodeId::intern(to_id);
        if from == to {
            return String::new();
        }
        // Verify both nodes exist
        if self.engine.graph.index_of(from).is_none() || self.engine.graph.index_of(to).is_none() {
            return String::new();
        }
        let edge_id = NodeId::with_prefix("edge");
        let edge = Edge {
            id: edge_id,
            from,
            to,
            label: None,
            style: fd_core::model::Style::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::End,
            curve: CurveKind::Smooth,
            annotations: Vec::new(),
            animations: Default::default(),
            flow: None,
        };
        let mutation = GraphMutation::AddEdge {
            edge: Box::new(edge),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.engine.flush_to_text();
            edge_id.as_str().to_string()
        } else {
            String::new()
        }
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
        let all_moves = mutations
            .iter()
            .all(|m| matches!(m, GraphMutation::MoveNode { .. }));
        for mutation in mutations {
            self.commands
                .execute(&mut self.engine, mutation, "canvas edit");
        }
        // Skip full layout resolve for move-only batches — bounds already updated in-place.
        // Re-resolving would recalculate from constraints and fight with the in-place update.
        if !all_moves {
            self.engine.resolve();
        }
        true
    }

    /// Check if the pointer hits a resize handle for the currently selected node.
    /// Returns the ResizeHandle variant if within 5px of a handle center.
    fn hit_test_resize_handle(&self, x: f32, y: f32) -> Option<ResizeHandle> {
        let id = self.select_tool.first_selected()?;
        let idx = self.engine.graph.index_of(id)?;
        let b = self.engine.current_bounds().get(&idx)?;

        let bx = b.x;
        let by = b.y;
        let bw = b.width;
        let bh = b.height;
        let radius = 5.0_f32; // Hit radius in scene-space pixels

        let handles = [
            (bx, by, ResizeHandle::TopLeft),
            (bx + bw / 2.0, by, ResizeHandle::TopCenter),
            (bx + bw, by, ResizeHandle::TopRight),
            (bx, by + bh / 2.0, ResizeHandle::MiddleLeft),
            (bx + bw, by + bh / 2.0, ResizeHandle::MiddleRight),
            (bx, by + bh, ResizeHandle::BottomLeft),
            (bx + bw / 2.0, by + bh, ResizeHandle::BottomCenter),
            (bx + bw, by + bh, ResizeHandle::BottomRight),
        ];

        for (hx, hy, handle) in handles {
            let dx = x - hx;
            let dy = y - hy;
            if dx * dx + dy * dy <= radius * radius {
                return Some(handle);
            }
        }
        None
    }

    /// Compute smart alignment guides during drag/resize.
    /// Returns guide lines as (x1, y1, x2, y2) in scene-space.
    fn compute_smart_guides(&self) -> Vec<(f64, f64, f64, f64)> {
        // Only produce guides while actively dragging or resizing
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

        // Selected node reference points
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

            // Check X-axis alignments
            let x_refs = [
                (s_left, o_left),
                (s_left, o_cx),
                (s_left, o_right),
                (s_cx, o_left),
                (s_cx, o_cx),
                (s_cx, o_right),
                (s_right, o_left),
                (s_right, o_cx),
                (s_right, o_right),
            ];
            for (sv, ov) in x_refs {
                if (sv - ov).abs() < snap_threshold {
                    guides.push((ov as f64, 0.0, ov as f64, h));
                }
            }

            // Check Y-axis alignments
            let y_refs = [
                (s_top, o_top),
                (s_top, o_cy),
                (s_top, o_bottom),
                (s_cy, o_top),
                (s_cy, o_cy),
                (s_cy, o_bottom),
                (s_bottom, o_top),
                (s_bottom, o_cy),
                (s_bottom, o_bottom),
            ];
            for (sv, ov) in y_refs {
                if (sv - ov).abs() < snap_threshold {
                    guides.push((0.0, ov as f64, w, ov as f64));
                }
            }
        }

        // Deduplicate guides (same position within tolerance)
        guides.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        });
        guides.dedup_by(|a, b| (a.0 - b.0).abs() < 0.5 && (a.1 - b.1).abs() < 0.5);

        guides
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
            ShortcutAction::ToolArrow => {
                self.set_tool("arrow");
                (false, true)
            }
            ShortcutAction::ToolFrame => {
                self.set_tool("frame");
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
            ShortcutAction::Group => (self.group_selected(), false),
            ShortcutAction::Ungroup => (self.ungroup_selected(), false),
            // Screenbrush: ⌘Delete = clear selected
            ShortcutAction::ClearAll => (self.delete_selected(), false),
            ShortcutAction::Deselect => {
                self.select_tool.selected.clear();
                (false, false)
            }

            // Z-order (now handled in Rust)
            ShortcutAction::SendBackward => {
                if let Some(id) = self.select_tool.first_selected() {
                    if let Some(idx) = self.engine.graph.index_of(id) {
                        let changed = self.engine.graph.send_backward(idx);
                        (changed, false)
                    } else {
                        (false, false)
                    }
                } else {
                    (false, false)
                }
            }
            ShortcutAction::BringForward => {
                if let Some(id) = self.select_tool.first_selected() {
                    if let Some(idx) = self.engine.graph.index_of(id) {
                        let changed = self.engine.graph.bring_forward(idx);
                        (changed, false)
                    } else {
                        (false, false)
                    }
                } else {
                    (false, false)
                }
            }
            ShortcutAction::SendToBack => {
                if let Some(id) = self.select_tool.first_selected() {
                    if let Some(idx) = self.engine.graph.index_of(id) {
                        let changed = self.engine.graph.send_to_back(idx);
                        (changed, false)
                    } else {
                        (false, false)
                    }
                } else {
                    (false, false)
                }
            }
            ShortcutAction::BringToFront => {
                if let Some(id) = self.select_tool.first_selected() {
                    if let Some(idx) = self.engine.graph.index_of(id) {
                        let changed = self.engine.graph.bring_to_front(idx);
                        (changed, false)
                    } else {
                        (false, false)
                    }
                } else {
                    (false, false)
                }
            }

            // Currently handled by JS (clipboard, zoom, help)
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
        ToolKind::Arrow => "arrow",
        ToolKind::Frame => "frame",
    }
}

fn action_to_name(action: ShortcutAction) -> &'static str {
    match action {
        ShortcutAction::ToolSelect => "toolSelect",
        ShortcutAction::ToolRect => "toolRect",
        ShortcutAction::ToolEllipse => "toolEllipse",
        ShortcutAction::ToolPen => "toolPen",
        ShortcutAction::ToolText => "toolText",
        ShortcutAction::ToolArrow => "toolArrow",
        ShortcutAction::ToolFrame => "toolFrame",
        ShortcutAction::ToggleLastTool => "toggleLastTool",
        ShortcutAction::Undo => "undo",
        ShortcutAction::Redo => "redo",
        ShortcutAction::Delete => "delete",
        ShortcutAction::SelectAll => "selectAll",
        ShortcutAction::Duplicate => "duplicate",
        ShortcutAction::Group => "group",
        ShortcutAction::Ungroup => "ungroup",
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
        fd_core::NodeKind::Frame { .. } => "frame",
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
