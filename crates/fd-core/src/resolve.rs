//! Import resolver: merges imported scene graphs with frame-based scoping.
//!
//! Each imported file becomes an implicit Frame node under root, providing
//! visual grouping and namespace isolation. The resolver handles:
//! - Flat frame topology (all frames are siblings under root)
//! - Diamond dependency dedup (same file imported twice → one frame)
//! - Three-state cycle detection (unseen / in-progress / resolved)
//!
//! The parser stores `Import` declarations on `SceneGraph.imports` but does
//! NOT read files — file I/O is handled by the caller via the `ImportLoader`
//! trait. This keeps the parser pure and testable.

use crate::id::NodeId;
use crate::model::{Import, LayoutMode, NodeKind, SceneGraph, SceneNode};
use crate::parser::parse_document;
use std::collections::{HashMap, HashSet};

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

    /// Return a canonical form of the path for dedup comparison.
    /// Default: returns the path unchanged.
    fn canonicalize(&self, path: &str) -> String {
        path.to_string()
    }
}

// ─── Import State ────────────────────────────────────────────────────────

/// Three-state tracking for import resolution.
#[derive(Debug)]
enum ImportState {
    /// Currently being resolved (on the call stack) — hitting this = cycle.
    InProgress,
    /// Fully resolved — the frame exists in the graph.
    Resolved,
}

// ─── Resolver ────────────────────────────────────────────────────────────

/// Resolve all imports on `graph`, wrapping each imported file in an
/// implicit Frame node under root. Handles dedup and cycle detection.
///
/// # Errors
/// - Circular import detected
/// - File not found / load error
/// - Node/style ID conflicts
pub fn resolve_imports(graph: &mut SceneGraph, loader: &dyn ImportLoader) -> Result<(), String> {
    let imports = graph.imports.clone();
    let mut state: HashMap<String, ImportState> = HashMap::new();
    resolve_recursive(graph, &imports, loader, &mut state)
}

fn resolve_recursive(
    graph: &mut SceneGraph,
    imports: &[Import],
    loader: &dyn ImportLoader,
    state: &mut HashMap<String, ImportState>,
) -> Result<(), String> {
    for import in imports {
        let canonical = loader.canonicalize(&import.path);

        match state.get(&canonical) {
            Some(ImportState::InProgress) => {
                return Err(format!(
                    "Circular import detected: \"{}\" was already imported",
                    import.path
                ));
            }
            Some(ImportState::Resolved) => {
                // Diamond dedup — file already fully resolved, skip
                continue;
            }
            None => {}
        }

        // Mark in-progress for cycle detection
        state.insert(canonical.clone(), ImportState::InProgress);

        // Load and parse the imported file
        let source = loader.load(&import.path)?;
        let imported = parse_document(&source)
            .map_err(|e| format!("Error parsing \"{}\": {e}", import.path))?;

        // Recursively resolve the imported file's own imports FIRST.
        // This creates sibling frames under root (flat topology).
        let nested = imported.imports.clone();
        if !nested.is_empty() {
            resolve_recursive(graph, &nested, loader, state)?;
        }

        // Build local scope sets for conditional prefixing.
        // Only IDs/styles defined directly in this file are "local".
        let local_styles: HashSet<NodeId> = imported.styles.keys().cloned().collect();
        let local_nodes: HashSet<NodeId> = imported
            .id_index
            .keys()
            .filter(|id| id.as_str() != "root")
            .cloned()
            .collect();

        // Check for frame ID conflict with existing nodes
        let frame_id = NodeId::intern(&import.namespace);
        if graph.id_index.contains_key(&frame_id) {
            return Err(format!(
                "Import alias \"{}\" conflicts with existing node \"@{}\"",
                import.namespace, import.namespace
            ));
        }

        // Create the implicit frame node
        let frame_node = SceneNode::new(
            frame_id,
            NodeKind::Frame {
                width: 0.0,
                height: 0.0,
                clip: false,
                layout: LayoutMode::Free,
            },
        );
        let frame_idx = graph.add_node(graph.root, frame_node);

        // Merge content into the frame
        merge_namespaced_styles(graph, &imported, &import.namespace)?;
        merge_namespaced_nodes(
            graph,
            frame_idx,
            &imported,
            &import.namespace,
            &local_styles,
            &local_nodes,
        )?;
        merge_namespaced_edges(
            graph,
            &imported,
            &import.namespace,
            &local_styles,
            &local_nodes,
        );

        // Mark as resolved
        state.insert(canonical, ImportState::Resolved);
    }

    Ok(())
}

// ─── Merge Helpers ───────────────────────────────────────────────────────

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

/// Merge imported nodes (top-level children) into a parent frame.
fn merge_namespaced_nodes(
    graph: &mut SceneGraph,
    parent: petgraph::graph::NodeIndex,
    imported: &SceneGraph,
    namespace: &str,
    local_styles: &HashSet<NodeId>,
    local_nodes: &HashSet<NodeId>,
) -> Result<(), String> {
    let children = imported.children(imported.root);
    for child_idx in children {
        merge_node_recursive(
            graph,
            parent,
            imported,
            child_idx,
            namespace,
            local_styles,
            local_nodes,
        )?;
    }
    Ok(())
}

/// Recursively clone an imported node tree with namespace-prefixed IDs.
/// Only local references are prefixed; cross-frame refs are kept as-is.
fn merge_node_recursive(
    graph: &mut SceneGraph,
    parent: petgraph::graph::NodeIndex,
    imported: &SceneGraph,
    source_idx: petgraph::graph::NodeIndex,
    namespace: &str,
    local_styles: &HashSet<NodeId>,
    local_nodes: &HashSet<NodeId>,
) -> Result<(), String> {
    let source_node = &imported.graph[source_idx];

    // Node IDs are always prefixed (they belong to this file)
    let ns_id = prefix_node_id(&source_node.id, namespace);
    if graph.id_index.contains_key(&ns_id) {
        return Err(format!(
            "Node ID conflict: \"{}\" already exists",
            ns_id.as_str()
        ));
    }

    let mut cloned = source_node.clone();
    cloned.id = ns_id;

    // Prefix use_styles: local styles get prefixed, cross-frame stay as-is
    for use_ref in &mut cloned.use_styles {
        if local_styles.contains(use_ref) {
            *use_ref = prefix_node_id(use_ref, namespace);
        }
    }

    // Prefix constraint NodeId references if local
    for constraint in &mut cloned.constraints {
        prefix_constraint_if_local(constraint, namespace, local_nodes);
    }

    let new_idx = graph.add_node(parent, cloned);

    // Recurse into children
    let children = imported.children(source_idx);
    for child_idx in children {
        merge_node_recursive(
            graph,
            new_idx,
            imported,
            child_idx,
            namespace,
            local_styles,
            local_nodes,
        )?;
    }

    Ok(())
}

/// Merge imported edges with namespace-prefixed from/to IDs.
/// Only local references are prefixed; cross-frame refs stay as-is.
fn merge_namespaced_edges(
    graph: &mut SceneGraph,
    imported: &SceneGraph,
    namespace: &str,
    local_styles: &HashSet<NodeId>,
    local_nodes: &HashSet<NodeId>,
) {
    for edge in &imported.edges {
        let mut cloned = edge.clone();

        // Edge ID is always local
        cloned.id = prefix_node_id(&cloned.id, namespace);

        // from/to: prefix only if local node
        cloned.from = prefix_edge_anchor_if_local(&cloned.from, namespace, local_nodes);
        cloned.to = prefix_edge_anchor_if_local(&cloned.to, namespace, local_nodes);

        // Text child is always local to the edge's file
        if let Some(ref mut tc) = cloned.text_child {
            *tc = prefix_node_id(tc, namespace);
        }

        // use_styles: local → prefix, cross-frame → keep
        for use_ref in &mut cloned.use_styles {
            if local_styles.contains(use_ref) {
                *use_ref = prefix_node_id(use_ref, namespace);
            }
        }

        graph.edges.push(cloned);
    }
}

// ─── Prefixing Helpers ───────────────────────────────────────────────────

/// Prefix a `NodeId` with a namespace: `button` → `ns.button`.
fn prefix_node_id(id: &NodeId, namespace: &str) -> NodeId {
    NodeId::intern(&format!("{namespace}.{}", id.as_str()))
}

/// Prefix an `EdgeAnchor` only if it references a local node.
fn prefix_edge_anchor_if_local(
    anchor: &crate::model::EdgeAnchor,
    namespace: &str,
    local_nodes: &HashSet<NodeId>,
) -> crate::model::EdgeAnchor {
    match anchor {
        crate::model::EdgeAnchor::Node(id) => {
            if local_nodes.contains(id) {
                crate::model::EdgeAnchor::Node(prefix_node_id(id, namespace))
            } else {
                anchor.clone()
            }
        }
        point @ crate::model::EdgeAnchor::Point(_, _) => point.clone(),
    }
}

/// Prefix constraint NodeId references only if they are local nodes.
fn prefix_constraint_if_local(
    constraint: &mut crate::model::Constraint,
    namespace: &str,
    local_nodes: &HashSet<NodeId>,
) {
    match constraint {
        crate::model::Constraint::CenterIn(id) => {
            if local_nodes.contains(id) {
                *id = prefix_node_id(id, namespace);
            }
        }
        crate::model::Constraint::Offset { from, .. } => {
            if local_nodes.contains(from) {
                *from = prefix_node_id(from, namespace);
            }
        }
        crate::model::Constraint::FillParent { .. } | crate::model::Constraint::Position { .. } => {
        }
    }
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

        // Main node still exists at root
        assert!(graph.get_by_id(NodeId::intern("hero")).is_some());

        // Frame node exists
        let btn_frame = graph.get_by_id(NodeId::intern("btn"));
        assert!(btn_frame.is_some());
        assert!(matches!(btn_frame.unwrap().kind, NodeKind::Frame { .. }));

        // Imported node has namespace prefix and is under the frame
        assert!(graph.get_by_id(NodeId::intern("btn.button")).is_some());
        let btn_frame_idx = graph.index_of(NodeId::intern("btn")).unwrap();
        let btn_button_idx = graph.index_of(NodeId::intern("btn.button")).unwrap();
        assert_eq!(graph.parent(btn_button_idx), Some(btn_frame_idx));

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
    fn resolve_nested_imports_flat() {
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

        // Both frames are siblings under root (flat topology)
        let tok_idx = graph.index_of(NodeId::intern("tok")).unwrap();
        let ui_idx = graph.index_of(NodeId::intern("ui")).unwrap();
        assert_eq!(graph.parent(tok_idx), Some(graph.root));
        assert_eq!(graph.parent(ui_idx), Some(graph.root));

        // Token style is flat: tok.primary (not ui.tok.primary)
        assert!(graph.styles.contains_key(&NodeId::intern("tok.primary")));
        assert!(!graph.styles.contains_key(&NodeId::intern("ui.tok.primary")));

        // Button node is under ui frame
        let btn_idx = graph.index_of(NodeId::intern("ui.btn")).unwrap();
        assert_eq!(graph.parent(btn_idx), Some(ui_idx));
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

        // Frame exists
        assert!(graph.get_by_id(NodeId::intern("flow")).is_some());

        assert_eq!(graph.edges.len(), 1);
        let edge = &graph.edges[0];
        assert_eq!(edge.id.as_str(), "flow.link");
        assert_eq!(
            edge.from,
            crate::model::EdgeAnchor::Node(NodeId::intern("flow.a"))
        );
        assert_eq!(
            edge.to,
            crate::model::EdgeAnchor::Node(NodeId::intern("flow.b"))
        );
    }

    #[test]
    fn resolve_diamond_dedup() {
        let tokens = "style primary { fill: #3B82F6 }\n";
        let lib_a = "import \"tokens.fd\" as tok\nrect @widget { w: 50 h: 50 }\n";
        let lib_b = "import \"tokens.fd\" as tok\nrect @gadget { w: 60 h: 60 }\n";
        let main_source = concat!("import \"a.fd\" as a\n", "import \"b.fd\" as b\n",);

        let mut graph = parse_document(main_source).unwrap();
        let loader = MemoryLoader {
            files: HashMap::from([
                ("tokens.fd".to_string(), tokens.to_string()),
                ("a.fd".to_string(), lib_a.to_string()),
                ("b.fd".to_string(), lib_b.to_string()),
            ]),
        };

        resolve_imports(&mut graph, &loader).unwrap();

        // Only one tok frame (dedup)
        let tok_nodes: Vec<_> = graph
            .id_index
            .keys()
            .filter(|id| id.as_str() == "tok")
            .collect();
        assert_eq!(tok_nodes.len(), 1);

        // Only one copy of the style
        assert!(graph.styles.contains_key(&NodeId::intern("tok.primary")));

        // Both lib frames exist
        assert!(graph.get_by_id(NodeId::intern("a")).is_some());
        assert!(graph.get_by_id(NodeId::intern("b")).is_some());
    }

    #[test]
    fn resolve_frame_conflict_error() {
        let imported = "rect @x { w: 10 h: 10 }\n";
        let main_source = concat!("rect @btn { w: 100 h: 50 }\n", "import \"lib.fd\" as btn\n",);

        let mut graph = parse_document(main_source).unwrap();
        let loader = MemoryLoader {
            files: HashMap::from([("lib.fd".to_string(), imported.to_string())]),
        };

        let result = resolve_imports(&mut graph, &loader);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("conflicts with existing node"),
            "Expected conflict error, got: {err}"
        );
    }
}
