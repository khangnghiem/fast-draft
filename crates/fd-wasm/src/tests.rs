#[cfg(test)]
mod tests {
    use crate::FdCanvas;
    use fd_core::id::NodeId;
    use fd_core::layout::Viewport;
    use fd_core::model::{NodeKind, ResolvedBounds, SceneGraph, SceneNode};
    use fd_editor::{sync::SyncEngine, tools::ResizeHandle};

    fn setup_canvas(node_kind: NodeKind) -> FdCanvas {
        let mut graph = SceneGraph::new();
        let id = NodeId::intern("test_node");
        let node = SceneNode::new(id, node_kind);
        let node_idx = graph.add_node(graph.root, node);

        let mut engine = SyncEngine::new(Viewport {
            width: 800.0,
            height: 600.0,
        });
        engine.graph = graph;

        let mut bounds = std::collections::HashMap::new();
        bounds.insert(
            node_idx,
            ResolvedBounds {
                x: 100.0,
                y: 100.0,
                width: 200.0,
                height: 100.0,
            },
        );

        *engine.bounds_mut() = bounds;

        let mut canvas = FdCanvas::new(800.0, 600.0);
        canvas.engine = engine;
        canvas.select_tool.selected = vec![id];
        canvas
    }

    #[test]
    fn hit_test_resize_handle_rect() {
        let canvas = setup_canvas(NodeKind::Rect {
            width: 200.0,
            height: 100.0,
        });

        // Test top-left corner
        assert_eq!(
            canvas.hit_test_resize_handle(100.0, 100.0),
            Some(ResizeHandle::TopLeft)
        );

        // Test top-right corner
        assert_eq!(
            canvas.hit_test_resize_handle(300.0, 100.0),
            Some(ResizeHandle::TopRight)
        );

        // Test bottom-right corner
        assert_eq!(
            canvas.hit_test_resize_handle(300.0, 200.0),
            Some(ResizeHandle::BottomRight)
        );

        // Test bottom-left corner
        assert_eq!(
            canvas.hit_test_resize_handle(100.0, 200.0),
            Some(ResizeHandle::BottomLeft)
        );

        // Test mid-points
        assert_eq!(
            canvas.hit_test_resize_handle(200.0, 100.0),
            Some(ResizeHandle::TopCenter)
        );
        assert_eq!(
            canvas.hit_test_resize_handle(200.0, 200.0),
            Some(ResizeHandle::BottomCenter)
        );
        assert_eq!(
            canvas.hit_test_resize_handle(100.0, 150.0),
            Some(ResizeHandle::MiddleLeft)
        );
        assert_eq!(
            canvas.hit_test_resize_handle(300.0, 150.0),
            Some(ResizeHandle::MiddleRight)
        );

        // Test miss
        assert_eq!(canvas.hit_test_resize_handle(200.0, 150.0), None);
        assert_eq!(canvas.hit_test_resize_handle(0.0, 0.0), None);
    }

    #[test]
    fn hit_test_resize_handle_text() {
        let canvas = setup_canvas(NodeKind::Text {
            content: "hello".to_string(),
            max_width: None,
        });

        // Text nodes only have middle-left and middle-right handles
        assert_eq!(
            canvas.hit_test_resize_handle(100.0, 150.0),
            Some(ResizeHandle::MiddleLeft)
        );
        assert_eq!(
            canvas.hit_test_resize_handle(300.0, 150.0),
            Some(ResizeHandle::MiddleRight)
        );

        // Corners should miss
        assert_eq!(canvas.hit_test_resize_handle(100.0, 100.0), None);
        assert_eq!(canvas.hit_test_resize_handle(300.0, 100.0), None);
        assert_eq!(canvas.hit_test_resize_handle(300.0, 200.0), None);
        assert_eq!(canvas.hit_test_resize_handle(100.0, 200.0), None);
    }

    #[test]
    fn hit_test_resize_handle_group() {
        let canvas = setup_canvas(NodeKind::Group);

        // Groups do not have resize handles
        assert_eq!(canvas.hit_test_resize_handle(100.0, 100.0), None);
        assert_eq!(canvas.hit_test_resize_handle(300.0, 200.0), None);
        assert_eq!(canvas.hit_test_resize_handle(200.0, 150.0), None);
    }
}
