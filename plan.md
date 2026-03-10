1. **Create `score.rs`:** Create `crates/fd-core/src/score.rs` with the following content:
```rust
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
    if let Some(_) = &graph.edge_defaults {
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
```

2. **Verify `score.rs`:** I will use `read_file` to confirm the file was correctly created.

3. **Modify `lib.rs`:** I will use `replace_with_git_merge_diff` to add `pub mod score;` and `pub use score::*;` to `crates/fd-core/src/lib.rs`.

4. **Verify `lib.rs`:** I will use `read_file` to confirm the modification to `lib.rs` was correctly applied.

5. **Create `score_tests.rs`:** I will use `write_file` to create `crates/fd-core/src/score_tests.rs`:
```rust
#[cfg(test)]
mod tests {
    use crate::{
        compute_comprehensibility_score, NodeId, NodeKind, SceneGraph, SceneNode,
    };

    #[test]
    fn test_empty_graph() {
        let graph = SceneGraph::new();
        let score = compute_comprehensibility_score(&graph);
        assert_eq!(score.total, 100);
        assert_eq!(score.semantic_ratio, 1.0);
    }

    #[test]
    fn test_semantic_nodes() {
        let mut graph = SceneGraph::new();
        let root = graph.root;

        let mut n1 = SceneNode::new(NodeId::intern("login_form"), NodeKind::Group);
        n1.comments.push("Login section".to_string());
        graph.add_node(root, n1);

        let n2 = SceneNode::new(NodeId::intern("_rect_1"), NodeKind::Generic);
        graph.add_node(root, n2);

        let score = compute_comprehensibility_score(&graph);
        assert_eq!(score.semantic_ratio, 0.5); // 1 semantic out of 2
        assert_eq!(score.comment_density, 0.5); // 1 commented out of 2
    }
}
```

6. **Verify `score_tests.rs`:** I will use `read_file` to confirm the file was properly created.

7. **Test and Verify:** Run `cargo check --workspace`, `cargo test --workspace`, `cargo clippy --workspace -- -D warnings`, and `cargo fmt --all -- --check`. Make sure all tests and checks pass. If there are any errors, fix them and repeat this step.

8. **Update `REQUIREMENTS.md`:** Use `replace_with_git_merge_diff` to replace `- **R4.21** _(planned)_:` with `- **R4.21** _(done)_:` in `docs/REQUIREMENTS.md`.

9. **Update `CHANGELOG.md`:** Use `replace_with_git_merge_diff` to add a new entry to `docs/CHANGELOG.md` under the completed requirements section:
```markdown
### v0.10.103 — Comprehensibility Score
- Added `compute_comprehensibility_score` for measuring FD document readability (R4.21).
```

10. **Pre-commit Step:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

11. **Submit PR:** I will use the `submit` tool to submit the changes to `main` with the branch name `feat/comprehensibility-score` and the commit message `feat(core): implement comprehensibility score R4.21`.
