//! Import resolver: merges imported scene graphs with namespace prefixing.
//!
//! The parser stores `Import` declarations on `SceneGraph.imports` but does
//! NOT read files — file I/O is handled by the caller via the `ImportLoader`
//! trait. This keeps the parser pure and testable.

use crate::id::NodeId;
use crate::model::{Import, SceneGraph};
use crate::parser::parse_document;
use std::collections::HashSet;

// ─── Import Loader Trait ─────────────────────────────────────────────────

/// Trait for loading `.fd` files by path.
///
/// Implemented differently by each host environment:
/// - WASM: reads from VS Code workspace via message passing
/// - LSP: reads from the filesystem
/// - CLI/tests: reads from a HashMap or disk
pub trait ImportLoader {
    /// Load the contents of a `.fd` file at the given path.
    fn load(&self, path: &str) -> Result<String, String>;
}

// ─── Resolver ────────────────────────────────────────────────────────────

/// Resolve all imports on `graph`, merging imported styles and nodes
/// with namespace-prefixed IDs.
///
/// # Errors
/// - Circular import detected
/// - File not found / load error
/// - Duplicate namespace alias
pub fn resolve_imports(graph: &mut SceneGraph, loader: &dyn ImportLoader) -> Result<(), String> {
    let imports = graph.imports.clone();
    let mut visited = HashSet::new();
    resolve_imports_recursive(graph, &imports, loader, &mut visited)
}

fn resolve_imports_recursive(
    graph: &mut SceneGraph,
    imports: &[Import],
    loader: &dyn ImportLoader,
    visited: &mut HashSet<String>,
) -> Result<(), String> {
    for import in imports {
        // Cycle detection
        if !visited.insert(import.path.clone()) {
            return Err(format!(
                "Circular import detected: \"{}\" was already imported",
                import.path
            ));
        }

        // Load and parse the imported file
        let source = loader.load(&import.path)?;
        let mut imported = parse_document(&source)
            .map_err(|e| format!("Error parsing \"{}\": {e}", import.path))?;

        // Recursively resolve the imported file's own imports
        let nested_imports = imported.imports.clone();
        if !nested_imports.is_empty() {
            resolve_imports_recursive(&mut imported, &nested_imports, loader, visited)?;
        }

        // Merge namespaced styles
        merge_namespaced_styles(graph, &imported, &import.namespace)?;

        // Merge namespaced nodes (children of imported root)
        merge_namespaced_nodes(graph, &imported, &import.namespace)?;

        // Merge namespaced edges
        merge_namespaced_edges(graph, &imported, &import.namespace);
    }

    Ok(())
}

/// Merge imported styles with namespace prefix: `accent` → `ns.accent`.
fn merge_namespaced_styles(
    graph: &mut SceneGraph,
    imported: &SceneGraph,
    namespace: &str,
) -> Result<(), String> {
    for (name, style) in &imported.styles {
        let ns_name = NodeId::intern(&format!("{namespace}.{}", name.as_str()));
        if graph.styles.contains_key(&ns_name) {
            return Err(format!(
                "Style conflict: \"{namespace}.{}\" already exists",
                name.as_str()
            ));
        }
        graph.define_style(ns_name, style.clone());
    }
    Ok(())
}

/// Merge imported nodes (top-level children) with namespace prefix.
fn merge_namespaced_nodes(
    graph: &mut SceneGraph,
    imported: &SceneGraph,
    namespace: &str,
) -> Result<(), String> {
    let children = imported.children(imported.root);
    for child_idx in children {
        merge_node_recursive(graph, graph.root, imported, child_idx, namespace)?;
    }
    Ok(())
}

/// Recursively clone an imported node tree with namespace-prefixed IDs.
fn merge_node_recursive(
    graph: &mut SceneGraph,
    parent: petgraph::graph::NodeIndex,
    imported: &SceneGraph,
    source_idx: petgraph::graph::NodeIndex,
    namespace: &str,
) -> Result<(), String> {
    let source_node = &imported.graph[source_idx];

    // Prefix the node ID
    let ns_id = prefix_node_id(&source_node.id, namespace);
    if graph.id_index.contains_key(&ns_id) {
        return Err(format!(
            "Node ID conflict: \"{}\" already exists",
            ns_id.as_str()
        ));
    }

    let mut cloned = source_node.clone();
    cloned.id = ns_id;

    // Prefix use_styles references
    for use_ref in &mut cloned.use_styles {
        *use_ref = prefix_node_id(use_ref, namespace);
    }

    let new_idx = graph.add_node(parent, cloned);

    // Recurse into children
    let children = imported.children(source_idx);
    for child_idx in children {
        merge_node_recursive(graph, new_idx, imported, child_idx, namespace)?;
    }

    Ok(())
}

/// Merge imported edges with namespace-prefixed from/to IDs.
fn merge_namespaced_edges(graph: &mut SceneGraph, imported: &SceneGraph, namespace: &str) {
    for edge in &imported.edges {
        let mut cloned = edge.clone();
        cloned.id = prefix_node_id(&cloned.id, namespace);
        cloned.from = prefix_node_id(&cloned.from, namespace);
        cloned.to = prefix_node_id(&cloned.to, namespace);
        for use_ref in &mut cloned.use_styles {
            *use_ref = prefix_node_id(use_ref, namespace);
        }
        graph.edges.push(cloned);
    }
}

/// Prefix a `NodeId` with a namespace: `button` → `ns.button`.
/// Anonymous IDs (starting with `_anon_`) are still prefixed for uniqueness.
fn prefix_node_id(id: &NodeId, namespace: &str) -> NodeId {
    NodeId::intern(&format!("{namespace}.{}", id.as_str()))
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Simple in-memory loader for testing.
    struct MemoryLoader {
        files: HashMap<String, String>,
    }

    impl ImportLoader for MemoryLoader {
        fn load(&self, path: &str) -> Result<String, String> {
            self.files
                .get(path)
                .cloned()
                .ok_or_else(|| format!("File not found: {path}"))
        }
    }

    #[test]
    fn resolve_namespace_prefixing() {
        let imported_source = r#"
style accent { fill: #6C5CE7 }
rect @button { w: 100 h: 40; fill: #FF0000 }
"#;

        let main_source = r#"
import "buttons.fd" as btn
rect @hero { w: 200 h: 100 }
"#;

        let mut graph = parse_document(main_source).unwrap();
        let loader = MemoryLoader {
            files: HashMap::from([("buttons.fd".to_string(), imported_source.to_string())]),
        };

        resolve_imports(&mut graph, &loader).unwrap();

        // Main node still exists
        assert!(graph.get_by_id(NodeId::intern("hero")).is_some());

        // Imported node has namespace prefix
        assert!(graph.get_by_id(NodeId::intern("btn.button")).is_some());

        // Imported style has namespace prefix
        assert!(graph.styles.contains_key(&NodeId::intern("btn.accent")));
    }

    #[test]
    fn resolve_circular_import_error() {
        let file_a = "import \"b.fd\" as b\n";
        let file_b = "import \"a.fd\" as a\n";

        let mut graph = parse_document(file_a).unwrap();
        let loader = MemoryLoader {
            files: HashMap::from([
                ("b.fd".to_string(), file_b.to_string()),
                ("a.fd".to_string(), file_a.to_string()),
            ]),
        };

        let result = resolve_imports(&mut graph, &loader);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Circular import"));
    }

    #[test]
    fn resolve_file_not_found_error() {
        let main_source = "import \"missing.fd\" as m\n";
        let mut graph = parse_document(main_source).unwrap();
        let loader = MemoryLoader {
            files: HashMap::new(),
        };

        let result = resolve_imports(&mut graph, &loader);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File not found"));
    }

    #[test]
    fn resolve_nested_imports() {
        let tokens = "style primary { fill: #3B82F6 }\n";
        let buttons = "import \"tokens.fd\" as tok\nrect @btn { w: 80 h: 32 }\n";
        let main_source = "import \"buttons.fd\" as ui\n";

        let mut graph = parse_document(main_source).unwrap();
        let loader = MemoryLoader {
            files: HashMap::from([
                ("buttons.fd".to_string(), buttons.to_string()),
                ("tokens.fd".to_string(), tokens.to_string()),
            ]),
        };

        resolve_imports(&mut graph, &loader).unwrap();

        // Button node gets ui. prefix
        assert!(graph.get_by_id(NodeId::intern("ui.btn")).is_some());

        // Nested token style gets ui.tok. prefix
        assert!(graph.styles.contains_key(&NodeId::intern("ui.tok.primary")));
    }

    #[test]
    fn resolve_imported_edges() {
        let imported = r#"
rect @a { w: 10 h: 10 }
rect @b { w: 10 h: 10 }
edge @link { from: @a; to: @b; arrow: end }
"#;
        let main_source = "import \"flow.fd\" as flow\n";

        let mut graph = parse_document(main_source).unwrap();
        let loader = MemoryLoader {
            files: HashMap::from([("flow.fd".to_string(), imported.to_string())]),
        };

        resolve_imports(&mut graph, &loader).unwrap();

        assert_eq!(graph.edges.len(), 1);
        let edge = &graph.edges[0];
        assert_eq!(edge.id.as_str(), "flow.link");
        assert_eq!(edge.from.as_str(), "flow.a");
        assert_eq!(edge.to.as_str(), "flow.b");
    }
}
