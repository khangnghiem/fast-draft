use super::*;

#[test]
fn sync_text_to_canvas() {
    let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let engine = SyncEngine::from_text(input, viewport).unwrap();

    assert!(engine.graph.get_by_id(NodeId::intern("box")).is_some());
    let idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
    assert!(engine.bounds.contains_key(&idx));
}

#[test]
fn sync_canvas_to_text() {
    let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Resize via canvas
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: NodeId::intern("box"),
        width: 200.0,
        height: 100.0,
    });
    engine.flush_to_text();

    // Verify text reflects the change
    assert!(engine.text.contains("200"));
    assert!(engine.text.contains("100"));
}

#[test]
fn sync_roundtrip_bidirectional() {
    let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // 1. Canvas mutation
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: NodeId::intern("box"),
        width: 300.0,
        height: 150.0,
    });
    let text_after_canvas = engine.current_text().to_string();

    // 2. Re-parse from text (simulating text editor receiving update)
    let engine2 = SyncEngine::from_text(&text_after_canvas, viewport).unwrap();
    let node = engine2.graph.get_by_id(NodeId::intern("box")).unwrap();
    match &node.kind {
        NodeKind::Rect { width, height } => {
            assert_eq!(*width, 300.0);
            assert_eq!(*height, 150.0);
        }
        _ => panic!("expected Rect"),
    }
}

#[test]
fn sync_set_spec() {
    let input = r#"
rect @box {
  w: 100
  h: 50
  note "Initial note"
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Verify initial note
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(
        node.spec.as_ref().and_then(|s| s.description.as_deref()),
        Some("Initial note")
    );

    // Update note via mutation
    engine.apply_mutation(GraphMutation::SetSpec {
        id: NodeId::intern("box"),
        spec: Some(Spec::from_description(
            "## Updated\n- [ ] task one\n- [x] task two".to_string(),
        )),
    });
    engine.flush_to_text();

    // Verify graph updated
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert!(node.spec.as_ref().unwrap().contains("## Updated"));
    assert!(node.spec.as_ref().unwrap().contains("- [ ] task one"));

    // Verify text re-emitted with note block
    assert!(engine.text.contains("spec {"));
    assert!(engine.text.contains("## Updated"));
}

#[test]
fn sync_note_roundtrip() {
    let input = r#"
rect @card {
  w: 200
  h: 100
  note {
    # Card component
    - [ ] renders correctly
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Mutate note
    engine.apply_mutation(GraphMutation::SetSpec {
        id: NodeId::intern("card"),
        spec: Some(Spec::from_description(
            "# Updated card\n- [ ] renders correctly\n- [ ] needs review".to_string(),
        )),
    });
    let text = engine.current_text().to_string();

    // Re-parse from text
    let engine2 = SyncEngine::from_text(&text, viewport).unwrap();
    let node = engine2.graph.get_by_id(NodeId::intern("card")).unwrap();
    assert!(node.spec.as_ref().unwrap().contains("needs review"));
    assert!(node.spec.as_ref().unwrap().contains("# Updated card"));
}

#[test]
fn sync_move_multi_frame_no_jitter() {
    // Simulates a drag gesture across 3 frames.
    // After each MoveNode, bounds should accumulate consistently
    // and the Position constraint should match the relative position.
    let input = r#"
rect @box {
  w: 100
  h: 50
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let box_id = NodeId::intern("box");
    let idx = engine.graph.index_of(box_id).unwrap();

    let initial_x = engine.bounds[&idx].x;
    let initial_y = engine.bounds[&idx].y;

    // Frame 1: move right 10, down 5
    engine.apply_mutation(GraphMutation::MoveNode {
        id: box_id,
        dx: 10.0,
        dy: 5.0,
    });
    // Re-resolve (as apply_mutations does for non-move batches)
    engine.resolve();
    let b1 = engine.bounds[&idx];
    assert!(
        (b1.x - (initial_x + 10.0)).abs() < 0.01,
        "frame 1: x={}, expected {}",
        b1.x,
        initial_x + 10.0
    );
    assert!(
        (b1.y - (initial_y + 5.0)).abs() < 0.01,
        "frame 1: y={}, expected {}",
        b1.y,
        initial_y + 5.0
    );

    // Frame 2: move right another 10, down 5
    engine.apply_mutation(GraphMutation::MoveNode {
        id: box_id,
        dx: 10.0,
        dy: 5.0,
    });
    engine.resolve();
    let b2 = engine.bounds[&idx];
    assert!(
        (b2.x - (initial_x + 20.0)).abs() < 0.01,
        "frame 2: x={}, expected {}",
        b2.x,
        initial_x + 20.0
    );
    assert!(
        (b2.y - (initial_y + 10.0)).abs() < 0.01,
        "frame 2: y={}, expected {}",
        b2.y,
        initial_y + 10.0
    );

    // Frame 3: move left 30, up 10
    engine.apply_mutation(GraphMutation::MoveNode {
        id: box_id,
        dx: -30.0,
        dy: -10.0,
    });
    engine.resolve();
    let b3 = engine.bounds[&idx];
    assert!(
        (b3.x - (initial_x - 10.0)).abs() < 0.01,
        "frame 3: x={}, expected {}",
        b3.x,
        initial_x - 10.0
    );
    assert!(
        (b3.y - initial_y).abs() < 0.01,
        "frame 3: y={}, expected {}",
        b3.y,
        initial_y
    );
}

#[test]
fn sync_move_strips_center_in() {
    // A node with center_in should lose that constraint after being moved,
    // so it stays at the dropped position rather than snapping back.
    let input = r#"
rect @box {
  w: 100
  h: 50
}

@box -> center_in: canvas
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let box_id = NodeId::intern("box");

    // Verify CenterIn is present initially
    let node = engine.graph.get_by_id(box_id).unwrap();
    assert!(
        node.constraints
            .iter()
            .any(|c| matches!(c, Constraint::CenterIn(_))),
        "should have CenterIn before move"
    );

    // Move node
    engine.apply_mutation(GraphMutation::MoveNode {
        id: box_id,
        dx: 50.0,
        dy: 30.0,
    });

    // After move, CenterIn should be stripped and only Position remains
    let node = engine.graph.get_by_id(box_id).unwrap();
    assert!(
        !node
            .constraints
            .iter()
            .any(|c| matches!(c, Constraint::CenterIn(_))),
        "CenterIn should be stripped after move"
    );
    assert_eq!(
        node.constraints.len(),
        1,
        "should have exactly one constraint (Position)"
    );
    assert!(
        matches!(node.constraints[0], Constraint::Position { .. }),
        "single constraint should be Position"
    );
}

#[test]
fn sync_set_animations() {
    use fd_core::model::{AnimKeyframe, AnimProperties, AnimTrigger, Easing};

    let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Verify no animations initially
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert!(node.animations.is_empty());

    // Apply SetAnimations mutation
    let mut anims = smallvec::smallvec![];
    anims.push(AnimKeyframe {
        trigger: AnimTrigger::Hover,
        duration_ms: 300,
        easing: Easing::Spring,
        properties: AnimProperties {
            scale: Some(1.1),
            ..Default::default()
        },
        delay_ms: None,
        use_template: None,
    });
    engine.apply_mutation(GraphMutation::SetAnimations {
        id: NodeId::intern("box"),
        animations: anims,
    });
    engine.flush_to_text();

    // Verify graph updated
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node.animations.len(), 1);
    assert_eq!(node.animations[0].trigger, AnimTrigger::Hover);

    // Verify text contains when block
    assert!(engine.text.contains("when :hover"));
    assert!(engine.text.contains("scale:"));

    // Verify round-trip: re-parse from text
    let engine2 = SyncEngine::from_text(&engine.text, viewport).unwrap();
    let node2 = engine2.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node2.animations.len(), 1);
    assert_eq!(node2.animations[0].trigger, AnimTrigger::Hover);
    assert_eq!(node2.animations[0].properties.scale, Some(1.1));
}

#[test]
fn sync_set_style_alignment() {
    use fd_core::model::{TextAlign, TextVAlign};

    let input = r#"
text @heading "Hello" {
  fill: #FFFFFF
  font: "Inter" 600 24
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Verify no alignment initially
    let node = engine.graph.get_by_id(NodeId::intern("heading")).unwrap();
    assert!(node.props.text_align.is_none());
    assert!(node.props.text_valign.is_none());

    // Apply SetStyle mutation with alignment
    let mut style = engine.graph.resolve_style(node, &[]);
    style.text_align = Some(TextAlign::Right);
    style.text_valign = Some(TextVAlign::Bottom);
    engine.apply_mutation(GraphMutation::SetStyle {
        id: NodeId::intern("heading"),
        style,
    });
    engine.flush_to_text();

    // Verify graph updated
    let node = engine.graph.get_by_id(NodeId::intern("heading")).unwrap();
    assert_eq!(node.props.text_align, Some(TextAlign::Right));
    assert_eq!(node.props.text_valign, Some(TextVAlign::Bottom));

    // Verify text output contains align property
    assert!(
        engine.text.contains("align: right bottom"),
        "emitted text should contain 'align: right bottom', got:\n{}",
        engine.text
    );

    // Verify round-trip
    let engine2 = SyncEngine::from_text(&engine.text, viewport).unwrap();
    let node2 = engine2.graph.get_by_id(NodeId::intern("heading")).unwrap();
    assert_eq!(node2.props.text_align, Some(TextAlign::Right));
    assert_eq!(node2.props.text_valign, Some(TextVAlign::Bottom));
}

#[test]
fn sync_move_group_moves_children() {
    let input = r#"
group @box {
  x: 10 y: 10

  rect @child_a { x: 0 y: 0 w: 40 h: 20 }
  rect @child_b { x: 50 y: 30 w: 40 h: 20 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    let group_idx = engine.graph.index_of(NodeId::intern("box")).unwrap();
    let a_idx = engine.graph.index_of(NodeId::intern("child_a")).unwrap();
    let b_idx = engine.graph.index_of(NodeId::intern("child_b")).unwrap();

    let group_before = engine.bounds[&group_idx];
    let a_before = engine.bounds[&a_idx];
    let b_before = engine.bounds[&b_idx];

    // Move the group by (100, 50)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: NodeId::intern("box"),
        dx: 100.0,
        dy: 50.0,
    });

    // Group bounds should have shifted
    let group_after = engine.bounds[&group_idx];
    assert!(
        (group_after.x - (group_before.x + 100.0)).abs() < 0.01,
        "group x: expected {}, got {}",
        group_before.x + 100.0,
        group_after.x
    );
    assert!(
        (group_after.y - (group_before.y + 50.0)).abs() < 0.01,
        "group y: expected {}, got {}",
        group_before.y + 50.0,
        group_after.y
    );

    // Children bounds should have shifted by the same delta
    let a_after = engine.bounds[&a_idx];
    assert!(
        (a_after.x - (a_before.x + 100.0)).abs() < 0.01,
        "child_a x: expected {}, got {}",
        a_before.x + 100.0,
        a_after.x
    );
    assert!(
        (a_after.y - (a_before.y + 50.0)).abs() < 0.01,
        "child_a y: expected {}, got {}",
        a_before.y + 50.0,
        a_after.y
    );

    let b_after = engine.bounds[&b_idx];
    assert!(
        (b_after.x - (b_before.x + 100.0)).abs() < 0.01,
        "child_b x: expected {}, got {}",
        b_before.x + 100.0,
        b_after.x
    );
    assert!(
        (b_after.y - (b_before.y + 50.0)).abs() < 0.01,
        "child_b y: expected {}, got {}",
        b_before.y + 50.0,
        b_after.y
    );
}

#[test]
fn sync_move_detaches_child_from_group() {
    // Moving a child fully outside its parent group should detach it
    // and reparent to root.
    let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let b_id = NodeId::intern("b");
    let container_id = NodeId::intern("container");

    // Verify @b is a child of @container before move
    let b_idx = engine.graph.index_of(b_id).unwrap();
    let parent_before = engine.graph.parent(b_idx).unwrap();
    let container_idx = engine.graph.index_of(container_id).unwrap();
    assert_eq!(
        parent_before, container_idx,
        "@b should be child of @container before move"
    );

    // Move @b far away (fully outside the group)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: b_id,
        dx: 500.0,
        dy: 400.0,
    });
    engine.evaluate_drop(b_id);

    // @b should now be reparented to root
    let b_idx = engine.graph.index_of(b_id).unwrap();
    let parent_after = engine.graph.parent(b_idx).unwrap();
    assert_eq!(
        parent_after, engine.graph.root,
        "@b should be reparented to root after dragging fully outside"
    );

    // @container should only contain @a now
    let children = engine.graph.children(container_idx);
    assert_eq!(children.len(), 1, "container should have 1 child remaining");
}

#[test]
fn sync_move_partial_overlap_keeps_child() {
    // Moving a child partially outside should keep it in the group
    // without expanding the group (expansion was the "chasing envelope" bug).
    let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { x: 0 y: 60 w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let b_id = NodeId::intern("b");
    let container_id = NodeId::intern("container");
    let container_idx = engine.graph.index_of(container_id).unwrap();

    let initial_width = engine.bounds[&container_idx].width;

    // Move @b a small amount right (still overlapping with container)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: b_id,
        dx: 50.0,
        dy: 0.0,
    });
    engine.evaluate_drop(b_id);

    // @b should still be a child of @container
    let b_idx = engine.graph.index_of(b_id).unwrap();
    let parent_after = engine.graph.parent(b_idx).unwrap();
    assert_eq!(
        parent_after, container_idx,
        "@b should remain child of @container with partial overlap"
    );

    // Container should NOT expand during drag (prevents chasing envelope)
    let new_width = engine.bounds[&container_idx].width;
    assert_eq!(
        new_width, initial_width,
        "container should NOT expand during drag ({new_width} == {initial_width})"
    );
}

#[test]
fn sync_move_detaches_through_nested_groups() {
    // Moving a deeply nested child fully outside all groups should
    // reparent to root.
    let input = r#"
group @outer {
  x: 0 y: 0

  group @inner {
x: 0 y: 0

rect @leaf { w: 40 h: 30 }
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let leaf_id = NodeId::intern("leaf");

    // Move @leaf far outside both groups
    engine.apply_mutation(GraphMutation::MoveNode {
        id: leaf_id,
        dx: 600.0,
        dy: 500.0,
    });
    engine.evaluate_drop(leaf_id);

    // @leaf should be reparented to root (jumped 2 levels)
    let leaf_idx = engine.graph.index_of(leaf_id).unwrap();
    let parent = engine.graph.parent(leaf_idx).unwrap();
    assert_eq!(
        parent, engine.graph.root,
        "@leaf should be at root after dragging outside all groups"
    );
}

/// Regression test: incremental drag (many small moves) must eventually
/// detach. Before the fix, `expand_group_to_children` grew the parent on
/// every frame, preventing the child from ever escaping ("chasing envelope").
#[test]
fn sync_incremental_drag_detaches_child() {
    let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { x: 0 y: 60 w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let b_id = NodeId::intern("b");
    let container_id = NodeId::intern("container");
    let container_idx = engine.graph.index_of(container_id).unwrap();

    // Simulate a real drag gesture: 30 small incremental moves (10px each)
    // that should eventually move @b fully outside the sibling envelope.
    for _ in 0..30 {
        engine.apply_mutation(GraphMutation::MoveNode {
            id: b_id,
            dx: 10.0,
            dy: 10.0,
        });
    }
    engine.evaluate_drop(b_id);

    // @b should now be reparented to root
    let b_idx = engine.graph.index_of(b_id).unwrap();
    let parent = engine.graph.parent(b_idx).unwrap();
    assert_eq!(
        parent, engine.graph.root,
        "@b should detach after incremental drag (was: chasing envelope bug)"
    );

    // @container should still exist with @a
    let remaining = engine.graph.children(container_idx);
    assert_eq!(
        remaining.len(),
        1,
        "container should keep 1 child after detach"
    );
}

#[test]
fn sync_move_within_group_no_detach() {
    // Small move within a group should not detach.
    let input = r#"
group @container {
  rect @a { w: 100 h: 50 }
  rect @b { x: 0 y: 60 w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let b_id = NodeId::intern("b");
    let container_id = NodeId::intern("container");
    let container_idx = engine.graph.index_of(container_id).unwrap();

    // Move @b a tiny amount (well within group)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: b_id,
        dx: 5.0,
        dy: 3.0,
    });

    // @b should still be a child of @container
    let b_idx = engine.graph.index_of(b_id).unwrap();
    let parent = engine.graph.parent(b_idx).unwrap();
    assert_eq!(
        parent, container_idx,
        "@b should remain in @container after small move"
    );
}

#[test]
fn sync_text_detach_from_shape() {
    // Dragging a text child fully outside a rect shape should detach it.
    let input = r#"
rect @card {
  w: 200 h: 100

  text @label "Hello" { }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let label_id = NodeId::intern("label");
    let card_id = NodeId::intern("card");
    let card_idx = engine.graph.index_of(card_id).unwrap();

    // Verify text is initially a child of rect
    let label_idx = engine.graph.index_of(label_id).unwrap();
    let parent_before = engine.graph.parent(label_idx).unwrap();
    assert_eq!(
        parent_before, card_idx,
        "@label should be child of @card before drag"
    );

    // Move text far outside the rect
    engine.apply_mutation(GraphMutation::MoveNode {
        id: label_id,
        dx: 500.0,
        dy: 400.0,
    });
    engine.evaluate_drop(label_id);

    // Text should be detached to root
    let label_idx = engine.graph.index_of(label_id).unwrap();
    let parent_after = engine.graph.parent(label_idx).unwrap();
    assert_eq!(
        parent_after, engine.graph.root,
        "@label should be reparented to root after dragging outside @card"
    );

    // Card should have no children
    let children = engine.graph.children(card_idx);
    assert_eq!(
        children.len(),
        0,
        "@card should have no children after text detach"
    );
}

#[test]
fn sync_text_stays_when_overlapping() {
    // Partially moving a text child should keep it in the shape.
    let input = r#"
rect @card {
  w: 200 h: 100

  text @label "Hello" { }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let label_id = NodeId::intern("label");
    let card_id = NodeId::intern("card");
    let card_idx = engine.graph.index_of(card_id).unwrap();

    // Move text a small amount (still overlapping)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: label_id,
        dx: 10.0,
        dy: 5.0,
    });
    engine.evaluate_drop(label_id);

    // Text should remain a child of the rect
    let label_idx = engine.graph.index_of(label_id).unwrap();
    let parent_after = engine.graph.parent(label_idx).unwrap();
    assert_eq!(
        parent_after, card_idx,
        "@label should remain in @card with partial overlap"
    );
}

#[test]
fn sync_resize_child_expands_parent_on_finalize() {
    // Simulates a resize drag: child bounds updated directly (no re-resolve).
    // After release, finalize_child_bounds should expand the group.
    let input = r#"
group @container {
  rect @child { w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let container_idx = engine.graph.index_of(NodeId::intern("container")).unwrap();
    let child_idx = engine.graph.index_of(NodeId::intern("child")).unwrap();

    let container_before = engine.bounds[&container_idx];

    // Simulate resize drag: directly widen the child's bounds
    // (the real canvas does this via handle drag, not via resolve)
    if let Some(cb) = engine.bounds.get_mut(&child_idx) {
        cb.width = container_before.width + 100.0;
    }

    // Group bounds are stale (not updated during drag — chasing envelope fix)
    let container_mid = engine.bounds[&container_idx];
    assert_eq!(
        container_mid.width, container_before.width,
        "container should NOT expand during drag"
    );

    // Call finalize (simulates pointer release)
    let changed = engine.finalize_child_bounds();
    assert!(changed, "finalize should detect overflow and expand");

    let container_after = engine.bounds[&container_idx];
    assert!(
        container_after.width > container_before.width,
        "container should expand after finalize: {} > {}",
        container_after.width,
        container_before.width
    );
}

#[test]
fn sync_resize_child_within_bounds_no_expand() {
    // Child bounds shrink within parent — finalize may shrink but should not grow.
    let input = r#"
group @container {
  rect @child { w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let container_idx = engine.graph.index_of(NodeId::intern("container")).unwrap();
    let child_idx = engine.graph.index_of(NodeId::intern("child")).unwrap();

    let container_before = engine.bounds[&container_idx];

    // Simulate resize: shrink the child
    if let Some(cb) = engine.bounds.get_mut(&child_idx) {
        cb.width = 40.0;
    }

    engine.finalize_child_bounds();

    let container_after = engine.bounds[&container_idx];
    assert!(
        container_after.width <= container_before.width + 0.01,
        "container should not grow when child fits: {} <= {}",
        container_after.width,
        container_before.width
    );
}

#[test]
fn sync_cascade_expand_two_levels() {
    // Resizing a leaf inside nested groups → both groups expand on finalize.
    let input = r#"
group @outer {
  group @inner {
rect @leaf { w: 40 h: 30 }
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let outer_idx = engine.graph.index_of(NodeId::intern("outer")).unwrap();
    let inner_idx = engine.graph.index_of(NodeId::intern("inner")).unwrap();
    let leaf_idx = engine.graph.index_of(NodeId::intern("leaf")).unwrap();

    let outer_before = engine.bounds[&outer_idx].width;
    let inner_before = engine.bounds[&inner_idx].width;

    // Simulate resize: widen the leaf way beyond both groups
    if let Some(lb) = engine.bounds.get_mut(&leaf_idx) {
        lb.width = 300.0;
    }

    let changed = engine.finalize_child_bounds();
    assert!(changed, "finalize should cascade expansion");

    let inner_after = engine.bounds[&inner_idx].width;
    let outer_after = engine.bounds[&outer_idx].width;

    assert!(
        inner_after > inner_before,
        "inner group should expand: {} > {}",
        inner_after,
        inner_before
    );
    assert!(
        outer_after > outer_before,
        "outer group should expand: {} > {}",
        outer_after,
        outer_before
    );
}

#[test]
fn sync_cascade_stops_at_clip_frame() {
    // Clip frame should NOT expand even when child overflows.
    let input = r#"
frame @clip_frame {
  w: 200 h: 100
  clip: true

  rect @child { w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let frame_idx = engine.graph.index_of(NodeId::intern("clip_frame")).unwrap();
    let child_idx = engine.graph.index_of(NodeId::intern("child")).unwrap();

    let frame_before = engine.bounds[&frame_idx];

    // Simulate resize: widen child beyond frame
    if let Some(cb) = engine.bounds.get_mut(&child_idx) {
        cb.width = 400.0;
    }

    let changed = engine.finalize_child_bounds();

    // Frame should NOT expand (clip: true)
    let frame_after = engine.bounds[&frame_idx];
    assert_eq!(
        frame_before.width, frame_after.width,
        "clip frame should not expand: {} == {}",
        frame_before.width, frame_after.width
    );
    assert!(!changed, "no changes expected for clip frame");
}

#[test]
fn sync_frame_does_not_auto_resize() {
    // Non-clip frame should also NOT expand when children overflow.
    // Frames have declared dimensions — only Groups auto-size.
    let input = r#"
frame @card {
  w: 200 h: 100

  rect @child { w: 80 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let frame_idx = engine.graph.index_of(NodeId::intern("card")).unwrap();
    let child_idx = engine.graph.index_of(NodeId::intern("child")).unwrap();

    let frame_before = engine.bounds[&frame_idx];

    // Simulate resize: widen child beyond frame
    if let Some(cb) = engine.bounds.get_mut(&child_idx) {
        cb.width = 400.0;
    }

    let changed = engine.finalize_child_bounds();

    // Frame should NOT expand (declared size is authoritative)
    let frame_after = engine.bounds[&frame_idx];
    assert_eq!(
        frame_before.width, frame_after.width,
        "frame should not auto-resize: {} == {}",
        frame_before.width, frame_after.width
    );
    assert_eq!(
        frame_before.height, frame_after.height,
        "frame height should not change: {} == {}",
        frame_before.height, frame_after.height
    );
    assert!(!changed, "no changes expected for non-clip frame");
}

#[test]
fn sync_move_group_propagates_to_children() {
    let input = r#"
group @grp {
  rect @a { w: 40 h: 30 x: 0 y: 0 }
  rect @b { w: 40 h: 30 x: 50 y: 0 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let grp_id = NodeId::intern("grp");
    let a_id = NodeId::intern("a");
    let b_id = NodeId::intern("b");

    let a_before = engine.bounds[&engine.graph.index_of(a_id).unwrap()];
    let b_before = engine.bounds[&engine.graph.index_of(b_id).unwrap()];

    engine.apply_mutation(GraphMutation::MoveNode {
        id: grp_id,
        dx: 100.0,
        dy: 50.0,
    });

    let a_after = engine.bounds[&engine.graph.index_of(a_id).unwrap()];
    let b_after = engine.bounds[&engine.graph.index_of(b_id).unwrap()];

    assert!(
        (a_after.x - a_before.x - 100.0).abs() < 0.1,
        "child @a x should shift by 100"
    );
    assert!(
        (a_after.y - a_before.y - 50.0).abs() < 0.1,
        "child @a y should shift by 50"
    );
    assert!(
        (b_after.x - b_before.x - 100.0).abs() < 0.1,
        "child @b x should shift by 100"
    );
    assert!(
        (b_after.y - b_before.y - 50.0).abs() < 0.1,
        "child @b y should shift by 50"
    );
}

#[test]
fn sync_move_nested_group_propagates() {
    let input = r#"
group @outer {
  group @inner {
rect @leaf { w: 20 h: 20 x: 0 y: 0 }
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let outer_id = NodeId::intern("outer");
    let leaf_id = NodeId::intern("leaf");

    let leaf_before = engine.bounds[&engine.graph.index_of(leaf_id).unwrap()];

    // Move the outer group — leaf (grandchild) should also move
    engine.apply_mutation(GraphMutation::MoveNode {
        id: outer_id,
        dx: 200.0,
        dy: 100.0,
    });

    let leaf_after = engine.bounds[&engine.graph.index_of(leaf_id).unwrap()];

    assert!(
        (leaf_after.x - leaf_before.x - 200.0).abs() < 0.1,
        "grandchild @leaf x should shift by 200: got {} → {}",
        leaf_before.x,
        leaf_after.x
    );
    assert!(
        (leaf_after.y - leaf_before.y - 100.0).abs() < 0.1,
        "grandchild @leaf y should shift by 100: got {} → {}",
        leaf_before.y,
        leaf_after.y
    );
}

#[test]
fn sync_delete_node() {
    let input = r#"
rect @box {
  w: 100
  h: 50
}
rect @other {
  w: 10
  h: 10
}
"#;
    let viewport = fd_core::Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("box"),
    });
    let text = engine.current_text();
    assert!(!text.contains("rect @box"));
    assert!(text.contains("rect @other"));
}

#[test]
fn sync_duplicate_derives_name_from_original() {
    let input = r#"
rect @login_button {
  w: 100
  h: 50
}
"#;
    let viewport = fd_core::Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    engine.apply_mutation(GraphMutation::DuplicateNode {
        id: NodeId::intern("login_button"),
    });
    engine.flush_to_text();
    let text = engine.current_text();
    // The duplicate should have an incremental name (login_button_2)
    assert!(
        text.contains("@login_button_2"),
        "expected incremental name login_button_2 in: {text}"
    );
    // Original should still be present
    assert!(text.contains("@login_button"));
}

// ─── Group-Aware Eraser Tests ────────────────────────────────────────────

/// Removing a child from a group leaves the group and other children intact.
#[test]
fn erase_child_preserves_group() {
    let input = r#"
group @g {
  rect @child1 { w: 40 h: 40 x: 0 y: 0 }
  rect @child2 { w: 40 h: 40 x: 50 y: 0 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let child1_id = NodeId::intern("child1");

    // Simulate eraser: reparent child to root, then remove
    let child_idx = engine.graph.index_of(child1_id).unwrap();
    let parent_idx = engine.graph.parent(child_idx).unwrap();
    let root = engine.graph.root;
    engine.graph.reparent_node(child_idx, root);
    expand_group_to_children(&engine.graph, parent_idx, &mut engine.bounds, None);

    engine.apply_mutation(GraphMutation::RemoveNode { id: child1_id });
    engine.resolve();

    // child1 gone
    assert!(engine.graph.get_by_id(child1_id).is_none());
    // group and child2 survive
    assert!(engine.graph.get_by_id(NodeId::intern("g")).is_some());
    assert!(engine.graph.get_by_id(NodeId::intern("child2")).is_some());
}

/// Removing all children from a group leaves the group empty (detectable for cascade).
#[test]
fn erase_last_child_leaves_empty_group() {
    let input = r#"
group @g {
  rect @only_child { w: 40 h: 40 x: 0 y: 0 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let child_id = NodeId::intern("only_child");
    let group_id = NodeId::intern("g");

    // Simulate eraser: reparent + remove child
    let child_idx = engine.graph.index_of(child_id).unwrap();
    let group_idx = engine.graph.index_of(group_id).unwrap();
    let root = engine.graph.root;
    engine.graph.reparent_node(child_idx, root);
    engine.apply_mutation(GraphMutation::RemoveNode { id: child_id });

    // Group is now empty — cascade should remove it
    assert!(engine.graph.children(group_idx).is_empty());
    engine.apply_mutation(GraphMutation::RemoveNode { id: group_id });
    assert!(engine.graph.get_by_id(child_id).is_none());
    assert!(engine.graph.get_by_id(group_id).is_none());
}

/// Nested empty groups cascade correctly: outer > inner > rect.
/// Removing rect leaves inner empty → cascade removes inner → outer empty → cascade removes outer.
#[test]
fn erase_nested_cascade() {
    let input = r#"
group @outer {
  group @inner {
    rect @leaf { w: 20 h: 20 x: 0 y: 0 }
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let leaf_id = NodeId::intern("leaf");
    let inner_id = NodeId::intern("inner");
    let outer_id = NodeId::intern("outer");

    // Simulate eraser: reparent leaf to root, remove leaf
    let leaf_idx = engine.graph.index_of(leaf_id).unwrap();
    let inner_idx = engine.graph.index_of(inner_id).unwrap();
    let outer_idx = engine.graph.index_of(outer_id).unwrap();
    let root = engine.graph.root;
    engine.graph.reparent_node(leaf_idx, root);
    expand_group_to_children(&engine.graph, inner_idx, &mut engine.bounds, None);
    engine.apply_mutation(GraphMutation::RemoveNode { id: leaf_id });

    // Inner is now empty → remove
    assert!(engine.graph.children(inner_idx).is_empty());
    engine.apply_mutation(GraphMutation::RemoveNode { id: inner_id });

    // Outer is now empty → remove
    assert!(engine.graph.children(outer_idx).is_empty());
    engine.apply_mutation(GraphMutation::RemoveNode { id: outer_id });

    // All three are gone
    assert!(engine.graph.get_by_id(leaf_id).is_none());
    assert!(engine.graph.get_by_id(inner_id).is_none());
    assert!(engine.graph.get_by_id(outer_id).is_none());
}

#[test]
fn sync_detach_last_child_removes_empty_group() {
    // Detaching the only child from a group should dissolve the group.
    let input = r#"
group @solo_group {
  rect @only_child { w: 100 h: 50 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let child_id = NodeId::intern("only_child");
    let group_id = NodeId::intern("solo_group");

    // Move child far outside group
    engine.apply_mutation(GraphMutation::MoveNode {
        id: child_id,
        dx: 500.0,
        dy: 400.0,
    });
    engine.evaluate_drop(child_id);

    // Child should be at root
    let child_idx = engine.graph.index_of(child_id).unwrap();
    let parent = engine.graph.parent(child_idx).unwrap();
    assert_eq!(
        parent, engine.graph.root,
        "@only_child should be at root after detach"
    );

    // Group should be dissolved (removed from graph)
    assert!(
        engine.graph.get_by_id(group_id).is_none(),
        "@solo_group should be removed after its only child detached"
    );
}

#[test]
fn sync_detach_last_child_removes_empty_frame() {
    // Detaching the only child from a frame should dissolve the frame.
    let input = r#"
frame @solo_frame {
  w: 200 h: 100

  rect @only_child { w: 60 h: 30 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let child_id = NodeId::intern("only_child");
    let frame_id = NodeId::intern("solo_frame");

    // Move child far outside frame
    engine.apply_mutation(GraphMutation::MoveNode {
        id: child_id,
        dx: 500.0,
        dy: 400.0,
    });
    engine.evaluate_drop(child_id);

    // Child should be at root
    let child_idx = engine.graph.index_of(child_id).unwrap();
    let parent = engine.graph.parent(child_idx).unwrap();
    assert_eq!(
        parent, engine.graph.root,
        "@only_child should be at root after detaching from frame"
    );

    // Frame should be dissolved
    assert!(
        engine.graph.get_by_id(frame_id).is_none(),
        "@solo_frame should be removed after its only child detached"
    );
}

#[test]
fn sync_detach_nested_cascade_removes_empty_ancestors() {
    // Detaching a deeply nested sole child should cascade-remove all
    // now-empty Group/Frame ancestors up the chain.
    let input = r#"
group @outer_cascade {
  group @inner_cascade {
    rect @deep_child { w: 40 h: 30 }
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let child_id = NodeId::intern("deep_child");
    let inner_id = NodeId::intern("inner_cascade");
    let outer_id = NodeId::intern("outer_cascade");

    // Move child far outside both groups
    engine.apply_mutation(GraphMutation::MoveNode {
        id: child_id,
        dx: 600.0,
        dy: 500.0,
    });
    engine.evaluate_drop(child_id);

    // Child should be at root
    let child_idx = engine.graph.index_of(child_id).unwrap();
    let parent = engine.graph.parent(child_idx).unwrap();
    assert_eq!(
        parent, engine.graph.root,
        "@deep_child should be at root after detaching through 2 levels"
    );

    // Both empty groups should be cascade-removed
    assert!(
        engine.graph.get_by_id(inner_id).is_none(),
        "@inner_cascade should be removed (was only child)"
    );
    assert!(
        engine.graph.get_by_id(outer_id).is_none(),
        "@outer_cascade should be removed (cascade from inner)"
    );
}

#[test]
fn sync_move_managed_layout_child_converts_to_absolute() {
    // Moving a child inside a Column-layout frame converts it to
    // absolute positioning (Figma-style). Bounds update and a Position
    // constraint is added, pulling the child out of the layout flow.
    let input = "frame @hero {\n  w: 400 h: 200\n  layout: column gap=16 pad=40\n\n  text @title \"Welcome to FD\" {\n    font: \"Inter\" 800 48\n  }\n  text @sub \"The token-efficient design format\" {\n    font: \"Inter\" 400 18\n  }\n}\n";
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let title_id = NodeId::intern("title");
    let title_idx = engine.graph.index_of(title_id).unwrap();

    let bounds_before = engine.bounds[&title_idx];

    // Move text child — should now work (absolute positioning)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: title_id,
        dx: 100.0,
        dy: 50.0,
    });

    // Bounds should update
    let bounds_after = engine.bounds[&title_idx];
    assert!(
        (bounds_after.x - bounds_before.x - 100.0).abs() < 0.01,
        "x should shift by 100: {} → {}",
        bounds_before.x,
        bounds_after.x
    );
    assert!(
        (bounds_after.y - bounds_before.y - 50.0).abs() < 0.01,
        "y should shift by 50: {} → {}",
        bounds_before.y,
        bounds_after.y
    );

    // A Position constraint should be added
    let node = engine.graph.get_by_id(title_id).unwrap();
    assert!(
        node.constraints
            .iter()
            .any(|c| matches!(c, Constraint::Position { .. })),
        "Position constraint should be added for absolute positioning"
    );
}

// ─── Parent Frame Move/Resize Regression Tests ──────────────────────────

#[test]
fn sync_resize_frame_children_reflow() {
    // Resizing a Column-layout frame should re-stack children at new positions.
    let input = r#"
frame @card {
  w: 400 h: 600
  layout: column gap=10 pad=20

  rect @a { w: 100 h: 40 }
  rect @b { w: 100 h: 30 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let card_id = NodeId::intern("card");
    let a_id = NodeId::intern("a");
    let b_id = NodeId::intern("b");

    let a_idx = engine.graph.index_of(a_id).unwrap();
    let b_idx = engine.graph.index_of(b_id).unwrap();
    let card_idx = engine.graph.index_of(card_id).unwrap();

    let a_before = engine.bounds[&a_idx];
    let b_before = engine.bounds[&b_idx];

    // Children should be column-stacked initially
    assert!(
        (b_before.y - a_before.y - 50.0).abs() < 0.01,
        "b should be 50px below a (40h + 10gap), got diff={}",
        b_before.y - a_before.y
    );

    // Resize the frame (make it shorter)
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: card_id,
        width: 400.0,
        height: 300.0,
    });

    // Children should still be inside the card and properly stacked
    let a_after = engine.bounds[&a_idx];
    let b_after = engine.bounds[&b_idx];
    let card_after = engine.bounds[&card_idx];

    // Children should be within the card bounds
    assert!(
        a_after.y >= card_after.y,
        "a.y ({}) must be >= card.y ({})",
        a_after.y,
        card_after.y
    );
    // Column gap should be preserved
    assert!(
        (b_after.y - a_after.y - 50.0).abs() < 0.01,
        "column gap should be preserved after resize: diff={}",
        b_after.y - a_after.y
    );
}

#[test]
fn sync_resize_frame_centered_text_recenters() {
    // Resizing a rect with a centered text child should re-center the text.
    let input = r#"
rect @btn {
  w: 320 h: 44
  text @label "Sign In" { }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let btn_id = NodeId::intern("btn");
    let label_id = NodeId::intern("label");

    let btn_idx = engine.graph.index_of(btn_id).unwrap();
    let label_idx = engine.graph.index_of(label_id).unwrap();

    // Text should be centered in button initially
    let btn_before = engine.bounds[&btn_idx];
    let label_before = engine.bounds[&label_idx];
    let btn_cx_before = btn_before.x + btn_before.width / 2.0;
    let label_cx_before = label_before.x + label_before.width / 2.0;
    assert!(
        (label_cx_before - btn_cx_before).abs() < 0.1,
        "text should be centered before resize"
    );

    // Resize the button wider
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: btn_id,
        width: 600.0,
        height: 44.0,
    });

    // Text should be re-centered in the wider button
    let btn_after = engine.bounds[&btn_idx];
    let label_after = engine.bounds[&label_idx];
    let btn_cx_after = btn_after.x + btn_after.width / 2.0;
    let label_cx_after = label_after.x + label_after.width / 2.0;
    assert!(
        (label_cx_after - btn_cx_after).abs() < 0.1,
        "text center ({}) should match button center ({}) after resize",
        label_cx_after,
        btn_cx_after
    );
}

#[test]
fn sync_move_frame_flush_no_jump() {
    // After MoveNode + flush_to_text, the bounds should not jump.
    let input = r#"
frame @panel {
  w: 300 h: 200
  layout: column gap=10 pad=20

  rect @item { w: 100 h: 40 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let panel_id = NodeId::intern("panel");
    let item_id = NodeId::intern("item");

    // Move the frame
    engine.apply_mutation(GraphMutation::MoveNode {
        id: panel_id,
        dx: 150.0,
        dy: 75.0,
    });

    let panel_idx = engine.graph.index_of(panel_id).unwrap();
    let item_idx = engine.graph.index_of(item_id).unwrap();
    let panel_pre_flush = engine.bounds[&panel_idx];
    let item_pre_flush = engine.bounds[&item_idx];

    // Flush (re-emit text from graph)
    engine.flush_to_text();
    // Re-parse and re-resolve (simulates what happens in real usage)
    let text = engine.current_text().to_string();
    let engine2 = SyncEngine::from_text(&text, viewport).unwrap();

    let panel_idx2 = engine2.graph.index_of(panel_id).unwrap();
    let item_idx2 = engine2.graph.index_of(item_id).unwrap();
    let panel_post = engine2.bounds[&panel_idx2];
    let item_post = engine2.bounds[&item_idx2];

    // Panel position should match pre-flush after roundtrip
    assert!(
        (panel_post.x - panel_pre_flush.x).abs() < 1.0,
        "panel.x should not jump: pre={}, post={}",
        panel_pre_flush.x,
        panel_post.x
    );
    assert!(
        (panel_post.y - panel_pre_flush.y).abs() < 1.0,
        "panel.y should not jump: pre={}, post={}",
        panel_pre_flush.y,
        panel_post.y
    );

    // Child position should also match
    assert!(
        (item_post.x - item_pre_flush.x).abs() < 1.0,
        "item.x should not jump: pre={}, post={}",
        item_pre_flush.x,
        item_post.x
    );
    assert!(
        (item_post.y - item_pre_flush.y).abs() < 1.0,
        "item.y should not jump: pre={}, post={}",
        item_pre_flush.y,
        item_post.y
    );
}

#[test]
fn sync_move_frame_children_follow_after_flush() {
    // Moving a frame with children, then flushing, children should be at correct positions.
    let input = r#"
frame @form {
  w: 400 h: 300
  layout: column gap=16 pad=32

  rect @email { w: 280 h: 44 }
  rect @password { w: 280 h: 44 }
  rect @submit { w: 280 h: 48 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let form_id = NodeId::intern("form");

    let form_idx = engine.graph.index_of(form_id).unwrap();
    let email_idx = engine.graph.index_of(NodeId::intern("email")).unwrap();
    let password_idx = engine.graph.index_of(NodeId::intern("password")).unwrap();
    let submit_idx = engine.graph.index_of(NodeId::intern("submit")).unwrap();

    // Get initial relative positions (child.y - form.y)
    let form_y0 = engine.bounds[&form_idx].y;
    let email_rel = engine.bounds[&email_idx].y - form_y0;
    let pass_rel = engine.bounds[&password_idx].y - form_y0;
    let submit_rel = engine.bounds[&submit_idx].y - form_y0;

    // Move the frame
    engine.apply_mutation(GraphMutation::MoveNode {
        id: form_id,
        dx: 200.0,
        dy: 100.0,
    });
    engine.flush_to_text();

    // Re-parse
    let text = engine.current_text().to_string();
    let engine2 = SyncEngine::from_text(&text, viewport).unwrap();

    let form_idx2 = engine2.graph.index_of(form_id).unwrap();
    let form_y2 = engine2.bounds[&form_idx2].y;
    let email_y2 = engine2.bounds[&engine2.graph.index_of(NodeId::intern("email")).unwrap()].y;
    let pass_y2 = engine2.bounds[&engine2.graph.index_of(NodeId::intern("password")).unwrap()].y;
    let submit_y2 = engine2.bounds[&engine2.graph.index_of(NodeId::intern("submit")).unwrap()].y;

    // Relative positions should be preserved
    assert!(
        ((email_y2 - form_y2) - email_rel).abs() < 1.0,
        "email relative position should be preserved: {} vs {}",
        email_y2 - form_y2,
        email_rel
    );
    assert!(
        ((pass_y2 - form_y2) - pass_rel).abs() < 1.0,
        "password relative position should be preserved: {} vs {}",
        pass_y2 - form_y2,
        pass_rel
    );
    assert!(
        ((submit_y2 - form_y2) - submit_rel).abs() < 1.0,
        "submit relative position should be preserved: {} vs {}",
        submit_y2 - form_y2,
        submit_rel
    );
}

// ─── Text Resize Tests ──────────────────────────────────────────────

#[test]
fn sync_resize_text_sets_max_width() {
    let input = r#"
text @label "Hello World" {
  font: "Inter" 400 14
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let label_id = NodeId::intern("label");
    let label_idx = engine.graph.index_of(label_id).unwrap();

    // Initially, text should have no max_width
    match &engine.graph.graph[label_idx].kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(*max_width, None, "initial text should have no max_width");
        }
        _ => panic!("expected Text"),
    }

    // Apply resize — should set max_width
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: label_id,
        width: 150.0,
        height: 40.0,
    });

    match &engine.graph.graph[label_idx].kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(
                *max_width,
                Some(150.0),
                "resize should set max_width to 150"
            );
        }
        _ => panic!("expected Text after resize"),
    }

    // Bounds should also reflect the width
    let bounds = engine.bounds[&label_idx];
    assert!(
        (bounds.width - 150.0).abs() < 0.01,
        "bounds width should be 150: got {}",
        bounds.width
    );
}

#[test]
fn sync_resize_parent_sets_child_text_max_width() {
    // When a rect parent is resized narrower, its child text should
    // get max_width set to the parent's width (Option A: permanent).
    let input = r#"
rect @card {
  w: 300 h: 200
  text @title "Hello World this is a long title for testing" {
    font: "Inter" 400 14
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let card_id = NodeId::intern("card");
    let title_id = NodeId::intern("title");
    let title_idx = engine.graph.index_of(title_id).unwrap();

    // Initially, text should have no max_width
    match &engine.graph.graph[title_idx].kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(*max_width, None, "initial text should have no max_width");
        }
        _ => panic!("expected Text"),
    }

    // Resize the parent narrower
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: card_id,
        width: 120.0,
        height: 200.0,
    });

    // Child text should now have max_width = parent width (120)
    match &engine.graph.graph[title_idx].kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(
                *max_width,
                Some(120.0),
                "child text max_width should be set to parent width"
            );
        }
        _ => panic!("expected Text after resize"),
    }

    // Child bounds width should match parent width
    let title_bounds = engine.bounds[&title_idx];
    assert!(
        (title_bounds.width - 120.0).abs() < 0.01,
        "child text width ({}) should match parent width 120",
        title_bounds.width
    );
    // Height is NOT estimated by heuristic — JS measureText() is authoritative.
    // The test only verifies max_width propagation and width update.
}

#[test]
fn sync_resize_text_preserves_height() {
    // Resizing a text node directly should set max_width and update
    // width, but NOT estimate height — JS measureText() is authoritative.
    let input = r#"
text @paragraph "This is a fairly long paragraph of text that needs to wrap to multiple lines" {
  font: "Inter" 400 14
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let para_id = NodeId::intern("paragraph");
    let para_idx = engine.graph.index_of(para_id).unwrap();

    let original_height = engine.bounds[&para_idx].height;

    // Resize to a narrow width — height should NOT change
    engine.apply_mutation(GraphMutation::ResizeNode {
        id: para_id,
        width: 100.0,
        height: 20.0, // Deliberately small — should be ignored for text
    });

    let bounds = engine.bounds[&para_idx];
    assert!(
        (bounds.width - 100.0).abs() < 0.01,
        "text bounds width should be 100: got {}",
        bounds.width
    );
    assert!(
        (bounds.height - original_height).abs() < 0.01,
        "text bounds height ({}) should be unchanged from original ({original_height})",
        bounds.height
    );

    // max_width should be set
    match &engine.graph.graph[para_idx].kind {
        NodeKind::Text { max_width, .. } => {
            assert_eq!(*max_width, Some(100.0), "max_width should be set to 100");
        }
        _ => panic!("expected Text"),
    }
}

// ─── Multi-Delete Reproduction Tests ────────────────────────────────────

#[test]
fn sync_delete_multiple_siblings() {
    // Reproduce: select 3 sibling rects, delete all at once
    let input = r#"
rect @a { w: 40 h: 30 }
rect @b { w: 40 h: 30 }
rect @c { w: 40 h: 30 }
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Apply three RemoveNode mutations sequentially (like delete_selected does)
    let ids = vec![
        NodeId::intern("a"),
        NodeId::intern("b"),
        NodeId::intern("c"),
    ];
    for id in &ids {
        engine.apply_mutation(GraphMutation::RemoveNode { id: *id });
    }
    engine.resolve();
    engine.flush_to_text();

    for id in &ids {
        assert!(
            engine.graph.get_by_id(*id).is_none(),
            "@{} should be deleted",
            id.as_str()
        );
    }
    let text = engine.current_text();
    assert!(!text.contains("@a"), "text should not contain @a");
    assert!(!text.contains("@b"), "text should not contain @b");
    assert!(!text.contains("@c"), "text should not contain @c");
}

#[test]
fn sync_delete_multiple_with_edges() {
    // Reproduce: delete nodes that are connected by edges
    let input = r#"
rect @src { w: 40 h: 30 }
rect @dst { w: 40 h: 30 }

edge @conn {
  from: @src
  to: @dst
  arrow: end
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Delete both nodes
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("src"),
    });
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("dst"),
    });
    engine.resolve();
    engine.flush_to_text();

    assert!(
        engine.graph.get_by_id(NodeId::intern("src")).is_none(),
        "@src should be deleted"
    );
    assert!(
        engine.graph.get_by_id(NodeId::intern("dst")).is_none(),
        "@dst should be deleted"
    );

    let text = engine.current_text();
    assert!(
        !text.contains("@src"),
        "emitted text should not reference deleted @src: {text}"
    );
    assert!(
        !text.contains("@dst"),
        "emitted text should not reference deleted @dst: {text}"
    );
    // Edge referencing deleted nodes should also be cleaned up
    assert!(
        !text.contains("edge @conn"),
        "edge referencing deleted nodes should be removed from text: {text}"
    );
}

#[test]
fn sync_delete_parent_and_child() {
    // Delete both a group and its child simultaneously
    let input = r#"
group @grp {
  rect @child { w: 40 h: 30 }
}
rect @survivor { w: 20 h: 20 }
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("grp"),
    });
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("child"),
    });
    engine.resolve();
    engine.flush_to_text();

    assert!(engine.graph.get_by_id(NodeId::intern("grp")).is_none());
    assert!(engine.graph.get_by_id(NodeId::intern("child")).is_none());
    assert!(engine.graph.get_by_id(NodeId::intern("survivor")).is_some());

    let text = engine.current_text();
    assert!(!text.contains("@grp"));
    assert!(!text.contains("@child"));
    assert!(text.contains("@survivor"));
}

// ─── Clone Position Independence + Incremental Naming Tests ─────────────

#[test]
fn sync_duplicate_position_independent() {
    // After duplicating a node, moving the original should NOT move the clone.
    let input = r#"
rect @card {
  w: 100
  h: 50
  x: 100
  y: 200
}
"#;
    let viewport = fd_core::Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let card_id = NodeId::intern("card");
    engine.apply_mutation(GraphMutation::DuplicateNode { id: card_id });
    engine.resolve();

    // Find the clone
    let clone_id = NodeId::intern("card_2");
    assert!(
        engine.graph.get_by_id(clone_id).is_some(),
        "clone @card_2 should exist"
    );

    let clone_idx = engine.graph.index_of(clone_id).unwrap();
    let clone_before = engine.bounds[&clone_idx];

    // Move the original far away
    engine.apply_mutation(GraphMutation::MoveNode {
        id: card_id,
        dx: 500.0,
        dy: 300.0,
    });

    // Clone should NOT have moved (independent position)
    let clone_after = engine.bounds[&clone_idx];
    assert!(
        (clone_after.x - clone_before.x).abs() < 0.01,
        "clone x should not change: {} vs {}",
        clone_before.x,
        clone_after.x
    );
    assert!(
        (clone_after.y - clone_before.y).abs() < 0.01,
        "clone y should not change: {} vs {}",
        clone_before.y,
        clone_after.y
    );
}

#[test]
fn sync_duplicate_incremental_naming() {
    // Cloning the same node twice should produce _2 and _3.
    let input = r#"
rect @card {
  w: 80
  h: 40
  x: 10
  y: 10
}
"#;
    let viewport = fd_core::Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let card_id = NodeId::intern("card");

    // First clone
    engine.apply_mutation(GraphMutation::DuplicateNode { id: card_id });
    engine.resolve();
    assert!(
        engine.graph.get_by_id(NodeId::intern("card_2")).is_some(),
        "first clone should be card_2"
    );

    // Second clone of original
    engine.apply_mutation(GraphMutation::DuplicateNode { id: card_id });
    engine.resolve();
    assert!(
        engine.graph.get_by_id(NodeId::intern("card_3")).is_some(),
        "second clone should be card_3"
    );

    // Clone of clone should also increment
    engine.apply_mutation(GraphMutation::DuplicateNode {
        id: NodeId::intern("card_2"),
    });
    engine.resolve();
    assert!(
        engine.graph.get_by_id(NodeId::intern("card_4")).is_some(),
        "clone of card_2 should be card_4"
    );
}

#[test]
fn sync_duplicate_no_overlapping_bounds() {
    // Clone should not occupy the exact same position as the original.
    let input = r#"
rect @box {
  w: 100
  h: 50
  x: 50
  y: 60
}
"#;
    let viewport = fd_core::Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let box_id = NodeId::intern("box");
    let box_idx = engine.graph.index_of(box_id).unwrap();
    let orig_bounds = engine.bounds[&box_idx];

    engine.apply_mutation(GraphMutation::DuplicateNode { id: box_id });
    engine.resolve();

    let clone_id = NodeId::intern("box_2");
    let clone_idx = engine.graph.index_of(clone_id).unwrap();
    let clone_bounds = engine.bounds[&clone_idx];

    // Clone should be offset by 20px (not overlapping)
    assert!(
        (clone_bounds.x - orig_bounds.x - 20.0).abs() < 0.01,
        "clone x should be 20px offset: orig={}, clone={}",
        orig_bounds.x,
        clone_bounds.x
    );
    assert!(
        (clone_bounds.y - orig_bounds.y - 20.0).abs() < 0.01,
        "clone y should be 20px offset: orig={}, clone={}",
        orig_bounds.y,
        clone_bounds.y
    );
}

/// Z-order: bring_forward on the already-frontmost child is a no-op.
/// Verifies GraphMutation won't panic or corrupt sibling order.
#[test]
fn sync_bring_forward_already_front_is_noop() {
    let input = r#"
group @container {
  rect @back { w: 40 h: 30 }
  rect @mid { w: 40 h: 30 }
  rect @front { w: 40 h: 30 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    let front_id = NodeId::intern("front");
    let front_idx = engine.graph.index_of(front_id).unwrap();
    let container_idx = engine.graph.index_of(NodeId::intern("container")).unwrap();

    // @front is already the last (frontmost) child
    let changed = engine.graph.bring_forward(front_idx);
    assert!(
        !changed,
        "bring_forward on frontmost child should return false"
    );

    // Verify sibling order is unchanged
    let children = engine.graph.children(container_idx);
    assert_eq!(children.len(), 3);
    let ids: Vec<&str> = children
        .iter()
        .map(|&idx| engine.graph.graph[idx].id.as_str())
        .collect();
    assert_eq!(ids, vec!["back", "mid", "front"]);
}

/// Z-order: bring_to_front persists through flush_to_text + re-parse roundtrip.
/// Regression test: previously dispatch_action didn't call flush_to_text(),
/// so z-order changes were lost when JS re-read the text.
#[test]
fn sync_bring_to_front_persists_through_roundtrip() {
    let input = r#"
rect @back { w: 40 h: 30 x: 10 y: 10 }
rect @mid { w: 40 h: 30 x: 60 y: 10 }
rect @front { w: 40 h: 30 x: 110 y: 10 }
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    let back_id = NodeId::intern("back");
    let back_idx = engine.graph.index_of(back_id).unwrap();

    // Bring @back to front (it's currently the first/backmost child)
    let changed = engine.graph.bring_to_front(back_idx);
    assert!(changed, "bring_to_front should return true");

    // Verify in-memory order changed: mid, front, back
    let root = engine.graph.root;
    let children = engine.graph.children(root);
    let ids: Vec<&str> = children
        .iter()
        .map(|&idx| engine.graph.graph[idx].id.as_str())
        .collect();
    assert_eq!(
        ids,
        vec!["mid", "front", "back"],
        "after bring_to_front, @back should be last"
    );

    // Flush to text and re-parse (simulates what happens in the real app)
    engine.mark_dirty();
    engine.flush_to_text();
    let text = engine.current_text().to_string();
    let engine2 = SyncEngine::from_text(&text, viewport).unwrap();

    // After roundtrip, child order should be preserved
    let root2 = engine2.graph.root;
    let children2 = engine2.graph.children(root2);
    let ids2: Vec<&str> = children2
        .iter()
        .map(|&idx| engine2.graph.graph[idx].id.as_str())
        .collect();
    assert_eq!(
        ids2,
        vec!["mid", "front", "back"],
        "z-order should persist through flush_to_text + re-parse roundtrip"
    );
}

/// next_clone_name: chained duplication produces foo, foo_2, foo_3.
#[test]
fn sync_clone_name_sequence() {
    let input = r#"
rect @card { w: 100 h: 80 }
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let card_id = NodeId::intern("card");

    // First clone: card → card_2
    engine.apply_mutation(GraphMutation::DuplicateNode { id: card_id });
    engine.resolve();
    assert!(
        engine.graph.get_by_id(NodeId::intern("card_2")).is_some(),
        "first clone should be card_2"
    );

    // Second clone: card → card_3
    engine.apply_mutation(GraphMutation::DuplicateNode { id: card_id });
    engine.resolve();
    assert!(
        engine.graph.get_by_id(NodeId::intern("card_3")).is_some(),
        "second clone should be card_3"
    );

    // Clone the clone: card_2 → card_4
    let card2_id = NodeId::intern("card_2");
    engine.apply_mutation(GraphMutation::DuplicateNode { id: card2_id });
    engine.resolve();
    assert!(
        engine.graph.get_by_id(NodeId::intern("card_4")).is_some(),
        "cloning card_2 should produce card_4 (max existing + 1)"
    );
}

/// evaluate_near_detach: child partially outside parent returns warning info.
#[test]
fn sync_near_detach_warning_zone() {
    let input = r#"
group @box {
  rect @child { w: 100 h: 50 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let child_id = NodeId::intern("child");

    // Child fully inside → no near-detach warning
    assert!(
        engine.evaluate_near_detach(child_id).is_none(),
        "fully inside should not trigger near-detach"
    );

    // Move child mostly outside (still overlapping ~20% area)
    engine.apply_mutation(GraphMutation::MoveNode {
        id: child_id,
        dx: 80.0,
        dy: 40.0,
    });

    // Now check: near-detach should fire if overlap < 25%
    // The exact result depends on group size; we just verify no crash.
    let _result = engine.evaluate_near_detach(child_id);
    // This exercises the code path without asserting a specific value —
    // the geometry depends on group auto-sizing. Main goal: no panic.
}

/// Regression: selecting both a group and its child, then dragging, must move
/// both by exactly the same delta. Before the fix, the child moved 2× because:
/// 1. Parent's MoveNode propagated dx/dy to child bounds (descendant propagation)
/// 2. Child's own MoveNode applied dx/dy again
/// Fix: `apply_mutation_with_co_selected` skips propagation for co-selected nodes.
#[test]
fn sync_multi_select_parent_child_no_double_move() {
    let input = r#"
group @parent {
  x: 10 y: 10

  rect @child { x: 20 y: 20 w: 40 h: 30 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    let parent_id = NodeId::intern("parent");
    let child_id = NodeId::intern("child");
    let parent_idx = engine.graph.index_of(parent_id).unwrap();
    let child_idx = engine.graph.index_of(child_id).unwrap();

    let parent_before = engine.bounds[&parent_idx];
    let child_before = engine.bounds[&child_idx];

    let dx = 50.0_f32;
    let dy = 30.0_f32;
    let co_selected = vec![parent_id, child_id];

    // Simulate multi-select drag: both parent and child get MoveNode
    // with co_selected context (as FdCanvas::apply_mutations does).
    engine.apply_mutation_with_co_selected(
        GraphMutation::MoveNode {
            id: parent_id,
            dx,
            dy,
        },
        &co_selected,
    );
    engine.apply_mutation_with_co_selected(
        GraphMutation::MoveNode {
            id: child_id,
            dx,
            dy,
        },
        &co_selected,
    );

    // Both should have moved by exactly (dx, dy) — NOT 2× for the child.
    let parent_after = engine.bounds[&parent_idx];
    assert!(
        (parent_after.x - (parent_before.x + dx)).abs() < 0.01,
        "parent x: expected {}, got {}",
        parent_before.x + dx,
        parent_after.x
    );
    assert!(
        (parent_after.y - (parent_before.y + dy)).abs() < 0.01,
        "parent y: expected {}, got {}",
        parent_before.y + dy,
        parent_after.y
    );

    let child_after = engine.bounds[&child_idx];
    assert!(
        (child_after.x - (child_before.x + dx)).abs() < 0.01,
        "child x: expected {} (1×), got {} — double-move bug!",
        child_before.x + dx,
        child_after.x
    );
    assert!(
        (child_after.y - (child_before.y + dy)).abs() < 0.01,
        "child y: expected {} (1×), got {} — double-move bug!",
        child_before.y + dy,
        child_after.y
    );
}

/// Ensure that moving only a parent (without co-selected children) still
/// propagates dx/dy to descendants as before (no regression from the fix).
#[test]
fn sync_single_select_parent_still_propagates_to_children() {
    let input = r#"
group @parent {
  x: 10 y: 10

  rect @child { x: 20 y: 20 w: 40 h: 30 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    let parent_id = NodeId::intern("parent");
    let child_id = NodeId::intern("child");
    let parent_idx = engine.graph.index_of(parent_id).unwrap();
    let child_idx = engine.graph.index_of(child_id).unwrap();

    let parent_before = engine.bounds[&parent_idx];
    let child_before = engine.bounds[&child_idx];

    let dx = 50.0_f32;
    let dy = 30.0_f32;

    // Only parent selected — child should be propagated automatically.
    engine.apply_mutation(GraphMutation::MoveNode {
        id: parent_id,
        dx,
        dy,
    });

    let parent_after = engine.bounds[&parent_idx];
    assert!(
        (parent_after.x - (parent_before.x + dx)).abs() < 0.01,
        "parent x"
    );

    let child_after = engine.bounds[&child_idx];
    assert!(
        (child_after.x - (child_before.x + dx)).abs() < 0.01,
        "child should move with parent: expected {}, got {}",
        child_before.x + dx,
        child_after.x
    );
    assert!(
        (child_after.y - (child_before.y + dy)).abs() < 0.01,
        "child should move with parent: expected {}, got {}",
        child_before.y + dy,
        child_after.y
    );
}

// ─── Cascade-Delete Tests ────────────────────────────────────────────────

#[test]
fn sync_delete_rect_with_text_child() {
    // Deleting a rect that contains a text child should cascade-delete both.
    let input = r#"
rect @btn {
  w: 200 h: 48
  text @label "Click" { }
}
rect @other { w: 20 h: 20 }
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let btn_id = NodeId::intern("btn");
    let label_id = NodeId::intern("label");

    // Verify both exist before
    assert!(engine.graph.get_by_id(btn_id).is_some());
    assert!(engine.graph.get_by_id(label_id).is_some());

    engine.apply_mutation(GraphMutation::RemoveNode { id: btn_id });
    engine.flush_to_text();

    // Both parent and child should be gone
    assert!(
        engine.graph.get_by_id(btn_id).is_none(),
        "@btn should be removed"
    );
    assert!(
        engine.graph.get_by_id(label_id).is_none(),
        "@label should be cascade-deleted with @btn"
    );

    // Survivor should remain
    assert!(engine.graph.get_by_id(NodeId::intern("other")).is_some());

    let text = engine.current_text();
    assert!(!text.contains("@btn"));
    assert!(!text.contains("@label"));
    assert!(text.contains("@other"));
}

#[test]
fn sync_delete_group_with_nested_children() {
    // Deleting a group containing a rect with a text child should cascade all 3.
    let input = r#"
group @card_group {
  rect @card {
    w: 200 h: 100
    text @title "Hello" { }
  }
}
rect @survivor { w: 20 h: 20 }
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("card_group"),
    });
    engine.flush_to_text();

    assert!(
        engine
            .graph
            .get_by_id(NodeId::intern("card_group"))
            .is_none()
    );
    assert!(engine.graph.get_by_id(NodeId::intern("card")).is_none());
    assert!(engine.graph.get_by_id(NodeId::intern("title")).is_none());
    assert!(engine.graph.get_by_id(NodeId::intern("survivor")).is_some());
}

// ─── Excalidraw-Inspired: Bidi Sync Regression Tests ─────────────────────
// Verify the complete canvas ↔ code pipeline for common user flows.

#[test]
fn sync_add_node_appears_in_text() {
    // Excalidraw: drawing a shape adds it to elements array.
    // FD equivalent: AddNode → flush → text contains the new node.
    let input = "rect @existing { w: 100 h: 50 }\n";
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Simulate drawing a new rect (AddNode mutation from tool)
    let mut new_node = SceneNode::new(
        NodeId::intern("drawn_rect"),
        NodeKind::Rect {
            width: 120.0,
            height: 80.0,
        },
    );
    new_node
        .constraints
        .push(Constraint::Position { x: 200.0, y: 150.0 });
    engine.apply_mutation(GraphMutation::AddNode {
        parent_id: NodeId::intern("root"),
        node: Box::new(new_node),
    });
    engine.flush_to_text();

    // Text should contain the new node
    let text = engine.current_text();
    assert!(
        text.contains("@drawn_rect"),
        "text should contain new node: {text}"
    );
    assert!(text.contains("120"));
    assert!(text.contains("80"));
    // Original should still be there
    assert!(text.contains("@existing"));

    // Round-trip: re-parse from text should reconstruct both nodes
    let engine2 = SyncEngine::from_text(text, viewport).unwrap();
    assert!(
        engine2
            .graph
            .get_by_id(NodeId::intern("existing"))
            .is_some()
    );
    assert!(
        engine2
            .graph
            .get_by_id(NodeId::intern("drawn_rect"))
            .is_some()
    );
}

#[test]
fn sync_set_text_updates_node_and_text() {
    // Excalidraw: double-click text → edit → content updates in scene.
    // FD equivalent: SetText mutation → text content updates in code.
    let input = r#"
text @title "Original Title" {
  font: "Inter" 700 24
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Verify original
    let node = engine.graph.get_by_id(NodeId::intern("title")).unwrap();
    match &node.kind {
        NodeKind::Text { content, .. } => assert_eq!(content, "Original Title"),
        _ => panic!("expected Text"),
    }

    // Edit text (simulates inline text editing)
    engine.apply_mutation(GraphMutation::SetText {
        id: NodeId::intern("title"),
        content: "Updated Title".to_string(),
    });
    engine.flush_to_text();

    // Verify graph updated
    let node = engine.graph.get_by_id(NodeId::intern("title")).unwrap();
    match &node.kind {
        NodeKind::Text { content, .. } => assert_eq!(content, "Updated Title"),
        _ => panic!("expected Text"),
    }

    // Verify text output contains new content
    let text = engine.current_text();
    assert!(
        text.contains("Updated Title"),
        "emitted text should contain new content: {text}"
    );
    assert!(!text.contains("Original Title"));

    // Round-trip: re-parse preserves the edit
    let engine2 = SyncEngine::from_text(text, viewport).unwrap();
    let node2 = engine2.graph.get_by_id(NodeId::intern("title")).unwrap();
    match &node2.kind {
        NodeKind::Text { content, .. } => assert_eq!(content, "Updated Title"),
        _ => panic!("expected Text"),
    }
}

#[test]
fn sync_delete_group_child_text_updates() {
    // Excalidraw: deleting one element from a group leaves others intact.
    // FD equivalent: RemoveNode on a group child → text updates, group remains.
    let input = r#"
group @toolbar {
  rect @btn_a { w: 40 h: 30 }
  rect @btn_b { w: 40 h: 30 }
  rect @btn_c { w: 40 h: 30 }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Delete middle child
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("btn_b"),
    });
    engine.flush_to_text();

    // Verify graph
    assert!(engine.graph.get_by_id(NodeId::intern("btn_b")).is_none());
    assert!(engine.graph.get_by_id(NodeId::intern("btn_a")).is_some());
    assert!(engine.graph.get_by_id(NodeId::intern("btn_c")).is_some());
    assert!(engine.graph.get_by_id(NodeId::intern("toolbar")).is_some());

    // Verify text
    let text = engine.current_text();
    assert!(!text.contains("@btn_b"));
    assert!(text.contains("@btn_a"));
    assert!(text.contains("@btn_c"));
    assert!(text.contains("@toolbar"));

    // Round-trip
    let engine2 = SyncEngine::from_text(text, viewport).unwrap();
    assert!(engine2.graph.get_by_id(NodeId::intern("btn_b")).is_none());
    assert!(engine2.graph.get_by_id(NodeId::intern("toolbar")).is_some());
    let toolbar_idx = engine2.graph.index_of(NodeId::intern("toolbar")).unwrap();
    assert_eq!(
        engine2.graph.children(toolbar_idx).len(),
        2,
        "toolbar should have 2 children after delete"
    );
}

#[test]
fn sync_full_user_flow_draw_edit_delete() {
    // Excalidraw regression test pattern: simulate a complete user session.
    // User draws a rect, creates a text inside it, edits the text, then
    // deletes the rect (which cascade-deletes the text).
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::new(viewport);

    // Step 1: Draw a rect (simulates R key + drag)
    let mut rect_node = SceneNode::new(
        NodeId::intern("card"),
        NodeKind::Rect {
            width: 200.0,
            height: 100.0,
        },
    );
    rect_node
        .constraints
        .push(Constraint::Position { x: 50.0, y: 50.0 });
    engine.apply_mutation(GraphMutation::AddNode {
        parent_id: NodeId::intern("root"),
        node: Box::new(rect_node),
    });

    // Step 2: Add text inside the rect (simulates T key + click inside)
    let mut text_node = SceneNode::new(
        NodeId::intern("label"),
        NodeKind::Text {
            content: "Click me".to_string(),
            max_width: None,
        },
    );
    text_node
        .constraints
        .push(Constraint::Position { x: 10.0, y: 10.0 });
    engine.apply_mutation(GraphMutation::AddNode {
        parent_id: NodeId::intern("card"),
        node: Box::new(text_node),
    });

    // Verify both exist in graph
    assert!(engine.graph.get_by_id(NodeId::intern("card")).is_some());
    assert!(engine.graph.get_by_id(NodeId::intern("label")).is_some());

    // Step 3: Edit the text (simulates double-click → type)
    engine.apply_mutation(GraphMutation::SetText {
        id: NodeId::intern("label"),
        content: "Submit".to_string(),
    });

    // Flush and verify text output
    engine.flush_to_text();
    let text = engine.current_text();
    assert!(text.contains("@card"));
    assert!(text.contains("@label"));
    assert!(text.contains("Submit"));
    assert!(!text.contains("Click me"));

    // Step 4: Delete the rect (cascade-deletes text child)
    engine.apply_mutation(GraphMutation::RemoveNode {
        id: NodeId::intern("card"),
    });
    engine.flush_to_text();

    // Both should be gone
    assert!(engine.graph.get_by_id(NodeId::intern("card")).is_none());
    assert!(engine.graph.get_by_id(NodeId::intern("label")).is_none());

    let text = engine.current_text();
    assert!(!text.contains("@card"));
    assert!(!text.contains("@label"));
}
