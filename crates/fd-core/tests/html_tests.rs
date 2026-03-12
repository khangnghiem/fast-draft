use fd_core::NodeId;
use fd_core::html::emit_html;
use fd_core::model::{NodeKind, SceneGraph, SceneNode};

#[test]
fn test_html_basic() {
    let mut graph = SceneGraph::new();
    let root = graph.root;
    let node = SceneNode::new(
        NodeId::intern("box1"),
        NodeKind::Rect {
            width: 100.0,
            height: 100.0,
        },
    );
    graph.add_node(root, node);

    let html = emit_html(&graph);
    assert!(html.contains("<!DOCTYPE html>"));
    assert!(html.contains("<div class=\"fd-node\" style=\"left: 0px; top: 0px; width: 100px; height: 100px; border: 1px solid black;\"></div>"));
}

#[test]
fn test_html_ellipse() {
    let mut graph = SceneGraph::new();
    let root = graph.root;
    let node = SceneNode::new(
        NodeId::intern("circ1"),
        NodeKind::Ellipse { rx: 50.0, ry: 50.0 },
    );
    graph.add_node(root, node);

    let html = emit_html(&graph);
    assert!(html.contains(
        "<ellipse cx=\"50\" cy=\"50\" rx=\"50\" ry=\"50\" fill=\"none\" stroke=\"black\" />"
    ));
}
