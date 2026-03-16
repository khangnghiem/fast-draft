//! Comprehensibility Score (R4.21)
//!
//! Computes a 0–100 score measuring how easily AI agents can understand
//! an FD document. Five metrics, each worth 0–20 points.

use crate::emitter::{ReadMode, emit_filtered};
use crate::model::*;

// ─── Types ───────────────────────────────────────────────────────────────

/// A single metric in the comprehensibility report.
#[derive(Debug, Clone)]
pub struct MetricScore {
    /// Short metric name (e.g. "semantic_naming").
    pub name: &'static str,
    /// Human-readable label for UI.
    pub label: &'static str,
    /// Score 0–20.
    pub score: u8,
    /// One-line improvement suggestion (empty if score == 20).
    pub suggestion: String,
}

/// Full comprehensibility report for a document.
#[derive(Debug, Clone)]
pub struct ScoreReport {
    /// Total score 0–100.
    pub total: u8,
    /// Per-metric breakdown.
    pub metrics: Vec<MetricScore>,
}

// ─── Public API ──────────────────────────────────────────────────────────

/// Compute the comprehensibility score for a scene graph.
#[must_use]
pub fn compute_score(graph: &SceneGraph) -> ScoreReport {
    let metrics = vec![
        metric_semantic_naming(graph),
        metric_doc_comment_density(graph),
        metric_style_reuse(graph),
        metric_edge_default_coverage(graph),
        metric_token_efficiency(graph),
    ];
    let total: u8 = metrics.iter().map(|m| m.score).sum::<u8>().min(100);
    ScoreReport { total, metrics }
}

// ─── Metric 1: Semantic Naming (0–20) ────────────────────────────────────

/// Ratio of non-anonymous `@id`s to total node count.
fn metric_semantic_naming(graph: &SceneGraph) -> MetricScore {
    let mut total = 0u32;
    let mut semantic = 0u32;

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }
        total += 1;
        if !is_anonymous_id(node.id.as_str()) {
            semantic += 1;
        }
    }

    let ratio = if total == 0 {
        1.0
    } else {
        semantic as f32 / total as f32
    };
    let score = (ratio * 20.0).round() as u8;

    let suggestion = if score < 20 {
        let anon_count = total - semantic;
        format!(
            "Rename {anon_count} anonymous node(s) to semantic names (e.g. @login_btn instead of @_rect_0)"
        )
    } else {
        String::new()
    };

    MetricScore {
        name: "semantic_naming",
        label: "Semantic Naming",
        score,
        suggestion,
    }
}

/// Check if an ID matches the auto-generated `_kind_N` pattern.
fn is_anonymous_id(id: &str) -> bool {
    let prefixes = [
        "_rect_",
        "_ellipse_",
        "_text_",
        "_group_",
        "_path_",
        "_frame_",
        "_generic_",
        "_edge_",
        "_image_",
    ];
    prefixes.iter().any(|p| id.starts_with(p))
}

// ─── Metric 2: Doc-Comment Density (0–20) ────────────────────────────────

/// Ratio of nodes that have comments (manual `#` or `[auto]` generated).
fn metric_doc_comment_density(graph: &SceneGraph) -> MetricScore {
    let mut total = 0u32;
    let mut commented = 0u32;

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }
        total += 1;
        if !node.comments.is_empty() || node.spec.is_some() {
            commented += 1;
        }
    }

    let ratio = if total == 0 {
        1.0
    } else {
        commented as f32 / total as f32
    };
    let score = (ratio * 20.0).round() as u8;

    let suggestion = if score < 20 {
        let uncommented = total - commented;
        format!("Add comments or notes to {uncommented} undocumented node(s)")
    } else {
        String::new()
    };

    MetricScore {
        name: "doc_comment_density",
        label: "Documentation",
        score,
        suggestion,
    }
}

// ─── Metric 3: Style Reuse (0–20) ────────────────────────────────────────

/// Ratio of styled nodes using `use:` references vs inline styles.
fn metric_style_reuse(graph: &SceneGraph) -> MetricScore {
    let mut styled_total = 0u32;
    let mut using_refs = 0u32;

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }
        let has_inline = has_inline_styles(&node.props);
        let has_refs = !node.use_styles.is_empty();

        if has_inline || has_refs {
            styled_total += 1;
            if has_refs {
                using_refs += 1;
            }
        }
    }

    let ratio = if styled_total == 0 {
        1.0 // no styled nodes = perfect (nothing to improve)
    } else {
        using_refs as f32 / styled_total as f32
    };
    let score = (ratio * 20.0).round() as u8;

    let suggestion = if score < 20 && styled_total > 0 {
        let inline_only = styled_total - using_refs;
        format!(
            "Extract inline styles from {inline_only} node(s) into reusable `style {{ }}` blocks"
        )
    } else {
        String::new()
    };

    MetricScore {
        name: "style_reuse",
        label: "Style Reuse",
        score,
        suggestion,
    }
}

/// Check if a Properties struct has any non-default inline styles.
fn has_inline_styles(props: &Properties) -> bool {
    props.fill.is_some()
        || props.stroke.is_some()
        || props.font.is_some()
        || props.corner_radius.is_some()
        || props.opacity.is_some()
        || props.shadow.is_some()
}

// ─── Metric 4: Edge Default Coverage (0–20) ──────────────────────────────

/// Ratio of edges whose properties match the `edge_defaults {}` block.
fn metric_edge_default_coverage(graph: &SceneGraph) -> MetricScore {
    let total_edges = graph.edges.len() as u32;

    if total_edges == 0 {
        return MetricScore {
            name: "edge_default_coverage",
            label: "Edge Defaults",
            score: 20,
            suggestion: String::new(),
        };
    }

    // If no edge_defaults defined, score is 0 when edges exist
    let defaults = match &graph.edge_defaults {
        Some(d) => d,
        None => {
            return MetricScore {
                name: "edge_default_coverage",
                label: "Edge Defaults",
                score: 0,
                suggestion: format!(
                    "Add an `edge_defaults {{ }}` block to reduce repetition across {total_edges} edge(s)"
                ),
            };
        }
    };

    let mut matching = 0u32;
    for edge in &graph.edges {
        if edge_matches_defaults(edge, defaults) {
            matching += 1;
        }
    }

    let ratio = matching as f32 / total_edges as f32;
    let score = (ratio * 20.0).round() as u8;

    let suggestion = if score < 20 {
        let non_matching = total_edges - matching;
        format!(
            "{non_matching} edge(s) override defaults — consider updating `edge_defaults` to cover common patterns"
        )
    } else {
        String::new()
    };

    MetricScore {
        name: "edge_default_coverage",
        label: "Edge Defaults",
        score,
        suggestion,
    }
}

/// Check if an edge's visual properties match (or inherit from) the document's edge_defaults.
///
/// The parser always assigns a built-in default stroke to edges that don't
/// explicitly specify one (rgba(0.42, 0.44, 0.5, 1.0) at width 1.5).
/// We detect this to distinguish "user explicitly set stroke" from "parser default".
fn edge_matches_defaults(edge: &Edge, defaults: &EdgeDefaults) -> bool {
    // Stroke: if edge has the parser's built-in default, treat as "not explicitly set"
    let stroke_ok = match &edge.props.stroke {
        Some(s) if is_parser_default_stroke(s) => true, // inherited, matches any default
        Some(es) => match &defaults.props.stroke {
            Some(ds) => stroke_approx_eq(es, ds),
            None => false, // edge has explicit stroke but no default defined
        },
        None => true, // no stroke at all, inherits default
    };

    // Arrow: ArrowKind::None means "not explicitly set" (parser default)
    let arrow_ok = match defaults.arrow {
        Some(da) => edge.arrow == da || edge.arrow == ArrowKind::None,
        None => true,
    };

    // Curve: CurveKind::Straight means "not explicitly set" (parser default)
    let curve_ok = match defaults.curve {
        Some(dc) => edge.curve == dc || edge.curve == CurveKind::Straight,
        None => true,
    };

    stroke_ok && arrow_ok && curve_ok
}

/// Check if a stroke matches the parser's built-in default for edges.
/// Parser assigns rgba(0.42, 0.44, 0.5, 1.0) at width 1.5 when no stroke is specified.
fn is_parser_default_stroke(stroke: &Stroke) -> bool {
    if let Paint::Solid(c) = &stroke.paint {
        (c.r - 0.42).abs() < 0.01
            && (c.g - 0.44).abs() < 0.01
            && (c.b - 0.5).abs() < 0.01
            && (stroke.width - 1.5).abs() < 0.01
    } else {
        false
    }
}

/// Approximate equality for strokes.
fn stroke_approx_eq(a: &Stroke, b: &Stroke) -> bool {
    (a.width - b.width).abs() < 0.001 && a.paint == b.paint
}

// ─── Metric 5: Token Efficiency (0–20) ───────────────────────────────────

/// Ratio of structure-only tokens to full tokens. A well-structured
/// document should have a smaller structure representation relative to full.
fn metric_token_efficiency(graph: &SceneGraph) -> MetricScore {
    let full = emit_filtered(graph, ReadMode::Full);
    let structure = emit_filtered(graph, ReadMode::Structure);

    let full_tokens = estimate_tokens(&full);
    let structure_tokens = estimate_tokens(&structure);

    if full_tokens == 0 {
        return MetricScore {
            name: "token_efficiency",
            label: "Token Efficiency",
            score: 20,
            suggestion: String::new(),
        };
    }

    // The ratio measures how much overhead full mode adds.
    // A fully efficient doc has structure ≈ 30% of full (lots of styling/dims).
    // Score = how close structure/full is to the ideal ratio of ~0.3.
    let ratio = structure_tokens as f32 / full_tokens as f32;

    // Score: if ratio <= 0.5, full score (structure is lean).
    // If ratio > 0.5, penalize linearly. Ratio of 1.0 = 0 score.
    let score = if ratio <= 0.5 {
        20
    } else {
        let penalty = ((ratio - 0.5) / 0.5).min(1.0);
        ((1.0 - penalty) * 20.0).round() as u8
    };

    let suggestion = if score < 20 {
        "Add more styling, dimensions, and annotations to enrich the document beyond bare structure"
            .to_string()
    } else {
        String::new()
    };

    MetricScore {
        name: "token_efficiency",
        label: "Token Efficiency",
        score,
        suggestion,
    }
}

/// Rough token count estimation (split on whitespace + punctuation).
fn estimate_tokens(text: &str) -> usize {
    // Simple heuristic: ~4 characters per token (GPT-style tokenization)
    let char_count = text.len();
    char_count.div_ceil(4)
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_document;

    #[test]
    fn score_empty_document() {
        let graph = SceneGraph::new();
        let report = compute_score(&graph);
        assert_eq!(
            report.total, 100,
            "empty document should have perfect score"
        );
    }

    #[test]
    fn score_perfect_document() {
        let input = r#"
style card {
  fill: #FFF
  corner: 8
}

edge_defaults {
  stroke: #333 2
  arrow: end
}

# Main card component
rect @hero_card {
  w: 300 h: 200
  use: card
  note "Primary hero element"
}

# Secondary element
text @subtitle "Welcome" {
  use: card
}

edge @flow_1 {
  from: @hero_card
  to: @subtitle
}
"#;
        let graph = parse_document(input).unwrap();
        let report = compute_score(&graph);
        // All nodes are semantic, have comments/notes, use style refs, edge matches defaults
        assert!(
            report.total >= 80,
            "well-structured document should score >= 80, got {}",
            report.total
        );
    }

    #[test]
    fn score_anonymous_ids() {
        // A document with only auto-generated IDs
        let input = "rect { w: 100 h: 50 }\nellipse { w: 80 h: 80 }\n";
        let graph = parse_document(input).unwrap();
        let report = compute_score(&graph);
        let naming = report
            .metrics
            .iter()
            .find(|m| m.name == "semantic_naming")
            .unwrap();
        assert_eq!(
            naming.score, 0,
            "anonymous-only IDs should score 0 on naming"
        );
        assert!(!naming.suggestion.is_empty());
    }

    #[test]
    fn score_no_style_reuse() {
        let input = r#"
rect @btn {
  w: 100 h: 50
  fill: #FF0000
  corner: 8
}
rect @card {
  w: 200 h: 100
  fill: #00FF00
  corner: 12
}
"#;
        let graph = parse_document(input).unwrap();
        let report = compute_score(&graph);
        let reuse = report
            .metrics
            .iter()
            .find(|m| m.name == "style_reuse")
            .unwrap();
        assert_eq!(reuse.score, 0, "inline-only styles should score 0 on reuse");
    }

    #[test]
    fn score_edge_defaults_coverage() {
        let input = r#"
edge_defaults {
  stroke: #333 2
  arrow: end
}

rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }

edge @e1 {
  from: @a
  to: @b
}

edge @e2 {
  from: @a
  to: @b
  stroke: #FF0000 4
}
"#;
        let graph = parse_document(input).unwrap();
        let report = compute_score(&graph);
        let coverage = report
            .metrics
            .iter()
            .find(|m| m.name == "edge_default_coverage")
            .unwrap();
        // 1 of 2 edges matches defaults = 50% = 10/20
        assert_eq!(
            coverage.score, 10,
            "half matching edges should score 10, got {}",
            coverage.score
        );
    }

    #[test]
    fn score_mixed_document() {
        let input = r#"
style primary {
  fill: #007AFF
}

# Header section
rect @header {
  w: 800 h: 60
  use: primary
  note "Main navigation bar"
}

rect { w: 100 h: 50 fill: #FF0000 }
"#;
        let graph = parse_document(input).unwrap();
        let report = compute_score(&graph);
        // Mixed: one semantic + one anonymous, one with style ref + one inline
        assert!(
            report.total > 20 && report.total < 90,
            "mixed document should score moderately, got {}",
            report.total
        );
    }
}
