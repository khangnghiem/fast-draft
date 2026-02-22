//! Integration tests: parse → emit → re-parse round-trip.
//!
//! Verifies that no data is lost when converting FD text → SceneGraph → FD text.

use fd_core::emitter::emit_document;
use fd_core::id::NodeId;
use fd_core::model::*;
use fd_core::parser::parse_document;

// ─── Helpers ─────────────────────────────────────────────────────────────

/// Parse, emit, re-parse, and compare node counts + IDs.
fn assert_roundtrip_preserves(input: &str) {
    let graph1 = parse_document(input).expect("first parse failed");
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).expect("re-parse failed");

    // Same number of nodes
    assert_eq!(
        graph1.graph.node_count(),
        graph2.graph.node_count(),
        "node count mismatch after round-trip.\nOriginal:\n{input}\nEmitted:\n{emitted}"
    );

    // Same number of styles
    assert_eq!(
        graph1.styles.len(),
        graph2.styles.len(),
        "style count mismatch after round-trip"
    );

    // Every node ID in graph1 exists in graph2
    for id in graph1.id_index.keys() {
        assert!(
            graph2.id_index.contains_key(id),
            "node ID {id:?} lost after round-trip"
        );
    }
}

/// Verify a specific node's kind survives round-trip.
fn assert_node_kind_preserved(input: &str, node_name: &str) {
    let graph1 = parse_document(input).expect("first parse failed");
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).expect("re-parse failed");

    let id = NodeId::intern(node_name);
    let n1 = graph1.get_by_id(id).expect("node missing in original");
    let n2 = graph2.get_by_id(id).expect("node missing after round-trip");

    assert_eq!(
        std::mem::discriminant(&n1.kind),
        std::mem::discriminant(&n2.kind),
        "node kind changed for @{node_name} after round-trip"
    );
}

// ─── Fixture-based tests ─────────────────────────────────────────────────

#[test]
fn roundtrip_login_form_fixture() {
    let input = include_str!("fixtures/login_form.fd");
    assert_roundtrip_preserves(input);
}

#[test]
fn roundtrip_minimal_fixture() {
    let input = include_str!("fixtures/minimal.fd");
    assert_roundtrip_preserves(input);
}

#[test]
fn roundtrip_nested_layout_fixture() {
    let input = include_str!("fixtures/nested_layout.fd");
    assert_roundtrip_preserves(input);
}

// ─── Node kind preservation ──────────────────────────────────────────────

#[test]
fn roundtrip_preserves_rect_kind() {
    let input = include_str!("fixtures/minimal.fd");
    assert_node_kind_preserved(input, "box");
}

#[test]
fn roundtrip_preserves_group_kind() {
    let input = include_str!("fixtures/login_form.fd");
    assert_node_kind_preserved(input, "login_form");
}

#[test]
fn roundtrip_preserves_text_kind() {
    let input = include_str!("fixtures/login_form.fd");
    assert_node_kind_preserved(input, "title");
}

// ─── Style preservation ─────────────────────────────────────────────────

#[test]
fn roundtrip_preserves_named_styles() {
    let input = include_str!("fixtures/login_form.fd");
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    for name in graph1.styles.keys() {
        assert!(
            graph2.styles.contains_key(name),
            "named style {name:?} lost after round-trip"
        );
    }
}

#[test]
fn roundtrip_preserves_use_references() {
    let input = include_str!("fixtures/login_form.fd");
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("title");
    let n1 = graph1.get_by_id(id).unwrap();
    let n2 = graph2.get_by_id(id).unwrap();

    assert_eq!(
        n1.use_styles.len(),
        n2.use_styles.len(),
        "use_styles count changed for @title after round-trip"
    );
}

// ─── Annotation preservation ─────────────────────────────────────────────

#[test]
fn roundtrip_preserves_annotations() {
    let input = include_str!("fixtures/login_form.fd");
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("login_form");
    let n1 = graph1.get_by_id(id).unwrap();
    let n2 = graph2.get_by_id(id).unwrap();

    assert_eq!(
        n1.annotations.len(),
        n2.annotations.len(),
        "annotation count changed for @login_form"
    );

    // Verify specific annotations survive
    assert_eq!(n1.annotations, n2.annotations);
}

// ─── Animation preservation ──────────────────────────────────────────────

#[test]
fn roundtrip_preserves_animations() {
    let input = include_str!("fixtures/login_form.fd");
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("login_btn");
    let n1 = graph1.get_by_id(id).unwrap();
    let n2 = graph2.get_by_id(id).unwrap();

    assert_eq!(
        n1.animations.len(),
        n2.animations.len(),
        "animation count changed for @login_btn"
    );
}

// ─── Edge cases ──────────────────────────────────────────────────────────

#[test]
fn roundtrip_empty_document() {
    assert_roundtrip_preserves("");
}

#[test]
fn roundtrip_comment_only_document() {
    let input = "# Just a comment\n# Another comment\n";
    assert_roundtrip_preserves(input);
}

#[test]
fn roundtrip_rect_dimensions_exact() {
    let input = include_str!("fixtures/minimal.fd");
    let graph = parse_document(input).unwrap();
    let id = NodeId::intern("box");
    let node = graph.get_by_id(id).unwrap();

    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 100.0);
            assert_eq!(*height, 50.0);
        }
        other => panic!("expected Rect, got {other:?}"),
    }
}
// ─── Paint / Shadow preservation ────────────────────────────────────────

#[test]
fn roundtrip_linear_gradient_fill() {
    let input = r#"
rect @hero {
  w: 400
  h: 200
  fill: linear(90deg, #FF6B6B 0, #4ECDC4 1)
}
"#;
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("hero");
    let n2 = graph2.get_by_id(id).unwrap();
    assert!(
        matches!(&n2.style.fill, Some(Paint::LinearGradient { .. })),
        "LinearGradient fill lost after round-trip.\nEmitted:\n{emitted}"
    );
}

#[test]
fn roundtrip_radial_gradient_fill() {
    let input = r#"
ellipse @glow {
  w: 160 h: 160
  fill: radial(#FFFFFF 0, #6C5CE7 1)
}
"#;
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("glow");
    let n2 = graph2.get_by_id(id).unwrap();
    assert!(
        matches!(&n2.style.fill, Some(Paint::RadialGradient { .. })),
        "RadialGradient fill lost after round-trip.\nEmitted:\n{emitted}"
    );
}

#[test]
fn roundtrip_shadow() {
    // Shadow is set via bg: ... shadow=(...) — the established inline modifier syntax
    let input = r#"
rect @card {
  w: 200 h: 120
  bg: #FFFFFF shadow=(0,4,12,#00000033)
}
"#;
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("card");
    let n2 = graph2.get_by_id(id).unwrap();
    let shadow = n2
        .style
        .shadow
        .as_ref()
        .unwrap_or_else(|| panic!("shadow lost after round-trip.\nEmitted:\n{emitted}"));
    assert_eq!(shadow.offset_y, 4.0);
    assert_eq!(shadow.blur, 12.0);
}

#[test]
fn roundtrip_path_kind() {
    // Path commands are drawn programmatically, not persisted in text.
    // Verify that a path node round-trips as NodeKind::Path.
    let input = r#"
path @line {
  stroke: #5E5CE6 1.5
}
"#;
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let graph2 = parse_document(&emitted).unwrap();

    let id = NodeId::intern("line");
    let n2 = graph2.get_by_id(id).unwrap();
    assert!(
        matches!(&n2.kind, NodeKind::Path { .. }),
        "Path node kind lost after round-trip.\nEmitted:\n{emitted}"
    );
}

#[test]
fn roundtrip_gradient_in_named_style() {
    let input = r#"
style brand {
  fill: linear(135deg, #6C5CE7 0, #A29BFE 1)
}

rect @hero {
  w: 320 h: 180
  use: brand
}
"#;
    let graph1 = parse_document(input).unwrap();
    let emitted = emit_document(&graph1);
    let _graph2 = parse_document(&emitted).unwrap_or_else(|e| {
        panic!("re-parse failed for gradient in named style.\nError: {e}\nEmitted:\n{emitted}")
    });
}
