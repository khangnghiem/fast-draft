#[cfg(test)]
mod tests {
    use crate::excalidraw::emit_excalidraw;
    use crate::id::NodeId;
    use crate::model::{Color, Edge, EdgeAnchor, NodeKind, Paint, SceneGraph, SceneNode};
    use serde_json::Value;

    #[test]
    fn test_emit_excalidraw_basic() {
        let mut sg = SceneGraph::new();
        let mut rect = SceneNode::new(
            NodeId::intern("my_rect"),
            NodeKind::Rect {
                width: 100.0,
                height: 50.0,
            },
        );
        rect.style.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
        sg.add_node(sg.root, rect);

        let json_str = emit_excalidraw(&sg);
        let parsed: Value = serde_json::from_str(&json_str).expect("Valid JSON");

        assert_eq!(parsed["type"], "excalidraw");
        assert_eq!(parsed["elements"].as_array().unwrap().len(), 1);

        let el = &parsed["elements"][0];
        assert_eq!(el["id"], "my_rect");
        assert_eq!(el["type"], "rectangle");
        assert_eq!(el["width"], 100.0);
        assert_eq!(el["height"], 50.0);
        assert_eq!(el["backgroundColor"], "#FF0000"); // extracted hex
    }
}
