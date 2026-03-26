//! Scene graph search — structured query over nodes, edges, styles, and specs.
//!
//! Supports 3 modes:
//! - **Smart** (default): nucleo fuzzy scoring with exact-substring boost (+1000).
//!   Exact matches always rank first, fuzzy matches below, noise filtered out.
//! - **Exact**: pure substring containment (case-insensitive).
//! - **Regex**: handled JS-side on raw text lines (not in this module).

use crate::FdCanvas;
use fd_core::id::NodeId;
use fd_core::model::NodeKind;
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// A single search result returned to JS.
#[derive(Serialize)]
struct SearchResult {
    /// The node's @id string.
    id: String,
    /// Node kind name (rect, text, group, frame, ellipse, path, edge, style).
    kind: String,
    /// Context snippet (text content, spec role, or first style property).
    context: String,
    /// Whether this node has resolved bounds (for zoom-to-fit).
    #[serde(rename = "hasBounds")]
    has_bounds: bool,
    /// Resolved bounds if available: [x, y, w, h].
    #[serde(skip_serializing_if = "Option::is_none")]
    bounds: Option<[f32; 4]>,
    /// Match score (for ranking). Higher = better match.
    score: i32,
}

/// Exact-match bonus ensures substring matches always rank above fuzzy-only.
const EXACT_BONUS: i32 = 1000;
/// Minimum score to include in results (filters noise from weak fuzzy matches).
const SCORE_THRESHOLD: i32 = 30;

#[wasm_bindgen]
impl FdCanvas {
    /// Search the scene graph for nodes matching the query.
    ///
    /// `mode`: `"smart"` (default), `"exact"`, or `"fuzzy"`.
    /// - Smart = fuzzy scoring + exact-match boost (recommended default).
    /// - Exact = pure substring containment.
    /// - Fuzzy = pure nucleo scoring without exact boost.
    ///
    /// Returns a JSON array of `SearchResult` objects sorted by score.
    pub fn search_nodes(&self, query: &str, mode: &str) -> String {
        if query.len() < 2 {
            return "[]".to_string();
        }
        let q = query.to_lowercase();
        let use_fuzzy = mode != "exact";
        let use_exact_boost = mode != "fuzzy";

        let mut matcher = Matcher::new(Config::DEFAULT);
        let pattern = if use_fuzzy {
            Some(Pattern::parse(
                query,
                CaseMatching::Ignore,
                Normalization::Smart,
            ))
        } else {
            None
        };

        let mut results = Vec::new();
        let bounds_map = self.engine.current_bounds();

        // Search scene graph nodes
        for idx in self.engine.graph.graph.node_indices() {
            let node = &self.engine.graph.graph[idx];
            if matches!(node.kind, NodeKind::Root) {
                continue;
            }

            let id_str = node.id.as_str();

            // Collect all searchable text for this node
            let searchable = build_searchable_text(node);

            let (matched, score) =
                compute_match_score(&q, &searchable, &pattern, &mut matcher, use_exact_boost);

            if matched {
                let context = build_context_from_match(node, &q);
                let node_bounds = bounds_map.get(&idx);
                results.push(SearchResult {
                    id: id_str.to_string(),
                    kind: node.kind.kind_name().to_string(),
                    context,
                    has_bounds: node_bounds.is_some(),
                    bounds: node_bounds.map(|b| [b.x, b.y, b.width, b.height]),
                    score,
                });
            }
        }

        // Search edges
        for edge in &self.engine.graph.edges {
            let id_str = edge.id.as_str();
            let mut searchable = vec![id_str.to_string()];
            if let Some(spec) = &edge.spec {
                searchable.push(spec.display_text());
            }

            let (matched, score) =
                compute_match_score(&q, &searchable, &pattern, &mut matcher, use_exact_boost);

            if matched {
                results.push(SearchResult {
                    id: id_str.to_string(),
                    kind: "edge".to_string(),
                    context: format!(
                        "edge {}",
                        edge.from
                            .node_id()
                            .map(|id| format!("@{}", id.as_str()))
                            .unwrap_or_else(|| "point".to_string())
                    ),
                    has_bounds: false,
                    bounds: None,
                    score,
                });
            }
        }

        // Search style definitions
        for style_id in self.engine.graph.styles.keys() {
            let name = style_id.as_str();
            let searchable = vec![name.to_string()];

            let (matched, score) =
                compute_match_score(&q, &searchable, &pattern, &mut matcher, use_exact_boost);

            if matched {
                results.push(SearchResult {
                    id: name.to_string(),
                    kind: "style".to_string(),
                    context: format!("style {name}"),
                    has_bounds: false,
                    bounds: None,
                    score,
                });
            }
        }

        // Sort by score descending (exact matches first, then fuzzy by quality)
        results.sort_by(|a, b| b.score.cmp(&a.score));

        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Set visual highlight on multiple nodes (for search result highlighting).
    ///
    /// Accepts a JSON array of node ID strings. Nodes in the highlight list
    /// render with a subtle glow on the canvas.
    pub fn set_search_highlights(&mut self, ids_json: &str) {
        let ids: Vec<String> = serde_json::from_str(ids_json).unwrap_or_default();
        self.select_tool.visual_highlight = ids
            .iter()
            .map(|s| NodeId::intern(s))
            .filter(|id| {
                self.engine.graph.get_by_id(*id).is_some()
                    || self.engine.graph.edges.iter().any(|e| e.id == *id)
            })
            .collect();
    }

    /// Clear all search highlights.
    pub fn clear_search_highlights(&mut self) {
        self.select_tool.visual_highlight.clear();
    }
}

/// Collect all searchable strings for a node: @id, text content, style names, spec.
fn build_searchable_text(node: &fd_core::model::SceneNode) -> Vec<String> {
    let mut texts = vec![node.id.as_str().to_string()];

    if let NodeKind::Text { content, .. } = &node.kind {
        texts.push(content.clone());
    }

    for s in &node.use_styles {
        texts.push(s.as_str().to_string());
    }

    if let Some(spec) = &node.spec {
        texts.push(spec.display_text());
    }

    texts
}

/// Score a set of searchable strings against the query.
/// Returns (matched, score). Score includes exact bonus if applicable.
fn compute_match_score(
    query_lower: &str,
    searchable: &[String],
    pattern: &Option<Pattern>,
    matcher: &mut Matcher,
    use_exact_boost: bool,
) -> (bool, i32) {
    let mut best_score: i32 = 0;
    let mut has_exact = false;

    for text in searchable {
        let text_lower = text.to_lowercase();

        // Exact substring check
        if text_lower.contains(query_lower) {
            has_exact = true;
            // For exact mode, score by how tight the match is (shorter text = better match)
            let exact_score = if use_exact_boost { EXACT_BONUS } else { 0 };
            let length_bonus = (100.0 * query_lower.len() as f32 / text.len() as f32) as i32;
            best_score = best_score.max(exact_score + length_bonus);
        }

        // Fuzzy scoring via nucleo
        if let Some(pat) = pattern {
            let mut buf = Vec::new();
            let haystack = Utf32Str::new(text, &mut buf);
            if let Some(fuzzy_score) = pat.score(haystack, matcher) {
                best_score = best_score.max(fuzzy_score as i32);
            }
        }
    }

    let threshold = if has_exact { 0 } else { SCORE_THRESHOLD };
    (best_score > threshold || has_exact, best_score)
}

/// Build a context snippet based on which field matched.
fn build_context_from_match(node: &fd_core::model::SceneNode, query_lower: &str) -> String {
    // Check text content match first (most informative context)
    if let NodeKind::Text { content, .. } = &node.kind
        && content.to_lowercase().contains(query_lower)
    {
        let truncated = if content.len() > 60 {
            format!("{}…", &content[..60])
        } else {
            content.clone()
        };
        return format!("\"{truncated}\"");
    }

    // Check spec match
    if let Some(spec) = &node.spec
        && spec.display_text().to_lowercase().contains(query_lower)
    {
        if let Some(ref role) = spec.role {
            return format!("role: {role}");
        }
        if let Some(ref intent) = spec.intent {
            return format!("intent: {intent}");
        }
    }

    // Check style match
    if node
        .use_styles
        .iter()
        .any(|s| s.as_str().to_lowercase().contains(query_lower))
    {
        let names: Vec<&str> = node.use_styles.iter().map(|s| s.as_str()).collect();
        return format!("use: {}", names.join(", "));
    }

    // Fallback: show node kind + dimensions
    match &node.kind {
        NodeKind::Rect { width, height } => format!("rect {width}×{height}"),
        NodeKind::Ellipse { rx, ry } => format!("ellipse {rx}×{ry}"),
        NodeKind::Frame { width, height, .. } => format!("frame {width}×{height}"),
        NodeKind::Group => "group".to_string(),
        _ => node.kind.kind_name().to_string(),
    }
}
