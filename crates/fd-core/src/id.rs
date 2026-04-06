use lasso::{Spur, ThreadedRodeo};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use std::sync::LazyLock;

/// Global string interner for node IDs — fast comparisons, low memory.
static INTERNER: LazyLock<ThreadedRodeo> = LazyLock::new(ThreadedRodeo::default);

/// A lightweight, interned identifier for nodes in the scene graph.
/// Internally a `Spur` index — 4 bytes, Copy, Eq, Hash in O(1).
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(Spur);

impl NodeId {
    /// Intern a new string as a NodeId, or return existing if already interned.
    pub fn intern(s: &str) -> Self {
        NodeId(INTERNER.get_or_intern(s))
    }

    /// Resolve back to a string slice.
    pub fn as_str(&self) -> &str {
        INTERNER.resolve(&self.0)
    }

    /// Generate a unique anonymous ID (for nodes without explicit @id).
    /// Uses the node kind as prefix: `_rect_0`, `_text_1`, `_group_2`, etc.
    pub fn anonymous(kind: &str) -> Self {
        Self::with_prefix(&format!("_{kind}"))
    }

    /// Generate a unique ID with a type prefix (e.g. `rect_1`, `ellipse_2`).
    pub fn with_prefix(prefix: &str) -> Self {
        use std::sync::atomic::Ordering;
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        Self::intern(&format!("{prefix}_{n}"))
    }

    /// Seed the prefix counter to prevent ID collisions across sessions
    /// when restoring data from external sources (like `localStorage`).
    pub fn seed_prefix_counter(seed: u64) {
        use std::sync::atomic::Ordering;
        COUNTER.store(seed, Ordering::Relaxed);
    }

    /// Scan all node and edge IDs in a graph, extract trailing `_N` suffixes,
    /// and seed the global counter to `max(N) + 1` to prevent collisions.
    pub fn seed_from_graph(graph: &crate::model::SceneGraph) {
        let mut max_suffix: u64 = 0;

        // Scan node IDs (stored in the DAG)
        for idx in graph.graph.node_indices() {
            if let Some(n) = extract_suffix(graph.graph[idx].id.as_str()) {
                max_suffix = max_suffix.max(n);
            }
        }

        // Scan edge IDs (stored in Vec<Edge>)
        for edge in &graph.edges {
            if let Some(n) = extract_suffix(edge.id.as_str()) {
                max_suffix = max_suffix.max(n);
            }
        }

        Self::seed_prefix_counter(max_suffix + 1);
    }
}

/// Extract trailing integer suffix after the last `_`.
/// e.g. `rect_5` → Some(5), `_rect_3` → Some(3), `login_form` → None
fn extract_suffix(id: &str) -> Option<u64> {
    let (_, suffix) = id.rsplit_once('_')?;
    suffix.parse::<u64>().ok()
}

/// Global counter for dynamically generated unique IDs across the entire SceneGraph.
static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

impl fmt::Debug for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "@{}", self.as_str())
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "@{}", self.as_str())
    }
}

impl Serialize for NodeId {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for NodeId {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(NodeId::intern(&s))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interning_roundtrip() {
        let a = NodeId::intern("login_form");
        let b = NodeId::intern("login_form");
        assert_eq!(a, b);
        assert_eq!(a.as_str(), "login_form");
    }

    #[test]
    fn anonymous_ids_are_unique() {
        let a = NodeId::anonymous("rect");
        let b = NodeId::anonymous("rect");
        assert_ne!(a, b);
    }

    #[test]
    fn extract_suffix_cases() {
        assert_eq!(extract_suffix("rect_5"), Some(5));
        assert_eq!(extract_suffix("_rect_3"), Some(3));
        assert_eq!(extract_suffix("edge_12"), Some(12));
        assert_eq!(extract_suffix("login_form"), None);
        assert_eq!(extract_suffix("root"), None);
        assert_eq!(extract_suffix(""), None);
    }

    #[test]
    fn seed_from_graph_picks_max_suffix() {
        let graph = crate::parser::parse_document(
            "rect @rect_3 { w: 100 h: 50 }\nrect @rect_7 { w: 80 h: 40 }",
        )
        .unwrap();
        NodeId::seed_from_graph(&graph);
        let next = NodeId::with_prefix("rect");
        let suffix: u64 = next.as_str().rsplit_once('_').unwrap().1.parse().unwrap();
        assert!(suffix >= 8, "expected suffix >= 8, got {suffix}");
    }
}
