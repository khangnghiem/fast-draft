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
        GraphMutation::MoveNode { id, dx, dy, .. } => {
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

    // Drag diagonally with Shift → snap to dominant axis (X) per-frame
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
        1,
        "Alt-draw should emit ResizeNode with embedded dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((dx - (-50.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-30.0)).abs() < 0.01, "dy={dy}");
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 60.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode"),
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
        1,
        "Alt-draw should emit ResizeNode with embedded dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((dx - (-50.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-40.0)).abs() < 0.01, "dy={dy}");
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

    // Release immediately (no drag) → should create 162×100 centered
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 200.0,
            y: 150.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        1,
        "click should emit single ResizeNode with dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((width - 162.0).abs() < 0.01, "w={width}");
            assert!((height - 100.0).abs() < 0.01, "h={height}");
            assert!((dx - (-81.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected ResizeNode"),
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

    // Release immediately (no drag) → should create 128×128 centered
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 300.0,
            y: 250.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        1,
        "click should emit single ResizeNode with dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((width - 128.0).abs() < 0.01, "w={width}");
            assert!((height - 128.0).abs() < 0.01, "h={height}");
            assert!((dx - (-64.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-64.0)).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected ResizeNode"),
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
        1,
        "NW drag should emit ResizeNode with embedded dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((dx - (-100.0)).abs() < 0.01, "dx={dx} should be -100");
            assert!((dy - (-80.0)).abs() < 0.01, "dy={dy} should be -80");
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 80.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode"),
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
        1,
        "NW drag should emit ResizeNode with embedded dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((dx - (-100.0)).abs() < 0.01, "dx={dx} should be -100");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy} should be -50");
            assert!((width - 100.0).abs() < 0.01, "w={width}");
            assert!((height - 50.0).abs() < 0.01, "h={height}");
        }
        _ => panic!("expected ResizeNode"),
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
    // Per-frame axis-snap: each frame projects onto the dominant axis.
    // When dragging diagonally, each frame snaps independently.
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

    // Frame 1: move mostly horizontal (dx=5, dy=3) → snap to X
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
            assert!(dy.abs() < 0.01, "frame1 dy={dy} should be 0 (X-dominant)");
        }
        _ => panic!("expected MoveNode"),
    }

    // Frame 2: cursor (112, 108). last is (105, 100).
    // dx=7, dy=8 → Y-dominant → snap to Y
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
            assert!(dx.abs() < 0.01, "frame2 dx={dx} should be 0 (Y-dominant)");
            assert!((dy - 8.0).abs() < 0.01, "frame2 dy={dy}");
        }
        _ => panic!("expected MoveNode"),
    }

    // Frame 3: cursor (113, 116). last is (105, 108).
    // dx=8, dy=8 → equal → X wins (>=), snap to X
    let m3 = tool.handle(
        &InputEvent::PointerMove {
            x: 113.0,
            y: 116.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(m3.len(), 1);
    match &m3[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 8.0).abs() < 0.01, "frame3 dx={dx}");
            assert!(dy.abs() < 0.01, "frame3 dy={dy} should be 0 (X-dominant)");
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

    // Move mostly vertical (dx=3, dy=20) → snap to Y per-frame
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
            assert!(dx.abs() < 0.01, "dx={dx} should be 0 (Y-dominant)");
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
    // Should have ResizeNode with dx/dy
    assert_eq!(mutations.len(), 1, "should have 1 mutation");
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!(
                (width - height).abs() < 0.01,
                "Should be square: w={width}, h={height}"
            );
            assert!((width - 50.0).abs() < 0.01, "side should be 50");
            assert!((dx - (-50.0)).abs() < 0.01, "dx={dx} should be -50");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy} should be -50");
        }
        _ => panic!("expected ResizeNode"),
    }
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
    assert_eq!(mutations.len(), 1, "should have 1 mutation");
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!(
                (width - height).abs() < 0.01,
                "Should be circle: w={width}, h={height}"
            );
            assert!((width - 60.0).abs() < 0.01, "side should be 60");
            assert!((dx - (-60.0)).abs() < 0.01, "dx={dx} should be -60");
            assert!((dy - (-60.0)).abs() < 0.01, "dy={dy} should be -60");
        }
        _ => panic!("expected ResizeNode"),
    }
}

/// Per-frame axis-snap has no dead-zone — every frame snaps independently.
/// Small displacements still snap to dominant axis.
#[test]
fn select_tool_shift_drag_small_moves() {
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

    // Move (2, 1.5) — small but X-dominant → snap to X
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 102.0,
            y: 101.5,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(mutations.len(), 1, "should emit MoveNode");
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!((dx - 2.0).abs() < 0.01, "dx={dx} should be 2.0");
            assert!(dy.abs() < 0.01, "dy={dy} should be 0 (X-dominant)");
        }
        _ => panic!("expected MoveNode"),
    }

    // Move vertically: cursor (102, 111.5). last is (102, 100).
    // dx=0, dy=11.5 → snap to Y (axis switches!)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 102.0,
            y: 111.5,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::MoveNode { dx, dy, .. } => {
            assert!(dx.abs() < 0.01, "dx={dx} should be 0 (Y-dominant)");
            assert!((dy - 11.5).abs() < 0.01, "dy={dy}");
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

    // Shift+drag moves all 3 nodes (displacement 20,5 → X-dominant)
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

/// Regression: CMD+drag (non-Shift path) must cancel deferred Shift deselect.
/// This was the exact bug scenario — Shift+click toggled a node off, then
/// CMD+drag moved the selection but shift_toggled_off lingered, causing
/// PointerUp to incorrectly deselect the node.
#[test]
fn select_tool_cmd_drag_cancels_shift_toggled_off() {
    let mut tool = SelectTool::new();
    let a = NodeId::intern("cmd_a");
    let b = NodeId::intern("cmd_b");
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };
    let cmd = Modifiers {
        meta: true,
        ..Modifiers::NONE
    };

    // Select A normally
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
    assert_eq!(tool.selected, vec![a]);

    // Shift+click B to add it
    tool.handle(
        &InputEvent::PointerDown {
            x: 150.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(b),
    );
    tool.handle(
        &InputEvent::PointerUp {
            x: 150.0,
            y: 50.0,
            modifiers: shift,
        },
        None,
    );
    assert_eq!(tool.selected.len(), 2);

    // Shift+click A again — sets deferred deselect (shift_toggled_off = Some(a))
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: shift,
        },
        Some(a),
    );
    assert!(
        tool.shift_toggled_off.is_some(),
        "shift_toggled_off should be armed"
    );

    // CMD+drag (non-Shift path!) — must clear shift_toggled_off
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 70.0,
            y: 55.0,
            pressure: 1.0,
            modifiers: cmd,
        },
        None,
    );
    assert_eq!(mutations.len(), 2, "both nodes should move");
    assert!(
        tool.shift_toggled_off.is_none(),
        "CMD+drag must cancel deferred deselect"
    );

    // PointerUp — A must NOT be deselected
    tool.handle(
        &InputEvent::PointerUp {
            x: 70.0,
            y: 55.0,
            modifiers: cmd,
        },
        None,
    );
    assert_eq!(
        tool.selected.len(),
        2,
        "A should remain selected after CMD+drag: {:?}",
        tool.selected
    );
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
                assert!(matches!(commands[0], PathCmd::MoveTo(0.0, 0.0)));
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
            assert!(matches!(commands[0], PathCmd::MoveTo(0.0, 0.0)));
            assert!(matches!(commands[1], PathCmd::LineTo(5.0, 5.0)));
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

    // 4. PointerUp: Finalizes with Catmull-Rom smoothing + pressure-derived stroke width
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 20.0,
            y: 30.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(!tool.is_drawing());
    assert_eq!(muts.len(), 3); // UpdatePath + SetStrokeWidth + SetConstraints
    match &muts[0] {
        GraphMutation::UpdatePath { id, commands } => {
            assert_eq!(*id, path_id);
            assert_eq!(commands.len(), 3); // MoveTo, CubicTo, CubicTo
            assert!(matches!(commands[0], PathCmd::MoveTo(0.0, 0.0)));
            assert!(matches!(
                commands[1],
                PathCmd::CubicTo(_, _, _, _, 5.0, 5.0)
            ));
            assert!(matches!(
                commands[2],
                PathCmd::CubicTo(_, _, _, _, 10.0, 10.0)
            ));
        }
        _ => panic!("Expected UpdatePath"),
    }
    match &muts[1] {
        GraphMutation::SetStrokeWidth { id, width } => {
            assert_eq!(*id, path_id);
            // All pressure=1.0 → max width = 4.5
            assert!((width - 4.5).abs() < 0.01, "width={width}");
        }
        _ => panic!("Expected SetStrokeWidth"),
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

    assert_eq!(muts.len(), 3); // UpdatePath + SetStrokeWidth + SetConstraints
    match &muts[0] {
        GraphMutation::UpdatePath { commands, .. } => {
            // Should be subsampled to max 64 points
            // 1 MoveTo + 63 CubicTo = 64 commands
            assert_eq!(commands.len(), 64);
        }
        _ => panic!("Expected UpdatePath"),
    }
}

#[test]
fn pen_tool_light_pressure_thin_stroke() {
    let mut tool = PenTool::new();
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 0.1,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerMove {
            x: 50.0,
            y: 50.0,
            pressure: 0.15,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 100.0,
            pressure: 0.1,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 100.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(muts.len(), 3);
    match &muts[1] {
        GraphMutation::SetStrokeWidth { width, .. } => {
            // avg pressure ≈ 0.117 → width ≈ 1.0 + 3.5 * 0.117 ≈ 1.41
            assert!(
                *width < 2.0,
                "light pressure should produce thin stroke, got {width}"
            );
            assert!(*width >= 1.0, "stroke should be at least 1.0, got {width}");
        }
        _ => panic!("Expected SetStrokeWidth"),
    }
}

#[test]
fn pen_tool_heavy_pressure_thick_stroke() {
    let mut tool = PenTool::new();
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 0.9,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerMove {
            x: 50.0,
            y: 50.0,
            pressure: 0.95,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 100.0,
            pressure: 0.85,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 100.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(muts.len(), 3);
    match &muts[1] {
        GraphMutation::SetStrokeWidth { width, .. } => {
            // avg pressure ≈ 0.9 → width ≈ 1.0 + 3.5 * 0.9 ≈ 4.15
            assert!(
                *width > 3.5,
                "heavy pressure should produce thick stroke, got {width}"
            );
            assert!(*width <= 4.5, "stroke should be at most 4.5, got {width}");
        }
        _ => panic!("Expected SetStrokeWidth"),
    }
}

#[test]
fn pen_tool_default_pressure_medium_stroke() {
    let mut tool = PenTool::new();
    // Default mouse pressure is 0.5 in most browsers
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 0.5,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 100.0,
            pressure: 0.5,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 100.0,
            y: 100.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(muts.len(), 3);
    match &muts[1] {
        GraphMutation::SetStrokeWidth { width, .. } => {
            // pressure=0.5 → width = 1.0 + 3.5 * 0.5 = 2.75
            assert!((width - 2.75).abs() < 0.01, "expected 2.75, got {width}");
        }
        _ => panic!("Expected SetStrokeWidth"),
    }
}

#[test]
fn rect_tool_shift_alt_square_from_center() {
    let mut tool = RectTool::new();
    let shift_alt = Modifiers {
        shift: true,
        alt: true,
        ..Modifiers::NONE
    };

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

    // Drag to (150, 130) with Shift+Alt → square from center
    // Raw: w=50, h=30 → Shift: side=50 → Alt: double to 100
    // Position: center at (100,100), so top-left at (50, 50)
    let mutations = tool.handle(
        &InputEvent::PointerMove {
            x: 150.0,
            y: 130.0,
            pressure: 1.0,
            modifiers: shift_alt,
        },
        None,
    );
    assert_eq!(
        mutations.len(),
        1,
        "Shift+Alt should emit ResizeNode with embedded dx/dy"
    );
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!(
                (width - height).abs() < 0.01,
                "Should be square: w={width}, h={height}"
            );
            assert!((width - 100.0).abs() < 0.01, "w={width} expected 100");
            assert!((dx - (-50.0)).abs() < 0.01, "dx={dx} expected -50");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy} expected -50");
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn rect_tool_cancel_resets_state() {
    let mut tool = RectTool::new();

    // Start drawing
    tool.handle(
        &InputEvent::PointerDown {
            x: 50.0,
            y: 50.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.drawing);
    assert!(tool.current_id.is_some());

    // Drag to establish a size
    tool.handle(
        &InputEvent::PointerMove {
            x: 150.0,
            y: 100.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.dragged);

    // Cancel
    tool.cancel();
    assert!(!tool.drawing);
    assert!(!tool.dragged);
    assert!(tool.current_id.is_none());
}

#[test]
fn rect_tool_drag_back_to_start_is_click() {
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

    // Drag far away
    tool.handle(
        &InputEvent::PointerMove {
            x: 250.0,
            y: 200.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(tool.dragged);

    // Drag back to within 5px of start
    tool.handle(
        &InputEvent::PointerMove {
            x: 102.0,
            y: 101.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    // dragged should be reset since we're back near start
    assert!(
        !tool.dragged,
        "Should reset dragged=false when back near start"
    );

    // PointerUp should produce click-to-place (162×100)
    let mutations = tool.handle(
        &InputEvent::PointerUp {
            x: 102.0,
            y: 101.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(mutations.len(), 1, "Should produce click-to-place defaults");
    match &mutations[0] {
        GraphMutation::ResizeNode {
            width,
            height,
            dx,
            dy,
            ..
        } => {
            assert!((width - 162.0).abs() < 0.01, "w={width}");
            assert!((height - 100.0).abs() < 0.01, "h={height}");
            assert!((dx - (-81.0)).abs() < 0.01, "dx={dx}");
            assert!((dy - (-50.0)).abs() < 0.01, "dy={dy}");
        }
        _ => panic!("expected ResizeNode"),
    }
}

#[test]
fn arrow_tool_shift_snaps_to_45_degrees() {
    let mut tool = ArrowTool::new();
    let shift = Modifiers {
        shift: true,
        ..Modifiers::NONE
    };

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

    // Drag nearly horizontal (slight Y offset) with Shift
    // → should snap to pure horizontal (0°)
    tool.handle(
        &InputEvent::PointerMove {
            x: 300.0,
            y: 115.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    let preview = tool.preview_line().expect("preview during drag");
    // Start should still be (100, 100)
    assert!((preview.0 - 100.0).abs() < 0.01, "start x");
    assert!((preview.1 - 100.0).abs() < 0.01, "start y");
    // End Y should snap to start Y (horizontal)
    assert!(
        (preview.3 - 100.0).abs() < 1.0,
        "end Y should snap to horizontal: got {}",
        preview.3
    );
}

#[test]
fn arrow_tool_shift_snaps_preview_to_diagonal() {
    let mut tool = ArrowTool::new();
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

    // Drag at ~40° (close to 45°) with Shift → should snap to 45°
    tool.handle(
        &InputEvent::PointerMove {
            x: 100.0,
            y: 85.0,
            pressure: 1.0,
            modifiers: shift,
        },
        None,
    );
    let preview = tool.preview_line().expect("preview during drag");
    // At 45°, end_x should equal end_y
    assert!(
        (preview.2 - preview.3).abs() < 1.0,
        "diagonal snap: x={}, y={} should be ~equal",
        preview.2,
        preview.3
    );
}

#[test]
fn snap_to_45_degrees_all_directions() {
    use super::snap_to_45_degrees;

    // East (0°): nearly horizontal drag → snap to pure east
    let (x, y) = snap_to_45_degrees(0.0, 0.0, 100.0, 5.0);
    assert!(y.abs() < 1.0, "east snap: y={y} should be ~0");
    assert!((x - 100.0).abs() < 1.0, "east snap: x={x} should be ~100");

    // North-East (45°): drag at 40° → snap to 45°
    let (x, y) = snap_to_45_degrees(0.0, 0.0, 100.0, 85.0);
    assert!(
        (x - y).abs() < 1.0,
        "NE snap: x={x}, y={y} should be ~equal"
    );

    // South (-90°): nearly straight down
    let (x, y) = snap_to_45_degrees(0.0, 0.0, 3.0, -100.0);
    assert!(x.abs() < 1.0, "south snap: x={x} should be ~0");
    assert!(
        (y - (-100.0)).abs() < 1.0,
        "south snap: y={y} should be ~-100"
    );

    // Zero distance: should return input unchanged
    let (x, y) = snap_to_45_degrees(50.0, 50.0, 50.0, 50.0);
    assert!((x - 50.0).abs() < 0.01);
    assert!((y - 50.0).abs() < 0.01);
}

#[test]
fn frame_tool_creates_frame_node() {
    let mut tool = RectTool::new();
    tool.frame_mode = true;

    // Press to create a frame
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
            assert!(
                matches!(node.kind, NodeKind::Frame { .. }),
                "frame_mode should create Frame, got {:?}",
                node.kind
            );
            // Frame should have a fill (light background)
            assert!(node.props.fill.is_some(), "frame should have a fill");
            // Frame should NOT have corner_radius
            assert!(
                node.props.corner_radius.is_none(),
                "frame should not have corner_radius"
            );
        }
        _ => panic!("expected AddNode"),
    }
}

#[test]
fn rect_tool_without_frame_mode_creates_rect() {
    let mut tool = RectTool::new();
    // frame_mode defaults to false
    assert!(!tool.frame_mode);

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
            assert!(
                matches!(node.kind, NodeKind::Rect { .. }),
                "without frame_mode should create Rect, got {:?}",
                node.kind
            );
            assert!(
                node.props.corner_radius.is_some(),
                "rect should have corner_radius"
            );
        }
        _ => panic!("expected AddNode"),
    }
}

// ─── Lasso Tool Tests ────────────────────────────────────────────────────

#[test]
fn lasso_tool_lifecycle() {
    let mut tool = LassoTool::new();
    assert!(!tool.active);
    assert!(tool.polygon.is_empty());
    assert_eq!(tool.kind(), ToolKind::Lasso);

    // PointerDown starts lasso
    let muts = tool.handle(
        &InputEvent::PointerDown {
            x: 10.0,
            y: 10.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(muts.is_empty());
    assert!(tool.active);
    assert_eq!(tool.polygon.len(), 1);

    // PointerMove adds points (must be ≥3px from last)
    tool.handle(
        &InputEvent::PointerMove {
            x: 20.0,
            y: 10.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(tool.polygon.len(), 2);

    tool.handle(
        &InputEvent::PointerMove {
            x: 20.0,
            y: 20.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(tool.polygon.len(), 3);

    // PointerUp ends lasso but polygon stays
    tool.handle(
        &InputEvent::PointerUp {
            x: 20.0,
            y: 20.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert!(!tool.active);
    assert_eq!(tool.polygon.len(), 3, "polygon should remain after up");
}

#[test]
fn lasso_tool_point_in_polygon() {
    let mut tool = LassoTool::new();
    // Create a square polygon: (0,0) → (100,0) → (100,100) → (0,100)
    tool.polygon = vec![(0.0, 0.0), (100.0, 0.0), (100.0, 100.0), (0.0, 100.0)];

    assert!(tool.contains_point(50.0, 50.0), "center should be inside");
    assert!(
        tool.contains_point(10.0, 10.0),
        "near corner should be inside"
    );
    assert!(
        !tool.contains_point(150.0, 50.0),
        "outside right should be outside"
    );
    assert!(
        !tool.contains_point(-10.0, 50.0),
        "outside left should be outside"
    );
    assert!(
        !tool.contains_point(50.0, 150.0),
        "outside bottom should be outside"
    );
}

#[test]
fn lasso_tool_subsampling_skips_close_points() {
    let mut tool = LassoTool::new();
    tool.active = true;
    tool.polygon.push((0.0, 0.0));

    // Move only 1px away — should NOT add point (threshold is 3px → 9px²)
    tool.handle(
        &InputEvent::PointerMove {
            x: 1.0,
            y: 1.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(tool.polygon.len(), 1, "close move should be skipped");

    // Move 5px away — should add point
    tool.handle(
        &InputEvent::PointerMove {
            x: 5.0,
            y: 0.0,
            pressure: 1.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );
    assert_eq!(tool.polygon.len(), 2, "far move should be added");
}

#[test]
fn lasso_tool_clear_resets() {
    let mut tool = LassoTool::new();
    tool.active = true;
    tool.polygon = vec![(1.0, 2.0), (3.0, 4.0), (5.0, 6.0)];

    tool.clear();
    assert!(!tool.active);
    assert!(tool.polygon.is_empty());
}

#[test]
fn lasso_tool_fewer_than_3_points_never_contains() {
    let tool = LassoTool {
        polygon: vec![(0.0, 0.0), (100.0, 100.0)],
        active: false,
    };
    assert!(
        !tool.contains_point(50.0, 50.0),
        "fewer than 3 points should never contain any point"
    );

    let empty_tool = LassoTool::new();
    assert!(!empty_tool.contains_point(0.0, 0.0));
}

#[test]
fn tool_pen_catmull_rom_smoothing() {
    let mut tool = PenTool::new();

    // Need at least 4 points to exercise Catmull-Rom logic properly,
    // although subsampling handles fewer points too, drawing 4 explicit
    // distinct points makes the spline generation robust.

    // Down
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 0.5,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Move 1
    tool.handle(
        &InputEvent::PointerMove {
            x: 10.0,
            y: 5.0,
            pressure: 0.5,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Move 2
    tool.handle(
        &InputEvent::PointerMove {
            x: 20.0,
            y: 15.0,
            pressure: 0.5,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Up
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 30.0,
            y: 10.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Verify the results
    assert_eq!(
        muts.len(),
        3,
        "Expected UpdatePath, SetStrokeWidth, and SetConstraints"
    );

    match &muts[0] {
        GraphMutation::UpdatePath { commands, .. } => {
            // Path should start with a MoveTo
            assert!(
                matches!(commands.first(), Some(PathCmd::MoveTo(_, _))),
                "Path should start with MoveTo"
            );

            // Because of Catmull-Rom logic in `points_to_smooth_bezier`, there should be
            // multiple CubicTo commands generated between the subsampled points.
            let has_cubic = commands
                .iter()
                .any(|cmd| matches!(cmd, PathCmd::CubicTo(_, _, _, _, _, _)));
            assert!(
                has_cubic,
                "Path should contain CubicTo commands for Catmull-Rom smoothing"
            );
        }
        _ => panic!("Expected UpdatePath as first mutation"),
    }
}

#[test]
fn tool_pen_pressure_data_capture() {
    let mut tool = PenTool::new();

    // Start with light pressure
    tool.handle(
        &InputEvent::PointerDown {
            x: 0.0,
            y: 0.0,
            pressure: 0.2, // Light
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Move with heavy pressure
    tool.handle(
        &InputEvent::PointerMove {
            x: 10.0,
            y: 10.0,
            pressure: 0.9, // Heavy
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // Move with medium pressure
    tool.handle(
        &InputEvent::PointerMove {
            x: 20.0,
            y: 20.0,
            pressure: 0.5, // Medium
            modifiers: Modifiers::NONE,
        },
        None,
    );

    // End with light pressure
    // Note: PointerUp doesn't have pressure, but the pointer logic averages the Down/Move points
    let muts = tool.handle(
        &InputEvent::PointerUp {
            x: 30.0,
            y: 30.0,
            modifiers: Modifiers::NONE,
        },
        None,
    );

    assert_eq!(muts.len(), 3);

    match &muts[1] {
        GraphMutation::SetStrokeWidth { width, .. } => {
            // Only 3 points added with pressure data (Down, Move, Move)
            // Average pressure: (0.2 + 0.9 + 0.5) / 3 = 1.6 / 3 = 0.5333...
            // Mapping logic in `pressure_to_stroke_width`: 1.0 + avg_pressure * 3.5
            // 1.0 + 0.5333 * 3.5 = 1.0 + 1.8666... = 2.8666...
            let expected_width = 1.0 + (1.6 / 3.0) * 3.5;
            let diff = (*width - expected_width).abs();
            assert!(
                diff < 0.01,
                "Expected stroke width ~{}, got {}",
                expected_width,
                width
            );
        }
        _ => panic!("Expected SetStrokeWidth as second mutation"),
    }
}
