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
    // We do this by traversing top-down to ensure parent constraints are resolved before children.
    resolve_constraints_top_down(graph, graph.root, &mut bounds, viewport);

    bounds
}

fn resolve_constraints_top_down(
    graph: &SceneGraph,
    node_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
    viewport: Viewport,
) {
    let node = &graph.graph[node_idx];
    for constraint in &node.constraints {
        apply_constraint(graph, node_idx, constraint, bounds, viewport);
    }

    for child_idx in graph.children(node_idx) {
        resolve_constraints_top_down(graph, child_idx, bounds, viewport);
    }
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
        NodeKind::Frame { layout, .. } => layout.clone(),
        _ => LayoutMode::Free,
    };

    match layout {
        LayoutMode::Column { gap, pad } => {
            // Pass 1: initialize children at parent origin + pad, recurse to resolve nested groups
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x + pad,
                        y: parent_bounds.y + pad,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );
                resolve_children(graph, child_idx, bounds, viewport);
            }
            // Pass 2: reposition using resolved sizes, shifting entire subtrees
            let mut y = parent_bounds.y + pad;
            for &child_idx in &children {
                let resolved = bounds[&child_idx];
                let dx = (parent_bounds.x + pad) - resolved.x;
                let dy = y - resolved.y;
                if dx.abs() > 0.001 || dy.abs() > 0.001 {
                    shift_subtree(graph, child_idx, dx, dy, bounds);
                }
                y += bounds[&child_idx].height + gap;
            }
        }
        LayoutMode::Row { gap, pad } => {
            // Pass 1: initialize and recurse
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x + pad,
                        y: parent_bounds.y + pad,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );
                resolve_children(graph, child_idx, bounds, viewport);
            }
            // Pass 2: reposition using resolved widths, shifting subtrees
            let mut x = parent_bounds.x + pad;
            for &child_idx in &children {
                let resolved = bounds[&child_idx];
                let dx = x - resolved.x;
                let dy = (parent_bounds.y + pad) - resolved.y;
                if dx.abs() > 0.001 || dy.abs() > 0.001 {
                    shift_subtree(graph, child_idx, dx, dy, bounds);
                }
                x += bounds[&child_idx].width + gap;
            }
        }
        LayoutMode::Grid { cols, gap, pad } => {
            // Pass 1: initialize and recurse
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x + pad,
                        y: parent_bounds.y + pad,
                        width: child_size.0,
                        height: child_size.1,
                    },
                );
                resolve_children(graph, child_idx, bounds, viewport);
            }
            // Pass 2: reposition using resolved sizes, shifting subtrees
            let mut x = parent_bounds.x + pad;
            let mut y = parent_bounds.y + pad;
            let mut col = 0u32;
            let mut row_height = 0.0f32;

            for &child_idx in &children {
                let resolved = bounds[&child_idx];
                let dx = x - resolved.x;
                let dy = y - resolved.y;
                if dx.abs() > 0.001 || dy.abs() > 0.001 {
                    shift_subtree(graph, child_idx, dx, dy, bounds);
                }

                let resolved = bounds[&child_idx];
                row_height = row_height.max(resolved.height);
                col += 1;
                if col >= cols {
                    col = 0;
                    x = parent_bounds.x + pad;
                    y += row_height + gap;
                    row_height = 0.0;
                } else {
                    x += resolved.width + gap;
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

    // Recurse into children (only for Free mode — Column/Row/Grid already recursed in pass 1)
    if matches!(layout, LayoutMode::Free) {
        for &child_idx in &children {
            resolve_children(graph, child_idx, bounds, viewport);
        }
    }

    // Auto-size groups to the union bounding box of their children + padding
    if matches!(parent_node.kind, NodeKind::Group { .. }) && !children.is_empty() {
        let pad = match &layout {
            LayoutMode::Column { pad, .. }
            | LayoutMode::Row { pad, .. }
            | LayoutMode::Grid { pad, .. } => *pad,
            LayoutMode::Free => 0.0,
        };

        let mut min_x = f32::MAX;
        let mut min_y = f32::MAX;
        let mut max_x = f32::MIN;
        let mut max_y = f32::MIN;

        for &child_idx in &children {
            let child_node = &graph.graph[child_idx];
            let mut rel_x = 0.0;
            let mut rel_y = 0.0;
            for c in &child_node.constraints {
                if let Constraint::Position { x, y } = c {
                    rel_x = *x;
                    rel_y = *y;
                }
            }

            if let Some(cb) = bounds.get(&child_idx) {
                let abs_x = cb.x + rel_x;
                let abs_y = cb.y + rel_y;
                min_x = min_x.min(abs_x);
                min_y = min_y.min(abs_y);
                max_x = max_x.max(abs_x + cb.width);
                max_y = max_y.max(abs_y + cb.height);
            }
        }

        if min_x < f32::MAX {
            // Include padding on all sides: origin moves back by pad,
            // size grows by pad on the trailing edge
            bounds.insert(
                parent_idx,
                ResolvedBounds {
                    x: min_x - pad,
                    y: min_y - pad,
                    width: (max_x - min_x) + 2.0 * pad,
                    height: (max_y - min_y) + 2.0 * pad,
                },
            );
        }
    }
}

/// Recursively shift a node and all its descendants by (dx, dy).
/// Used after pass 2 repositioning to keep subtree positions consistent.
fn shift_subtree(
    graph: &SceneGraph,
    node_idx: NodeIndex,
    dx: f32,
    dy: f32,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
) {
    if let Some(b) = bounds.get(&node_idx).copied() {
        bounds.insert(
            node_idx,
            ResolvedBounds {
                x: b.x + dx,
                y: b.y + dy,
                ..b
            },
        );
    }
    for child_idx in graph.children(node_idx) {
        shift_subtree(graph, child_idx, dx, dy, bounds);
    }
}

/// Get the intrinsic (declared) size of a node.
fn intrinsic_size(node: &SceneNode) -> (f32, f32) {
    match &node.kind {
        NodeKind::Rect { width, height } => (*width, *height),
        NodeKind::Ellipse { rx, ry } => (*rx * 2.0, *ry * 2.0),
        NodeKind::Text { content } => {
            let font_size = node.style.font.as_ref().map_or(14.0, |f| f.size);
            let char_width = font_size * 0.6;
            (content.len() as f32 * char_width, font_size)
        }
        NodeKind::Group { .. } => (0.0, 0.0), // Auto-sized: computed after children resolve
        NodeKind::Frame { width, height, .. } => (*width, *height),
        NodeKind::Path { .. } => (100.0, 100.0), // Computed from path bounds
        NodeKind::Generic => (120.0, 40.0),      // Placeholder label box
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
            let dx = cx - node_bounds.x;
            let dy = cy - node_bounds.y;

            shift_subtree(graph, node_idx, dx, dy, bounds);
        }
        Constraint::Offset { from, dx, dy } => {
            let from_bounds = match graph.index_of(*from).and_then(|i| bounds.get(&i)) {
                Some(b) => *b,
                None => return,
            };
            let target_x = from_bounds.x + dx;
            let target_y = from_bounds.y + dy;
            let sdx = target_x - node_bounds.x;
            let sdy = target_y - node_bounds.y;

            shift_subtree(graph, node_idx, sdx, sdy, bounds);
        }
        Constraint::FillParent { pad } => {
            // Find parent in graph
            let parent_idx = graph
                .graph
                .neighbors_directed(node_idx, petgraph::Direction::Incoming)
                .next();

            if let Some(parent) = parent_idx.and_then(|p| bounds.get(&p).copied()) {
                let target_x = parent.x + pad;
                let target_y = parent.y + pad;
                let new_w = parent.width - 2.0 * pad;
                let new_h = parent.height - 2.0 * pad;
                let dx = target_x - node_bounds.x;
                let dy = target_y - node_bounds.y;

                // Move children with the position shift
                shift_subtree(graph, node_idx, dx, dy, bounds);

                // Apply the resize to the node itself (children keep their sizes)
                if let Some(nb) = bounds.get_mut(&node_idx) {
                    nb.width = new_w;
                    nb.height = new_h;
                }
            }
        }
        Constraint::Position { x, y } => {
            let (px, py) = match graph.parent(node_idx).and_then(|p| bounds.get(&p)) {
                Some(p_bounds) => (p_bounds.x, p_bounds.y),
                None => (0.0, 0.0),
            };
            let target_x = px + *x;
            let target_y = py + *y;
            let dx = target_x - node_bounds.x;
            let dy = target_y - node_bounds.y;

            shift_subtree(graph, node_idx, dx, dy, bounds);
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

    #[test]
    fn layout_group_auto_bounds() {
        let input = r#"
group @container {
  layout: column gap=10 pad=0

  rect @a { w: 100 h: 40 }
  rect @b { w: 80 h: 30 }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let container_idx = graph.index_of(NodeId::intern("container")).unwrap();
        let cb = &bounds[&container_idx];

        // Group should auto-size to cover both children (not hardcoded 200x200)
        assert!(cb.width > 0.0, "group width should be positive");
        assert!(cb.height > 0.0, "group height should be positive");
        // Width should be at least the wider child (100px)
        assert!(
            cb.width >= 100.0,
            "group width ({}) should be >= 100",
            cb.width
        );
        // Height should cover both children + gap (40 + 10 + 30 = 80)
        assert!(
            cb.height >= 80.0,
            "group height ({}) should be >= 80 (children + gap)",
            cb.height
        );
    }

    #[test]
    fn layout_frame_declared_size() {
        let input = r#"
frame @card {
  w: 480 h: 320
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let idx = graph.index_of(NodeId::intern("card")).unwrap();
        let b = &bounds[&idx];

        assert_eq!(b.width, 480.0, "frame should use declared width");
        assert_eq!(b.height, 320.0, "frame should use declared height");
    }

    #[test]
    fn layout_nested_group_auto_size() {
        let input = r#"
group @outer {
  layout: column gap=10 pad=0

  group @inner {
    layout: column gap=5 pad=0

    rect @a { w: 100 h: 40 }
    rect @b { w: 80 h: 30 }
  }
  rect @c { w: 120 h: 50 }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let inner_idx = graph.index_of(NodeId::intern("inner")).unwrap();
        let outer_idx = graph.index_of(NodeId::intern("outer")).unwrap();
        let c_idx = graph.index_of(NodeId::intern("c")).unwrap();

        let inner = bounds[&inner_idx];
        let outer = bounds[&outer_idx];
        let c = bounds[&c_idx];

        // Inner group: height = 40 + 5 + 30 = 75
        assert!(
            inner.height >= 75.0,
            "inner group height ({}) should be >= 75 (children + gap)",
            inner.height
        );

        // @c and @inner should NOT overlap (regardless of order)
        let c_range = c.y..(c.y + c.height);
        let inner_range = inner.y..(inner.y + inner.height);
        assert!(
            c_range.end <= inner_range.start || inner_range.end <= c_range.start,
            "@c [{}, {}] and @inner [{}, {}] should not overlap",
            c.y,
            c.y + c.height,
            inner.y,
            inner.y + inner.height
        );

        // Gap between siblings should be 10
        let gap = if c.y < inner.y {
            inner.y - (c.y + c.height)
        } else {
            c.y - (inner.y + inner.height)
        };
        assert!(
            (gap - 10.0).abs() < 0.01,
            "gap between siblings should be 10, got {gap}"
        );

        // Outer group should contain both @inner and @c
        let outer_bottom = outer.y + outer.height;
        let c_bottom = c.y + c.height;
        let inner_bottom = inner.y + inner.height;
        assert!(
            outer_bottom >= c_bottom && outer_bottom >= inner_bottom,
            "outer bottom ({outer_bottom}) should contain @c ({c_bottom}) and @inner ({inner_bottom})"
        );
    }

    #[test]
    fn layout_group_child_inside_column_parent() {
        let input = r#"
group @wizard {
  layout: column gap=0 pad=0

  rect @card {
    w: 480 h: 520

    group @content {
      layout: column gap=24 pad=40

      rect @illustration { w: 400 h: 240 }
      rect @title { w: 400 h: 20 }
      rect @desc { w: 400 h: 20 }
    }
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let content_idx = graph.index_of(NodeId::intern("content")).unwrap();
        let wizard_idx = graph.index_of(NodeId::intern("wizard")).unwrap();

        let content = bounds[&content_idx];
        let wizard = bounds[&wizard_idx];

        // Content group should auto-size to fit: pad(40) + 240 + gap(24) + 20 + gap(24) + 20 + pad(40) = 408
        assert!(
            content.height >= 280.0,
            "content group height ({}) should be >= 280 (children + gaps)",
            content.height
        );

        // Wizard should contain the content
        let wizard_bottom = wizard.y + wizard.height;
        let content_bottom = content.y + content.height;
        assert!(
            wizard_bottom >= content_bottom,
            "wizard ({wizard_bottom}) should contain content ({content_bottom})"
        );
    }

    #[test]
    fn layout_column_preserves_document_order() {
        let input = r#"
group @card {
  layout: column gap=12 pad=24

  text @heading "Monthly Revenue" {
    font: "Inter" 600 18
  }
  text @amount "$48,250" {
    font: "Inter" 700 36
  }
  rect @button { w: 320 h: 44 }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let heading = bounds[&graph.index_of(NodeId::intern("heading")).unwrap()];
        let amount = bounds[&graph.index_of(NodeId::intern("amount")).unwrap()];
        let button = bounds[&graph.index_of(NodeId::intern("button")).unwrap()];

        assert!(
            heading.y < amount.y,
            "heading (y={}) must be above amount (y={})",
            heading.y,
            amount.y
        );
        assert!(
            amount.y < button.y,
            "amount (y={}) must be above button (y={})",
            amount.y,
            button.y
        );
        // Heading height should use font size (18), not hardcoded 20
        assert!(
            (heading.height - 18.0).abs() < 0.01,
            "heading height should be 18 (font size), got {}",
            heading.height
        );
        // Amount height should use font size (36)
        assert!(
            (amount.height - 36.0).abs() < 0.01,
            "amount height should be 36 (font size), got {}",
            amount.height
        );
    }
}
