//! Undo/Redo command stack.
//!
//! Every mutation is wrapped in a reversible `Command` that can be undone.
//! Commands are pushed to a stack; undo pops and applies the inverse.
//!
//! Drag gestures use **text-snapshot batching**: the full text is captured
//! at the start and end of the gesture, so undo/redo replaces the whole
//! document in a single step (no per-mutation inverse chain).

use crate::sync::{GraphMutation, SyncEngine};

/// A command that captures both a forward mutation and its inverse.
/// May hold a single mutation or a batch of mutations (from drag gestures).
#[derive(Debug, Clone)]
pub enum Command {
    /// Single mutation with its inverse (for non-batch operations).
    Single {
        forward: Box<GraphMutation>,
        inverse: Box<GraphMutation>,
        description: String,
    },
    /// Snapshot-based batch: captures full text before and after a gesture.
    Snapshot {
        text_before: String,
        text_after: String,
        description: String,
    },
}

/// Manages undo/redo stacks with batch grouping for drag gestures.
pub struct CommandStack {
    undo_stack: Vec<Command>,
    redo_stack: Vec<Command>,
    /// Maximum undo depth.
    max_depth: usize,
    /// Batch nesting depth (0 = not batching).
    batch_depth: usize,
    /// Text snapshot captured at the start of a batch.
    batch_snapshot: Option<String>,
    /// Whether any mutations occurred during the current batch.
    batch_dirty: bool,
}

impl CommandStack {
    pub fn new(max_depth: usize) -> Self {
        Self {
            undo_stack: Vec::with_capacity(max_depth),
            redo_stack: Vec::new(),
            max_depth,
            batch_depth: 0,
            batch_snapshot: None,
            batch_dirty: false,
        }
    }

    /// Start a batch group. Captures the current text as a snapshot
    /// for undo. All mutations until `end_batch()` are applied live
    /// but tracked as one atomic undo step.
    pub fn begin_batch(&mut self, engine: &mut SyncEngine) {
        if self.batch_depth == 0 {
            self.batch_snapshot = Some(engine.current_text().to_string());
            self.batch_dirty = false;
        }
        self.batch_depth += 1;
    }

    /// End a batch group. When the outermost batch closes, if any
    /// mutations occurred, push one snapshot command to the undo stack.
    pub fn end_batch(&mut self, engine: &mut SyncEngine) {
        if self.batch_depth == 0 {
            return;
        }
        self.batch_depth -= 1;
        if self.batch_depth == 0 {
            if self.batch_dirty {
                // Flush text so snapshot_after reflects final state
                engine.flush_to_text();
                let text_after = engine.current_text().to_string();
                let text_before = self.batch_snapshot.take().unwrap_or_default();

                // Only push if text actually changed
                if text_before != text_after {
                    let cmd = Command::Snapshot {
                        text_before,
                        text_after,
                        description: "canvas edit".to_string(),
                    };
                    self.undo_stack.push(cmd);
                    if self.undo_stack.len() > self.max_depth {
                        self.undo_stack.remove(0);
                    }
                    self.redo_stack.clear();
                }
            }
            self.batch_snapshot = None;
            self.batch_dirty = false;
        }
    }

    /// Execute a mutation via the sync engine and push to undo stack.
    pub fn execute(&mut self, engine: &mut SyncEngine, mutation: GraphMutation, description: &str) {
        if self.batch_depth > 0 {
            // Inside a batch: apply the mutation live but don't track it.
            // The snapshot at end_batch() will capture the cumulative effect.
            engine.apply_mutation(mutation);
            self.batch_dirty = true;
            return;
        }

        let inverse = compute_inverse(engine, &mutation);
        engine.apply_mutation(mutation.clone());

        let cmd = Command::Single {
            forward: Box::new(mutation),
            inverse: Box::new(inverse),
            description: description.to_string(),
        };

        self.undo_stack.push(cmd);
        if self.undo_stack.len() > self.max_depth {
            self.undo_stack.remove(0);
        }

        // Clear redo stack on new action
        self.redo_stack.clear();
    }

    /// Undo the last command (or batch snapshot).
    pub fn undo(&mut self, engine: &mut SyncEngine) -> Option<String> {
        let cmd = self.undo_stack.pop()?;
        let desc = match &cmd {
            Command::Single {
                inverse,
                description,
                ..
            } => {
                engine.apply_mutation(*inverse.clone());
                description.clone()
            }
            Command::Snapshot {
                text_before,
                description,
                ..
            } => {
                let _ = engine.set_text(text_before);
                description.clone()
            }
        };
        self.redo_stack.push(cmd);
        Some(desc)
    }

    /// Redo the last undone command (or batch snapshot).
    pub fn redo(&mut self, engine: &mut SyncEngine) -> Option<String> {
        let cmd = self.redo_stack.pop()?;
        let desc = match &cmd {
            Command::Single {
                forward,
                description,
                ..
            } => {
                engine.apply_mutation(*forward.clone());
                description.clone()
            }
            Command::Snapshot {
                text_after,
                description,
                ..
            } => {
                let _ = engine.set_text(text_after);
                description.clone()
            }
        };
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
        GraphMutation::SetAnimations { id, animations: _ } => {
            let old_animations = engine
                .graph
                .get_by_id(*id)
                .map(|n| n.animations.clone())
                .unwrap_or_default();
            GraphMutation::SetAnimations {
                id: *id,
                animations: old_animations,
            }
        }
        GraphMutation::AddEdge { edge } => GraphMutation::RemoveEdge { id: edge.id },
        GraphMutation::RemoveEdge { id } => {
            if let Some(edge) = engine.graph.edges.iter().find(|e| e.id == *id) {
                GraphMutation::AddEdge {
                    edge: Box::new(edge.clone()),
                }
            } else {
                GraphMutation::RemoveEdge { id: *id }
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

        let idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
        let b = engine.current_bounds().get(&idx).unwrap();
        let moved_x = b.x;

        // Undo
        let desc = stack.undo(&mut engine);
        assert_eq!(desc, Some("Move box".to_string()));

        engine.resolve();
        let b2 = engine.current_bounds().get(&idx).unwrap();
        assert!((b2.x - (moved_x - 50.0)).abs() < 0.1);

        // Redo
        let desc = stack.redo(&mut engine);
        assert_eq!(desc, Some("Move box".to_string()));

        engine.resolve();
        let b3 = engine.current_bounds().get(&idx).unwrap();
        assert!((b3.x - moved_x).abs() < 0.1);
    }

    #[test]
    fn redo_clears_on_new_action() {
        let input = "rect @a { w: 10 h: 10 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        stack.execute(
            &mut engine,
            GraphMutation::MoveNode {
                id: NodeId::intern("a"),
                dx: 5.0,
                dy: 0.0,
            },
            "move",
        );
        stack.undo(&mut engine);
        assert!(stack.can_redo());

        // New action clears redo
        stack.execute(
            &mut engine,
            GraphMutation::MoveNode {
                id: NodeId::intern("a"),
                dx: 1.0,
                dy: 0.0,
            },
            "move2",
        );
        assert!(!stack.can_redo());
    }

    #[test]
    fn max_depth_trims_oldest() {
        let input = "rect @a { w: 10 h: 10 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(3);

        for i in 0..5 {
            stack.execute(
                &mut engine,
                GraphMutation::MoveNode {
                    id: NodeId::intern("a"),
                    dx: (i + 1) as f32,
                    dy: 0.0,
                },
                "move",
            );
        }
        // Only 3 entries remain
        let mut undo_count = 0;
        while stack.undo(&mut engine).is_some() {
            undo_count += 1;
        }
        assert_eq!(undo_count, 3);
    }

    #[test]
    fn remove_add_roundtrip() {
        let input = r#"
rect @box {
  w: 40
  h: 20
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Remove node
        stack.execute(
            &mut engine,
            GraphMutation::RemoveNode {
                id: NodeId::intern("box"),
            },
            "Delete box",
        );
        assert!(engine.graph.get_by_id(NodeId::intern("box")).is_none());

        // Undo → should re-add
        stack.undo(&mut engine);
        assert!(engine.graph.get_by_id(NodeId::intern("box")).is_some());
    }

    #[test]
    fn set_style_roundtrip() {
        let input = "rect @r { w: 10 h: 10 fill: #FF0000 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Capture original fill hex
        let old_hex = match &engine
            .graph
            .get_by_id(NodeId::intern("r"))
            .unwrap()
            .style
            .fill
        {
            Some(fd_core::model::Paint::Solid(c)) => c.to_hex(),
            _ => String::new(),
        };
        assert_eq!(old_hex, "#FF0000");

        let mut new_style = engine
            .graph
            .get_by_id(NodeId::intern("r"))
            .unwrap()
            .style
            .clone();
        new_style.fill = Some(fd_core::model::Paint::Solid(fd_core::model::Color {
            r: 0.0,
            g: 1.0,
            b: 0.0,
            a: 1.0,
        }));

        stack.execute(
            &mut engine,
            GraphMutation::SetStyle {
                id: NodeId::intern("r"),
                style: new_style,
            },
            "change fill",
        );

        let current_hex = match &engine
            .graph
            .get_by_id(NodeId::intern("r"))
            .unwrap()
            .style
            .fill
        {
            Some(fd_core::model::Paint::Solid(c)) => c.to_hex(),
            _ => String::new(),
        };
        assert_eq!(current_hex, "#00FF00");

        stack.undo(&mut engine);
        let restored_hex = match &engine
            .graph
            .get_by_id(NodeId::intern("r"))
            .unwrap()
            .style
            .fill
        {
            Some(fd_core::model::Paint::Solid(c)) => c.to_hex(),
            _ => String::new(),
        };
        assert_eq!(restored_hex, "#FF0000");
    }

    #[test]
    fn batch_undo_is_single_step() {
        let input = "rect @box { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Simulate a drag gesture: begin_batch, 5 moves, end_batch
        stack.begin_batch(&mut engine);
        for _ in 0..5 {
            stack.execute(
                &mut engine,
                GraphMutation::MoveNode {
                    id: NodeId::intern("box"),
                    dx: 10.0,
                    dy: 5.0,
                },
                "drag",
            );
        }
        stack.end_batch(&mut engine);

        // One undo should reverse the entire gesture
        let desc = stack.undo(&mut engine);
        assert!(desc.is_some());
        engine.resolve();

        // Verify position is back to start
        let idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
        let b = engine.current_bounds().get(&idx).unwrap();
        // After parse, default position is (0, 0) since no x:/y: specified
        assert!(b.x.abs() < 1.0, "x should be near 0, got {}", b.x);
        assert!(b.y.abs() < 1.0, "y should be near 0, got {}", b.y);

        // No more undo steps
        assert!(!stack.can_undo());
    }

    #[test]
    fn batch_redo_reapplies_all() {
        let input = "rect @box { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Simulate a drag gesture
        stack.begin_batch(&mut engine);
        for _ in 0..5 {
            stack.execute(
                &mut engine,
                GraphMutation::MoveNode {
                    id: NodeId::intern("box"),
                    dx: 10.0,
                    dy: 5.0,
                },
                "drag",
            );
        }
        stack.end_batch(&mut engine);

        // Undo + Redo
        stack.undo(&mut engine);
        engine.resolve();
        let desc = stack.redo(&mut engine);
        assert!(desc.is_some());
        engine.resolve();

        // Verify position is at the dragged location
        let idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
        let b = engine.current_bounds().get(&idx).unwrap();
        assert!((b.x - 50.0).abs() < 1.0, "x should be near 50, got {}", b.x);
        assert!((b.y - 25.0).abs() < 1.0, "y should be near 25, got {}", b.y);
    }

    #[test]
    fn empty_batch_no_undo_entry() {
        let input = "rect @box { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // A batch where nothing happens should not push an undo entry
        stack.begin_batch(&mut engine);
        stack.end_batch(&mut engine);

        assert!(!stack.can_undo());
    }
}
