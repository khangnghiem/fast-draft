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
fn select_tool_alt_click_produces_duplicate() {
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
    assert_eq!(mutations.len(), 1);
    match &mutations[0] {
        GraphMutation::DuplicateNode { id } => {
            assert_eq!(*id, target);
        }
        _ => panic!("expected DuplicateNode"),
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
            assert!(node.style.stroke.is_some(), "rect should have default stroke");
            let stroke = node.style.stroke.as_ref().unwrap();
            assert!((stroke.width - 2.5).abs() < 0.01, "stroke width should be 2.5");
            // Should have corner radius
            assert_eq!(node.style.corner_radius, Some(8.0), "rect corner_radius=8");
            // Fill should be None (transparent)
            assert!(node.style.fill.is_none(), "fill should be None (transparent)");
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
            assert!(node.style.stroke.is_some(), "ellipse should have default stroke");
            let stroke = node.style.stroke.as_ref().unwrap();
            assert!((stroke.width - 2.5).abs() < 0.01, "stroke width should be 2.5");
            // No corner radius for ellipse
            assert!(node.style.corner_radius.is_none(), "ellipse has no corner_radius");
            // Fill should be None (transparent)
            assert!(node.style.fill.is_none(), "fill should be None (transparent)");
        }
        _ => panic!("expected AddNode"),
    }
}
