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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
}
