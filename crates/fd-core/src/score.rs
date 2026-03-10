use crate::{NodeKind, ReadMode, SceneGraph};

#[derive(Debug, Clone, PartialEq)]
pub struct ComprehensibilityScore {
    pub total: u32,
    pub semantic_ratio: f32,
    pub comment_density: f32,
    pub style_reuse_ratio: f32,
    pub edge_default_coverage: f32,
    pub read_token_cost: usize,
}

pub fn compute_comprehensibility_score(graph: &SceneGraph) -> ComprehensibilityScore {
    let mut total_nodes = 0;
    let mut semantic_nodes = 0;
    let mut commented_nodes = 0;
    let mut styled_nodes = 0;
    let mut reused_styles_nodes = 0;

    for node in graph.graph.node_weights() {
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }
        total_nodes += 1;

        if !node.id.as_str().starts_with('_') {
            semantic_nodes += 1;
        }

        let has_comment = !node.comments.is_empty() || {
            if let NodeKind::Text { content, .. } = &node.kind {
                content.contains("[auto]")
            } else {
                false
            }
        };

        if has_comment {
            commented_nodes += 1;
        }

        let is_styled = node.props.fill.is_some()
            || node.props.stroke.is_some()
            || node.props.font.is_some()
            || node.props.corner_radius.is_some()
            || node.props.opacity.is_some()
            || node.props.shadow.is_some()
            || node.props.text_align.is_some()
            || node.props.text_valign.is_some()
            || node.props.scale.is_some()
            || !node.use_styles.is_empty();

        if is_styled {
            styled_nodes += 1;
            if !node.use_styles.is_empty() {
                reused_styles_nodes += 1;
            }
        }
    }

    let semantic_ratio = if total_nodes > 0 {
        semantic_nodes as f32 / total_nodes as f32
    } else {
        1.0
    };

    let comment_density = if total_nodes > 0 {
        commented_nodes as f32 / total_nodes as f32
    } else {
        1.0
    };

    let style_reuse_ratio = if styled_nodes > 0 {
        reused_styles_nodes as f32 / styled_nodes as f32
    } else {
        1.0
    };

    let total_edges = graph.edges.len();
    let mut default_edges = 0;

    // Check if defaults exist
    if graph.edge_defaults.is_some() {
        for edge in &graph.edges {
            let is_default = edge.props.fill.is_none()
                && edge.props.stroke.is_none()
                && edge.props.font.is_none()
                && edge.props.corner_radius.is_none()
                && edge.props.opacity.is_none()
                && edge.props.shadow.is_none()
                && edge.props.text_align.is_none()
                && edge.props.text_valign.is_none()
                && edge.props.scale.is_none()
                && edge.use_styles.is_empty();

            if is_default {
                default_edges += 1;
            }
        }
    }

    let edge_default_coverage = if total_edges > 0 {
        default_edges as f32 / total_edges as f32
    } else {
        1.0
    };

    let read_token_cost = crate::emitter::emit_filtered(graph, ReadMode::Full).len();

    let total = ((semantic_ratio * 40.0)
        + (comment_density * 20.0)
        + (style_reuse_ratio * 20.0)
        + (edge_default_coverage * 20.0)) as u32;

    ComprehensibilityScore {
        total: total.min(100),
        semantic_ratio,
        comment_density,
        style_reuse_ratio,
        edge_default_coverage,
        read_token_cost,
    }
}
