use super::*;
use fd_core::id::NodeId;
use fd_core::layout::Viewport;
use fd_editor::input::PointerType;
use fd_editor::sync::SyncEngine;
use fd_editor::tools::ResizeHandle;

#[test]
fn test_hit_test_resize_handle() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    // Directly inject engine state
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let text = r#"rect @a {
  place: 100 100
  w: 100
  h: 50
}"#;
    canvas.engine = SyncEngine::from_text(text, viewport).unwrap();
    let id = NodeId::intern("a");
    let idx = canvas.engine.graph.index_of(id).unwrap();
    let bounds = canvas.engine.current_bounds().get(&idx).unwrap();

    canvas.select_tool.selected = vec![id];

    let bx = bounds.x;
    let by = bounds.y;
    let bw = bounds.width;
    let bh = bounds.height;

    // TopLeft
    assert_eq!(
        canvas.hit_test_resize_handle(bx, by),
        Some(ResizeHandle::TopLeft)
    );
    // TopRight
    assert_eq!(
        canvas.hit_test_resize_handle(bx + bw, by),
        Some(ResizeHandle::TopRight)
    );
    // BottomRight
    assert_eq!(
        canvas.hit_test_resize_handle(bx + bw, by + bh),
        Some(ResizeHandle::BottomRight)
    );
    // BottomLeft
    assert_eq!(
        canvas.hit_test_resize_handle(bx, by + bh),
        Some(ResizeHandle::BottomLeft)
    );

    // Midpoints
    assert_eq!(
        canvas.hit_test_resize_handle(bx + bw / 2.0, by),
        Some(ResizeHandle::TopCenter)
    );
    assert_eq!(
        canvas.hit_test_resize_handle(bx, by + bh / 2.0),
        Some(ResizeHandle::MiddleLeft)
    );
    assert_eq!(
        canvas.hit_test_resize_handle(bx + bw, by + bh / 2.0),
        Some(ResizeHandle::MiddleRight)
    );
    assert_eq!(
        canvas.hit_test_resize_handle(bx + bw / 2.0, by + bh),
        Some(ResizeHandle::BottomCenter)
    );

    assert_eq!(canvas.hit_test_resize_handle(500.0, 500.0), None);
}

#[test]
fn test_hit_test_resize_handle_text_node() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let text = r#"text @t {
  place: 100 100
  w: 100
  h: 50
}"#;
    canvas.engine = SyncEngine::from_text(text, viewport).unwrap();
    let id = NodeId::intern("t");
    let idx = canvas.engine.graph.index_of(id).unwrap();
    let bounds = canvas.engine.current_bounds().get(&idx).unwrap();

    canvas.select_tool.selected = vec![id];

    let bx = bounds.x;
    let by = bounds.y;
    let bw = bounds.width;
    let bh = bounds.height;

    // Text nodes only have mid-left and mid-right handles
    assert_eq!(
        canvas.hit_test_resize_handle(bx, by + bh / 2.0),
        Some(ResizeHandle::MiddleLeft)
    );
    assert_eq!(
        canvas.hit_test_resize_handle(bx + bw, by + bh / 2.0),
        Some(ResizeHandle::MiddleRight)
    );

    // Corners should be None for text (far enough away vertically)
    assert_eq!(canvas.hit_test_resize_handle(bx, by - 50.0), None);
    assert_eq!(canvas.hit_test_resize_handle(bx + bw, by - 50.0), None);
}

#[test]
fn test_hit_test_resize_handle_touch_pointer() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let text = r#"rect @a {
  place: 100 100
  w: 100
  h: 50
}"#;
    canvas.engine = SyncEngine::from_text(text, viewport).unwrap();
    let id = NodeId::intern("a");
    let idx = canvas.engine.graph.index_of(id).unwrap();
    let bounds = canvas.engine.current_bounds().get(&idx).unwrap();

    canvas.select_tool.selected = vec![id];
    canvas.pointer_type = PointerType::Touch; // Touch should only have corners

    let bx = bounds.x;
    let by = bounds.y;
    let bw = bounds.width;
    let _bh = bounds.height;

    // Corners are present
    assert_eq!(
        canvas.hit_test_resize_handle(bx, by),
        Some(ResizeHandle::TopLeft)
    );

    // Midpoints are skipped for touch
    assert_eq!(canvas.hit_test_resize_handle(bx + bw / 2.0, by), None);
}

#[test]
fn test_hit_test_resize_handle_edge() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    // Just use point anchors so we don't depend on node center math
    let text = r#"edge @e { from: 100 100 to: 300 200 }"#;
    canvas.engine = SyncEngine::from_text(text, viewport).unwrap();
    let id = NodeId::intern("e");

    canvas.select_tool.selected = vec![id];

    // Start Handle
    assert_eq!(
        canvas.hit_test_resize_handle(100.0, 100.0),
        Some(ResizeHandle::EdgeStart)
    );
    // End Handle
    // Edge hit test returns Start if both hit within radius (say if length=0),
    // but here length is long so End Handle works
    assert_eq!(
        canvas.hit_test_resize_handle(300.0, 200.0),
        Some(ResizeHandle::EdgeEnd)
    );

    // Midpoint should not be a handle
    assert_eq!(canvas.hit_test_resize_handle(200.0, 150.0), None);
}
