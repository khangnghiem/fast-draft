#[cfg(test)]
mod tests {
    use crate::{NodeId, NodeKind, SceneGraph, SceneNode, compute_comprehensibility_score};

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
