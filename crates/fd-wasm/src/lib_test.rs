use crate::*;
use fd_editor::tools::ResizeHandle;

#[test]
fn tool_hit_test_resize_handle() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    let text = r#"
rect @box {
w: 100
h: 100
x: 50
y: 50
}
text @txt {
w: 50
h: 50
x: 200
y: 200
}
group @grp {
w: 100
h: 100
x: 300
y: 300
}
"#;
    canvas.set_text(text);

    // Select the box
    canvas.handle_pointer_down(55.0, 55.0, 1.0, false, false, false, false);
    canvas.handle_pointer_up(55.0, 55.0, false, false, false, false);

    assert!(canvas.select_tool.first_selected().is_some());

    assert_eq!(canvas.hit_test_resize_handle(50.0, 50.0), Some(ResizeHandle::TopLeft));
    assert_eq!(canvas.hit_test_resize_handle(100.0, 50.0), Some(ResizeHandle::TopCenter));
    assert_eq!(canvas.hit_test_resize_handle(150.0, 50.0), Some(ResizeHandle::TopRight));
    assert_eq!(canvas.hit_test_resize_handle(50.0, 100.0), Some(ResizeHandle::MiddleLeft));
    assert_eq!(canvas.hit_test_resize_handle(150.0, 100.0), Some(ResizeHandle::MiddleRight));
    assert_eq!(canvas.hit_test_resize_handle(50.0, 150.0), Some(ResizeHandle::BottomLeft));
    assert_eq!(canvas.hit_test_resize_handle(100.0, 150.0), Some(ResizeHandle::BottomCenter));
    assert_eq!(canvas.hit_test_resize_handle(150.0, 150.0), Some(ResizeHandle::BottomRight));

    // Hit test outside
    assert_eq!(canvas.hit_test_resize_handle(10.0, 10.0), None);

    // Select the text
    canvas.handle_pointer_down(205.0, 205.0, 1.0, false, false, false, false);
    canvas.handle_pointer_up(205.0, 205.0, false, false, false, false);

    let id = fd_core::id::NodeId::intern("txt");
    let idx = canvas.engine.graph.index_of(id).unwrap();
    let b = canvas.engine.current_bounds().get(&idx).unwrap().clone();

    assert_eq!(canvas.hit_test_resize_handle(b.x, b.y + b.height / 2.0), Some(ResizeHandle::MiddleLeft));
    assert_eq!(canvas.hit_test_resize_handle(b.x + b.width, b.y + b.height / 2.0), Some(ResizeHandle::MiddleRight));
    assert_eq!(canvas.hit_test_resize_handle(b.x, b.y), None); // Top left has no handle on text

    // Select the group
    canvas.handle_pointer_down(305.0, 305.0, 1.0, false, false, false, false);
    canvas.handle_pointer_up(305.0, 305.0, false, false, false, false);

    // Groups don't have resize handles in this implementation
    assert_eq!(canvas.hit_test_resize_handle(300.0, 300.0), None);
}

#[test]
fn sync_update_text_metrics_basic() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    let text = r#"
text @txt {
    x: 100
    y: 100
}
"#;
    canvas.set_text(text);

    // Simulate measuring text in JS
    let measured_width = 120.0;
    let measured_height = 24.0;

    let changed = canvas.update_text_metrics("txt", measured_width, measured_height);
    assert!(changed);

    // After update, we should force a layout evaluation to see the results
    let id = fd_core::id::NodeId::intern("txt");
    let idx = canvas.engine.graph.index_of(id).unwrap();

    // We expect the width/height constraint to have been set on the node
    let b = canvas.engine.current_bounds().get(&idx).unwrap().clone();

    // The metric update adds 2.0 * 2.0 = 4.0 padding per dimension
    let expected_width = measured_width as f32 + 4.0;
    let expected_height = measured_height as f32 + 4.0;

    assert_eq!(b.width, expected_width);
    assert_eq!(b.height, expected_height);

    // Update again with same metrics should return false (no change)
    let changed2 = canvas.update_text_metrics("txt", measured_width, measured_height);
    assert!(!changed2);
}

#[test]
fn sync_update_text_metrics_with_max_width() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    let text = r#"
text @txt {
    w: 200
    x: 100
    y: 100
}
"#;
    canvas.set_text(text);

    // Simulate measuring text in JS
    let measured_width = 120.0;
    let measured_height = 48.0;

    canvas.update_text_metrics("txt", measured_width, measured_height);

    let id = fd_core::id::NodeId::intern("txt");
    let idx = canvas.engine.graph.index_of(id).unwrap();
    let b = canvas.engine.current_bounds().get(&idx).unwrap().clone();

    // The metric update adds 4.0 padding
    // max_width is 200.0 from the initial w: 200
    let expected_width = 200.0;
    let expected_height = measured_height as f32 + 4.0;

    assert_eq!(b.width, expected_width);
    assert_eq!(b.height, expected_height);
}

#[test]
fn sync_update_text_metrics_in_managed_layout() {
    let mut canvas = FdCanvas::new(800.0, 600.0);
    // Node is inside a column, which is a managed layout
    let text = r#"
frame @col {
    layout: column
    w: 500

    text @txt {
        fill: #000
    }
}
"#;
    canvas.set_text(text);


    let id = fd_core::id::NodeId::intern("txt");
    let idx = canvas.engine.graph.index_of(id).unwrap();
    let initial_b = canvas.engine.current_bounds().get(&idx).unwrap().clone();

    // Width should be stretched to column width (500)
    assert_eq!(initial_b.width, 500.0);

    // Measure a narrower text
    let measured_width = 120.0;
    let measured_height = 24.0;

    canvas.update_text_metrics("txt", measured_width, measured_height);

    let final_b = canvas.engine.current_bounds().get(&idx).unwrap().clone();

    // Because it's in a managed layout, the width shouldn't shrink below what the layout assigned
    assert_eq!(final_b.width, 500.0); // Kept the layout width
    assert_eq!(final_b.height, measured_height as f32 + 4.0); // Height should update
}
