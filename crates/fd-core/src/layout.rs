//! Constraint-based layout solver.
//!
//! Converts relative constraints (center_in, offset, fill_parent) into
//! absolute `ResolvedBounds` for each node. Also handles Column/Row/Grid
//! layout modes for groups.

use crate::model::*;
use petgraph::graph::NodeIndex;
use std::collections::HashMap;

/// The canvas (viewport) dimensions.
#[derive(Debug, Clone, Copy)]
pub struct Viewport {
    pub width: f32,
    pub height: f32,
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 600.0,
        }
    }
}

/// Resolve all node positions in the scene graph.
///
/// Returns a map from `NodeIndex` → `ResolvedBounds` with absolute positions.
pub fn resolve_layout(
    graph: &SceneGraph,
    viewport: Viewport,
) -> HashMap<NodeIndex, ResolvedBounds> {
    let mut bounds: HashMap<NodeIndex, ResolvedBounds> = HashMap::new();

    // Root fills the viewport
    bounds.insert(
        graph.root,
        ResolvedBounds {
            x: 0.0,
            y: 0.0,
            width: viewport.width,
            height: viewport.height,
        },
    );

    // Resolve recursively from root
    resolve_children(graph, graph.root, &mut bounds, viewport);

    // Apply top-level constraints (may override layout-computed positions)
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        for constraint in &node.constraints {
            apply_constraint(graph, idx, constraint, &mut bounds, viewport);
        }
    }

    bounds
}

#[allow(clippy::only_used_in_recursion)]
fn resolve_children(
    graph: &SceneGraph,
    parent_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
    viewport: Viewport,
) {
    let parent_bounds = bounds[&parent_idx];
    let parent_node = &graph.graph[parent_idx];

    let children: Vec<NodeIndex> = graph.children(parent_idx);
    if children.is_empty() {
        return;
    }

    // Determine layout mode
    let layout = match &parent_node.kind {
        NodeKind::Group { layout } => layout.clone(),
        _ => LayoutMode::Free,
    };

    match layout {
        LayoutMode::Column { gap, pad } => {
            let mut y = parent_bounds.y + pad;
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x + pad,
                        y,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );
                y += child_size.1 + gap;
            }
        }
        LayoutMode::Row { gap, pad } => {
            let mut x = parent_bounds.x + pad;
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x,
                        y: parent_bounds.y + pad,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );
                x += child_size.0 + gap;
            }
        }
        LayoutMode::Grid { cols, gap, pad } => {
            let mut x = parent_bounds.x + pad;
            let mut y = parent_bounds.y + pad;
            let mut col = 0u32;
            let mut row_height = 0.0f32;

            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x,
                        y,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );

                row_height = row_height.max(child_size.1);
                col += 1;
                if col >= cols {
                    col = 0;
                    x = parent_bounds.x + pad;
                    y += row_height + gap;
                    row_height = 0.0;
                } else {
                    x += child_size.0 + gap;
                }
            }
        }
        LayoutMode::Free => {
            // Each child positioned at parent origin by default
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x,
                        y: parent_bounds.y,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );
            }
        }
    }

    // Recurse into children
    for &child_idx in &children {
        resolve_children(graph, child_idx, bounds, viewport);
    }
}

/// Get the intrinsic (declared) size of a node.
fn intrinsic_size(node: &SceneNode) -> (f32, f32) {
    match &node.kind {
        NodeKind::Rect { width, height } => (*width, *height),
        NodeKind::Ellipse { rx, ry } => (*rx * 2.0, *ry * 2.0),
        NodeKind::Text { content } => {
            // Rough estimate: 8px per char, 20px height. Real text layout comes later.
            (content.len() as f32 * 8.0, 20.0)
        }
        NodeKind::Group { .. } => (200.0, 200.0), // Groups size to content eventually
        NodeKind::Path { .. } => (100.0, 100.0),  // Computed from path bounds
        NodeKind::Generic => (120.0, 40.0),       // Placeholder label box
        NodeKind::Root => (0.0, 0.0),
    }
}

fn apply_constraint(
    graph: &SceneGraph,
    node_idx: NodeIndex,
    constraint: &Constraint,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
    viewport: Viewport,
) {
    let node_bounds = match bounds.get(&node_idx) {
        Some(b) => *b,
        None => return,
    };

    match constraint {
        Constraint::CenterIn(target_id) => {
            let container = if target_id.as_str() == "canvas" {
                ResolvedBounds {
                    x: 0.0,
                    y: 0.0,
                    width: viewport.width,
                    height: viewport.height,
                }
            } else {
                match graph.index_of(*target_id).and_then(|i| bounds.get(&i)) {
                    Some(b) => *b,
                    None => return,
                }
            };

            let cx = container.x + (container.width - node_bounds.width) / 2.0;
            let cy = container.y + (container.height - node_bounds.height) / 2.0;

            bounds.insert(
                node_idx,
                ResolvedBounds {
                    x: cx,
                    y: cy,
                    ..node_bounds
                },
            );
        }
        Constraint::Offset { from, dx, dy } => {
            let from_bounds = match graph.index_of(*from).and_then(|i| bounds.get(&i)) {
                Some(b) => *b,
                None => return,
            };
            bounds.insert(
                node_idx,
                ResolvedBounds {
                    x: from_bounds.x + dx,
                    y: from_bounds.y + dy,
                    ..node_bounds
                },
            );
        }
        Constraint::FillParent { pad } => {
            // Find parent in graph
            let parent_idx = graph
                .graph
                .neighbors_directed(node_idx, petgraph::Direction::Incoming)
                .next();

            if let Some(parent) = parent_idx.and_then(|p| bounds.get(&p)) {
                bounds.insert(
                    node_idx,
                    ResolvedBounds {
                        x: parent.x + pad,
                        y: parent.y + pad,
                        width: parent.width - 2.0 * pad,
                        height: parent.height - 2.0 * pad,
                    },
                );
            }
        }
        Constraint::Absolute { x, y } => {
            bounds.insert(
                node_idx,
                ResolvedBounds {
                    x: *x,
                    y: *y,
                    ..node_bounds
                },
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::NodeId;
    use crate::parser::parse_document;

    #[test]
    fn layout_column() {
        let input = r#"
group @form {
  layout: column gap=10 pad=20

  rect @a { w: 100 h: 40 }
  rect @b { w: 100 h: 30 }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let a_idx = graph.index_of(NodeId::intern("a")).unwrap();
        let b_idx = graph.index_of(NodeId::intern("b")).unwrap();

        let a = bounds[&a_idx];
        let b = bounds[&b_idx];

        // Both should be at x = pad (20)
        assert!(
            (a.x - 20.0).abs() < 0.01,
            "a.x should be 20 (pad), got {}",
            a.x
        );
        assert!(
            (b.x - 20.0).abs() < 0.01,
            "b.x should be 20 (pad), got {}",
            b.x
        );

        // The two children should be exactly (height_of_first + gap) apart
        let gap_plus_height = (b.y - a.y).abs();
        // Either a is first (gap = 40 + 10 = 50) or b is first (gap = 30 + 10 = 40)
        assert!(
            (gap_plus_height - 50.0).abs() < 0.01 || (gap_plus_height - 40.0).abs() < 0.01,
            "children should be height+gap apart, got diff = {gap_plus_height}"
        );
    }

    #[test]
    fn layout_center_in_canvas() {
        let input = r#"
rect @box {
  w: 200
  h: 100
}

@box -> center_in: canvas
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let idx = graph.index_of(NodeId::intern("box")).unwrap();
        let b = bounds[&idx];

        assert!((b.x - 300.0).abs() < 0.01); // (800 - 200) / 2
        assert!((b.y - 250.0).abs() < 0.01); // (600 - 100) / 2
    }
}
