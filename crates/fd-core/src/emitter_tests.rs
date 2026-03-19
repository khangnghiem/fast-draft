use super::*;
use crate::parser::parse_document;

#[test]
fn roundtrip_simple() {
    let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Re-parse the emitted output
    let graph2 = parse_document(&output).expect("re-parse of emitted output failed");
    let node2 = graph2.get_by_id(NodeId::intern("box")).unwrap();

    match &node2.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 100.0);
            assert_eq!(*height, 50.0);
        }
        _ => panic!("expected Rect"),
    }
}

#[test]
fn roundtrip_ellipse() {
    let input = r#"
ellipse @dot {
  w: 40 h: 40
  fill: #00FF00
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of ellipse failed");
    let node = graph2.get_by_id(NodeId::intern("dot")).unwrap();
    match &node.kind {
        NodeKind::Ellipse { rx, ry } => {
            assert_eq!(*rx, 40.0);
            assert_eq!(*ry, 40.0);
        }
        _ => panic!("expected Ellipse"),
    }
}

#[test]
fn roundtrip_text_with_font() {
    let input = r#"
text @title "Hello" {
  font: "Inter" 700 32
  fill: #1A1A2E
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of text failed");
    let node = graph2.get_by_id(NodeId::intern("title")).unwrap();
    match &node.kind {
        NodeKind::Text { content, .. } => assert_eq!(content, "Hello"),
        _ => panic!("expected Text"),
    }
    let font = node.props.font.as_ref().expect("font missing");
    assert_eq!(font.family, "Inter");
    assert_eq!(font.weight, 700);
    assert_eq!(font.size, 32.0);
}

#[test]
fn roundtrip_nested_group() {
    let input = r#"
group @card {
  layout: column gap=16 pad=24

  text @heading "Title" {
font: "Inter" 600 20
fill: #333333
  }

  rect @body {
w: 300 h: 200
fill: #F5F5F5
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of nested group failed");
    let card_idx = graph2.index_of(NodeId::intern("card")).unwrap();
    assert_eq!(graph2.children(card_idx).len(), 2);
}

#[test]
fn roundtrip_animation() {
    let input = r#"
rect @btn {
  w: 200 h: 48
  fill: #6C5CE7

  anim :hover {
fill: #5A4BD1
scale: 1.2
ease: spring 300ms
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of animation failed");
    let btn = graph2.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.animations.len(), 1);
    assert_eq!(btn.animations[0].trigger, AnimTrigger::Hover);
}

#[test]
fn roundtrip_style_and_use() {
    let input = r#"
style accent {
  fill: #6C5CE7
  corner: 10
}

rect @btn {
  w: 200 h: 48
  use: accent
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of style+use failed");
    assert!(graph2.styles.contains_key(&NodeId::intern("accent")));
    let btn = graph2.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(btn.use_styles.len(), 1);
}

#[test]
fn roundtrip_note_inline() {
    let input = r#"
rect @box {
  note "Primary container for content"
  w: 100 h: 50
  fill: #FF0000
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(
        node.spec.as_ref().and_then(|s| s.description.as_deref()),
        Some("Primary container for content")
    );

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of note failed");
    let node2 = graph2.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

#[test]
fn roundtrip_note_block_markdown() {
    let input = r#"
rect @login_btn {
  note {
    - [ ] disabled state when fields empty
    - [ ] loading spinner during auth
  }
  w: 280 h: 48
  fill: #6C5CE7
}
"#;
    let graph = parse_document(input).unwrap();
    let btn = graph.get_by_id(NodeId::intern("login_btn")).unwrap();
    let note = btn.spec.as_ref().expect("should have spec");
    assert!(note.contains("disabled state when fields empty"));
    assert!(note.contains("loading spinner during auth"));

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of note block failed");
    let btn2 = graph2.get_by_id(NodeId::intern("login_btn")).unwrap();
    assert_eq!(btn2.spec, btn.spec);
}

#[test]
fn roundtrip_note_multiline_content() {
    // Raw markdown content is preserved through parse → emit → re-parse
    let input = r#"
rect @card {
  note {
    ## Card Features
    - Dark mode support
    - Responsive layout
  }
  w: 300 h: 200
}
"#;
    let graph = parse_document(input).unwrap();
    let card = graph.get_by_id(NodeId::intern("card")).unwrap();
    let note = card.spec.as_ref().expect("should have spec");
    assert!(note.contains("## Card Features"));
    assert!(note.contains("Dark mode support"));

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of multiline note failed");
    let card2 = graph2.get_by_id(NodeId::intern("card")).unwrap();
    assert_eq!(card2.spec, card.spec);
}

#[test]
fn roundtrip_note_nested() {
    let input = r#"
group @form {
  layout: column gap=16 pad=32
  note "User authentication entry point"

  rect @email {
    note {
      Validates email format on blur
    }
    w: 280 h: 44
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let form = graph.get_by_id(NodeId::intern("form")).unwrap();
    assert_eq!(
        form.spec.as_ref().and_then(|s| s.description.as_deref()),
        Some("User authentication entry point")
    );
    let email = graph.get_by_id(NodeId::intern("email")).unwrap();
    assert!(email.spec.is_some());

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of nested note failed");
    let form2 = graph2.get_by_id(NodeId::intern("form")).unwrap();
    assert_eq!(form2.spec, form.spec);
    let email2 = graph2.get_by_id(NodeId::intern("email")).unwrap();
    assert_eq!(email2.spec, email.spec);
}

#[test]
fn parse_note_raw_content() {
    let input = r#"
rect @widget {
  note {
    # Widget Notes
    Some description text
    - [ ] criterion one
    - [x] done item
  }
  w: 100 h: 100
}
"#;
    let graph = parse_document(input).unwrap();
    let w = graph.get_by_id(NodeId::intern("widget")).unwrap();
    let note = w.spec.as_ref().expect("should have spec");
    assert!(note.contains("# Widget Notes"));
    assert!(note.contains("criterion one"));
    assert!(note.contains("done item"));
}

#[test]
fn roundtrip_edge_basic() {
    let input = r#"
rect @box_a {
  w: 100 h: 50
}

rect @box_b {
  w: 100 h: 50
}

edge @a_to_b {
  from: @box_a
  to: @box_b
  label: "next step"
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.id.as_str(), "a_to_b");
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("box_a")));
    assert_eq!(edge.to, EdgeAnchor::Node(NodeId::intern("box_b")));
    // label: "next step" auto-creates text child
    let text_id = edge.text_child.expect("text_child should be set");
    assert_eq!(text_id.as_str(), "_a_to_b_label");
    let text_node = graph.get_by_id(text_id).expect("text node should exist");
    if let NodeKind::Text { content, .. } = &text_node.kind {
        assert_eq!(content, "next step");
    } else {
        panic!("expected Text node");
    }
    assert_eq!(edge.arrow, ArrowKind::End);

    // Re-parse roundtrip — emitter writes nested text block
    let output = emit_document(&graph);
    assert!(output.contains("text @_a_to_b_label \"next step\" {}"));

    let graph2 = parse_document(&output).expect("roundtrip failed");
    assert_eq!(graph2.edges.len(), 1);
    let edge2 = &graph2.edges[0];
    assert_eq!(edge2.from, EdgeAnchor::Node(NodeId::intern("box_a")));
    assert_eq!(edge2.to, EdgeAnchor::Node(NodeId::intern("box_b")));
    assert!(edge2.text_child.is_some());
    assert_eq!(edge2.arrow, ArrowKind::End);
}

#[test]
fn roundtrip_edge_styled() {
    let input = r#"
rect @s1 { w: 50 h: 50 }
rect @s2 { w: 50 h: 50 }

edge @flow {
  from: @s1
  to: @s2
  stroke: #6C5CE7 2
  arrow: both
  curve: smooth
}
"#;
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.arrow, ArrowKind::Both);
    assert_eq!(edge.curve, CurveKind::Smooth);
    assert!(edge.props.stroke.is_some());

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("styled edge roundtrip failed");
    let edge2 = &graph2.edges[0];
    assert_eq!(edge2.arrow, ArrowKind::Both);
    assert_eq!(edge2.curve, CurveKind::Smooth);
}

#[test]
fn roundtrip_edge_with_note() {
    let input = r#"
rect @login { w: 200 h: 100 }
rect @dashboard { w: 200 h: 100 }

edge @login_flow {
  note {
    Main authentication flow
    Must redirect within 2s
  }
  from: @login
  to: @dashboard
  label: "on success"
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    let edge = &graph.edges[0];
    let note = edge.spec.as_ref().expect("edge should have spec");
    assert!(note.contains("Main authentication flow"));
    assert!(note.contains("redirect within 2s"));

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("noted edge roundtrip failed");
    let edge2 = &graph2.edges[0];
    assert_eq!(edge2.spec, edge.spec);
}

#[test]
fn roundtrip_generic_node() {
    let input = r#"
@login_btn {
  note {
    Primary CTA — triggers login API call
    - [ ] disabled when fields empty
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("login_btn")).unwrap();
    assert!(matches!(node.kind, NodeKind::Generic));
    assert!(node.spec.is_some());

    let output = emit_document(&graph);
    assert!(output.contains("@login_btn {"));
    assert!(!output.contains("rect @login_btn"));
    assert!(!output.contains("group @login_btn"));

    let graph2 = parse_document(&output).expect("re-parse of generic node failed");
    let node2 = graph2.get_by_id(NodeId::intern("login_btn")).unwrap();
    assert!(matches!(node2.kind, NodeKind::Generic));
    assert_eq!(node2.spec, node.spec);
}

#[test]
fn roundtrip_generic_nested() {
    let input = r#"
group @form {
  layout: column gap=16 pad=32

  @email_input {
    note "Email field with validation"
  }

  @password_input {
    note "Password field (min 8 chars)"
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let form_idx = graph.index_of(NodeId::intern("form")).unwrap();
    assert_eq!(graph.children(form_idx).len(), 2);

    let email = graph.get_by_id(NodeId::intern("email_input")).unwrap();
    assert!(matches!(email.kind, NodeKind::Generic));
    assert!(email.spec.is_some());

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of nested generic failed");
    let email2 = graph2.get_by_id(NodeId::intern("email_input")).unwrap();
    assert!(matches!(email2.kind, NodeKind::Generic));
    assert_eq!(email2.spec, email.spec);
}

#[test]
fn parse_generic_with_properties() {
    let input = r#"
@card {
  fill: #FFFFFF
  corner: 8
}
"#;
    let graph = parse_document(input).unwrap();
    let card = graph.get_by_id(NodeId::intern("card")).unwrap();
    assert!(matches!(card.kind, NodeKind::Generic));
    assert!(card.props.fill.is_some());
    assert_eq!(card.props.corner_radius, Some(8.0));
}

#[test]
fn roundtrip_edge_with_trigger_anim() {
    let input = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }

edge @hover_edge {
  from: @a
  to: @b
  stroke: #6C5CE7 2
  arrow: end

  anim :hover {
opacity: 0.5
ease: ease_out 200ms
  }
}
"#;
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.animations.len(), 1);
    assert_eq!(edge.animations[0].trigger, AnimTrigger::Hover);
    assert_eq!(edge.animations[0].duration_ms, 200);

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("trigger anim roundtrip failed");
    let edge2 = &graph2.edges[0];
    assert_eq!(edge2.animations.len(), 1);
    assert_eq!(edge2.animations[0].trigger, AnimTrigger::Hover);
}

#[test]
fn roundtrip_edge_with_flow() {
    let input = r#"
rect @src { w: 50 h: 50 }
rect @dst { w: 50 h: 50 }

edge @data {
  from: @src
  to: @dst
  arrow: end
  flow: pulse 800ms
}
"#;
    let graph = parse_document(input).unwrap();
    let edge = &graph.edges[0];
    assert!(edge.flow.is_some());
    let flow = edge.flow.unwrap();
    assert_eq!(flow.kind, FlowKind::Pulse);
    assert_eq!(flow.duration_ms, 800);

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("flow roundtrip failed");
    let edge2 = &graph2.edges[0];
    let flow2 = edge2.flow.unwrap();
    assert_eq!(flow2.kind, FlowKind::Pulse);
    assert_eq!(flow2.duration_ms, 800);
}

#[test]
fn roundtrip_edge_dash_flow() {
    let input = r#"
rect @x { w: 50 h: 50 }
rect @y { w: 50 h: 50 }

edge @dashed {
  from: @x
  to: @y
  stroke: #EF4444 1
  flow: dash 400ms
  arrow: both
  curve: step
}
"#;
    let graph = parse_document(input).unwrap();
    let edge = &graph.edges[0];
    let flow = edge.flow.unwrap();
    assert_eq!(flow.kind, FlowKind::Dash);
    assert_eq!(flow.duration_ms, 400);
    assert_eq!(edge.arrow, ArrowKind::Both);
    assert_eq!(edge.curve, CurveKind::Step);

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("dash flow roundtrip failed");
    let edge2 = &graph2.edges[0];
    let flow2 = edge2.flow.unwrap();
    assert_eq!(flow2.kind, FlowKind::Dash);
    assert_eq!(flow2.duration_ms, 400);
}

#[test]
fn roundtrip_edge_point_anchors() {
    let input = r#"
edge @standalone {
  from: 100 200
  to: 300 150
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.from, EdgeAnchor::Point(100.0, 200.0));
    assert_eq!(edge.to, EdgeAnchor::Point(300.0, 150.0));
    assert_eq!(edge.arrow, ArrowKind::End);

    let output = emit_document(&graph);
    assert!(output.contains("from: 100 200"));
    assert!(output.contains("to: 300 150"));

    let graph2 = parse_document(&output).expect("point anchor roundtrip failed");
    let edge2 = &graph2.edges[0];
    assert_eq!(edge2.from, EdgeAnchor::Point(100.0, 200.0));
    assert_eq!(edge2.to, EdgeAnchor::Point(300.0, 150.0));
}

#[test]
fn roundtrip_edge_mixed_anchors() {
    let input = r#"
rect @start { w: 50 h: 50 }

edge @dangling {
  from: @start
  to: 400 300
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.from, EdgeAnchor::Node(NodeId::intern("start")));
    assert_eq!(edge.to, EdgeAnchor::Point(400.0, 300.0));

    let output = emit_document(&graph);
    assert!(output.contains("from: @start"));
    assert!(output.contains("to: 400 300"));

    let graph2 = parse_document(&output).expect("mixed anchor roundtrip failed");
    let edge2 = &graph2.edges[0];
    assert_eq!(edge2.from, EdgeAnchor::Node(NodeId::intern("start")));
    assert_eq!(edge2.to, EdgeAnchor::Point(400.0, 300.0));
}

#[test]
fn parse_edge_omitted_anchors_default() {
    let input = r#"
edge @no_endpoints {
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.edges.len(), 1);
    let edge = &graph.edges[0];
    assert_eq!(edge.from, EdgeAnchor::Point(0.0, 0.0));
    assert_eq!(edge.to, EdgeAnchor::Point(0.0, 0.0));
}

#[test]
fn test_notes_markdown_basic() {
    let input = r#"
rect @login_btn {
  note {
    ## Login Button
    - [ ] disabled when fields empty
    - [x] styled with brand colors
  }
  w: 280 h: 48
  fill: #6C5CE7
}
"#;
    let graph = parse_document(input).unwrap();
    let md = emit_spec_markdown(&graph, "login.fd");

    assert!(md.starts_with("# Spec: login.fd\n"));
    assert!(md.contains("## @login_btn `rect`"));
    assert!(md.contains("## Login Button"));
    assert!(md.contains("disabled when fields empty"));
    // Visual props must NOT appear
    assert!(!md.contains("280"));
    assert!(!md.contains("6C5CE7"));
}

#[test]
fn test_notes_markdown_nested() {
    let input = r#"
group @form {
  layout: column gap=16 pad=32
  note "Shipping address form"

  rect @email {
    note {
      Email input validation
    }
    w: 280 h: 44
  }

  rect @no_note {
    w: 100 h: 50
    fill: #CCC
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let md = emit_spec_markdown(&graph, "checkout.fd");

    assert!(md.contains("## @form `group`"));
    assert!(md.contains("### @email `rect`"));
    assert!(md.contains("Shipping address form"));
    assert!(md.contains("Email input validation"));
    // Node without note should be skipped
    assert!(!md.contains("no_note"));
}

#[test]
fn test_notes_markdown_with_edges() {
    let input = r#"
rect @login { w: 200 h: 100 }
rect @dashboard {
  note "Main dashboard"
  w: 200 h: 100
}

edge @auth_flow {
  note {
    Authentication flow details
  }
  from: @login
  to: @dashboard
  label: "on success"
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    let md = emit_spec_markdown(&graph, "flow.fd");

    assert!(md.contains("## Flows"));
    assert!(md.contains("**@login** → **@dashboard**"));
    assert!(md.contains("on success"));
    assert!(md.contains("Authentication flow details"));
}

#[test]
fn roundtrip_import_basic() {
    let input = "import \"components/buttons.fd\" as btn\nrect @hero { w: 200 h: 100 }\n";
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.imports.len(), 1);
    assert_eq!(graph.imports[0].path, "components/buttons.fd");
    assert_eq!(graph.imports[0].namespace, "btn");

    let output = emit_document(&graph);
    assert!(output.contains("import \"components/buttons.fd\" as btn"));

    let graph2 = parse_document(&output).expect("re-parse of import failed");
    assert_eq!(graph2.imports.len(), 1);
    assert_eq!(graph2.imports[0].path, "components/buttons.fd");
    assert_eq!(graph2.imports[0].namespace, "btn");
}

#[test]
fn roundtrip_import_multiple() {
    let input =
        "import \"tokens.fd\" as tokens\nimport \"buttons.fd\" as btn\nrect @box { w: 50 h: 50 }\n";
    let graph = parse_document(input).unwrap();
    assert_eq!(graph.imports.len(), 2);
    assert_eq!(graph.imports[0].namespace, "tokens");
    assert_eq!(graph.imports[1].namespace, "btn");

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of multiple imports failed");
    assert_eq!(graph2.imports.len(), 2);
    assert_eq!(graph2.imports[0].namespace, "tokens");
    assert_eq!(graph2.imports[1].namespace, "btn");
}

#[test]
fn parse_import_without_alias_errors() {
    let input = "import \"missing_alias.fd\"\nrect @box { w: 50 h: 50 }\n";
    // This should fail because "as namespace" is missing
    let result = parse_document(input);
    assert!(result.is_err());
}

#[test]
fn roundtrip_comment_preserved() {
    // A `# comment` before a node should survive parse → emit → parse.
    let input = r#"
# This is a section header
rect @box {
  w: 100 h: 50
  fill: #FF0000
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("# This is a section header"),
        "comment should appear in emitted output: {output}"
    );
    // Re-parse should also preserve it
    let graph2 = parse_document(&output).expect("re-parse of commented document failed");
    let node = graph2.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node.comments, vec!["This is a section header"]);
}

#[test]
fn roundtrip_multiple_comments_preserved() {
    let input = r#"
# Header section
# Subheading
rect @panel {
  w: 300 h: 200
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse failed");
    let node = graph2.get_by_id(NodeId::intern("panel")).unwrap();
    assert_eq!(node.comments.len(), 2);
    assert_eq!(node.comments[0], "Header section");
    assert_eq!(node.comments[1], "Subheading");
}

#[test]
fn roundtrip_inline_position() {
    let input = r#"
rect @placed {
  x: 100
  y: 200
  w: 50 h: 50
  fill: #FF0000
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("placed")).unwrap();

    // Should have a Position constraint from x:/y: parsing
    assert!(
        node.constraints
            .iter()
            .any(|c| matches!(c, Constraint::Position { .. })),
        "should have Position constraint"
    );

    // Emit and verify x:/y: appear inline (not as top-level arrow)
    let output = emit_document(&graph);
    assert!(output.contains("x: 100"), "should emit x: inline");
    assert!(output.contains("y: 200"), "should emit y: inline");
    assert!(
        !output.contains("-> absolute"),
        "should NOT emit old absolute arrow"
    );
    assert!(
        !output.contains("-> position"),
        "should NOT emit position arrow"
    );

    // Round-trip: re-parse emitted output
    let graph2 = parse_document(&output).expect("re-parse of inline position failed");
    let node2 = graph2.get_by_id(NodeId::intern("placed")).unwrap();
    let pos = node2
        .constraints
        .iter()
        .find_map(|c| match c {
            Constraint::Position { x, y } => Some((*x, *y)),
            _ => None,
        })
        .expect("Position constraint missing after roundtrip");
    assert_eq!(pos, (100.0, 200.0));
}

#[test]
fn emit_children_before_styles() {
    let input = r#"
rect @box {
  w: 200 h: 100
  fill: #FF0000
  corner: 10
  text @label "Hello" {
fill: #FFFFFF
font: "Inter" 600 14
  }
  anim :hover {
fill: #CC0000
ease: ease_out 200ms
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Children should appear before inline appearance properties
    let child_pos = output.find("text @label").expect("child missing");
    let fill_pos = output.find("fill: #FF0000").expect("fill missing");
    let corner_pos = output.find("corner: 10").expect("corner missing");
    let anim_pos = output.find("when :hover").expect("when missing");

    assert!(
        child_pos < fill_pos,
        "children should appear before fill: child_pos={child_pos} fill_pos={fill_pos}"
    );
    assert!(
        child_pos < corner_pos,
        "children should appear before corner"
    );
    assert!(fill_pos < anim_pos, "fill should appear before animations");
}

#[test]
fn emit_section_separators() {
    let input = r#"
style accent {
  fill: #6C5CE7
}

rect @a {
  w: 100 h: 50
}

rect @b {
  w: 100 h: 50
}

edge @flow {
  from: @a
  to: @b
  arrow: end
}

@a -> center_in: canvas
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    assert!(
        output.contains("# ─── Styles ───"),
        "should have Styles separator"
    );
    assert!(
        output.contains("# ─── Layout ───"),
        "should have Layout separator"
    );
    assert!(
        output.contains("# ─── Flows ───"),
        "should have Flows separator"
    );
}

#[test]
fn roundtrip_children_before_styles() {
    let input = r#"
group @card {
  layout: column gap=12 pad=20
  text @title "Dashboard" {
font: "Inter" 600 20
fill: #111111
  }
  rect @body {
w: 300 h: 200
fill: #F5F5F5
  }
  fill: #FFFFFF
  corner: 8
  shadow: (0,2,8,#00000011)
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Re-parse the re-ordered output
    let graph2 = parse_document(&output).expect("re-parse of reordered output failed");
    let card_idx = graph2.index_of(NodeId::intern("card")).unwrap();
    assert_eq!(
        graph2.children(card_idx).len(),
        2,
        "card should still have 2 children after roundtrip"
    );

    // Verify children appear before appearance
    let child_pos = output.find("text @title").expect("child missing");
    let fill_pos = output.find("fill: #FFFFFF").expect("card fill missing");
    assert!(
        child_pos < fill_pos,
        "children should appear before parent fill"
    );
}

#[test]
fn roundtrip_style_keyword() {
    // Verify that `style` keyword parses and emits correctly
    let input = r#"
style accent {
  fill: #6C5CE7
  corner: 12
}

rect @btn {
  w: 120 h: 40
  use: accent
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Emitter should output `style`, not `theme` (legacy)
    assert!(
        output.contains("style accent"),
        "should emit `style` keyword"
    );
    assert!(
        !output.contains("theme accent"),
        "should NOT emit `theme` keyword"
    );

    // Round-trip: re-parse emitted output
    let graph2 = parse_document(&output).expect("re-parse of style output failed");
    assert!(
        graph2.styles.contains_key(&NodeId::intern("accent")),
        "style definition should survive roundtrip"
    );
}

#[test]
fn roundtrip_when_keyword() {
    // Verify that `when` keyword parses and emits correctly
    let input = r#"
rect @btn {
  w: 120 h: 40
  fill: #6C5CE7
  when :hover {
fill: #5A4BD1
ease: ease_out 200ms
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Emitter should output `when`, not `anim`
    assert!(output.contains("when :hover"), "should emit `when` keyword");
    assert!(
        !output.contains("anim :hover"),
        "should NOT emit `anim` keyword"
    );

    // Round-trip: re-parse emitted output
    let graph2 = parse_document(&output).expect("re-parse of when output failed");
    let node = graph2.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(
        node.animations.len(),
        1,
        "animation should survive roundtrip"
    );
    assert_eq!(
        node.animations[0].trigger,
        AnimTrigger::Hover,
        "trigger should be Hover"
    );
}

#[test]
fn parse_old_theme_keyword_compat() {
    // Old `theme` keyword must still be accepted by the parser
    let input = r#"
theme accent {
  fill: #6C5CE7
}

rect @btn {
  w: 120 h: 40
  use: accent
}
"#;
    let graph = parse_document(input).unwrap();
    assert!(
        graph.styles.contains_key(&NodeId::intern("accent")),
        "old `theme` keyword should parse into a style definition"
    );

    // Emitter should output `style`
    let output = emit_document(&graph);
    assert!(
        output.contains("style accent"),
        "emitter should output `style` keyword"
    );
}

#[test]
fn parse_old_anim_keyword_compat() {
    // Old `anim` keyword must still be accepted by the parser
    let input = r#"
rect @btn {
  w: 120 h: 40
  fill: #6C5CE7
  anim :press {
scale: 0.9
ease: spring 150ms
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(
        node.animations.len(),
        1,
        "old `anim` keyword should parse into animation"
    );
    assert_eq!(
        node.animations[0].trigger,
        AnimTrigger::Press,
        "trigger should be Press"
    );

    // Emitter should upgrade to `when`
    let output = emit_document(&graph);
    assert!(
        output.contains("when :press"),
        "emitter should upgrade `anim` to `when`"
    );
}

#[test]
fn roundtrip_style_import() {
    // Verify that import + style references work together
    let input = r#"
import "tokens.fd" as tokens

style card_base {
  fill: #FFFFFF
  corner: 16
}

rect @card {
  w: 300 h: 200
  use: card_base
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Both import and style should appear in output
    assert!(
        output.contains("import \"tokens.fd\" as tokens"),
        "import should survive roundtrip"
    );
    assert!(
        output.contains("style card_base"),
        "style should survive roundtrip"
    );

    // Re-parse
    let graph2 = parse_document(&output).expect("re-parse failed");
    assert_eq!(graph2.imports.len(), 1, "import count should survive");
    assert!(
        graph2.styles.contains_key(&NodeId::intern("card_base")),
        "style def should survive"
    );
}

// ─── Hardening: edge-case round-trip tests ─────────────────────────────

#[test]
fn roundtrip_empty_group() {
    // Empty groups (no children, no styles, no annotations) are stripped on emit.
    let input = "group @empty {\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        !output.contains("@empty"),
        "empty group should be stripped on emit, got: {output}"
    );
}

#[test]
fn emit_strips_empty_frame() {
    // Childless frame with no styles should be stripped on emit.
    let input = "frame @lonely {\n  w: 200 h: 100\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        !output.contains("@lonely"),
        "empty frame should be stripped on emit, got: {output}"
    );
}

#[test]
fn emit_keeps_styled_empty_frame() {
    // Childless frame WITH styles should be preserved.
    let input = "frame @styled {\n  w: 200 h: 100\n  fill: #FF0000\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("@styled"),
        "styled empty frame should be preserved, got: {output}"
    );
}

#[test]
fn emit_keeps_group_with_children() {
    // Group with children must NOT be stripped.
    let input = "group @parent {\n  rect @child {\n    w: 40 h: 20\n  }\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("@parent"),
        "group with children should be preserved, got: {output}"
    );
}

#[test]
fn roundtrip_deeply_nested_groups() {
    let input = r#"
group @outer {
  group @middle {
group @inner {
  rect @leaf {
    w: 40 h: 20
    fill: #FF0000
  }
}
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of nested groups failed");
    let leaf = graph2.get_by_id(NodeId::intern("leaf")).unwrap();
    assert!(matches!(leaf.kind, NodeKind::Rect { .. }));
    // Verify 3-level nesting preserved
    let inner_idx = graph2.index_of(NodeId::intern("inner")).unwrap();
    assert_eq!(graph2.children(inner_idx).len(), 1);
    let middle_idx = graph2.index_of(NodeId::intern("middle")).unwrap();
    assert_eq!(graph2.children(middle_idx).len(), 1);
}

#[test]
fn roundtrip_unicode_text() {
    let input = "text @emoji \"Hello 🎨 café 日本語\" {\n  fill: #333333\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("Hello 🎨 café 日本語"),
        "unicode should survive emit"
    );
    let graph2 = parse_document(&output).expect("re-parse of unicode failed");
    let node = graph2.get_by_id(NodeId::intern("emoji")).unwrap();
    match &node.kind {
        NodeKind::Text { content, .. } => {
            assert!(content.contains("🎨"));
            assert!(content.contains("café"));
            assert!(content.contains("日本語"));
        }
        _ => panic!("expected Text node"),
    }
}

#[test]
fn roundtrip_note_all_fields() {
    // `spec` keyword still parses and round-trips correctly
    let input = r#"
rect @full_spec {
  spec {
    Full specification node
    - [ ] all fields present
    **Priority:** high
  }
  w: 100 h: 50
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("full_spec")).unwrap();
    assert!(node.spec.is_some());

    let output = emit_document(&graph);
    // Emitter should output `note` keyword (upgraded from `spec`)
    assert!(
        output.contains("spec {"),
        "emitter should output `spec` keyword, got: {output}"
    );
    let graph2 = parse_document(&output).expect("re-parse of full spec failed");
    let node2 = graph2.get_by_id(NodeId::intern("full_spec")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

#[test]
fn roundtrip_path_node() {
    let input = "path @sketch {\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of path failed");
    let node = graph2.get_by_id(NodeId::intern("sketch")).unwrap();
    assert!(matches!(node.kind, NodeKind::Path { .. }));
}

#[test]
fn roundtrip_gradient_linear() {
    let input = r#"
rect @grad {
  w: 200 h: 100
  fill: linear(90deg, #FF0000 0, #0000FF 1)
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("grad")).unwrap();
    assert!(matches!(
        node.props.fill,
        Some(Paint::LinearGradient { .. })
    ));

    let output = emit_document(&graph);
    assert!(output.contains("linear("), "should emit linear gradient");
    let graph2 = parse_document(&output).expect("re-parse of linear gradient failed");
    let node2 = graph2.get_by_id(NodeId::intern("grad")).unwrap();
    assert!(matches!(
        node2.props.fill,
        Some(Paint::LinearGradient { .. })
    ));
}

#[test]
fn roundtrip_gradient_radial() {
    let input = r#"
rect @radial_box {
  w: 100 h: 100
  fill: radial(#FFFFFF 0, #000000 1)
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("radial_box")).unwrap();
    assert!(matches!(
        node.props.fill,
        Some(Paint::RadialGradient { .. })
    ));

    let output = emit_document(&graph);
    assert!(output.contains("radial("), "should emit radial gradient");
    let graph2 = parse_document(&output).expect("re-parse of radial gradient failed");
    let node2 = graph2.get_by_id(NodeId::intern("radial_box")).unwrap();
    assert!(matches!(
        node2.props.fill,
        Some(Paint::RadialGradient { .. })
    ));
}

#[test]
fn roundtrip_shadow_property() {
    let input = r#"
rect @shadowed {
  w: 200 h: 100
  shadow: (0,4,20,#000000)
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("shadowed")).unwrap();
    let shadow = node.props.shadow.as_ref().expect("shadow should exist");
    assert_eq!(shadow.blur, 20.0);

    let output = emit_document(&graph);
    assert!(output.contains("shadow:"), "should emit shadow");
    let graph2 = parse_document(&output).expect("re-parse of shadow failed");
    let node2 = graph2.get_by_id(NodeId::intern("shadowed")).unwrap();
    let shadow2 = node2.props.shadow.as_ref().expect("shadow should survive");
    assert_eq!(shadow2.offset_y, 4.0);
    assert_eq!(shadow2.blur, 20.0);
}

#[test]
fn roundtrip_opacity() {
    let input = r#"
rect @faded {
  w: 100 h: 100
  fill: #6C5CE7
  opacity: 0.5
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("faded")).unwrap();
    assert_eq!(node.props.opacity, Some(0.5));

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of opacity failed");
    let node2 = graph2.get_by_id(NodeId::intern("faded")).unwrap();
    assert_eq!(node2.props.opacity, Some(0.5));
}

#[test]
fn roundtrip_clip_frame() {
    let input = r#"
frame @clipped {
  w: 300 h: 200
  clip: true
  fill: #FFFFFF
  corner: 12
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(output.contains("clip: true"), "should emit clip");
    let graph2 = parse_document(&output).expect("re-parse of clip frame failed");
    let node = graph2.get_by_id(NodeId::intern("clipped")).unwrap();
    match &node.kind {
        NodeKind::Frame { clip, .. } => assert!(clip, "clip should be true"),
        _ => panic!("expected Frame node"),
    }
}

#[test]
fn roundtrip_multiple_animations() {
    let input = r#"
rect @animated {
  w: 120 h: 40
  fill: #6C5CE7
  when :hover {
fill: #5A4BD1
scale: 1.1
ease: ease_out 200ms
  }
  when :press {
scale: 0.9
ease: spring 150ms
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("animated")).unwrap();
    assert_eq!(node.animations.len(), 2, "should have 2 animations");

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of multi-anim failed");
    let node2 = graph2.get_by_id(NodeId::intern("animated")).unwrap();
    assert_eq!(node2.animations.len(), 2);
    assert_eq!(node2.animations[0].trigger, AnimTrigger::Hover);
    assert_eq!(node2.animations[1].trigger, AnimTrigger::Press);
}

#[test]
fn roundtrip_inline_note_shorthand() {
    // `note "..."` shorthand parses as inline note
    let input = r#"
rect @btn {
  note "Primary action button"
  w: 180 h: 48
  fill: #6C5CE7
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(
        node.spec.as_ref().and_then(|s| s.description.as_deref()),
        Some("Primary action button")
    );

    let output = emit_document(&graph);
    assert!(
        output.contains("spec \""),
        "emitter should output `spec` keyword: {output}"
    );
    let graph2 = parse_document(&output).expect("re-parse of inline note failed");
    let node2 = graph2.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

#[test]
fn roundtrip_note_keyword_block() {
    // `note { ... }` block captures raw markdown
    let input = r#"
rect @card {
  note {
    # Card component
    - [ ] responsive on mobile
    - [ ] dark mode
  }
  w: 200 h: 100
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("card")).unwrap();
    let note = node.spec.as_ref().expect("should have spec");
    assert!(note.contains("responsive on mobile"));

    let output = emit_document(&graph);
    assert!(output.contains("spec {"), "should emit note keyword");
    let graph2 = parse_document(&output).expect("re-parse of note keyword failed");
    let node2 = graph2.get_by_id(NodeId::intern("card")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

#[test]
fn parse_note_checklist() {
    let input = r#"
rect @task {
  note {
    - [x] Pick the color
    - [x] Choose the font
  }
  w: 100 h: 50
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("task")).unwrap();
    let note = node.spec.as_ref().expect("should have spec");
    assert!(note.contains("Pick the color"));
    assert!(note.contains("Choose the font"));
}

#[test]
fn roundtrip_note_checklist() {
    let input = r#"
rect @task {
  note {
    A task card
    - [ ] Add animation
    - [x] Pick the font
  }
  w: 100 h: 50
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    assert!(output.contains("spec {"));
    assert!(output.contains("A task card"));

    let graph2 = parse_document(&output).expect("re-parse of checklist note failed");
    let node2 = graph2.get_by_id(NodeId::intern("task")).unwrap();
    let note = node2.spec.as_ref().expect("should have spec");
    assert!(note.contains("Add animation"));
    assert!(note.contains("Pick the font"));
}

#[test]
fn note_content_preserves_all_lines() {
    let input = r#"
rect @widget {
  note {
    Description text
    - [ ] Still need to do
    - [ ] Another todo
    - [x] Already done thing
    - [x] Another done
    **Tag:** important
  }
  w: 100 h: 50
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    let graph2 = parse_document(&output).expect("re-parse of note failed");
    let node = graph2.get_by_id(NodeId::intern("widget")).unwrap();
    let note = node.spec.as_ref().expect("should have spec");

    // All lines should be preserved in raw markdown
    assert!(note.contains("Description text"));
    assert!(note.contains("Still need to do"));
    assert!(note.contains("Another todo"));
    assert!(note.contains("Already done thing"));
    assert!(note.contains("important"));
}

#[test]
fn spec_keyword_captured_as_raw_note() {
    // Old `spec { ... }` content is captured as raw markdown
    let input = r#"
rect @old {
  spec {
    Legacy format text
    status: done
    accept: "old criterion"
  }
  w: 100 h: 50
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("old")).unwrap();
    let note = node.spec.as_ref().expect("should have spec");
    // Raw content is captured verbatim
    assert!(note.contains("Legacy format text"));
    assert!(note.contains("status: done"));

    let output = emit_document(&graph);
    // Emitter outputs `spec` (it's now the primary keyword)
    assert!(output.contains("spec {"), "should emit spec keyword");
    // Legacy `note` keyword should NOT appear in output
    assert!(!output.contains("note {"), "should not emit note keyword");
}

#[test]
fn roundtrip_layout_modes() {
    let input = r#"
frame @col {
  w: 400 h: 300
  layout: column gap=16 pad=24
  rect @c1 { w: 100 h: 50 }
}

frame @rw {
  w: 400 h: 300
  layout: row gap=8 pad=12
  rect @r1 { w: 50 h: 50 }
}

frame @grd {
  w: 400 h: 300
  layout: grid cols=2 gap=10 pad=20
  rect @g1 { w: 80 h: 80 }
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(output.contains("layout: column gap=16 pad=24"));
    assert!(output.contains("layout: row gap=8 pad=12"));
    assert!(output.contains("layout: grid cols=2 gap=10 pad=20"));

    let graph2 = parse_document(&output).expect("re-parse of layout modes failed");
    let col = graph2.get_by_id(NodeId::intern("col")).unwrap();
    assert!(matches!(col.kind, NodeKind::Frame { .. }));
    let rw = graph2.get_by_id(NodeId::intern("rw")).unwrap();
    assert!(matches!(rw.kind, NodeKind::Frame { .. }));
    let grd = graph2.get_by_id(NodeId::intern("grd")).unwrap();
    assert!(matches!(grd.kind, NodeKind::Frame { .. }));
}

// ─── emit_filtered tests ─────────────────────────────────────────────

fn make_test_graph() -> SceneGraph {
    // A rich document with styles, layout, anims, specs, and edges
    let input = r#"
style accent {
  fill: #6C5CE7
  font: "Inter" bold 16
}

frame @container {
  w: 600 h: 400
  layout: column gap=16 pad=24

  rect @card {
w: 200 h: 100
use: accent
fill: #FFFFFF
corner: 12
spec {
  "Main card component"
  status: done
}
when :hover {
  fill: #F0EDFF
  scale: 1.1
  ease: ease_out 200ms
}
  }

  text @label "Hello" {
font: "Inter" regular 14
fill: #333333
x: 20
y: 40
  }
}

edge @card_to_label {
  from: @card
  to: @label
  label: "displays"
}
"#;
    parse_document(input).unwrap()
}

#[test]
fn emit_filtered_full_matches_emit_document() {
    let graph = make_test_graph();
    let full = emit_filtered(&graph, ReadMode::Full);
    let doc = emit_document(&graph);
    assert_eq!(full, doc, "Full mode should be identical to emit_document");
}

#[test]
fn emit_filtered_structure() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::Structure);
    // Should have node declarations
    assert!(out.contains("frame @container"), "should include frame");
    assert!(out.contains("rect @card"), "should include rect");
    assert!(out.contains("text @label"), "should include text");
    // Should NOT have styles, dimensions, specs, or anims
    assert!(!out.contains("fill:"), "no fill in structure mode");
    assert!(!out.contains("spec"), "no spec in structure mode");
    assert!(!out.contains("when"), "no when in structure mode");
    assert!(!out.contains("style"), "no style in structure mode");
    assert!(!out.contains("edge"), "no edges in structure mode");
}

#[test]
fn emit_filtered_layout() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::Layout);
    // Should have layout + dimensions
    assert!(out.contains("layout: column"), "should include layout");
    assert!(out.contains("w: 200 h: 100"), "should include dims");
    assert!(out.contains("x: 20"), "should include position");
    // Should NOT have styles or anims
    assert!(!out.contains("fill:"), "no fill in layout mode");
    assert!(!out.contains("style"), "no style in layout mode");
    assert!(!out.contains("when :hover"), "no when in layout mode");
}

#[test]
fn emit_filtered_design() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::Design);
    // Should have style definitions
    assert!(out.contains("style accent"), "should include style");
    assert!(out.contains("use: accent"), "should include use ref");
    assert!(out.contains("fill:"), "should include fill");
    assert!(out.contains("corner: 12"), "should include corner");
    // Should NOT have layout or anims
    assert!(!out.contains("layout:"), "no layout in design mode");
    assert!(!out.contains("w: 200"), "no dims in design mode");
    assert!(!out.contains("when :hover"), "no when in design mode");
}

#[test]
fn emit_filtered_spec() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::Spec);
    // Should have spec blocks
    assert!(out.contains("spec"), "should include spec");
    assert!(out.contains("Main card component"), "should include desc");
    // Raw spec content is preserved
    assert!(
        out.contains("status: done"),
        "should include raw status line"
    );
    // Should NOT have styles or anims
    assert!(!out.contains("fill:"), "no fill in spec mode");
    assert!(!out.contains("when"), "no when in spec mode");
}

#[test]
fn emit_filtered_visual() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::Visual);
    // Visual = Layout + Design + When
    assert!(out.contains("style accent"), "should include style");
    assert!(out.contains("layout: column"), "should include layout");
    assert!(out.contains("w: 200 h: 100"), "should include dims");
    assert!(out.contains("fill:"), "should include fill");
    assert!(out.contains("corner: 12"), "should include corner");
    assert!(out.contains("when :hover"), "should include when");
    assert!(out.contains("scale: 1.1"), "should include anim props");
    assert!(out.contains("edge @card_to_label"), "should include edges");
    // Should NOT have spec blocks
    assert!(
        !out.contains("Main card component"),
        "no spec desc in visual mode"
    );
}

#[test]
fn emit_filtered_when() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::When);
    // Should have when blocks
    assert!(out.contains("when :hover"), "should include when");
    assert!(out.contains("scale: 1.1"), "should include anim props");
    // Should NOT have node-level styles, layout, or spec
    assert!(!out.contains("corner:"), "no corner in when mode");
    assert!(!out.contains("w: 200"), "no dims in when mode");
    assert!(!out.contains("style"), "no style in when mode");
    assert!(!out.contains("spec"), "no spec in when mode");
}

#[test]
fn emit_filtered_edges() {
    let graph = make_test_graph();
    let out = emit_filtered(&graph, ReadMode::Edges);
    // Should have edges with header syntax
    assert!(
        out.contains("edge @card_to_label @card -> @label"),
        "should include edge header: {out}"
    );
    assert!(
        out.contains("text @_card_to_label_label \"displays\" {}"),
        "should include text child"
    );
    // Should NOT have styles or anims
    assert!(!out.contains("fill:"), "no fill in edges mode");
    assert!(!out.contains("when"), "no when in edges mode");
}

#[test]
fn roundtrip_no_duplicate_separators() {
    // Document with styles + nodes + edge triggers section separators.
    // After multiple round-trips, separators must appear exactly once.
    let input = r#"
style accent {
  fill: #A29BFE
}

rect @a {
  w: 100 h: 50
  fill: #FF0000
}

rect @b {
  w: 80 h: 40
}

edge @link {
  from: @a
  to: @b
}
"#;
    let graph = parse_document(input).unwrap();
    let pass1 = emit_document(&graph);

    // Separators should exist
    assert!(
        pass1.contains("# ─── Styles ───"),
        "pass 1 should have Styles separator: {pass1}"
    );
    assert!(
        pass1.contains("# ─── Layout ───"),
        "pass 1 should have Layout separator: {pass1}"
    );

    // Round-trip again
    let graph2 = parse_document(&pass1).expect("re-parse failed");
    let pass2 = emit_document(&graph2);

    // Count occurrences — must be exactly 1 each
    let styles_count = pass2.matches("# ─── Styles ───").count();
    let layout_count = pass2.matches("# ─── Layout ───").count();
    let flows_count = pass2.matches("# ─── Flows ───").count();
    assert_eq!(styles_count, 1, "Styles separator duplicated: {pass2}");
    assert_eq!(layout_count, 1, "Layout separator duplicated: {pass2}");
    assert_eq!(flows_count, 1, "Flows separator duplicated: {pass2}");

    // Third round-trip for good measure
    let graph3 = parse_document(&pass2).expect("third parse failed");
    let pass3 = emit_document(&graph3);
    assert_eq!(
        pass3.matches("# ─── Layout ───").count(),
        1,
        "Layout separator grew after 3 round-trips: {pass3}"
    );
}

#[test]
fn roundtrip_user_comments_not_stripped() {
    // User comments (non-separator) must survive even with separators present.
    let input = r#"
style dark {
  fill: #1A1A2E
}

# Settings panel
rect @settings {
  w: 300 h: 200
}

rect @other {
  w: 50 h: 50
}

edge @link {
  from: @settings
  to: @other
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("# Settings panel"),
        "user comment should survive: {output}"
    );
    // Separators should not be attached to nodes as comments
    let node = graph.get_by_id(NodeId::intern("settings")).unwrap();
    assert_eq!(
        node.comments,
        vec!["Settings panel"],
        "only user comment should be attached, not separators"
    );
}

// ─── Path d: command roundtrip tests ────────────────────────────────────

#[test]
fn roundtrip_path_with_commands() {
    let input = r#"
path @sketch {
  d: M 10 20 L 100 200 L 300 400
  stroke: #5E5CE6 2
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("sketch")).unwrap();
    match &node.kind {
        NodeKind::Path { commands } => {
            assert_eq!(commands.len(), 3, "should have 3 commands");
            assert!(matches!(commands[0], PathCmd::MoveTo(_, _)));
            assert!(matches!(commands[1], PathCmd::LineTo(_, _)));
        }
        _ => panic!("expected Path node"),
    }

    let output = emit_document(&graph);
    assert!(output.contains("d:"), "should emit d: property");
    assert!(output.contains("M 10 20"), "should emit MoveTo");

    let graph2 = parse_document(&output).expect("re-parse of path with commands failed");
    let node2 = graph2.get_by_id(NodeId::intern("sketch")).unwrap();
    match &node2.kind {
        NodeKind::Path { commands } => {
            assert_eq!(commands.len(), 3, "commands should survive roundtrip");
        }
        _ => panic!("expected Path node after roundtrip"),
    }
}

#[test]
fn roundtrip_path_cubic_and_close() {
    let input = r#"
path @curve {
  d: M 0 0 C 10 20 30 40 50 60 Z
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("curve")).unwrap();
    match &node.kind {
        NodeKind::Path { commands } => {
            assert_eq!(commands.len(), 3);
            assert!(matches!(commands[1], PathCmd::CubicTo(_, _, _, _, _, _)));
            assert!(matches!(commands[2], PathCmd::Close));
        }
        _ => panic!("expected Path"),
    }

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse failed");
    let node2 = graph2.get_by_id(NodeId::intern("curve")).unwrap();
    match &node2.kind {
        NodeKind::Path { commands } => {
            assert_eq!(commands.len(), 3, "cubic + close should survive roundtrip");
        }
        _ => panic!("expected Path"),
    }
}

#[test]
fn roundtrip_path_quad() {
    let input = r#"
path @quad_stroke {
  d: M 0 0 Q 50 100 100 0
  stroke: #FF0000 3
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("quad_stroke")).unwrap();
    match &node.kind {
        NodeKind::Path { commands } => {
            assert_eq!(commands.len(), 2);
            assert!(matches!(commands[1], PathCmd::QuadTo(_, _, _, _)));
        }
        _ => panic!("expected Path"),
    }

    let output = emit_document(&graph);
    assert!(output.contains("Q 50 100 100 0"), "should emit QuadTo");
    let graph2 = parse_document(&output).unwrap();
    let node2 = graph2.get_by_id(NodeId::intern("quad_stroke")).unwrap();
    match &node2.kind {
        NodeKind::Path { commands } => assert_eq!(commands.len(), 2),
        _ => panic!("expected Path"),
    }
}

#[test]
fn roundtrip_path_empty_commands() {
    // Path with no d: property — backward compatibility
    let input = "path @empty_path {\n  stroke: #333333 1\n}\n";
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("empty_path")).unwrap();
    match &node.kind {
        NodeKind::Path { commands } => assert!(commands.is_empty()),
        _ => panic!("expected Path"),
    }
    let output = emit_document(&graph);
    assert!(!output.contains("d:"), "empty commands should not emit d:");
    let graph2 = parse_document(&output).unwrap();
    let node2 = graph2.get_by_id(NodeId::intern("empty_path")).unwrap();
    assert!(matches!(node2.kind, NodeKind::Path { .. }));
}

// ─── Image node roundtrip tests ─────────────────────────────────────────

#[test]
fn roundtrip_image_basic() {
    let input = r#"
image @hero {
  w: 400 h: 300
  src: "assets/hero.png"
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("hero")).unwrap();
    match &node.kind {
        NodeKind::Image {
            source,
            width,
            height,
            fit,
        } => {
            match source {
                ImageSource::File(p) => assert_eq!(p, "assets/hero.png"),
            }
            assert_eq!(*width, 400.0);
            assert_eq!(*height, 300.0);
            assert_eq!(*fit, ImageFit::Cover); // Default
        }
        _ => panic!("expected Image node"),
    }

    let output = emit_document(&graph);
    assert!(output.contains("image @hero"), "should emit image keyword");
    assert!(
        output.contains("src: \"assets/hero.png\""),
        "should emit src"
    );
    assert!(
        !output.contains("fit:"),
        "default fit should not be emitted"
    );

    let graph2 = parse_document(&output).expect("re-parse of image failed");
    let node2 = graph2.get_by_id(NodeId::intern("hero")).unwrap();
    assert!(matches!(node2.kind, NodeKind::Image { .. }));
}

#[test]
fn roundtrip_image_with_fit() {
    let input = r#"
image @bg {
  w: 800 h: 600
  src: "bg.jpg"
  fit: contain
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("bg")).unwrap();
    match &node.kind {
        NodeKind::Image { fit, .. } => assert_eq!(*fit, ImageFit::Contain),
        _ => panic!("expected Image"),
    }

    let output = emit_document(&graph);
    assert!(
        output.contains("fit: contain"),
        "should emit non-default fit"
    );

    let graph2 = parse_document(&output).unwrap();
    let node2 = graph2.get_by_id(NodeId::intern("bg")).unwrap();
    match &node2.kind {
        NodeKind::Image { fit, .. } => assert_eq!(*fit, ImageFit::Contain),
        _ => panic!("expected Image"),
    }
}

#[test]
fn roundtrip_image_in_frame() {
    let input = r#"
frame @card {
  w: 400 h: 300
  clip: true
  image @photo {
    w: 400 h: 200
    src: "photo.png"
  }
  text @caption "Hello" {
    font: "Inter" regular 14
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let card_idx = graph.index_of(NodeId::intern("card")).unwrap();
    assert_eq!(
        graph.children(card_idx).len(),
        2,
        "card should have 2 children"
    );

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of image in frame failed");
    let card_idx2 = graph2.index_of(NodeId::intern("card")).unwrap();
    assert_eq!(graph2.children(card_idx2).len(), 2);
    let photo = graph2.get_by_id(NodeId::intern("photo")).unwrap();
    assert!(matches!(photo.kind, NodeKind::Image { .. }));
}

#[test]
fn roundtrip_image_with_styles() {
    let input = r#"
image @styled_img {
  w: 200 h: 150
  src: "icon.svg"
  fit: fill
  corner: 12
  opacity: 0.8
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("styled_img")).unwrap();
    assert_eq!(node.props.corner_radius, Some(12.0));
    assert_eq!(node.props.opacity, Some(0.8));

    let output = emit_document(&graph);
    assert!(output.contains("corner: 12"));
    assert!(output.contains("opacity: 0.8"));
    assert!(output.contains("fit: fill"));

    let graph2 = parse_document(&output).unwrap();
    let node2 = graph2.get_by_id(NodeId::intern("styled_img")).unwrap();
    assert_eq!(node2.props.corner_radius, Some(12.0));
    assert_eq!(node2.props.opacity, Some(0.8));
    match &node2.kind {
        NodeKind::Image { fit, .. } => assert_eq!(*fit, ImageFit::Fill),
        _ => panic!("expected Image"),
    }
}

// ─── F1: 1-Decimal Precision tests ──────────────────────────────────────

#[test]
fn emit_format_num_one_decimal() {
    use crate::emitter::format_num;
    assert_eq!(format_num(128.57), "128.57");
    assert_eq!(format_num(100.0), "100");
    assert_eq!(format_num(0.5), "0.5");
    assert_eq!(format_num(3.14), "3.14");
    assert_eq!(format_num(42.0), "42");
    assert_eq!(format_num(1.05), "1.05");
}

#[test]
fn roundtrip_one_decimal_coords() {
    let input = "rect @box {\n  w: 128.6 h: 64.3\n  x: 10.5\n  y: 20.7\n  fill: #FF0000\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(output.contains("128.6"), "w should be 128.6: {output}");
    assert!(output.contains("64.3"), "h should be 64.3: {output}");
    let graph2 = parse_document(&output).expect("re-parse of 1dp coords failed");
    let node = graph2.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert!((width - 128.6).abs() < 0.1);
            assert!((height - 64.3).abs() < 0.1);
        }
        _ => panic!("expected Rect"),
    }
}

// ─── F2: Edge Defaults tests ────────────────────────────────────────────

#[test]
fn parse_edge_defaults() {
    let input = r#"
edge_defaults {
  stroke: #6B7080 1.5
  arrow: end
  curve: smooth
}

rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }

edge @link {
  from: @a
  to: @b
  stroke: #6B7080 1.5
  arrow: end
  curve: smooth
}
"#;
    let graph = parse_document(input).unwrap();
    let defaults = graph
        .edge_defaults
        .as_ref()
        .expect("should have edge_defaults");
    assert!(defaults.props.stroke.is_some());
    assert_eq!(defaults.arrow, Some(ArrowKind::End));
    assert_eq!(defaults.curve, Some(CurveKind::Smooth));
}

#[test]
fn emit_edge_defaults_suppresses_matching() {
    let input = r#"
edge_defaults {
  stroke: #6B7080 1.5
  arrow: end
}

rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }

edge @link {
  from: @a
  to: @b
  stroke: #6B7080 1.5
  arrow: end
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    // edge_defaults block should be present
    assert!(
        output.contains("edge_defaults"),
        "should emit edge_defaults: {output}"
    );
    // Individual edge should NOT have stroke or arrow (they match defaults)
    let edge_section = output
        .split("edge @link")
        .nth(1)
        .expect("edge block missing");
    assert!(
        !edge_section.contains("stroke:"),
        "matching stroke should be suppressed: {edge_section}"
    );
    assert!(
        !edge_section.contains("arrow:"),
        "matching arrow should be suppressed: {edge_section}"
    );
}

#[test]
fn roundtrip_edge_defaults() {
    let input = r#"
edge_defaults {
  stroke: #6B7080 1.5
  arrow: end
  curve: smooth
}

rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }
rect @c { w: 50 h: 50 }

edge @ab {
  from: @a
  to: @b
  stroke: #6B7080 1.5
  arrow: end
  curve: smooth
}

edge @bc {
  from: @b
  to: @c
  stroke: #FF0000 2
  arrow: both
}
"#;
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);

    // Re-parse
    let graph2 = parse_document(&output).expect("re-parse of edge_defaults failed");
    assert!(graph2.edge_defaults.is_some());
    assert_eq!(graph2.edges.len(), 2);

    // bc edge should still have its own stroke/arrow
    let bc = graph2.edges.iter().find(|e| e.id.as_str() == "bc").unwrap();
    assert_eq!(bc.arrow, ArrowKind::Both);
    assert!(bc.props.stroke.is_some());
}

// ─── F5: ReadMode::Diff tests ───────────────────────────────────────────

#[test]
fn snapshot_and_diff_added_node() {
    use crate::emitter::{emit_diff, snapshot_graph};

    let input = "rect @a {\n  w: 100 h: 50\n  fill: #FF0000\n}\n";
    let graph1 = parse_document(input).unwrap();
    let snap = snapshot_graph(&graph1);

    // Add a node
    let input2 = "rect @a {\n  w: 100 h: 50\n  fill: #FF0000\n}\nrect @b {\n  w: 50 h: 50\n}\n";
    let graph2 = parse_document(input2).unwrap();
    let diff = emit_diff(&graph2, &snap);

    assert!(diff.contains("+ "), "should show added node: {diff}");
    assert!(diff.contains("@b"), "should mention @b: {diff}");
    assert!(!diff.contains("- @"), "no removals expected: {diff}");
}

#[test]
fn snapshot_and_diff_removed_node() {
    use crate::emitter::{emit_diff, snapshot_graph};

    let input = "rect @a {\n  w: 100 h: 50\n}\nrect @b {\n  w: 50 h: 50\n}\n";
    let graph1 = parse_document(input).unwrap();
    let snap = snapshot_graph(&graph1);

    // Remove @b
    let input2 = "rect @a {\n  w: 100 h: 50\n}\n";
    let graph2 = parse_document(input2).unwrap();
    let diff = emit_diff(&graph2, &snap);

    assert!(diff.contains("- @b"), "should show removed node: {diff}");
}

#[test]
fn snapshot_and_diff_modified_style() {
    use crate::emitter::{emit_diff, snapshot_graph};

    let input = "rect @a {\n  w: 100 h: 50\n  fill: #FF0000\n}\n";
    let graph1 = parse_document(input).unwrap();
    let snap = snapshot_graph(&graph1);

    // Change fill
    let input2 = "rect @a {\n  w: 100 h: 50\n  fill: #0000FF\n}\n";
    let graph2 = parse_document(input2).unwrap();
    let diff = emit_diff(&graph2, &snap);

    assert!(diff.contains("~ "), "should show modified node: {diff}");
    assert!(diff.contains("@a"), "should mention @a: {diff}");
}

#[test]
fn snapshot_no_changes() {
    use crate::emitter::{emit_diff, snapshot_graph};

    let input = "rect @a {\n  w: 100 h: 50\n  fill: #FF0000\n}\n";
    let graph = parse_document(input).unwrap();
    let snap = snapshot_graph(&graph);
    let diff = emit_diff(&graph, &snap);

    assert!(diff.contains("# No changes"), "unchanged graph: {diff}");
}

// ─── F6: Inline Doc-Comments tests ──────────────────────────────────────

#[test]
fn emit_no_auto_comment_text_node() {
    let input = "text @title \"Welcome Home\" {\n  fill: #333333\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        !output.contains("[auto]"),
        "text node should NOT get auto-comment (self-documenting): {output}"
    );
}

#[test]
fn emit_auto_comment_group_children() {
    let input = "group @panel {\n  rect @a { w: 50 h: 50 }\n  rect @b { w: 50 h: 50 }\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("[auto] container (2 children)"),
        "group should get child count: {output}"
    );
}

#[test]
fn roundtrip_auto_comments_not_duplicated() {
    // Use a group (which still gets auto-comments) to test duplication
    let input = "group @panel {\n  rect @a { w: 50 h: 50 }\n}\n";
    let graph = parse_document(input).unwrap();
    let pass1 = emit_document(&graph);
    assert!(pass1.contains("[auto]"), "pass1 should have auto-comment");

    // Round-trip: [auto] should be skipped by parser, regenerated by emitter
    let graph2 = parse_document(&pass1).expect("re-parse failed");
    let pass2 = emit_document(&graph2);

    // Should have exactly one [auto] comment
    let auto_count = pass2.matches("[auto]").count();
    assert_eq!(auto_count, 1, "auto-comments should not duplicate: {pass2}");
}

#[test]
fn emit_auto_comment_styled_node() {
    let input =
        "style accent {\n  fill: #6C5CE7\n}\nrect @btn {\n  w: 120 h: 40\n  use: accent\n}\n";
    let graph = parse_document(input).unwrap();
    let output = emit_document(&graph);
    assert!(
        output.contains("[auto] styled: accent"),
        "node with use: should get styled comment: {output}"
    );
}

// ─── Typed Spec roundtrip tests ──────────────────────────────────────────

#[test]
fn roundtrip_spec_role_trait_intent() {
    let input = r#"
rect @btn {
  w: 120 h: 40
  fill: #6C5CE7
  spec {
    role: "Primary action button"
    trait: "interactive, accessible"
    intent: "submit form data"
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("btn")).unwrap();
    let spec = node.spec.as_ref().expect("should have spec");
    assert_eq!(spec.role.as_deref(), Some("Primary action button"));
    assert_eq!(spec.traits, vec!["interactive", "accessible"]);
    assert_eq!(spec.intent.as_deref(), Some("submit form data"));

    let output = emit_document(&graph);
    assert!(
        output.contains("role:"),
        "emitted output should contain role"
    );
    assert!(
        output.contains("trait:"),
        "emitted output should contain trait"
    );
    assert!(
        output.contains("intent:"),
        "emitted output should contain intent"
    );

    // Round-trip: re-parse should preserve typed fields
    let graph2 = parse_document(&output).expect("re-parse of typed spec failed");
    let node2 = graph2.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

#[test]
fn roundtrip_spec_with_description() {
    let input = r#"
rect @card {
  w: 200 h: 120
  spec {
    role: "Content card"
    trait: "responsive"

    ## Features
    - Dark mode support
    - Hover effects
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("card")).unwrap();
    let spec = node.spec.as_ref().expect("should have spec");
    assert_eq!(spec.role.as_deref(), Some("Content card"));
    assert!(
        spec.description
            .as_ref()
            .unwrap()
            .contains("Dark mode support")
    );

    let output = emit_document(&graph);
    let graph2 = parse_document(&output).expect("re-parse of spec with desc failed");
    let node2 = graph2.get_by_id(NodeId::intern("card")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

// ─── New canvas keyword roundtrip tests ──────────────────────────────────

#[test]
fn roundtrip_visible_cursor_rotate() {
    let input = r#"
rect @box {
  w: 100 h: 50
  fill: #FF0000
  visible: false
  cursor: pointer
  rotate: 45
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node.props.visible, Some(false));
    assert_eq!(node.props.cursor.as_deref(), Some("pointer"));
    assert_eq!(node.props.rotate, Some(45.0));

    let output = emit_document(&graph);
    assert!(output.contains("visible: false"), "should emit visible");
    assert!(output.contains("cursor: pointer"), "should emit cursor");
    assert!(output.contains("rotate: 45"), "should emit rotate");

    let graph2 = parse_document(&output).expect("re-parse of canvas keywords failed");
    let node2 = graph2.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node2.props.visible, node.props.visible);
    assert_eq!(node2.props.cursor, node.props.cursor);
    assert_eq!(node2.props.rotate, node.props.rotate);
}

#[test]
fn roundtrip_spec_backward_compat_quoted() {
    // Old format: quoted strings inside spec { } blocks should be unquoted
    let input = r#"
rect @widget {
  w: 80 h: 40
  spec {
    "A legacy-format description"
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("widget")).unwrap();
    let spec = node.spec.as_ref().expect("should have spec");
    assert_eq!(
        spec.description.as_deref(),
        Some("A legacy-format description")
    );

    let output = emit_document(&graph);
    // Should emit as inline shorthand (single-line desc, no keywords)
    assert!(
        output.contains("spec \"A legacy-format description\""),
        "should use inline shorthand"
    );

    let graph2 = parse_document(&output).expect("re-parse of backward-compat spec failed");
    let node2 = graph2.get_by_id(NodeId::intern("widget")).unwrap();
    assert_eq!(node2.spec, node.spec);
}

// ─── Phase 2: Style block spec roundtrip tests ──────────────────────────

#[test]
fn roundtrip_style_with_spec() {
    let input = r#"
style cta_primary {
  role: "Call-to-action button"
  trait: "bold, urgent"
  fill: #6C5CE7
  font: "Inter" 600 16
}

rect @btn {
  w: 120 h: 40
  use: cta_primary
}
"#;
    let graph = parse_document(input).unwrap();

    // Verify spec was parsed and stored
    let style_spec = graph.style_specs.get(&NodeId::intern("cta_primary"));
    assert!(style_spec.is_some(), "style should have spec");
    let spec = style_spec.unwrap();
    assert_eq!(spec.role.as_deref(), Some("Call-to-action button"));
    assert_eq!(spec.traits, vec!["bold", "urgent"]);

    // Verify emitter outputs spec in style block
    let output = emit_document(&graph);
    assert!(
        output.contains("role:"),
        "emitted style should contain role"
    );
    assert!(
        output.contains("trait:"),
        "emitted style should contain trait"
    );

    // Round-trip: re-parse should preserve spec in style
    let graph2 = parse_document(&output).expect("re-parse of style with spec failed");
    let style_spec2 = graph2.style_specs.get(&NodeId::intern("cta_primary"));
    assert_eq!(style_spec2, Some(spec));
}

#[test]
fn use_merges_spec_from_style() {
    let input = r#"
style cta_primary {
  role: "Call-to-action button"
  trait: "bold"
  fill: #6C5CE7
}

rect @btn {
  w: 120 h: 40
  use: cta_primary
  spec {
    intent: "submit form data"
    trait: "accessible"
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("btn")).unwrap();

    // Resolve effective spec (merges style spec + inline spec)
    let resolved = graph.resolve_spec(node).expect("should resolve spec");
    assert_eq!(
        resolved.role.as_deref(),
        Some("Call-to-action button"),
        "role from style"
    );
    assert_eq!(
        resolved.intent.as_deref(),
        Some("submit form data"),
        "intent from inline"
    );
    assert!(
        resolved.traits.contains(&"bold".to_string()),
        "trait from style"
    );
    assert!(
        resolved.traits.contains(&"accessible".to_string()),
        "trait from inline"
    );
}

// ─── Phase 3: When template roundtrip tests ─────────────────────────────

#[test]
fn roundtrip_when_template() {
    let input = r#"
when hover_lift {
  scale: 1.05
  opacity: 0.9
  ease: ease_out 200ms
}

rect @btn {
  w: 120 h: 40
  fill: #6C5CE7
}
"#;
    let graph = parse_document(input).unwrap();

    // Verify template was parsed
    let template = graph.when_templates.get(&NodeId::intern("hover_lift"));
    assert!(template.is_some(), "when template should be parsed");
    let tmpl = template.unwrap();
    assert_eq!(tmpl.properties.scale, Some(1.05));
    assert_eq!(tmpl.properties.opacity, Some(0.9));
    assert_eq!(tmpl.duration_ms, 200);

    // Verify emitter outputs when template
    let output = emit_document(&graph);
    assert!(
        output.contains("when hover_lift {"),
        "should emit when template"
    );
    assert!(output.contains("scale: 1.05"), "should emit scale");
    assert!(output.contains("opacity: 0.9"), "should emit opacity");
    assert!(output.contains("ease: ease_out 200ms"), "should emit ease");

    // Round-trip: re-parse should preserve template
    let graph2 = parse_document(&output).expect("re-parse of when template failed");
    let tmpl2 = graph2
        .when_templates
        .get(&NodeId::intern("hover_lift"))
        .expect("template should survive roundtrip");
    assert_eq!(tmpl2.properties.scale, tmpl.properties.scale);
    assert_eq!(tmpl2.properties.opacity, tmpl.properties.opacity);
    assert_eq!(tmpl2.duration_ms, tmpl.duration_ms);
}

#[test]
fn when_use_template() {
    let input = r#"
when hover_lift {
  scale: 1.05
  ease: spring 300ms
}

rect @btn {
  w: 120 h: 40
  fill: #6C5CE7
  when :hover {
    use: hover_lift
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let node = graph.get_by_id(NodeId::intern("btn")).unwrap();

    // Verify animation has use_template set
    assert_eq!(node.animations.len(), 1);
    assert_eq!(
        node.animations[0].use_template,
        Some(NodeId::intern("hover_lift"))
    );

    // Verify emitter outputs use: inside when block
    let output = emit_document(&graph);
    assert!(
        output.contains("use: hover_lift"),
        "should emit use: inside when block"
    );

    // Round-trip: re-parse should preserve use_template
    let graph2 = parse_document(&output).expect("re-parse of when use template failed");
    let node2 = graph2.get_by_id(NodeId::intern("btn")).unwrap();
    assert_eq!(
        node2.animations[0].use_template,
        node.animations[0].use_template
    );
}
