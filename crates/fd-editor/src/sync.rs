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

    /// Cached block hashes for incremental parse (R2.3).
    /// Each entry is a hash of a top-level text block.
    block_hashes: Vec<u64>,
}

impl SyncEngine {
    /// Create a new sync engine from FD source text.
    pub fn from_text(text: &str, viewport: Viewport) -> Result<Self, String> {
        let graph = parse_document(text)?;
        let bounds = resolve_layout(&graph, viewport);
        let canonical_text = emit_document(&graph);
        let block_hashes = compute_block_hashes(&canonical_text);

        Ok(Self {
            graph,
            text: canonical_text,
            bounds,
            viewport,
            text_dirty: false,
            graph_dirty: false,
            last_detach: None,
            block_hashes,
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
            block_hashes: Vec::new(),
        }
    }

    // ─── Canvas → Text direction ─────────────────────────────────────────

    /// Apply a graph mutation from canvas interaction, then re-sync text.
    /// This is the hot path during drag/draw — must be fast.
    pub fn apply_mutation(&mut self, mutation: GraphMutation) {
        self.apply_mutation_with_co_selected(mutation, &[]);
    }

    /// Apply a graph mutation, skipping descendant bounds propagation for
    /// nodes in `co_selected`. When multiple nodes are selected and dragged,
    /// each gets its own `MoveNode` mutation. Without this filter, a parent's
    /// `MoveNode` would propagate dx/dy to a co-selected child, and then the
    /// child's own `MoveNode` would move it again — resulting in 2× movement.
    pub fn apply_mutation_with_co_selected(
        &mut self,
        mutation: GraphMutation,
        co_selected: &[NodeId],
    ) {
        match mutation {
            GraphMutation::MoveNode { id, dx, dy } => {
                if let Some(idx) = self.graph.index_of(id) {
                    // Moving a child inside a managed layout (Column/Row/Grid)
                    // converts it to absolute positioning — the Position constraint
                    // added below pulls it out of the layout flow (like Figma's
                    // "Absolute position" toggle). Groups are unaffected since
                    // is_parent_managed only checks Frame nodes.
                    if let Some(bounds) = self.bounds.get_mut(&idx) {
                        bounds.x += dx;
                        bounds.y += dy;
                    }
                    // Propagate movement to all descendants' cached bounds
                    // so children move together with their parent (e.g. group drag).
                    // Skip descendants that are co-selected — they get their own
                    // MoveNode mutation and would otherwise move 2×.
                    let descendants = Self::collect_descendants(&self.graph, idx);
                    for child_idx in descendants {
                        if !co_selected.is_empty()
                            && let Some(child_node) = self.graph.graph.node_weight(child_idx)
                            && co_selected.contains(&child_node.id)
                        {
                            continue;
                        }
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
                let is_text_node;
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    is_text_node = matches!(node.kind, NodeKind::Text { .. });
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
                        NodeKind::Text { max_width, .. } => {
                            *max_width = Some(rw);
                            // Only update width — JS measureText() round-trip
                            // will set the accurate wrapped height on release
                            // (KI Lesson #9: heuristics must not fight measurements).
                            if let Some(idx) = self.graph.index_of(id)
                                && let Some(b) = self.bounds.get_mut(&idx)
                            {
                                b.width = rw;
                            }
                        }
                        _ => {}
                    }
                } else {
                    is_text_node = false;
                }

                // Keep cached bounds in sync so resize_origin tracks correctly
                // (skip for text — already handled in the Text branch above)
                if !is_text_node
                    && let Some(idx) = self.graph.index_of(id)
                    && let Some(bounds) = self.bounds.get_mut(&idx)
                {
                    bounds.width = rw;
                    bounds.height = rh;
                }

                // Propagate max_width to child text nodes when parent is resized
                // (Option A: permanently set max_width so wrapping persists)
                if !is_text_node && let Some(idx) = self.graph.index_of(id) {
                    let children = self.graph.children(idx);
                    for child_idx in children {
                        let child_node = &self.graph.graph[child_idx];
                        // Only auto-wrap text children without explicit position
                        let has_position = child_node
                            .constraints
                            .iter()
                            .any(|c| matches!(c, Constraint::Position { .. }));
                        if has_position {
                            continue;
                        }
                        if let NodeKind::Text { .. } = &child_node.kind {
                            let child_id = child_node.id;
                            // Determine content width (parent width minus padding)
                            let pad = match &self.graph.graph[idx].kind {
                                NodeKind::Frame { layout, .. } => match layout {
                                    LayoutMode::Column { pad, .. }
                                    | LayoutMode::Row { pad, .. }
                                    | LayoutMode::Grid { pad, .. } => *pad,
                                    LayoutMode::Free { pad } => *pad,
                                },
                                _ => 0.0,
                            };
                            let content_w = (rw - 2.0 * pad).max(20.0);
                            if let Some(text_node) = self.graph.get_by_id_mut(child_id)
                                && let NodeKind::Text { max_width, .. } = &mut text_node.kind
                            {
                                *max_width = Some(content_w);
                                // Only update width — JS measureText() will
                                // set accurate wrapped height on release.
                                if let Some(cb) = self.bounds.get_mut(&child_idx) {
                                    cb.width = content_w;
                                }
                            }
                        }
                    }
                }

                // Re-resolve children so Column/Row/Grid re-flow and
                // centered text re-centers during the resize drag.
                if let Some(idx) = self.graph.index_of(id) {
                    fd_core::layout::resolve_subtree(
                        &self.graph,
                        idx,
                        &mut self.bounds,
                        self.viewport,
                    );
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

                    // Clean up visual edges referencing the deleted node
                    let orphaned_text_children: Vec<NodeId> = self
                        .graph
                        .edges
                        .iter()
                        .filter(|e| e.from.node_id() == Some(id) || e.to.node_id() == Some(id))
                        .filter_map(|e| e.text_child)
                        .collect();
                    self.graph
                        .edges
                        .retain(|e| e.from.node_id() != Some(id) && e.to.node_id() != Some(id));

                    // Remove orphaned edge text_child nodes
                    for tc_id in orphaned_text_children {
                        if let Some(tc_idx) = self.graph.index_of(tc_id) {
                            self.bounds.remove(&tc_idx);
                            self.graph.remove_node(tc_idx);
                        }
                    }
                }
            }
            GraphMutation::SetStyle { id, style } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    node.props = style;
                }
            }
            GraphMutation::SetText { id, content } => {
                if let Some(node) = self.graph.get_by_id_mut(id)
                    && let NodeKind::Text {
                        content: ref mut c, ..
                    } = node.kind
                {
                    *c = content;
                }
            }
            GraphMutation::SetNote { id, note } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    node.note = note;
                }
            }
            GraphMutation::SetAnimations { id, animations } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    node.animations = animations;
                }
            }
            GraphMutation::DuplicateNode { id } => {
                if let Some(original) = self.graph.get_by_id(id).cloned() {
                    // Incremental clone name: foo → foo_2, foo_2 → foo_3
                    let new_id = next_clone_name(&self.graph, id);
                    let mut cloned = original;
                    cloned.id = new_id;
                    // Strip inherited positioning — clone gets its own position
                    cloned.constraints.retain(|c| {
                        !matches!(
                            c,
                            Constraint::Position { .. }
                                | Constraint::Offset { .. }
                                | Constraint::CenterIn(_)
                                | Constraint::FillParent { .. }
                        )
                    });
                    // Position from resolved bounds + 20px offset
                    if let Some(idx) = self.graph.index_of(id)
                        && let Some(b) = self.bounds.get(&idx)
                    {
                        let rx = ((b.x + 20.0) * 100.0).round() / 100.0;
                        let ry = ((b.y + 20.0) * 100.0).round() / 100.0;
                        cloned
                            .constraints
                            .push(Constraint::Position { x: rx, y: ry });
                    }
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
            GraphMutation::SetStrokeWidth { id, width } => {
                if let Some(node) = self.graph.get_by_id_mut(id) {
                    if let Some(ref mut stroke) = node.props.stroke {
                        stroke.width = width;
                    } else {
                        node.props.stroke = Some(Stroke {
                            paint: Paint::Solid(Color::rgba(0.37, 0.36, 0.90, 1.0)),
                            width,
                            cap: StrokeCap::Round,
                            join: StrokeJoin::Round,
                        });
                    }
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
                let mut group_node = SceneNode::new(new_group_id, NodeKind::Group);
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

    /// Mark text as needing re-emission from the graph.
    /// Used when the graph is modified directly (e.g. z-order changes)
    /// outside of apply_mutation().
    pub fn mark_dirty(&mut self) {
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
        self.block_hashes = compute_block_hashes(new_text);
        self.graph_dirty = false;
        self.text_dirty = false;
        Ok(())
    }

    /// Incremental text update: only specific line range changed.
    ///
    /// **R2.3 — Block-level incremental parse**
    ///
    /// Instead of always doing a full re-parse, this method:
    /// 1. Splits the new text into top-level blocks (nodes, styles, edges, etc.)
    /// 2. Hashes each block and compares against cached hashes
    /// 3. Skips the full re-parse + layout resolve if no blocks changed
    /// 4. Falls back to full re-parse if blocks differ
    ///
    /// This optimization matters during fast typing — most keystrokes within
    /// a block body only change that block, and layout often doesn't change
    /// for whitespace/comment edits.
    pub fn update_text_range(
        &mut self,
        new_text: &str,
        _changed_line_start: usize,
        _changed_line_end: usize,
    ) -> Result<(), String> {
        let new_hashes = compute_block_hashes(new_text);

        // Fast path: if block hashes are identical, no structural change.
        // Just update the text without re-parsing.
        if new_hashes == self.block_hashes {
            self.text = new_text.to_string();
            return Ok(());
        }

        // Slow path: blocks changed — full re-parse.
        // Future optimization: diff block-by-block and patch only changed blocks.
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

    /// Get mutable access to resolved bounds.
    pub fn bounds_mut(&mut self) -> &mut HashMap<NodeIndex, ResolvedBounds> {
        &mut self.bounds
    }

    /// Evaluate if a dragging node is near detaching from its parent group.
    /// Returns the parent NodeId and the center coordinates of both the child and parent
    /// if the overlap is less than 25% of the child's area.
    #[allow(clippy::type_complexity)]
    pub fn evaluate_near_detach(
        &self,
        node_id: NodeId,
    ) -> Option<(NodeId, (f32, f32), (f32, f32))> {
        let child_idx = self.graph.index_of(node_id)?;
        let parent_idx = self.graph.parent(child_idx)?;

        let parent_kind = &self.graph.graph[parent_idx].kind;
        let child_kind = &self.graph.graph[child_idx].kind;

        let is_container_parent = matches!(parent_kind, NodeKind::Group | NodeKind::Frame { .. });
        if !is_container_parent {
            return None;
        }

        let mut child_b = *self.bounds.get(&child_idx)?;
        let parent_b = *self.bounds.get(&parent_idx)?;

        if let NodeKind::Text { content, .. } = child_kind {
            let font_size = self.graph.graph[child_idx]
                .props
                .font
                .as_ref()
                .map_or(14.0, |f| f.size);
            let text_w = content.chars().count() as f32 * font_size * 0.6;
            let text_h = font_size * 1.4;
            let cx = child_b.x + child_b.width / 2.0;
            let cy = child_b.y + child_b.height / 2.0;
            child_b.width = text_w;
            child_b.height = text_h;
            child_b.x = cx - text_w / 2.0;
            child_b.y = cy - text_h / 2.0;
        }

        let overlap_w = ((child_b.x + child_b.width).min(parent_b.x + parent_b.width)
            - child_b.x.max(parent_b.x))
        .max(0.0);
        let overlap_h = ((child_b.y + child_b.height).min(parent_b.y + parent_b.height)
            - child_b.y.max(parent_b.y))
        .max(0.0);

        let overlap_area = overlap_w * overlap_h;
        let child_area = child_b.width * child_b.height;

        if child_area > 0.0 && overlap_area > 0.0 && overlap_area < child_area * 0.25 {
            let child_cx = child_b.x + child_b.width / 2.0;
            let child_cy = child_b.y + child_b.height / 2.0;
            let parent_cx = parent_b.x + parent_b.width / 2.0;
            let parent_cy = parent_b.y + parent_b.height / 2.0;
            Some((
                self.graph.graph[parent_idx].id,
                (child_cx, child_cy),
                (parent_cx, parent_cy),
            ))
        } else {
            None
        }
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

    /// Post-release pass: expand parent groups/frames to contain children
    /// that overflow after resize or text growth.
    ///
    /// Only called once on pointer release — never per-frame — to avoid
    /// the "chasing envelope" bug. Processes groups bottom-up so inner
    /// groups expand first, then outer groups see the expanded children.
    /// Skips frames with `clip: true` (they intentionally clip).
    pub fn finalize_child_bounds(&mut self) -> bool {
        let groups = Self::collect_groups_bottom_up(&self.graph);
        let mut changed = false;

        for group_idx in groups {
            // Frames have declared dimensions — never auto-resize them.
            // Only Groups auto-size to their children's bounding box.
            if matches!(&self.graph.graph[group_idx].kind, NodeKind::Frame { .. }) {
                continue;
            }

            let old_bounds = self.bounds.get(&group_idx).copied();
            expand_group_to_children(&self.graph, group_idx, &mut self.bounds, None);
            if self.bounds.get(&group_idx).copied() != old_bounds {
                changed = true;
            }
        }

        if changed {
            self.text_dirty = true;
        }
        changed
    }

    /// Collect all Group/Frame node indices in bottom-up order (deepest first).
    /// This ensures inner groups expand before outer groups see them.
    fn collect_groups_bottom_up(graph: &SceneGraph) -> Vec<NodeIndex> {
        let mut result = Vec::new();
        let mut stack = vec![(graph.root, false)];

        // Post-order traversal: process children before parent
        while let Some((idx, visited)) = stack.pop() {
            if visited {
                let kind = &graph.graph[idx].kind;
                let is_container = matches!(kind, NodeKind::Group | NodeKind::Frame { .. });
                if is_container && idx != graph.root {
                    result.push(idx);
                }
                continue;
            }
            stack.push((idx, true));
            for child_idx in graph.children(idx) {
                stack.push((child_idx, false));
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
        NodeKind::Group | NodeKind::Frame { .. } => true,
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
    if let NodeKind::Text { content, .. } = child_kind {
        // Use same heuristic as intrinsic_size() in layout.rs
        let font_size = graph.graph[child_idx]
            .props
            .font
            .as_ref()
            .map_or(14.0, |f| f.size);
        let text_w = content.chars().count() as f32 * font_size * 0.6;
        let text_h = font_size * 1.4;

        // Shrink the overlap test box to the visual text area.
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
/// Groups are purely organizational — always 0 padding.
fn group_padding(graph: &SceneGraph, group_idx: NodeIndex) -> f32 {
    match &graph.graph[group_idx].kind {
        NodeKind::Group => 0.0,
        _ => 0.0,
    }
}

/// Expand a group's bounds to contain all its children.
/// If `exclude_idx` is provided, skip that child in the calculation.
pub fn expand_group_to_children(
    graph: &SceneGraph,
    group_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, fd_core::ResolvedBounds>,
    exclude_idx: Option<NodeIndex>,
) {
    // Frames have declared dimensions — never auto-resize
    if matches!(graph.graph[group_idx].kind, NodeKind::Frame { .. }) {
        return;
    }
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
pub fn detach_child_from_group(
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

    // Cascade-remove empty Group/Frame ancestors
    remove_empty_ancestors(graph, old_parent_idx, bounds);
}

/// Walk up from `start_idx`, removing empty Group/Frame containers.
/// Stops at root, non-container nodes, or containers that still have children.
fn remove_empty_ancestors(
    graph: &mut SceneGraph,
    start_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, fd_core::ResolvedBounds>,
) {
    let mut cursor = start_idx;
    loop {
        if cursor == graph.root {
            break;
        }
        if graph.graph.node_weight(cursor).is_none() {
            break;
        }
        let is_removable = matches!(
            graph.graph[cursor].kind,
            NodeKind::Group | NodeKind::Frame { .. }
        );
        if !is_removable {
            break;
        }
        if !graph.children(cursor).is_empty() {
            break;
        }

        let next_parent = graph.parent(cursor);
        bounds.remove(&cursor);
        graph.remove_node(cursor);

        match next_parent {
            Some(p) => cursor = p,
            None => break,
        }
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
        style: Properties,
    },
    SetText {
        id: NodeId,
        content: String,
    },
    SetNote {
        id: NodeId,
        note: Option<String>,
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
    /// Update a node's stroke width (e.g. from pen pressure).
    SetStrokeWidth {
        id: NodeId,
        width: f32,
    },
}

/// Derive an incremental clone name: `foo` → `foo_2`, `foo_2` → `foo_3`.
///
/// Scans the graph for existing names matching `{stem}_N` and picks `max(N)+1`.
/// The stem is derived by stripping a trailing `_N` numeric suffix (since
/// auto-generated IDs follow the `{kind}_{counter}` pattern).
pub fn next_clone_name(graph: &SceneGraph, orig_id: NodeId) -> NodeId {
    let base = orig_id.as_str();
    // Strip trailing _N suffix to get the stem (e.g. "rect_3" → "rect")
    let stem = base
        .rsplit_once('_')
        .and_then(|(prefix, suffix)| suffix.parse::<u32>().ok().map(|_| prefix))
        .unwrap_or(base);
    let mut max_n = 1u32;
    for idx in graph.graph.node_indices() {
        let name = graph.graph[idx].id.as_str();
        if name == stem {
            max_n = max_n.max(1);
        }
        if let Some(rest) = name.strip_prefix(stem)
            && let Some(n_str) = rest.strip_prefix('_')
            && let Ok(n) = n_str.parse::<u32>()
        {
            max_n = max_n.max(n);
        }
    }
    NodeId::intern(&format!("{stem}_{}", max_n + 1))
}

// ─── Block Hashing (R2.3 Incremental Parse) ──────────────────────────────

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Keyword prefixes that signal the start of a top-level block in FD text.
const BLOCK_STARTERS: &[&str] = &[
    "rect ",
    "rect@",
    "rect{",
    "ellipse ",
    "ellipse@",
    "ellipse{",
    "text ",
    "text@",
    "text{",
    "text\"",
    "frame ",
    "frame@",
    "frame{",
    "group ",
    "group@",
    "group{",
    "path ",
    "path@",
    "path{",
    "image ",
    "image@",
    "image{",
    "generic ",
    "generic@",
    "generic{",
    "style ",
    "style{",
    "edge_defaults ",
    "edge_defaults{",
    "edge ",
    "edge@",
    "edge{",
    "import ",
    "@", // constraint lines like `@node -> center_in: canvas`
];

/// Split FD text into top-level blocks and hash each one.
///
/// A "block" starts at any line that begins at column 0 with a known keyword
/// (not indented). The block continues until the next such line.
/// Returns a list of hashes, one per block. Comment-only blocks and blank
/// lines between blocks are folded into the preceding block.
fn compute_block_hashes(text: &str) -> Vec<u64> {
    let mut hashes = Vec::new();
    let mut current_block = String::new();

    for line in text.lines() {
        let trimmed = line.trim_start();
        let is_new_block = !line.starts_with(' ')
            && !line.starts_with('\t')
            && !trimmed.is_empty()
            && !trimmed.starts_with('#')
            && BLOCK_STARTERS.iter().any(|s| trimmed.starts_with(s));

        if is_new_block && !current_block.is_empty() {
            hashes.push(hash_str(&current_block));
            current_block.clear();
        }

        current_block.push_str(line);
        current_block.push('\n');
    }

    if !current_block.is_empty() {
        hashes.push(hash_str(&current_block));
    }

    hashes
}

/// FNV-style hash for a string.
fn hash_str(s: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
#[path = "sync_tests.rs"]
mod tests;

#[cfg(test)]
mod incremental_tests {
    use super::*;
    use fd_core::Viewport;

    fn vp() -> Viewport {
        Viewport {
            width: 800.0,
            height: 600.0,
        }
    }

    #[test]
    fn sync_incremental_no_change() {
        let text = "rect @box { w: 100 h: 50 }\n";
        let mut engine = SyncEngine::from_text(text, vp()).unwrap();

        // Same text with minor whitespace → block hash should still match
        let result = engine.update_text_range(text, 0, 0);
        assert!(result.is_ok(), "no-change update should succeed");
    }

    #[test]
    fn sync_incremental_modify_node() {
        let text = "rect @box { w: 100 h: 50 }\n";
        let mut engine = SyncEngine::from_text(text, vp()).unwrap();

        // Change width → different block hash → full re-parse
        let new_text = "rect @box { w: 200 h: 50 }\n";
        let result = engine.update_text_range(new_text, 0, 0);
        assert!(result.is_ok(), "modify-node update should succeed");

        // Verify the graph was updated
        let emitted = engine.current_text().to_string();
        assert!(
            emitted.contains("200"),
            "graph should reflect new width, got: {emitted}"
        );
    }

    #[test]
    fn sync_incremental_add_node() {
        let text = "rect @box { w: 100 h: 50 }\n";
        let mut engine = SyncEngine::from_text(text, vp()).unwrap();

        let new_text = "rect @box { w: 100 h: 50 }\nellipse @circle { w: 80 h: 80 }\n";
        let result = engine.update_text_range(new_text, 1, 1);
        assert!(result.is_ok(), "add-node update should succeed");
    }

    #[test]
    fn sync_incremental_remove_node() {
        let text = "rect @box { w: 100 h: 50 }\nellipse @circle { w: 80 h: 80 }\n";
        let mut engine = SyncEngine::from_text(text, vp()).unwrap();

        let new_text = "rect @box { w: 100 h: 50 }\n";
        let result = engine.update_text_range(new_text, 1, 1);
        assert!(result.is_ok(), "remove-node update should succeed");
    }

    #[test]
    fn block_hashing_stability() {
        let text1 = "rect @a { w: 100 h: 50 }\nellipse @b { w: 80 h: 80 }\n";
        let text2 = "rect @a { w: 100 h: 50 }\nellipse @b { w: 80 h: 80 }\n";
        assert_eq!(compute_block_hashes(text1), compute_block_hashes(text2));
    }

    #[test]
    fn block_hashing_detects_change() {
        let text1 = "rect @a { w: 100 h: 50 }\nellipse @b { w: 80 h: 80 }\n";
        let text2 = "rect @a { w: 200 h: 50 }\nellipse @b { w: 80 h: 80 }\n";
        let h1 = compute_block_hashes(text1);
        let h2 = compute_block_hashes(text2);
        assert_ne!(h1, h2, "different blocks should produce different hashes");
    }
}
