//! Scene graph → Vello drawing commands.
//!
//! Walks the resolved scene graph and emits Vello paint operations:
//! fills, strokes, paths, text glyphs, gradients.

use fd_core::NodeIndex;
use fd_core::ResolvedBounds;
use fd_core::SceneGraph;
use fd_core::model::*;
use std::collections::HashMap;

/// Paint the entire scene graph to a Vello scene.
///
/// Placeholder implementation — will integrate with `vello::Scene` in Phase 3.
pub fn paint_scene(graph: &SceneGraph, bounds: &HashMap<NodeIndex, ResolvedBounds>) {
    paint_node(graph, graph.root, bounds);
}

fn paint_node(graph: &SceneGraph, idx: NodeIndex, bounds: &HashMap<NodeIndex, ResolvedBounds>) {
    let node = &graph.graph[idx];
    let node_bounds = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    // Resolve effective style
    let style = graph.resolve_style(node);

    match &node.kind {
        NodeKind::Root => {}
        NodeKind::Rect { .. } => {
            log::trace!(
                "PAINT rect @{} at ({}, {}) {}x{}",
                node.id.as_str(),
                node_bounds.x,
                node_bounds.y,
                node_bounds.width,
                node_bounds.height
            );
            // TODO: Vello fill_rect + stroke_rect
        }
        NodeKind::Ellipse { .. } => {
            log::trace!(
                "PAINT ellipse @{} at ({}, {})",
                node.id.as_str(),
                node_bounds.x,
                node_bounds.y
            );
            // TODO: Vello fill_ellipse
        }
        NodeKind::Text { content } => {
            log::trace!(
                "PAINT text @{} \"{}\" at ({}, {})",
                node.id.as_str(),
                content,
                node_bounds.x,
                node_bounds.y
            );
            // TODO: Vello draw_text
        }
        NodeKind::Path { commands } => {
            log::trace!(
                "PAINT path @{} ({} cmds) at ({}, {})",
                node.id.as_str(),
                commands.len(),
                node_bounds.x,
                node_bounds.y
            );
            // TODO: Vello draw_path
        }
        NodeKind::Group { .. } => {
            // Groups draw their background/border, then children
            if style.fill.is_some() {
                log::trace!("PAINT group bg @{}", node.id.as_str());
            }
        }
    }

    // Paint children
    for child_idx in graph.children(idx) {
        paint_node(graph, child_idx, bounds);
    }
}
