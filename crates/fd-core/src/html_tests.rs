use crate::html::emit_html;
use crate::id::NodeId;
use crate::model::*;
use smallvec::SmallVec;

#[test]
fn emit_html_basic_rect() {
    let mut graph = SceneGraph::new();
    let rect = SceneNode::new(
        NodeId::intern("r1"),
        NodeKind::Rect {
            width: 100.0,
            height: 50.0,
        },
    );
    let _idx = graph.add_node(graph.root, rect);
    let html = emit_html(&graph);
    // Ignore z-index exact number, just verify style
    assert!(html.contains("class=\"node\""));
    assert!(html.contains("left: 0px; top: 0px; width: 100px; height: 50px;"));
}

#[test]
fn emit_html_text_shadow() {
    let mut graph = SceneGraph::new();
    let mut text = SceneNode::new(
        NodeId::intern("t1"),
        NodeKind::Text {
            content: "Hello <World>".to_string(),
            max_width: None,
        },
    );
    text.props.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
    text.props.font = Some(FontSpec {
        family: "Arial".to_string(),
        size: 20.0,
        weight: 400,
    });
    let _idx = graph.add_node(graph.root, text);
    let html = emit_html(&graph);
    // Check XSS escaping
    assert!(html.contains("Hello &lt;World&gt;"));
    assert!(html.contains("font-family: 'Arial';"));
    assert!(html.contains("font-size: 20px;"));
}

#[test]
fn emit_html_edges() {
    let mut graph = SceneGraph::new();
    let r1 = SceneNode::new(
        NodeId::intern("r1"),
        NodeKind::Rect {
            width: 100.0,
            height: 50.0,
        },
    );
    let r2 = SceneNode::new(
        NodeId::intern("r2"),
        NodeKind::Rect {
            width: 100.0,
            height: 50.0,
        },
    );
    let _i1 = graph.add_node(graph.root, r1);
    let _i2 = graph.add_node(graph.root, r2);
    graph.edges.push(Edge {
        id: NodeId::intern("e1"),
        from: EdgeAnchor::Node(NodeId::intern("r1")),
        to: EdgeAnchor::Node(NodeId::intern("r2")),
        text_child: None,
        props: Properties::default(),
        use_styles: SmallVec::new(),
        arrow: ArrowKind::None,
        curve: CurveKind::Straight,
        note: None,
        animations: SmallVec::new(),
        flow: None,
        label_offset: None,
    });
    let html = emit_html(&graph);
    // Real edge check
    assert!(html.contains("<line"));
    assert!(html.contains("stroke=\"black\"")); // Black default
}
