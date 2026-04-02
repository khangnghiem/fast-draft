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

    /// Seed the counter from the maximum `_N` suffix found across all node
    /// IDs in a SceneGraph. Call after loading a saved document to produce
    /// clean incremental names (`rect_4`, not `rect_1743620895000`).
    pub fn seed_counter_from_graph(graph: &crate::model::SceneGraph) {
        use std::sync::atomic::Ordering;
        let mut max_n = 0u64;
        for node in graph.graph.node_weights() {
            let name = node.id.as_str();
            if let Some((_prefix, suffix)) = name.rsplit_once('_') {
                if let Ok(n) = suffix.parse::<u64>() {
                    max_n = max_n.max(n);
                }
            }
        }
        // Also scan edge IDs
        for edge in &graph.edges {
            let name = edge.id.as_str();
            if let Some((_prefix, suffix)) = name.rsplit_once('_') {
                if let Ok(n) = suffix.parse::<u64>() {
                    max_n = max_n.max(n);
                }
            }
        }
        COUNTER.store(max_n + 1, Ordering::Relaxed);
    }
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
}
