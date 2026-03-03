use super::*;

#[test]
fn parse_minimal_document() {
    let input = r#"
# Comment
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let node = graph
        .get_by_id(NodeId::intern("box"))
        .expect("node not found");

    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 100.0);
            assert_eq!(*height, 50.0);
        }
        _ => panic!("expected Rect"),
    }
    assert!(node.style.fill.is_some());
}

#[test]
fn parse_style_and_use() {
    let input = r#"
style accent {
  fill: #6C5CE7
}

rect @btn {
  w: 200
  h: 48
  use: accent
}
"#;
    let graph = parse_document(input).expect("parse failed");
    assert!(graph.styles.contains_key(&NodeId::intern("accent")));
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.use_styles.len(), 1);
}

#[test]
fn parse_nested_group() {
    let input = r#"
group @form {
  layout: column gap=16 pad=32

  text @title "Hello" {
fill: #333333
  }

  rect @field {
w: 280
h: 44
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let form_idx = graph.index_of(NodeId::intern("form")).unwrap();
    let children = graph.children(form_idx);
    assert_eq!(children.len(), 2);
}

#[test]
fn parse_animation() {
    let input = r#"
rect @btn {
  w: 100
  h: 40
  fill: #6C5CE7

  anim :hover {
fill: #5A4BD1
scale: 1.02
ease: spring 300ms
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.animations.len(), 1);
    assert_eq!(btn.animations[0].trigger, AnimTrigger::Hover);
    assert_eq!(btn.animations[0].duration_ms, 300);
}

#[test]
fn parse_constraint() {
    let input = r#"
rect @box {
  w: 100
  h: 100
}

@box -> center_in: canvas
"#;
    let graph = parse_document(input).expect("parse failed");
    let node = graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node.constraints.len(), 1);
    match &node.constraints[0] {
        Constraint::CenterIn(target) => assert_eq!(target.as_str(), "canvas"),
        _ => panic!("expected CenterIn"),
    }
}

#[test]
fn parse_inline_wh() {
    let input = r#"
rect @box {
  w: 280 h: 44
  fill: #FF0000
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let node = graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 280.0);
            assert_eq!(*height, 44.0);
        }
        _ => panic!("expected Rect"),
    }
}

#[test]
fn parse_empty_document() {
    let input = "";
    let graph = parse_document(input).expect("empty doc should parse");
    assert_eq!(graph.children(graph.root).len(), 0);
}

#[test]
fn parse_comments_only() {
    let input = "# This is a comment\n# Another comment\n";
    let graph = parse_document(input).expect("comments-only should parse");
    assert_eq!(graph.children(graph.root).len(), 0);
}

#[test]
fn parse_anonymous_node() {
    let input = "rect { w: 50 h: 50 }";
    let graph = parse_document(input).expect("anonymous node should parse");
    assert_eq!(graph.children(graph.root).len(), 1);
}

#[test]
fn parse_ellipse() {
    let input = r#"
ellipse @dot {
  w: 30 h: 30
  fill: #FF5733
}
"#;
    let graph = parse_document(input).expect("ellipse should parse");
    let dot = graph.get_by_id(NodeId::intern("dot")).unwrap();
    match &dot.kind {
        NodeKind::Ellipse { rx, ry } => {
            assert_eq!(*rx, 30.0);
            assert_eq!(*ry, 30.0);
        }
        _ => panic!("expected Ellipse"),
    }
}

#[test]
fn parse_text_with_content() {
    let input = r#"
text @greeting "Hello World" {
  font: "Inter" 600 24
  fill: #1A1A2E
}
"#;
    let graph = parse_document(input).expect("text should parse");
    let node = graph.get_by_id(NodeId::intern("greeting")).unwrap();
    match &node.kind {
        NodeKind::Text { content } => {
            assert_eq!(content, "Hello World");
        }
        _ => panic!("expected Text"),
    }
    assert!(node.style.font.is_some());
    let font = node.style.font.as_ref().unwrap();
    assert_eq!(font.family, "Inter");
    assert_eq!(font.weight, 600);
    assert_eq!(font.size, 24.0);
}

#[test]
fn parse_stroke_property() {
    let input = r#"
rect @bordered {
  w: 100 h: 100
  stroke: #DDDDDD 2
}
"#;
    let graph = parse_document(input).expect("stroke should parse");
    let node = graph.get_by_id(NodeId::intern("bordered")).unwrap();
    assert!(node.style.stroke.is_some());
    let stroke = node.style.stroke.as_ref().unwrap();
    assert_eq!(stroke.width, 2.0);
}

#[test]
fn parse_multiple_constraints() {
    let input = r#"
rect @a { w: 100 h: 100 }
rect @b { w: 50 h: 50 }
@a -> center_in: canvas
@a -> absolute: 10, 20
"#;
    let graph = parse_document(input).expect("multiple constraints should parse");
    let node = graph.get_by_id(NodeId::intern("a")).unwrap();
    // The last constraint wins in layout, but both should be stored
    assert_eq!(node.constraints.len(), 2);
}

#[test]
fn parse_comments_between_nodes() {
    let input = r#"
# First node
rect @a { w: 100 h: 100 }
# Second node
rect @b { w: 200 h: 200 }
"#;
    let graph = parse_document(input).expect("interleaved comments should parse");
    assert_eq!(graph.children(graph.root).len(), 2);
}
#[test]
fn parse_frame() {
    let input = r#"
frame @card {
  w: 400 h: 300
  clip: true
  fill: #FFFFFF
  corner: 16
  layout: column gap=12 pad=20
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let node = graph
        .get_by_id(crate::id::NodeId::intern("card"))
        .expect("card not found");
    match &node.kind {
        NodeKind::Frame {
            width,
            height,
            clip,
            layout,
        } => {
            assert_eq!(*width, 400.0);
            assert_eq!(*height, 300.0);
            assert!(*clip);
            assert!(matches!(layout, LayoutMode::Column { .. }));
        }
        other => panic!("expected Frame, got {other:?}"),
    }
}

#[test]
fn roundtrip_frame() {
    let input = r#"
frame @panel {
  w: 200 h: 150
  clip: true
  fill: #F0F0F0
  layout: row gap=8 pad=10

  rect @child {
w: 50 h: 50
fill: #FF0000
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let emitted = crate::emitter::emit_document(&graph);
    let reparsed = parse_document(&emitted).expect("re-parse failed");
    let node = reparsed
        .get_by_id(crate::id::NodeId::intern("panel"))
        .expect("panel not found");
    match &node.kind {
        NodeKind::Frame {
            width,
            height,
            clip,
            layout,
        } => {
            assert_eq!(*width, 200.0);
            assert_eq!(*height, 150.0);
            assert!(*clip);
            assert!(matches!(layout, LayoutMode::Row { .. }));
        }
        other => panic!("expected Frame, got {other:?}"),
    }
    // Verify child is present
    let child = reparsed
        .get_by_id(crate::id::NodeId::intern("child"))
        .expect("child not found");
    assert!(matches!(child.kind, NodeKind::Rect { .. }));
}

#[test]
fn roundtrip_align() {
    let src = r#"
text @title "Hello" {
  fill: #FFFFFF
  font: "Inter" 600 24
  align: right bottom
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph
        .get_by_id(crate::id::NodeId::intern("title"))
        .expect("node not found");
    assert_eq!(node.style.text_align, Some(crate::model::TextAlign::Right));
    assert_eq!(
        node.style.text_valign,
        Some(crate::model::TextVAlign::Bottom)
    );

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("align: right bottom"));

    let reparsed = parse_document(&emitted).unwrap();
    let node2 = reparsed
        .get_by_id(crate::id::NodeId::intern("title"))
        .expect("node not found after roundtrip");
    assert_eq!(node2.style.text_align, Some(crate::model::TextAlign::Right));
    assert_eq!(
        node2.style.text_valign,
        Some(crate::model::TextVAlign::Bottom)
    );
}

#[test]
fn parse_align_center_only() {
    let src = r#"
text @heading "Welcome" {
  align: center
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph
        .get_by_id(crate::id::NodeId::intern("heading"))
        .expect("node not found");
    assert_eq!(node.style.text_align, Some(crate::model::TextAlign::Center));
    // Vertical not specified — should be None
    assert_eq!(node.style.text_valign, None);
}

#[test]
fn roundtrip_align_in_style_block() {
    let src = r#"
style heading_style {
  fill: #333333
  font: "Inter" 700 32
  align: left top
}

text @main_title "Hello" {
  use: heading_style
}
"#;
    let graph = parse_document(src).unwrap();

    // Style definition should have alignment
    let style = graph
        .styles
        .get(&crate::id::NodeId::intern("heading_style"))
        .expect("style not found");
    assert_eq!(style.text_align, Some(crate::model::TextAlign::Left));
    assert_eq!(style.text_valign, Some(crate::model::TextVAlign::Top));

    // Node using the style should inherit alignment
    let node = graph
        .get_by_id(crate::id::NodeId::intern("main_title"))
        .expect("node not found");
    let resolved = graph.resolve_style(node, &[]);
    assert_eq!(resolved.text_align, Some(crate::model::TextAlign::Left));
    assert_eq!(resolved.text_valign, Some(crate::model::TextVAlign::Top));

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("align: left top"));
    let reparsed = parse_document(&emitted).unwrap();
    let style2 = reparsed
        .styles
        .get(&crate::id::NodeId::intern("heading_style"))
        .expect("style not found after roundtrip");
    assert_eq!(style2.text_align, Some(crate::model::TextAlign::Left));
    assert_eq!(style2.text_valign, Some(crate::model::TextVAlign::Top));
}

#[test]
fn parse_font_weight_names() {
    let src = r#"
text @heading "Hello" {
  font: "Inter" bold 24
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph
        .get_by_id(crate::id::NodeId::intern("heading"))
        .unwrap();
    let font = node.style.font.as_ref().unwrap();
    assert_eq!(font.weight, 700);
    assert_eq!(font.size, 24.0);
}

#[test]
fn parse_font_weight_semibold() {
    let src = r#"text @t "Hi" { font: "Inter" semibold 16 }"#;
    let graph = parse_document(src).unwrap();
    let font = graph
        .get_by_id(crate::id::NodeId::intern("t"))
        .unwrap()
        .style
        .font
        .as_ref()
        .unwrap();
    assert_eq!(font.weight, 600);
    assert_eq!(font.size, 16.0);
}

#[test]
fn parse_named_color() {
    let src = r#"rect @r { w: 100 h: 50 fill: purple }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert!(
        node.style.fill.is_some(),
        "fill should be set from named color"
    );
}

#[test]
fn parse_named_color_blue() {
    let src = r#"rect @box { w: 50 h: 50 fill: blue }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("box")).unwrap();
    if let Some(crate::model::Paint::Solid(c)) = &node.style.fill {
        assert_eq!(c.to_hex(), "#3B82F6");
    } else {
        panic!("expected solid fill from named color");
    }
}

#[test]
fn parse_property_alias_background() {
    let src = r#"rect @r { w: 100 h: 50 background: #FF0000 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert!(node.style.fill.is_some(), "background: should map to fill");
}

#[test]
fn parse_property_alias_rounded() {
    let src = r#"rect @r { w: 100 h: 50 rounded: 12 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert_eq!(node.style.corner_radius, Some(12.0));
}

#[test]
fn parse_property_alias_radius() {
    let src = r#"rect @r { w: 100 h: 50 radius: 8 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert_eq!(node.style.corner_radius, Some(8.0));
}

#[test]
fn parse_dimension_px_suffix() {
    let src = r#"rect @r { w: 320px h: 200px }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    if let crate::model::NodeKind::Rect { width, height } = &node.kind {
        assert_eq!(*width, 320.0);
        assert_eq!(*height, 200.0);
    } else {
        panic!("expected rect");
    }
}

#[test]
fn parse_corner_px_suffix() {
    let src = r#"rect @r { w: 100 h: 50 corner: 10px }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert_eq!(node.style.corner_radius, Some(10.0));
}

#[test]
fn roundtrip_font_weight_name() {
    let src = r#"text @t "Hello" { font: "Inter" bold 18 }"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("bold"),
        "emitted output should use 'bold' not '700'"
    );
    let reparsed = parse_document(&emitted).unwrap();
    let font = reparsed
        .get_by_id(crate::id::NodeId::intern("t"))
        .unwrap()
        .style
        .font
        .as_ref()
        .unwrap();
    assert_eq!(font.weight, 700);
}

#[test]
fn roundtrip_named_color() {
    let src = r#"rect @r { w: 100 h: 50 fill: purple }"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    // Named color gets emitted as hex with hint comment
    assert!(emitted.contains("#8B5CF6"), "purple should emit as #8B5CF6");
    let reparsed = parse_document(&emitted).unwrap();
    assert!(
        reparsed
            .get_by_id(crate::id::NodeId::intern("r"))
            .unwrap()
            .style
            .fill
            .is_some()
    );
}

#[test]
fn roundtrip_property_aliases() {
    let src = r#"rect @r { w: 200 h: 100 background: #FF0000 rounded: 12 }"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    // Emitter uses canonical names
    assert!(
        emitted.contains("fill:"),
        "background: should emit as fill:"
    );
    assert!(
        emitted.contains("corner:"),
        "rounded: should emit as corner:"
    );
    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert!(node.style.fill.is_some());
    assert_eq!(node.style.corner_radius, Some(12.0));
}

#[test]
fn roundtrip_edge_label_offset() {
    let input = r#"
rect @a { w: 100 h: 50 }
rect @b { w: 100 h: 50 }

edge @link {
  from: @a
  to: @b
  arrow: end
  label_offset: 15.5 -8.3
}
"#;
    let graph = parse_document(input).expect("parse failed");
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.id, crate::id::NodeId::intern("link"));
    assert_eq!(edge.label_offset, Some((15.5, -8.3)));

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("label_offset:"),
        "emitter should include label_offset"
    );

    let reparsed = parse_document(&emitted).expect("re-parse failed");
    assert_eq!(reparsed.edges.len(), 1);
    let re_edge = &reparsed.edges[0];
    assert_eq!(re_edge.label_offset, Some((15.5, -8.3)));
}
