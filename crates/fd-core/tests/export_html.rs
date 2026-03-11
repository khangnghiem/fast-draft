use fd_core::html::emit_html;
use fd_core::id::NodeId;
use fd_core::layout::Viewport;
use fd_core::model::{Color, NodeKind, Paint, Properties, SceneGraph};

#[test]
fn test_html_export_basic() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    let mut rect = fd_core::model::SceneNode::new(
        NodeId::intern("rect1"),
        NodeKind::Rect {
            width: 100.0,
            height: 100.0,
        },
    );
    rect.props.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));

    sg.add_node(root, rect);

    let html = emit_html(&sg);
    assert!(html.contains("<!DOCTYPE html>"));
    assert!(html.contains("<div"));
    assert!(html.contains("width: 100"));
    assert!(html.contains("height: 100"));
    assert!(html.contains("#FF0000")); // Solid red
}

#[test]
fn test_html_export_complex() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    // A Frame containing a rect
    let mut frame = fd_core::model::SceneNode::new(
        fd_core::id::NodeId::intern("frame1"),
        NodeKind::Frame {
            width: 400.0,
            height: 300.0,
            clip: true,
            layout: fd_core::model::LayoutMode::default(),
        },
    );
    let frame_idx = sg.add_node(root, frame);

    let mut inner_rect = fd_core::model::SceneNode::new(
        fd_core::id::NodeId::intern("rect2"),
        NodeKind::Rect {
            width: 50.0,
            height: 50.0,
        },
    );
    inner_rect.props.fill = Some(Paint::Solid(Color::rgba(0.0, 1.0, 0.0, 1.0)));
    // Constraint to move the rect 10,10 from the frame's top-left
    inner_rect
        .constraints
        .push(fd_core::model::Constraint::Position { x: 10.0, y: 10.0 });
    sg.add_node(frame_idx, inner_rect);

    // Text node
    let mut text = fd_core::model::SceneNode::new(
        fd_core::id::NodeId::intern("text1"),
        NodeKind::Text {
            content: "Hello <World>".into(),
            max_width: None,
        },
    );
    text.props.font = Some(fd_core::model::FontSpec {
        family: "Arial".into(),
        size: 24.0,
        weight: 400,
    });
    sg.add_node(root, text);

    // Path node
    let mut path = fd_core::model::SceneNode::new(
        fd_core::id::NodeId::intern("path1"),
        NodeKind::Path {
            commands: vec![
                fd_core::model::PathCmd::MoveTo(0.0, 0.0),
                fd_core::model::PathCmd::LineTo(100.0, 100.0),
            ],
        },
    );
    path.props.stroke = Some(fd_core::model::Stroke {
        paint: Paint::Solid(Color::rgba(0.0, 0.0, 1.0, 1.0)),
        width: 2.0,
        cap: fd_core::model::StrokeCap::Round,
        join: fd_core::model::StrokeJoin::Round,
    });
    sg.add_node(root, path);

    let html = emit_html(&sg);

    // Check elements
    assert!(html.contains("id=\"@frame1\""));
    assert!(html.contains("overflow: hidden;"));

    // Inner rect relative positioning
    // It should be inside the frame, so the HTML might look like <div id="@frame1"><div id="@rect2"...></div></div>
    assert!(html.contains("id=\"@rect2\""));
    assert!(html.contains("#00FF00"));

    // Check text escaping
    assert!(html.contains("Hello &lt;World&gt;"));
    assert!(html.contains("font-family: 'Arial'"));

    // Check SVG overlay
    assert!(html.contains("<svg"));
    assert!(html.contains("<path id=\"@path1\""));
    assert!(html.contains("M 0 0 L 100 100"));
    assert!(html.contains("#0000FF"));
    assert!(html.contains("stroke-width=\"2\""));
}

#[test]
fn print_html_debug() {
    let mut sg = SceneGraph::new();
    let root = sg.root;

    // A Frame containing a rect
    let frame = fd_core::model::SceneNode::new(
        fd_core::id::NodeId::intern("frame1"),
        NodeKind::Frame {
            width: 400.0,
            height: 300.0,
            clip: true,
            layout: fd_core::model::LayoutMode::default(),
        },
    );
    sg.add_node(root, frame);
    let html = emit_html(&sg);
    println!("DEBUG HTML:\n{}", html);
}
