//! Integration tests: undo/redo command stack (fd-editor).
//!
//! Tests the CommandStack + SyncEngine interaction, verifying that
//! mutations can be undone and redone correctly across crate boundaries.

use fd_core::id::NodeId;
use fd_core::model::*;
use fd_editor::commands::CommandStack;
use fd_editor::sync::{GraphMutation, SyncEngine};

const VIEWPORT: fd_core::Viewport = fd_core::Viewport {
    width: 800.0,
    height: 600.0,
};

fn make_engine() -> SyncEngine {
    let input = include_str!("fixtures/minimal.fd");
    SyncEngine::from_text(input, VIEWPORT).unwrap()
}

// ─── Basic undo/redo ────────────────────────────────────────────────────

#[test]
fn undo_restores_previous_state() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    // Resize box
    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 200.0,
            height: 100.0,
        },
        "Resize box",
    );

    // Verify resize applied
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 200.0);
            assert_eq!(*height, 100.0);
        }
        _ => panic!("expected Rect"),
    }

    // Undo
    let result = stack.undo(&mut engine);
    assert_eq!(result.as_ref().map(|(d, _)| d.as_str()), Some("Resize box"));

    // Verify original dimensions restored
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 100.0, "width not restored after undo");
            assert_eq!(*height, 50.0, "height not restored after undo");
        }
        _ => panic!("expected Rect"),
    }
}

#[test]
fn redo_reapplies_undone_action() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 200.0,
            height: 100.0,
        },
        "Resize box",
    );

    stack.undo(&mut engine);
    stack.redo(&mut engine);

    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 200.0, "width not restored after redo");
            assert_eq!(*height, 100.0, "height not restored after redo");
        }
        _ => panic!("expected Rect"),
    }
}

// ─── Multiple operations ────────────────────────────────────────────────

#[test]
fn undo_multiple_operations_in_order() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    // First resize
    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 200.0,
            height: 100.0,
        },
        "Resize to 200x100",
    );

    // Second resize
    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 400.0,
            height: 200.0,
        },
        "Resize to 400x200",
    );

    // Undo second
    stack.undo(&mut engine);
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 200.0, "should be back to first resize");
            assert_eq!(*height, 100.0);
        }
        _ => panic!("expected Rect"),
    }

    // Undo first
    stack.undo(&mut engine);
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 100.0, "should be back to original");
            assert_eq!(*height, 50.0);
        }
        _ => panic!("expected Rect"),
    }
}

// ─── Redo cleared on new action ─────────────────────────────────────────

#[test]
fn new_action_clears_redo_stack() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 200.0,
            height: 100.0,
        },
        "Resize",
    );

    stack.undo(&mut engine);
    assert!(stack.can_redo(), "should be able to redo after undo");

    // New action
    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 300.0,
            height: 150.0,
        },
        "New resize",
    );

    assert!(
        !stack.can_redo(),
        "redo stack should be cleared after new action"
    );
}

// ─── Empty stack edge cases ─────────────────────────────────────────────

#[test]
fn undo_on_empty_stack_returns_none() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    assert!(stack.undo(&mut engine).is_none());
    assert!(!stack.can_undo());
}

#[test]
fn redo_on_empty_stack_returns_none() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    assert!(stack.redo(&mut engine).is_none());
    assert!(!stack.can_redo());
}

// ─── Text sync after undo ───────────────────────────────────────────────

#[test]
fn text_reflects_state_after_undo() {
    let mut engine = make_engine();
    let mut stack = CommandStack::new(100);

    stack.execute(
        &mut engine,
        GraphMutation::ResizeNode {
            id: NodeId::intern("box"),
            width: 999.0,
            height: 888.0,
        },
        "Big resize",
    );
    engine.flush_to_text();
    assert!(
        engine.text.contains("999"),
        "resized width should appear in text"
    );

    stack.undo(&mut engine);
    engine.flush_to_text();
    assert!(
        !engine.text.contains("999"),
        "undone width should no longer be in text"
    );
    assert!(
        engine.text.contains("100"),
        "original width should be restored in text"
    );
}
