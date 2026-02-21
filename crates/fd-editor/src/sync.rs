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
                        _ => {}
                    }
                }
            }
            GraphMutation::AddNode { parent_id, node } => {
                let parent_idx = self.graph.index_of(parent_id).unwrap_or(self.graph.root);
                self.graph.add_node(parent_idx, *node);
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
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    if let NodeKind::Text { content: ref mut c } = node.kind {
                        *c = content;
                    }
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
}
