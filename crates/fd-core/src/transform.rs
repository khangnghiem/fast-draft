//! Transform passes that mutate the `SceneGraph` in-place.
//!
//! Each pass has a single responsibility and is safe to compose.
//! Passes are applied by `format_document` in `format.rs` based on `FormatConfig`.

use crate::id::NodeId;
use crate::model::{Constraint, EdgeAnchor, NodeKind, Paint, Properties, SceneGraph, SceneNode};
use std::collections::HashMap;

// ─── Dedup use-styles ─────────────────────────────────────────────────────

/// Remove duplicate entries in each node's `use_styles` list.
///
/// Preserves the first occurrence and relative order. Semantics are unchanged.
pub fn dedup_use_styles(graph: &mut SceneGraph) {
    let indices: Vec<_> = graph.graph.node_indices().collect();
    for idx in indices {
        let node = &mut graph.graph[idx];
        dedup_use_on_node(node);
    }
    for edge in &mut graph.edges {
        let mut seen = std::collections::HashSet::new();
        edge.use_styles.retain(|id| seen.insert(*id));
    }
}

fn dedup_use_on_node(node: &mut SceneNode) {
    let mut seen = std::collections::HashSet::new();
    node.use_styles.retain(|id| seen.insert(*id));
}

// ─── Hoist styles ─────────────────────────────────────────────────────────

/// Promote repeated identical inline styles into top-level `style {}` blocks.
///
/// Any two or more nodes that share the same inline `Properties` fingerprint will
/// have their inline style replaced with a `use:` reference to a shared
/// style block. Comment-preservation is guaranteed: only `style` and
/// `use_styles` fields change, never node ordering or comments.
///
/// New style names use the pattern `_auto_N`.
pub fn hoist_styles(graph: &mut SceneGraph) {
    // Build fingerprint → (list of node indices, example Properties) map.
    let mut fp_map: HashMap<String, (Vec<petgraph::graph::NodeIndex>, Properties)> = HashMap::new();

    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if is_style_empty(&node.props) {
            continue;
        }
        let fp = style_fingerprint(&node.props);
        let entry = fp_map
            .entry(fp)
            .or_insert_with(|| (Vec::new(), node.props.clone()));
        entry.0.push(idx);
    }

    let mut counter = 0u32;
    for (indices, prototype_style) in fp_map.values() {
        if indices.len() < 2 {
            continue;
        }

        counter += 1;
        let style_name = NodeId::intern(&format!("_auto_{counter}"));
        graph.styles.insert(style_name, prototype_style.clone());

        for &idx in indices {
            let node = &mut graph.graph[idx];
            node.props = Properties::default();
            if !node.use_styles.contains(&style_name) {
                node.use_styles.insert(0, style_name);
            }
        }
    }
}

// ─── Properties fingerprint ────────────────────────────────────────────────────

/// A deterministic string key for a Properties, used for deduplication during hoisting.
fn style_fingerprint(style: &Properties) -> String {
    let mut parts = Vec::new();

    if let Some(ref fill) = style.fill {
        parts.push(format!("fill={}", paint_key(fill)));
    }
    if let Some(ref stroke) = style.stroke {
        parts.push(format!(
            "stroke={},{}",
            paint_key(&stroke.paint),
            stroke.width
        ));
    }
    if let Some(ref font) = style.font {
        parts.push(format!(
            "font={},{},{}",
            font.family, font.weight, font.size
        ));
    }
    if let Some(r) = style.corner_radius {
        parts.push(format!("corner={r}"));
    }
    if let Some(o) = style.opacity {
        parts.push(format!("opacity={o}"));
    }
    if let Some(ref sh) = style.shadow {
        parts.push(format!(
            "shadow={},{},{},{}",
            sh.offset_x,
            sh.offset_y,
            sh.blur,
            sh.color.to_hex()
        ));
    }

    parts.join("|")
}

fn paint_key(paint: &Paint) -> String {
    match paint {
        Paint::Solid(c) => c.to_hex(),
        Paint::LinearGradient { angle, stops } => {
            let stops_str: String = stops
                .iter()
                .map(|s| format!("{}/{}", s.color.to_hex(), s.offset))
                .collect::<Vec<_>>()
                .join(",");
            format!("linear({angle}deg,{stops_str})")
        }
        Paint::RadialGradient { stops } => {
            let stops_str: String = stops
                .iter()
                .map(|s| format!("{}/{}", s.color.to_hex(), s.offset))
                .collect::<Vec<_>>()
                .join(",");
            format!("radial({stops_str})")
        }
    }
}

fn is_style_empty(style: &Properties) -> bool {
    style.fill.is_none()
        && style.stroke.is_none()
        && style.font.is_none()
        && style.corner_radius.is_none()
        && style.opacity.is_none()
        && style.shadow.is_none()
}

// ─── Sort nodes by kind ───────────────────────────────────────────────────

/// Canonical kind priority for top-level node ordering.
/// Lower values sort first: containers → shapes → text → paths → generic.
fn kind_priority(kind: &NodeKind) -> u8 {
    match kind {
        NodeKind::Root => 0,
        NodeKind::Group | NodeKind::Frame { .. } => 1,
        NodeKind::Rect { .. } => 2,
        NodeKind::Ellipse { .. } => 3,
        NodeKind::Text { .. } => 4,
        NodeKind::Path { .. } | NodeKind::Icon { .. } => 5,
        NodeKind::Image { .. } => 6,
        NodeKind::Generic => 7,
    }
}

/// Reorder the root's top-level children into canonical kind order.
///
/// Priority: Group/Frame → Rect → Ellipse → Text → Path → Generic.
/// Relative order within each kind group is preserved (stable sort).
/// Only affects root-level children — nested children stay in document order.
///
/// Stores the sorted order in `graph.sorted_child_order` so that
/// `children()` can return nodes in the canonical order.
pub fn sort_nodes(graph: &mut SceneGraph) {
    let root = graph.root;
    let mut children = graph.children(root);

    if children.len() < 2 {
        return;
    }

    // Stable sort by kind priority
    children.sort_by_key(|&idx| kind_priority(&graph.graph[idx].kind));

    // Store the sorted order for root's children
    graph.sorted_child_order.insert(root, children);
}

// ─── Dedup duplicate node IDs ─────────────────────────────────────────────

/// Rename duplicate node IDs to ensure uniqueness across the graph.
///
/// Walks all nodes and edges. When a collision is found, appends `_2`, `_3`, etc.
/// Also updates all references: `Constraint::Offset { from }`, `CenterIn`,
/// `EdgeAnchor::Node`, and `edge.text_child`.
///
/// Returns the number of nodes renamed.
pub fn dedup_node_ids(graph: &mut SceneGraph) -> usize {
    use std::collections::HashSet;

    let root_id = NodeId::intern("root");
    let canvas_id = NodeId::intern("canvas");

    // Phase 1: Collect all IDs and find duplicates. Build rename map.
    let mut seen: HashSet<NodeId> = HashSet::new();
    let mut rename_map: HashMap<(NodeId, petgraph::graph::NodeIndex), NodeId> = HashMap::new();
    seen.insert(root_id);
    seen.insert(canvas_id);

    let indices: Vec<_> = graph.graph.node_indices().collect();
    for &idx in &indices {
        let id = graph.graph[idx].id;
        if id == root_id {
            continue;
        }
        if !seen.insert(id) {
            // Collision! Find a unique suffix.
            let stem = id
                .as_str()
                .trim_end_matches(|c: char| c.is_ascii_digit() || c == '_');
            let stem = if stem.is_empty() { id.as_str() } else { stem };
            let mut n = 2u32;
            loop {
                let candidate = NodeId::intern(&format!("{stem}_{n}"));
                if !seen.contains(&candidate) && graph.get_by_id(candidate).is_none() {
                    seen.insert(candidate);
                    rename_map.insert((id, idx), candidate);
                    break;
                }
                n += 1;
                if n > 1000 {
                    break; // safety valve
                }
            }
        }
    }

    if rename_map.is_empty() {
        return 0;
    }

    // Build a flat old→new map for reference updating (from the node-specific rename map)
    let mut id_renames: HashMap<NodeId, NodeId> = HashMap::new();
    let count = rename_map.len();

    // Phase 2: Apply renames to nodes.
    for (&(old_id, idx), &new_id) in &rename_map {
        graph.graph[idx].id = new_id;
        // Update id_index
        graph.id_index.remove(&old_id);
        graph.id_index.insert(new_id, idx);
        id_renames.insert(old_id, new_id);
    }

    // Phase 3: Update all constraint references.
    for &idx in &indices {
        let node = &mut graph.graph[idx];
        for constraint in node.constraints.iter_mut() {
            match constraint {
                Constraint::Offset { from, .. } => {
                    if let Some(&new_id) = id_renames.get(from) {
                        *from = new_id;
                    }
                }
                Constraint::CenterIn(target) => {
                    if let Some(&new_id) = id_renames.get(target) {
                        *target = new_id;
                    }
                }
                _ => {}
            }
        }
    }

    // Phase 4: Update edge references.
    for edge in &mut graph.edges {
        // Edge from/to
        if let EdgeAnchor::Node(ref mut id) = edge.from
            && let Some(&new_id) = id_renames.get(id)
        {
            *id = new_id;
        }
        if let EdgeAnchor::Node(ref mut id) = edge.to
            && let Some(&new_id) = id_renames.get(id)
        {
            *id = new_id;
        }
        // Edge text_child
        if let Some(ref mut child_id) = edge.text_child
            && let Some(&new_id) = id_renames.get(child_id)
        {
            *child_id = new_id;
        }
        // Edge ID itself
        if let Some(&new_id) = id_renames.get(&edge.id) {
            edge.id = new_id;
        }
    }

    count
}

// ─── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::NodeId;
    use crate::parser::parse_document;

    #[test]
    fn dedup_use_removes_duplicates() {
        let input = r#"
style card {
  fill: #FFF
}
rect @box {
  w: 100 h: 50
  use: card
  use: card
}
"#;
        let mut graph = parse_document(input).unwrap();
        dedup_use_styles(&mut graph);
        let node = graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.use_styles.len(), 1, "duplicate use: should be removed");
    }

    #[test]
    fn dedup_use_preserves_order() {
        let input = r#"
style a { fill: #111111 }
style b { fill: #222222 }
rect @box {
  w: 100 h: 50
  use: a
  use: b
  use: a
}
"#;
        let mut graph = parse_document(input).unwrap();
        dedup_use_styles(&mut graph);
        let node = graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.use_styles.len(), 2);
        assert_eq!(node.use_styles[0].as_str(), "a");
        assert_eq!(node.use_styles[1].as_str(), "b");
    }

    #[test]
    fn hoist_creates_shared_style_for_identical_nodes() {
        let input = r#"
rect @box_a {
  w: 100 h: 50
  fill: #FF0000
  corner: 8
}
rect @box_b {
  w: 200 h: 100
  fill: #FF0000
  corner: 8
}
"#;
        let mut graph = parse_document(input).unwrap();
        hoist_styles(&mut graph);

        // A new top-level style should have been created
        assert!(
            !graph.styles.is_empty(),
            "hoist should create a style block"
        );

        let box_a = graph.get_by_id(NodeId::intern("box_a")).unwrap();
        let box_b = graph.get_by_id(NodeId::intern("box_b")).unwrap();

        // Both nodes should now reference the new style
        assert!(
            !box_a.use_styles.is_empty(),
            "box_a should reference the hoisted style"
        );
        assert!(
            !box_b.use_styles.is_empty(),
            "box_b should reference the hoisted style"
        );
        assert_eq!(
            box_a.use_styles[0], box_b.use_styles[0],
            "both should reference same style"
        );

        // Inline style should be cleared
        assert!(
            box_a.props.fill.is_none(),
            "inline fill should be cleared after hoist"
        );
        assert!(
            box_b.props.fill.is_none(),
            "inline fill should be cleared after hoist"
        );
    }

    #[test]
    fn sort_nodes_reorders_by_kind() {
        let input = r#"
text @label "Hello" {
  font: "Inter" regular 14
}
rect @box {
  w: 100 h: 50
}
group @container {
  rect @inner {
    w: 50 h: 50
  }
}
"#;
        let mut graph = parse_document(input).unwrap();
        sort_nodes(&mut graph);
        let children = graph.children(graph.root);
        // Group should come first, then rect, then text
        assert_eq!(
            graph.graph[children[0]].id.as_str(),
            "container",
            "group should be first"
        );
        assert_eq!(
            graph.graph[children[1]].id.as_str(),
            "box",
            "rect should be second"
        );
        assert_eq!(
            graph.graph[children[2]].id.as_str(),
            "label",
            "text should be third"
        );
    }

    #[test]
    fn sort_nodes_preserves_relative_order() {
        let input = r#"
rect @second {
  w: 200 h: 100
}
rect @first {
  w: 100 h: 50
}
"#;
        let mut graph = parse_document(input).unwrap();
        sort_nodes(&mut graph);
        let children = graph.children(graph.root);
        // Both rects — original order preserved
        assert_eq!(graph.graph[children[0]].id.as_str(), "second");
        assert_eq!(graph.graph[children[1]].id.as_str(), "first");
    }

    #[test]
    fn sort_nodes_only_top_level() {
        let input = r#"
group @outer {
  text @label "Hi" {
    font: "Inter" regular 14
  }
  rect @inner {
    w: 50 h: 50
  }
}
"#;
        let mut graph = parse_document(input).unwrap();
        sort_nodes(&mut graph);
        let outer_idx = graph.index_of(NodeId::intern("outer")).unwrap();
        let children = graph.children(outer_idx);
        // Nested children should stay in document order (text before rect)
        assert_eq!(
            graph.graph[children[0]].id.as_str(),
            "label",
            "nested text should stay first"
        );
        assert_eq!(
            graph.graph[children[1]].id.as_str(),
            "inner",
            "nested rect should stay second"
        );
    }
}
