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

    /// Last detach event: (child_id, old_parent_id). Reset on flush.
    pub last_detach: Option<(fd_core::id::NodeId, fd_core::id::NodeId)>,
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
            last_detach: None,
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
            last_detach: None,
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
                    // Propagate movement to all descendants' cached bounds
                    // so children move together with their parent (e.g. group drag).
                    let descendants = Self::collect_descendants(&self.graph, idx);
                    for child_idx in descendants {
                        if let Some(child_bounds) = self.bounds.get_mut(&child_idx) {
                            child_bounds.x += dx;
                            child_bounds.y += dy;
                        }
                    }
                    // Pin moved node to Position constraint with parent-relative coords.
                    // Position { x, y } is interpreted by resolve_layout as
                    // (parent.x + x, parent.y + y), so we must subtract parent offset.
                    let abs_pos = self
                        .bounds
                        .get(&idx)
                        .map(|b| (b.x, b.y))
                        .unwrap_or((0.0, 0.0));
                    // Look up parent offset *before* mutable borrow of graph
                    let parent_offset = self
                        .graph
                        .parent(idx)
                        .and_then(|pidx| self.bounds.get(&pidx))
                        .map(|pb| (pb.x, pb.y))
                        .unwrap_or((0.0, 0.0));
                    let rel_x = abs_pos.0 - parent_offset.0;
                    let rel_y = abs_pos.1 - parent_offset.1;
                    if let Some(node) = self.graph.get_by_id_mut(id) {
                        // Strip ALL positioning constraints — moved node is pinned
                        node.constraints.retain(|c| {
                            !matches!(
                                c,
                                Constraint::Position { .. }
                                    | Constraint::CenterIn(_)
                                    | Constraint::Offset { .. }
                                    | Constraint::FillParent { .. }
                            )
                        });
                        let rx = (rel_x * 100.0).round() / 100.0;
                        let ry = (rel_y * 100.0).round() / 100.0;
                        node.constraints.push(Constraint::Position { x: rx, y: ry });
                    }
                }
            }
            GraphMutation::ResizeNode { id, width, height } => {
                let rw = (width * 100.0).round() / 100.0;
                let rh = (height * 100.0).round() / 100.0;
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    match &mut node.kind {
                        NodeKind::Rect {
                            width: w,
                            height: h,
                        } => {
                            *w = rw;
                            *h = rh;
                        }
                        NodeKind::Ellipse { rx, ry } => {
                            *rx = rw / 2.0;
                            *ry = rh / 2.0;
                        }
                        NodeKind::Frame {
                            width: w,
                            height: h,
                            ..
                        } => {
                            *w = rw;
                            *h = rh;
                        }
                        _ => {}
                    }
                }
            }
            GraphMutation::AddNode { parent_id, node } => {
                let parent_idx = self.graph.index_of(parent_id).unwrap_or(self.graph.root);
                // Extract positioning info before moving node into graph
                let abs_pos = node.constraints.iter().find_map(|c| match c {
                    Constraint::Position { x, y } => Some((*x, *y)),
                    _ => None,
                });
                let (w, h) = match &node.kind {
                    NodeKind::Rect { width, height } => (*width, *height),
                    NodeKind::Ellipse { rx, ry } => (rx * 2.0, ry * 2.0),
                    NodeKind::Frame { width, height, .. } => (*width, *height),
                    NodeKind::Text { .. } => (80.0, 24.0),
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
                    self.bounds.remove(&idx);
                    self.graph.remove_node(idx);
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
            GraphMutation::SetAnimations { id, animations } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    node.animations = animations;
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
                if ids.is_empty() {
                    return;
                }

                let first_idx = match self.graph.index_of(ids[0]) {
                    Some(idx) => idx,
                    None => return,
                };
                let parent_idx = self.graph.parent(first_idx).unwrap_or(self.graph.root);

                // Compute min bounding box of all selected nodes
                let mut min_x = f32::MAX;
                let mut min_y = f32::MAX;
                for &id in &ids {
                    if let Some(idx) = self.graph.index_of(id)
                        && let Some(b) = self.bounds.get(&idx)
                    {
                        min_x = min_x.min(b.x);
                        min_y = min_y.min(b.y);
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
                let mut group_node = SceneNode::new(
                    new_group_id,
                    NodeKind::Group {
                        layout: LayoutMode::Free,
                    },
                );
                group_node.constraints.push(Constraint::Position {
                    x: rel_group_x,
                    y: rel_group_y,
                });

                let group_idx = self.graph.add_node(parent_idx, group_node);

                // Compute group bounds from children
                let mut max_x: f32 = f32::MIN;
                let mut max_y: f32 = f32::MIN;
                for &id in &ids {
                    if let Some(idx) = self.graph.index_of(id)
                        && let Some(b) = self.bounds.get(&idx)
                    {
                        max_x = max_x.max(b.x + b.width);
                        max_y = max_y.max(b.y + b.height);
                    }
                }
                // Initialize bounds for the group so MoveNode can find them
                self.bounds.insert(
                    group_idx,
                    ResolvedBounds {
                        x: min_x,
                        y: min_y,
                        width: if max_x > min_x { max_x - min_x } else { 0.0 },
                        height: if max_y > min_y { max_y - min_y } else { 0.0 },
                    },
                );

                for &id in &ids {
                    if let Some(idx) = self.graph.index_of(id) {
                        self.graph.reparent_node(idx, group_idx);

                        // Shift Position constraints to be relative to the group
                        if let Some(node) = self.graph.get_by_id_mut(id) {
                            for c in &mut node.constraints {
                                if let Constraint::Position { x, y } = c {
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
                        group
                            .constraints
                            .iter()
                            .find_map(|c| match c {
                                Constraint::Position { x, y } => Some((*x, *y)),
                                _ => None,
                            })
                            .unwrap_or((0.0, 0.0))
                    } else {
                        (0.0, 0.0)
                    };

                    let children = self.graph.children(group_idx);
                    for child_idx in children {
                        self.graph.reparent_node(child_idx, parent_idx);
                        let child_id = self.graph.graph[child_idx].id;
                        if let Some(child_node) = self.graph.get_by_id_mut(child_id) {
                            for c in &mut child_node.constraints {
                                if let Constraint::Position { x, y } = c {
                                    *x += group_rel_x;
                                    *y += group_rel_y;
                                }
                            }
                        }
                    }

                    self.graph.remove_node(group_idx);
                    self.bounds.remove(&group_idx);
                }
            }
            GraphMutation::AddEdge { edge } => {
                self.graph.edges.push(*edge);
            }
            GraphMutation::RemoveEdge { id } => {
                self.graph.edges.retain(|e| e.id != id);
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

    /// Evaluate if a dropped node should structurally detach from its parent.
    /// Returns true if the graph changed (node was detached).
    pub fn evaluate_drop(&mut self, node_id: NodeId) -> bool {
        if let Some(idx) = self.graph.index_of(node_id)
            && let Some(info) =
                handle_child_group_relationship(&mut self.graph, idx, &mut self.bounds)
        {
            self.last_detach = Some(info);
            self.text_dirty = true;
            return true;
        }
        false
    }

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

    /// Collect all descendant NodeIndex values (children, grandchildren, etc.).
    fn collect_descendants(graph: &SceneGraph, idx: NodeIndex) -> Vec<NodeIndex> {
        let mut result = Vec::new();
        let mut stack = vec![idx];
        while let Some(current) = stack.pop() {
            for child in graph.children(current) {
                result.push(child);
                stack.push(child);
            }
        }
        result
    }
}

/// Returns true if two axis-aligned bounding boxes overlap (non-zero area).
fn bboxes_overlap(a: &fd_core::ResolvedBounds, b: &fd_core::ResolvedBounds) -> bool {
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/// Handle the relationship between a moved child and its parent group.
///
/// To avoid the "chasing envelope" bug (where the group expanded on every
/// drag frame to follow the child, preventing detach), we check overlap
/// against the parent's **current** stored bounds and do NOT expand them
/// during drag. The group bounds remain stable — only the child's bounds
/// move. When the child fully leaves the parent's area, it detaches.
///
/// - **Child overlaps current parent bounds**: keep child, no expansion.
/// - **No overlap**: detach the child — reparent to nearest ancestor.
fn handle_child_group_relationship(
    graph: &mut SceneGraph,
    child_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, fd_core::ResolvedBounds>,
) -> Option<(fd_core::id::NodeId, fd_core::id::NodeId)> {
    let parent_idx = graph.parent(child_idx)?;

    let parent_kind = &graph.graph[parent_idx].kind;
    let child_kind = &graph.graph[child_idx].kind;

    // Only act on container parents (Group/Frame) or shape parents (Rect/Ellipse) if the child is Text.
    let is_container_parent = match parent_kind {
        NodeKind::Group { .. } | NodeKind::Frame { .. } => true,
        NodeKind::Rect { .. } | NodeKind::Ellipse { .. } => {
            matches!(child_kind, NodeKind::Text { .. })
        }
        _ => false,
    };
    if !is_container_parent {
        return None;
    }

    let mut child_b = *bounds.get(&child_idx)?;
    let parent_b = *bounds.get(&parent_idx)?;

    // If the child is a Text node inside a shape, its layout bounds might have been
    // inflated to match the parent's size (from CenterIn or default layout).
    // For drag-to-detach, we want to test the actual visual text bounds.
    if let NodeKind::Text { content } = child_kind {
        // Naive intrinsic text size matching what layout.rs uses
        let text_w = (content.len() as f32) * 8.0;
        let text_h = 16.0;
        
        // If the box is massive, the text is actually drawn at the center.
        // We shrink the overlap test box to the visual text area.
        let cx = child_b.x + child_b.width / 2.0;
        let cy = child_b.y + child_b.height / 2.0;
        child_b.width = text_w;
        child_b.height = text_h;
        child_b.x = cx - text_w / 2.0;
        child_b.y = cy - text_h / 2.0;
    }

    if bboxes_overlap(&child_b, &parent_b) {
        // Child still overlaps the parent's current bounds — stay in group.
        // Deliberately NOT expanding the group here to prevent the chase.
        None
    } else {
        // Zero overlap → detach child, reparent to nearest containing ancestor
        let child_id = graph.graph[child_idx].id;
        let parent_id = graph.graph[parent_idx].id;
        detach_child_from_group(graph, child_idx, parent_idx, bounds);
        Some((child_id, parent_id))
    }
}

/// Extract padding from a group's layout mode.
fn group_padding(graph: &SceneGraph, group_idx: NodeIndex) -> f32 {
    match &graph.graph[group_idx].kind {
        NodeKind::Group {
            layout: LayoutMode::Column { pad, .. },
        }
        | NodeKind::Group {
            layout: LayoutMode::Row { pad, .. },
        }
        | NodeKind::Group {
            layout: LayoutMode::Grid { pad, .. },
        } => *pad,
        NodeKind::Group {
            layout: LayoutMode::Free,
        } => 0.0,
        _ => 0.0,
    }
}

/// Expand a group's bounds to contain all its children.
/// If `exclude_idx` is provided, skip that child in the calculation.
fn expand_group_to_children(
    graph: &SceneGraph,
    group_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, fd_core::ResolvedBounds>,
    exclude_idx: Option<NodeIndex>,
) {
    let pad = group_padding(graph, group_idx);
    let children = graph.children(group_idx);
    if children.is_empty() {
        return;
    }

    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;

    for &ci in &children {
        if exclude_idx == Some(ci) {
            continue;
        }
        if let Some(cb) = bounds.get(&ci) {
            min_x = min_x.min(cb.x);
            min_y = min_y.min(cb.y);
            max_x = max_x.max(cb.x + cb.width);
            max_y = max_y.max(cb.y + cb.height);
        }
    }

    if min_x < f32::MAX {
        bounds.insert(
            group_idx,
            fd_core::ResolvedBounds {
                x: min_x - pad,
                y: min_y - pad,
                width: (max_x - min_x) + 2.0 * pad,
                height: (max_y - min_y) + 2.0 * pad,
            },
        );
    }
}

/// Detach a child from its parent group and reparent to the nearest
/// ancestor whose bounds contain the child, or root if none does.
fn detach_child_from_group(
    graph: &mut SceneGraph,
    child_idx: NodeIndex,
    old_parent_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, fd_core::ResolvedBounds>,
) {
    let child_b = match bounds.get(&child_idx) {
        Some(b) => *b,
        None => return,
    };

    // Walk up ancestor chain to find a containing group
    let mut new_parent_idx = graph.root;
    let mut cursor = graph.parent(old_parent_idx);
    while let Some(ancestor_idx) = cursor {
        if let Some(ab) = bounds.get(&ancestor_idx) {
            let contains = ab.x <= child_b.x
                && ab.y <= child_b.y
                && ab.x + ab.width >= child_b.x + child_b.width
                && ab.y + ab.height >= child_b.y + child_b.height;
            if contains {
                new_parent_idx = ancestor_idx;
                break;
            }
        }
        cursor = graph.parent(ancestor_idx);
    }

    // Reparent the child node
    graph.reparent_node(child_idx, new_parent_idx);

    // Fix Position constraint to be relative to new parent
    let new_parent_offset = bounds
        .get(&new_parent_idx)
        .map(|b| (b.x, b.y))
        .unwrap_or((0.0, 0.0));
    let new_rel_x = ((child_b.x - new_parent_offset.0) * 100.0).round() / 100.0;
    let new_rel_y = ((child_b.y - new_parent_offset.1) * 100.0).round() / 100.0;

    let child_id = graph.graph[child_idx].id;
    if let Some(node) = graph.get_by_id_mut(child_id) {
        node.constraints
            .retain(|c| !matches!(c, Constraint::Position { .. }));
        node.constraints.push(Constraint::Position {
            x: new_rel_x,
            y: new_rel_y,
        });
    }

    // Shrink old parent group to fit remaining children
    expand_group_to_children(graph, old_parent_idx, bounds, None);
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
    /// Set animations on a node (for animation picker).
    SetAnimations {
        id: NodeId,
        animations: smallvec::SmallVec<[AnimKeyframe; 2]>,
    },
    /// Add an edge (arrow/connector) between two nodes.
    AddEdge {
        edge: Box<Edge>,
    },
    /// Remove an edge by its ID.
    RemoveEdge {
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
  spec {
    "A test box"
    status: draft
  }
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

        // Verify text re-emitted with spec blocks
        assert!(engine.text.contains("\"Updated description\""));
        assert!(engine.text.contains("status: done"));
        assert!(engine.text.contains("accept: \"all tests pass\""));
    }

    #[test]
    fn sync_annotations_roundtrip() {
        let input = r#"
rect @card {
  w: 200
  h: 100
  spec {
    "Card component"
    priority: high
  }
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

    #[test]
    fn sync_move_multi_frame_no_jitter() {
        // Simulates a drag gesture across 3 frames.
        // After each MoveNode, bounds should accumulate consistently
        // and the Position constraint should match the relative position.
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
        let box_id = NodeId::intern("box");
        let idx = engine.graph.index_of(box_id).unwrap();

        let initial_x = engine.bounds[&idx].x;
        let initial_y = engine.bounds[&idx].y;

        // Frame 1: move right 10, down 5
        engine.apply_mutation(GraphMutation::MoveNode {
            id: box_id,
            dx: 10.0,
            dy: 5.0,
        });
        // Re-resolve (as apply_mutations does for non-move batches)
        engine.resolve();
        let b1 = engine.bounds[&idx];
        assert!(
            (b1.x - (initial_x + 10.0)).abs() < 0.01,
            "frame 1: x={}, expected {}",
            b1.x,
            initial_x + 10.0
        );
        assert!(
            (b1.y - (initial_y + 5.0)).abs() < 0.01,
            "frame 1: y={}, expected {}",
            b1.y,
            initial_y + 5.0
        );

        // Frame 2: move right another 10, down 5
        engine.apply_mutation(GraphMutation::MoveNode {
            id: box_id,
            dx: 10.0,
            dy: 5.0,
        });
        engine.resolve();
        let b2 = engine.bounds[&idx];
        assert!(
            (b2.x - (initial_x + 20.0)).abs() < 0.01,
            "frame 2: x={}, expected {}",
            b2.x,
            initial_x + 20.0
        );
        assert!(
            (b2.y - (initial_y + 10.0)).abs() < 0.01,
            "frame 2: y={}, expected {}",
            b2.y,
            initial_y + 10.0
        );

        // Frame 3: move left 30, up 10
        engine.apply_mutation(GraphMutation::MoveNode {
            id: box_id,
            dx: -30.0,
            dy: -10.0,
        });
        engine.resolve();
        let b3 = engine.bounds[&idx];
        assert!(
            (b3.x - (initial_x - 10.0)).abs() < 0.01,
            "frame 3: x={}, expected {}",
            b3.x,
            initial_x - 10.0
        );
        assert!(
            (b3.y - initial_y).abs() < 0.01,
            "frame 3: y={}, expected {}",
            b3.y,
            initial_y
        );
    }

    #[test]
    fn sync_move_strips_center_in() {
        // A node with center_in should lose that constraint after being moved,
        // so it stays at the dropped position rather than snapping back.
        let input = r#"
rect @box {
  w: 100
  h: 50
}

@box -> center_in: canvas
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let box_id = NodeId::intern("box");

        // Verify CenterIn is present initially
        let node = engine.graph.get_by_id(box_id).unwrap();
        assert!(
            node.constraints
                .iter()
                .any(|c| matches!(c, Constraint::CenterIn(_))),
            "should have CenterIn before move"
        );

        // Move node
        engine.apply_mutation(GraphMutation::MoveNode {
            id: box_id,
            dx: 50.0,
            dy: 30.0,
        });

        // After move, CenterIn should be stripped and only Position remains
        let node = engine.graph.get_by_id(box_id).unwrap();
        assert!(
            !node
                .constraints
                .iter()
                .any(|c| matches!(c, Constraint::CenterIn(_))),
            "CenterIn should be stripped after move"
        );
        assert_eq!(
            node.constraints.len(),
            1,
            "should have exactly one constraint (Position)"
        );
        assert!(
            matches!(node.constraints[0], Constraint::Position { .. }),
            "single constraint should be Position"
        );
    }

    #[test]
    fn sync_set_animations() {
        use fd_core::model::{AnimKeyframe, AnimProperties, AnimTrigger, Easing};

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

        // Verify no animations initially
        let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
        assert!(node.animations.is_empty());

        // Apply SetAnimations mutation
        let mut anims = smallvec::smallvec![];
        anims.push(AnimKeyframe {
            trigger: AnimTrigger::Hover,
            duration_ms: 300,
            easing: Easing::Spring,
            properties: AnimProperties {
                scale: Some(1.1),
                ..Default::default()
            },
        });
        engine.apply_mutation(GraphMutation::SetAnimations {
            id: NodeId::intern("box"),
            animations: anims,
        });
        engine.flush_to_text();

        // Verify graph updated
        let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.animations.len(), 1);
        assert_eq!(node.animations[0].trigger, AnimTrigger::Hover);

        // Verify text contains when block
        assert!(engine.text.contains("when :hover"));
        assert!(engine.text.contains("scale:"));

        // Verify round-trip: re-parse from text
        let engine2 = SyncEngine::from_text(&engine.text, viewport).unwrap();
        let node2 = engine2.graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node2.animations.len(), 1);
        assert_eq!(node2.animations[0].trigger, AnimTrigger::Hover);
        assert_eq!(node2.animations[0].properties.scale, Some(1.1));
    }

    #[test]
    fn sync_set_style_alignment() {
        use fd_core::model::{TextAlign, TextVAlign};

        let input = r#"
text @heading "Hello" {
  fill: #FFFFFF
  font: "Inter" 600 24
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();

        // Verify no alignment initially
        let node = engine.graph.get_by_id(NodeId::intern("heading")).unwrap();
        assert!(node.style.text_align.is_none());
        assert!(node.style.text_valign.is_none());

        // Apply SetStyle mutation with alignment
        let mut style = engine.graph.resolve_style(node, &[]);
        style.text_align = Some(TextAlign::Right);
        style.text_valign = Some(TextVAlign::Bottom);
        engine.apply_mutation(GraphMutation::SetStyle {
            id: NodeId::intern("heading"),
            style,
        });
        engine.flush_to_text();

        // Verify graph updated
        let node = engine.graph.get_by_id(NodeId::intern("heading")).unwrap();
        assert_eq!(node.style.text_align, Some(TextAlign::Right));
        assert_eq!(node.style.text_valign, Some(TextVAlign::Bottom));

        // Verify text output contains align property
        assert!(
            engine.text.contains("align: right bottom"),
            "emitted text should contain 'align: right bottom', got:\n{}",
            engine.text
        );

        // Verify round-trip
        let engine2 = SyncEngine::from_text(&engine.text, viewport).unwrap();
        let node2 = engine2.graph.get_by_id(NodeId::intern("heading")).unwrap();
        assert_eq!(node2.style.text_align, Some(TextAlign::Right));
        assert_eq!(node2.style.text_valign, Some(TextVAlign::Bottom));
    }

    #[test]
    fn sync_move_group_moves_children() {
        let input = r#"
group @box {
  x: 10 y: 10

  rect @child_a { x: 0 y: 0 w: 40 h: 20 }
  rect @child_b { x: 50 y: 30 w: 40 h: 20 }
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();

        let group_idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
        let a_idx = engine.graph.index_of(NodeId::intern("child_a")).unwrap();
        let b_idx = engine.graph.index_of(NodeId::intern("child_b")).unwrap();

        let group_before = engine.bounds[&group_idx];
        let a_before = engine.bounds[&a_idx];
        let b_before = engine.bounds[&b_idx];

        // Move the group by (100, 50)
        engine.apply_mutation(GraphMutation::MoveNode {
            id: NodeId::intern("box"),
            dx: 100.0,
            dy: 50.0,
        });

        // Group bounds should have shifted
        let group_after = engine.bounds[&group_idx];
        assert!(
            (group_after.x - (group_before.x + 100.0)).abs() < 0.01,
            "group x: expected {}, got {}",
            group_before.x + 100.0,
            group_after.x
        );
        assert!(
            (group_after.y - (group_before.y + 50.0)).abs() < 0.01,
            "group y: expected {}, got {}",
            group_before.y + 50.0,
            group_after.y
        );

        // Children bounds should have shifted by the same delta
        let a_after = engine.bounds[&a_idx];
        assert!(
            (a_after.x - (a_before.x + 100.0)).abs() < 0.01,
            "child_a x: expected {}, got {}",
            a_before.x + 100.0,
            a_after.x
        );
        assert!(
            (a_after.y - (a_before.y + 50.0)).abs() < 0.01,
            "child_a y: expected {}, got {}",
            a_before.y + 50.0,
            a_after.y
        );

        let b_after = engine.bounds[&b_idx];
        assert!(
            (b_after.x - (b_before.x + 100.0)).abs() < 0.01,
            "child_b x: expected {}, got {}",
            b_before.x + 100.0,
            b_after.x
        );
        assert!(
            (b_after.y - (b_before.y + 50.0)).abs() < 0.01,
            "child_b y: expected {}, got {}",
            b_before.y + 50.0,
            b_after.y
        );
    }

    #[test]
    fn sync_move_detaches_child_from_group() {
        // Moving a child fully outside its parent group should detach it
        // and reparent to root.
        let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { w: 80 h: 40 }
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let b_id = NodeId::intern("b");
        let container_id = NodeId::intern("container");

        // Verify @b is a child of @container before move
        let b_idx = engine.graph.index_of(b_id).unwrap();
        let parent_before = engine.graph.parent(b_idx).unwrap();
        let container_idx = engine.graph.index_of(container_id).unwrap();
        assert_eq!(
            parent_before, container_idx,
            "@b should be child of @container before move"
        );

        // Move @b far away (fully outside the group)
        engine.apply_mutation(GraphMutation::MoveNode {
            id: b_id,
            dx: 500.0,
            dy: 400.0,
        });
        engine.evaluate_drop(b_id);

        // @b should now be reparented to root
        let b_idx = engine.graph.index_of(b_id).unwrap();
        let parent_after = engine.graph.parent(b_idx).unwrap();
        assert_eq!(
            parent_after, engine.graph.root,
            "@b should be reparented to root after dragging fully outside"
        );

        // @container should only contain @a now
        let children = engine.graph.children(container_idx);
        assert_eq!(children.len(), 1, "container should have 1 child remaining");
    }

    #[test]
    fn sync_move_partial_overlap_keeps_child() {
        // Moving a child partially outside should keep it in the group
        // without expanding the group (expansion was the "chasing envelope" bug).
        let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { x: 0 y: 60 w: 80 h: 40 }
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let b_id = NodeId::intern("b");
        let container_id = NodeId::intern("container");
        let container_idx = engine.graph.index_of(container_id).unwrap();

        let initial_width = engine.bounds[&container_idx].width;

        // Move @b a small amount right (still overlapping with container)
        engine.apply_mutation(GraphMutation::MoveNode {
            id: b_id,
            dx: 50.0,
            dy: 0.0,
        });
        engine.evaluate_drop(b_id);

        // @b should still be a child of @container
        let b_idx = engine.graph.index_of(b_id).unwrap();
        let parent_after = engine.graph.parent(b_idx).unwrap();
        assert_eq!(
            parent_after, container_idx,
            "@b should remain child of @container with partial overlap"
        );

        // Container should NOT expand during drag (prevents chasing envelope)
        let new_width = engine.bounds[&container_idx].width;
        assert_eq!(
            new_width, initial_width,
            "container should NOT expand during drag ({new_width} == {initial_width})"
        );
    }

    #[test]
    fn sync_move_detaches_through_nested_groups() {
        // Moving a deeply nested child fully outside all groups should
        // reparent to root.
        let input = r#"
group @outer {
  x: 0 y: 0

  group @inner {
    x: 0 y: 0

    rect @leaf { w: 40 h: 30 }
  }
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let leaf_id = NodeId::intern("leaf");

        // Move @leaf far outside both groups
        engine.apply_mutation(GraphMutation::MoveNode {
            id: leaf_id,
            dx: 600.0,
            dy: 500.0,
        });
        engine.evaluate_drop(leaf_id);

        // @leaf should be reparented to root (jumped 2 levels)
        let leaf_idx = engine.graph.index_of(leaf_id).unwrap();
        let parent = engine.graph.parent(leaf_idx).unwrap();
        assert_eq!(
            parent, engine.graph.root,
            "@leaf should be at root after dragging outside all groups"
        );
    }

    /// Regression test: incremental drag (many small moves) must eventually
    /// detach. Before the fix, `expand_group_to_children` grew the parent on
    /// every frame, preventing the child from ever escaping ("chasing envelope").
    #[test]
    fn sync_incremental_drag_detaches_child() {
        let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { x: 0 y: 60 w: 80 h: 40 }
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let b_id = NodeId::intern("b");
        let container_id = NodeId::intern("container");
        let container_idx = engine.graph.index_of(container_id).unwrap();

        // Simulate a real drag gesture: 30 small incremental moves (10px each)
        // that should eventually move @b fully outside the sibling envelope.
        for _ in 0..30 {
            engine.apply_mutation(GraphMutation::MoveNode {
                id: b_id,
                dx: 10.0,
                dy: 10.0,
            });
        }
        engine.evaluate_drop(b_id);

        // @b should now be reparented to root
        let b_idx = engine.graph.index_of(b_id).unwrap();
        let parent = engine.graph.parent(b_idx).unwrap();
        assert_eq!(
            parent, engine.graph.root,
            "@b should detach after incremental drag (was: chasing envelope bug)"
        );

        // @container should still exist with @a
        let remaining = engine.graph.children(container_idx);
        assert_eq!(
            remaining.len(),
            1,
            "container should keep 1 child after detach"
        );
    }

    #[test]
    fn sync_move_within_group_no_detach() {
        // Small move within a group should not detach.
        let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { x: 0 y: 60 w: 80 h: 40 }
}
"#;
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut engine = SyncEngine::from_text(input, viewport).unwrap();
        let b_id = NodeId::intern("b");
        let container_id = NodeId::intern("container");
        let container_idx = engine.graph.index_of(container_id).unwrap();

        // Move @b a tiny amount (well within group)
        engine.apply_mutation(GraphMutation::MoveNode {
            id: b_id,
            dx: 5.0,
            dy: 3.0,
        });

        // @b should still be a child of @container
        let b_idx = engine.graph.index_of(b_id).unwrap();
        let parent = engine.graph.parent(b_idx).unwrap();
        assert_eq!(
            parent, container_idx,
            "@b should remain in @container after small move"
        );
    }
}

#[test]
fn sync_delete_node() {
    let input = r#"
rect @box {
  w: 100
  h: 50
}
rect @other {
  w: 10
  h: 10
}
"#;
    let viewport = fd_core::Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("box"),
    });
    let text = engine.current_text();
    assert!(!text.contains("rect @box"));
    assert!(text.contains("rect @other"));
}
