//! Integration tests: bidirectional sync engine (fd-editor ↔ fd-core).
//!
//! Tests the SyncEngine's ability to round-trip between text and canvas
//! mutations, exercising the cross-crate boundary.

use fd_core::id::NodeId;
use fd_core::model::*;
use fd_editor::sync::{GraphMutation, SyncEngine};

const VIEWPORT: fd_core::Viewport = fd_core::Viewport {
    width: 800.0,
    height: 600.0,
};

// ─── Text → Canvas ──────────────────────────────────────────────────────

#[test]
fn sync_text_to_canvas_creates_nodes() {
    let input = include_str!("fixtures/login_form.fd");
    let engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    // Verify key nodes exist
    assert!(
        engine
            .graph
            .get_by_id(NodeId::intern("login_form"))
            .is_some()
    );
    assert!(engine.graph.get_by_id(NodeId::intern("title")).is_some());
    assert!(
        engine
            .graph
            .get_by_id(NodeId::intern("email_field"))
            .is_some()
    );
    assert!(
        engine
            .graph
            .get_by_id(NodeId::intern("login_btn"))
            .is_some()
    );
}

#[test]
fn sync_text_to_canvas_resolves_bounds() {
    let input = include_str!("fixtures/login_form.fd");
    let engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    // Every non-root node should have bounds
    for idx in engine.graph.graph.node_indices() {
        if idx == engine.graph.root {
            continue;
        }
        assert!(
            engine.bounds.contains_key(&idx),
            "node {idx:?} missing bounds after sync"
        );
    }
}

// ─── Canvas → Text ──────────────────────────────────────────────────────

#[test]
fn sync_resize_reflects_in_text() {
    let input = include_str!("fixtures/minimal.fd");
    let mut engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    engine.apply_mutation(GraphMutation::ResizeNode { dx: 0.0, dy: 0.0,
        id: NodeId::intern("box"),
        width: 250.0,
        height: 120.0,
    });
    engine.flush_to_text();

    assert!(engine.text.contains("250"), "resized width not in text");
    assert!(engine.text.contains("120"), "resized height not in text");
}

#[test]
fn sync_set_text_reflects_in_text() {
    let input = include_str!("fixtures/login_form.fd");
    let mut engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    engine.apply_mutation(GraphMutation::SetText {
        id: NodeId::intern("title"),
        content: "Hello World".into(),
    });
    engine.flush_to_text();

    assert!(
        engine.text.contains("Hello World"),
        "updated text content not found in emitted text"
    );
}

// ─── Full bidirectional round-trip ───────────────────────────────────────

#[test]
fn bidi_roundtrip_resize_and_reparse() {
    let input = include_str!("fixtures/minimal.fd");
    let mut engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    // Canvas mutation: resize
    engine.apply_mutation(GraphMutation::ResizeNode { dx: 0.0, dy: 0.0,
        id: NodeId::intern("box"),
        width: 300.0,
        height: 150.0,
    });
    let text_after = engine.current_text().to_string();

    // Simulate text editor receiving the updated text
    let engine2 = SyncEngine::from_text(&text_after, VIEWPORT).unwrap();
    let node = engine2.graph.get_by_id(NodeId::intern("box")).unwrap();

    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 300.0, "width not preserved in bidi round-trip");
            assert_eq!(*height, 150.0, "height not preserved in bidi round-trip");
        }
        other => panic!("expected Rect, got {other:?}"),
    }
}

#[test]
fn bidi_roundtrip_text_edit_and_reparse() {
    let input = include_str!("fixtures/minimal.fd");
    let mut engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    // Text direction: replace entire text with modified version
    let modified = "rect @box {\n  w: 500 h: 250\n  fill: #00FF00\n}\n";
    engine.set_text(modified).unwrap();

    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 500.0);
            assert_eq!(*height, 250.0);
        }
        other => panic!("expected Rect, got {other:?}"),
    }
}

// ─── Add and remove nodes ───────────────────────────────────────────────

#[test]
fn sync_add_node_appears_in_text() {
    let input = include_str!("fixtures/minimal.fd");
    let mut engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    let new_node = SceneNode::new(
        NodeId::intern("circle"),
        NodeKind::Ellipse { rx: 50.0, ry: 50.0 },
    );
    engine.apply_mutation(GraphMutation::AddNode {
        parent_id: NodeId::intern("root"),
        node: Box::new(new_node),
    });
    engine.flush_to_text();

    assert!(
        engine.text.contains("circle"),
        "added node @circle not in emitted text"
    );
}

#[test]
fn sync_remove_node_disappears_from_text() {
    let input = include_str!("fixtures/minimal.fd");
    let mut engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("box"),
    });
    engine.flush_to_text();

    assert!(
        !engine.text.contains("@box"),
        "@box should no longer appear in text after removal"
    );
}

// ─── Complex fixture ────────────────────────────────────────────────────

#[test]
fn sync_complex_fixture_all_nodes_accessible() {
    let input = include_str!("fixtures/login_form.fd");
    let engine = SyncEngine::from_text(input, VIEWPORT).unwrap();

    let expected_ids = [
        "login_form",
        "title",
        "email_field",
        "email_hint",
        "pass_field",
        "pass_hint",
        "login_btn",
        "btn_label",
    ];

    for name in &expected_ids {
        let id = NodeId::intern(name);
        assert!(
            engine.graph.get_by_id(id).is_some(),
            "expected node @{name} not found in graph"
        );
    }
}
