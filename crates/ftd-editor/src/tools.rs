//! Tool system for canvas interactions.
//!
//! Each tool translates user input events into `GraphMutation` commands
//! that are applied via the `SyncEngine`.

use crate::input::InputEvent;
use crate::sync::GraphMutation;
use ftd_core::id::NodeId;
use ftd_core::model::*;

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
        }
    }
}

impl Tool for SelectTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Select
    }

    fn handle(&mut self, event: &InputEvent, hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.selected = hit_node;
                self.dragging = self.selected.is_some();
                self.last_x = *x;
                self.last_y = *y;
                vec![]
            }
            InputEvent::PointerMove { x, y, .. } => {
                if self.dragging {
                    if let Some(id) = self.selected {
                        let dx = x - self.last_x;
                        let dy = y - self.last_y;
                        self.last_x = *x;
                        self.last_y = *y;
                        return vec![GraphMutation::MoveNode { id, dx, dy }];
                    }
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.dragging = false;
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
            InputEvent::PointerMove { x, y, .. } => {
                if self.drawing {
                    if let Some(id) = self.current_id {
                        let w = (x - self.start_x).abs();
                        let h = (y - self.start_y).abs();
                        return vec![GraphMutation::ResizeNode {
                            id,
                            width: w,
                            height: h,
                        }];
                    }
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
    use crate::input::InputEvent;

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
}
