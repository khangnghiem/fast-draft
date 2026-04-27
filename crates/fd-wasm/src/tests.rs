#[cfg(test)]
#[allow(clippy::module_inception)]
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

    #[test]
    fn test_eraser_rebuilds_spatial_index() {
        let mut canvas = setup_canvas(NodeKind::Rect {
            width: 200.0,
            height: 100.0,
        });

        let id = NodeId::intern("test_node");
        assert!(
            canvas.engine.graph.index_of(id).is_some(),
            "Node should exist initially"
        );

        // Build the spatial index initially
        canvas.rebuild_spatial_index();
        let hit = canvas.hit_test(150.0, 150.0);
        assert_eq!(hit, Some(id), "Spatial index should find the node");

        // Erase the node immediately (this should trigger self.rebuild_spatial_index internally)
        canvas.erase_node_immediately(id);

        // Verify it was removed from the scene graph
        assert!(
            canvas.engine.graph.index_of(id).is_none(),
            "Node should be removed from graph"
        );

        // Now test the spatial index again at the same location. It should be empty (None).
        // If rebuild_spatial_index was skipped, it would still return Some(id).
        let hit_after = canvas.hit_test(150.0, 150.0);
        assert_eq!(hit_after, None, "Ghost bounding box should be gone");
    }

    #[test]
    fn ai_preview_discard_restores_text_and_selection() {
        let baseline = r##"rect @hero {
  w: 120 h: 80
  fill: #FF0000
}"##;
        let candidate = r##"rect @hero {
  w: 120 h: 80
  fill: #00FF00
}"##;
        let mut canvas = FdCanvas::new(800.0, 600.0);
        assert!(canvas.set_text(baseline).contains(r#""ok":true"#));
        assert!(canvas.select_by_id("hero"));

        let begin = canvas.ai_begin_preview();
        let baseline_id = serde_json::from_str::<serde_json::Value>(&begin).unwrap()["baselineId"]
            .as_str()
            .unwrap()
            .to_string();
        let apply = canvas.ai_apply_preview(&baseline_id, candidate);

        assert!(apply.contains(r#""ok":true"#));
        assert!(canvas.get_text().contains("#00FF00"));
        assert!(canvas.ai_discard_preview(&baseline_id));
        assert_eq!(canvas.get_text(), baseline);
        assert_eq!(canvas.get_selected_ids(), r#"["hero"]"#);
    }

    #[test]
    fn ai_preview_commit_is_one_undoable_snapshot() {
        let baseline = r##"rect @hero {
  w: 120 h: 80
  fill: #FF0000
}"##;
        let candidate = r##"rect @hero {
  w: 120 h: 80
  fill: #00FF00
}"##;
        let mut canvas = FdCanvas::new(800.0, 600.0);
        assert!(canvas.set_text(baseline).contains(r#""ok":true"#));

        let begin = canvas.ai_begin_preview();
        let baseline_id = serde_json::from_str::<serde_json::Value>(&begin).unwrap()["baselineId"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(
            canvas
                .ai_apply_preview(&baseline_id, candidate)
                .contains(r#""ok":true"#)
        );
        assert!(
            canvas
                .ai_commit_preview(&baseline_id, "AI Touch")
                .contains(r#""ok":true"#)
        );

        assert_eq!(canvas.get_text(), candidate);
        assert!(canvas.undo());
        assert_eq!(canvas.get_text(), baseline);
        assert!(canvas.redo());
        assert_eq!(canvas.get_text(), candidate);
    }

    #[test]
    fn ai_preview_noop_candidate_returns_noop_and_keeps_baseline() {
        let baseline = r##"rect @hero {
  w: 120 h: 80
  fill: #FF0000
}"##;
        let mut canvas = FdCanvas::new(800.0, 600.0);
        assert!(canvas.set_text(baseline).contains(r#""ok":true"#));

        let begin = canvas.ai_begin_preview();
        let baseline_id = serde_json::from_str::<serde_json::Value>(&begin).unwrap()["baselineId"]
            .as_str()
            .unwrap()
            .to_string();

        let apply = canvas.ai_apply_preview(&baseline_id, &format!("\n{}\n", baseline));
        let apply_json = serde_json::from_str::<serde_json::Value>(&apply).unwrap();
        assert_eq!(apply_json["ok"], serde_json::Value::Bool(false));
        assert_eq!(
            apply_json["error"],
            serde_json::Value::String("No changes from AI".to_string())
        );
        assert_eq!(apply_json["noop"], serde_json::Value::Bool(true));
        assert_eq!(canvas.get_text(), baseline);

        let commit = canvas.ai_commit_preview(&baseline_id, "AI Touch");
        let commit_json = serde_json::from_str::<serde_json::Value>(&commit).unwrap();
        assert_eq!(commit_json["ok"], serde_json::Value::Bool(false));
        assert_eq!(
            commit_json["error"],
            serde_json::Value::String("No candidate preview to commit".to_string())
        );
    }

    #[test]
    fn ai_preview_parse_failure_does_not_reset_existing_candidate() {
        let baseline = r##"rect @hero {
  w: 120 h: 80
  fill: #FF0000
}"##;
        let candidate = r##"rect @hero {
  w: 120 h: 80
  fill: #00FF00
}"##;
        let mut canvas = FdCanvas::new(800.0, 600.0);
        assert!(canvas.set_text(baseline).contains(r#""ok":true"#));

        let begin = canvas.ai_begin_preview();
        let baseline_id = serde_json::from_str::<serde_json::Value>(&begin).unwrap()["baselineId"]
            .as_str()
            .unwrap()
            .to_string();

        let first_apply = canvas.ai_apply_preview(&baseline_id, candidate);
        assert!(first_apply.contains(r#""ok":true"#));
        assert_eq!(canvas.get_text(), candidate);

        let second_apply = canvas.ai_apply_preview(&baseline_id, "rect @broken {");
        assert!(second_apply.contains(r#""ok":false"#));
        assert_eq!(canvas.get_text(), candidate);

        let commit = canvas.ai_commit_preview(&baseline_id, "AI Touch");
        assert!(commit.contains(r#""ok":true"#));
        assert_eq!(canvas.get_text(), candidate);
    }

    #[test]
    fn ai_preview_commit_requires_applied_candidate() {
        let baseline = r##"rect @hero {
  w: 120 h: 80
  fill: #FF0000
}"##;
        let mut canvas = FdCanvas::new(800.0, 600.0);
        assert!(canvas.set_text(baseline).contains(r#""ok":true"#));

        let begin = canvas.ai_begin_preview();
        let baseline_id = serde_json::from_str::<serde_json::Value>(&begin).unwrap()["baselineId"]
            .as_str()
            .unwrap()
            .to_string();

        let commit = canvas.ai_commit_preview(&baseline_id, "AI Touch");
        let commit_json = serde_json::from_str::<serde_json::Value>(&commit).unwrap();
        assert_eq!(commit_json["ok"], serde_json::Value::Bool(false));
        assert_eq!(
            commit_json["error"],
            serde_json::Value::String("No candidate preview to commit".to_string())
        );
        assert_eq!(canvas.get_text(), baseline);
    }

    #[test]
    fn ai_preview_invalid_candidate_leaves_baseline_active() {
        let baseline = r##"rect @hero {
  w: 120 h: 80
  fill: #FF0000
}"##;
        let mut canvas = FdCanvas::new(800.0, 600.0);
        assert!(canvas.set_text(baseline).contains(r#""ok":true"#));

        let begin = canvas.ai_begin_preview();
        let baseline_id = serde_json::from_str::<serde_json::Value>(&begin).unwrap()["baselineId"]
            .as_str()
            .unwrap()
            .to_string();
        let apply = canvas.ai_apply_preview(&baseline_id, "rect @broken {");

        assert!(apply.contains(r#""ok":false"#));
        assert_eq!(canvas.get_text(), baseline);
    }
}
