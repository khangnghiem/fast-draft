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
    assert!(node.props.fill.is_some());
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
            assert_eq!(*rx, 15.0);
            assert_eq!(*ry, 15.0);
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
        NodeKind::Text { content, .. } => {
            assert_eq!(content, "Hello World");
        }
        _ => panic!("expected Text"),
    }
    assert!(node.props.font.is_some());
    let font = node.props.font.as_ref().unwrap();
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
    assert!(node.props.stroke.is_some());
    let stroke = node.props.stroke.as_ref().unwrap();
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
    assert_eq!(node.props.text_align, Some(crate::model::TextAlign::Right));
    assert_eq!(
        node.props.text_valign,
        Some(crate::model::TextVAlign::Bottom)
    );

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("align: right bottom"));

    let reparsed = parse_document(&emitted).unwrap();
    let node2 = reparsed
        .get_by_id(crate::id::NodeId::intern("title"))
        .expect("node not found after roundtrip");
    assert_eq!(node2.props.text_align, Some(crate::model::TextAlign::Right));
    assert_eq!(
        node2.props.text_valign,
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
    assert_eq!(node.props.text_align, Some(crate::model::TextAlign::Center));
    // Vertical not specified — should be None
    assert_eq!(node.props.text_valign, None);
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
    let font = node.props.font.as_ref().unwrap();
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
        .props
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
        node.props.fill.is_some(),
        "fill should be set from named color"
    );
}

#[test]
fn parse_named_color_blue() {
    let src = r#"rect @box { w: 50 h: 50 fill: blue }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("box")).unwrap();
    if let Some(crate::model::Paint::Solid(c)) = &node.props.fill {
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
    assert!(node.props.fill.is_some(), "background: should map to fill");
}

#[test]
fn parse_property_alias_rounded_ignored() {
    // rounded: is deprecated — now treated as unknown property and skipped
    let src = r#"rect @r { w: 100 h: 50 rounded: 12 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert_eq!(node.props.corner_radius, None, "rounded: should be ignored");
}

#[test]
fn parse_property_alias_radius_ignored() {
    // radius: is deprecated — now treated as unknown property and skipped
    let src = r#"rect @r { w: 100 h: 50 radius: 8 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert_eq!(node.props.corner_radius, None, "radius: should be ignored");
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
    assert_eq!(node.props.corner_radius, Some(10.0));
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
        .props
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
            .props
            .fill
            .is_some()
    );
}

#[test]
fn roundtrip_property_aliases() {
    let src = r#"rect @r { w: 200 h: 100 background: #FF0000 corner: 12 }"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    // Emitter uses canonical names
    assert!(
        emitted.contains("fill:"),
        "background: should emit as fill:"
    );
    assert!(
        emitted.contains("corner:"),
        "corner: should round-trip as corner:"
    );
    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert!(node.props.fill.is_some());
    assert_eq!(node.props.corner_radius, Some(12.0));
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

#[test]
fn roundtrip_text_max_width() {
    let input = r#"
text @label "Hello World" {
  w: 120
  font: "Inter" 400 14
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let node = graph.get_by_id(NodeId::intern("label")).unwrap();
    match &node.kind {
        NodeKind::Text { content, max_width } => {
            assert_eq!(content, "Hello World");
            assert_eq!(*max_width, Some(120.0));
        }
        _ => panic!("expected Text"),
    }

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("w: 120"), "emitter should include w:");

    let reparsed = parse_document(&emitted).expect("re-parse failed");
    let node2 = reparsed.get_by_id(NodeId::intern("label")).unwrap();
    match &node2.kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(*max_width, Some(120.0));
        }
        _ => panic!("expected Text after roundtrip"),
    }
}

#[test]
fn roundtrip_text_no_max_width() {
    let input = r#"text @t "No wrap" { font: "Inter" 400 14 }"#;
    let graph = parse_document(input).expect("parse failed");
    let node = graph.get_by_id(NodeId::intern("t")).unwrap();
    match &node.kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(*max_width, None, "text without w: should have no max_width");
        }
        _ => panic!("expected Text"),
    }

    // Emit should not contain w: for text without max_width
    let emitted = crate::emitter::emit_document(&graph);
    // Check that the text line doesn't have a standalone w: line
    let lines: Vec<&str> = emitted.lines().collect();
    for line in &lines {
        let trimmed = line.trim();
        if trimmed.starts_with("w:") && !trimmed.contains("h:") {
            panic!(
                "text without max_width should not emit w: line, got: {}",
                trimmed
            );
        }
    }
}

#[test]
fn parse_place_center() {
    let src = r#"text @label "Hello" { place: center }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("label")).unwrap();
    assert_eq!(
        node.place,
        Some((crate::model::HPlace::Center, crate::model::VPlace::Middle))
    );
}

#[test]
fn parse_place_top_left() {
    let src = r#"rect @icon { w: 32 h: 32 place: top-left }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("icon")).unwrap();
    assert_eq!(
        node.place,
        Some((crate::model::HPlace::Left, crate::model::VPlace::Top))
    );
}

#[test]
fn parse_place_two_arg() {
    let src = r#"text @t "Hello" { place: right bottom }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("t")).unwrap();
    assert_eq!(
        node.place,
        Some((crate::model::HPlace::Right, crate::model::VPlace::Bottom))
    );
}

#[test]
fn roundtrip_place() {
    let src = r#"
rect @card {
  w: 200 h: 100
  text @title "Hello" {
    place: top-left
  }
  text @sub "World" {
    place: bottom-right
  }
}
"#;
    let graph = parse_document(src).unwrap();
    let title = graph.get_by_id(crate::id::NodeId::intern("title")).unwrap();
    assert_eq!(
        title.place,
        Some((crate::model::HPlace::Left, crate::model::VPlace::Top))
    );

    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("place: top-left"), "emitted: {emitted}");
    assert!(
        emitted.contains("place: bottom-right"),
        "emitted: {emitted}"
    );

    let reparsed = parse_document(&emitted).unwrap();
    let title2 = reparsed
        .get_by_id(crate::id::NodeId::intern("title"))
        .unwrap();
    assert_eq!(
        title2.place,
        Some((crate::model::HPlace::Left, crate::model::VPlace::Top))
    );
    let sub2 = reparsed
        .get_by_id(crate::id::NodeId::intern("sub"))
        .unwrap();
    assert_eq!(
        sub2.place,
        Some((crate::model::HPlace::Right, crate::model::VPlace::Bottom))
    );
}

#[test]
fn parse_free_frame_pad() {
    let src = r#"
frame @card {
  w: 400 h: 300
  pad: 16
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("card")).unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Free { pad } => {
                assert_eq!(*pad, 16.0, "pad should be 16");
            }
            other => panic!("expected Free layout, got {other:?}"),
        },
        other => panic!("expected Frame, got {other:?}"),
    }
}

#[test]
fn roundtrip_free_frame_pad() {
    let src = r#"
frame @card {
  w: 400 h: 300
  pad: 12
  rect @child { w: 100 h: 50 }
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("pad: 12"),
        "emitted should contain pad: 12, got: {emitted}"
    );

    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed
        .get_by_id(crate::id::NodeId::intern("card"))
        .unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Free { pad } => {
                assert_eq!(*pad, 12.0, "pad should survive roundtrip");
            }
            other => panic!("expected Free layout after roundtrip, got {other:?}"),
        },
        other => panic!("expected Frame after roundtrip, got {other:?}"),
    }
}

#[test]
fn parse_free_frame_pad_zero_omitted() {
    // Free frame with pad=0 should NOT emit pad: line
    let src = r#"
frame @card {
  w: 400 h: 300
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        !emitted.contains("pad:") && !emitted.contains("padding:"),
        "pad: 0 should not appear in emitted output"
    );
}

#[test]
fn parse_property_alias_border() {
    let src = r#"rect @r { w: 100 h: 50 border: #DDDDDD 2 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("r")).unwrap();
    assert!(node.props.stroke.is_some(), "border: should map to stroke");
    let stroke = node.props.stroke.as_ref().unwrap();
    assert_eq!(stroke.width, 2.0);

    // Emitter uses canonical name
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("stroke:"),
        "border: should emit as stroke:"
    );
    // Round-trip
    let reparsed = parse_document(&emitted).unwrap();
    assert!(
        reparsed
            .get_by_id(crate::id::NodeId::intern("r"))
            .unwrap()
            .props
            .stroke
            .is_some()
    );
}

#[test]
fn parse_property_alias_apply() {
    let src = r#"
style accent {
  fill: #6C5CE7
}
rect @btn { w: 200 h: 48 apply: accent }
"#;
    let graph = parse_document(src).unwrap();
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.use_styles.len(), 1, "apply: should map to use:");

    // Emitter uses canonical name
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("use: accent"),
        "apply: should emit as use:"
    );
    // Round-trip
    let reparsed = parse_document(&emitted).unwrap();
    let btn2 = reparsed.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn2.use_styles.len(), 1);
}

#[test]
fn roundtrip_padding_canonical() {
    // Emitter should output 'pad:' (canonical form), and parser should accept both 'pad:' and 'padding:'
    let src = r#"
frame @card {
  w: 400 h: 300
  padding: 16
  rect @child { w: 100 h: 50 }
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("pad: 16"),
        "emitter should output 'pad:' canonical form, got: {emitted}"
    );
    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed
        .get_by_id(crate::id::NodeId::intern("card"))
        .unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Free { pad } => {
                assert_eq!(*pad, 16.0, "padding should survive roundtrip");
            }
            other => panic!("expected Free layout, got {other:?}"),
        },
        other => panic!("expected Frame, got {other:?}"),
    }
}

#[test]
fn parse_animation_press_default_duration() {
    let input = r#"
rect @btn {
  w: 100 h: 40
  anim :press {
    scale: 0.97
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.animations.len(), 1);
    assert_eq!(btn.animations[0].trigger, AnimTrigger::Press);
    assert_eq!(
        btn.animations[0].duration_ms, 150,
        ":press default should be 150ms"
    );
}

#[test]
fn parse_animation_enter_default_duration() {
    let input = r#"
rect @hero {
  w: 400 h: 200
  anim :enter {
    opacity: 1.0
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let hero = graph.get_by_id(NodeId::intern("hero")).unwrap();
    assert_eq!(hero.animations.len(), 1);
    assert_eq!(hero.animations[0].trigger, AnimTrigger::Enter);
    assert_eq!(
        hero.animations[0].duration_ms, 500,
        ":enter default should be 500ms"
    );
}

#[test]
fn parse_animation_delay() {
    let input = r#"
rect @card {
  w: 200 h: 100
  anim :hover {
    scale: 1.05
    ease: ease_out 200ms
    delay: 500ms
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let card = graph.get_by_id(NodeId::intern("card")).unwrap();
    assert_eq!(card.animations.len(), 1);
    assert_eq!(card.animations[0].delay_ms, Some(500));
    assert_eq!(card.animations[0].duration_ms, 200);
}

#[test]
fn roundtrip_animation_delay() {
    let input = r#"
rect @btn {
  w: 100 h: 40
  anim :hover {
    scale: 1.1
    ease: spring 300ms
    delay: 250ms
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.animations[0].delay_ms, Some(250));

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("delay: 250ms"), "emitted: {emitted}");

    let reparsed = parse_document(&emitted).expect("re-parse failed");
    let btn2 = reparsed.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn2.animations[0].delay_ms, Some(250));
    assert_eq!(btn2.animations[0].duration_ms, 300);
}

#[test]
fn parse_animation_explicit_duration_overrides_default() {
    // Even with :press (default 150ms), explicit ease: should override
    let input = r#"
rect @btn {
  w: 100 h: 40
  anim :press {
    scale: 0.95
    ease: ease_out 80ms
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(
        btn.animations[0].duration_ms, 80,
        "explicit duration should override trigger default"
    );
}

#[test]
fn parse_animation_no_delay_default() {
    let input = r#"
rect @btn {
  w: 100 h: 40
  anim :hover {
    scale: 1.05
    ease: ease_out 300ms
  }
}
"#;
    let graph = parse_document(input).expect("parse failed");
    let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(
        btn.animations[0].delay_ms, None,
        "delay should be None by default"
    );
}

#[test]
fn roundtrip_locked() {
    let src = r#"
rect @frozen {
  w: 100 h: 50
  fill: #007AFF
  locked: true
}
rect @free {
  w: 80 h: 40
}
"#;
    let graph = parse_document(src).unwrap();
    let frozen = graph.get_by_id(NodeId::intern("frozen")).unwrap();
    assert!(frozen.locked, "locked should be true after parse");
    let free = graph.get_by_id(NodeId::intern("free")).unwrap();
    assert!(!free.locked, "locked should default to false");

    // Emit and re-parse
    let emitted = crate::emitter::emit_document(&graph);
    assert!(emitted.contains("locked: true"), "emitted: {emitted}");
    // Unlocked node should NOT have locked: in output
    let frozen_block = emitted.split("@frozen").nth(1).unwrap_or("");
    assert!(frozen_block.contains("locked: true"));

    let reparsed = parse_document(&emitted).unwrap();
    let frozen2 = reparsed.get_by_id(NodeId::intern("frozen")).unwrap();
    assert!(frozen2.locked, "locked should survive roundtrip");
    let free2 = reparsed.get_by_id(NodeId::intern("free")).unwrap();
    assert!(!free2.locked, "unlocked should survive roundtrip");
}

#[test]
fn parse_text_ignores_nested_nodes() {
    // Text nodes are leaf-only — any nested node keywords inside a text
    // block should be silently ignored (not parsed as children).
    let input = r#"
text @outer "Hello" {
  fill: #FF0000
  rect @inner { w: 50 h: 50 }
}
"#;
    let graph = parse_document(input).expect("parse should succeed");
    let outer = graph
        .get_by_id(crate::id::NodeId::intern("outer"))
        .expect("@outer should exist");
    assert!(
        matches!(outer.kind, NodeKind::Text { .. }),
        "outer should be a text node"
    );
    // The @inner rect should NOT exist — text can't have children
    assert!(
        graph
            .get_by_id(crate::id::NodeId::intern("inner"))
            .is_none(),
        "@inner should not be parsed as a child of a text node"
    );
    // Text node should have no children in the graph
    let outer_idx = graph.index_of(crate::id::NodeId::intern("outer")).unwrap();
    assert!(
        graph.children(outer_idx).is_empty(),
        "text node should have no children"
    );
}

#[test]
fn roundtrip_import_namespace_example() {
    let src = std::fs::read_to_string("../../examples/import_namespace.fd").unwrap();
    let graph = crate::parser::parse_document(&src).expect("Failed to parse import_namespace.fd");

    // Ensure we correctly captured the import
    assert_eq!(graph.imports.len(), 1);
    assert_eq!(graph.imports[0].path, "shared_library.fd");
    assert_eq!(graph.imports[0].namespace, "lib");

    // Check that we're using namespaced styles
    let mut uses_lib_primary = false;
    for node_idx in graph.graph.node_indices() {
        let node = &graph.graph[node_idx];
        if node
            .use_styles
            .iter()
            .any(|id| id.as_str() == "lib.primary_button")
        {
            uses_lib_primary = true;
        }
    }
    assert!(uses_lib_primary, "Failed to find use: lib.primary_button");

    let emitted = crate::emitter::emit_document(&graph);
    let parsed2 =
        crate::parser::parse_document(&emitted).expect("Failed to re-parse emitted document");

    assert_eq!(graph.imports.len(), parsed2.imports.len());
}

// ─── Style extends tests ─────────────────────────────────────────────

#[test]
fn parse_style_extends() {
    let src = r#"
style card {
  fill: #FFFFFF
  corner: 12
}
style dark_card {
  extends: card
  fill: #1A1A2E
}
rect @box {
  w: 100 h: 50
  use: dark_card
}
"#;
    let graph = parse_document(src).unwrap();
    // dark_card should extend card
    let dark_id = crate::id::NodeId::intern("dark_card");
    let card_id = crate::id::NodeId::intern("card");
    assert_eq!(
        graph.style_extends.get(&dark_id),
        Some(&card_id),
        "dark_card should extend card"
    );
    // dark_card should have its own fill
    let dark_style = graph.styles.get(&dark_id).unwrap();
    assert!(dark_style.fill.is_some());
    // card should NOT be in extends (it has no parent)
    assert!(
        graph.style_extends.get(&card_id).is_none(),
        "card should not have extends"
    );
}

#[test]
fn roundtrip_style_extends() {
    let src = r#"
style base {
  fill: #FFFFFF
  corner: 8
}
style variant {
  extends: base
  fill: #000000
}
rect @box {
  w: 100 h: 50
  use: variant
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("extends: base"),
        "emitted should contain extends: base, got: {emitted}"
    );
    let graph2 = parse_document(&emitted).expect("re-parse failed");
    let variant_id = crate::id::NodeId::intern("variant");
    let base_id = crate::id::NodeId::intern("base");
    assert_eq!(
        graph2.style_extends.get(&variant_id),
        Some(&base_id),
        "extends should survive roundtrip"
    );
}

#[test]
fn parse_style_extends_with_override() {
    let src = r#"
style parent_style {
  fill: #FF0000
  corner: 16
  opacity: 0.8
}
style child_style {
  extends: parent_style
  fill: #00FF00
}
rect @box {
  w: 100 h: 50
  use: child_style
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("box")).unwrap();
    // resolve_style should: apply parent_style first, then child_style over it
    let resolved = graph.resolve_style(node, &[]);
    // fill should be child's override (#00FF00)
    assert!(resolved.fill.is_some(), "fill should be resolved");
    // corner should come from parent (16)
    assert_eq!(
        resolved.corner_radius,
        Some(16.0),
        "corner should inherit from parent"
    );
    // opacity should come from parent (0.8)
    assert_eq!(
        resolved.opacity,
        Some(0.8),
        "opacity should inherit from parent"
    );
}

// ─── Inline constraint tests ─────────────────────────────────────────

#[test]
fn parse_inline_center_in() {
    let src = r#"rect @hero { w: 200 h: 100; center_in: canvas }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("hero")).unwrap();
    assert_eq!(node.constraints.len(), 1);
    match &node.constraints[0] {
        Constraint::CenterIn(target) => assert_eq!(target.as_str(), "canvas"),
        _ => panic!("expected CenterIn"),
    }
}

#[test]
fn parse_inline_offset() {
    let src = r#"
rect @hero { w: 200 h: 100 }
rect @card { w: 100 h: 50; offset: @hero 0, 80 }
"#;
    let graph = parse_document(src).unwrap();
    let card = graph.get_by_id(crate::id::NodeId::intern("card")).unwrap();
    assert_eq!(card.constraints.len(), 1);
    match &card.constraints[0] {
        Constraint::Offset { from, dx, dy } => {
            assert_eq!(from.as_str(), "hero");
            assert_eq!(*dx, 0.0);
            assert_eq!(*dy, 80.0);
        }
        _ => panic!("expected Offset"),
    }
}

#[test]
fn parse_inline_fill_parent() {
    let src = r#"frame @side { w: 200 h: 400; fill_parent: 12 }"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("side")).unwrap();
    assert_eq!(node.constraints.len(), 1);
    match &node.constraints[0] {
        Constraint::FillParent { pad } => assert_eq!(*pad, 12.0),
        _ => panic!("expected FillParent"),
    }
}

#[test]
fn roundtrip_inline_constraints() {
    let src = r#"
rect @hero { w: 200 h: 100; center_in: canvas }
rect @card { w: 100 h: 50; offset: @hero 0, 80 }
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);

    // Should emit inline (inside node block), NOT external @id -> verb:
    assert!(emitted.contains("center_in: canvas"), "emitted: {emitted}");
    assert!(
        emitted.contains("offset: @hero 0, 80"),
        "emitted: {emitted}"
    );
    assert!(
        !emitted.contains("->"),
        "should NOT contain -> constraint arrows: {emitted}"
    );

    // Round-trip
    let reparsed = parse_document(&emitted).unwrap();
    let hero = reparsed
        .get_by_id(crate::id::NodeId::intern("hero"))
        .unwrap();
    assert!(matches!(&hero.constraints[0], Constraint::CenterIn(_)));
    let card = reparsed
        .get_by_id(crate::id::NodeId::intern("card"))
        .unwrap();
    assert!(matches!(&card.constraints[0], Constraint::Offset { .. }));
}

#[test]
fn parse_legacy_arrow_constraint() {
    // Old @id -> verb: syntax should still parse (backward compat)
    let src = r#"
rect @box { w: 100 h: 100 }
@box -> center_in: canvas
"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("box")).unwrap();
    assert_eq!(node.constraints.len(), 1);
    match &node.constraints[0] {
        Constraint::CenterIn(target) => assert_eq!(target.as_str(), "canvas"),
        _ => panic!("expected CenterIn"),
    }
}

// ─── Edge header syntax tests ─────────────────────────────────────────

#[test]
fn parse_edge_header_syntax() {
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @flow @a -> @b {
  arrow: end
}
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.id.as_str(), "flow");
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(edge.to, EdgeAnchor::Node(NodeId::intern("b")));
    assert_eq!(edge.arrow, ArrowKind::End);
}

#[test]
fn parse_edge_header_braceless() {
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @flow @a -> @b
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.id.as_str(), "flow");
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(edge.to, EdgeAnchor::Node(NodeId::intern("b")));
}

#[test]
fn parse_edge_header_anonymous() {
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @a -> @b
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(edge.to, EdgeAnchor::Node(NodeId::intern("b")));
}

#[test]
fn parse_edge_header_with_label() {
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @flow @a -> @b "submit"
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.id.as_str(), "flow");
    let text_id = edge.text_child.expect("should have text child");
    let text_node = graph.get_by_id(text_id).expect("text node should exist");
    if let NodeKind::Text { content, .. } = &text_node.kind {
        assert_eq!(content, "submit");
    } else {
        panic!("expected Text node");
    }
}

#[test]
fn roundtrip_edge_header() {
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @flow @a -> @b {
  stroke: #6C5CE7 2
  arrow: end
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);

    // Should emit header form
    assert!(
        emitted.contains("edge @flow @a -> @b"),
        "emitted: {emitted}"
    );
    assert!(
        !emitted.contains("from: @a"),
        "should NOT have from: in body: {emitted}"
    );

    let reparsed = parse_document(&emitted).unwrap();
    let edge = &reparsed.edges[0];
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(edge.to, EdgeAnchor::Node(NodeId::intern("b")));
    assert_eq!(edge.arrow, ArrowKind::End);
}

#[test]
fn parse_edge_legacy_body() {
    // Old from:/to: syntax inside body should still parse (backward compat)
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @old {
  from: @a
  to: @b
  arrow: end
}
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(edge.to, EdgeAnchor::Node(NodeId::intern("b")));
    assert_eq!(edge.arrow, ArrowKind::End);
}

#[test]
fn emit_edge_braceless() {
    // Edge with only default properties should emit without braces
    let src = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
edge @flow @a -> @b
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    // Should be braceless — no { }
    assert!(
        emitted.contains("edge @flow @a -> @b\n"),
        "should be braceless: {emitted}"
    );
    assert!(
        !emitted.contains("edge @flow @a -> @b {"),
        "should NOT have opening brace: {emitted}"
    );
}

#[test]
fn parse_edge_multi_target() {
    let src = r#"
rect @a {}
rect @b {}
rect @c {}
edge @flow @a -> @b, @c {
  stroke: #FF0000 2
}
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 2);

    // First edge keeps the original alias if it's not internal _edge_
    assert_eq!(graph.edges[0].id.as_str(), "flow");
    assert_eq!(graph.edges[0].from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(graph.edges[0].to, EdgeAnchor::Node(NodeId::intern("b")));
    assert_eq!(graph.edges[0].props.stroke.as_ref().unwrap().width, 2.0);

    // Second edge gets a suffixed ID
    assert_eq!(graph.edges[1].id.as_str(), "flow_1");
    assert_eq!(graph.edges[1].from, EdgeAnchor::Node(NodeId::intern("a")));
    assert_eq!(graph.edges[1].to, EdgeAnchor::Node(NodeId::intern("c")));
    assert_eq!(graph.edges[1].props.stroke.as_ref().unwrap().width, 2.0);
}

#[test]
fn parse_edge_multi_target_braceless() {
    let src = r#"
rect @a {}
rect @b {}
rect @c {}
edge @flow @a -> @b, @c
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 2);
    assert_eq!(graph.edges[0].id.as_str(), "flow");
    assert_eq!(graph.edges[1].to, EdgeAnchor::Node(NodeId::intern("c")));
}

#[test]
fn parse_edge_multi_target_anonymous() {
    let src = r#"
rect @a {}
rect @b {}
rect @c {}
edge @a -> @b, @c
"#;
    let graph = parse_document(src).unwrap();
    assert_eq!(graph.edges.len(), 2);
    assert!(graph.edges[0].id.as_str().starts_with("_edge_"));
    assert!(graph.edges[1].id.as_str().starts_with("_edge_"));
    assert_ne!(graph.edges[0].id, graph.edges[1].id);
    assert_eq!(graph.edges[1].to, EdgeAnchor::Node(NodeId::intern("c")));
}

#[test]
fn test_grid_layout_frame() {
    let src = r#"
frame @f {
  layout: grid cols=3 gap=8 pad=12
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("f")).unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Grid { cols, gap, pad, .. } => {
                assert_eq!(*cols, 3);
                assert_eq!(*gap, 8.0);
                assert_eq!(*pad, 12.0);
            }
            _ => panic!("expected Grid"),
        },
        _ => panic!("expected Frame"),
    }
}

#[test]
fn roundtrip_grid_cols() {
    let src = r#"
frame @f {
  w: 600 h: 400
  layout: grid cols=4 gap=10 pad=8
  rect @a { w: 50 h: 50 }
  rect @b { w: 50 h: 50 }
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("cols=4"),
        "emitted should preserve cols=4, got: {emitted}"
    );

    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed.get_by_id(crate::id::NodeId::intern("f")).unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Grid { cols, .. } => {
                assert_eq!(*cols, 4, "cols=4 must survive roundtrip");
            }
            _ => panic!("expected Grid after roundtrip"),
        },
        _ => panic!("expected Frame after roundtrip"),
    }
}

#[test]
fn test_layout_cross_align() {
    let src = r#"
frame @f {
  layout: column gap=10 pad=10 align=center
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph.get_by_id(crate::id::NodeId::intern("f")).unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Column { align, .. } => {
                assert_eq!(*align, crate::model::LayoutAlign::Center);
            }
            _ => panic!("expected Column"),
        },
        _ => panic!("expected Frame"),
    }
}

#[test]
fn roundtrip_layout_align() {
    let src = r#"
frame @panel {
  w: 400 h: 300
  layout: row gap=12 pad=16 align=end
  rect @child { w: 80 h: 40 }
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("align=end"),
        "emitted should contain align=end, got: {emitted}"
    );

    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed
        .get_by_id(crate::id::NodeId::intern("panel"))
        .unwrap();
    match &node.kind {
        NodeKind::Frame { layout, .. } => match layout {
            crate::model::LayoutMode::Row { align, .. } => {
                assert_eq!(
                    *align,
                    crate::model::LayoutAlign::End,
                    "align=end must survive roundtrip"
                );
            }
            _ => panic!("expected Row after roundtrip"),
        },
        _ => panic!("expected Frame after roundtrip"),
    }
}

#[test]
fn roundtrip_layout_align_default_omitted() {
    // align=start is the default — should NOT appear in emitted output
    let src = r#"
frame @f {
  w: 200 h: 100
  layout: column gap=8 pad=10
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        !emitted.contains("align="),
        "default align=start should not be emitted, got: {emitted}"
    );
}

#[test]
fn test_multiline_text() {
    let src = r#"
text @multiline """Line 1
Line 2
"Quoted"
Line 4""" {
  font: "Inter" 400 16
}
"#;
    let graph = parse_document(src).unwrap();
    let node = graph
        .get_by_id(crate::id::NodeId::intern("multiline"))
        .unwrap();
    match &node.kind {
        NodeKind::Text { content, .. } => {
            assert!(content.contains("Line 1\nLine 2"));
            assert!(content.contains("\"Quoted\""));
        }
        _ => panic!("expected Text"),
    }
}

#[test]
fn roundtrip_multiline_text() {
    let src = r#"
text @ml """Hello
"World"
Third line""" {
  font: "Inter" 400 14
}
"#;
    let graph = parse_document(src).unwrap();
    let emitted = crate::emitter::emit_document(&graph);
    assert!(
        emitted.contains("\"\"\""),
        "multiline text should emit triple quotes, got: {emitted}"
    );

    let reparsed = parse_document(&emitted).unwrap();
    let node = reparsed.get_by_id(crate::id::NodeId::intern("ml")).unwrap();
    match &node.kind {
        NodeKind::Text { content, .. } => {
            assert!(
                content.contains("Hello\n\"World\"\nThird line"),
                "multiline content must survive roundtrip, got: {content}"
            );
        }
        _ => panic!("expected Text after roundtrip"),
    }
}
