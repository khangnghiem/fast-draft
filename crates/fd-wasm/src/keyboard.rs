//! Keyboard shortcut handling and tool dispatch.

use crate::FdCanvas;
use crate::responses::KeyResult;
use fd_editor::shortcuts::{ShortcutAction, ShortcutMap};
use fd_editor::sync::GraphMutation;
use fd_editor::tools::ToolKind;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl FdCanvas {
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
            None => {
                return serde_json::to_string(&KeyResult {
                    changed: false,
                    action: "none".to_string(),
                    tool: String::new(),
                    tool_switched: false,
                })
                .unwrap_or_else(|_| {
                    r#"{"changed":false,"action":"none","tool":"","toolSwitched":false}"#
                        .to_string()
                });
            }
        };

        let (changed, tool_switched) = self.dispatch_action(action);

        let action_name = action_to_name(action);
        let tool_name = tool_kind_to_name(self.active_tool);

        serde_json::to_string(&KeyResult {
            changed,
            action: action_name.to_string(),
            tool: tool_name.to_string(),
            tool_switched,
        })
        .unwrap_or_else(|_| {
            r#"{"changed":false,"action":"none","tool":"select","toolSwitched":false}"#.to_string()
        })
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

    /// Dispatch a shortcut action. Returns (graph_changed, tool_switched).
    pub(crate) fn dispatch_action(&mut self, action: ShortcutAction) -> (bool, bool) {
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
            ShortcutAction::ToolEraser => {
                self.set_tool("eraser");
                (false, true)
            }
            ShortcutAction::ToolHand => {
                self.set_tool("hand");
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
                self.select_tool.visual_highlight.clear();
                (false, false)
            }

            // Z-order (handled in Rust — flush to text so reorder persists)
            ShortcutAction::SendBackward => {
                if let Some(id) = self.select_tool.first_selected() {
                    if let Some(idx) = self.engine.graph.index_of(id) {
                        let changed = self.engine.graph.send_backward(idx);
                        if changed {
                            self.engine.mark_dirty();
                            self.engine.flush_to_text();
                        }
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
                        if changed {
                            self.engine.mark_dirty();
                            self.engine.flush_to_text();
                        }
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
                        if changed {
                            self.engine.mark_dirty();
                            self.engine.flush_to_text();
                        }
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
                        if changed {
                            self.engine.mark_dirty();
                            self.engine.flush_to_text();
                        }
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
            | ShortcutAction::ShowHelp
            | ShortcutAction::ExportExcalidraw => (false, false),

            // Style clipboard
            ShortcutAction::CopyStyle => {
                if let Some(id) = self.select_tool.first_selected()
                    && let Some(node) = self.engine.graph.get_by_id(id)
                {
                    self.style_clipboard = Some(node.props.clone());
                }
                (false, false)
            }
            ShortcutAction::PasteStyle => {
                if let Some(ref clipboard) = self.style_clipboard.clone()
                    && let Some(id) = self.select_tool.first_selected()
                {
                    let mutation = GraphMutation::SetStyle {
                        id,
                        style: clipboard.clone(),
                    };
                    let changed = self.apply_mutations(vec![mutation]);
                    if changed {
                        self.engine.flush_to_text();
                    }
                    return (changed, false);
                }
                (false, false)
            }
        }
    }
}

pub(crate) fn tool_kind_to_name(kind: ToolKind) -> &'static str {
    match kind {
        ToolKind::Select => "select",
        ToolKind::Hand => "hand",
        ToolKind::Rect => "rect",
        ToolKind::Ellipse => "ellipse",
        ToolKind::Pen => "pen",
        ToolKind::Text => "text",
        ToolKind::Arrow => "arrow",
        ToolKind::Frame => "frame",
        ToolKind::Eraser => "eraser",
    }
}

pub(crate) fn action_to_name(action: ShortcutAction) -> &'static str {
    match action {
        ShortcutAction::ToolSelect => "toolSelect",
        ShortcutAction::ToolHand => "toolHand",
        ShortcutAction::ToolRect => "toolRect",
        ShortcutAction::ToolEllipse => "toolEllipse",
        ShortcutAction::ToolPen => "toolPen",
        ShortcutAction::ToolText => "toolText",
        ShortcutAction::ToolArrow => "toolArrow",
        ShortcutAction::ToolFrame => "toolFrame",
        ShortcutAction::ToolEraser => "toolEraser",
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
        ShortcutAction::CopyStyle => "copyStyle",
        ShortcutAction::PasteStyle => "pasteStyle",
        ShortcutAction::ExportExcalidraw => "exportExcalidraw",
    }
}
