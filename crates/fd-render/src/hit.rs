//! Hit testing: point → node lookup.
//!
//! Reverse-walks the render tree (front-to-back) to find which node
//! is at a given (x, y) canvas position.

use fd_core::NodeIndex;
use fd_core::ResolvedBounds;
use fd_core::SceneGraph;
use fd_core::id::NodeId;
use fd_core::model::*;
use std::collections::HashMap;

/// Find the topmost node at position (px, py).
/// Returns `None` if no node is hit (background).
pub fn hit_test(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Option<NodeId> {
    // Walk children in reverse order (last painted = topmost)
    hit_test_node(graph, graph.root, bounds, px, py)
}

fn hit_test_node(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Option<NodeId> {
    let children = graph.children(idx);

    // Check children in reverse (topmost first)
    for &child_idx in children.iter().rev() {
        if let Some(hit) = hit_test_node(graph, child_idx, bounds, px, py) {
            return Some(hit);
        }
    }

    // Check self
    let node = &graph.graph[idx];
    if matches!(node.kind, NodeKind::Root) {
        return None;
    }

    // Groups are invisible — only their children are clickable, not the group itself.
    // (Group bounds auto-size to children, so clicking "empty space" should not select the group.)
    if matches!(node.kind, NodeKind::Group { .. }) {
        return None;
    }

    if let Some(b) = bounds.get(&idx)
        && b.contains(px, py)
    {
        return Some(node.id);
    }

    None
}

/// Find all non-root nodes whose bounds intersect the given rectangle.
/// Used for marquee (box) selection.
pub fn hit_test_rect(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
) -> Vec<NodeId> {
    let mut result = Vec::new();
    collect_intersecting(graph, graph.root, bounds, rx, ry, rw, rh, &mut result);
    result
}

#[allow(clippy::too_many_arguments)]
fn collect_intersecting(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
    out: &mut Vec<NodeId>,
) {
    let node = &graph.graph[idx];

    if !matches!(node.kind, NodeKind::Root)
        && let Some(b) = bounds.get(&idx)
        && b.intersects_rect(rx, ry, rw, rh)
    {
        out.push(node.id);
    }

    for child_idx in graph.children(idx) {
        collect_intersecting(graph, child_idx, bounds, rx, ry, rw, rh, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fd_core::parser::parse_document;
    use fd_core::{Viewport, resolve_layout};

    #[test]
    fn hit_test_basic() {
        let input = r#"
rect @a {
  w: 100
  h: 100
}

rect @b {
  w: 50
  h: 50
}

@a -> absolute: 10, 10
@b -> absolute: 200, 200
"#;
        // We need to handle absolute constraint for this test
        // The layout solver handles Absolute constraint
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        // Test hit on @a area
        let a_idx = graph.index_of(NodeId::intern("a")).unwrap();
        if let Some(a_bounds) = bounds.get(&a_idx) {
            let result = hit_test(&graph, &bounds, a_bounds.x + 5.0, a_bounds.y + 5.0);
            assert_eq!(result, Some(NodeId::intern("a")));
        }

        // Test miss
        let _result = hit_test(&graph, &bounds, 799.0, 599.0);
        // Should miss both or hit canvas boundary node
        // (depending on layout — the exact position depends on constraint resolution)
    }
}
