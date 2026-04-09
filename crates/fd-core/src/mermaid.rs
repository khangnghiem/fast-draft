//! Mermaid diagram import — parse Mermaid `flowchart` syntax into FD `SceneGraph`.
//!
//! Supports:
//! - `flowchart TD` (top-down) / `flowchart LR` (left-right)
//! - Node shapes: `A[Label]` (rect), `A(Label)` (rounded), `A((Label))` (circle/ellipse),
//!   `A{Label}` (diamond ≈ rect), `A>Label]` (flag ≈ rect)
//! - Edges: `A --> B`, `A --- B`, `A -->|text| B`, `A -.-> B`
//! - Subgraphs: `subgraph name ... end`
//!
//! Auto-positions nodes in a grid with 200px spacing based on direction.

use crate::id::NodeId;
use crate::model::*;
use std::collections::HashMap;

/// Direction hint parsed from `flowchart TD|TB|LR|RL|BT`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FlowDirection {
    #[default]
    TopDown,
    LeftRight,
    BottomUp,
    RightLeft,
}

/// Parsed node shape from Mermaid syntax.
#[derive(Debug, Clone, PartialEq, Eq)]
enum MermaidNodeShape {
    /// `A[Label]` — standard rectangle
    Rect,
    /// `A(Label)` — rounded rectangle
    Rounded,
    /// `A((Label))` — circle / ellipse
    Circle,
    /// `A{Label}` — diamond (approximated as rect)
    Diamond,
    /// `A>Label]` — flag (approximated as rect)
    Flag,
}

/// A parsed Mermaid node before conversion to FD.
#[derive(Debug, Clone)]
struct MermaidNode {
    id: String,
    label: String,
    shape: MermaidNodeShape,
}

/// A parsed Mermaid edge.
#[derive(Debug, Clone)]
struct MermaidEdge {
    from: String,
    to: String,
    /// Full token for the "from" side (e.g. `A(Rounded)`) — used by ensure_node for shape detection.
    from_token: String,
    /// Full token for the "to" side.
    to_token: String,
    label: Option<String>,
    has_arrow: bool,
}

/// A parsed Mermaid subgraph.
#[derive(Debug, Clone)]
struct MermaidSubgraph {
    id: String,
    label: String,
    node_ids: Vec<String>,
}

/// Parse a Mermaid diagram string into an FD `SceneGraph`.
///
/// Currently supports `flowchart` diagrams. Other diagram types
/// (`sequenceDiagram`, `stateDiagram`) return an error.
///
/// # Examples
///
/// ```
/// use fd_core::mermaid::parse_mermaid;
///
/// let input = "flowchart TD\n    A[Start] --> B[End]";
/// let graph = parse_mermaid(input).unwrap();
/// assert!(graph.get_by_id(fd_core::id::NodeId::intern("A")).is_some());
/// ```
pub fn parse_mermaid(input: &str) -> Result<SceneGraph, String> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(SceneGraph::new());
    }

    // Detect diagram type
    let first_line = input.lines().next().unwrap_or("");
    let first_word = first_line.split_whitespace().next().unwrap_or("");

    match first_word {
        "flowchart" | "graph" => parse_flowchart(input),
        "sequenceDiagram" => Err("sequenceDiagram import is not yet supported".into()),
        "stateDiagram" | "stateDiagram-v2" => {
            Err("stateDiagram import is not yet supported".into())
        }
        _ => Err(format!(
            "Unrecognized Mermaid diagram type: '{first_word}'. Expected flowchart, graph, sequenceDiagram, or stateDiagram."
        )),
    }
}

/// Parse a `flowchart` / `graph` diagram.
fn parse_flowchart(input: &str) -> Result<SceneGraph, String> {
    let mut lines = input.lines();

    // Parse header: `flowchart TD` or `graph LR`
    let header = lines.next().unwrap_or("");
    let direction = parse_direction(header);

    let mut nodes: HashMap<String, MermaidNode> = HashMap::new();
    let mut edges: Vec<MermaidEdge> = Vec::new();
    let mut subgraphs: Vec<MermaidSubgraph> = Vec::new();
    let mut current_subgraph: Option<MermaidSubgraph> = None;

    for line in lines {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with("%%") {
            continue;
        }

        // Handle subgraph start
        if trimmed.starts_with("subgraph") {
            let rest = trimmed.strip_prefix("subgraph").unwrap_or("").trim();
            // Parse: `subgraph id[label]` or `subgraph label`
            let (sg_id, sg_label) = if let Some((id, label)) = parse_subgraph_header(rest) {
                (id, label)
            } else {
                let clean = sanitize_id(rest);
                (clean.clone(), rest.to_string())
            };
            current_subgraph = Some(MermaidSubgraph {
                id: sg_id,
                label: sg_label,
                node_ids: Vec::new(),
            });
            continue;
        }

        // Handle subgraph end
        if trimmed == "end" {
            if let Some(sg) = current_subgraph.take() {
                subgraphs.push(sg);
            }
            continue;
        }

        // Handle `direction` statement inside subgraph (skip)
        if trimmed.starts_with("direction ") {
            continue;
        }

        // Handle `style` and `classDef` statements (skip)
        if trimmed.starts_with("style ") || trimmed.starts_with("classDef ") {
            continue;
        }

        // Handle `class` statement (skip)
        if trimmed.starts_with("class ") {
            continue;
        }

        // Handle `click` statement (skip)
        if trimmed.starts_with("click ") {
            continue;
        }

        // Try to parse as edge line (may contain implicit node definitions)
        if let Some(parsed_edges) = try_parse_edge_line(trimmed) {
            for pe in &parsed_edges {
                // Ensure nodes exist (implicit definition from edges)
                // Pass full tokens so shapes like A(Rounded) are detected
                ensure_node(&mut nodes, &pe.from_token);
                ensure_node(&mut nodes, &pe.to_token);
            }

            // Track nodes in current subgraph
            if let Some(ref mut sg) = current_subgraph {
                for pe in &parsed_edges {
                    if !sg.node_ids.contains(&pe.from) {
                        sg.node_ids.push(pe.from.clone());
                    }
                    if !sg.node_ids.contains(&pe.to) {
                        sg.node_ids.push(pe.to.clone());
                    }
                }
            }

            edges.extend(parsed_edges);
            continue;
        }

        // Try to parse as standalone node definition
        if let Some(node) = try_parse_node_def(trimmed) {
            if let Some(ref mut sg) = current_subgraph
                && !sg.node_ids.contains(&node.id)
            {
                sg.node_ids.push(node.id.clone());
            }
            nodes.insert(node.id.clone(), node);
            continue;
        }

        // Unknown line — skip silently (lenient parsing)
    }

    // Close any unclosed subgraph
    if let Some(sg) = current_subgraph.take() {
        subgraphs.push(sg);
    }

    // Build the SceneGraph
    build_scene_graph(&nodes, &edges, &subgraphs, direction)
}

/// Parse direction from the header line.
fn parse_direction(header: &str) -> FlowDirection {
    let parts: Vec<&str> = header.split_whitespace().collect();
    match parts.get(1).map(|s| s.to_uppercase()).as_deref() {
        Some("TD") | Some("TB") => FlowDirection::TopDown,
        Some("LR") => FlowDirection::LeftRight,
        Some("RL") => FlowDirection::RightLeft,
        Some("BT") => FlowDirection::BottomUp,
        _ => FlowDirection::TopDown,
    }
}

/// Parse a subgraph header: `id[label]` or `id ["label"]` → (id, label).
fn parse_subgraph_header(rest: &str) -> Option<(String, String)> {
    // Try `id[label]` format
    if let Some(bracket_start) = rest.find('[') {
        let id = rest[..bracket_start].trim().to_string();
        let after = &rest[bracket_start + 1..];
        let label = after
            .trim_end_matches(']')
            .trim()
            .trim_matches('"')
            .to_string();
        if !id.is_empty() {
            return Some((sanitize_id(&id), label));
        }
    }
    None
}

/// Sanitize a string into a valid FD node ID (alphanumeric + underscore).
fn sanitize_id(s: &str) -> String {
    s.trim()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

/// Ensure a node exists in the map. If not, create one from the token.
/// `token` may be a bare ID (`A`) or a shaped token (`A[Label]`, `A(Round)`).
/// The HashMap key is always the bare ID.
fn ensure_node(nodes: &mut HashMap<String, MermaidNode>, token: &str) {
    let bare_id = extract_node_id(token);
    if nodes.contains_key(&bare_id) {
        return;
    }
    // Check if the token has inline shape definition, e.g. "A[Label]"
    if let Some(node) = try_parse_node_def(token) {
        nodes.insert(node.id.clone(), node);
    } else {
        nodes.insert(
            bare_id.clone(),
            MermaidNode {
                id: bare_id.clone(),
                label: bare_id,
                shape: MermaidNodeShape::Rect,
            },
        );
    }
}

/// Try to parse a standalone node definition like `A[Label]`, `B(Round)`, `C((Circle))`.
fn try_parse_node_def(s: &str) -> Option<MermaidNode> {
    let s = s.trim().trim_end_matches(';');

    // Extract ID (leading alphanumeric/underscore chars)
    let id_end = s
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(s.len());
    if id_end == 0 {
        return None;
    }
    let id = &s[..id_end];
    let rest = &s[id_end..];

    if rest.is_empty() {
        // Bare ID, no shape — default rect with label = id
        return Some(MermaidNode {
            id: id.to_string(),
            label: id.to_string(),
            shape: MermaidNodeShape::Rect,
        });
    }

    // Determine shape by delimiter
    let (shape, label) = if rest.starts_with("((") && rest.ends_with("))") {
        // Circle: A((Label))
        let inner = &rest[2..rest.len() - 2];
        (MermaidNodeShape::Circle, inner.trim().to_string())
    } else if rest.starts_with('(') && rest.ends_with(')') {
        // Rounded: A(Label)
        let inner = &rest[1..rest.len() - 1];
        (MermaidNodeShape::Rounded, inner.trim().to_string())
    } else if rest.starts_with('[') && rest.ends_with(']') {
        // Rect: A[Label]
        let inner = &rest[1..rest.len() - 1];
        (MermaidNodeShape::Rect, inner.trim().to_string())
    } else if rest.starts_with('{') && rest.ends_with('}') {
        // Diamond: A{Label}
        let inner = &rest[1..rest.len() - 1];
        (MermaidNodeShape::Diamond, inner.trim().to_string())
    } else if rest.starts_with('>') && rest.ends_with(']') {
        // Flag: A>Label]
        let inner = &rest[1..rest.len() - 1];
        (MermaidNodeShape::Flag, inner.trim().to_string())
    } else {
        return None;
    };

    // Strip quotes from label if present
    let label = label.trim_matches('"').to_string();

    Some(MermaidNode {
        id: id.to_string(),
        label,
        shape,
    })
}

/// Try to parse an edge line like `A --> B`, `A -->|text| B`, `A --- B`.
/// Handles chained edges: `A --> B --> C` produces two edges.
fn try_parse_edge_line(line: &str) -> Option<Vec<MermaidEdge>> {
    let line = line.trim().trim_end_matches(';');

    // Edge patterns to detect (ordered by specificity)
    let edge_patterns = [
        ("-.->", true),  // dotted arrow
        ("--->", true),  // thick arrow
        ("-->", true),   // standard arrow
        ("---", false),  // no arrow
        ("==>", true),   // thick arrow
        ("===", false),  // thick line
        ("-..-", false), // dotted line
        ("-.-", false),  // dotted line
        ("->", true),    // short arrow
    ];

    // Find the first edge pattern in the line
    let mut edges = Vec::new();
    let mut remaining = line.to_string();

    loop {
        let mut found = false;

        for &(pattern, has_arrow) in &edge_patterns {
            if let Some(pos) = find_edge_pattern(&remaining, pattern) {
                let left = remaining[..pos].trim();
                let right_start = pos + pattern.len();
                let right_part = &remaining[right_start..];

                // Check for label: `|text|`
                let (label, after_label) = extract_edge_label(right_part);
                let right = extract_first_node(after_label.trim());

                if left.is_empty() || right.is_empty() {
                    break;
                }

                // The left side might be a node definition like `A[Label]`
                let from_id = extract_node_id(left);
                let to_id = extract_node_id(&right);

                edges.push(MermaidEdge {
                    from: from_id,
                    to: to_id,
                    from_token: left.to_string(),
                    to_token: right.clone(),
                    label,
                    has_arrow,
                });

                // Continue with the rest for chained edges
                let consumed =
                    pos + pattern.len() + (right_part.len() - after_label.len()) + right.len();
                if consumed < remaining.len() {
                    remaining = after_label[right.len()..].to_string();
                } else {
                    remaining.clear();
                }
                found = true;
                break;
            }
        }

        if !found || remaining.trim().is_empty() {
            break;
        }
    }

    if edges.is_empty() { None } else { Some(edges) }
}

/// Find an edge pattern, making sure it's not inside brackets.
fn find_edge_pattern(s: &str, pattern: &str) -> Option<usize> {
    let mut depth_sq = 0i32;
    let mut depth_paren = 0i32;
    let mut depth_curly = 0i32;
    let bytes = s.as_bytes();
    let pat_bytes = pattern.as_bytes();

    if pat_bytes.len() > bytes.len() {
        return None;
    }

    for i in 0..=bytes.len() - pat_bytes.len() {
        match bytes[i] {
            b'[' => depth_sq += 1,
            b']' => depth_sq -= 1,
            b'(' => depth_paren += 1,
            b')' => depth_paren -= 1,
            b'{' => depth_curly += 1,
            b'}' => depth_curly -= 1,
            _ => {}
        }

        if depth_sq == 0
            && depth_paren == 0
            && depth_curly == 0
            && &bytes[i..i + pat_bytes.len()] == pat_bytes
        {
            return Some(i);
        }
    }
    None
}

/// Extract an optional edge label `|text|` from after the edge arrow.
fn extract_edge_label(s: &str) -> (Option<String>, &str) {
    let s = s.trim();
    if let Some(after_pipe) = s.strip_prefix('|')
        && let Some(end) = after_pipe.find('|')
    {
        let label = after_pipe[..end].trim().to_string();
        let rest = &after_pipe[end + 1..];
        return (Some(label), rest);
    }
    (None, s)
}

/// Extract the first node token (ID + optional shape brackets) from a string.
fn extract_first_node(s: &str) -> String {
    let s = s.trim();
    // Read the ID part
    let id_end = s
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(s.len());
    if id_end == 0 {
        return s.to_string();
    }

    let rest = &s[id_end..];

    // Check for shape brackets following the ID
    let extra = if rest.starts_with("((") {
        // Circle: find matching ))
        rest.find("))").map(|p| p + 2).unwrap_or(0)
    } else if rest.starts_with('(') {
        rest.find(')').map(|p| p + 1).unwrap_or(0)
    } else if rest.starts_with('[') {
        rest.find(']').map(|p| p + 1).unwrap_or(0)
    } else if rest.starts_with('{') {
        rest.find('}').map(|p| p + 1).unwrap_or(0)
    } else if rest.starts_with('>') {
        rest.find(']').map(|p| p + 1).unwrap_or(0)
    } else {
        0
    };

    s[..id_end + extra].to_string()
}

/// Extract just the node ID from a token like `A[Label]` or bare `A`.
fn extract_node_id(token: &str) -> String {
    let token = token.trim();
    let id_end = token
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(token.len());
    token[..id_end].to_string()
}

/// Build an FD SceneGraph from parsed Mermaid components.
fn build_scene_graph(
    nodes: &HashMap<String, MermaidNode>,
    edges: &[MermaidEdge],
    subgraphs: &[MermaidSubgraph],
    direction: FlowDirection,
) -> Result<SceneGraph, String> {
    let mut graph = SceneGraph::new();
    let root = graph.root;

    // Collect nodes that belong to subgraphs
    let mut subgraph_membership: HashMap<String, String> = HashMap::new();
    for sg in subgraphs {
        for nid in &sg.node_ids {
            subgraph_membership.insert(nid.clone(), sg.id.clone());
        }
    }

    // Create subgraph frames first
    let mut subgraph_indices: HashMap<String, petgraph::graph::NodeIndex> = HashMap::new();
    for (i, sg) in subgraphs.iter().enumerate() {
        let sg_node_id = NodeId::intern(&sanitize_id(&sg.id));
        let frame_node = SceneNode {
            id: sg_node_id,
            kind: NodeKind::Frame {
                width: 300.0,
                height: 200.0,
                clip: false,
                layout: LayoutMode::Free { pad: 0.0 },
            },
            props: Properties {
                fill: Some(Paint::Solid(Color::rgba(0.95, 0.95, 0.97, 1.0))),
                corner_radius: Some(12.0),
                stroke: Some(Stroke {
                    paint: Paint::Solid(Color::rgba(0.7, 0.7, 0.8, 1.0)),
                    width: 1.5,
                    cap: StrokeCap::Round,
                    join: StrokeJoin::Round,
                }),
                ..Properties::default()
            },
            use_styles: Default::default(),
            constraints: smallvec::smallvec![Constraint::Position {
                x: 50.0 + (i as f32) * 350.0,
                y: 50.0,
            }],
            animations: Default::default(),
            note: None,
            comments: vec![format!("Subgraph: {}", sg.label)],
            place: None,
            locked: false,
        };
        let idx = graph.add_node(root, frame_node);
        subgraph_indices.insert(sg.id.clone(), idx);
    }

    // Create FD nodes with auto-layout positioning
    let node_count = nodes.len();
    let cols = match direction {
        FlowDirection::TopDown | FlowDirection::BottomUp => {
            (node_count as f32).sqrt().ceil() as usize
        }
        FlowDirection::LeftRight | FlowDirection::RightLeft => node_count,
    };
    let spacing_x = 200.0_f32;
    let spacing_y = 150.0_f32;

    // Sort nodes by first occurrence in edges for consistent ordering
    let mut ordered_ids: Vec<String> = Vec::new();
    for edge in edges {
        if !ordered_ids.contains(&edge.from) {
            ordered_ids.push(edge.from.clone());
        }
        if !ordered_ids.contains(&edge.to) {
            ordered_ids.push(edge.to.clone());
        }
    }
    // Add any nodes not referenced in edges
    for id in nodes.keys() {
        if !ordered_ids.contains(id) {
            ordered_ids.push(id.clone());
        }
    }

    let mut node_id_map: HashMap<String, NodeId> = HashMap::new();

    for (i, mermaid_id) in ordered_ids.iter().enumerate() {
        let mnode = match nodes.get(mermaid_id) {
            Some(n) => n,
            None => continue,
        };

        let fd_id = NodeId::intern(&sanitize_id(&mnode.id));
        node_id_map.insert(mermaid_id.clone(), fd_id);

        let col = i % cols.max(1);
        let row = i / cols.max(1);
        let rel_x = col as f32 * spacing_x;
        let rel_y = row as f32 * spacing_y;

        // Determine parent (subgraph frame or root)
        let parent_idx = subgraph_membership
            .get(mermaid_id)
            .and_then(|sg_id| subgraph_indices.get(sg_id))
            .copied()
            .unwrap_or(root);

        // Create the node based on shape
        let (kind, corner_radius) = match mnode.shape {
            MermaidNodeShape::Rect | MermaidNodeShape::Flag => (
                NodeKind::Rect {
                    width: 120.0,
                    height: 60.0,
                },
                Some(8.0),
            ),
            MermaidNodeShape::Rounded => (
                NodeKind::Rect {
                    width: 120.0,
                    height: 60.0,
                },
                Some(30.0),
            ),
            MermaidNodeShape::Circle => (NodeKind::Ellipse { rx: 40.0, ry: 40.0 }, None),
            MermaidNodeShape::Diamond => (
                NodeKind::Rect {
                    width: 100.0,
                    height: 100.0,
                },
                Some(4.0),
            ),
        };

        let scene_node = SceneNode {
            id: fd_id,
            kind,
            props: Properties {
                fill: Some(Paint::Solid(Color::rgba(0.93, 0.95, 1.0, 1.0))),
                stroke: Some(Stroke {
                    paint: Paint::Solid(Color::rgba(0.2, 0.2, 0.3, 1.0)),
                    width: 2.0,
                    cap: StrokeCap::Round,
                    join: StrokeJoin::Round,
                }),
                corner_radius,
                ..Properties::default()
            },
            use_styles: Default::default(),
            constraints: smallvec::smallvec![Constraint::Position { x: rel_x, y: rel_y }],
            animations: Default::default(),
            note: None,
            comments: Vec::new(),
            place: None,
            locked: false,
        };

        // Add the main node
        let node_idx = graph.add_node(parent_idx, scene_node);

        // Add text child for the label (if label differs from ID or has content)
        if !mnode.label.is_empty() {
            let text_id = NodeId::intern(&format!("{}_label", sanitize_id(&mnode.id)));
            let text_node = SceneNode {
                id: text_id,
                kind: NodeKind::Text {
                    content: mnode.label.clone(),
                    max_width: None,
                },
                props: Properties {
                    font: Some(FontSpec {
                        family: "Inter".into(),
                        weight: 500,
                        size: 14.0,
                    }),
                    fill: Some(Paint::Solid(Color::rgba(0.1, 0.1, 0.15, 1.0))),
                    ..Properties::default()
                },
                use_styles: Default::default(),
                constraints: Default::default(),
                animations: Default::default(),
                note: None,
                comments: Vec::new(),
                place: Some((HPlace::Center, VPlace::Middle)),
                locked: false,
            };
            graph.add_node(node_idx, text_node);
        }
    }

    // Create FD edges
    for me in edges {
        let from_id = match node_id_map.get(&me.from) {
            Some(id) => *id,
            None => continue,
        };
        let to_id = match node_id_map.get(&me.to) {
            Some(id) => *id,
            None => continue,
        };

        let edge_id = NodeId::intern(&format!(
            "{}_to_{}",
            sanitize_id(&me.from),
            sanitize_id(&me.to)
        ));

        let arrow = if me.has_arrow {
            ArrowKind::End
        } else {
            ArrowKind::None
        };

        // Create text child for edge label if present
        let text_child = me.label.as_ref().map(|label_text| {
            let tc_id = NodeId::intern(&format!("{}_text", edge_id.as_str()));
            let text_node = SceneNode {
                id: tc_id,
                kind: NodeKind::Text {
                    content: label_text.clone(),
                    max_width: None,
                },
                props: Properties {
                    font: Some(FontSpec {
                        family: "Inter".into(),
                        weight: 400,
                        size: 12.0,
                    }),
                    fill: Some(Paint::Solid(Color::rgba(0.3, 0.3, 0.4, 1.0))),
                    ..Properties::default()
                },
                use_styles: Default::default(),
                constraints: Default::default(),
                animations: Default::default(),
                note: None,
                comments: Vec::new(),
                place: None,
                locked: false,
            };
            let idx = graph.graph.add_node(text_node);
            graph.graph.add_edge(root, idx, ());
            graph.id_index.insert(tc_id, idx);
            tc_id
        });

        let edge = Edge {
            id: edge_id,
            from: EdgeAnchor::Node(from_id),
            to: EdgeAnchor::Node(to_id),
            text_child,
            props: Properties::default(),
            use_styles: Default::default(),
            arrow,
            curve: CurveKind::Smooth,
            note: None,
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        graph.edges.push(edge);
    }

    Ok(graph)
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_flowchart() {
        let input = "flowchart TD\n    A[Start] --> B[End]";
        let graph = parse_mermaid(input).unwrap();
        assert!(graph.get_by_id(NodeId::intern("A")).is_some());
        assert!(graph.get_by_id(NodeId::intern("B")).is_some());
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].arrow, ArrowKind::End);
    }

    #[test]
    fn parse_flowchart_lr() {
        let input = "flowchart LR\n    X[Hello] --> Y[World]";
        let graph = parse_mermaid(input).unwrap();
        assert!(graph.get_by_id(NodeId::intern("X")).is_some());
        assert!(graph.get_by_id(NodeId::intern("Y")).is_some());
    }

    #[test]
    fn parse_labeled_edge() {
        let input = "flowchart TD\n    A --> |yes| B\n    A --> |no| C";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.edges.len(), 2);
        // Labels are stored as text_child nodes on the edge
        assert!(graph.edges[0].text_child.is_some());
        assert!(graph.edges[1].text_child.is_some());
    }

    #[test]
    fn parse_rounded_node() {
        let input = "flowchart TD\n    A(Rounded Node) --> B[Square]";
        let graph = parse_mermaid(input).unwrap();
        let a = graph.get_by_id(NodeId::intern("A")).unwrap();
        // Rounded gets corner_radius=30
        assert_eq!(a.props.corner_radius, Some(30.0));
    }

    #[test]
    fn parse_circle_node() {
        let input = "flowchart TD\n    A((Circle)) --> B[Rect]";
        let graph = parse_mermaid(input).unwrap();
        let a = graph.get_by_id(NodeId::intern("A")).unwrap();
        assert!(matches!(a.kind, NodeKind::Ellipse { .. }));
    }

    #[test]
    fn parse_no_arrow_edge() {
        let input = "flowchart TD\n    A --- B";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].arrow, ArrowKind::None);
    }

    #[test]
    fn parse_subgraph() {
        let input = "flowchart TD\n    subgraph Frontend\n        A[React] --> B[Redux]\n    end\n    C[API]";
        let graph = parse_mermaid(input).unwrap();
        // Subgraph creates a Frame node
        assert!(graph.get_by_id(NodeId::intern("Frontend")).is_some());
        let frame = graph.get_by_id(NodeId::intern("Frontend")).unwrap();
        assert!(matches!(frame.kind, NodeKind::Frame { .. }));
        // All nodes should exist
        assert!(graph.get_by_id(NodeId::intern("A")).is_some());
        assert!(graph.get_by_id(NodeId::intern("B")).is_some());
        assert!(graph.get_by_id(NodeId::intern("C")).is_some());
    }

    #[test]
    fn parse_empty_input() {
        let graph = parse_mermaid("").unwrap();
        assert_eq!(graph.children(graph.root).len(), 0);
    }

    #[test]
    fn parse_unsupported_type_errors() {
        assert!(parse_mermaid("sequenceDiagram").is_err());
        assert!(parse_mermaid("stateDiagram").is_err());
        assert!(parse_mermaid("unknown").is_err());
    }

    #[test]
    fn parse_graph_keyword() {
        // `graph` is a synonym for `flowchart` in Mermaid
        let input = "graph TD\n    A --> B";
        let graph = parse_mermaid(input).unwrap();
        assert!(graph.get_by_id(NodeId::intern("A")).is_some());
    }

    #[test]
    fn parse_multiple_edges() {
        let input = "flowchart TD\n    A --> B\n    B --> C\n    C --> A";
        let graph = parse_mermaid(input).unwrap();
        assert_eq!(graph.edges.len(), 3);
        assert_eq!(graph.children(graph.root).len(), 3); // 3 nodes
    }

    #[test]
    fn roundtrip_mermaid_to_fd() {
        let input = "flowchart TD\n    A[Login] --> B[Dashboard]";
        let graph = parse_mermaid(input).unwrap();
        // Emit as FD text
        let fd_text = crate::emitter::emit_document(&graph);
        // Re-parse FD text
        let reparsed = crate::parser::parse_document(&fd_text).unwrap();
        assert!(reparsed.get_by_id(NodeId::intern("A")).is_some());
        assert!(reparsed.get_by_id(NodeId::intern("B")).is_some());
        assert!(!reparsed.edges.is_empty());
    }

    #[test]
    fn parse_diamond_node() {
        let input = "flowchart TD\n    A{Decision} --> B[Yes]";
        let graph = parse_mermaid(input).unwrap();
        let a = graph.get_by_id(NodeId::intern("A")).unwrap();
        assert!(matches!(a.kind, NodeKind::Rect { .. }));
    }

    #[test]
    fn parse_comments_and_empty_lines() {
        let input = "flowchart TD\n    %% This is a comment\n\n    A --> B\n    %% Another comment";
        let graph = parse_mermaid(input).unwrap();
        assert!(graph.get_by_id(NodeId::intern("A")).is_some());
        assert!(graph.get_by_id(NodeId::intern("B")).is_some());
    }

    #[test]
    fn node_id_sanitization() {
        assert_eq!(sanitize_id("hello-world"), "hello_world");
        assert_eq!(sanitize_id("  spaces  "), "spaces");
        assert_eq!(sanitize_id("valid_id"), "valid_id");
    }

    #[test]
    fn extract_node_id_from_token() {
        assert_eq!(extract_node_id("A[Label]"), "A");
        assert_eq!(extract_node_id("myNode"), "myNode");
        assert_eq!(extract_node_id("A((Circle))"), "A");
    }
}
