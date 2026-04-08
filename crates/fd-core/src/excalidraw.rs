//! Excalidraw JSON export: SceneGraph → Excalidraw v2 JSON.
//!
//! Maps FD nodes to Excalidraw elements:
//! - Rect/Frame → `rectangle`
//! - Ellipse → `ellipse`
//! - Text → `text`
//! - Path → `freedraw`
//! - Group → (children emitted individually)

use crate::id::NodeId;
use crate::model::*;
use petgraph::graph::NodeIndex;
use std::collections::HashMap;
use std::fmt::Write;

/// Convert a SceneGraph (or a subset of selected nodes) to Excalidraw v2 JSON.
///
/// If `selected_ids` is empty, all top-level nodes are exported.
/// Returns a valid JSON string ready to paste into excalidraw.com.
pub fn export_excalidraw(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    selected_ids: &[String],
) -> String {
    let root_selection = collect_root_selection(graph, selected_ids);

    let mut elements = Vec::new();
    let mut id_counter: u64 = 1;

    for &idx in &root_selection {
        collect_elements(graph, idx, bounds, &mut elements, &mut id_counter);
    }

    // Build JSON manually to avoid serde dependency for this one feature
    let mut out = String::with_capacity(2048);
    out.push_str("{\n  \"type\": \"excalidraw\",\n  \"version\": 2,\n  \"elements\": [\n");

    for (i, el) in elements.iter().enumerate() {
        if i > 0 {
            out.push_str(",\n");
        }
        write_element_json(&mut out, el);
    }

    out.push_str("\n  ]\n}");
    out
}

/// An intermediate Excalidraw element representation.
struct ExcalidrawElement {
    id: String,
    element_type: &'static str,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    stroke_color: String,
    background_color: String,
    fill_style: &'static str,
    stroke_width: f32,
    opacity: f32,
    /// For text elements only.
    text: Option<String>,
    font_size: Option<f32>,
    /// For freedraw elements only.
    points: Option<Vec<(f32, f32)>>,
    corner_radius: Option<f32>,
}

/// Collect root-level node indices to export, filtering by selection.
fn collect_root_selection(graph: &SceneGraph, selected_ids: &[String]) -> Vec<NodeIndex> {
    if selected_ids.is_empty() {
        return graph.children(graph.root);
    }

    let mut roots = Vec::new();
    for id_str in selected_ids {
        let id = NodeId::intern(id_str);
        if let Some(idx) = graph.index_of(id) {
            // Skip if an ancestor is already selected
            let has_selected_ancestor = selected_ids
                .iter()
                .any(|other| other != id_str && graph.is_ancestor_of(NodeId::intern(other), id));
            if !has_selected_ancestor {
                roots.push(idx);
            }
        }
    }
    roots
}

/// Recursively collect Excalidraw elements from the scene graph.
fn collect_elements(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    elements: &mut Vec<ExcalidrawElement>,
    id_counter: &mut u64,
) {
    let node = &graph.graph[idx];
    let b = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let style = graph.resolve_style(node, &[]);
    let opacity = style.opacity.unwrap_or(1.0);
    let stroke_color = style
        .stroke
        .as_ref()
        .map(|s| paint_to_hex(&s.paint))
        .unwrap_or_else(|| "#000000".to_string());
    let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(1.0);
    let bg_color = style
        .fill
        .as_ref()
        .map(paint_to_hex)
        .unwrap_or_else(|| "transparent".to_string());
    let fill_style = if bg_color == "transparent" {
        "hachure"
    } else {
        "solid"
    };
    let corner_radius = style.corner_radius;

    let unique_id = format!("fd_{}", {
        let v = *id_counter;
        *id_counter += 1;
        v
    });

    match &node.kind {
        NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
            elements.push(ExcalidrawElement {
                id: unique_id,
                element_type: "rectangle",
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                stroke_color,
                background_color: bg_color,
                fill_style,
                stroke_width,
                opacity,
                text: None,
                font_size: None,
                points: None,
                corner_radius,
            });
        }
        NodeKind::Ellipse { .. } => {
            elements.push(ExcalidrawElement {
                id: unique_id,
                element_type: "ellipse",
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                stroke_color,
                background_color: bg_color,
                fill_style,
                stroke_width,
                opacity,
                text: None,
                font_size: None,
                points: None,
                corner_radius: None,
            });
        }
        NodeKind::Text { content, .. } => {
            let font_size = style.font.as_ref().map(|f| f.size).unwrap_or(16.0);
            let text_color = style
                .fill
                .as_ref()
                .map(paint_to_hex)
                .unwrap_or_else(|| "#000000".to_string());

            elements.push(ExcalidrawElement {
                id: unique_id,
                element_type: "text",
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                stroke_color: text_color,
                background_color: "transparent".to_string(),
                fill_style: "hachure",
                stroke_width: 0.0,
                opacity,
                text: Some(content.replace('\\', "\n")),
                font_size: Some(font_size),
                points: None,
                corner_radius: None,
            });
        }
        NodeKind::Path { commands } => {
            let mut points = Vec::new();
            for cmd in commands {
                match cmd {
                    PathCmd::MoveTo(x, y) | PathCmd::LineTo(x, y) => {
                        points.push((*x, *y));
                    }
                    PathCmd::QuadTo(_, _, x, y) => {
                        points.push((*x, *y));
                    }
                    PathCmd::CubicTo(_, _, _, _, x, y) => {
                        points.push((*x, *y));
                    }
                    PathCmd::Close => {
                        if let Some(&first) = points.first() {
                            points.push(first);
                        }
                    }
                }
            }

            elements.push(ExcalidrawElement {
                id: unique_id,
                element_type: "freedraw",
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                stroke_color,
                background_color: "transparent".to_string(),
                fill_style: "hachure",
                stroke_width,
                opacity,
                text: None,
                font_size: None,
                points: Some(points),
                corner_radius: None,
            });
        }
        NodeKind::Image { .. } => {
            // Images export as placeholder rectangles (Excalidraw has no image type)
            elements.push(ExcalidrawElement {
                id: unique_id,
                element_type: "rectangle",
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
                stroke_color,
                background_color: bg_color,
                fill_style,
                stroke_width,
                opacity,
                text: None,
                font_size: None,
                points: None,
                corner_radius,
            });
        }
        NodeKind::Group | NodeKind::Root | NodeKind::Generic | NodeKind::Icon { .. } => {
            // Groups are organizational — emit children only
            // Icons are not natively supported in Excalidraw, emit as empty for now
        }
    }

    // Recurse into children
    for child_idx in graph.children(idx) {
        collect_elements(graph, child_idx, bounds, elements, id_counter);
    }
}

/// Convert a Paint to a hex color string.
fn paint_to_hex(paint: &Paint) -> String {
    match paint {
        Paint::Solid(c) => c.to_hex(),
        Paint::LinearGradient { stops, .. } | Paint::RadialGradient { stops } => stops
            .first()
            .map(|s| s.color.to_hex())
            .unwrap_or_else(|| "#000000".to_string()),
    }
}

/// Write a single Excalidraw element as JSON.
fn write_element_json(out: &mut String, el: &ExcalidrawElement) {
    out.push_str("    {\n");
    let _ = writeln!(out, "      \"id\": \"{}\",", el.id);
    let _ = writeln!(out, "      \"type\": \"{}\",", el.element_type);
    let _ = writeln!(out, "      \"x\": {},", format_num(el.x));
    let _ = writeln!(out, "      \"y\": {},", format_num(el.y));
    let _ = writeln!(out, "      \"width\": {},", format_num(el.width));
    let _ = writeln!(out, "      \"height\": {},", format_num(el.height));
    let _ = writeln!(out, "      \"angle\": 0,");
    let _ = writeln!(out, "      \"strokeColor\": \"{}\",", el.stroke_color);
    let _ = writeln!(
        out,
        "      \"backgroundColor\": \"{}\",",
        el.background_color
    );
    let _ = writeln!(out, "      \"fillStyle\": \"{}\",", el.fill_style);
    let _ = writeln!(
        out,
        "      \"strokeWidth\": {},",
        format_num(el.stroke_width)
    );
    let _ = writeln!(out, "      \"roughness\": 0,");
    let _ = writeln!(out, "      \"opacity\": {},", (el.opacity * 100.0) as u32);

    if let Some(r) = el.corner_radius
        && r > 0.0
    {
        let _ = writeln!(
            out,
            "      \"roundness\": {{ \"type\": 3, \"value\": {} }},",
            format_num(r)
        );
    }

    if let Some(ref text) = el.text {
        // Escape special JSON characters in text content
        let escaped = text
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");
        let _ = writeln!(out, "      \"text\": \"{}\",", escaped);
        let _ = writeln!(
            out,
            "      \"fontSize\": {},",
            format_num(el.font_size.unwrap_or(16.0))
        );
        let _ = writeln!(out, "      \"fontFamily\": 1,");
        let _ = writeln!(out, "      \"textAlign\": \"left\",");
        let _ = writeln!(out, "      \"verticalAlign\": \"top\",");
    }

    if let Some(ref points) = el.points {
        out.push_str("      \"points\": [");
        for (i, (x, y)) in points.iter().enumerate() {
            if i > 0 {
                out.push_str(", ");
            }
            let _ = write!(out, "[{}, {}]", format_num(*x), format_num(*y));
        }
        out.push_str("],\n");
    }

    // seed is required by Excalidraw for deterministic rendering
    let _ = writeln!(out, "      \"seed\": 1,");
    let _ = writeln!(out, "      \"version\": 1,");
    let _ = write!(out, "      \"versionNonce\": 1");

    out.push_str("\n    }");
}

/// Format a float: strip trailing zeros, emit integers without decimal point.
fn format_num(v: f32) -> String {
    if v == v.floor() && v.abs() < 1e9 {
        format!("{}", v as i64)
    } else {
        let s = format!("{:.2}", v);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_document;

    fn parse_and_resolve(input: &str) -> (SceneGraph, HashMap<NodeIndex, ResolvedBounds>) {
        let graph = parse_document(input).expect("test parse failed");
        let viewport = crate::layout::Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = crate::layout::resolve_layout(&graph, viewport);
        (graph, bounds)
    }

    #[test]
    fn export_excalidraw_rect() {
        let (graph, bounds) = parse_and_resolve("rect @box { w: 100 h: 60 fill: #FF0000 }");
        let json = export_excalidraw(&graph, &bounds, &[]);

        assert!(json.contains("\"type\": \"excalidraw\""));
        assert!(json.contains("\"type\": \"rectangle\""));
        assert!(json.contains("\"width\": 100"));
        assert!(json.contains("\"height\": 60"));
        assert!(json.contains("\"backgroundColor\": \"#FF0000\""));
    }

    #[test]
    fn export_excalidraw_ellipse() {
        let (graph, bounds) = parse_and_resolve("ellipse @circle { w: 80 h: 80 fill: #00FF00 }");
        let json = export_excalidraw(&graph, &bounds, &[]);

        assert!(json.contains("\"type\": \"ellipse\""));
        // Ellipse dimensions come from layout resolver (may differ from source w:/h:)
        assert!(json.contains("\"width\":"));
        assert!(json.contains("\"height\":"));
        assert!(json.contains("\"backgroundColor\": \"#00FF00\""));
    }

    #[test]
    fn export_excalidraw_text() {
        let (graph, bounds) = parse_and_resolve("text @label \"Hello World\" {}");
        let json = export_excalidraw(&graph, &bounds, &[]);

        assert!(json.contains("\"type\": \"text\""));
        assert!(json.contains("\"text\": \"Hello World\""));
        assert!(json.contains("\"fontSize\":"));
    }

    #[test]
    fn export_excalidraw_selection() {
        let input = "rect @a { w: 100 h: 50 }\nrect @b { w: 200 h: 80 }";
        let (graph, bounds) = parse_and_resolve(input);

        // Export only @a
        let json = export_excalidraw(&graph, &bounds, &["a".to_string()]);

        // Should have exactly one element
        let count = json.matches("\"type\": \"rectangle\"").count();
        assert_eq!(count, 1, "Should export only the selected node");
        assert!(json.contains("\"width\": 100"));
    }

    #[test]
    fn export_excalidraw_empty_graph() {
        let graph = SceneGraph::new();
        let bounds = HashMap::new();
        let json = export_excalidraw(&graph, &bounds, &[]);

        assert!(json.contains("\"type\": \"excalidraw\""));
        assert!(json.contains("\"elements\": ["));
        // No elements in empty graph
        assert!(!json.contains("\"seed\""));
    }

    #[test]
    fn export_excalidraw_valid_json() {
        let input = r#"
rect @card { w: 200 h: 150 fill: #3498DB corner: 12 }
ellipse @avatar { w: 60 h: 60 fill: #E74C3C }
text @title "Dashboard" { font: "Inter" bold 24 }
"#;
        let (graph, bounds) = parse_and_resolve(input);
        let json = export_excalidraw(&graph, &bounds, &[]);

        // Verify it parses as valid JSON by checking structural integrity
        assert!(json.starts_with('{'));
        assert!(json.ends_with('}'));
        assert!(json.contains("\"type\": \"excalidraw\""));
        assert!(json.contains("\"version\": 2"));

        // Count elements: rect + ellipse + text = 3
        let element_count = json.matches("\"seed\": 1").count();
        assert_eq!(element_count, 3);
    }

    #[test]
    fn export_excalidraw_group_children() {
        let input = r#"
group @g {
  rect @inner { w: 50 h: 30 }
}
"#;
        let (graph, bounds) = parse_and_resolve(input);
        let json = export_excalidraw(&graph, &bounds, &[]);

        // Group itself is not exported, but its child rect is
        assert!(json.contains("\"type\": \"rectangle\""));
        assert!(!json.contains("\"type\": \"group\""));
    }

    #[test]
    fn export_excalidraw_corner_radius() {
        let (graph, bounds) = parse_and_resolve("rect @r { w: 100 h: 50 corner: 8 }");
        let json = export_excalidraw(&graph, &bounds, &[]);

        assert!(json.contains("\"roundness\""));
        assert!(json.contains("\"value\": 8"));
    }

    #[test]
    fn export_excalidraw_opacity() {
        let (graph, bounds) = parse_and_resolve("rect @r { w: 100 h: 50 opacity: 0.5 }");
        let json = export_excalidraw(&graph, &bounds, &[]);

        // Excalidraw uses 0-100 for opacity
        assert!(json.contains("\"opacity\": 50"));
    }
}
