//! Undo/Redo command stack.
//!
//! Every mutation is wrapped in a reversible `Command` that can be undone.
//! Commands are pushed to a stack; undo pops and applies the inverse.

use crate::sync::{GraphMutation, SyncEngine};

/// A command that captures both a forward mutation and its inverse.
#[derive(Debug, Clone)]
pub struct Command {
    /// The forward mutation.
    pub forward: GraphMutation,
    /// The inverse mutation (computed at apply time).
    pub inverse: GraphMutation,
    /// Human-readable description for UI display.
    pub description: String,
}

/// Manages undo/redo stacks.
pub struct CommandStack {
    undo_stack: Vec<Command>,
    redo_stack: Vec<Command>,
    /// Maximum undo depth.
    max_depth: usize,
}

impl CommandStack {
    pub fn new(max_depth: usize) -> Self {
        Self {
            undo_stack: Vec::with_capacity(max_depth),
            redo_stack: Vec::new(),
            max_depth,
        }
    }

    /// Execute a mutation via the sync engine and push to undo stack.
    pub fn execute(&mut self, engine: &mut SyncEngine, mutation: GraphMutation, description: &str) {
        let inverse = compute_inverse(engine, &mutation);
        engine.apply_mutation(mutation.clone());

        let cmd = Command {
            forward: mutation,
            inverse,
            description: description.to_string(),
        };

        self.undo_stack.push(cmd);
        if self.undo_stack.len() > self.max_depth {
            self.undo_stack.remove(0);
        }

        // Clear redo stack on new action
        self.redo_stack.clear();
    }

    /// Undo the last command.
    pub fn undo(&mut self, engine: &mut SyncEngine) -> Option<String> {
        let cmd = self.undo_stack.pop()?;
        let desc = cmd.description.clone();
        engine.apply_mutation(cmd.inverse.clone());
        self.redo_stack.push(cmd);
        Some(desc)
    }

    /// Redo the last undone command.
    pub fn redo(&mut self, engine: &mut SyncEngine) -> Option<String> {
        let cmd = self.redo_stack.pop()?;
        let desc = cmd.description.clone();
        engine.apply_mutation(cmd.forward.clone());
        self.undo_stack.push(cmd);
        Some(desc)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}

/// Compute the inverse mutation needed to undo `mutation`.
fn compute_inverse(engine: &SyncEngine, mutation: &GraphMutation) -> GraphMutation {
    match mutation {
        GraphMutation::MoveNode { id, dx, dy } => GraphMutation::MoveNode {
            id: *id,
            dx: -dx,
            dy: -dy,
        },
        GraphMutation::ResizeNode {
            id,
            width: _,
            height: _,
        } => {
            // Capture current size before mutation
            let (old_w, old_h) = engine
                .graph
                .get_by_id(*id)
                .map(|n| match &n.kind {
                    fd_core::model::NodeKind::Rect { width, height } => (*width, *height),
                    fd_core::model::NodeKind::Ellipse { rx, ry } => (*rx * 2.0, *ry * 2.0),
                    fd_core::model::NodeKind::Frame { width, height, .. } => (*width, *height),
                    _ => (0.0, 0.0),
                })
                .unwrap_or((0.0, 0.0));

            GraphMutation::ResizeNode {
                id: *id,
                width: old_w,
                height: old_h,
            }
        }
        GraphMutation::RemoveNode { id } => {
            // Capture the node and its actual parent before removal for undo
            if let Some(node) = engine.graph.get_by_id(*id) {
                let parent_id = engine.parent_of(*id);
                GraphMutation::AddNode {
                    parent_id,
                    node: Box::new(node.clone()),
                }
            } else {
                GraphMutation::RemoveNode { id: *id }
            }
        }
        GraphMutation::AddNode { parent_id: _, node } => GraphMutation::RemoveNode { id: node.id },
        GraphMutation::SetStyle { id, style: _ } => {
            let old_style = engine
                .graph
                .get_by_id(*id)
                .map(|n| n.style.clone())
                .unwrap_or_default();
            GraphMutation::SetStyle {
                id: *id,
                style: old_style,
            }
        }
        GraphMutation::SetText { id, content: _ } => {
            let old_content = engine
                .graph
                .get_by_id(*id)
                .and_then(|n| match &n.kind {
                    fd_core::model::NodeKind::Text { content } => Some(content.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            GraphMutation::SetText {
                id: *id,
                content: old_content,
            }
        }
        GraphMutation::SetAnnotations { id, annotations: _ } => {
            let old_annotations = engine
                .graph
                .get_by_id(*id)
                .map(|n| n.annotations.clone())
                .unwrap_or_default();
            GraphMutation::SetAnnotations {
                id: *id,
                annotations: old_annotations,
            }
        }
        // DuplicateNode creates a new anonymous node — we can't know its
        // ID until after execution, so we RemoveNode with the original ID.
        // The actual undo logic removes the last child of the parent.
        GraphMutation::DuplicateNode { id } => GraphMutation::RemoveNode { id: *id },
        // UpdatePath: capture current commands before overwriting.
        GraphMutation::UpdatePath { id, commands: _ } => {
            let old_commands = engine
                .graph
                .get_by_id(*id)
                .and_then(|n| match &n.kind {
                    fd_core::model::NodeKind::Path { commands } => Some(commands.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            GraphMutation::UpdatePath {
                id: *id,
                commands: old_commands,
            }
        }
        GraphMutation::GroupNodes { new_group_id, .. } => {
            GraphMutation::UngroupNode { id: *new_group_id }
        }
        GraphMutation::UngroupNode { id } => {
            // To properly undo an Ungroup, we re-group the nodes
            // that were children of the ungrouped node.
            let mut children_ids = vec![];
            if let Some(group_idx) = engine.graph.index_of(*id) {
                for child_idx in engine.graph.children(group_idx) {
                    children_ids.push(engine.graph.graph[child_idx].id);
                }
            }
            GraphMutation::GroupNodes {
                ids: children_ids,
                new_group_id: *id,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fd_core::id::NodeId;
    use fd_core::layout::Viewport;

    #[test]
    fn undo_redo_move() {
        let input = r#"
rect @box {
  w: 100
  h: 50
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Move
        stack.execute(
            &mut engine,
            GraphMutation::MoveNode {
                id: NodeId::intern("box"),
                dx: 50.0,
                dy: 30.0,
            },
            "Move box",
        );

        assert!(stack.can_undo());
        assert!(!stack.can_redo());

        // Undo
        stack.undo(&mut engine);
        assert!(!stack.can_undo());
        assert!(stack.can_redo());

        // Redo
        stack.redo(&mut engine);
        assert!(stack.can_undo());
        assert!(!stack.can_redo());
    }

    #[test]
    fn undo_redo_group_move() {
        let input = r#"
rect @b1 {
  x: 10
  y: 10
  w: 20
  h: 20
}
rect @b2 {
  x: 50
  y: 50
  w: 20
  h: 20
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(10);

        let group_id = NodeId::intern("my_group");
        stack.execute(
            &mut engine,
            GraphMutation::GroupNodes {
                ids: vec![NodeId::intern("b1"), NodeId::intern("b2")],
                new_group_id: group_id,
            },
            "Group nodes",
        );

        assert!(engine.current_text().contains("group @my_group"));
        let root = engine.graph.index_of(NodeId::intern("root")).unwrap();
        assert_eq!(engine.graph.children(root).len(), 1); // Only the group

        stack.undo(&mut engine);
        assert!(!engine.current_text().contains("group @my_group"));
        assert_eq!(engine.graph.children(root).len(), 2); // Unpacked back to root

        stack.redo(&mut engine);
        assert!(engine.current_text().contains("group @my_group"));
        assert_eq!(engine.graph.children(root).len(), 1); // Grouped again

        stack.execute(
            &mut engine,
            GraphMutation::MoveNode {
                id: group_id,
                dx: 50.0,
                dy: 50.0,
            },
            "Move group",
        );

        assert!(stack.can_undo());

        // Undo Move
        stack.undo(&mut engine);
        // Undo Group
        stack.undo(&mut engine);

        let text = engine.current_text();
        assert!(!text.contains("group @my_group"));
        assert!(text.contains("rect @b1"));
        assert!(text.contains("-> absolute: 10, 10"));
    }

    #[test]
    fn undo_resize_restores_original_size() {
        let input = "rect @panel {\n  w: 200 h: 100\n}\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        stack.execute(
            &mut engine,
            GraphMutation::ResizeNode {
                id: NodeId::intern("panel"),
                width: 400.0,
                height: 200.0,
            },
            "Resize panel",
        );

        // After undo the node should have its original dimensions
        stack.undo(&mut engine);
        let node = engine.graph.get_by_id(NodeId::intern("panel")).unwrap();
        match &node.kind {
            fd_core::model::NodeKind::Rect { width, height } => {
                assert_eq!(*width, 200.0, "width should revert to 200");
                assert_eq!(*height, 100.0, "height should revert to 100");
            }
            other => panic!("expected Rect, got {other:?}"),
        }
    }

    #[test]
    fn undo_set_style_restores_original_fill() {
        use fd_core::model::{Color, Paint, Style};
        let input = "rect @btn {\n  w: 80 h: 40\n  fill: #FF0000\n}\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        let new_style = Style {
            fill: Some(Paint::Solid(Color {
                r: 0.0,
                g: 0.0,
                b: 1.0,
                a: 1.0,
            })),
            ..Style::default()
        };

        stack.execute(
            &mut engine,
            GraphMutation::SetStyle {
                id: NodeId::intern("btn"),
                style: new_style,
            },
            "Restyle btn",
        );

        // After undo fill should be back to red (#FF0000)
        stack.undo(&mut engine);
        let node = engine.graph.get_by_id(NodeId::intern("btn")).unwrap();
        match node.style.fill.as_ref().and_then(|p| {
            if let Paint::Solid(c) = p {
                Some(c)
            } else {
                None
            }
        }) {
            Some(c) => assert_eq!(c.r, 1.0, "red channel should be 1.0 (original red fill)"),
            None => panic!("fill should be Some(Solid) after undo"),
        }
    }

    #[test]
    fn new_execute_clears_redo_stack() {
        let input = "rect @box {\n  w: 100 h: 50\n}\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        let move_box = || GraphMutation::MoveNode {
            id: NodeId::intern("box"),
            dx: 10.0,
            dy: 0.0,
        };

        stack.execute(&mut engine, move_box(), "Move 1");
        stack.undo(&mut engine); // populate redo stack

        assert!(stack.can_redo(), "redo should be available after undo");

        // New action should clear redo stack
        stack.execute(&mut engine, move_box(), "Move 2");
        assert!(
            !stack.can_redo(),
            "redo stack should be cleared after new execute"
        );
    }

    #[test]
    fn stack_respects_max_depth() {
        let input = "rect @box {\n  w: 100 h: 50\n}\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let max = 3;
        let mut stack = CommandStack::new(max);

        // Execute more commands than max_depth
        for i in 0..5u32 {
            stack.execute(
                &mut engine,
                GraphMutation::MoveNode {
                    id: NodeId::intern("box"),
                    dx: i as f32,
                    dy: 0.0,
                },
                &format!("Move {i}"),
            );
        }

        // Can undo at most max times
        let mut undo_count = 0;
        while stack.can_undo() {
            stack.undo(&mut engine);
            undo_count += 1;
        }
        assert_eq!(undo_count, max, "undo depth should be capped at max_depth");
    }
}
