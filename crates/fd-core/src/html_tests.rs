use crate::NodeId;
use crate::html::emit_html;
use crate::model::*;

#[test]
fn test_html_export_basic() {
    let mut graph = SceneGraph::new();

    let node_id = NodeId::intern("rect1");
    let mut rect = SceneNode::new(
        node_id,
        NodeKind::Rect {
            width: 100.0,
            height: 50.0,
        },
    );
    rect.style.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
    rect.constraints
        .push(Constraint::Position { x: 10.0, y: 20.0 });

    graph.add_node(graph.root, rect);

    let html = emit_html(&graph);
    assert!(html.contains("<html"));
    assert!(html.contains("rect1"));
    assert!(html.contains("width: 100px"));
    assert!(html.contains("height: 50px"));
    assert!(html.contains("left: 10px"));
    assert!(html.contains("top: 20px"));
    assert!(html.contains("background: #FF0000;"));
}

#[test]
fn test_html_export_escape() {
    let mut graph = SceneGraph::new();

    let node_id = NodeId::intern("text1");
    let text = SceneNode::new(
        node_id,
        NodeKind::Text {
            content: "<script>alert('xss')</script>".to_string(),
            max_width: None,
        },
    );

    graph.add_node(graph.root, text);

    let html = emit_html(&graph);
    assert!(html.contains("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"));
    assert!(!html.contains("<script>"));
}
