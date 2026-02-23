//! Bidirectional sync engine: canvas ↔ FD text.
//!
//! The sync engine is the heart of bidirectional editing:
//!
//! - **Canvas → Text**: When the user manipulates nodes on the canvas (drag,
//!   resize, draw), the engine updates the in-memory `SceneGraph` and then
//!   incrementally re-emits only the affected text region. This avoids
//!   re-serializing the entire document on every drag frame.
//!
//! - **Text → Canvas**: When the user edits the `.fd` source text, the engine
//!   incrementally re-parses only the changed lines, diffs against the current
//!   graph, and applies minimal mutations. This avoids a full re-parse on every
//!   keystroke.

use fd_core::NodeIndex;
use fd_core::emitter::emit_document;
use fd_core::id::NodeId;
use fd_core::model::*;
use fd_core::parser::parse_document;
use fd_core::{ResolvedBounds, Viewport, resolve_layout};
use std::collections::HashMap;

/// The sync engine holds the authoritative scene graph and keeps text + canvas
/// in sync.
pub struct SyncEngine {
    /// The current scene graph (single source of truth).
    pub graph: SceneGraph,

    /// The current text representation (kept in sync with graph).
    pub text: String,

    /// Resolved layout bounds (recomputed after mutations).
    pub bounds: HashMap<NodeIndex, ResolvedBounds>,

    /// Canvas viewport dimensions.
    pub viewport: Viewport,

    /// Dirty flag: set when graph changes and text needs re-emit.
    text_dirty: bool,

    /// Dirty flag: set when text changes and graph needs re-parse.
    graph_dirty: bool,
}

impl SyncEngine {
    /// Create a new sync engine from FD source text.
    pub fn from_text(text: &str, viewport: Viewport) -> Result<Self, String> {
        let graph = parse_document(text)?;
        let bounds = resolve_layout(&graph, viewport);
        let canonical_text = emit_document(&graph);

        Ok(Self {
            graph,
            text: canonical_text,
            bounds,
            viewport,
            text_dirty: false,
            graph_dirty: false,
        })
    }

    /// Create a new empty sync engine.
    pub fn new(viewport: Viewport) -> Self {
        let graph = SceneGraph::new();
        let bounds = resolve_layout(&graph, viewport);
        let text = emit_document(&graph);

        Self {
            graph,
            text,
            bounds,
            viewport,
            text_dirty: false,
            graph_dirty: false,
        }
    }

    // ─── Canvas → Text direction ─────────────────────────────────────────

    /// Apply a graph mutation from canvas interaction, then re-sync text.
    /// This is the hot path during drag/draw — must be fast.
    pub fn apply_mutation(&mut self, mutation: GraphMutation) {
        match mutation {
            GraphMutation::MoveNode { id, dx, dy } => {
                if let Some(idx) = self.graph.index_of(id) {
                    if let Some(bounds) = self.bounds.get_mut(&idx) {
                        bounds.x += dx;
                        bounds.y += dy;
                    }
                    // Update constraint to Absolute (pinning the moved position)
                    if let Some(node) = self.graph.get_by_id_mut(id) {
                        let pos = self
                            .bounds
                            .get(&idx)
                            .map(|b| (b.x, b.y))
                            .unwrap_or((0.0, 0.0));
                        // Replace or add an Absolute constraint
                        node.constraints
                            .retain(|c| !matches!(c, Constraint::Absolute { .. }));
                        node.constraints
                            .push(Constraint::Absolute { x: pos.0, y: pos.1 });
                    }
                }
            }
            GraphMutation::ResizeNode { id, width, height } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    match &mut node.kind {
                        NodeKind::Rect {
                            width: w,
                            height: h,
                        } => {
                            *w = width;
                            *h = height;
                        }
                        NodeKind::Ellipse { rx, ry } => {
                            *rx = width / 2.0;
                            *ry = height / 2.0;
                        }
                        NodeKind::Frame {
                            width: w,
                            height: h,
                            ..
                        } => {
                            *w = width;
                            *h = height;
                        }
                        _ => {}
                    }
                }
            }
            GraphMutation::AddNode { parent_id, node } => {
                let parent_idx = self.graph.index_of(parent_id).unwrap_or(self.graph.root);
                // Extract positioning info before moving node into graph
                let abs_pos = node.constraints.iter().find_map(|c| match c {
                    Constraint::Absolute { x, y } => Some((*x, *y)),
                    _ => None,
                });
                let (w, h) = match &node.kind {
                    NodeKind::Rect { width, height } => (*width, *height),
                    NodeKind::Ellipse { rx, ry } => (rx * 2.0, ry * 2.0),
                    NodeKind::Frame { width, height, .. } => (*width, *height),
                    _ => (0.0, 0.0),
                };
                let idx = self.graph.add_node(parent_idx, *node);
                // Insert bounds for only the new node (don't re-resolve all nodes)
                if let Some((x, y)) = abs_pos {
                    self.bounds.insert(
                        idx,
                        ResolvedBounds {
                            x,
                            y,
                            width: w,
                            height: h,
                        },
                    );
                }
            }
            GraphMutation::RemoveNode { id } => {
                if let Some(idx) = self.graph.index_of(id) {
                    self.graph.graph.remove_node(idx);
                    self.graph.id_index.remove(&id);
                    self.bounds.remove(&idx);
                }
            }
            GraphMutation::SetStyle { id, style } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    node.style = style;
                }
            }
            GraphMutation::SetText { id, content } => {
                if let Some(node) = self.graph.get_by_id_mut(id)
                    && let NodeKind::Text { content: ref mut c } = node.kind
                {
                    *c = content;
                }
            }
            GraphMutation::SetAnnotations { id, annotations } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    node.annotations = annotations;
                }
            }
            GraphMutation::DuplicateNode { id } => {
                if let Some(original) = self.graph.get_by_id(id).cloned() {
                    let new_id = NodeId::anonymous();
                    let mut cloned = original;
                    cloned.id = new_id;
                    // Offset via constraint
                    cloned.constraints.push(Constraint::Offset {
                        from: id,
                        dx: 20.0,
                        dy: 20.0,
                    });
                    self.graph.add_node(self.graph.root, cloned);
                }
            }
            GraphMutation::UpdatePath { id, commands } => {
                if let Some(node) = self.graph.get_by_id_mut(id)
                    && let NodeKind::Path {
                        commands: ref mut cmds,
                    } = node.kind
                {
                    *cmds = commands;
                }
            }
            GraphMutation::GroupNodes { ids, new_group_id } => {
                if ids.is_empty() { return; }
                
                let first_idx = match self.graph.index_of(ids[0]) {
                    Some(idx) => idx,
                    None => return,
                };
                let parent_idx = self.graph.parent(first_idx).unwrap_or(self.graph.root);

                // Compute min bounding box of all selected nodes
                let mut min_x = f32::MAX;
                let mut min_y = f32::MAX;
                for &id in &ids {
                    if let Some(idx) = self.graph.index_of(id) {
                        if let Some(b) = self.bounds.get(&idx) {
                            min_x = min_x.min(b.x);
                            min_y = min_y.min(b.y);
                        }
                    }
                }
                
                let parent_offset = if let Some(p_bounds) = self.bounds.get(&parent_idx) {
                    (p_bounds.x, p_bounds.y)
                } else {
                    (0.0, 0.0)
                };

                // The group's relative origin within its parent
                let rel_group_x = min_x - parent_offset.0;
                let rel_group_y = min_y - parent_offset.1;

                // Create the new group node
                let mut group_node = SceneNode::new(new_group_id, NodeKind::Group {
                    layout: LayoutMode::Free,
                });
                group_node.constraints.push(Constraint::Absolute { x: rel_group_x, y: rel_group_y });
                
                let group_idx = self.graph.add_node(parent_idx, group_node);

                for &id in &ids {
                    if let Some(idx) = self.graph.index_of(id) {
                        self.graph.reparent_node(idx, group_idx);
                        
                        // Shift Absolute constraints to be relative to the group
                        if let Some(node) = self.graph.get_by_id_mut(id) {
                            for c in &mut node.constraints {
                                if let Constraint::Absolute { x, y } = c {
                                    *x -= rel_group_x;
                                    *y -= rel_group_y;
                                }
                            }
                        }
                    }
                }
            }
            GraphMutation::UngroupNode { id } => {
                if let Some(group_idx) = self.graph.index_of(id) {
                    let parent_idx = self.graph.parent(group_idx).unwrap_or(self.graph.root);
                    
                    let (group_rel_x, group_rel_y) = if let Some(group) = self.graph.get_by_id(id) {
                        group.constraints.iter().find_map(|c| match c {
                            Constraint::Absolute { x, y } => Some((*x, *y)),
                            _ => None,
                        }).unwrap_or((0.0, 0.0))
                    } else {
                        (0.0, 0.0)
                    };

                    let children = self.graph.children(group_idx);
                    for child_idx in children {
                        self.graph.reparent_node(child_idx, parent_idx);
                        let child_id = self.graph.graph[child_idx].id;
                        if let Some(child_node) = self.graph.get_by_id_mut(child_id) {
                            for c in &mut child_node.constraints {
                                if let Constraint::Absolute { x, y } = c {
                                    *x += group_rel_x;
                                    *y += group_rel_y;
                                }
                            }
                        }
                    }
                    
                    self.graph.graph.remove_node(group_idx);
                    self.graph.id_index.remove(&id);
                    self.bounds.remove(&group_idx);
                }
            }
        }

        self.text_dirty = true;
    }

    /// Flush: re-emit the text from the current graph state.
    /// Called after a batch of mutations (e.g. at end of drag gesture).
    pub fn flush_to_text(&mut self) {
        if self.text_dirty {
            self.text = emit_document(&self.graph);
            self.text_dirty = false;
        }
    }

    /// Re-resolve layout after mutations.
    pub fn resolve(&mut self) {
        self.bounds = resolve_layout(&self.graph, self.viewport);
    }

    // ─── Text → Canvas direction ─────────────────────────────────────────

    /// Replace the entire text and re-parse into graph.
    /// Used when the text editor sends a full document update.
    pub fn set_text(&mut self, new_text: &str) -> Result<(), String> {
        let new_graph = parse_document(new_text)?;
        self.graph = new_graph;
        self.bounds = resolve_layout(&self.graph, self.viewport);
        self.text = new_text.to_string();
        self.graph_dirty = false;
        self.text_dirty = false;
        Ok(())
    }

    /// Incremental text update: only specific line range changed.
    /// For now, falls back to full re-parse (incremental diffing is Phase 2 optimization).
    pub fn update_text_range(
        &mut self,
        new_text: &str,
        _changed_line_start: usize,
        _changed_line_end: usize,
    ) -> Result<(), String> {
        // TODO: incremental parse — only re-parse the changed region,
        // diff against current graph, apply minimal mutations.
        // For now: full re-parse (still fast for typical document sizes).
        self.set_text(new_text)
    }

    // ─── Queries ─────────────────────────────────────────────────────────

    /// Get current text (synced).
    pub fn current_text(&mut self) -> &str {
        self.flush_to_text();
        &self.text
    }

    /// Get current bounds for all nodes.
    pub fn current_bounds(&self) -> &HashMap<NodeIndex, ResolvedBounds> {
        &self.bounds
    }

    /// Look up the parent NodeId of a given node. Returns root if not found.
    pub fn parent_of(&self, id: NodeId) -> NodeId {
        use petgraph::Direction;
        self.graph
            .index_of(id)
            .and_then(|idx| {
                self.graph
                    .graph
                    .neighbors_directed(idx, Direction::Incoming)
                    .next()
            })
            .and_then(|pidx| self.graph.graph.node_weight(pidx))
            .map(|n| n.id)
            .unwrap_or_else(|| NodeId::intern("root"))
    }
}

/// A mutation that can be applied to the scene graph from canvas interactions.
#[derive(Debug, Clone)]
pub enum GraphMutation {
    MoveNode {
        id: NodeId,
        dx: f32,
        dy: f32,
    },
    ResizeNode {
        id: NodeId,
        width: f32,
        height: f32,
    },
    AddNode {
        parent_id: NodeId,
        node: Box<SceneNode>,
    },
    RemoveNode {
        id: NodeId,
    },
    SetStyle {
        id: NodeId,
        style: Style,
    },
    SetText {
        id: NodeId,
        content: String,
    },
    SetAnnotations {
        id: NodeId,
        annotations: Vec<Annotation>,
    },
    /// Duplicate a node (clone with offset). Used by Alt+drag.
    DuplicateNode {
        id: NodeId,
    },
    /// Replace a path node's commands with new ones.
    /// Used by the pen tool to update the live path during drawing.
    UpdatePath {
        id: NodeId,
        commands: Vec<PathCmd>,
    },
    /// Group selected nodes.
    GroupNodes {
        ids: Vec<NodeId>,
        new_group_id: NodeId,
    },
    /// Ungroup a node, extracting its children to the parent.
    UngroupNode {
        id: NodeId,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_text_to_canvas() {
        let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let engine = SyncEngine::from_text(input, viewport).unwrap();

        assert!(engine.graph.get_by_id(NodeId::intern("box")).is_some());
        let idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
        assert!(engine.bounds.contains_key(&idx));
    }

    #[test]
    fn sync_canvas_to_text() {
        let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();

        // Resize via canvas
        engine.apply_mutation(GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 200.0,
            height: 100.0,
        });
        engine.flush_to_text();

        // Verify text reflects the change
        assert!(engine.text.contains("200"));
        assert!(engine.text.contains("100"));
    }

    #[test]
    fn sync_roundtrip_bidirectional() {
        let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();

        // 1. Canvas mutation
        engine.apply_mutation(GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 300.0,
            height: 150.0,
        });
        let text_after_canvas = engine.current_text().to_string();

        // 2. Re-parse from text (simulating text editor receiving update)
        let engine2 = SyncEngine::from_text(&text_after_canvas, viewport).unwrap();
        let node = engine2.graph.get_by_id(NodeId::intern("box")).unwrap();
        match &node.kind {
            NodeKind::Rect { width, height } => {
                assert_eq!(*width, 300.0);
                assert_eq!(*height, 150.0);
            }
            _ => panic!("expected Rect"),
        }
    }

    #[test]
    fn sync_set_annotations() {
        let input = r#"
rect @box {
  w: 100
  h: 50
  ## "A test box"
  ## status: draft
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();

        // Verify initial annotations
        let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.annotations.len(), 2);

        // Update annotations via mutation
        engine.apply_mutation(GraphMutation::SetAnnotations {
            id: NodeId::intern("box"),
            annotations: vec![
                Annotation::Description("Updated description".into()),
                Annotation::Status("done".into()),
                Annotation::Accept("all tests pass".into()),
            ],
        });
        engine.flush_to_text();

        // Verify graph updated
        let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.annotations.len(), 3);
        assert_eq!(
            node.annotations[0],
            Annotation::Description("Updated description".into())
        );

        // Verify text re-emitted with new ## lines
        assert!(engine.text.contains("## \"Updated description\""));
        assert!(engine.text.contains("## status: done"));
        assert!(engine.text.contains("## accept: \"all tests pass\""));
    }

    #[test]
    fn sync_annotations_roundtrip() {
        let input = r#"
rect @card {
  w: 200
  h: 100
  ## "Card component"
  ## priority: high
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();

        // Mutate annotations
        engine.apply_mutation(GraphMutation::SetAnnotations {
            id: NodeId::intern("card"),
            annotations: vec![
                Annotation::Description("Updated card".into()),
                Annotation::Accept("renders correctly".into()),
                Annotation::Status("in_progress".into()),
            ],
        });
        let text = engine.current_text().to_string();

        // Re-parse from text
        let engine2 = SyncEngine::from_text(&text, viewport).unwrap();
        let node = engine2.graph.get_by_id(NodeId::intern("card")).unwrap();
        assert_eq!(node.annotations.len(), 3);
        assert_eq!(
            node.annotations[2],
            Annotation::Status("in_progress".into())
        );
    }
}
