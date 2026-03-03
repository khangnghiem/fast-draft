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
fn sync_set_annotations() {
    let input = r#"
rect @box {
  w: 100
  h: 50
  spec {
"A test box"
status: draft
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Verify initial annotations
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node.annotations.len(), 2);

    // Update annotations via mutation
    engine.apply_mutation(GraphMutation::SetAnnotations {
        id: NodeId::intern("box"),
        annotations: vec![
            Annotation::Description("Updated description".into()),
            Annotation::Status("done".into()),
            Annotation::Accept("all tests pass".into()),
        ],
    });
    engine.flush_to_text();

    // Verify graph updated
    let node = engine.graph.get_by_id(NodeId::intern("box")).unwrap();
    assert_eq!(node.annotations.len(), 3);
    assert_eq!(
        node.annotations[0],
        Annotation::Description("Updated description".into())
    );

    // Verify text re-emitted with spec blocks
    assert!(engine.text.contains("\"Updated description\""));
    assert!(engine.text.contains("status: done"));
    assert!(engine.text.contains("accept: \"all tests pass\""));
}

#[test]
fn sync_annotations_roundtrip() {
    let input = r#"
rect @card {
  w: 200
  h: 100
  spec {
"Card component"
priority: high
  }
}
"#;
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();

    // Mutate annotations
    engine.apply_mutation(GraphMutation::SetAnnotations {
        id: NodeId::intern("card"),
        annotations: vec![
            Annotation::Description("Updated card".into()),
            Annotation::Accept("renders correctly".into()),
            Annotation::Status("in_progress".into()),
        ],
    });
    let text = engine.current_text().to_string();

    // Re-parse from text
    let engine2 = SyncEngine::from_text(&text, viewport).unwrap();
    let node = engine2.graph.get_by_id(NodeId::intern("card")).unwrap();
    assert_eq!(node.annotations.len(), 3);
    assert_eq!(
        node.annotations[2],
        Annotation::Status("in_progress".into())
    );
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
    assert!(node.style.text_align.is_none());
    assert!(node.style.text_valign.is_none());

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
    assert_eq!(node.style.text_align, Some(TextAlign::Right));
    assert_eq!(node.style.text_valign, Some(TextVAlign::Bottom));

    // Verify text output contains align property
    assert!(
        engine.text.contains("align: right bottom"),
        "emitted text should contain 'align: right bottom', got:\n{}",
        engine.text
    );

    // Verify round-trip
    let engine2 = SyncEngine::from_text(&engine.text, viewport).unwrap();
    let node2 = engine2.graph.get_by_id(NodeId::intern("heading")).unwrap();
    assert_eq!(node2.style.text_align, Some(TextAlign::Right));
    assert_eq!(node2.style.text_valign, Some(TextVAlign::Bottom));
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
    // The duplicate should have a name derived from the original
    assert!(
        text.contains("login_button_copy_"),
        "expected derived name in: {text}"
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
fn sync_move_managed_layout_child_noop() {
    // Moving a text child inside a Column-layout frame should be a no-op.
    // The layout solver owns child placement in managed layouts.
    let input = "frame @hero {\n  w: 400 h: 200\n  layout: column gap=16 pad=40\n\n  text @title \"Welcome to FD\" {\n    font: \"Inter\" 800 48\n  }\n  text @sub \"The token-efficient design format\" {\n    font: \"Inter\" 400 18\n  }\n}\n";
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut engine = SyncEngine::from_text(input, viewport).unwrap();
    let title_id = NodeId::intern("title");
    let title_idx = engine.graph.index_of(title_id).unwrap();

    let bounds_before = engine.bounds[&title_idx];

    // Attempt to move text child — should be silently ignored
    engine.apply_mutation(GraphMutation::MoveNode {
        id: title_id,
        dx: 100.0,
        dy: 50.0,
    });

    // Bounds should be unchanged
    let bounds_after = engine.bounds[&title_idx];
    assert!(
        (bounds_after.x - bounds_before.x).abs() < 0.01,
        "x should not change: {} vs {}",
        bounds_after.x,
        bounds_before.x
    );
    assert!(
        (bounds_after.y - bounds_before.y).abs() < 0.01,
        "y should not change: {} vs {}",
        bounds_after.y,
        bounds_before.y
    );

    // No Position constraint should be added
    let node = engine.graph.get_by_id(title_id).unwrap();
    assert!(
        !node
            .constraints
            .iter()
            .any(|c| matches!(c, Constraint::Position { .. })),
        "no Position constraint should be added to managed-layout child"
    );
}
