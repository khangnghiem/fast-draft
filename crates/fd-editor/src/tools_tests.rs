use super::*;
use crate::input::{InputEvent, Modifiers};

#[test]
fn select_tool_drag() {
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box1");

    // Press on a node
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );
    assert!(mutations.is_empty()); // Press alone doesn't mutate
    assert_eq!(tool.selected, vec![target]);

    // Drag
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 110.0,
            y: 105.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::MoveNode { id, dx, dy } => {
            assert_eq!(*id, target);
            assert!((dx - 10.0).abs() < 0.01);
            assert!((dy - 5.0).abs() < 0.01);
        }
        _ => panic!("expected MoveNode"),
    }
}

#[test]
fn select_tool_shift_drag_constrains_axis() {
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box_shift");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Press
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );

    // Drag diagonally with Shift → constrain to dominant axis (X)
    // Displacement (30, 10) exceeds 4px threshold → locks horizontal
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 30.0,
            y: 10.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 30.0).abs() < 0.01);
            assert!(dy.abs() < 0.01, "Y should be constrained to 0");
        }
        _ => panic!("expected MoveNode"),
    }
    assert_eq!(
        tool.locked_axis,
        Some(true),
        "axis should be locked to horizontal"
    );
}

#[test]
fn rect_tool_shift_draw_constrains_square() {
    let mut tool = RectTool::new();
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Start drawing
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag with Shift → square
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 60.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!(
                (width - height).abs() < 0.01,
                "Shift should make it square: w={width}, h={height}"
            );
            assert!((width - 100.0).abs() < 0.01, "Should use the larger dim");
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn select_tool_alt_click_no_duplicate() {
    // Alt+click duplication is handled by FdCanvas (not SelectTool).
    // SelectTool should just select the node without emitting DuplicateNode.
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box_alt");
    let alt = Modifiers {
        alt: true,
        ..Modifiers::NONE
    };

    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: alt,
        },
        Some(target),
    );
    // SelectTool no longer emits DuplicateNode — FdCanvas does that
    assert!(
        mutations.is_empty(),
        "SelectTool should not emit DuplicateNode on Alt+click"
    );
    assert!(
        tool.selected.contains(&target),
        "Node should be selected for drag"
    );
}

#[test]
fn select_tool_mid_drag_alt_no_duplicate() {
    // Alt mid-drag duplication is handled by FdCanvas (not SelectTool).
    // SelectTool should just emit MoveNode without DuplicateNode.
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box_mid");

    // Press without Alt (normal selection)
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );
    assert!(mutations.is_empty(), "normal press should not duplicate");
    assert!(tool.selected.contains(&target));

    let alt = Modifiers {
        alt: true,
        ..Modifiers::NONE
    };

    // Move with Alt → SelectTool should only produce MoveNode (no DuplicateNode)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 120.0,
            y: 110.0,
            pressure: 1.0,
            modifiers: alt,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        1,
        "SelectTool should only emit MoveNode, not DuplicateNode"
    );
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 20.0).abs() < 0.01, "dx={dx}");
            assert!((dy - 10.0).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected MoveNode, got {:?}", mutations[0]),
    }
}

#[test]
fn ellipse_tool_draw() {
    let mut tool = EllipseTool::new();

    // Start drawing
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::AddNode { node, .. } => {
            assert!(matches!(node.kind, NodeKind::Ellipse { .. }));
        }
        _ => panic!("expected AddNode with Ellipse"),
    }

    // Drag to size
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 150.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01);
            assert!((height - 50.0).abs() < 0.01);
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn ellipse_tool_shift_constrains_circle() {
    let mut tool = EllipseTool::new();
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 60.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!(
                (width - height).abs() < 0.01,
                "Shift should make it a circle: w={width}, h={height}"
            );
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn rect_tool_alt_draws_from_center() {
    let mut tool = RectTool::new();
    let alt = Modifiers {
        alt: true,
        ..Modifiers::NONE
    };

    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag to (150, 130) with Alt → from center: w=100, h=60
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 150.0,
            y: 130.0,
            pressure: 1.0,
            modifiers: alt,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        2,
        "Alt-draw should emit MoveNode + ResizeNode"
    );
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - (-50.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-30.0)).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected MoveNode first"),
    }
    match &mutations[1] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 60.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode second"),
    }
}

#[test]
fn ellipse_tool_alt_draws_from_center() {
    let mut tool = EllipseTool::new();
    let alt = Modifiers {
        alt: true,
        ..Modifiers::NONE
    };

    tool.handle(
        &InputEvent::PointerDown {
            x: 200.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 250.0,
            y: 240.0,
            pressure: 1.0,
            modifiers: alt,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        2,
        "Alt-draw should emit MoveNode + ResizeNode"
    );
    match &mutations[1] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 80.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn text_tool_click_creates_text() {
    let mut tool = TextTool::new();

    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 200.0,
            y: 150.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::AddNode { node, .. } => {
            match &node.kind {
                NodeKind::Text { content, .. } => {
                    assert_eq!(content, "Text");
                }
                _ => panic!("expected Text node"),
            }
            // Should have a Position constraint for positioning
            assert!(
                node.constraints
                    .iter()
                    .any(|c| matches!(c, Constraint::Position { .. }))
            );
        }
        _ => panic!("expected AddNode"),
    }

    // Second click without releasing should not create another node
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 300.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(
        mutations.is_empty(),
        "should not create duplicate on second click without release"
    );

    // Release resets the tool
    tool.handle(
        &InputEvent::PointerUp {
            x: 200.0,
            y: 150.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Now a new click should create another text
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 400.0,
            y: 300.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
}

#[test]
fn rect_tool_click_creates_centered() {
    let mut tool = RectTool::new();

    // Press at (200, 150)
    tool.handle(
        &InputEvent::PointerDown {
            x: 200.0,
            y: 150.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Release immediately (no drag) → should create 120×80 centered
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 200.0,
            y: 150.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 2, "click should emit Resize + Move");
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 120.0).abs() < 0.01, "w={width}");
            assert!((height - 80.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode first"),
    }
    match &mutations[1] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - (-60.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-40.0)).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected MoveNode second"),
    }
}

#[test]
fn ellipse_tool_click_creates_centered() {
    let mut tool = EllipseTool::new();

    // Press at (300, 250)
    tool.handle(
        &InputEvent::PointerDown {
            x: 300.0,
            y: 250.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Release immediately (no drag) → should create 100×100 centered
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 300.0,
            y: 250.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 2, "click should emit Resize + Move");
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 100.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode first"),
    }
    match &mutations[1] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - (-50.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected MoveNode second"),
    }
}

#[test]
fn rect_tool_drag_still_works() {
    let mut tool = RectTool::new();

    // Press at (100, 100)
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag to (250, 200)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 250.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 150.0).abs() < 0.01);
            assert!((height - 100.0).abs() < 0.01);
        }
        _ => panic!("expected ResizeNode"),
    }

    // Release → no centering (user defined the size)
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 250.0,
            y: 200.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(
        mutations.is_empty(),
        "drag-to-create should not emit extra mutations on up"
    );
}

#[test]
fn arrow_tool_creates_edge_between_nodes() {
    let mut tool = ArrowTool::new();
    let source = NodeId::intern("box_a");
    let target = NodeId::intern("box_b");

    // Press on source node
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(source),
    );

    // Drag to target
    tool.handle(
        &InputEvent::PointerMove {
            x: 300.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Release on target node
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 300.0,
            y: 200.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );
    assert_eq!(mutations.len(), 1, "should emit AddEdge");
    match &mutations[0] {
        GraphMutation::AddEdge { edge } => {
            assert_eq!(edge.from, EdgeAnchor::Node(source));
            assert_eq!(edge.to, EdgeAnchor::Node(target));
        }
        _ => panic!("expected AddEdge mutation"),
    }
}

#[test]
fn arrow_tool_same_node_no_edge() {
    let mut tool = ArrowTool::new();
    let node = NodeId::intern("box_same");

    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(node),
    );

    // Release on the same node
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 100.0,
            modifiers: Modifiers::NONE,
        },
        Some(node),
    );
    assert!(mutations.is_empty(), "should not create edge to same node");
}

#[test]
fn arrow_tool_half_connected_point_to_node() {
    let mut tool = ArrowTool::new();

    // Press on empty canvas (no source node)
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Release on a target node (sufficient distance)
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 300.0,
            y: 200.0,
            modifiers: Modifiers::NONE,
        },
        Some(NodeId::intern("target")),
    );
    // Now creates a half-connected edge: Point → Node
    assert_eq!(mutations.len(), 1, "should create half-connected edge");
    match &mutations[0] {
        GraphMutation::AddEdge { edge } => {
            assert!(
                matches!(edge.from, EdgeAnchor::Point(x, y) if (x - 100.0).abs() < 0.01 && (y - 100.0).abs() < 0.01)
            );
            assert!(matches!(edge.to, EdgeAnchor::Node(id) if id == NodeId::intern("target")));
        }
        _ => panic!("expected AddEdge"),
    }
}

#[test]
fn arrow_tool_preview_line_during_drag() {
    let mut tool = ArrowTool::new();

    assert!(tool.preview_line().is_none(), "no preview before drag");

    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 60.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // After down, preview should start at click point
    let preview = tool.preview_line().expect("preview during drag");
    assert!((preview.0 - 50.0).abs() < 0.01);
    assert!((preview.1 - 60.0).abs() < 0.01);

    // After move, preview end should update
    tool.handle(
        &InputEvent::PointerMove {
            x: 200.0,
            y: 300.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    let preview = tool.preview_line().expect("preview after move");
    assert!((preview.2 - 200.0).abs() < 0.01);
    assert!((preview.3 - 300.0).abs() < 0.01);

    // After up, preview should clear
    tool.handle(
        &InputEvent::PointerUp {
            x: 200.0,
            y: 300.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.preview_line().is_none(), "no preview after up");
}

#[test]
fn eraser_tool_lifecycle() {
    let mut tool = EraserTool::new();
    assert!(!tool.dragging);
    assert!(tool.erased_ids.is_empty());
    assert_eq!(tool.kind(), ToolKind::Eraser);

    // PointerDown starts drag, returns empty mutations
    let muts = tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(muts.is_empty());
    assert!(tool.dragging);

    // PointerMove returns empty mutations
    let muts = tool.handle(
        &InputEvent::PointerMove {
            x: 60.0,
            y: 60.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(NodeId::intern("rect_1")),
    );
    assert!(muts.is_empty());

    // PointerUp ends drag, returns empty mutations
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 60.0,
            y: 60.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(muts.is_empty());
    assert!(!tool.dragging);
}

#[test]
fn eraser_tool_clear_resets_state() {
    let mut tool = EraserTool::new();
    tool.dragging = true;
    tool.erased_ids.push(NodeId::intern("node_a"));
    tool.erased_ids.push(NodeId::intern("node_b"));

    tool.clear();
    assert!(!tool.dragging);
    assert!(tool.erased_ids.is_empty());
}

#[test]
fn eraser_tool_pointerdown_clears_previous_ids() {
    let mut tool = EraserTool::new();
    tool.erased_ids.push(NodeId::intern("old_node"));

    tool.handle(
        &InputEvent::PointerDown {
            x: 10.0,
            y: 10.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.erased_ids.is_empty());
    assert!(tool.dragging);
}

#[test]
fn rect_tool_draw_northwest_emits_move() {
    let mut tool = RectTool::new();

    // Start at (200, 200)
    tool.handle(
        &InputEvent::PointerDown {
            x: 200.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag to (100, 120) — northwest direction
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 120.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        2,
        "NW drag should emit MoveNode + ResizeNode"
    );
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - (-100.0)).abs() < 0.01, "dx={dx} should be -100");
            assert!((dy - (-80.0)).abs() < 0.01, "dy={dy} should be -80");
        }
        _ => panic!("expected MoveNode first"),
    }
    match &mutations[1] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 80.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode second"),
    }
}

#[test]
fn ellipse_tool_draw_northwest_emits_move() {
    let mut tool = EllipseTool::new();

    // Start at (300, 300)
    tool.handle(
        &InputEvent::PointerDown {
            x: 300.0,
            y: 300.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag to (200, 250) — northwest direction
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 200.0,
            y: 250.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        2,
        "NW drag should emit MoveNode + ResizeNode"
    );
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - (-100.0)).abs() < 0.01, "dx={dx} should be -100");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy} should be -50");
        }
        _ => panic!("expected MoveNode first"),
    }
    match &mutations[1] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 50.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode second"),
    }
}

#[test]
fn rect_tool_draw_southeast_no_extra_move() {
    let mut tool = RectTool::new();

    // Start at (100, 100)
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag southeast (200, 180) — origin stays at (100, 100)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 200.0,
            y: 180.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    // SE drawing should only emit ResizeNode (origin unchanged)
    assert_eq!(mutations.len(), 1, "SE drag should emit only ResizeNode");
    match &mutations[0] {
        GraphMutation::ResizeNode { width, height, .. } => {
            assert!((width - 100.0).abs() < 0.01);
            assert!((height - 80.0).abs() < 0.01);
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn arrow_tool_standalone_creates_edge() {
    let mut tool = ArrowTool::new();

    // Start in empty space (no hit node)
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag to (300, 200) — more than 10px distance
    tool.handle(
        &InputEvent::PointerMove {
            x: 300.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Release in empty space
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 300.0,
            y: 200.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1, "Standalone arrow should create an edge");
    match &mutations[0] {
        GraphMutation::AddEdge { edge } => {
            assert!(
                matches!(edge.from, EdgeAnchor::Point(x, y) if (x - 100.0).abs() < 0.01 && (y - 100.0).abs() < 0.01)
            );
            assert!(
                matches!(edge.to, EdgeAnchor::Point(x, y) if (x - 300.0).abs() < 0.01 && (y - 200.0).abs() < 0.01)
            );
        }
        _ => panic!("expected AddEdge"),
    }
}

#[test]
fn arrow_tool_too_short_creates_nothing() {
    let mut tool = ArrowTool::new();

    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag only 5px — below threshold
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 103.0,
            y: 104.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(
        mutations.is_empty(),
        "Too-short arrow should create nothing"
    );
}

#[test]
fn arrow_tool_connected_still_works() {
    let mut tool = ArrowTool::new();
    let from_node = NodeId::intern("node_a");
    let to_node = NodeId::intern("node_b");

    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(from_node),
    );
    tool.handle(
        &InputEvent::PointerMove {
            x: 200.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 200.0,
            y: 200.0,
            modifiers: Modifiers::NONE,
        },
        Some(to_node),
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::AddEdge { edge } => {
            assert!(matches!(edge.from, EdgeAnchor::Node(id) if id == from_node));
            assert!(matches!(edge.to, EdgeAnchor::Node(id) if id == to_node));
        }
        _ => panic!("expected AddEdge with Node anchors"),
    }
}

#[test]
fn rect_tool_creates_with_default_stroke() {
    let mut tool = RectTool::new();
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::AddNode { node, .. } => {
            // Should have stroke (transparent fill + dark border)
            assert!(
                node.props.stroke.is_some(),
                "rect should have default stroke"
            );
            let stroke = node.props.stroke.as_ref().unwrap();
            assert!(
                (stroke.width - 2.5).abs() < 0.01,
                "stroke width should be 2.5"
            );
            // Should have corner radius
            assert_eq!(node.props.corner_radius, Some(8.0), "rect corner_radius=8");
            // Fill should be None (transparent)
            assert!(
                node.props.fill.is_none(),
                "fill should be None (transparent)"
            );
        }
        _ => panic!("expected AddNode"),
    }
}

#[test]
fn ellipse_tool_creates_with_default_stroke() {
    let mut tool = EllipseTool::new();
    let mutations = tool.handle(
        &InputEvent::PointerDown {
            x: 200.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::AddNode { node, .. } => {
            // Should have stroke (transparent fill + dark border)
            assert!(
                node.props.stroke.is_some(),
                "ellipse should have default stroke"
            );
            let stroke = node.props.stroke.as_ref().unwrap();
            assert!(
                (stroke.width - 2.5).abs() < 0.01,
                "stroke width should be 2.5"
            );
            // No corner radius for ellipse
            assert!(
                node.props.corner_radius.is_none(),
                "ellipse has no corner_radius"
            );
            // Fill should be None (transparent)
            assert!(
                node.props.fill.is_none(),
                "fill should be None (transparent)"
            );
        }
        _ => panic!("expected AddNode"),
    }
}

// ─── Shift-constraint regression tests ─────────────────────────────────

#[test]
fn select_tool_shift_drag_no_jitter_on_diagonal() {
    // Regression: per-frame axis constraint used to flip every frame when
    // dragging diagonally, causing visible zigzag/jitter.
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box_jitter");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Press at origin
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );

    // Frame 1: move mostly horizontal (dx=5, dy=3) → total: (5, 3) → lock X
    let m1 = tool.handle(
        &InputEvent::PointerMove {
            x: 105.0,
            y: 103.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(m1.len(), 1);
    match &m1[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 5.0).abs() < 0.01, "frame1 dx={dx}");
            assert!(dy.abs() < 0.01, "frame1 dy={dy} should be 0 (X-locked)");
        }
        _ => panic!("expected MoveNode"),
    }

    // Frame 2: continue diagonally (total: 12, 8) → still X-dominant → still lock X
    let m2 = tool.handle(
        &InputEvent::PointerMove {
            x: 112.0,
            y: 108.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(m2.len(), 1);
    match &m2[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 7.0).abs() < 0.01, "frame2 dx={dx}");
            assert!(dy.abs() < 0.01, "frame2 dy={dy} should be 0 (X-locked)");
        }
        _ => panic!("expected MoveNode"),
    }

    // Frame 3: even more diagonal (total: 18, 15) → still X > Y → lock X
    let m3 = tool.handle(
        &InputEvent::PointerMove {
            x: 118.0,
            y: 115.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(m3.len(), 1);
    match &m3[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 6.0).abs() < 0.01, "frame3 dx={dx}");
            assert!(dy.abs() < 0.01, "frame3 dy={dy} should be 0 (X-locked)");
        }
        _ => panic!("expected MoveNode"),
    }
}

#[test]
fn select_tool_shift_drag_locks_vertical() {
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box_vert");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );

    // Move mostly vertical (total: 3, 20) → lock Y
    let m1 = tool.handle(
        &InputEvent::PointerMove {
            x: 53.0,
            y: 70.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(m1.len(), 1);
    match &m1[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!(dx.abs() < 0.01, "dx={dx} should be 0 (Y-locked)");
            assert!((dy - 20.0).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected MoveNode"),
    }
}

#[test]
fn rect_tool_shift_draw_northwest_correct_origin() {
    // Regression: Shift+draw NW used raw cursor for origin, causing jump.
    let mut tool = RectTool::new();
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Start at (200, 200)
    tool.handle(
        &InputEvent::PointerDown {
            x: 200.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag northwest to (150, 170) with Shift → w=50, h=30, square side=50
    // Origin should be (200-50, 200-50) = (150, 150)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 150.0,
            y: 170.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    // Should have MoveNode + ResizeNode
    assert!(mutations.len() >= 1, "should have mutations");
    let mut has_resize = false;
    let mut has_move = false;
    for m in &mutations {
        match m {
            GraphMutation::ResizeNode { width, height, .. } => {
                assert!(
                    (width - height).abs() < 0.01,
                    "Should be square: w={width}, h={height}"
                );
                assert!((width - 50.0).abs() < 0.01, "side should be 50");
                has_resize = true;
            }
            GraphMutation::MoveNode { dx, dy, .. } => {
                // Origin should move from (200, 200) to (150, 150) = delta (-50, -50)
                assert!((dx - (-50.0)).abs() < 0.01, "dx={dx} should be -50");
                assert!((dy - (-50.0)).abs() < 0.01, "dy={dy} should be -50");
                has_move = true;
            }
            _ => {}
        }
    }
    assert!(has_resize, "should have ResizeNode");
    assert!(has_move, "should have MoveNode for NW direction");
}

#[test]
fn ellipse_tool_shift_draw_northwest_correct_origin() {
    // Regression: same origin bug as RectTool.
    let mut tool = EllipseTool::new();
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    tool.handle(
        &InputEvent::PointerDown {
            x: 300.0,
            y: 300.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Drag NW to (240, 260) → w=60, h=40, circle side=60
    // Origin should be (300-60, 300-60) = (240, 240)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 240.0,
            y: 260.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert!(mutations.len() >= 1, "should have mutations");
    let mut has_resize = false;
    let mut has_move = false;
    for m in &mutations {
        match m {
            GraphMutation::ResizeNode { width, height, .. } => {
                assert!(
                    (width - height).abs() < 0.01,
                    "Should be circle: w={width}, h={height}"
                );
                assert!((width - 60.0).abs() < 0.01, "side should be 60");
                has_resize = true;
            }
            GraphMutation::MoveNode { dx, dy, .. } => {
                assert!((dx - (-60.0)).abs() < 0.01, "dx={dx} should be -60");
                assert!((dy - (-60.0)).abs() < 0.01, "dy={dy} should be -60");
                has_move = true;
            }
            _ => {}
        }
    }
    assert!(has_resize, "should have ResizeNode");
    assert!(has_move, "should have MoveNode for NW direction");
}

/// Regression: Shift+drag near origin should use dead-zone threshold.
/// Below 4px displacement, the axis is NOT locked and movement is free.
/// Once past 4px, the axis locks and stays locked.
#[test]
fn select_tool_shift_drag_dead_zone() {
    let mut tool = SelectTool::new();
    let target = NodeId::intern("box_dz");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Press at origin
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );
    assert!(tool.locked_axis.is_none(), "axis should start as None");

    // Move (2, 1.5) — below 4px threshold → free move, no axis lock
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 102.0,
            y: 101.5,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(mutations.len(), 1, "should emit MoveNode for free move");
    assert!(
        tool.locked_axis.is_none(),
        "axis should NOT be locked below threshold"
    );
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            // Free move: both dx and dy should be non-zero
            assert!((dx - 2.0).abs() < 0.01, "dx={dx} should be 2.0");
            assert!((dy - 1.5).abs() < 0.01, "dy={dy} should be 1.5");
        }
        _ => panic!("expected MoveNode"),
    }

    // Move to (110, 103) — total displacement (10, 3) exceeds 4px → locks horizontal
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 110.0,
            y: 103.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(
        tool.locked_axis,
        Some(true),
        "axis should lock to horizontal"
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::MoveNode { dy, .. } => {
            // Y should snap back to start_y (100.0) from last_y (101.5)
            assert!(
                dy.abs() < 2.0,
                "Y should be constrained near 0, got dy={dy}"
            );
        }
        _ => panic!("expected MoveNode"),
    }

    // Subsequent move: axis stays locked even if Y > X
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 112.0,
            y: 120.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(
        tool.locked_axis,
        Some(true),
        "axis should STAY locked to horizontal"
    );
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 2.0).abs() < 0.01, "dx={dx}");
            assert!(dy.abs() < 0.01, "Y should still be constrained, dy={dy}");
        }
        _ => panic!("expected MoveNode"),
    }
}

/// Regression: Shift+drag with multiple selected nodes moves ALL of them.
/// Previously, Shift+click on an already-selected node would deselect it
/// in PointerDown, causing only the remaining nodes to move.
#[test]
fn select_tool_shift_drag_multi_select_moves_all() {
    let mut tool = SelectTool::new();
    let a = NodeId::intern("node_a");
    let b = NodeId::intern("node_b");
    let c = NodeId::intern("node_c");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Build up multi-selection: click A, Shift+click B, Shift+click C
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(a),
    );
    tool.handle(
        &InputEvent::PointerUp {
            x: 50.0,
            y: 50.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(b),
    );
    tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 50.0,
            modifiers: shift,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerDown {
            x: 150.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(c),
    );
    tool.handle(
        &InputEvent::PointerUp {
            x: 150.0,
            y: 50.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(
        tool.selected.len(),
        3,
        "should have 3 selected: {:?}",
        tool.selected
    );

    // Now Shift+click on already-selected node A and drag
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(a),
    );
    // A should still be selected (deferred deselect)
    assert_eq!(
        tool.selected.len(),
        3,
        "A should NOT be deselected on PointerDown — deferred to PointerUp"
    );
    assert!(
        tool.shift_toggled_off.is_some(),
        "shift_toggled_off should be set"
    );

    // Shift+drag moves all 3 nodes (displacement 20,5 > 4px threshold → locks X)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 70.0,
            y: 55.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        3,
        "all 3 nodes should receive MoveNode, got {}",
        mutations.len()
    );
    // Deferred shift toggle should be cancelled since we dragged
    assert!(
        tool.shift_toggled_off.is_none(),
        "shift_toggled_off should be cleared on drag"
    );
    for m in &mutations {
        match m {
            GraphMutation::MoveNode { .. } => {}
            _ => panic!("expected MoveNode, got {:?}", m),
        }
    }
}

/// Regression: Shift+click without drag should still deselect.
#[test]
fn select_tool_shift_click_deselects_on_pointerup() {
    let mut tool = SelectTool::new();
    let a = NodeId::intern("click_a");
    let b = NodeId::intern("click_b");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

    // Select A, then Shift+click B to add it
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(a),
    );
    tool.handle(
        &InputEvent::PointerUp {
            x: 50.0,
            y: 50.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerDown {
            x: 100.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(b),
    );
    tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 50.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(tool.selected.len(), 2, "A and B should be selected");

    // Shift+click on A again without dragging → should deselect A on PointerUp
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(a),
    );
    assert_eq!(
        tool.selected.len(),
        2,
        "A should still be selected before Up"
    );

    // PointerUp without drag → deferred deselect fires
    tool.handle(
        &InputEvent::PointerUp {
            x: 50.0,
            y: 50.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(tool.selected.len(), 1, "A should be deselected on Up");
    assert_eq!(tool.selected[0], b, "only B should remain");
}

/// Regression test: Eraser hover-only (no drag) must produce empty mutations
/// and not crash. Before v0.11.40 this caused a panic on empty erased_ids.
#[test]
fn eraser_tool_hover_only_no_crash() {
    let mut tool = EraserTool::new();
    let node = NodeId::intern("hover_target");

    // Move over a node WITHOUT pressing first (hover only)
    let muts = tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 100.0,
            pressure: 0.0,
            modifiers: Modifiers::NONE,
        },
        Some(node),
    );
    assert!(muts.is_empty(), "hover-only should produce no mutations");
    assert!(!tool.dragging, "should not be dragging from hover");
    assert!(
        tool.erased_ids.is_empty(),
        "no IDs should be collected from hover"
    );
}

/// Clicking an already-selected node should keep it selected (no deselect).
/// This specifically tests that re-clicking doesn't toggle off.
#[test]
fn select_tool_reclick_keeps_selection() {
    let mut tool = SelectTool::new();
    let target = NodeId::intern("reclick_node");

    // First click selects
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );
    assert_eq!(tool.selected, vec![target]);

    // Release
    tool.handle(
        &InputEvent::PointerUp {
            x: 50.0,
            y: 50.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Click again on same node
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        Some(target),
    );
    assert_eq!(
        tool.selected,
        vec![target],
        "re-clicking should keep selection"
    );
}

#[test]
fn tool_pen_basic_draw() {
    let mut tool = PenTool::new();
    assert_eq!(tool.kind(), ToolKind::Pen);
    assert!(!tool.is_drawing());

    // 1. PointerDown: Starts drawing, creates Path
    let muts = tool.handle(
        &InputEvent::PointerDown {
            x: 10.0,
            y: 20.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.is_drawing());
    assert_eq!(muts.len(), 1);

    let path_id = match &muts[0] {
        GraphMutation::AddNode { parent_id, node } => {
            assert_eq!(*parent_id, NodeId::intern("root"));
            assert!(node.id.as_str().starts_with("path_"));
            if let NodeKind::Path { commands } = &node.kind {
                assert_eq!(commands.len(), 1);
                assert!(matches!(commands[0], PathCmd::MoveTo(10.0, 20.0)));
            } else {
                panic!("Expected Path node");
            }
            node.id
        }
        _ => panic!("Expected AddNode"),
    };

    // 2. PointerMove: Updates path with LineTo
    let muts = tool.handle(
        &InputEvent::PointerMove {
            x: 15.0,
            y: 25.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(muts.len(), 1);
    match &muts[0] {
        GraphMutation::UpdatePath { id, commands } => {
            assert_eq!(*id, path_id);
            assert_eq!(commands.len(), 2);
            assert!(matches!(commands[0], PathCmd::MoveTo(10.0, 20.0)));
            assert!(matches!(commands[1], PathCmd::LineTo(15.0, 25.0)));
        }
        _ => panic!("Expected UpdatePath"),
    }

    // 3. PointerMove again
    let _ = tool.handle(
        &InputEvent::PointerMove {
            x: 20.0,
            y: 30.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // 4. PointerUp: Finalizes with Catmull-Rom smoothing
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 20.0,
            y: 30.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(!tool.is_drawing());
    assert_eq!(muts.len(), 1);
    match &muts[0] {
        GraphMutation::UpdatePath { id, commands } => {
            assert_eq!(*id, path_id);
            assert_eq!(commands.len(), 3); // MoveTo, CubicTo, CubicTo
            assert!(matches!(commands[0], PathCmd::MoveTo(10.0, 20.0)));
            assert!(matches!(
                commands[1],
                PathCmd::CubicTo(_, _, _, _, 15.0, 25.0)
            ));
            assert!(matches!(
                commands[2],
                PathCmd::CubicTo(_, _, _, _, 20.0, 30.0)
            ));
        }
        _ => panic!("Expected UpdatePath"),
    }
}

#[test]
fn tool_pen_two_points() {
    let mut tool = PenTool::new();

    // Down
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    // Move
    tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    // Up - exactly 2 points should just be MoveTo + LineTo
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 100.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    match &muts[0] {
        GraphMutation::UpdatePath { commands, .. } => {
            assert_eq!(commands.len(), 2);
            assert!(matches!(commands[0], PathCmd::MoveTo(0.0, 0.0)));
            assert!(matches!(commands[1], PathCmd::LineTo(100.0, 100.0)));
        }
        _ => panic!("Expected UpdatePath"),
    }
}

#[test]
fn tool_pen_cancel() {
    let mut tool = PenTool::new();

    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.is_drawing());

    tool.cancel();
    assert!(!tool.is_drawing());

    // Moving after cancel does nothing
    let muts = tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(muts.is_empty());
}

#[test]
fn tool_pen_subsampling() {
    let mut tool = PenTool::new();
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Feed 100 points
    for i in 1..=100 {
        tool.handle(
            &InputEvent::PointerMove {
                x: i as f32,
                y: i as f32,
                pressure: 1.0,
                modifiers: Modifiers::NONE,
            },
            None,
        );
    }

    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 100.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    match &muts[0] {
        GraphMutation::UpdatePath { commands, .. } => {
            // Should be subsampled to max 64 points
            // 1 MoveTo + 63 CubicTo = 64 commands
            assert_eq!(commands.len(), 64);
        }
        _ => panic!("Expected UpdatePath"),
    }
}
