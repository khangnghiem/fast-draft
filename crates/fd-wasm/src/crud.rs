//! Node and edge creation APIs, detach/drop evaluation, and finalize bounds.

use crate::FdCanvas;
use crate::responses::{DropResult, NearDetachResult};
use fd_core::id::NodeId;
use fd_core::model::{
    ArrowKind, Color, Constraint, CurveKind, Edge, EdgeAnchor, LayoutMode, NodeKind, Paint,
    SceneNode, Stroke, StrokeCap, StrokeJoin,
};
use fd_editor::sync::GraphMutation;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl FdCanvas {
    /// Create a node at a specific position (for drag-and-drop).
    pub fn create_node_at(&mut self, kind: &str, x: f32, y: f32) -> bool {
        let id = NodeId::anonymous(kind);
        let node_kind = match kind {
            "rect" => NodeKind::Rect {
                width: 100.0,
                height: 80.0,
            },
            "ellipse" => NodeKind::Ellipse { rx: 50.0, ry: 40.0 },
            "text" => NodeKind::Text {
                content: "Text".to_string(),
                max_width: None,
            },
            "frame" => NodeKind::Frame {
                width: 200.0,
                height: 150.0,
                clip: false,
                layout: LayoutMode::Free { pad: 0.0 },
            },
            _ => return false,
        };
        let mut node = SceneNode::new(id, node_kind);
        node.constraints.push(Constraint::Position { x, y });

        // Transparent fill + contextual stroke (adapts to canvas theme)
        let stroke_color = if self.dark_mode {
            Color::rgba(0.63, 0.63, 0.69, 1.0)
        } else {
            Color::rgba(0.2, 0.2, 0.2, 1.0)
        };

        if kind == "frame" {
            node.props.fill = Some(Paint::Solid(Color::rgba(0.95, 0.95, 0.97, 1.0)));
            node.props.stroke = Some(Stroke {
                paint: Paint::Solid(Color::rgba(0.75, 0.75, 0.8, 1.0)),
                width: 1.0,
                cap: StrokeCap::Butt,
                join: StrokeJoin::Miter,
            });
        } else if kind == "rect" {
            node.props.stroke = Some(Stroke {
                paint: Paint::Solid(stroke_color),
                width: 2.5,
                cap: StrokeCap::Round,
                join: StrokeJoin::Round,
            });
            node.props.corner_radius = Some(8.0);
        } else if kind == "ellipse" {
            node.props.stroke = Some(Stroke {
                paint: Paint::Solid(stroke_color),
                width: 2.5,
                cap: StrokeCap::Round,
                join: StrokeJoin::Round,
            });
        }

        let mutation = GraphMutation::AddNode {
            parent_id: NodeId::intern("root"),
            node: Box::new(node),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.select_tool.selected = vec![id];
            self.select_tool.visual_highlight = vec![id];
            self.engine.flush_to_text();
        }
        changed
    }

    /// Create a text node as a child of an existing shape.
    pub fn create_child_text(&mut self, parent_id: &str, content: &str) -> String {
        let pid = NodeId::intern(parent_id);
        let is_shape = self.engine.graph.get_by_id(pid).is_some_and(|n| {
            matches!(
                n.kind,
                NodeKind::Rect { .. } | NodeKind::Ellipse { .. } | NodeKind::Frame { .. }
            )
        });
        if !is_shape {
            return String::new();
        }
        let child_id = NodeId::anonymous("text");
        let node = SceneNode::new(
            child_id,
            NodeKind::Text {
                content: content.to_string(),
                max_width: None,
            },
        );
        let mutation = GraphMutation::AddNode {
            parent_id: pid,
            node: Box::new(node),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.select_tool.selected = vec![child_id];
            self.select_tool.visual_highlight = vec![child_id];
            self.engine.flush_to_text();
            child_id.as_str().to_string()
        } else {
            String::new()
        }
    }

    /// Get the ID of the first text child node of a shape.
    pub fn get_text_child_id(&self, parent_id: &str) -> String {
        let pid = NodeId::intern(parent_id);
        if let Some(parent_idx) = self.engine.graph.index_of(pid) {
            for child_idx in self.engine.graph.children(parent_idx) {
                if matches!(
                    self.engine.graph.graph[child_idx].kind,
                    NodeKind::Text { .. }
                ) {
                    return self.engine.graph.graph[child_idx].id.as_str().to_string();
                }
            }
        }
        String::new()
    }

    /// Create an edge between two nodes.
    pub fn create_edge(&mut self, from_id: &str, to_id: &str) -> String {
        let from = NodeId::intern(from_id);
        let to = NodeId::intern(to_id);
        if from == to {
            return String::new();
        }
        if self.engine.graph.index_of(from).is_none() || self.engine.graph.index_of(to).is_none() {
            return String::new();
        }
        if self
            .engine
            .graph
            .edges
            .iter()
            .any(|e| e.id == from || e.id == to)
        {
            return String::new();
        }
        let edge_id = NodeId::with_prefix("edge");
        let edge = Edge {
            id: edge_id,
            from: EdgeAnchor::Node(from),
            to: EdgeAnchor::Node(to),
            text_child: None,
            props: fd_core::model::Properties::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::End,
            curve: CurveKind::Smooth,
            note: None,
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        let mutation = GraphMutation::AddEdge {
            edge: Box::new(edge),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.engine.flush_to_text();
            edge_id.as_str().to_string()
        } else {
            String::new()
        }
    }

    /// Create a standalone edge with point anchors.
    pub fn create_edge_at(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) -> String {
        let edge_id = NodeId::with_prefix("edge");
        let edge = Edge {
            id: edge_id,
            from: EdgeAnchor::Point(x1, y1),
            to: EdgeAnchor::Point(x2, y2),
            text_child: None,
            props: fd_core::model::Properties::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::End,
            curve: CurveKind::Straight,
            note: None,
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        let mutation = GraphMutation::AddEdge {
            edge: Box::new(edge),
        };
        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.engine.flush_to_text();
            edge_id.as_str().to_string()
        } else {
            String::new()
        }
    }

    /// Find the edge whose text_child matches the given text node ID.
    pub fn find_edge_for_text(&self, text_id: &str) -> String {
        let id = NodeId::intern(text_id);
        for edge in &self.engine.graph.edges {
            if edge.text_child == Some(id) {
                return edge.id.as_str().to_string();
            }
        }
        String::new()
    }

    /// Detach a text child from its parent edge.
    pub fn detach_text_from_edge(&mut self, text_id: &str) -> String {
        let id = NodeId::intern(text_id);
        let mut edge_id_str = String::new();
        for edge in &mut self.engine.graph.edges {
            if edge.text_child == Some(id) {
                edge_id_str = edge.id.as_str().to_string();
                edge.text_child = None;
                break;
            }
        }
        if !edge_id_str.is_empty() {
            self.engine.flush_to_text();
        }
        edge_id_str
    }

    /// Evaluate a drop for structural detach.
    pub fn evaluate_drop(&mut self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        if self.engine.evaluate_drop(id) {
            match self.engine.last_detach.take() {
                Some((child_id, parent_id)) => serde_json::to_string(&DropResult {
                    detached: true,
                    node_id: child_id.as_str().to_string(),
                    from_group_id: parent_id.as_str().to_string(),
                })
                .unwrap_or_default(),
                None => String::new(),
            }
        } else {
            String::new()
        }
    }

    /// Evaluate if a dragging node is near detaching from its parent group.
    pub fn evaluate_near_detach(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        if let Some((parent_id, (child_cx, child_cy), (parent_cx, parent_cy))) =
            self.engine.evaluate_near_detach(id)
        {
            serde_json::to_string(&NearDetachResult {
                parent_id: parent_id.as_str().to_string(),
                child_cx,
                child_cy,
                parent_cx,
                parent_cy,
            })
            .unwrap_or_default()
        } else {
            String::new()
        }
    }

    /// Post-release: expand parent groups to contain overflowing children.
    pub fn finalize_bounds(&mut self) -> bool {
        let changed = self.engine.finalize_child_bounds();
        if changed {
            self.engine.flush_to_text();
            self.rebuild_spatial_index();
        }
        changed
    }

    /// Validate reparent preconditions (shared by reparent_into and reparent_into_centered).
    /// Returns (child_idx, target_idx) on success, or None if validation fails.
    fn validate_reparent(
        &self,
        child_id: &str,
        target_id: &str,
    ) -> Option<(fd_core::NodeIndex, fd_core::NodeIndex)> {
        let child = NodeId::intern(child_id);
        let target = NodeId::intern(target_id);

        if child == target {
            return None;
        }

        let child_idx = self.engine.graph.index_of(child)?;

        let target_idx = if target_id == "root" {
            self.engine.graph.root
        } else {
            self.engine.graph.index_of(target)?
        };

        // Skip if already a child of that parent
        if self.engine.graph.parent(child_idx) == Some(target_idx) {
            return None;
        }

        // Target must be root or a container type
        if target_idx != self.engine.graph.root {
            let is_container = matches!(
                self.engine.graph.graph[target_idx].kind,
                NodeKind::Rect { .. }
                    | NodeKind::Ellipse { .. }
                    | NodeKind::Frame { .. }
                    | NodeKind::Group
            );
            if !is_container {
                return None;
            }
        }

        // Prevent circular reparent (child is ancestor of target)
        let mut ancestor = Some(target_idx);
        while let Some(a) = ancestor {
            if a == child_idx {
                return None;
            }
            ancestor = self.engine.graph.parent(a);
        }

        Some((child_idx, target_idx))
    }

    /// Reparent a node into a target container (⌘+drag or layer drag).
    ///
    /// The target must be a container type (Rect, Ellipse, Frame, Group)
    /// or "root" to move to the document root.
    /// Returns true if the reparent succeeded.
    pub fn reparent_into(&mut self, child_id: &str, target_id: &str) -> bool {
        let (child_idx, target_idx) = match self.validate_reparent(child_id, target_id) {
            Some(pair) => pair,
            None => return false,
        };
        let child = NodeId::intern(child_id);

        // Capture absolute bounds BEFORE reparent so we can preserve visual position
        let abs_bounds = self.engine.current_bounds().get(&child_idx).copied();

        self.engine.graph.reparent_node(child_idx, target_idx);

        // Adjust Position constraint to be relative to the new parent
        // so the node stays visually in-place (mirrors detach_child_from_group logic).
        if let Some(child_b) = abs_bounds {
            let new_parent_offset = self
                .engine
                .current_bounds()
                .get(&target_idx)
                .map(|b| (b.x, b.y))
                .unwrap_or((0.0, 0.0));
            let new_rel_x = ((child_b.x - new_parent_offset.0) * 100.0).round() / 100.0;
            let new_rel_y = ((child_b.y - new_parent_offset.1) * 100.0).round() / 100.0;

            if let Some(node) = self.engine.graph.get_by_id_mut(child) {
                // Remove all positional constraints and set an explicit Position
                node.constraints.retain(|c| {
                    !matches!(
                        c,
                        Constraint::Position { .. }
                            | Constraint::Offset { .. }
                            | Constraint::CenterIn(_)
                            | Constraint::FillParent { .. }
                    )
                });
                node.constraints.push(Constraint::Position {
                    x: new_rel_x,
                    y: new_rel_y,
                });
            }
        }

        self.engine.mark_dirty();
        self.engine.flush_to_text();
        self.rebuild_spatial_index();
        true
    }

    /// Reparent a node into a target container and center it.
    ///
    /// Same validation as `reparent_into` but instead of preserving
    /// visual position, strips positional constraints and adds
    /// `CenterIn(target)` so the child is centered in the new parent.
    pub fn reparent_into_centered(&mut self, child_id: &str, target_id: &str) -> bool {
        let (child_idx, target_idx) = match self.validate_reparent(child_id, target_id) {
            Some(pair) => pair,
            None => return false,
        };
        let child = NodeId::intern(child_id);
        let target = NodeId::intern(target_id);

        self.engine.graph.reparent_node(child_idx, target_idx);

        // Strip all positional constraints and add CenterIn(target)
        if let Some(node) = self.engine.graph.get_by_id_mut(child) {
            node.constraints.retain(|c| {
                !matches!(
                    c,
                    Constraint::Position { .. }
                        | Constraint::Offset { .. }
                        | Constraint::CenterIn(_)
                        | Constraint::FillParent { .. }
                )
            });
            // Use "root" target → CenterIn(canvas), else CenterIn(target node)
            let center_target = if target_id == "root" {
                NodeId::intern("canvas")
            } else {
                target
            };
            node.constraints.push(Constraint::CenterIn(center_target));
        }

        self.engine.mark_dirty();
        self.engine.flush_to_text();
        self.rebuild_spatial_index();
        true
    }

    /// Reorder a child node to a specific z-order index within its parent.
    /// Used by layer panel drag-to-reorder.
    pub fn reorder_child(&mut self, child_id: &str, index: usize) -> bool {
        let child = NodeId::intern(child_id);
        let child_idx = match self.engine.graph.index_of(child) {
            Some(idx) => idx,
            None => return false,
        };
        let changed = self.engine.graph.move_child_to_index(child_idx, index);
        if changed {
            self.engine.mark_dirty();
            self.engine.flush_to_text();
        }
        changed
    }

    /// Return a JSON array of valid container node IDs for the "Move Into" menu.
    /// Each entry is `{"id": "...", "kind": "..."}`.
    pub fn get_container_ids(&self) -> String {
        let mut containers = Vec::new();
        for idx in self.engine.graph.graph.node_indices() {
            let node = &self.engine.graph.graph[idx];
            if matches!(
                node.kind,
                NodeKind::Rect { .. }
                    | NodeKind::Ellipse { .. }
                    | NodeKind::Frame { .. }
                    | NodeKind::Group
            ) {
                containers.push(format!(
                    "{{\"id\":\"{}\",\"kind\":\"{}\"}}",
                    node.id.as_str(),
                    node.kind.kind_name()
                ));
            }
        }
        format!("[{}]", containers.join(","))
    }

    /// Return the kind name of a node (e.g. "rect", "ellipse", "frame", "group", "text").
    /// Returns empty string if the node doesn't exist.
    pub fn get_node_kind(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        self.engine
            .graph
            .get_by_id(id)
            .map(|n| n.kind.kind_name().to_string())
            .unwrap_or_default()
    }

    /// Return the parent ID of a node, or empty string if it's a root-level node.
    pub fn get_parent_id(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        if let Some(idx) = self.engine.graph.index_of(id)
            && let Some(parent_idx) = self.engine.graph.parent(idx)
        {
            if parent_idx == self.engine.graph.root {
                return String::new();
            }
            return self.engine.graph.graph[parent_idx].id.as_str().to_string();
        }
        String::new()
    }

    /// Set a node's position constraint to an absolute (x, y) coordinate.
    /// Used by Layers→Canvas cross-drag to place a node at the drop position.
    pub fn set_node_position(&mut self, node_id: &str, x: f32, y: f32) -> bool {
        let id = NodeId::intern(node_id);
        if let Some(node) = self.engine.graph.get_by_id_mut(id) {
            // Remove existing positional constraints
            node.constraints.retain(|c| {
                !matches!(
                    c,
                    Constraint::Position { .. }
                        | Constraint::Offset { .. }
                        | Constraint::CenterIn(_)
                        | Constraint::FillParent { .. }
                )
            });
            let rx = (x * 100.0).round() / 100.0;
            let ry = (y * 100.0).round() / 100.0;
            node.constraints.push(Constraint::Position { x: rx, y: ry });
            self.engine.mark_dirty();
            self.engine.flush_to_text();
            self.rebuild_spatial_index();
            true
        } else {
            false
        }
    }
}
