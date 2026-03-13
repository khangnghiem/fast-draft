use fd_core::html::emit_html;
use fd_core::id::NodeId;
use fd_core::model::*;

#[test]
fn test_emit_html() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    let mut node = SceneNode::new(
        NodeId::intern("rect1"),
        NodeKind::Rect {
            width: 100.0,
            height: 100.0,
        },
    );
    node.props.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
    sg.add_node(root, node);

    let html = emit_html(&sg);
    assert!(html.contains("width: 100px; height: 100px;"));
    assert!(html.contains("background-color: #FF0000;"));
}

#[test]
fn test_emit_html_text() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    let node = SceneNode::new(
        NodeId::intern("text1"),
        NodeKind::Text {
            content: "Hello".to_string(),
            max_width: None,
        },
    );
    sg.add_node(root, node);

    let html = emit_html(&sg);
    assert!(html.contains("Hello"));
}

#[test]
fn test_emit_html_ellipse() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    let mut node = SceneNode::new(
        NodeId::intern("circle1"),
        NodeKind::Ellipse { rx: 50.0, ry: 50.0 },
    );
    node.props.fill = Some(Paint::Solid(Color::rgba(0.0, 1.0, 0.0, 1.0)));
    sg.add_node(root, node);

    let html = emit_html(&sg);
    assert!(html.contains("<ellipse"));
    assert!(html.contains("fill=\"#00FF00\""));
}

#[test]
fn test_emit_html_edges() {
    let mut sg = SceneGraph::new();

    let mut edge = Edge {
        id: NodeId::intern("e1"),
        from: EdgeAnchor::Point(0.0, 0.0),
        to: EdgeAnchor::Point(100.0, 100.0),
        text_child: None,
        props: Properties::default(),
        use_styles: Default::default(),
        arrow: ArrowKind::None,
        curve: CurveKind::Straight,
        note: None,
        animations: Default::default(),
        flow: None,
        label_offset: None,
    };
    edge.props.stroke = Some(Stroke {
        paint: Paint::Solid(Color::rgba(0.0, 0.0, 1.0, 1.0)),
        width: 2.0,
        cap: StrokeCap::Round,
        join: StrokeJoin::Round,
    });

    sg.edges.push(edge);

    let html = emit_html(&sg);
    assert!(html.contains("<line x1=\"0\" y1=\"0\" x2=\"100\" y2=\"100\""));
    assert!(html.contains("stroke=\"#0000FF\""));
    assert!(html.contains("stroke-width=\"2\""));
}

#[test]
fn test_emit_html_path() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    let node = SceneNode::new(
        NodeId::intern("path1"),
        NodeKind::Path {
            commands: vec![
                PathCmd::MoveTo(0.0, 0.0),
                PathCmd::LineTo(100.0, 100.0),
                PathCmd::Close,
            ],
        },
    );
    sg.add_node(root, node);

    let html = emit_html(&sg);
    assert!(html.contains("<path d=\"M 0 0 L 100 100 Z\""));
}
