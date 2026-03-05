use crate::layout::{Viewport, resolve_layout};
use crate::model::{ArrowKind, Color, CurveKind, EdgeAnchor, NodeKind, SceneGraph};
use petgraph::graph::NodeIndex;
use serde::Serialize;
use serde_json::json;

/// Element structure matching Excalidraw JSON.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExcalidrawElement {
    id: String,
    #[serde(rename = "type")]
    type_field: String,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    angle: f32,
    stroke_color: String,
    background_color: String,
    fill_style: String,
    stroke_width: f32,
    stroke_style: String,
    roughness: f32,
    opacity: f32,
    group_ids: Vec<String>,
    roundness: Option<serde_json::Value>,
    seed: u32,
    version: u32,
    version_nonce: u32,
    is_deleted: bool,
    bound_elements: Option<Vec<serde_json::Value>>,
    updated: u64,
    link: Option<String>,
    locked: bool,

    // Text specific
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    font_family: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text_align: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    vertical_align: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    baseline: Option<f32>,

    // Path / Arrow specific
    #[serde(skip_serializing_if = "Option::is_none")]
    points: Option<Vec<[f32; 2]>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_binding: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_binding: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_arrowhead: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_arrowhead: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExcalidrawExport {
    #[serde(rename = "type")]
    type_field: String,
    version: u32,
    source: String,
    elements: Vec<ExcalidrawElement>,
    app_state: serde_json::Value,
    files: serde_json::Value,
}

fn to_hex(color: &Color) -> String {
    color.to_hex()
}

pub fn emit_excalidraw(graph: &SceneGraph) -> String {
    let mut elements = Vec::new();
    let bounds_map = resolve_layout(graph, Viewport::default());

    // Recursively collect groups for each node
    fn get_group_ids(graph: &SceneGraph, idx: NodeIndex) -> Vec<String> {
        let mut group_ids = Vec::new();
        let mut current = graph.parent(idx);
        while let Some(parent_idx) = current {
            let parent_node = &graph.graph[parent_idx];
            if matches!(parent_node.kind, NodeKind::Group)
                || matches!(parent_node.kind, NodeKind::Frame { .. })
            {
                group_ids.push(parent_node.id.as_str().to_string());
            }
            current = graph.parent(parent_idx);
        }
        // Excalidraw expects groupIds in top-down order usually, but flat list works.
        group_ids.reverse();
        group_ids
    }

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        let bounds = bounds_map.get(&idx).copied().unwrap_or_default();
        let style = graph.resolve_style(node, &[]);
        let group_ids = get_group_ids(graph, idx);

        let stroke_color = style
            .stroke
            .as_ref()
            .and_then(|s| match &s.paint {
                crate::model::Paint::Solid(c) => Some(to_hex(c)),
                _ => None,
            })
            .unwrap_or_else(|| "#000000".to_string());

        let background_color = style
            .fill
            .as_ref()
            .and_then(|f| match f {
                crate::model::Paint::Solid(c) => Some(to_hex(c)),
                _ => None,
            })
            .unwrap_or_else(|| "transparent".to_string());

        let fill_style = "solid".to_string();

        let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(1.0);
        let opacity = style.opacity.unwrap_or(1.0) * 100.0; // Excalidraw uses 0-100

        let mut base_el = ExcalidrawElement {
            id: node.id.as_str().to_string(),
            type_field: "".to_string(),
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            angle: 0.0,
            stroke_color,
            background_color,
            fill_style,
            stroke_width,
            stroke_style: "solid".to_string(),
            roughness: 0.0, // Clean lines
            opacity,
            group_ids,
            roundness: None,
            seed: 1,
            version: 1,
            version_nonce: 1,
            is_deleted: false,
            bound_elements: None,
            updated: 1,
            link: None,
            locked: false,

            text: None,
            font_size: None,
            font_family: None,
            text_align: None,
            vertical_align: None,
            baseline: None,
            points: None,
            start_binding: None,
            end_binding: None,
            start_arrowhead: None,
            end_arrowhead: None,
        };

        if let Some(radius) = style.corner_radius
            && radius > 0.0
        {
            base_el.roundness = Some(json!({
                "type": 3,
                "value": radius
            }));
        }

        match &node.kind {
            NodeKind::Root => continue,
            NodeKind::Generic => {
                base_el.type_field = "rectangle".to_string();
                base_el.stroke_style = "dashed".to_string();
                elements.push(base_el);
            }
            NodeKind::Group => {
                // Group is purely organizational in Excalidraw too.
                // However, Excalidraw groups are just elements sharing groupIds.
                // We don't need to emit a node for the group itself unless it's a frame.
                // But FD allows empty groups, so we'll skip emitting invisible groups,
                // and rely on `group_ids` on children.
                continue;
            }
            NodeKind::Frame { .. } => {
                base_el.type_field = "rectangle".to_string();
                elements.push(base_el);
            }
            NodeKind::Rect { .. } => {
                base_el.type_field = "rectangle".to_string();
                elements.push(base_el);
            }
            NodeKind::Ellipse { .. } => {
                base_el.type_field = "ellipse".to_string();
                elements.push(base_el);
            }
            NodeKind::Text { content, .. } => {
                base_el.type_field = "text".to_string();
                base_el.text = Some(content.clone());

                let font = style.font.unwrap_or_default();
                base_el.font_size = Some(font.size);
                base_el.font_family = Some(1); // 1 = Virgil (handwritten), 2 = Helvetica, 3 = Cascadia

                let text_align = match style.text_align.unwrap_or_default() {
                    crate::model::TextAlign::Left => "left",
                    crate::model::TextAlign::Center => "center",
                    crate::model::TextAlign::Right => "right",
                };
                base_el.text_align = Some(text_align.to_string());

                let vertical_align = match style.text_valign.unwrap_or_default() {
                    crate::model::TextVAlign::Top => "top",
                    crate::model::TextVAlign::Middle => "middle",
                    crate::model::TextVAlign::Bottom => "bottom",
                };
                base_el.vertical_align = Some(vertical_align.to_string());
                base_el.baseline = Some(base_el.y + base_el.height - (font.size * 0.25)); // rough baseline estimate

                // Excalidraw wants transparent background for text
                base_el.background_color = "transparent".to_string();

                elements.push(base_el);
            }
            NodeKind::Path { commands } => {
                // Memory mentions: "path coordinates in FD's PathCmd are relative to the node origin, matching Excalidraw's expectation for points in the points array to be relative to the element's x, y coordinates."
                // Wait, Excalidraw points are relative to the element's x, y.
                // FD path commands: currently absolute or relative? The memory says "relative to the node origin".
                // But actually we'll just emit an array of points. Excalidraw expects points like `[[0, 0], [w, h]]`.
                base_el.type_field = "line".to_string();

                let mut points = Vec::new();
                for cmd in commands {
                    match cmd {
                        crate::model::PathCmd::MoveTo(x, y) => points.push([*x, *y]),
                        crate::model::PathCmd::LineTo(x, y) => points.push([*x, *y]),
                        crate::model::PathCmd::QuadTo(_, _, x, y) => points.push([*x, *y]), // Simplified
                        crate::model::PathCmd::CubicTo(_, _, _, _, x, y) => points.push([*x, *y]),
                        crate::model::PathCmd::Close => {}
                    }
                }

                if points.is_empty() {
                    points.push([0.0, 0.0]);
                }

                // Adjust points if they aren't already relative to x, y.
                // Excalidraw requires the first point to be [0, 0], and x,y to be the top-left of the bounding box.
                // But the memory says "path coordinates in FD's PathCmd are relative to the node origin".
                base_el.points = Some(points);
                elements.push(base_el);
            }
        }
    }

    // Now process edges
    for edge in &graph.edges {
        let style = graph.resolve_style_for_edge(edge, &[]);
        let stroke_color = style
            .stroke
            .as_ref()
            .and_then(|s| match &s.paint {
                crate::model::Paint::Solid(c) => Some(to_hex(c)),
                _ => None,
            })
            .unwrap_or_else(|| "#000000".to_string());

        let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(1.0);
        let opacity = style.opacity.unwrap_or(1.0) * 100.0;

        let mut start_binding = None;
        let mut end_binding = None;

        let mut from_point = (0.0, 0.0);
        let mut to_point = (0.0, 0.0);

        match &edge.from {
            EdgeAnchor::Node(id) => {
                if let Some(idx) = graph.index_of(*id)
                    && let Some(bounds) = bounds_map.get(&idx)
                {
                    from_point = bounds.center();
                    start_binding = Some(json!({
                        "elementId": id.as_str(),
                        "focus": 0.0,
                        "gap": 10
                    }));
                }
            }
            EdgeAnchor::Point(x, y) => {
                from_point = (*x, *y);
            }
        }

        match &edge.to {
            EdgeAnchor::Node(id) => {
                if let Some(idx) = graph.index_of(*id)
                    && let Some(bounds) = bounds_map.get(&idx)
                {
                    to_point = bounds.center();
                    end_binding = Some(json!({
                        "elementId": id.as_str(),
                        "focus": 0.0,
                        "gap": 10
                    }));
                }
            }
            EdgeAnchor::Point(x, y) => {
                to_point = (*x, *y);
            }
        }

        // Excalidraw points are relative to x,y
        let x = from_point.0.min(to_point.0);
        let y = from_point.1.min(to_point.1);
        let width = (from_point.0 - to_point.0).abs();
        let height = (from_point.1 - to_point.1).abs();

        let mut points = Vec::new();
        points.push([from_point.0 - x, from_point.1 - y]);

        // Midpoint for smooth/step
        if edge.curve != CurveKind::Straight {
            points.push([width / 2.0, height / 2.0]);
        }

        points.push([to_point.0 - x, to_point.1 - y]);

        let mut start_arrowhead = None;
        let mut end_arrowhead = None;

        match edge.arrow {
            ArrowKind::Start => start_arrowhead = Some("arrow".to_string()),
            ArrowKind::End => end_arrowhead = Some("arrow".to_string()),
            ArrowKind::Both => {
                start_arrowhead = Some("arrow".to_string());
                end_arrowhead = Some("arrow".to_string());
            }
            ArrowKind::None => {}
        }

        // Roundness determines straight vs curved in Excalidraw
        let roundness = match edge.curve {
            CurveKind::Straight => None,
            CurveKind::Smooth => Some(json!({ "type": 2 })),
            CurveKind::Step => Some(json!({ "type": 1 })), // 1 is supposedly sharper
        };

        let edge_el = ExcalidrawElement {
            id: edge.id.as_str().to_string(),
            type_field: "arrow".to_string(),
            x,
            y,
            width,
            height,
            angle: 0.0,
            stroke_color,
            background_color: "transparent".to_string(),
            fill_style: "solid".to_string(),
            stroke_width,
            stroke_style: "solid".to_string(),
            roughness: 0.0,
            opacity,
            group_ids: vec![],
            roundness,
            seed: 1,
            version: 1,
            version_nonce: 1,
            is_deleted: false,
            bound_elements: None,
            updated: 1,
            link: None,
            locked: false,

            text: None,
            font_size: None,
            font_family: None,
            text_align: None,
            vertical_align: None,
            baseline: None,
            points: Some(points),
            start_binding,
            end_binding,
            start_arrowhead,
            end_arrowhead,
        };

        elements.push(edge_el);
    }

    let export = ExcalidrawExport {
        type_field: "excalidraw".to_string(),
        version: 2,
        source: "fast-draft".to_string(),
        elements,
        app_state: json!({
            "viewBackgroundColor": "#ffffff",
            "gridSize": null
        }),
        files: json!({}),
    };

    serde_json::to_string(&export).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::NodeId;
    use crate::model::{Paint, SceneNode};

    #[test]
    fn test_emit_excalidraw_rect() {
        let mut graph = SceneGraph::new();
        let mut rect = SceneNode::new(
            NodeId::intern("rect1"),
            NodeKind::Rect {
                width: 100.0,
                height: 50.0,
            },
        );
        rect.style.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
        graph.add_node(graph.root, rect);

        let json = emit_excalidraw(&graph);
        assert!(json.contains(r#""type":"excalidraw""#));
        assert!(json.contains(r#""type":"rectangle""#));
        assert!(json.contains("\"backgroundColor\":\"#FF0000\""));
        assert!(json.contains(r#""width":100.0"#));
        assert!(json.contains(r#""height":50.0"#));
    }

    #[test]
    fn test_emit_excalidraw_text() {
        let mut graph = SceneGraph::new();
        let text = SceneNode::new(
            NodeId::intern("text1"),
            NodeKind::Text {
                content: "Hello".to_string(),
                max_width: None,
            },
        );
        graph.add_node(graph.root, text);

        let json = emit_excalidraw(&graph);
        assert!(json.contains(r#""type":"text""#));
        assert!(json.contains(r#""text":"Hello""#));
        assert!(json.contains(r#""backgroundColor":"transparent""#));
    }

    #[test]
    fn test_emit_excalidraw_edge() {
        let mut graph = SceneGraph::new();

        let mut rect1 = SceneNode::new(
            NodeId::intern("rect1"),
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );
        rect1
            .constraints
            .push(crate::model::Constraint::Position { x: 0.0, y: 0.0 });
        let id1 = rect1.id;

        let mut rect2 = SceneNode::new(
            NodeId::intern("rect2"),
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );
        rect2
            .constraints
            .push(crate::model::Constraint::Position { x: 100.0, y: 100.0 });
        let id2 = rect2.id;

        graph.add_node(graph.root, rect1);
        graph.add_node(graph.root, rect2);

        let mut edge = crate::model::Edge {
            id: NodeId::intern("edge1"),
            from: EdgeAnchor::Node(id1),
            to: EdgeAnchor::Node(id2),
            text_child: None,
            style: Default::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::End,
            curve: CurveKind::Smooth,
            annotations: vec![],
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        graph.edges.push(edge);

        let json = emit_excalidraw(&graph);
        assert!(json.contains(r#""type":"arrow""#));
        assert!(json.contains(r#""endArrowhead":"arrow""#));
    }
}
