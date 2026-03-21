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

    /// Abandon (cancel) a batch in progress, restoring the text to the
    /// pre-batch snapshot. No undo entry is created. Used by Esc-to-cancel
    /// to revert a drag mid-gesture.
    pub fn abandon_batch(&mut self, engine: &mut SyncEngine) {
        if self.batch_depth == 0 {
            return;
        }
        // Restore the pre-drag text snapshot
        if let Some(text_before) = self.batch_snapshot.take() {
            let _ = engine.set_text(&text_before);
        }
        self.batch_depth = 0;
        self.batch_dirty = false;
    }

    /// Execute a mutation via the sync engine and push to undo stack.
    pub fn execute(&mut self, engine: &mut SyncEngine, mutation: GraphMutation, description: &str) {
        self.execute_with_co_selected(engine, mutation, description, &[]);
    }

    /// Execute a mutation with co-selected context (for multi-node drag).
    /// `co_selected` lists all NodeIds being moved in the same batch so that
    /// descendant propagation skips nodes that have their own MoveNode.
    pub fn execute_with_co_selected(
        &mut self,
        engine: &mut SyncEngine,
        mutation: GraphMutation,
        description: &str,
        co_selected: &[fd_core::id::NodeId],
    ) {
        if self.batch_depth > 0 {
            // Inside a batch: apply the mutation live but don't track it.
            // The snapshot at end_batch() will capture the cumulative effect.
            engine.apply_mutation_with_co_selected(mutation, co_selected);
            self.batch_dirty = true;
            return;
        }

        let inverse = compute_inverse(engine, &mutation);
        engine.apply_mutation_with_co_selected(mutation.clone(), co_selected);

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
    ///
    /// Returns `(description, is_snapshot)`. When `is_snapshot` is true,
    /// the full document was re-parsed via `set_text()` which already
    /// calls `resolve_layout()` — callers should skip a redundant `resolve()`.
    pub fn undo(&mut self, engine: &mut SyncEngine) -> Option<(String, bool)> {
        let cmd = self.undo_stack.pop()?;
        let (desc, is_snapshot) = match &cmd {
            Command::Single {
                inverse,
                description,
                ..
            } => {
                engine.apply_mutation(*inverse.clone());
                (description.clone(), false)
            }
            Command::Snapshot {
                text_before,
                description,
                ..
            } => {
                let _ = engine.set_text(text_before);
                (description.clone(), true)
            }
        };
        self.redo_stack.push(cmd);
        Some((desc, is_snapshot))
    }

    /// Redo the last undone command (or batch snapshot).
    ///
    /// Returns `(description, is_snapshot)`. See `undo()` for details.
    pub fn redo(&mut self, engine: &mut SyncEngine) -> Option<(String, bool)> {
        let cmd = self.redo_stack.pop()?;
        let (desc, is_snapshot) = match &cmd {
            Command::Single {
                forward,
                description,
                ..
            } => {
                engine.apply_mutation(*forward.clone());
                (description.clone(), false)
            }
            Command::Snapshot {
                text_after,
                description,
                ..
            } => {
                let _ = engine.set_text(text_after);
                (description.clone(), true)
            }
        };
        self.undo_stack.push(cmd);
        Some((desc, is_snapshot))
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Push a text snapshot directly for undo support.
    /// Used by JS-driven operations (e.g., paste) that bypass the mutation
    /// system but still need to be undoable.
    pub fn push_snapshot(&mut self, text_before: String, text_after: String, description: &str) {
        if text_before == text_after {
            return;
        }
        let cmd = Command::Snapshot {
            text_before,
            text_after,
            description: description.to_string(),
        };
        self.undo_stack.push(cmd);
        if self.undo_stack.len() > self.max_depth {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();
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
                .map(|n| n.props.clone())
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
                    fd_core::model::NodeKind::Text { content, .. } => Some(content.clone()),
                    _ => None,
                })
                .unwrap_or_default();
            GraphMutation::SetText {
                id: *id,
                content: old_content,
            }
        }
        GraphMutation::SetSpec { id, spec: _ } => {
            let old_spec = engine.graph.get_by_id(*id).and_then(|n| n.spec.clone());
            GraphMutation::SetSpec {
                id: *id,
                spec: old_spec,
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
        GraphMutation::SetStrokeWidth { id, width: _ } => {
            let old_width = engine
                .graph
                .get_by_id(*id)
                .and_then(|n| n.props.stroke.as_ref().map(|s| s.width))
                .unwrap_or(2.5);
            GraphMutation::SetStrokeWidth {
                id: *id,
                width: old_width,
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
        let result = stack.undo(&mut engine);
        assert_eq!(result.as_ref().map(|(d, _)| d.as_str()), Some("Move box"));

        engine.resolve();
        let b2 = engine.current_bounds().get(&idx).unwrap();
        assert!((b2.x - (moved_x - 50.0)).abs() < 0.1);

        // Redo
        let result = stack.redo(&mut engine);
        assert_eq!(result.as_ref().map(|(d, _)| d.as_str()), Some("Move box"));

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
            .props
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
            .props
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
            .props
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
            .props
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
        let result = stack.undo(&mut engine);
        assert!(result.is_some());
        // Batch undo uses snapshot path
        assert!(result.unwrap().1, "batch undo should be a snapshot");
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
        let result = stack.redo(&mut engine);
        assert!(result.is_some());
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

    // ─── Excalidraw-Inspired: Undo/Redo State Machine Tests ────────────────
    // Modeled after Excalidraw's history.test.tsx: comprehensive undo/redo
    // coverage for every mutation type and multi-step chains.

    #[test]
    fn undo_redo_add_remove_node() {
        // Excalidraw: creating a rect then undoing removes it from the scene.
        let input = "rect @existing { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Add a new node
        let new_node = fd_core::model::SceneNode::new(
            NodeId::intern("new_rect"),
            fd_core::model::NodeKind::Rect {
                width: 80.0,
                height: 40.0,
            },
        );
        stack.execute(
            &mut engine,
            GraphMutation::AddNode {
                parent_id: NodeId::intern("root"),
                node: Box::new(new_node),
            },
            "Add rect",
        );
        assert!(engine.graph.get_by_id(NodeId::intern("new_rect")).is_some());

        // Undo → node removed
        let result = stack.undo(&mut engine);
        assert!(result.is_some());
        assert!(engine.graph.get_by_id(NodeId::intern("new_rect")).is_none());
        // Original node still exists
        assert!(engine.graph.get_by_id(NodeId::intern("existing")).is_some());

        // Redo → node re-added
        stack.redo(&mut engine);
        assert!(engine.graph.get_by_id(NodeId::intern("new_rect")).is_some());
    }

    #[test]
    fn undo_redo_set_text_content() {
        // Excalidraw: editing text then undoing reverts the content.
        let input = r#"text @label "Hello" {
  font: "Inter" 400 16
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Verify original content
        let node = engine.graph.get_by_id(NodeId::intern("label")).unwrap();
        if let fd_core::model::NodeKind::Text { content, .. } = &node.kind {
            assert_eq!(content, "Hello");
        }

        // Change text
        stack.execute(
            &mut engine,
            GraphMutation::SetText {
                id: NodeId::intern("label"),
                content: "World".to_string(),
            },
            "Edit text",
        );
        let node = engine.graph.get_by_id(NodeId::intern("label")).unwrap();
        if let fd_core::model::NodeKind::Text { content, .. } = &node.kind {
            assert_eq!(content, "World");
        }

        // Undo → text reverts
        stack.undo(&mut engine);
        let node = engine.graph.get_by_id(NodeId::intern("label")).unwrap();
        if let fd_core::model::NodeKind::Text { content, .. } = &node.kind {
            assert_eq!(content, "Hello");
        }

        // Redo → text changes again
        stack.redo(&mut engine);
        let node = engine.graph.get_by_id(NodeId::intern("label")).unwrap();
        if let fd_core::model::NodeKind::Text { content, .. } = &node.kind {
            assert_eq!(content, "World");
        }
    }

    #[test]
    fn undo_redo_resize_updates_text() {
        // Excalidraw: resizing then undoing reverts dimensions AND text output.
        let input = "rect @box { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Resize
        stack.execute(
            &mut engine,
            GraphMutation::ResizeNode {
                id: NodeId::intern("box"),
                width: 300.0,
                height: 200.0,
            },
            "Resize box",
        );
        engine.flush_to_text();
        assert!(engine.text.contains("300"));
        assert!(engine.text.contains("200"));

        // Undo → dimensions revert
        stack.undo(&mut engine);
        engine.flush_to_text();
        let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
        match &node.kind {
            fd_core::model::NodeKind::Rect { width, height } => {
                assert_eq!(*width, 100.0);
                assert_eq!(*height, 50.0);
            }
            _ => panic!("expected Rect"),
        }
    }

    #[test]
    fn undo_redo_multi_step_chain() {
        // Excalidraw: 3 sequential operations → undo all → redo all.
        // Verifies the undo stack correctly reverses a chain of operations.
        let input = "rect @a { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Step 1: Move
        stack.execute(
            &mut engine,
            GraphMutation::MoveNode {
                id: NodeId::intern("a"),
                dx: 50.0,
                dy: 30.0,
            },
            "move",
        );

        // Step 2: Resize
        stack.execute(
            &mut engine,
            GraphMutation::ResizeNode {
                id: NodeId::intern("a"),
                width: 200.0,
                height: 100.0,
            },
            "resize",
        );

        // Step 3: Change style
        let mut new_style = engine
            .graph
            .get_by_id(NodeId::intern("a"))
            .unwrap()
            .props
            .clone();
        new_style.fill = Some(fd_core::model::Paint::Solid(fd_core::model::Color {
            r: 0.0,
            g: 0.0,
            b: 1.0,
            a: 1.0,
        }));
        stack.execute(
            &mut engine,
            GraphMutation::SetStyle {
                id: NodeId::intern("a"),
                style: new_style,
            },
            "style",
        );

        // Undo all 3
        assert_eq!(
            stack.undo(&mut engine).map(|(d, _)| d),
            Some("style".to_string())
        );
        assert_eq!(
            stack.undo(&mut engine).map(|(d, _)| d),
            Some("resize".to_string())
        );
        assert_eq!(
            stack.undo(&mut engine).map(|(d, _)| d),
            Some("move".to_string())
        );
        assert!(!stack.can_undo());

        // Redo all 3
        assert_eq!(
            stack.redo(&mut engine).map(|(d, _)| d),
            Some("move".to_string())
        );
        assert_eq!(
            stack.redo(&mut engine).map(|(d, _)| d),
            Some("resize".to_string())
        );
        assert_eq!(
            stack.redo(&mut engine).map(|(d, _)| d),
            Some("style".to_string())
        );
        assert!(!stack.can_redo());
    }

    #[test]
    fn push_snapshot_undo_restores_text() {
        // Tests the JS-driven snapshot path (used by paste operations).
        let text_before = "rect @box { w: 100 h: 50 }\n";
        let text_after = "rect @box { w: 100 h: 50 }\nrect @pasted { w: 80 h: 40 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(text_after, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Push a snapshot (simulates paste)
        stack.push_snapshot(text_before.to_string(), text_after.to_string(), "paste");

        // Undo → text reverts to before paste
        let result = stack.undo(&mut engine);
        assert!(result.is_some());
        let (desc, is_snapshot) = result.unwrap();
        assert_eq!(desc, "paste");
        assert!(is_snapshot);

        // The engine should now have text_before content
        assert!(engine.graph.get_by_id(NodeId::intern("box")).is_some());
        assert!(engine.graph.get_by_id(NodeId::intern("pasted")).is_none());
    }

    #[test]
    fn undo_redo_group_ungroup() {
        // Excalidraw: grouping nodes then undoing dissolves the group.
        let input = "rect @a { x: 0 y: 0 w: 40 h: 30 }\nrect @b { x: 50 y: 0 w: 40 h: 30 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Group @a and @b
        stack.execute(
            &mut engine,
            GraphMutation::GroupNodes {
                ids: vec![NodeId::intern("a"), NodeId::intern("b")],
                new_group_id: NodeId::intern("grp"),
            },
            "group",
        );
        assert!(engine.graph.get_by_id(NodeId::intern("grp")).is_some());

        // Undo → group dissolved (UngroupNode is the inverse)
        stack.undo(&mut engine);
        assert!(
            engine.graph.get_by_id(NodeId::intern("grp")).is_none(),
            "group should be dissolved after undo"
        );
        // Nodes should still exist
        assert!(engine.graph.get_by_id(NodeId::intern("a")).is_some());
        assert!(engine.graph.get_by_id(NodeId::intern("b")).is_some());

        // Redo → group recreated
        stack.redo(&mut engine);
        assert!(engine.graph.get_by_id(NodeId::intern("grp")).is_some());
    }

    #[test]
    fn abandon_batch_restores_position() {
        let input = "rect @box { w: 100 h: 50 }\n";
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let mut stack = CommandStack::new(100);

        // Capture original position
        let idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
        let orig_x = engine.current_bounds().get(&idx).unwrap().x;
        let orig_y = engine.current_bounds().get(&idx).unwrap().y;

        // Simulate a drag gesture: begin_batch, 3 moves
        stack.begin_batch(&mut engine);
        for _ in 0..3 {
            stack.execute(
                &mut engine,
                GraphMutation::MoveNode {
                    id: NodeId::intern("box"),
                    dx: 20.0,
                    dy: 10.0,
                },
                "drag",
            );
        }

        // Abandon instead of ending — simulates Esc mid-drag
        stack.abandon_batch(&mut engine);
        engine.resolve();

        // Position should be restored to original
        let b = engine.current_bounds().get(&idx).unwrap();
        assert!(
            (b.x - orig_x).abs() < 1.0,
            "x should be near {}, got {}",
            orig_x,
            b.x
        );
        assert!(
            (b.y - orig_y).abs() < 1.0,
            "y should be near {}, got {}",
            orig_y,
            b.y
        );

        // No undo entry should have been created
        assert!(!stack.can_undo());
    }
}
