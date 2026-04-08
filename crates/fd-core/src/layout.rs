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

    // Position edge text children at the edge midpoint.
    // The renderer draws these labels at the midpoint of the edge endpoints,
    // but the layout engine was unaware — leaving their bounds at default (0,0).
    // This pass ensures hit-test and spatial-index see them at the correct position.
    resolve_edge_text_children(graph, &mut bounds);

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
    for constraint in &node.constraints {
        // Position constraints now apply even inside managed layouts —
        // a moved child becomes "absolutely positioned" within the frame
        // (like Figma's Absolute Position toggle).
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
        NodeKind::Frame { layout, .. } => !matches!(layout, LayoutMode::Free { .. }),
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
    let parent_bounds = match bounds.get(&parent_idx) {
        Some(b) => *b,
        None => {
            // Parent bounds are missing (likely intermediate layout mismatch or deleted node).
            // Gracefully ignore its children instead of panicking, to prevent dragging/rendering freezes.
            return;
        }
    };
    let parent_node = &graph.graph[parent_idx];

    let children: Vec<NodeIndex> = graph.children(parent_idx);
    if children.is_empty() {
        return;
    }

    // Determine layout mode
    let layout = match &parent_node.kind {
        NodeKind::Group => LayoutMode::Free { pad: 0.0 }, // Group is always Free
        NodeKind::Frame { layout, .. } => layout.clone(),
        _ => LayoutMode::Free { pad: 0.0 },
    };

    match layout {
        LayoutMode::Column { gap, pad, align } => {
            let content_width = parent_bounds.width - 2.0 * pad;
            // Filter: children with Position constraints are absolutely positioned
            // within the frame — they don't participate in the column flow.
            let flow_children: Vec<NodeIndex> = children
                .iter()
                .copied()
                .filter(|&ci| {
                    !graph.graph[ci]
                        .constraints
                        .iter()
                        .any(|c| matches!(c, Constraint::Position { .. }))
                })
                .collect();
            // Pass 1: initialize flow children at parent origin + pad
            for &child_idx in &flow_children {
                let child_node = &graph.graph[child_idx];
                let child_size = intrinsic_size(child_node);
                // Stretch text nodes or all nodes if align=stretch
                let w = if matches!(align, crate::model::LayoutAlign::Stretch)
                    || matches!(child_node.kind, NodeKind::Text { .. })
                {
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
            // Absolutely-positioned children: initialize from intrinsic_size
            for &child_idx in &children {
                if !flow_children.contains(&child_idx) {
                    let child_size = intrinsic_size(&graph.graph[child_idx]);
                    bounds.entry(child_idx).or_insert(ResolvedBounds {
                        x: parent_bounds.x,
                        y: parent_bounds.y,
                        width: child_size.0,
                        height: child_size.1,
                    });
                    resolve_children(graph, child_idx, bounds, viewport);
                }
            }
            // Pass 2: reposition flow children using resolved sizes
            let mut y = parent_bounds.y + pad;
            for &child_idx in &flow_children {
                let resolved = bounds[&child_idx];
                let target_x = match align {
                    crate::model::LayoutAlign::Start | crate::model::LayoutAlign::Stretch => {
                        parent_bounds.x + pad
                    }
                    crate::model::LayoutAlign::Center => {
                        parent_bounds.x + pad + (content_width - resolved.width) / 2.0
                    }
                    crate::model::LayoutAlign::End => {
                        parent_bounds.x + pad + content_width - resolved.width
                    }
                };
                let dx = target_x - resolved.x;
                let dy = y - resolved.y;
                if dx.abs() > 0.001 || dy.abs() > 0.001 {
                    shift_subtree(graph, child_idx, dx, dy, bounds);
                }
                y += bounds[&child_idx].height + gap;
            }
        }
        LayoutMode::Row { gap, pad, align } => {
            let content_height = parent_bounds.height - 2.0 * pad;
            // Filter: absolutely-positioned children skip the row flow
            let flow_children: Vec<NodeIndex> = children
                .iter()
                .copied()
                .filter(|&ci| {
                    !graph.graph[ci]
                        .constraints
                        .iter()
                        .any(|c| matches!(c, Constraint::Position { .. }))
                })
                .collect();
            // Pass 1: initialize flow children
            for &child_idx in &flow_children {
                let child_node = &graph.graph[child_idx];
                let child_size = intrinsic_size(child_node);
                // Stretch text nodes or all nodes if align=stretch
                let h = if matches!(align, crate::model::LayoutAlign::Stretch)
                    || matches!(child_node.kind, NodeKind::Text { .. })
                {
                    content_height.max(child_size.1)
                } else {
                    child_size.1
                };
                bounds.insert(
                    child_idx,
                    ResolvedBounds {
                        x: parent_bounds.x + pad,
                        y: parent_bounds.y + pad,
                        width: child_size.0,
                        height: h,
                    },
                );
                resolve_children(graph, child_idx, bounds, viewport);
            }
            // Absolutely-positioned children
            for &child_idx in &children {
                if !flow_children.contains(&child_idx) {
                    let child_size = intrinsic_size(&graph.graph[child_idx]);
                    bounds.entry(child_idx).or_insert(ResolvedBounds {
                        x: parent_bounds.x,
                        y: parent_bounds.y,
                        width: child_size.0,
                        height: child_size.1,
                    });
                    resolve_children(graph, child_idx, bounds, viewport);
                }
            }
            // Pass 2: reposition flow children
            let mut x = parent_bounds.x + pad;
            for &child_idx in &flow_children {
                let resolved = bounds[&child_idx];
                let target_y = match align {
                    crate::model::LayoutAlign::Start | crate::model::LayoutAlign::Stretch => {
                        parent_bounds.y + pad
                    }
                    crate::model::LayoutAlign::Center => {
                        parent_bounds.y + pad + (content_height - resolved.height) / 2.0
                    }
                    crate::model::LayoutAlign::End => {
                        parent_bounds.y + pad + content_height - resolved.height
                    }
                };
                let dx = x - resolved.x;
                let dy = target_y - resolved.y;
                if dx.abs() > 0.001 || dy.abs() > 0.001 {
                    shift_subtree(graph, child_idx, dx, dy, bounds);
                }
                x += bounds[&child_idx].width + gap;
            }
        }
        LayoutMode::Grid {
            cols,
            gap,
            pad,
            align,
        } => {
            // Filter: absolutely-positioned children skip the grid flow
            let flow_children: Vec<NodeIndex> = children
                .iter()
                .copied()
                .filter(|&ci| {
                    !graph.graph[ci]
                        .constraints
                        .iter()
                        .any(|c| matches!(c, Constraint::Position { .. }))
                })
                .collect();

            // Grid cell width is based on parent width divided by cols, minus gaps
            let total_gap_w = gap * (cols.saturating_sub(1) as f32);
            let cell_width =
                ((parent_bounds.width - 2.0 * pad - total_gap_w) / cols as f32).max(0.0);

            // Pass 1: initialize flow children
            for &child_idx in &flow_children {
                let child_node = &graph.graph[child_idx];
                let child_size = intrinsic_size(child_node);
                // Stretch nodes width to cell_width if align=stretch, else natural
                let w = if matches!(align, crate::model::LayoutAlign::Stretch)
                    || matches!(child_node.kind, NodeKind::Text { .. })
                {
                    cell_width.max(child_size.0)
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
            // Absolutely-positioned children
            for &child_idx in &children {
                if !flow_children.contains(&child_idx) {
                    let child_size = intrinsic_size(&graph.graph[child_idx]);
                    bounds.entry(child_idx).or_insert(ResolvedBounds {
                        x: parent_bounds.x,
                        y: parent_bounds.y,
                        width: child_size.0,
                        height: child_size.1,
                    });
                    resolve_children(graph, child_idx, bounds, viewport);
                }
            }
            // Pass 2: reposition flow children
            let mut x = parent_bounds.x + pad;
            let mut y = parent_bounds.y + pad;
            let mut col = 0u32;
            let mut row_height = 0.0f32;

            for &child_idx in &flow_children {
                let resolved = bounds[&child_idx];

                // Align within the cell width
                let target_x = match align {
                    crate::model::LayoutAlign::Start | crate::model::LayoutAlign::Stretch => x,
                    crate::model::LayoutAlign::Center => x + (cell_width - resolved.width) / 2.0,
                    crate::model::LayoutAlign::End => x + cell_width - resolved.width,
                };

                let dx = target_x - resolved.x;
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
                    x += cell_width + gap;
                }
            }
        }
        LayoutMode::Free { pad } => {
            // Compute padded content area
            let content_x = parent_bounds.x + pad;
            let content_y = parent_bounds.y + pad;
            let content_w = (parent_bounds.width - 2.0 * pad).max(0.0);
            let content_h = (parent_bounds.height - 2.0 * pad).max(0.0);

            // Each child positioned at padded origin by default.
            // Use or_insert to preserve existing cached bounds (e.g. JS-measured
            // text sizes, explicit positions) during resolve_subtree calls.
            for &child_idx in &children {
                let child_size = intrinsic_size(&graph.graph[child_idx]);
                bounds.entry(child_idx).or_insert(ResolvedBounds {
                    x: content_x,
                    y: content_y,
                    width: child_size.0,
                    height: child_size.1,
                });
            }

            let parent_is_shape = matches!(
                parent_node.kind,
                NodeKind::Rect { .. } | NodeKind::Ellipse { .. } | NodeKind::Frame { .. }
            );

            for &child_idx in &children {
                let child_node = &graph.graph[child_idx];
                let has_position = child_node
                    .constraints
                    .iter()
                    .any(|c| matches!(c, Constraint::Position { .. }));

                // Priority 1: explicit `place:` property (uses padded area)
                if let Some((h, v)) = child_node.place {
                    if !has_position && let Some(cb) = bounds.get(&child_idx).copied() {
                        let x = match h {
                            HPlace::Left => content_x,
                            HPlace::Center => content_x + (content_w - cb.width) / 2.0,
                            HPlace::Right => content_x + content_w - cb.width,
                        };
                        let y = match v {
                            VPlace::Top => content_y,
                            VPlace::Middle => content_y + (content_h - cb.height) / 2.0,
                            VPlace::Bottom => content_y + content_h - cb.height,
                        };
                        bounds.insert(child_idx, ResolvedBounds { x, y, ..cb });
                    }
                    continue;
                }

                // Priority 2: auto-center text children in shape parents
                // (no explicit place: and no Position constraint)
                // Uses padded bounds for centering area
                if parent_is_shape
                    && matches!(child_node.kind, NodeKind::Text { .. })
                    && !has_position
                    && let Some(child_b) = bounds.get(&child_idx).copied()
                {
                    let cx = content_x + (content_w - child_b.width) / 2.0;
                    let cy = content_y + (content_h - child_b.height) / 2.0;
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
    if matches!(layout, LayoutMode::Free { .. }) {
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
        NodeKind::Text {
            content, max_width, ..
        } => {
            let font_size = node.props.font.as_ref().map_or(14.0, |f| f.size);
            let char_width = font_size * 0.6;
            let total_w = content.chars().count() as f32 * char_width;
            let line_height = font_size * 1.4;
            match max_width {
                // With max_width: return single-line placeholder height.
                // The accurate wrapped height is set by JS measureText()
                // round-trip (KI Lesson #9: heuristics must not fight
                // high-fidelity measurements).
                Some(mw) => (*mw, line_height),
                None => (total_w, line_height),
            }
        }
        NodeKind::Group => (0.0, 0.0), // Auto-sized: computed after children resolve
        NodeKind::Frame { width, height, .. } => (*width, *height),
        NodeKind::Path { commands, .. } => {
            let mut min_x = f32::MAX;
            let mut min_y = f32::MAX;
            let mut max_x = f32::MIN;
            let mut max_y = f32::MIN;
            if commands.is_empty() {
                return (100.0, 100.0);
            }
            for cmd in commands {
                match *cmd {
                    PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => {
                        min_x = min_x.min(x);
                        min_y = min_y.min(y);
                        max_x = max_x.max(x);
                        max_y = max_y.max(y);
                    }
                    PathCmd::QuadTo(cx, cy, ex, ey) => {
                        min_x = min_x.min(cx).min(ex);
                        min_y = min_y.min(cy).min(ey);
                        max_x = max_x.max(cx).max(ex);
                        max_y = max_y.max(cy).max(ey);
                    }
                    PathCmd::CubicTo(c1x, c1y, c2x, c2y, ex, ey) => {
                        min_x = min_x.min(c1x).min(c2x).min(ex);
                        min_y = min_y.min(c1y).min(c2y).min(ey);
                        max_x = max_x.max(c1x).max(c2x).max(ex);
                        max_y = max_y.max(c1y).max(c2y).max(ey);
                    }
                    PathCmd::Close => {}
                }
            }
            if min_x == f32::MAX {
                (100.0, 100.0)
            } else {
                ((max_x - min_x).max(2.0), (max_y - min_y).max(2.0))
            }
        }
        NodeKind::Image { width, height, .. } => (*width, *height),
        NodeKind::Generic => (120.0, 40.0), // Placeholder label box
        NodeKind::Icon { .. } => (24.0, 24.0), // Default icon size
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

/// Resolve one edge anchor to a scene-space (x, y) position.
fn resolve_edge_anchor(
    anchor: &EdgeAnchor,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
) -> Option<(f32, f32)> {
    match anchor {
        EdgeAnchor::Node(id) => {
            let idx = graph.index_of(*id)?;
            let b = bounds.get(&idx)?;
            Some(b.center())
        }
        EdgeAnchor::Point(x, y) => Some((*x, *y)),
    }
}

/// Position edge text children at the midpoint of their parent edge.
///
/// Edge text children live in the graph as root-level nodes but are rendered
/// at the edge midpoint. Without this pass, their bounds stay at the default
/// layout position (parent origin) and hit-testing can't find them where
/// they're visually drawn.
fn resolve_edge_text_children(graph: &SceneGraph, bounds: &mut HashMap<NodeIndex, ResolvedBounds>) {
    for edge in &graph.edges {
        let Some(text_id) = edge.text_child else {
            continue;
        };
        let Some(text_idx) = graph.index_of(text_id) else {
            continue;
        };

        // Resolve edge endpoints
        let Some((x1, y1)) = resolve_edge_anchor(&edge.from, graph, bounds) else {
            continue;
        };
        let Some((x2, y2)) = resolve_edge_anchor(&edge.to, graph, bounds) else {
            continue;
        };

        // Midpoint + optional label offset
        let (ox, oy) = edge.label_offset.unwrap_or((0.0, 0.0));
        let mx = (x1 + x2) / 2.0 + ox;
        let my = (y1 + y2) / 2.0 + oy;

        // Get existing text bounds (width/height were measured by JS or heuristic)
        let text_b = bounds.get(&text_idx).copied().unwrap_or(ResolvedBounds {
            x: 0.0,
            y: 0.0,
            width: 40.0,
            height: 18.0,
        });

        // Center the text bounds on the midpoint
        bounds.insert(
            text_idx,
            ResolvedBounds {
                x: mx - text_b.width / 2.0,
                y: my - text_b.height / 2.0 - 6.0, // -6 matches render2d baseline offset
                width: text_b.width,
                height: text_b.height,
            },
        );
    }
}

#[cfg(test)]
#[path = "layout_tests.rs"]
mod tests;
