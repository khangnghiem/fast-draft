//! Tool system for canvas interactions.
//!
//! Each tool translates user input events into `GraphMutation` commands
//! that are applied via the `SyncEngine`.
//!
//! ## Modifier behaviors
//!
//! | Modifier | Select Tool | Rect Tool | Pen Tool |
//! |----------|-------------|-----------|----------|
//! | **Shift** | Axis-constrain drag | Square constraint | — |
//! | **Alt** | Duplicate on drag start | Draw from center | — |

use crate::input::InputEvent;
use crate::sync::GraphMutation;
use fd_core::id::NodeId;
use fd_core::model::*;

/// The active tool determines how input events are interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolKind {
    Select,
    Rect,
    Ellipse,
    Pen,
    Text,
}

/// Trait for tools that handle input and produce mutations.
pub trait Tool {
    fn kind(&self) -> ToolKind;

    /// Handle an input event, returning zero or more mutations.
    fn handle(&mut self, event: &InputEvent, hit_node: Option<NodeId>) -> Vec<GraphMutation>;
}

// ─── Select Tool ─────────────────────────────────────────────────────────

pub struct SelectTool {
    /// Currently selected node.
    pub selected: Option<NodeId>,
    /// Drag state.
    dragging: bool,
    last_x: f32,
    last_y: f32,
    /// Whether we duplicated on this drag (Alt+drag).
    alt_duplicated: bool,
}

impl Default for SelectTool {
    fn default() -> Self {
        Self::new()
    }
}

impl SelectTool {
    pub fn new() -> Self {
        Self {
            selected: None,
            dragging: false,
            last_x: 0.0,
            last_y: 0.0,
            alt_duplicated: false,
        }
    }
}

impl Tool for SelectTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Select
    }

    fn handle(&mut self, event: &InputEvent, hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown {
                x, y, modifiers, ..
            } => {
                self.selected = hit_node;
                self.dragging = self.selected.is_some();
                self.last_x = *x;
                self.last_y = *y;
                self.alt_duplicated = false;

                // Alt+click on a node → prepare for duplicate-drag
                // Actual duplication happens on first move to avoid duplicating on click
                if modifiers.alt
                    && let Some(id) = self.selected
                {
                    self.alt_duplicated = true;
                    return vec![GraphMutation::DuplicateNode { id }];
                }

                vec![]
            }
            InputEvent::PointerMove {
                x, y, modifiers, ..
            } => {
                if self.dragging
                    && let Some(id) = self.selected
                {
                    let mut dx = x - self.last_x;
                    let mut dy = y - self.last_y;
                    self.last_x = *x;
                    self.last_y = *y;

                    // Shift: constrain to dominant axis
                    if modifiers.shift {
                        if dx.abs() > dy.abs() {
                            dy = 0.0;
                        } else {
                            dx = 0.0;
                        }
                    }

                    return vec![GraphMutation::MoveNode { id, dx, dy }];
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.dragging = false;
                self.alt_duplicated = false;
                vec![]
            }
            _ => vec![],
        }
    }
}

// ─── Rect Tool ───────────────────────────────────────────────────────────

pub struct RectTool {
    drawing: bool,
    start_x: f32,
    start_y: f32,
    current_id: Option<NodeId>,
}

impl Default for RectTool {
    fn default() -> Self {
        Self::new()
    }
}

impl RectTool {
    pub fn new() -> Self {
        Self {
            drawing: false,
            start_x: 0.0,
            start_y: 0.0,
            current_id: None,
        }
    }
}

impl Tool for RectTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Rect
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.start_x = *x;
                self.start_y = *y;
                let id = NodeId::anonymous();
                self.current_id = Some(id);

                let node = SceneNode::new(
                    id,
                    NodeKind::Rect {
                        width: 0.0,
                        height: 0.0,
                    },
                );
                vec![GraphMutation::AddNode {
                    parent_id: NodeId::intern("root"),
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerMove {
                x, y, modifiers, ..
            } => {
                if self.drawing
                    && let Some(id) = self.current_id
                {
                    let mut w = (x - self.start_x).abs();
                    let mut h = (y - self.start_y).abs();

                    // Shift: constrain to square
                    if modifiers.shift {
                        let side = w.max(h);
                        w = side;
                        h = side;
                    }

                    return vec![GraphMutation::ResizeNode {
                        id,
                        width: w,
                        height: h,
                    }];
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                self.current_id = None;
                vec![]
            }
            _ => vec![],
        }
    }
}

// ─── Pen Tool (freehand) ─────────────────────────────────────────────────

pub struct PenTool {
    drawing: bool,
    points: Vec<(f32, f32)>,
    current_id: Option<NodeId>,
}

impl Default for PenTool {
    fn default() -> Self {
        Self::new()
    }
}

impl PenTool {
    pub fn new() -> Self {
        Self {
            drawing: false,
            points: Vec::new(),
            current_id: None,
        }
    }
}

impl Tool for PenTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Pen
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.points.clear();
                self.points.push((*x, *y));
                let id = NodeId::anonymous();
                self.current_id = Some(id);

                let path = NodeKind::Path {
                    commands: vec![PathCmd::MoveTo(*x, *y)],
                };
                let node = SceneNode::new(id, path);
                vec![GraphMutation::AddNode {
                    parent_id: NodeId::intern("root"),
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerMove { x, y, .. } => {
                if self.drawing {
                    self.points.push((*x, *y));
                    // TODO: Convert accumulated points to smooth path commands
                    // and update the node. For now, just collect points.
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                // TODO: Finalize path — simplify points, create bezier curves
                self.points.clear();
                self.current_id = None;
                vec![]
            }
            _ => vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::{InputEvent, Modifiers};

    #[test]
    fn select_tool_drag() {
        let mut tool = SelectTool::new();
        let target = NodeId::intern("box1");

        // Press on a node
        let mutations = tool.handle(
            &InputEvent::PointerDown {
                x: 100.0,
                y: 100.0,
                pressure: 1.0,
                modifiers: Modifiers::NONE,
            },
            Some(target),
        );
        assert!(mutations.is_empty()); // Press alone doesn't mutate
        assert_eq!(tool.selected, Some(target));

        // Drag
        let mutations = tool.handle(
            &InputEvent::PointerMove {
                x: 110.0,
                y: 105.0,
                pressure: 1.0,
                modifiers: Modifiers::NONE,
            },
            None,
        );
        assert_eq!(mutations.len(), 1);
        match &mutations[0] {
            GraphMutation::MoveNode { id, dx, dy } => {
                assert_eq!(*id, target);
                assert!((dx - 10.0).abs() < 0.01);
                assert!((dy - 5.0).abs() < 0.01);
            }
            _ => panic!("expected MoveNode"),
        }
    }

    #[test]
    fn select_tool_shift_drag_constrains_axis() {
        let mut tool = SelectTool::new();
        let target = NodeId::intern("box_shift");
        let shift = Modifiers {
            shift: true,
            ..Modifiers::NONE
        };

        // Press
        tool.handle(
            &InputEvent::PointerDown {
                x: 0.0,
                y: 0.0,
                pressure: 1.0,
                modifiers: Modifiers::NONE,
            },
            Some(target),
        );

        // Drag diagonally with Shift → constrain to dominant axis (X)
        let mutations = tool.handle(
            &InputEvent::PointerMove {
                x: 30.0,
                y: 10.0,
                pressure: 1.0,
                modifiers: shift,
            },
            None,
        );
        assert_eq!(mutations.len(), 1);
        match &mutations[0] {
            GraphMutation::MoveNode { dx, dy, .. } => {
                assert!((dx - 30.0).abs() < 0.01);
                assert!(dy.abs() < 0.01, "Y should be constrained to 0");
            }
            _ => panic!("expected MoveNode"),
        }
    }

    #[test]
    fn rect_tool_shift_draw_constrains_square() {
        let mut tool = RectTool::new();
        let shift = Modifiers {
            shift: true,
            ..Modifiers::NONE
        };

        // Start drawing
        tool.handle(
            &InputEvent::PointerDown {
                x: 0.0,
                y: 0.0,
                pressure: 1.0,
                modifiers: Modifiers::NONE,
            },
            None,
        );

        // Drag with Shift → square
        let mutations = tool.handle(
            &InputEvent::PointerMove {
                x: 100.0,
                y: 60.0,
                pressure: 1.0,
                modifiers: shift,
            },
            None,
        );
        assert_eq!(mutations.len(), 1);
        match &mutations[0] {
            GraphMutation::ResizeNode { width, height, .. } => {
                assert!(
                    (width - height).abs() < 0.01,
                    "Shift should make it square: w={width}, h={height}"
                );
                assert!((width - 100.0).abs() < 0.01, "Should use the larger dim");
            }
            _ => panic!("expected ResizeNode"),
        }
    }

    #[test]
    fn select_tool_alt_click_produces_duplicate() {
        let mut tool = SelectTool::new();
        let target = NodeId::intern("box_alt");
        let alt = Modifiers {
            alt: true,
            ..Modifiers::NONE
        };

        let mutations = tool.handle(
            &InputEvent::PointerDown {
                x: 50.0,
                y: 50.0,
                pressure: 1.0,
                modifiers: alt,
            },
            Some(target),
        );
        assert_eq!(mutations.len(), 1);
        match &mutations[0] {
            GraphMutation::DuplicateNode { id } => {
                assert_eq!(*id, target);
            }
            _ => panic!("expected DuplicateNode"),
        }
    }
}
