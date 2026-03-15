use super::*;
use crate::NodeId;
use crate::model::*;
use std::collections::HashMap;

#[test]
fn emit_html_maps_rect_to_div() {
    let mut graph = SceneGraph::new();
    let rect_id = NodeId::intern("rect1");
    let node = SceneNode::new(
        rect_id,
        NodeKind::Rect {
            width: 200.0,
            height: 100.0,
        },
    );
    let idx = graph.add_node(graph.root, node);

    let mut bounds = HashMap::new();
    bounds.insert(
        idx,
        ResolvedBounds {
            x: 10.0,
            y: 20.0,
            width: 200.0,
            height: 100.0,
        },
    );

    let html = emit_html(&graph, &bounds);

    assert!(html.contains("<div class=\"fd-canvas\">"));
    assert!(html.contains("left: 10px; top: 20px; width: 200px; height: 100px;"));
    assert!(html.contains("<div class=\"fd-node\""));
}

#[test]
fn emit_html_maps_ellipse_to_svg() {
    let mut graph = SceneGraph::new();
    let id = NodeId::intern("circle");
    let node = SceneNode::new(id, NodeKind::Ellipse { rx: 50.0, ry: 50.0 });
    let idx = graph.add_node(graph.root, node);

    let mut bounds = HashMap::new();
    bounds.insert(
        idx,
        ResolvedBounds {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        },
    );

    let html = emit_html(&graph, &bounds);

    assert!(html.contains("<svg class=\"fd-svg-wrapper\""));
    assert!(html.contains("viewBox=\"0 0 100 100\""));
    assert!(html.contains("<ellipse cx=\"50\" cy=\"50\" rx=\"50\" ry=\"50\""));
}

#[test]
fn emit_html_maps_text() {
    let mut graph = SceneGraph::new();
    let id = NodeId::intern("txt");
    let node = SceneNode::new(
        id,
        NodeKind::Text {
            content: "Hello\nWorld".to_string(),
            max_width: None,
        },
    );
    let idx = graph.add_node(graph.root, node);

    let mut bounds = HashMap::new();
    bounds.insert(
        idx,
        ResolvedBounds {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 20.0,
        },
    );

    let html = emit_html(&graph, &bounds);

    assert!(html.contains("<div class=\"fd-node\""));
    assert!(html.contains("Hello<br>World"));
}
