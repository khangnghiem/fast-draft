//! Excalidraw JSON export.
use crate::layout::resolve_layout;
use crate::model::*;

use serde::Serialize;
use serde_json::json;

#[derive(Serialize)]
pub struct ExcalidrawDocument {
    pub r#type: String,
    pub version: u32,
    pub source: String,
    pub elements: Vec<serde_json::Value>,
    #[serde(rename = "appState")]
    pub app_state: serde_json::Value,
    pub files: serde_json::Value,
}

pub fn export_excalidraw(graph: &SceneGraph) -> String {
    let resolved = resolve_layout(graph, crate::layout::Viewport::default());
    let mut elements = Vec::new();

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        let Some(bounds) = resolved.get(&idx) else {
            continue;
        };

        let style = graph.resolve_style(node, &[]);
        let background_color = style
            .fill
            .and_then(|p| match p {
                Paint::Solid(c) => Some(c.to_hex()),
                _ => None,
            })
            .unwrap_or_else(|| "transparent".to_string());
        let stroke_color = style
            .stroke
            .as_ref()
            .and_then(|s| match s.paint {
                Paint::Solid(c) => Some(c.to_hex()),
                _ => None,
            })
            .unwrap_or_else(|| "#000000".to_string());
        let stroke_width = style.stroke.map(|s| s.width).unwrap_or(0.0);
        let opacity = style.opacity.unwrap_or(1.0) * 100.0;
        let roundness = if let Some(r) = style.corner_radius {
            if r > 0.0 {
                Some(json!({ "type": 3, "value": r }))
            } else {
                None
            }
        } else {
            None
        };

        let base_element = json!({
            "id": node.id.as_str(),
            "x": bounds.x,
            "y": bounds.y,
            "width": bounds.width,
            "height": bounds.height,
            "angle": 0,
            "strokeColor": stroke_color,
            "backgroundColor": background_color,
            "fillStyle": "solid",
            "strokeWidth": stroke_width,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": opacity,
            "groupIds": [],
            "roundness": roundness,
            "seed": 1,
            "version": 1,
            "versionNonce": 1,
            "isDeleted": false,
            "boundElements": null,
            "updated": 1,
            "link": null,
            "locked": false,
        });

        match &node.kind {
            NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
                let mut el = base_element.clone();
                el["type"] = json!("rectangle");
                elements.push(el);
            }
            NodeKind::Ellipse { .. } => {
                let mut el = base_element.clone();
                el["type"] = json!("ellipse");
                elements.push(el);
            }
            NodeKind::Text { content, .. } => {
                let mut el = base_element.clone();
                el["type"] = json!("text");
                el["text"] = json!(content);
                el["fontSize"] = json!(style.font.as_ref().map(|f| f.size).unwrap_or(16.0));
                el["fontFamily"] = json!(1); // Excalidraw uses 1=Virgil, 2=Helvetica, 3=Cascadia
                el["textAlign"] = match style.text_align.unwrap_or_default() {
                    TextAlign::Left => json!("left"),
                    TextAlign::Center => json!("center"),
                    TextAlign::Right => json!("right"),
                };
                el["verticalAlign"] = match style.text_valign.unwrap_or_default() {
                    TextVAlign::Top => json!("top"),
                    TextVAlign::Middle => json!("middle"),
                    TextVAlign::Bottom => json!("bottom"),
                };
                el["baseline"] = json!(bounds.height - 4.0); // Rough approximation
                elements.push(el);
            }
            _ => {}
        }
    }

    for edge in &graph.edges {
        // Excalidraw arrows require relative coordinates.
        let from_bounds = edge
            .from
            .node_id()
            .and_then(|id| graph.id_index.get(&id).and_then(|idx| resolved.get(idx)));
        let to_bounds = edge
            .to
            .node_id()
            .and_then(|id| graph.id_index.get(&id).and_then(|idx| resolved.get(idx)));

        let mut x1 = 0.0;
        let mut y1 = 0.0;
        let mut x2 = 100.0;
        let mut y2 = 100.0;

        if let Some(b) = from_bounds {
            x1 = b.x + b.width / 2.0;
            y1 = b.y + b.height / 2.0;
        } else if let EdgeAnchor::Point(px, py) = edge.from {
            x1 = px;
            y1 = py;
        }

        if let Some(b) = to_bounds {
            x2 = b.x + b.width / 2.0;
            y2 = b.y + b.height / 2.0;
        } else if let EdgeAnchor::Point(px, py) = edge.to {
            x2 = px;
            y2 = py;
        }

        let start_arrowhead = match edge.arrow {
            ArrowKind::Start | ArrowKind::Both => "arrow",
            _ => "none",
        };
        let end_arrowhead = match edge.arrow {
            ArrowKind::End | ArrowKind::Both => "arrow",
            _ => "none",
        };

        let min_x = f32::min(x1, x2);
        let min_y = f32::min(y1, y2);
        let max_x = f32::max(x1, x2);
        let max_y = f32::max(y1, y2);

        let stroke_color = edge
            .props
            .stroke
            .as_ref()
            .and_then(|s| match s.paint {
                Paint::Solid(c) => Some(c.to_hex()),
                _ => None,
            })
            .unwrap_or_else(|| "#000000".to_string());

        let stroke_width = edge.props.stroke.as_ref().map(|s| s.width).unwrap_or(1.0);

        elements.push(json!({
            "id": edge.id.as_str(),
            "type": "arrow",
            "x": min_x,
            "y": min_y,
            "width": max_x - min_x,
            "height": max_y - min_y,
            "angle": 0,
            "strokeColor": stroke_color,
            "backgroundColor": "transparent",
            "fillStyle": "solid",
            "strokeWidth": stroke_width,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "roundness": { "type": 2, "value": 0 },
            "seed": 1,
            "version": 1,
            "versionNonce": 1,
            "isDeleted": false,
            "boundElements": null,
            "updated": 1,
            "link": null,
            "locked": false,
            "points": [
                [x1 - min_x, y1 - min_y],
                [x2 - min_x, y2 - min_y]
            ],
            "lastCommittedPoint": null,
            "startBinding": null,
            "endBinding": null,
            "startArrowhead": if start_arrowhead == "none" { serde_json::Value::Null } else { json!(start_arrowhead) },
            "endArrowhead": if end_arrowhead == "none" { serde_json::Value::Null } else { json!(end_arrowhead) },
        }));
    }

    let doc = ExcalidrawDocument {
        r#type: "excalidraw".to_string(),
        version: 2,
        source: "https://fast-draft.com".to_string(),
        elements,
        app_state: json!({
            "viewBackgroundColor": "#ffffff",
            "gridSize": null
        }),
        files: json!({}),
    };

    serde_json::to_string(&doc).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::NodeId;

    #[test]
    fn test_export_excalidraw_rect() {
        let mut sg = SceneGraph::new();
        sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("rect1"),
                NodeKind::Rect {
                    width: 100.0,
                    height: 50.0,
                },
            ),
        );
        let json = export_excalidraw(&sg);
        assert!(json.contains(r#""type":"rectangle""#));
        assert!(json.contains(r#""id":"rect1""#));
    }
}
