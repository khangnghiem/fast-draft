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

/// Re-resolve only the children of `parent_idx`, using its current bounds.
///
/// This is a lightweight version of `resolve_layout` scoped to one subtree.
/// Used by `ResizeNode` to re-flow column/row/grid children and re-center
/// text during drag, without re-resolving the entire graph.
pub fn resolve_subtree(
    graph: &SceneGraph,
    parent_idx: NodeIndex,
    bounds: &mut HashMap<NodeIndex, ResolvedBounds>,
    viewport: Viewport,
) {
    resolve_children(graph, parent_idx, bounds, viewport);
    resolve_constraints_top_down(graph, parent_idx, bounds, viewport);
    recompute_group_auto_sizes(graph, parent_idx, bounds);
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
pub fn is_parent_managed(graph: &SceneGraph, node_idx: NodeIndex) -> bool {
    let parent_idx = match graph.parent(node_idx) {
        Some(p) => p,
        None => return false,
    };
    let parent_node = &graph.graph[parent_idx];
    match &parent_node.kind {
        NodeKind::Frame { layout, .. } => !matches!(layout, LayoutMode::Free),
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
    // Only groups auto-size — frames use declared dimensions
    if !matches!(node.kind, NodeKind::Group) {
        return;
    }

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
                x: min_x,
                y: min_y,
                width: max_x - min_x,
                height: max_y - min_y,
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
        NodeKind::Group => LayoutMode::Free, // Group is always Free
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
            // explicit position), center the text within parent bounds using
            // its intrinsic size (hug-contents). The renderer's center/middle
            // alignment handles visual centering within the tight bounds.
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
                if matches!(child_node.kind, NodeKind::Text { .. })
                    && !has_position
                    && let Some(child_b) = bounds.get(&child_idx).copied()
                {
                    let cx = parent_bounds.x + (parent_bounds.width - child_b.width) / 2.0;
                    let cy = parent_bounds.y + (parent_bounds.height - child_b.height) / 2.0;
                    bounds.insert(
                        child_idx,
                        ResolvedBounds {
                            x: cx,
                            y: cy,
                            width: child_b.width,
                            height: child_b.height,
                        },
                    );
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

    // Auto-size groups to the union bounding box of their children
    if matches!(parent_node.kind, NodeKind::Group) && !children.is_empty() {
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
                parent_idx,
                ResolvedBounds {
                    x: min_x,
                    y: min_y,
                    width: max_x - min_x,
                    height: max_y - min_y,
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
            (content.chars().count() as f32 * char_width, font_size * 1.4)
        }
        NodeKind::Group => (0.0, 0.0), // Auto-sized: computed after children resolve
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
#[path = "layout_tests.rs"]
mod tests;
