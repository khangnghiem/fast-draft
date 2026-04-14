//! Selection, deletion, duplication, grouping, and selection bounds.

use crate::FdCanvas;
use fd_core::id::NodeId;
use fd_core::model::{Constraint, NodeKind};
use fd_editor::sync::{GraphMutation, next_clone_name};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl FdCanvas {
    /// Get the currently selected node ID, or empty string if none.
    /// Returns the first selected node.
    pub fn get_selected_id(&self) -> String {
        self.select_tool
            .first_selected()
            .map(|id| id.as_str().to_string())
            .unwrap_or_default()
    }

    /// Get all selected node IDs as a JSON array.
    pub fn get_selected_ids(&self) -> String {
        let ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();
        serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
    }

    /// Select a node by its ID (e.g. from text editor cursor).
    /// Returns `true` if the node was found and selected.
    pub fn select_by_id(&mut self, node_id: &str) -> bool {
        if node_id.is_empty() {
            self.select_tool.selected.clear();
            self.select_tool.visual_highlight.clear();
            return true;
        }
        let id = NodeId::intern(node_id);
        // Accept both scene-tree nodes and edges
        let is_node = self.engine.graph.get_by_id(id).is_some();
        let is_edge = self.engine.graph.edges.iter().any(|e| e.id == id);
        if is_node || is_edge {
            self.select_tool.selected = vec![id];
            self.select_tool.visual_highlight = vec![id];
            true
        } else {
            false
        }
    }

    /// Toggle a node in/out of the current selection (⌘+click in layers).
    /// If the node is already selected, deselect it. Otherwise, add it.
    /// Returns true if the node was found (valid id).
    pub fn toggle_select_by_id(&mut self, node_id: &str) -> bool {
        if node_id.is_empty() {
            return false;
        }
        let id = NodeId::intern(node_id);
        let is_node = self.engine.graph.get_by_id(id).is_some();
        let is_edge = self.engine.graph.edges.iter().any(|e| e.id == id);
        if !is_node && !is_edge {
            return false;
        }
        if let Some(pos) = self.select_tool.selected.iter().position(|&s| s == id) {
            self.select_tool.selected.remove(pos);
            self.select_tool.visual_highlight.retain(|&s| s != id);
        } else {
            self.select_tool.selected.push(id);
            self.select_tool.visual_highlight.push(id);
        }
        true
    }

    /// Add a node to the current selection without clearing (⌘+click add mode).
    /// Returns true if the node was found and added (ignores if already selected).
    pub fn add_to_selection(&mut self, node_id: &str) -> bool {
        if node_id.is_empty() {
            return false;
        }
        let id = NodeId::intern(node_id);
        let is_node = self.engine.graph.get_by_id(id).is_some();
        let is_edge = self.engine.graph.edges.iter().any(|e| e.id == id);
        if !is_node && !is_edge {
            return false;
        }
        if !self.select_tool.selected.contains(&id) {
            self.select_tool.selected.push(id);
            self.select_tool.visual_highlight.push(id);
        }
        true
    }

    /// Select multiple nodes by their IDs from a JSON array (⇧+click range select).
    /// Replaces the current selection with the provided IDs.
    /// Returns the number of valid nodes that were selected.
    pub fn select_multiple_by_ids(&mut self, ids_json: &str) -> u32 {
        let ids: Vec<String> = serde_json::from_str(ids_json).unwrap_or_default();
        self.select_tool.selected.clear();
        self.select_tool.visual_highlight.clear();
        let mut count = 0u32;
        for id_str in &ids {
            let id = NodeId::intern(id_str);
            let is_node = self.engine.graph.get_by_id(id).is_some();
            let is_edge = self.engine.graph.edges.iter().any(|e| e.id == id);
            if is_node || is_edge {
                self.select_tool.selected.push(id);
                self.select_tool.visual_highlight.push(id);
                count += 1;
            }
        }
        count
    }

    /// Select all nodes and edges in the graph.
    /// Replaces the current selection.
    /// Returns the number of items selected.
    pub fn select_all(&mut self) -> u32 {
        self.select_tool.selected.clear();
        self.select_tool.visual_highlight.clear();
        let mut count = 0u32;

        // Add all nodes except root
        let root_idx = self.engine.graph.root;
        for idx in self.engine.graph.graph.node_indices() {
            if idx != root_idx && !self.engine.graph.graph[idx].locked {
                let id = self.engine.graph.graph[idx].id;
                self.select_tool.selected.push(id);
                self.select_tool.visual_highlight.push(id);
                count += 1;
            }
        }

        // Add all edges
        for edge in &self.engine.graph.edges {
            self.select_tool.selected.push(edge.id);
            self.select_tool.visual_highlight.push(edge.id);
            count += 1;
        }
        count
    }

    /// Clear the pressed interaction state.
    ///
    /// Called from JS when entering inline text editing to suppress
    /// press animations that cause a visual shape jump on double-click.
    pub fn clear_pressed(&mut self) {
        self.pressed_id = None;
    }

    /// Delete the currently selected node(s). Returns true if any was deleted.
    pub fn delete_selected(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }
        let ids: Vec<NodeId> = self.select_tool.selected.clone();
        // Emit RemoveEdge for edge IDs, RemoveNode for node IDs (skip locked nodes)
        let mutations: Vec<GraphMutation> = ids
            .iter()
            .filter_map(|id| {
                if self.engine.graph.edges.iter().any(|e| e.id == *id) {
                    Some(GraphMutation::RemoveEdge { id: *id })
                } else if self.engine.graph.get_by_id(*id).is_some_and(|n| n.locked) {
                    None // Skip locked nodes
                } else {
                    Some(GraphMutation::RemoveNode { id: *id })
                }
            })
            .collect();

        // Wrap in a batch so multi-delete (including edge cleanup) is
        // a single atomic undo step via text snapshot.
        self.commands.begin_batch(&mut self.engine);
        for mutation in mutations {
            self.commands
                .execute(&mut self.engine, mutation, "delete selected");
        }
        self.engine.resolve();
        self.commands.end_batch(&mut self.engine);

        self.select_tool.selected.clear();
        self.select_tool.visual_highlight.clear();
        self.engine.flush_to_text();
        true
    }

    /// Capture bounds of currently selected nodes before Alt+drag duplication.
    /// Called right before `duplicate_selected_at` so the ghost shows the
    /// original positions (before selection transfers to clones).
    pub(crate) fn capture_alt_clone_origins(&mut self) {
        self.alt_clone_origins.clear();
        for &id in &self.select_tool.selected {
            if let Some(idx) = self.engine.graph.index_of(id)
                && let Some(b) = self.engine.current_bounds().get(&idx)
            {
                self.alt_clone_origins.push((b.x, b.y, b.width, b.height));
            }
        }
    }

    /// Get ghost origin bounds for Alt+drag visual feedback.
    /// Returns a JSON array of `{x, y, w, h}` objects, or empty string
    /// if no Alt+drag clone is active.
    pub fn get_alt_drag_ghost(&self) -> String {
        if self.alt_clone_origins.is_empty() {
            return String::new();
        }
        let entries: Vec<crate::responses::BoundsInfo> = self
            .alt_clone_origins
            .iter()
            .map(|(x, y, w, h)| crate::responses::BoundsInfo {
                x: *x,
                y: *y,
                w: *w,
                h: *h,
            })
            .collect();
        serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string())
    }

    /// Duplicate the currently selected node(s). Returns true if duplicated.
    pub fn duplicate_selected(&mut self) -> bool {
        self.duplicate_selected_at(20.0, 20.0)
    }

    /// Duplicate selected node(s) with a custom offset. Returns true if duplicated.
    /// Handles multi-select: clones ALL selected nodes, deep-copies Group/Frame
    /// subtrees, remaps internal references, and duplicates edges between them.
    /// Use (0, 0) for Alt+drag clone-in-place.
    pub fn duplicate_selected_at(&mut self, dx: f32, dy: f32) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }

        let selected_ids: Vec<NodeId> = self.select_tool.selected.clone();
        let mut id_map: std::collections::HashMap<NodeId, NodeId> =
            std::collections::HashMap::new();
        let mut mutations: Vec<GraphMutation> = Vec::new();

        // Phase 1: Clone each selected node (+ descendants for Group/Frame)
        for &orig_id in &selected_ids {
            self.clone_node_recursive(orig_id, dx, dy, &selected_ids, &mut id_map, &mut mutations);
        }

        if mutations.is_empty() {
            return false;
        }

        // Phase 2: Remap internal references in cloned nodes
        // Constraints (Offset.from, CenterIn) that reference other cloned
        // nodes should point to the clone, not the original.
        for mutation in &mut mutations {
            if let GraphMutation::AddNode { node, .. } = mutation {
                for constraint in &mut node.constraints {
                    match constraint {
                        fd_core::model::Constraint::Offset { from, .. } => {
                            if let Some(&new_from) = id_map.get(from) {
                                *from = new_from;
                            }
                        }
                        fd_core::model::Constraint::CenterIn(target) => {
                            if let Some(&new_target) = id_map.get(target) {
                                *target = new_target;
                            }
                        }
                        _ => {}
                    }
                }
            }
        }

        // Phase 3: Duplicate edges where both endpoints are in the cloned set
        let edge_mutations = self.clone_edges_between(&id_map);
        mutations.extend(edge_mutations);

        // Phase 4: Apply all mutations at once
        let changed = self.apply_mutations(mutations);
        if changed {
            // Transfer selection to the new clones (only top-level, not
            // descendants — matching the original selection granularity)
            let new_ids: Vec<NodeId> = selected_ids
                .iter()
                .filter_map(|old| id_map.get(old).copied())
                .collect();
            self.select_tool.selected = new_ids.clone();
            self.select_tool.visual_highlight = new_ids;
            self.engine.flush_to_text();
        }
        changed
    }

    /// Clone a single node and (if Group/Frame) all its descendants.
    /// Populates `id_map` (old→new) and appends AddNode mutations.
    fn clone_node_recursive(
        &self,
        orig_id: NodeId,
        dx: f32,
        dy: f32,
        selected_ids: &[NodeId],
        id_map: &mut std::collections::HashMap<NodeId, NodeId>,
        mutations: &mut Vec<GraphMutation>,
    ) {
        // Skip if already cloned (e.g. child of a previously cloned group)
        if id_map.contains_key(&orig_id) {
            return;
        }

        let original = match self.engine.graph.get_by_id(orig_id) {
            Some(node) => node.clone(),
            None => return,
        };

        // Incremental clone name: foo → foo_2, foo_2 → foo_3
        // Pass already-generated names so batch duplicates get distinct suffixes
        let taken: Vec<NodeId> = id_map.values().copied().collect();
        let new_id = next_clone_name(&self.engine.graph, orig_id, &taken);
        id_map.insert(orig_id, new_id);

        let mut cloned = original;
        cloned.id = new_id;

        // Top-level selected nodes get independent position from resolved bounds.
        // Strip inherited positioning constraints so the clone doesn't overlap
        // the original (fixes selection coupling + drag inversion bugs).
        if selected_ids.contains(&orig_id) {
            cloned.constraints.retain(|c| {
                !matches!(
                    c,
                    Constraint::Position { .. }
                        | Constraint::Offset { .. }
                        | Constraint::CenterIn(_)
                        | Constraint::FillParent { .. }
                )
            });
            if let Some(idx) = self.engine.graph.index_of(orig_id)
                && let Some(b) = self.engine.current_bounds().get(&idx)
            {
                let rx = ((b.x + dx) * 100.0).round() / 100.0;
                let ry = ((b.y + dy) * 100.0).round() / 100.0;
                cloned
                    .constraints
                    .push(Constraint::Position { x: rx, y: ry });
            }
        }

        // Determine parent for the clone
        let parent_id = if selected_ids.contains(&orig_id) {
            NodeId::intern("root")
        } else {
            // This is a descendant — find its parent and use the cloned parent
            let orig_idx = self.engine.graph.index_of(orig_id);
            let parent_idx = orig_idx.and_then(|idx| self.engine.graph.parent(idx));
            let parent_orig_id = parent_idx.map(|pidx| self.engine.graph.graph[pidx].id);
            parent_orig_id
                .and_then(|pid| id_map.get(&pid).copied())
                .unwrap_or_else(|| NodeId::intern("root"))
        };

        mutations.push(GraphMutation::AddNode {
            parent_id,
            node: Box::new(cloned),
        });

        // Deep-copy children for Group/Frame nodes
        let orig_kind = self
            .engine
            .graph
            .get_by_id(orig_id)
            .map(|n| &n.kind)
            .cloned();
        let is_container = matches!(
            orig_kind.as_ref(),
            Some(NodeKind::Group)
                | Some(NodeKind::Frame { .. })
                | Some(NodeKind::Rect { .. })
                | Some(NodeKind::Ellipse { .. })
        );
        if is_container && let Some(orig_idx) = self.engine.graph.index_of(orig_id) {
            let children = self.engine.graph.children(orig_idx);
            for child_idx in children {
                let child_id = self.engine.graph.graph[child_idx].id;
                self.clone_node_recursive(child_id, 0.0, 0.0, &[], id_map, mutations);
            }
        }
    }

    /// Clone edges where both endpoints are in the id_map (i.e., both
    /// endpoints were cloned). Returns AddEdge mutations.
    fn clone_edges_between(
        &self,
        id_map: &std::collections::HashMap<NodeId, NodeId>,
    ) -> Vec<GraphMutation> {
        let mut edge_mutations = Vec::new();
        for edge in &self.engine.graph.edges {
            let from_id = edge.from.node_id();
            let to_id = edge.to.node_id();

            // Only clone if both endpoints were cloned
            let new_from = from_id.and_then(|id| id_map.get(&id).copied());
            let new_to = to_id.and_then(|id| id_map.get(&id).copied());

            if let (Some(nf), Some(nt)) = (new_from, new_to) {
                let new_edge_id = next_clone_name(&self.engine.graph, edge.id, &[]);

                // Remap text_child if it was also cloned
                let new_text_child = edge.text_child.and_then(|tc| id_map.get(&tc).copied());

                let cloned_edge = fd_core::model::Edge {
                    id: new_edge_id,
                    from: fd_core::model::EdgeAnchor::Node(nf),
                    to: fd_core::model::EdgeAnchor::Node(nt),
                    text_child: new_text_child,
                    props: edge.props.clone(),
                    use_styles: edge.use_styles.clone(),
                    arrow: edge.arrow,
                    curve: edge.curve,
                    spec: edge.spec.clone(),
                    animations: edge.animations.clone(),
                    flow: edge.flow,
                    label_offset: edge.label_offset,
                };
                edge_mutations.push(GraphMutation::AddEdge {
                    edge: Box::new(cloned_edge),
                });
            }
        }
        edge_mutations
    }

    /// Group the currently selected nodes. Returns true if grouped.
    pub fn group_selected(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }
        let ids: Vec<NodeId> = self.select_tool.selected.clone();
        let new_group_id = NodeId::anonymous("group");
        let mutation = GraphMutation::GroupNodes { ids, new_group_id };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.select_tool.selected = vec![new_group_id];
            self.select_tool.visual_highlight = vec![new_group_id];
            self.engine.flush_to_text();
        }
        changed
    }

    /// Ungroup all selected groups. Returns true if any were ungrouped.
    pub fn ungroup_selected(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }

        // Collect all selected nodes that are groups
        let group_ids: Vec<NodeId> = self
            .select_tool
            .selected
            .iter()
            .copied()
            .filter(|id| {
                self.engine
                    .graph
                    .get_by_id(*id)
                    .is_some_and(|n| matches!(n.kind, fd_core::model::NodeKind::Group))
            })
            .collect();

        if group_ids.is_empty() {
            return false;
        }

        // Collect children of all groups (for post-ungroup selection)
        let mut all_children: Vec<NodeId> = Vec::new();
        // Also keep non-group selected nodes in the selection
        let non_group_selected: Vec<NodeId> = self
            .select_tool
            .selected
            .iter()
            .copied()
            .filter(|id| !group_ids.contains(id))
            .collect();

        for &gid in &group_ids {
            if let Some(idx) = self.engine.graph.index_of(gid) {
                let children: Vec<NodeId> = self
                    .engine
                    .graph
                    .children(idx)
                    .iter()
                    .map(|c| self.engine.graph.graph[*c].id)
                    .collect();
                all_children.extend(children);
            }
        }

        // Apply ungroup mutations
        let mut changed = false;
        for gid in group_ids {
            let mutation = GraphMutation::UngroupNode { id: gid };
            if self.apply_mutations(vec![mutation]) {
                changed = true;
            }
        }

        if changed {
            // Select the promoted children + any non-group items that were selected
            self.select_tool.selected = non_group_selected;
            self.select_tool.selected.extend(all_children.iter());
            self.select_tool.visual_highlight = self.select_tool.selected.clone();
            self.engine.flush_to_text();
        }
        changed
    }

    /// Reverses the direction of all currently selected edges. Returns true if reversed.
    pub fn reverse_selected_edges(&mut self) -> bool {
        if self.select_tool.selected.is_empty() {
            return false;
        }

        let mutations: Vec<GraphMutation> = self
            .select_tool
            .selected
            .iter()
            .copied()
            .filter(|id| self.engine.graph.edges.iter().any(|e| e.id == *id))
            .map(|id| GraphMutation::ReverseEdge { id })
            .collect();

        if mutations.is_empty() {
            return false;
        }

        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Get the union bounding box of all currently selected nodes (including children).
    /// Returns `[x, y, width, height]` array, or `None` if selection is empty.
    pub fn get_selection_bounds(&self) -> Option<js_sys::Float64Array> {
        if self.select_tool.selected.is_empty() {
            return None;
        }

        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;
        let mut found = false;

        let bounds = self.engine.current_bounds();

        // Recursively find bounds for a node and its children
        #[allow(clippy::too_many_arguments)]
        fn expand_bounds(
            graph: &fd_core::model::SceneGraph,
            bounds_map: &std::collections::HashMap<fd_core::NodeIndex, fd_core::ResolvedBounds>,
            idx: fd_core::NodeIndex,
            min_x: &mut f32,
            min_y: &mut f32,
            max_x: &mut f32,
            max_y: &mut f32,
            found: &mut bool,
        ) {
            if let Some(b) = bounds_map.get(&idx) {
                *min_x = (*min_x).min(b.x);
                *min_y = (*min_y).min(b.y);
                *max_x = (*max_x).max(b.x + b.width);
                *max_y = (*max_y).max(b.y + b.height);
                *found = true;
            }
            for child in graph.children(idx) {
                expand_bounds(graph, bounds_map, child, min_x, min_y, max_x, max_y, found);
            }
        }

        for id in &self.select_tool.selected {
            if let Some(idx) = self.engine.graph.index_of(*id) {
                expand_bounds(
                    &self.engine.graph,
                    bounds,
                    idx,
                    &mut min_x,
                    &mut min_y,
                    &mut max_x,
                    &mut max_y,
                    &mut found,
                );
            }
        }

        if !found {
            return None;
        }

        let arr = js_sys::Float64Array::new_with_length(4);
        arr.set_index(0, min_x as f64);
        arr.set_index(1, min_y as f64);
        arr.set_index(2, (max_x - min_x) as f64);
        arr.set_index(3, (max_y - min_y) as f64);
        Some(arr)
    }

    /// Parse FD text and insert as new nodes with unique IDs.
    /// Returns JSON: {"ok": true, "count": N, "tier": 1|2|3, "ids": [...]}
    pub fn paste_fd(&mut self, text: &str, dx: f32, dy: f32) -> String {
        use fd_core::model::{Constraint, NodeKind, SceneGraph, SceneNode};
        use fd_core::parser::parse_document;
        use fd_editor::sync::GraphMutation;
        use std::collections::HashMap;

        let mut tier = 1;
        let temp_graph = match parse_document(text) {
            Ok(g) => {
                if g.graph.node_count() <= 1 {
                    tier = 2; // Empty document, fallback to text node
                    let mut fallback = SceneGraph::new();
                    let node = SceneNode::new(
                        fd_core::id::NodeId::anonymous("text"),
                        NodeKind::Text {
                            content: text.to_string(),
                            max_width: None,
                        },
                    );
                    fallback.add_node(fallback.root, node);
                    fallback
                } else {
                    g
                }
            }
            Err(_) => {
                tier = 3;
                let mut fallback = SceneGraph::new();
                let node = SceneNode::new(
                    fd_core::id::NodeId::anonymous("text"),
                    NodeKind::Text {
                        content: text.to_string(),
                        max_width: None,
                    },
                );
                fallback.add_node(fallback.root, node);
                fallback
            }
        };

        let mut id_map: HashMap<NodeId, NodeId> = HashMap::new();
        let mut mutations = Vec::new();
        let mut taken: Vec<NodeId> = Vec::new();
        let root_idx = temp_graph.root;

        let mut queue: Vec<_> = temp_graph.children(root_idx);
        while !queue.is_empty() {
            let orig_idx = queue.remove(0);
            for child in temp_graph.children(orig_idx) {
                queue.push(child);
            }

            let original = temp_graph.graph[orig_idx].clone();
            let orig_id = original.id;

            // Get parent ID in temp_graph
            let mut parent_id = None;
            if let Some(p_idx) = temp_graph.parent(orig_idx)
                && p_idx != root_idx
            {
                let old_pid = temp_graph.graph[p_idx].id;
                parent_id = id_map.get(&old_pid).copied();
            }

            let new_id = next_clone_name(&self.engine.graph, orig_id, &taken);
            id_map.insert(orig_id, new_id);
            taken.push(new_id);

            let mut cloned = original;
            cloned.id = new_id;

            // Offset to match paste location (only for top-level)
            if parent_id.is_none() {
                for c in &mut cloned.constraints {
                    if let Constraint::Position { x, y } = c {
                        *x += dx;
                        *y += dy;
                    }
                }
            }

            // Remap references in constraints
            for c in &mut cloned.constraints {
                match c {
                    Constraint::Offset { from, .. } => {
                        if let Some(&new_from) = id_map.get(from) {
                            *from = new_from;
                        }
                    }
                    Constraint::CenterIn(target) => {
                        if let Some(&new_target) = id_map.get(target) {
                            *target = new_target;
                        }
                    }
                    _ => {}
                }
            }

            mutations.push(GraphMutation::AddNode {
                parent_id: parent_id.unwrap_or_else(|| fd_core::id::NodeId::intern("root")),
                node: Box::new(cloned),
            });
        }

        // Phase 2: Duplicate edges from temp_graph
        for edge in &temp_graph.edges {
            let new_from = match &edge.from {
                fd_core::model::EdgeAnchor::Node(id) => id_map
                    .get(id)
                    .copied()
                    .map(fd_core::model::EdgeAnchor::Node),
                fd_core::model::EdgeAnchor::Point(x, y) => {
                    Some(fd_core::model::EdgeAnchor::Point(*x + dx, *y + dy))
                }
            };
            let new_to = match &edge.to {
                fd_core::model::EdgeAnchor::Node(id) => id_map
                    .get(id)
                    .copied()
                    .map(fd_core::model::EdgeAnchor::Node),
                fd_core::model::EdgeAnchor::Point(x, y) => {
                    Some(fd_core::model::EdgeAnchor::Point(*x + dx, *y + dy))
                }
            };

            if let (Some(nf), Some(nt)) = (new_from, new_to) {
                let mut new_edge = edge.clone();
                new_edge.id = next_clone_name(&self.engine.graph, edge.id, &taken);
                taken.push(new_edge.id);
                new_edge.from = nf;
                new_edge.to = nt;
                new_edge.text_child = edge.text_child.and_then(|tc| id_map.get(&tc).copied());
                mutations.push(GraphMutation::AddEdge {
                    edge: Box::new(new_edge),
                });
            }
        }

        if mutations.is_empty() {
            return r#"{"ok":false}"#.to_string();
        }

        // Apply mutations
        self.commands.begin_batch(&mut self.engine);
        let mut count = 0;
        for mutation in mutations {
            self.commands
                .execute(&mut self.engine, mutation, "paste clipboard");
            count += 1;
        }
        self.engine.resolve();
        self.commands.end_batch(&mut self.engine);

        // Select the newly pasted items
        self.select_tool.selected.clear();
        self.select_tool.visual_highlight.clear();
        for &new_id in taken.iter() {
            self.select_tool.selected.push(new_id);
            self.select_tool.visual_highlight.push(new_id);
        }

        self.engine.flush_to_text();

        let json = serde_json::json!({
            "ok": true,
            "count": count,
            "tier": tier,
            "ids": taken.iter().map(|id| id.as_str()).collect::<Vec<&str>>(),
        });
        json.to_string()
    }
}
