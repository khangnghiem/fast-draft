//! Properties panel, bounds queries, hit testing, and text metrics.

use crate::FdCanvas;
use crate::responses::BoundsInfo;
use fd_core::id::NodeId;
use fd_core::model::{
    ArrowKind, Color, Constraint, CurveKind, Edge, EdgeAnchor, NodeKind, Paint, TextAlign,
    TextVAlign,
};
use fd_editor::sync::GraphMutation;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl FdCanvas {
    /// Get properties of the currently selected node as JSON.
    /// Returns `{}` if no node is selected.
    pub fn get_selected_node_props(&self) -> String {
        let id = match self.select_tool.first_selected() {
            Some(id) => id,
            None => return "{}".to_string(),
        };

        // Check if selected item is an edge
        if let Some(edge) = self.engine.graph.edges.iter().find(|e| e.id == id) {
            return self.edge_props_json(edge);
        }

        let node = match self.engine.graph.get_by_id(id) {
            Some(n) => n,
            None => return "{}".to_string(),
        };
        let style = self.engine.graph.resolve_style(node, &[]);
        let mut props = serde_json::Map::new();

        props.insert(
            "id".into(),
            serde_json::Value::String(id.as_str().to_string()),
        );

        // Kind + dimensions
        match &node.kind {
            NodeKind::Rect { width, height } => {
                props.insert("kind".into(), "rect".into());
                props.insert("width".into(), serde_json::json!(width));
                props.insert("height".into(), serde_json::json!(height));
            }
            NodeKind::Ellipse { rx, ry } => {
                props.insert("kind".into(), "ellipse".into());
                props.insert("width".into(), serde_json::json!(rx * 2.0));
                props.insert("height".into(), serde_json::json!(ry * 2.0));
            }
            NodeKind::Text { content, max_width } => {
                props.insert("kind".into(), "text".into());
                props.insert("content".into(), serde_json::Value::String(content.clone()));
                if let Some(mw) = max_width {
                    props.insert("maxWidth".into(), serde_json::json!(mw));
                }
            }
            NodeKind::Group => {
                props.insert("kind".into(), "group".into());
            }
            NodeKind::Frame { width, height, .. } => {
                props.insert("kind".into(), "frame".into());
                props.insert("width".into(), serde_json::json!(width));
                props.insert("height".into(), serde_json::json!(height));
            }
            NodeKind::Path { .. } => {
                props.insert("kind".into(), "path".into());
            }
            NodeKind::Image {
                width,
                height,
                source,
                fit,
            } => {
                props.insert("kind".into(), "image".into());
                props.insert("width".into(), serde_json::json!(width));
                props.insert("height".into(), serde_json::json!(height));
                let src = match source {
                    fd_core::model::ImageSource::File(p) => p.clone(),
                };
                props.insert("src".into(), serde_json::Value::String(src));
                let fit_str = match fit {
                    fd_core::model::ImageFit::Cover => "cover",
                    fd_core::model::ImageFit::Contain => "contain",
                    fd_core::model::ImageFit::Fill => "fill",
                    fd_core::model::ImageFit::None => "none",
                };
                props.insert("fit".into(), serde_json::Value::String(fit_str.to_string()));
            }
            NodeKind::Generic => {
                props.insert("kind".into(), "generic".into());
            }
            NodeKind::Root => {
                props.insert("kind".into(), "root".into());
            }
        }

        // Fill
        if let Some(Paint::Solid(c)) = &style.fill {
            props.insert("fill".into(), serde_json::Value::String(c.to_hex()));
        }

        // Stroke
        if let Some(ref stroke) = style.stroke {
            if let Paint::Solid(c) = &stroke.paint {
                props.insert("strokeColor".into(), serde_json::Value::String(c.to_hex()));
            }
            props.insert("strokeWidth".into(), serde_json::json!(stroke.width));
        }

        // Corner radius
        if let Some(r) = style.corner_radius {
            props.insert("cornerRadius".into(), serde_json::json!(r));
        }

        // Opacity
        if let Some(o) = style.opacity {
            props.insert("opacity".into(), serde_json::json!(o));
        }

        // Position from bounds
        if let Some(idx) = self.engine.graph.index_of(id)
            && let Some(bounds) = self.engine.current_bounds().get(&idx)
        {
            props.insert("x".into(), serde_json::json!(bounds.x));
            props.insert("y".into(), serde_json::json!(bounds.y));
        }

        // Font — always return resolved values (including defaults)
        let font_family = style
            .font
            .as_ref()
            .map_or("Inter", |f| f.family.as_str())
            .to_string();
        let font_size = style.font.as_ref().map_or(14.0, |f| f.size);
        let font_weight = style.font.as_ref().map_or(400, |f| f.weight);
        props.insert("fontFamily".into(), serde_json::Value::String(font_family));
        props.insert("fontSize".into(), serde_json::json!(font_size));
        props.insert("fontWeight".into(), serde_json::json!(font_weight));

        // Text alignment — always include effective alignment with context-aware
        // defaults matching render2d::draw_text
        let in_shape = matches!(&node.kind, NodeKind::Text { .. })
            && self
                .engine
                .graph
                .index_of(id)
                .and_then(|idx| self.engine.graph.parent(idx))
                .is_some_and(|pid| {
                    matches!(
                        &self.engine.graph.graph[pid].kind,
                        NodeKind::Rect { .. } | NodeKind::Ellipse { .. } | NodeKind::Frame { .. }
                    )
                });
        let default_halign = if in_shape {
            TextAlign::Center
        } else {
            TextAlign::Left
        };
        let default_valign = if in_shape {
            TextVAlign::Middle
        } else {
            TextVAlign::Top
        };
        let ta_str = match style.text_align.unwrap_or(default_halign) {
            TextAlign::Left => "left",
            TextAlign::Center => "center",
            TextAlign::Right => "right",
        };
        props.insert(
            "textAlign".into(),
            serde_json::Value::String(ta_str.to_string()),
        );
        let tv_str = match style.text_valign.unwrap_or(default_valign) {
            TextVAlign::Top => "top",
            TextVAlign::Middle => "middle",
            TextVAlign::Bottom => "bottom",
        };
        props.insert(
            "textVAlign".into(),
            serde_json::Value::String(tv_str.to_string()),
        );

        serde_json::Value::Object(props).to_string()
    }

    /// Build JSON properties for a selected edge.
    pub(crate) fn edge_props_json(&self, edge: &Edge) -> String {
        let mut props = serde_json::Map::new();
        props.insert(
            "id".into(),
            serde_json::Value::String(edge.id.as_str().to_string()),
        );
        props.insert("kind".into(), "edge".into());

        // From / To
        let from_str = match &edge.from {
            EdgeAnchor::Node(id) => id.as_str().to_string(),
            EdgeAnchor::Point(x, y) => format!("({x}, {y})"),
        };
        let to_str = match &edge.to {
            EdgeAnchor::Node(id) => id.as_str().to_string(),
            EdgeAnchor::Point(x, y) => format!("({x}, {y})"),
        };
        props.insert("from".into(), serde_json::Value::String(from_str));
        props.insert("to".into(), serde_json::Value::String(to_str));

        // Arrow
        let arrow_str = match edge.arrow {
            ArrowKind::None => "none",
            ArrowKind::Start => "start",
            ArrowKind::End => "end",
            ArrowKind::Both => "both",
        };
        props.insert(
            "arrow".into(),
            serde_json::Value::String(arrow_str.to_string()),
        );

        // Curve
        let curve_str = match edge.curve {
            CurveKind::Straight => "straight",
            CurveKind::Smooth => "smooth",
            CurveKind::Step => "step",
        };
        props.insert(
            "curve".into(),
            serde_json::Value::String(curve_str.to_string()),
        );

        // Stroke
        let resolved = self.engine.graph.resolve_style_for_edge(edge, &[]);
        if let Some(ref stroke) = resolved.stroke {
            if let Paint::Solid(c) = &stroke.paint {
                props.insert("strokeColor".into(), serde_json::Value::String(c.to_hex()));
            }
            props.insert("strokeWidth".into(), serde_json::json!(stroke.width));
        }

        // Flow animation
        if let Some(ref flow) = edge.flow {
            let flow_str = match flow.kind {
                fd_core::model::FlowKind::Pulse => "pulse",
                fd_core::model::FlowKind::Dash => "dash",
            };
            props.insert(
                "flow".into(),
                serde_json::Value::String(flow_str.to_string()),
            );
            props.insert("flowDuration".into(), serde_json::json!(flow.duration_ms));
        }

        serde_json::Value::Object(props).to_string()
    }

    /// Get basic properties of a node by its ID (without selecting it).
    pub fn get_node_props(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        let node = match self.engine.graph.get_by_id(id) {
            Some(n) => n,
            None => return "{}".to_string(),
        };
        let style = self.engine.graph.resolve_style(node, &[]);
        let mut props = serde_json::Map::new();

        if let NodeKind::Text {
            ref content,
            max_width,
        } = node.kind
        {
            props.insert("text".into(), serde_json::Value::String(content.clone()));
            if let Some(mw) = max_width {
                props.insert("maxWidth".into(), serde_json::json!(mw));
            }
        }

        if let Some(ref font) = style.font {
            props.insert(
                "fontFamily".into(),
                serde_json::Value::String(font.family.clone()),
            );
            props.insert("fontSize".into(), serde_json::json!(font.size));
            props.insert("fontWeight".into(), serde_json::json!(font.weight));
        }

        serde_json::Value::Object(props).to_string()
    }

    /// Set a property on the currently selected node.
    /// Returns `true` if the property was set.
    pub fn set_node_prop(&mut self, key: &str, value: &str) -> bool {
        let id = match self.select_tool.first_selected() {
            Some(id) => id,
            None => return false,
        };

        let mutation = match key {
            "fill" => {
                if value == "none" || value == "transparent" {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.props.clone();
                        style.fill = None;
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else if let Some(color) = Color::from_hex(value) {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.props.clone();
                        style.fill = Some(Paint::Solid(color));
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "strokeColor" => {
                if let Some(color) = Color::from_hex(value) {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.props.clone();
                        let resolved = self.engine.graph.resolve_style(node, &[]);
                        let mut stroke = style.stroke.or(resolved.stroke).unwrap_or_default();
                        stroke.paint = Paint::Solid(color);
                        style.stroke = Some(stroke);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "strokeWidth" => {
                if let Ok(w) = value.parse::<f32>() {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.props.clone();
                        let resolved = self.engine.graph.resolve_style(node, &[]);
                        let mut stroke = style.stroke.or(resolved.stroke).unwrap_or_default();
                        stroke.width = w;
                        style.stroke = Some(stroke);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "cornerRadius" => {
                if let Ok(r) = value.parse::<f32>() {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.props.clone();
                        style.corner_radius = Some(r);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "opacity" => {
                if let Ok(o) = value.parse::<f32>() {
                    if let Some(node) = self.engine.graph.get_by_id(id) {
                        let mut style = node.props.clone();
                        style.opacity = Some(o);
                        GraphMutation::SetStyle { id, style }
                    } else {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            "textAlign" => {
                let align = match value {
                    "left" => TextAlign::Left,
                    "right" => TextAlign::Right,
                    _ => TextAlign::Center,
                };
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let mut style = node.props.clone();
                    style.text_align = Some(align);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "textVAlign" => {
                let valign = match value {
                    "top" => TextVAlign::Top,
                    "bottom" => TextVAlign::Bottom,
                    _ => TextVAlign::Middle,
                };
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let mut style = node.props.clone();
                    style.text_valign = Some(valign);
                    GraphMutation::SetStyle { id, style }
                } else {
                    return false;
                }
            }
            "width" | "height" => {
                let v = match value.parse::<f32>() {
                    Ok(v) => v,
                    Err(_) => return false,
                };
                if let Some(node) = self.engine.graph.get_by_id(id) {
                    let (cur_w, cur_h) = match &node.kind {
                        NodeKind::Rect { width, height } => (*width, *height),
                        NodeKind::Ellipse { rx, ry } => (*rx * 2.0, *ry * 2.0),
                        NodeKind::Frame { width, height, .. } => (*width, *height),
                        _ => return false,
                    };
                    let (new_w, new_h) = if key == "width" {
                        (v, cur_h)
                    } else {
                        (cur_w, v)
                    };
                    GraphMutation::ResizeNode {
                        id,
                        width: new_w,
                        height: new_h,
                    }
                } else {
                    return false;
                }
            }
            "content" => GraphMutation::SetText {
                id,
                content: value.to_string(),
            },

            _ => return false,
        };

        let changed = self.apply_mutations(vec![mutation]);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Set a property on ALL currently selected nodes (bulk editing).
    /// Returns `true` if any node was changed.
    pub fn set_multi_node_prop(&mut self, key: &str, value: &str) -> bool {
        let ids: Vec<NodeId> = self.select_tool.selected.clone();
        if ids.is_empty() {
            return false;
        }
        // For single selection, delegate to set_node_prop for efficiency
        if ids.len() == 1 {
            return self.set_node_prop(key, value);
        }

        let mut mutations: Vec<GraphMutation> = Vec::new();
        for id in &ids {
            if let Some(mutation) = self.build_prop_mutation(*id, key, value) {
                mutations.push(mutation);
            }
        }
        if mutations.is_empty() {
            return false;
        }
        let changed = self.apply_mutations(mutations);
        if changed {
            self.engine.flush_to_text();
        }
        changed
    }

    /// Build a property mutation for a specific node (shared by set_node_prop and set_multi_node_prop).
    fn build_prop_mutation(&self, id: NodeId, key: &str, value: &str) -> Option<GraphMutation> {
        match key {
            "fill" => {
                if value == "none" || value == "transparent" {
                    let node = self.engine.graph.get_by_id(id)?;
                    let mut style = node.props.clone();
                    style.fill = None;
                    Some(GraphMutation::SetStyle { id, style })
                } else {
                    let color = Color::from_hex(value)?;
                    let node = self.engine.graph.get_by_id(id)?;
                    let mut style = node.props.clone();
                    style.fill = Some(Paint::Solid(color));
                    Some(GraphMutation::SetStyle { id, style })
                }
            }
            "strokeColor" => {
                let color = Color::from_hex(value)?;
                let node = self.engine.graph.get_by_id(id)?;
                let mut style = node.props.clone();
                let resolved = self.engine.graph.resolve_style(node, &[]);
                let mut stroke = style.stroke.or(resolved.stroke).unwrap_or_default();
                stroke.paint = Paint::Solid(color);
                style.stroke = Some(stroke);
                Some(GraphMutation::SetStyle { id, style })
            }
            "strokeWidth" => {
                let w = value.parse::<f32>().ok()?;
                let node = self.engine.graph.get_by_id(id)?;
                let mut style = node.props.clone();
                let resolved = self.engine.graph.resolve_style(node, &[]);
                let mut stroke = style.stroke.or(resolved.stroke).unwrap_or_default();
                stroke.width = w;
                style.stroke = Some(stroke);
                Some(GraphMutation::SetStyle { id, style })
            }
            "cornerRadius" => {
                let r = value.parse::<f32>().ok()?;
                let node = self.engine.graph.get_by_id(id)?;
                let mut style = node.props.clone();
                style.corner_radius = Some(r);
                Some(GraphMutation::SetStyle { id, style })
            }
            "opacity" => {
                let o = value.parse::<f32>().ok()?;
                let node = self.engine.graph.get_by_id(id)?;
                let mut style = node.props.clone();
                style.opacity = Some(o);
                Some(GraphMutation::SetStyle { id, style })
            }
            _ => None,
        }
    }

    /// Get the scene-space bounds of a node by its ID.
    pub fn get_node_bounds(&self, node_id: &str) -> String {
        let id = fd_core::id::NodeId::intern(node_id);
        if let Some(idx) = self.engine.graph.index_of(id)
            && let Some(bounds) = self.engine.current_bounds().get(&idx)
        {
            return serde_json::to_string(&BoundsInfo {
                x: bounds.x,
                y: bounds.y,
                w: bounds.width,
                h: bounds.height,
            })
            .unwrap_or_else(|_| "{}".to_string());
        }
        "{}".to_string()
    }

    /// Get the resolved bounds of a node by its `@id` as JSON.
    pub fn get_node_bounds_json(&self, id_str: &str) -> String {
        let id = NodeId::intern(id_str);
        if let Some(idx) = self.engine.graph.index_of(id)
            && let Some(b) = self.engine.current_bounds().get(&idx)
        {
            return serde_json::to_string(&BoundsInfo {
                x: b.x,
                y: b.y,
                w: b.width,
                h: b.height,
            })
            .unwrap_or_else(|_| "{}".to_string());
        }
        "{}".to_string()
    }

    /// Get the bounding box of all non-root nodes in the scene.
    pub fn get_scene_bounds(&self) -> String {
        let mut sx = f32::MAX;
        let mut sy = f32::MAX;
        let mut sx2 = f32::MIN;
        let mut sy2 = f32::MIN;
        let mut found = false;

        for (&idx, b) in self.engine.current_bounds() {
            if idx == self.engine.graph.root {
                continue;
            }
            if b.width > 0.0 && b.height > 0.0 {
                sx = sx.min(b.x);
                sy = sy.min(b.y);
                sx2 = sx2.max(b.x + b.width);
                sy2 = sy2.max(b.y + b.height);
                found = true;
            }
        }

        if !found {
            return String::new();
        }

        serde_json::to_string(&BoundsInfo {
            x: sx,
            y: sy,
            w: sx2 - sx,
            h: sy2 - sy,
        })
        .unwrap_or_else(|_| String::new())
    }

    /// Hit-test at scene-space coordinates. Returns the topmost node ID, or empty string.
    pub fn hit_test_at(&self, x: f32, y: f32) -> String {
        self.hit_test(x, y)
            .map(|id| id.as_str().to_string())
            .unwrap_or_default()
    }

    /// Hit-test for edges only at scene-space coordinates.
    pub fn hit_test_edge_at(&self, x: f32, y: f32) -> String {
        fd_render::hit::hit_test_edge(&self.engine.graph, self.engine.current_bounds(), x, y)
            .map(|id| id.as_str().to_string())
            .unwrap_or_default()
    }

    /// Check if a node is locked. Returns false if node not found.
    pub fn is_node_locked(&self, id: &str) -> bool {
        let nid = fd_core::id::NodeId::intern(id);
        self.engine.graph.get_by_id(nid).is_some_and(|n| n.locked)
    }

    /// Toggle the locked state of a node. Returns the new locked state.
    pub fn toggle_node_locked(&mut self, id: &str) -> bool {
        let nid = fd_core::id::NodeId::intern(id);
        if let Some(node) = self.engine.graph.get_by_id_mut(nid) {
            node.locked = !node.locked;
            let new_state = node.locked;
            self.engine.flush_to_text();
            new_state
        } else {
            false
        }
    }

    /// Update a text node's resolved bounds using JS-measured dimensions.
    pub fn update_text_metrics(
        &mut self,
        node_id: &str,
        measured_width: f64,
        measured_height: f64,
    ) -> bool {
        let id = NodeId::intern(node_id);
        let Some(idx) = self.engine.graph.index_of(id) else {
            return false;
        };

        // Only apply to text nodes
        if !matches!(self.engine.graph.graph[idx].kind, NodeKind::Text { .. }) {
            return false;
        }

        let padding = 2.0_f32;
        let content_width = (measured_width as f32) + padding * 2.0;
        let new_height = (measured_height as f32) + padding * 2.0;

        let max_w = if let NodeKind::Text { max_width, .. } = &self.engine.graph.graph[idx].kind {
            *max_width
        } else {
            None
        };
        let new_width = match max_w {
            Some(mw) => mw,
            None => {
                if fd_core::layout::is_parent_managed(&self.engine.graph, idx) {
                    let layout_width = self.engine.bounds.get(&idx).map_or(0.0, |b| b.width);
                    content_width.max(layout_width)
                } else {
                    content_width
                }
            }
        };

        let min_width = 20.0_f32;
        let min_height = 14.0_f32;
        let final_width = new_width.max(min_width);
        let final_height = new_height.max(min_height);

        let old_bounds = self.engine.bounds.get(&idx).copied();
        if let Some(b) = self.engine.bounds.get_mut(&idx) {
            if (b.width - final_width).abs() < 0.5 && (b.height - final_height).abs() < 0.5 {
                return false;
            }
            b.width = final_width;
            b.height = final_height;
        } else {
            return false;
        }

        // Re-center text within parent shape
        let node = &self.engine.graph.graph[idx];
        let has_position = node
            .constraints
            .iter()
            .any(|c| matches!(c, Constraint::Position { .. }));
        let has_place = node.place.is_some();

        if !has_position
            && !has_place
            && let Some(parent_idx) = self.engine.graph.parent(idx)
            && matches!(
                &self.engine.graph.graph[parent_idx].kind,
                NodeKind::Rect { .. } | NodeKind::Ellipse { .. } | NodeKind::Frame { .. }
            )
            && let Some(parent_b) = self.engine.bounds.get(&parent_idx).copied()
            && let Some(b) = self.engine.bounds.get_mut(&idx)
        {
            b.x = parent_b.x + (parent_b.width - final_width) / 2.0;
            b.y = parent_b.y + (parent_b.height - final_height) / 2.0;
        }

        let changed = old_bounds != self.engine.bounds.get(&idx).copied();
        if changed {
            self.rebuild_spatial_index();
        }
        changed
    }

    /// Check if a node has any direct Text children.
    pub fn has_text_child(&self, node_id: &str) -> bool {
        let id = NodeId::intern(node_id);
        let Some(idx) = self.engine.graph.index_of(id) else {
            return false;
        };
        self.engine
            .graph
            .children(idx)
            .iter()
            .any(|ci| matches!(self.engine.graph.graph[*ci].kind, NodeKind::Text { .. }))
    }

    /// Get IDs of all direct Text children of a node.
    pub fn get_text_children(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        let Some(idx) = self.engine.graph.index_of(id) else {
            return "[]".to_string();
        };
        let ids: Vec<String> = self
            .engine
            .graph
            .children(idx)
            .iter()
            .filter_map(|ci| {
                let node = &self.engine.graph.graph[*ci];
                if matches!(node.kind, NodeKind::Text { .. }) {
                    Some(node.id.as_str().to_string())
                } else {
                    None
                }
            })
            .collect();
        serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get the parent ID of a node. Returns empty string for root-level nodes.
    pub fn parent_of(&self, node_id: &str) -> String {
        let id = NodeId::intern(node_id);
        let parent_id = self.engine.parent_of(id);
        if parent_id.as_str() == "root" {
            String::new()
        } else {
            parent_id.as_str().to_string()
        }
    }

    /// Compute alignment guides for a hypothetical rect at (x, y, w, h).
    pub fn compute_guides_for_rect(&self, x: f32, y: f32, w: f32, h: f32) -> String {
        let snap_threshold = 5.0_f32;
        let mut guides = Vec::new();

        let s_left = x;
        let s_cx = x + w / 2.0;
        let s_right = x + w;
        let s_top = y;
        let s_cy = y + h / 2.0;
        let s_bottom = y + h;

        let vw = self.width;
        let vh = self.height;

        for (&idx, b) in self.engine.current_bounds() {
            if idx == self.engine.graph.root {
                continue;
            }

            let o_left = b.x;
            let o_cx = b.x + b.width / 2.0;
            let o_right = b.x + b.width;
            let o_top = b.y;
            let o_cy = b.y + b.height / 2.0;
            let o_bottom = b.y + b.height;

            for (sv, ov) in [
                (s_left, o_left),
                (s_left, o_cx),
                (s_left, o_right),
                (s_cx, o_left),
                (s_cx, o_cx),
                (s_cx, o_right),
                (s_right, o_left),
                (s_right, o_cx),
                (s_right, o_right),
            ] {
                if (sv - ov).abs() < snap_threshold {
                    guides.push((ov as f64, 0.0, ov as f64, vh));
                }
            }

            for (sv, ov) in [
                (s_top, o_top),
                (s_top, o_cy),
                (s_top, o_bottom),
                (s_cy, o_top),
                (s_cy, o_cy),
                (s_cy, o_bottom),
                (s_bottom, o_top),
                (s_bottom, o_cy),
                (s_bottom, o_bottom),
            ] {
                if (sv - ov).abs() < snap_threshold {
                    guides.push((0.0, ov as f64, vw, ov as f64));
                }
            }
        }

        guides.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        });
        guides.dedup_by(|a, b| (a.0 - b.0).abs() < 0.5 && (a.1 - b.1).abs() < 0.5);

        let json_guides: Vec<[f64; 4]> = guides.iter().map(|g| [g.0, g.1, g.2, g.3]).collect();
        serde_json::to_string(&json_guides).unwrap_or_else(|_| "[]".to_string())
    }
}
