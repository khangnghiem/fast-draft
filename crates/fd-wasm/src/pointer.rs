//! Pointer event handlers — down, move, up, cancel drag.

use crate::FdCanvas;
use crate::responses::{BoundsInfo, PointerMoveResult, PointerUpResult};
use fd_editor::input::{InputEvent, Modifiers};
use fd_editor::tools::{Tool, ToolKind};
use fd_render::hit::hit_test_rect;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl FdCanvas {
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
        // Start batch so all drag mutations become one undo step.
        // Skip batching for Text tool — it emits a single AddNode, so
        // Command::Single (with RemoveNode inverse) gives cheaper undo
        // without a full document re-parse via set_text().
        let needs_batch = self.active_tool != ToolKind::Text;
        if needs_batch {
            self.commands.begin_batch(&mut self.engine);
        }

        // Hand tool: finger/mouse → return false (JS handles pan).
        // Apple Pencil (Pen) → fall through to Select behavior,
        // enabling input-aware Hand: finger=pan, pencil=select.
        if self.active_tool == ToolKind::Hand
            && self.pointer_type != fd_editor::input::PointerType::Pen
        {
            return false;
        }

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

        // Groups are transparent: effective_target always returns the leaf.
        // If the raw hit is already selected, keep it for drag.
        let hit = raw_hit.map(|id| {
            if self.select_tool.selected.contains(&id) {
                return id;
            }
            self.engine
                .graph
                .effective_target(id, &self.select_tool.selected)
        });

        // Visual highlight: show the clicked child, not the group
        self.select_tool.visual_highlight = match (raw_hit, hit) {
            (Some(raw), Some(eff)) if raw != eff => vec![raw],
            (_, Some(eff)) => vec![eff],
            _ => vec![],
        };

        let prev_pressed = self.pressed_id;
        self.pressed_id = hit;
        let pressed_changed = prev_pressed != self.pressed_id;

        // Don't set hovered_id on pointer-down — hover is managed
        // exclusively by handle_pointer_move (CSS-style behavior).
        // Click should only set pressed_id, not trigger :hover animations.
        let hovered_changed = false;

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

        // Eraser: handle drag lifecycle + immediate delete on hit
        if self.active_tool == ToolKind::Eraser {
            self.eraser_tool.handle(&event, hit);
            if let Some(hit_id) = raw_hit {
                self.erase_node_immediately(hit_id);
            }
            let erased = !self.eraser_tool.erased_ids.is_empty();
            return erased || pressed_changed || hovered_changed;
        }

        // Hand + Pen → Select behavior (input-aware Hand tool)
        let effective = self.effective_tool();
        let mutations = match effective {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect | ToolKind::Frame => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
            ToolKind::Arrow => self.arrow_tool.handle(&event, hit),
            ToolKind::Hand => vec![],
            ToolKind::Eraser => unreachable!("handled above"),
        };
        let changed = self.apply_mutations(mutations);

        // Alt+click on select tool: record position for deferred duplication.
        // Actual clone happens in handle_pointer_move after ≥3px of movement
        // (Figma-style threshold to prevent accidental clones on Alt keypress).
        if self.active_tool == ToolKind::Select
            && alt
            && !ctrl
            && !meta
            && hit.is_some()
            && !self.select_tool.selected.is_empty()
        {
            self.alt_press_pos = Some((x, y));
        }

        // Marquee start also counts as a visual change (need re-render)
        changed
            || self.select_tool.marquee_start.is_some()
            || pressed_changed
            || hovered_changed
            || self.alt_press_pos.is_some()
    }

    /// Handle pointer move event. Returns JSON string:
    /// `{"changed":bool}` or `{"changed":bool,"bounds":{"x":N,"y":N,"w":N,"h":N}}`
    /// when actively dragging a selected node (for dimension tooltip).
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
    ) -> String {
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
        if hovered_changed && self.hovered_id.is_some() {
            self.hover_start_ms = web_sys::window()
                .and_then(|w| w.performance())
                .map(|p| p.now())
                .unwrap_or(0.0);
        }

        // Eraser: delete nodes on drag-over
        if self.active_tool == ToolKind::Eraser && self.eraser_tool.dragging {
            if let Some(hit_id) = raw_hit
                && !self.eraser_tool.erased_ids.contains(&hit_id)
            {
                self.erase_node_immediately(hit_id);
                return serde_json::to_string(&PointerMoveResult {
                    changed: true,
                    bounds: None,
                })
                .unwrap_or_else(|_| r#"{"changed":true}"#.to_string());
            }
            return serde_json::to_string(&PointerMoveResult {
                changed: hovered_changed,
                bounds: None,
            })
            .unwrap_or_else(|_| r#"{"changed":false}"#.to_string());
        }

        // Alt+drag duplication with 3px threshold.
        if self.active_tool == ToolKind::Select
            && alt
            && !self.alt_duplicated
            && !self.select_tool.selected.is_empty()
            && let Some((ox, oy)) = self.alt_press_pos
        {
            let dist_sq = (x - ox) * (x - ox) + (y - oy) * (y - oy);
            if dist_sq >= 9.0 {
                self.capture_alt_clone_origins();
                self.alt_duplicated = true;
                self.alt_press_pos = None;
                self.duplicate_selected_at(0.0, 0.0);
                self.select_tool.last_x = x;
                self.select_tool.last_y = y;
            }
        }

        let effective = self.effective_tool();
        let mutations = match effective {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect | ToolKind::Frame => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
            ToolKind::Arrow => self.arrow_tool.handle(&event, hit),
            ToolKind::Hand => vec![],
            ToolKind::Eraser => vec![],
        };
        let changed = self.apply_mutations(mutations);
        let visual_changed = changed || self.select_tool.marquee_rect.is_some() || hovered_changed;

        // Bundle selected node bounds for JS dimension tooltip (avoids 2 extra WASM calls)
        let is_dragging = self.select_tool.dragging || self.select_tool.resize_handle.is_some();
        if visual_changed
            && is_dragging
            && let Some(id) = self.select_tool.first_selected()
            && let Some(idx) = self.engine.graph.index_of(id)
            && let Some(b) = self.engine.current_bounds().get(&idx)
            && b.width > 0.0
            && b.height > 0.0
        {
            return serde_json::to_string(&PointerMoveResult {
                changed: true,
                bounds: Some(BoundsInfo {
                    x: b.x,
                    y: b.y,
                    w: b.width,
                    h: b.height,
                }),
            })
            .unwrap_or_else(|_| r#"{"changed":true}"#.to_string());
        }

        // Dimension tooltip during draw-tool gestures (Rect/Ellipse/Frame)
        let is_draw_tool = matches!(
            self.active_tool,
            ToolKind::Rect | ToolKind::Frame | ToolKind::Ellipse
        );
        if visual_changed
            && is_draw_tool
            && let Some(id) = self
                .rect_tool
                .current_drawing_id()
                .or(self.ellipse_tool.current_drawing_id())
            && let Some(idx) = self.engine.graph.index_of(id)
            && let Some(b) = self.engine.current_bounds().get(&idx)
            && b.width > 0.0
            && b.height > 0.0
        {
            return serde_json::to_string(&PointerMoveResult {
                changed: true,
                bounds: Some(BoundsInfo {
                    x: b.x,
                    y: b.y,
                    w: b.width,
                    h: b.height,
                }),
            })
            .unwrap_or_else(|_| r#"{"changed":true}"#.to_string());
        }

        serde_json::to_string(&PointerMoveResult {
            changed: visual_changed,
            bounds: None,
        })
        .unwrap_or_else(|_| r#"{"changed":false}"#.to_string())
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

        // End batch — squash all drag mutations into one undo step.
        // Skip for Text tool (not batched — see handle_pointer_down).
        if self.active_tool != ToolKind::Text {
            self.commands.end_batch(&mut self.engine);
        }

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
                // Also collect edges intersecting the marquee
                let edge_hits = fd_render::hit::hit_test_rect_edges(
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
                            self.select_tool.visual_highlight.push(raw_id);
                        }
                    }
                    for edge_id in edge_hits {
                        if !self.select_tool.selected.contains(&edge_id) {
                            self.select_tool.selected.push(edge_id);
                            self.select_tool.visual_highlight.push(edge_id);
                        }
                    }
                } else {
                    let mut new_selection = Vec::new();
                    let mut new_highlight = Vec::new();
                    for raw_id in hits {
                        let id = self.engine.graph.effective_target(raw_id, &new_selection);
                        if !new_selection.contains(&id) {
                            new_selection.push(id);
                            new_highlight.push(raw_id);
                        }
                    }
                    for edge_id in edge_hits {
                        if !new_selection.contains(&edge_id) {
                            new_selection.push(edge_id);
                            new_highlight.push(edge_id);
                        }
                    }
                    self.select_tool.selected = new_selection;
                    self.select_tool.visual_highlight = new_highlight;
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

        // Don't set hovered_id on pointer-up — hover is managed
        // exclusively by handle_pointer_move (CSS-style behavior).
        let hovered_changed = false;

        // Eraser: end gesture — flush text once, reset state
        if self.active_tool == ToolKind::Eraser {
            self.eraser_tool.dragging = false;
            if self.erase_pending_flush {
                self.engine.flush_to_text();
                self.erase_pending_flush = false;
            }
            self.eraser_tool.clear();
        }

        let effective = self.effective_tool();
        let mutations = match effective {
            ToolKind::Select => self.select_tool.handle(&event, hit),
            ToolKind::Rect | ToolKind::Frame => self.rect_tool.handle(&event, hit),
            ToolKind::Ellipse => self.ellipse_tool.handle(&event, hit),
            ToolKind::Pen => self.pen_tool.handle(&event, hit),
            ToolKind::Text => self.text_tool.handle(&event, hit),
            ToolKind::Arrow => self.arrow_tool.handle(&event, hit),
            ToolKind::Hand => vec![],
            ToolKind::Eraser => vec![],
        };
        let changed = self.apply_mutations(mutations);

        // Compute tool_switched early — needed for flush and visual_changed.
        // A draw tool (Rect/Ellipse/Pen/Text/Arrow/Frame) completing its
        // gesture means the scene changed even if PointerUp returned no
        // mutations (the AddNode happened during PointerDown).
        let tool_switched = effective != ToolKind::Select
            && effective != ToolKind::Eraser
            && effective != ToolKind::Hand;

        // Flush text after gesture ends.
        // Also flush when a draw tool completes (tool_switched) — the
        // AddNode was applied during PointerDown but the tool's PointerUp
        // returns no mutations, so `changed` is false. end_batch() already
        // flushed, but this ensures consistency for non-batched paths.
        if changed || tool_switched {
            self.engine.flush_to_text();
        }

        // Rebuild spatial index so hit testing uses updated positions.
        // apply_mutations() skips this for MoveNode/ResizeNode batches
        // (to avoid resolve() clobbering), but the cached bounds ARE
        // updated in-place — so rebuild the index from those bounds now.
        self.rebuild_spatial_index();

        let drill_changed = false;

        self.pointer_down_pos = None;
        self.alt_duplicated = false;
        self.alt_press_pos = None;
        self.alt_clone_origins.clear();

        let visual_changed = changed
            || marquee_changed
            || pressed_changed
            || hovered_changed
            || drill_changed
            || tool_switched;

        // Auto-switch back to Select after drawing gesture completes
        if tool_switched {
            self.set_tool("select");
        }
        let tool_name = crate::keyboard::tool_kind_to_name(self.active_tool);

        serde_json::to_string(&PointerUpResult {
            changed: visual_changed,
            tool_switched,
            tool: tool_name.to_string(),
        })
        .unwrap_or_else(|_| r#"{"changed":false,"toolSwitched":false,"tool":"select"}"#.to_string())
    }

    /// Cancel an in-progress drag gesture (Esc mid-drag).
    ///
    /// Restores the scene to the pre-drag state by abandoning the batch
    /// snapshot and resetting all tool drag flags. Returns `true` if a
    /// drag was actually cancelled.
    pub fn cancel_drag(&mut self) -> bool {
        // Check if any tool is actively dragging
        let was_dragging = self.select_tool.dragging
            || self.select_tool.marquee_start.is_some()
            || self.select_tool.resize_handle.is_some()
            || self.rect_tool.is_drawing()
            || self.ellipse_tool.is_drawing()
            || self.pen_tool.is_drawing()
            || self.arrow_tool.drawing
            || self.eraser_tool.dragging;

        if !was_dragging {
            return false;
        }

        // Abandon the batch — restores pre-drag text snapshot
        self.commands.abandon_batch(&mut self.engine);
        self.engine.resolve();

        // Reset all tool drag states
        self.select_tool.dragging = false;
        self.select_tool.marquee_start = None;
        self.select_tool.marquee_rect = None;
        self.select_tool.resize_handle = None;
        self.select_tool.shift_toggled_off = None;

        self.rect_tool.cancel();
        self.ellipse_tool.cancel();
        self.pen_tool.cancel();
        self.arrow_tool.drawing = false;
        self.arrow_tool.start_pos = None;
        self.arrow_tool.current_pos = None;
        self.arrow_tool.source_node = None;
        self.arrow_tool.target_node = None;
        self.eraser_tool.clear();

        // Reset interaction state
        self.pointer_down_pos = None;
        self.alt_duplicated = false;
        self.alt_press_pos = None;
        self.alt_clone_origins.clear();
        self.pressed_id = None;
        self.erase_pending_flush = false;

        true
    }
}
