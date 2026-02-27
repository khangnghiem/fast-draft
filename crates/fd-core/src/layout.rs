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

    // Final pass: re-compute group auto-sizes after constraints shifted children.
    // This ensures free-layout groups correctly contain children with Position constraints.
    recompute_group_auto_sizes(graph, graph.root, &mut bounds);

    bounds
}

fn resolve_constraints_top_down(
    graph: &SceneGraph,
    node_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
    viewport: Viewport,
) {
    let node = &graph.graph[node_idx];
    let parent_managed = is_parent_managed(graph, node_idx);
    for constraint in &node.constraints {
        // Skip Position constraints for children inside managed layouts —
        // the Column/Row/Grid layout mode owns child positioning.
        if parent_managed && matches!(constraint, Constraint::Position { .. }) {
            continue;
        }
        apply_constraint(graph, node_idx, constraint, bounds, viewport);
    }

    for child_idx in graph.children(node_idx) {
        resolve_constraints_top_down(graph, child_idx, bounds, viewport);
    }
}

/// Check whether a node's parent uses a managed layout (Column/Row/Grid).
fn is_parent_managed(graph: &SceneGraph, node_idx: NodeIndex) -> bool {
    let parent_idx = match graph.parent(node_idx) {
        Some(p) => p,
        None => return false,
    };
    let parent_node = &graph.graph[parent_idx];
    match &parent_node.kind {
        NodeKind::Group { layout } | NodeKind::Frame { layout, .. } => {
            !matches!(layout, LayoutMode::Free)
        }
        _ => false,
    }
}

/// Bottom-up re-computation of group auto-sizes after all constraints are applied.
fn recompute_group_auto_sizes(
    graph: &SceneGraph,
    node_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
) {
    // Recurse into children first (bottom-up)
    for child_idx in graph.children(node_idx) {
        recompute_group_auto_sizes(graph, child_idx, bounds);
    }

    let node = &graph.graph[node_idx];
    let pad = match &node.kind {
        NodeKind::Group {
            layout: LayoutMode::Column { pad, .. },
        }
        | NodeKind::Group {
            layout: LayoutMode::Row { pad, .. },
        }
        | NodeKind::Group {
            layout: LayoutMode::Grid { pad, .. },
        } => *pad,
        NodeKind::Group {
            layout: LayoutMode::Free,
        } => 0.0,
        _ => return, // not a group
    };

    let children = graph.children(node_idx);
    if children.is_empty() {
        return;
    }

    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;

    for &child_idx in &children {
        if let Some(cb) = bounds.get(&child_idx) {
            min_x = min_x.min(cb.x);
            min_y = min_y.min(cb.y);
            max_x = max_x.max(cb.x + cb.width);
            max_y = max_y.max(cb.y + cb.height);
        }
    }

    if min_x < f32::MAX {
        bounds.insert(
            node_idx,
            ResolvedBounds {
                x: min_x - pad,
                y: min_y - pad,
                width: (max_x - min_x) + 2.0 * pad,
                height: (max_y - min_y) + 2.0 * pad,
            },
        );
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
            let content_width = parent_bounds.width - 2.0 * pad;
            // Pass 1: initialize children at parent origin + pad, recurse to resolve nested groups
            for &child_idx in &children {
                let child_node = &graph.graph[child_idx];
                let child_size = intrinsic_size(child_node);
                // Stretch text nodes to fill column width (like CSS align-items: stretch)
                let w = if matches!(child_node.kind, NodeKind::Text { .. }) {
                    content_width.max(child_size.0)
                } else {
                    child_size.0
                };
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x + pad,
                        y: parent_bounds.y + pad,
                        width: w,
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

            // Auto-center: if parent is a shape with a single text child (no
            // explicit position), expand text bounds to fill parent so the
            // renderer's center/middle alignment visually centers the label.
            let parent_is_shape = matches!(
                parent_node.kind,
                NodeKind::Rect { .. } | NodeKind::Ellipse { .. } | NodeKind::Frame { .. }
            );
            if parent_is_shape && children.len() == 1 {
                let child_idx = children[0];
                let child_node = &graph.graph[child_idx];
                let has_position = child_node
                    .constraints
                    .iter()
                    .any(|c| matches!(c, Constraint::Position { .. }));
                if matches!(child_node.kind, NodeKind::Text { .. }) && !has_position {
                    bounds.insert(child_idx, parent_bounds);
                }
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
            if let Some(cb) = bounds.get(&child_idx) {
                // Use resolved absolute positions directly — by this point,
                // bounds already hold correct positions from the layout pass.
                min_x = min_x.min(cb.x);
                min_y = min_y.min(cb.y);
                max_x = max_x.max(cb.x + cb.width);
                max_y = max_y.max(cb.y + cb.height);
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

    #[test]
    fn layout_dashboard_card_with_center_in() {
        let input = r#"
group @card {
  layout: column gap=12 pad=24
  text @heading "Monthly Revenue" { font: "Inter" 600 18 }
  text @amount "$48,250" { font: "Inter" 700 36 }
  text @change "+12.5% from last month" { font: "Inter" 400 14 }
  rect @chart { w: 320 h: 160 }
  rect @button { w: 320 h: 44 }
}
@card -> center_in: canvas
"#;
        let graph = parse_document(input).unwrap();
        let card_idx = graph.index_of(NodeId::intern("card")).unwrap();

        // graph.children() must return document order regardless of platform
        let children: Vec<_> = graph
            .children(card_idx)
            .iter()
            .map(|idx| graph.graph[*idx].id.as_str().to_string())
            .collect();
        assert_eq!(children[0], "heading", "First child must be heading");
        assert_eq!(children[4], "button", "Last child must be button");

        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let heading = bounds[&graph.index_of(NodeId::intern("heading")).unwrap()];
        let amount = bounds[&graph.index_of(NodeId::intern("amount")).unwrap()];
        let change = bounds[&graph.index_of(NodeId::intern("change")).unwrap()];
        let chart = bounds[&graph.index_of(NodeId::intern("chart")).unwrap()];
        let button = bounds[&graph.index_of(NodeId::intern("button")).unwrap()];
        let card = bounds[&graph.index_of(NodeId::intern("card")).unwrap()];

        // All children must be INSIDE the card
        assert!(
            heading.y >= card.y,
            "heading.y({}) must be >= card.y({})",
            heading.y,
            card.y
        );
        assert!(
            button.y + button.height <= card.y + card.height + 0.1,
            "button bottom({}) must be <= card bottom({})",
            button.y + button.height,
            card.y + card.height
        );

        // Document order preserved after center_in shift
        assert!(
            heading.y < amount.y,
            "heading.y({}) < amount.y({})",
            heading.y,
            amount.y
        );
        assert!(
            amount.y < change.y,
            "amount.y({}) < change.y({})",
            amount.y,
            change.y
        );
        assert!(
            change.y < chart.y,
            "change.y({}) < chart.y({})",
            change.y,
            chart.y
        );
        assert!(
            chart.y < button.y,
            "chart.y({}) < button.y({})",
            chart.y,
            button.y
        );
    }

    #[test]
    fn layout_column_ignores_position_constraint() {
        // Children with stale Position constraints inside a column layout
        // should be positioned by the column, not by their Position.
        let input = r#"
group @card {
  layout: column gap=10 pad=20

  rect @a { w: 100 h: 40 }
  rect @b {
    w: 100 h: 30
    x: 500 y: 500
  }
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
        let card_idx = graph.index_of(NodeId::intern("card")).unwrap();

        let a = bounds[&a_idx];
        let b = bounds[&b_idx];
        let card = bounds[&card_idx];

        // Both children should be at column x = pad (20), NOT at x=500
        assert!(
            (a.x - b.x).abs() < 0.01,
            "a.x ({}) and b.x ({}) should be equal (column aligns them)",
            a.x,
            b.x
        );
        // b should be below a by height + gap (40 + 10 = 50)
        assert!(
            (b.y - a.y - 50.0).abs() < 0.01,
            "b.y ({}) should be a.y + 50, got diff = {}",
            b.y,
            b.y - a.y
        );
        // Both children should be inside the card
        assert!(
            b.y + b.height <= card.y + card.height + 0.1,
            "b bottom ({}) must be inside card bottom ({})",
            b.y + b.height,
            card.y + card.height
        );
    }

    #[test]
    fn layout_group_auto_size_contains_all_children() {
        // A free-layout group should auto-size to contain all children,
        // even those with Position constraints that extend beyond others.
        let input = r#"
group @panel {
  rect @a { w: 100 h: 40 }
  rect @b {
    w: 80 h: 30
    x: 200 y: 150
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let panel_idx = graph.index_of(NodeId::intern("panel")).unwrap();
        let b_idx = graph.index_of(NodeId::intern("b")).unwrap();

        let panel = bounds[&panel_idx];
        let b = bounds[&b_idx];

        // Panel must contain @b entirely
        assert!(
            panel.x + panel.width >= b.x + b.width,
            "panel right ({}) must contain b right ({})",
            panel.x + panel.width,
            b.x + b.width
        );
        assert!(
            panel.y + panel.height >= b.y + b.height,
            "panel bottom ({}) must contain b bottom ({})",
            panel.y + panel.height,
            b.y + b.height
        );
    }

    #[test]
    fn layout_text_centered_in_rect() {
        let input = r#"
rect @btn {
  w: 320 h: 44
  text @label "View Details" {
    font: "Inter" 600 14
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let btn = bounds[&graph.index_of(NodeId::intern("btn")).unwrap()];
        let label = bounds[&graph.index_of(NodeId::intern("label")).unwrap()];

        // Text bounds should match parent rect (renderer handles visual centering)
        assert!(
            (label.x - btn.x).abs() < 0.01,
            "text x ({}) should match parent ({})",
            label.x,
            btn.x
        );
        assert!(
            (label.y - btn.y).abs() < 0.01,
            "text y ({}) should match parent ({})",
            label.y,
            btn.y
        );
        assert!(
            (label.width - btn.width).abs() < 0.01,
            "text width ({}) should match parent ({})",
            label.width,
            btn.width
        );
        assert!(
            (label.height - btn.height).abs() < 0.01,
            "text height ({}) should match parent ({})",
            label.height,
            btn.height
        );
    }

    #[test]
    fn layout_text_in_ellipse_centered() {
        let input = r#"
ellipse @badge {
  rx: 60 ry: 30
  text @count "42" {
    font: "Inter" 700 20
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let badge = bounds[&graph.index_of(NodeId::intern("badge")).unwrap()];
        let count = bounds[&graph.index_of(NodeId::intern("count")).unwrap()];

        // Text bounds should fill the ellipse bounding box
        assert!(
            (count.width - badge.width).abs() < 0.01,
            "text width ({}) should match ellipse ({})",
            count.width,
            badge.width
        );
        assert!(
            (count.height - badge.height).abs() < 0.01,
            "text height ({}) should match ellipse ({})",
            count.height,
            badge.height
        );
    }

    #[test]
    fn layout_text_explicit_position_not_expanded() {
        let input = r#"
rect @btn {
  w: 320 h: 44
  text @label "OK" {
    font: "Inter" 600 14
    x: 10 y: 5
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let btn = bounds[&graph.index_of(NodeId::intern("btn")).unwrap()];
        let label = bounds[&graph.index_of(NodeId::intern("label")).unwrap()];

        // Text with explicit position should NOT be expanded to parent
        assert!(
            label.width < btn.width,
            "text width ({}) should be < parent ({}) when explicit position is set",
            label.width,
            btn.width
        );
    }

    #[test]
    fn layout_text_multiple_children_not_expanded() {
        let input = r#"
rect @card {
  w: 200 h: 100
  text @title "Title" {
    font: "Inter" 600 16
  }
  text @subtitle "Sub" {
    font: "Inter" 400 12
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let card = bounds[&graph.index_of(NodeId::intern("card")).unwrap()];
        let title = bounds[&graph.index_of(NodeId::intern("title")).unwrap()];

        // Multiple children: text should NOT be expanded to parent
        assert!(
            title.width < card.width,
            "text width ({}) should be < parent ({}) with multiple children",
            title.width,
            card.width
        );
    }

    #[test]
    fn layout_text_centered_in_rect_inside_column() {
        // Reproduces demo.fd: text inside rect inside column group
        let input = r#"
group @form {
  layout: column gap=16 pad=32

  rect @email_field {
    w: 280 h: 44
    text @email_hint "Email" { }
  }

  rect @login_btn {
    w: 280 h: 48
    text @btn_label "Sign In" { }
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let email_field = bounds[&graph.index_of(NodeId::intern("email_field")).unwrap()];
        let email_hint = bounds[&graph.index_of(NodeId::intern("email_hint")).unwrap()];
        let login_btn = bounds[&graph.index_of(NodeId::intern("login_btn")).unwrap()];
        let btn_label = bounds[&graph.index_of(NodeId::intern("btn_label")).unwrap()];

        // Text bounds must match parent rect for centering to work
        eprintln!("email_field: x={:.1} y={:.1} w={:.1} h={:.1}", email_field.x, email_field.y, email_field.width, email_field.height);
        eprintln!("email_hint:  x={:.1} y={:.1} w={:.1} h={:.1}", email_hint.x, email_hint.y, email_hint.width, email_hint.height);
        eprintln!("login_btn:   x={:.1} y={:.1} w={:.1} h={:.1}", login_btn.x, login_btn.y, login_btn.width, login_btn.height);
        eprintln!("btn_label:   x={:.1} y={:.1} w={:.1} h={:.1}", btn_label.x, btn_label.y, btn_label.width, btn_label.height);

        assert!(
            (email_hint.x - email_field.x).abs() < 0.01,
            "email_hint x ({}) should match email_field x ({})",
            email_hint.x, email_field.x
        );
        assert!(
            (email_hint.y - email_field.y).abs() < 0.01,
            "email_hint y ({}) should match email_field y ({})",
            email_hint.y, email_field.y
        );
        assert!(
            (email_hint.width - email_field.width).abs() < 0.01,
            "email_hint width ({}) should match email_field width ({})",
            email_hint.width, email_field.width
        );
        assert!(
            (email_hint.height - email_field.height).abs() < 0.01,
            "email_hint height ({}) should match email_field height ({})",
            email_hint.height, email_field.height
        );

        assert!(
            (btn_label.x - login_btn.x).abs() < 0.01,
            "btn_label x ({}) should match login_btn x ({})",
            btn_label.x, login_btn.x
        );
        assert!(
            (btn_label.y - login_btn.y).abs() < 0.01,
            "btn_label y ({}) should match login_btn y ({})",
            btn_label.y, login_btn.y
        );
        assert!(
            (btn_label.width - login_btn.width).abs() < 0.01,
            "btn_label width ({}) should match login_btn width ({})",
            btn_label.width, login_btn.width
        );
        assert!(
            (btn_label.height - login_btn.height).abs() < 0.01,
            "btn_label height ({}) should match login_btn height ({})",
            btn_label.height, login_btn.height
        );
    }
}
