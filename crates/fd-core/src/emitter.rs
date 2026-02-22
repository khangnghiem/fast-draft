//! Emitter: SceneGraph → FD text format.
//!
//! Produces minimal, token-efficient output that round-trips through the parser.

use crate::id::NodeId;
use crate::model::*;
use petgraph::graph::NodeIndex;
use std::fmt::Write;

/// Emit a `SceneGraph` as an FD text document.
#[must_use]
pub fn emit_document(graph: &SceneGraph) -> String {
    let mut out = String::with_capacity(1024);

    // Emit imports
    for import in &graph.imports {
        let _ = writeln!(out, "import \"{}\" as {}", import.path, import.namespace);
    }
    if !graph.imports.is_empty() {
        out.push('\n');
    }

    // Emit style definitions first
    let mut styles: Vec<_> = graph.styles.iter().collect();
    styles.sort_by_key(|(id, _)| id.as_str().to_string());
    for (name, style) in &styles {
        emit_style_block(&mut out, name, style, 0);
        out.push('\n');
    }

    // Emit root's children
    let children = graph.children(graph.root);
    for child_idx in &children {
        emit_node(&mut out, graph, *child_idx, 0);
        out.push('\n');
    }

    // Emit top-level constraints (constraints on nodes that reference non-parent targets)
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        for constraint in &node.constraints {
            emit_constraint(&mut out, &node.id, constraint);
        }
    }

    // Emit edges
    for edge in &graph.edges {
        emit_edge(&mut out, edge);
    }

    out
}

fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}

fn emit_style_block(out: &mut String, name: &NodeId, style: &Style, depth: usize) {
    indent(out, depth);
    writeln!(out, "style {} {{", name.as_str()).unwrap();

    if let Some(ref fill) = style.fill {
        emit_paint_prop(out, "fill", fill, depth + 1);
    }
    if let Some(ref font) = style.font {
        emit_font_prop(out, font, depth + 1);
    }
    if let Some(radius) = style.corner_radius {
        indent(out, depth + 1);
        writeln!(out, "corner: {}", format_num(radius)).unwrap();
    }
    if let Some(opacity) = style.opacity {
        indent(out, depth + 1);
        writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
    }

    indent(out, depth);
    out.push_str("}\n");
}

fn emit_node(out: &mut String, graph: &SceneGraph, idx: NodeIndex, depth: usize) {
    let node = &graph.graph[idx];

    // Emit preserved `# comment` lines before the node declaration
    for comment in &node.comments {
        indent(out, depth);
        writeln!(out, "# {comment}").unwrap();
    }

    indent(out, depth);

    // Node kind keyword + optional @id + optional inline text
    match &node.kind {
        NodeKind::Root => return,
        NodeKind::Generic => write!(out, "@{}", node.id.as_str()).unwrap(),
        NodeKind::Group { .. } => write!(out, "group @{}", node.id.as_str()).unwrap(),
        NodeKind::Rect { .. } => write!(out, "rect @{}", node.id.as_str()).unwrap(),
        NodeKind::Ellipse { .. } => write!(out, "ellipse @{}", node.id.as_str()).unwrap(),
        NodeKind::Path { .. } => write!(out, "path @{}", node.id.as_str()).unwrap(),
        NodeKind::Text { content } => {
            write!(out, "text @{} \"{}\"", node.id.as_str(), content).unwrap();
        }
    }

    out.push_str(" {\n");

    // Annotations (## lines)
    emit_annotations(out, &node.annotations, depth + 1);

    // Layout mode (for groups)
    if let NodeKind::Group { layout } = &node.kind {
        match layout {
            LayoutMode::Free => {}
            LayoutMode::Column { gap, pad } => {
                indent(out, depth + 1);
                writeln!(
                    out,
                    "layout: column gap={} pad={}",
                    format_num(*gap),
                    format_num(*pad)
                )
                .unwrap();
            }
            LayoutMode::Row { gap, pad } => {
                indent(out, depth + 1);
                writeln!(
                    out,
                    "layout: row gap={} pad={}",
                    format_num(*gap),
                    format_num(*pad)
                )
                .unwrap();
            }
            LayoutMode::Grid { cols, gap, pad } => {
                indent(out, depth + 1);
                writeln!(
                    out,
                    "layout: grid cols={cols} gap={} pad={}",
                    format_num(*gap),
                    format_num(*pad)
                )
                .unwrap();
            }
        }
    }

    // Dimensions
    match &node.kind {
        NodeKind::Rect { width, height } => {
            indent(out, depth + 1);
            writeln!(out, "w: {} h: {}", format_num(*width), format_num(*height)).unwrap();
        }
        NodeKind::Ellipse { rx, ry } => {
            indent(out, depth + 1);
            writeln!(out, "w: {} h: {}", format_num(*rx), format_num(*ry)).unwrap();
        }
        _ => {}
    }

    // Style references
    for style_ref in &node.use_styles {
        indent(out, depth + 1);
        writeln!(out, "use: {}", style_ref.as_str()).unwrap();
    }

    // Inline style properties
    if let Some(ref fill) = node.style.fill {
        emit_paint_prop(out, "fill", fill, depth + 1);
    }
    if let Some(ref stroke) = node.style.stroke {
        indent(out, depth + 1);
        match &stroke.paint {
            Paint::Solid(c) => {
                writeln!(out, "stroke: {} {}", c.to_hex(), format_num(stroke.width)).unwrap()
            }
            _ => writeln!(out, "stroke: #000 {}", format_num(stroke.width)).unwrap(),
        }
    }
    if let Some(radius) = node.style.corner_radius {
        indent(out, depth + 1);
        writeln!(out, "corner: {}", format_num(radius)).unwrap();
    }
    if let Some(ref font) = node.style.font {
        emit_font_prop(out, font, depth + 1);
    }
    if let Some(opacity) = node.style.opacity {
        indent(out, depth + 1);
        writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
    }
    if let Some(ref label) = node.style.label {
        indent(out, depth + 1);
        writeln!(out, "label: \"{label}\"").unwrap();
    }

    // Children
    let children = graph.children(idx);
    for child_idx in &children {
        emit_node(out, graph, *child_idx, depth + 1);
    }

    // Animations
    for anim in &node.animations {
        emit_anim(out, anim, depth + 1);
    }

    indent(out, depth);
    out.push_str("}\n");
}

fn emit_annotations(out: &mut String, annotations: &[Annotation], depth: usize) {
    for ann in annotations {
        indent(out, depth);
        match ann {
            Annotation::Description(s) => writeln!(out, "## \"{s}\"").unwrap(),
            Annotation::Accept(s) => writeln!(out, "## accept: \"{s}\"").unwrap(),
            Annotation::Status(s) => writeln!(out, "## status: {s}").unwrap(),
            Annotation::Priority(s) => writeln!(out, "## priority: {s}").unwrap(),
            Annotation::Tag(s) => writeln!(out, "## tag: {s}").unwrap(),
        }
    }
}

fn emit_paint_prop(out: &mut String, name: &str, paint: &Paint, depth: usize) {
    indent(out, depth);
    match paint {
        Paint::Solid(c) => writeln!(out, "{name}: {}", c.to_hex()).unwrap(),
        Paint::LinearGradient { angle, stops } => {
            write!(out, "{name}: linear({}deg", format_num(*angle)).unwrap();
            for stop in stops {
                write!(out, ", {} {}", stop.color.to_hex(), format_num(stop.offset)).unwrap();
            }
            writeln!(out, ")").unwrap();
        }
        Paint::RadialGradient { stops } => {
            write!(out, "{name}: radial(").unwrap();
            for (i, stop) in stops.iter().enumerate() {
                if i > 0 {
                    write!(out, ", ").unwrap();
                }
                write!(out, "{} {}", stop.color.to_hex(), format_num(stop.offset)).unwrap();
            }
            writeln!(out, ")").unwrap();
        }
    }
}

fn emit_font_prop(out: &mut String, font: &FontSpec, depth: usize) {
    indent(out, depth);
    writeln!(
        out,
        "font: \"{}\" {} {}",
        font.family,
        font.weight,
        format_num(font.size)
    )
    .unwrap();
}

fn emit_anim(out: &mut String, anim: &AnimKeyframe, depth: usize) {
    indent(out, depth);
    let trigger = match &anim.trigger {
        AnimTrigger::Hover => "hover",
        AnimTrigger::Press => "press",
        AnimTrigger::Enter => "enter",
        AnimTrigger::Custom(s) => s.as_str(),
    };
    writeln!(out, "anim :{trigger} {{").unwrap();

    if let Some(ref fill) = anim.properties.fill {
        emit_paint_prop(out, "fill", fill, depth + 1);
    }
    if let Some(opacity) = anim.properties.opacity {
        indent(out, depth + 1);
        writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
    }
    if let Some(scale) = anim.properties.scale {
        indent(out, depth + 1);
        writeln!(out, "scale: {}", format_num(scale)).unwrap();
    }
    if let Some(rotate) = anim.properties.rotate {
        indent(out, depth + 1);
        writeln!(out, "rotate: {}", format_num(rotate)).unwrap();
    }

    let ease_name = match &anim.easing {
        Easing::Linear => "linear",
        Easing::EaseIn => "ease_in",
        Easing::EaseOut => "ease_out",
        Easing::EaseInOut => "ease_in_out",
        Easing::Spring => "spring",
        Easing::CubicBezier(_, _, _, _) => "cubic",
    };
    indent(out, depth + 1);
    writeln!(out, "ease: {ease_name} {}ms", anim.duration_ms).unwrap();

    indent(out, depth);
    out.push_str("}\n");
}

fn emit_constraint(out: &mut String, node_id: &NodeId, constraint: &Constraint) {
    match constraint {
        Constraint::CenterIn(target) => {
            writeln!(
                out,
                "@{} -> center_in: {}",
                node_id.as_str(),
                target.as_str()
            )
            .unwrap();
        }
        Constraint::Offset { from, dx, dy } => {
            writeln!(
                out,
                "@{} -> offset: @{} {}, {}",
                node_id.as_str(),
                from.as_str(),
                format_num(*dx),
                format_num(*dy)
            )
            .unwrap();
        }
        Constraint::FillParent { pad } => {
            writeln!(
                out,
                "@{} -> fill_parent: {}",
                node_id.as_str(),
                format_num(*pad)
            )
            .unwrap();
        }
        Constraint::Absolute { x, y } => {
            writeln!(
                out,
                "@{} -> absolute: {}, {}",
                node_id.as_str(),
                format_num(*x),
                format_num(*y)
            )
            .unwrap();
        }
    }
}

fn emit_edge(out: &mut String, edge: &Edge) {
    writeln!(out, "edge @{} {{", edge.id.as_str()).unwrap();

    // Annotations
    emit_annotations(out, &edge.annotations, 1);

    // from / to
    writeln!(out, "  from: @{}", edge.from.as_str()).unwrap();
    writeln!(out, "  to: @{}", edge.to.as_str()).unwrap();

    // Label
    if let Some(ref label) = edge.label {
        writeln!(out, "  label: \"{label}\"").unwrap();
    }

    // Style references
    for style_ref in &edge.use_styles {
        writeln!(out, "  use: {}", style_ref.as_str()).unwrap();
    }

    // Stroke
    if let Some(ref stroke) = edge.style.stroke {
        match &stroke.paint {
            Paint::Solid(c) => {
                writeln!(out, "  stroke: {} {}", c.to_hex(), format_num(stroke.width)).unwrap();
            }
            _ => {
                writeln!(out, "  stroke: #000 {}", format_num(stroke.width)).unwrap();
            }
        }
    }

    // Opacity
    if let Some(opacity) = edge.style.opacity {
        writeln!(out, "  opacity: {}", format_num(opacity)).unwrap();
    }

    // Arrow
    if edge.arrow != ArrowKind::None {
        let name = match edge.arrow {
            ArrowKind::None => "none",
            ArrowKind::Start => "start",
            ArrowKind::End => "end",
            ArrowKind::Both => "both",
        };
        writeln!(out, "  arrow: {name}").unwrap();
    }

    // Curve
    if edge.curve != CurveKind::Straight {
        let name = match edge.curve {
            CurveKind::Straight => "straight",
            CurveKind::Smooth => "smooth",
            CurveKind::Step => "step",
        };
        writeln!(out, "  curve: {name}").unwrap();
    }

    // Flow animation
    if let Some(ref flow) = edge.flow {
        let kind = match flow.kind {
            FlowKind::Pulse => "pulse",
            FlowKind::Dash => "dash",
        };
        writeln!(out, "  flow: {} {}ms", kind, flow.duration_ms).unwrap();
    }

    // Trigger animations
    for anim in &edge.animations {
        emit_anim(out, anim, 1);
    }

    out.push_str("}\n");
}

// ─── Spec Markdown Export ─────────────────────────────────────────────────

/// Emit a `SceneGraph` as a markdown spec document.
///
/// Extracts only `@id` names, `##` annotations, hierarchy, and edges —
/// all visual properties (fill, stroke, dimensions, animations) are omitted.
/// Intended for PM-facing spec reports.
#[must_use]
pub fn emit_spec_markdown(graph: &SceneGraph, title: &str) -> String {
    let mut out = String::with_capacity(512);
    writeln!(out, "# Spec: {title}\n").unwrap();

    // Emit root's children
    let children = graph.children(graph.root);
    for child_idx in &children {
        emit_spec_node(&mut out, graph, *child_idx, 2);
    }

    // Emit edges as flow descriptions
    if !graph.edges.is_empty() {
        out.push_str("\n---\n\n## Flows\n\n");
        for edge in &graph.edges {
            write!(
                out,
                "- **@{}** → **@{}**",
                edge.from.as_str(),
                edge.to.as_str()
            )
            .unwrap();
            if let Some(ref label) = edge.label {
                write!(out, " — {label}").unwrap();
            }
            out.push('\n');
            emit_spec_annotations(&mut out, &edge.annotations, "  ");
        }
    }

    out
}

fn emit_spec_node(out: &mut String, graph: &SceneGraph, idx: NodeIndex, heading_level: usize) {
    let node = &graph.graph[idx];

    // Skip nodes with no annotations and no annotated children
    let has_annotations = !node.annotations.is_empty();
    let children = graph.children(idx);
    let has_annotated_children = children
        .iter()
        .any(|c| has_annotations_recursive(graph, *c));

    if !has_annotations && !has_annotated_children {
        return;
    }

    // Heading: ## @node_id (kind)
    let hashes = "#".repeat(heading_level.min(6));
    let kind_label = match &node.kind {
        NodeKind::Root => return,
        NodeKind::Generic => "spec",
        NodeKind::Group { .. } => "group",
        NodeKind::Rect { .. } => "rect",
        NodeKind::Ellipse { .. } => "ellipse",
        NodeKind::Path { .. } => "path",
        NodeKind::Text { .. } => "text",
    };
    writeln!(out, "{hashes} @{} `{kind_label}`\n", node.id.as_str()).unwrap();

    // Annotation details
    emit_spec_annotations(out, &node.annotations, "");

    // Children (recurse with deeper heading level)
    for child_idx in &children {
        emit_spec_node(out, graph, *child_idx, heading_level + 1);
    }
}

fn has_annotations_recursive(graph: &SceneGraph, idx: NodeIndex) -> bool {
    let node = &graph.graph[idx];
    if !node.annotations.is_empty() {
        return true;
    }
    graph
        .children(idx)
        .iter()
        .any(|c| has_annotations_recursive(graph, *c))
}

fn emit_spec_annotations(out: &mut String, annotations: &[Annotation], prefix: &str) {
    for ann in annotations {
        match ann {
            Annotation::Description(s) => writeln!(out, "{prefix}> {s}").unwrap(),
            Annotation::Accept(s) => writeln!(out, "{prefix}- [ ] {s}").unwrap(),
            Annotation::Status(s) => writeln!(out, "{prefix}- **Status:** {s}").unwrap(),
            Annotation::Priority(s) => writeln!(out, "{prefix}- **Priority:** {s}").unwrap(),
            Annotation::Tag(s) => writeln!(out, "{prefix}- **Tag:** {s}").unwrap(),
        }
    }
    if !annotations.is_empty() {
        out.push('\n');
    }
}

/// Format a float without trailing zeros for compact output.
fn format_num(n: f32) -> String {
    if n == n.floor() {
        format!("{}", n as i32)
    } else {
        format!("{n:.2}")
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_document;

    #[test]
    fn roundtrip_simple() {
        let input = r#"
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);

        // Re-parse the emitted output
        let graph2 = parse_document(&output).expect("re-parse of emitted output failed");
        let node2 = graph2.get_by_id(NodeId::intern("box")).unwrap();

        match &node2.kind {
            NodeKind::Rect { width, height } => {
                assert_eq!(*width, 100.0);
                assert_eq!(*height, 50.0);
            }
            _ => panic!("expected Rect"),
        }
    }

    #[test]
    fn roundtrip_ellipse() {
        let input = r#"
ellipse @dot {
  w: 40 h: 40
  fill: #00FF00
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of ellipse failed");
        let node = graph2.get_by_id(NodeId::intern("dot")).unwrap();
        match &node.kind {
            NodeKind::Ellipse { rx, ry } => {
                assert_eq!(*rx, 40.0);
                assert_eq!(*ry, 40.0);
            }
            _ => panic!("expected Ellipse"),
        }
    }

    #[test]
    fn roundtrip_text_with_font() {
        let input = r#"
text @title "Hello" {
  font: "Inter" 700 32
  fill: #1A1A2E
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of text failed");
        let node = graph2.get_by_id(NodeId::intern("title")).unwrap();
        match &node.kind {
            NodeKind::Text { content } => assert_eq!(content, "Hello"),
            _ => panic!("expected Text"),
        }
        let font = node.style.font.as_ref().expect("font missing");
        assert_eq!(font.family, "Inter");
        assert_eq!(font.weight, 700);
        assert_eq!(font.size, 32.0);
    }

    #[test]
    fn roundtrip_nested_group() {
        let input = r#"
group @card {
  layout: column gap=16 pad=24

  text @heading "Title" {
    font: "Inter" 600 20
    fill: #333333
  }

  rect @body {
    w: 300 h: 200
    fill: #F5F5F5
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of nested group failed");
        let card_idx = graph2.index_of(NodeId::intern("card")).unwrap();
        assert_eq!(graph2.children(card_idx).len(), 2);
    }

    #[test]
    fn roundtrip_animation() {
        let input = r#"
rect @btn {
  w: 200 h: 48
  fill: #6C5CE7

  anim :hover {
    fill: #5A4BD1
    scale: 1.02
    ease: spring 300ms
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of animation failed");
        let btn = graph2.get_by_id(NodeId::intern("btn")).unwrap();
        assert_eq!(btn.animations.len(), 1);
        assert_eq!(btn.animations[0].trigger, AnimTrigger::Hover);
    }

    #[test]
    fn roundtrip_style_and_use() {
        let input = r#"
style accent {
  fill: #6C5CE7
  corner: 10
}

rect @btn {
  w: 200 h: 48
  use: accent
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of style+use failed");
        assert!(graph2.styles.contains_key(&NodeId::intern("accent")));
        let btn = graph2.get_by_id(NodeId::intern("btn")).unwrap();
        assert_eq!(btn.use_styles.len(), 1);
    }

    #[test]
    fn roundtrip_annotation_description() {
        let input = r#"
rect @box {
  ## "Primary container for content"
  w: 100 h: 50
  fill: #FF0000
}
"#;
        let graph = parse_document(input).unwrap();
        let node = graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.annotations.len(), 1);
        assert_eq!(
            node.annotations[0],
            Annotation::Description("Primary container for content".into())
        );

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of annotation failed");
        let node2 = graph2.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node2.annotations.len(), 1);
        assert_eq!(node2.annotations[0], node.annotations[0]);
    }

    #[test]
    fn roundtrip_annotation_accept() {
        let input = r#"
rect @login_btn {
  ## accept: "disabled state when fields empty"
  ## accept: "loading spinner during auth"
  w: 280 h: 48
  fill: #6C5CE7
}
"#;
        let graph = parse_document(input).unwrap();
        let btn = graph.get_by_id(NodeId::intern("login_btn")).unwrap();
        assert_eq!(btn.annotations.len(), 2);
        assert_eq!(
            btn.annotations[0],
            Annotation::Accept("disabled state when fields empty".into())
        );
        assert_eq!(
            btn.annotations[1],
            Annotation::Accept("loading spinner during auth".into())
        );

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of accept annotation failed");
        let btn2 = graph2.get_by_id(NodeId::intern("login_btn")).unwrap();
        assert_eq!(btn2.annotations, btn.annotations);
    }

    #[test]
    fn roundtrip_annotation_status_priority() {
        let input = r#"
rect @card {
  ## status: in_progress
  ## priority: high
  ## tag: mvp
  w: 300 h: 200
}
"#;
        let graph = parse_document(input).unwrap();
        let card = graph.get_by_id(NodeId::intern("card")).unwrap();
        assert_eq!(card.annotations.len(), 3);
        assert_eq!(
            card.annotations[0],
            Annotation::Status("in_progress".into())
        );
        assert_eq!(card.annotations[1], Annotation::Priority("high".into()));
        assert_eq!(card.annotations[2], Annotation::Tag("mvp".into()));

        let output = emit_document(&graph);
        let graph2 =
            parse_document(&output).expect("re-parse of status/priority/tag annotation failed");
        let card2 = graph2.get_by_id(NodeId::intern("card")).unwrap();
        assert_eq!(card2.annotations, card.annotations);
    }

    #[test]
    fn roundtrip_annotation_nested() {
        let input = r#"
group @form {
  layout: column gap=16 pad=32
  ## "User authentication entry point"

  rect @email {
    ## accept: "validates email format"
    w: 280 h: 44
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let form = graph.get_by_id(NodeId::intern("form")).unwrap();
        assert_eq!(form.annotations.len(), 1);
        let email = graph.get_by_id(NodeId::intern("email")).unwrap();
        assert_eq!(email.annotations.len(), 1);

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of nested annotation failed");
        let form2 = graph2.get_by_id(NodeId::intern("form")).unwrap();
        assert_eq!(form2.annotations, form.annotations);
        let email2 = graph2.get_by_id(NodeId::intern("email")).unwrap();
        assert_eq!(email2.annotations, email.annotations);
    }

    #[test]
    fn parse_annotation_freeform() {
        let input = r#"
rect @widget {
  ## "Description line"
  ## accept: "criterion one"
  ## status: done
  ## priority: low
  ## tag: design
  w: 100 h: 100
}
"#;
        let graph = parse_document(input).unwrap();
        let w = graph.get_by_id(NodeId::intern("widget")).unwrap();
        assert_eq!(w.annotations.len(), 5);
        assert_eq!(
            w.annotations[0],
            Annotation::Description("Description line".into())
        );
        assert_eq!(w.annotations[1], Annotation::Accept("criterion one".into()));
        assert_eq!(w.annotations[2], Annotation::Status("done".into()));
        assert_eq!(w.annotations[3], Annotation::Priority("low".into()));
        assert_eq!(w.annotations[4], Annotation::Tag("design".into()));
    }

    #[test]
    fn roundtrip_edge_basic() {
        let input = r#"
rect @box_a {
  w: 100 h: 50
}

rect @box_b {
  w: 100 h: 50
}

edge @a_to_b {
  from: @box_a
  to: @box_b
  label: "next step"
  arrow: end
}
"#;
        let graph = parse_document(input).unwrap();
        assert_eq!(graph.edges.len(), 1);
        let edge = &graph.edges[0];
        assert_eq!(edge.id.as_str(), "a_to_b");
        assert_eq!(edge.from.as_str(), "box_a");
        assert_eq!(edge.to.as_str(), "box_b");
        assert_eq!(edge.label.as_deref(), Some("next step"));
        assert_eq!(edge.arrow, ArrowKind::End);

        // Re-parse roundtrip
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("roundtrip failed");
        assert_eq!(graph2.edges.len(), 1);
        let edge2 = &graph2.edges[0];
        assert_eq!(edge2.from.as_str(), "box_a");
        assert_eq!(edge2.to.as_str(), "box_b");
        assert_eq!(edge2.label.as_deref(), Some("next step"));
        assert_eq!(edge2.arrow, ArrowKind::End);
    }

    #[test]
    fn roundtrip_edge_styled() {
        let input = r#"
rect @s1 { w: 50 h: 50 }
rect @s2 { w: 50 h: 50 }

edge @flow {
  from: @s1
  to: @s2
  stroke: #6C5CE7 2
  arrow: both
  curve: smooth
}
"#;
        let graph = parse_document(input).unwrap();
        assert_eq!(graph.edges.len(), 1);
        let edge = &graph.edges[0];
        assert_eq!(edge.arrow, ArrowKind::Both);
        assert_eq!(edge.curve, CurveKind::Smooth);
        assert!(edge.style.stroke.is_some());

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("styled edge roundtrip failed");
        let edge2 = &graph2.edges[0];
        assert_eq!(edge2.arrow, ArrowKind::Both);
        assert_eq!(edge2.curve, CurveKind::Smooth);
    }

    #[test]
    fn roundtrip_edge_with_annotations() {
        let input = r#"
rect @login { w: 200 h: 100 }
rect @dashboard { w: 200 h: 100 }

edge @login_flow {
  ## "Main authentication flow"
  ## accept: "must redirect within 2s"
  from: @login
  to: @dashboard
  label: "on success"
  arrow: end
}
"#;
        let graph = parse_document(input).unwrap();
        let edge = &graph.edges[0];
        assert_eq!(edge.annotations.len(), 2);
        assert_eq!(
            edge.annotations[0],
            Annotation::Description("Main authentication flow".into())
        );
        assert_eq!(
            edge.annotations[1],
            Annotation::Accept("must redirect within 2s".into())
        );

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("annotated edge roundtrip failed");
        let edge2 = &graph2.edges[0];
        assert_eq!(edge2.annotations, edge.annotations);
    }

    #[test]
    fn roundtrip_generic_node() {
        let input = r#"
@login_btn {
  ## "Primary CTA — triggers login API call"
  ## accept: "disabled when fields empty"
  ## status: in_progress
}
"#;
        let graph = parse_document(input).unwrap();
        let node = graph.get_by_id(NodeId::intern("login_btn")).unwrap();
        assert!(matches!(node.kind, NodeKind::Generic));
        assert_eq!(node.annotations.len(), 3);

        let output = emit_document(&graph);
        assert!(output.contains("@login_btn {"));
        // Should NOT have a type prefix
        assert!(!output.contains("rect @login_btn"));
        assert!(!output.contains("group @login_btn"));

        let graph2 = parse_document(&output).expect("re-parse of generic node failed");
        let node2 = graph2.get_by_id(NodeId::intern("login_btn")).unwrap();
        assert!(matches!(node2.kind, NodeKind::Generic));
        assert_eq!(node2.annotations, node.annotations);
    }

    #[test]
    fn roundtrip_generic_nested() {
        let input = r#"
group @form {
  layout: column gap=16 pad=32

  @email_input {
    ## "Email field"
    ## accept: "validates format on blur"
  }

  @password_input {
    ## "Password field"
    ## accept: "min 8 chars"
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let form_idx = graph.index_of(NodeId::intern("form")).unwrap();
        assert_eq!(graph.children(form_idx).len(), 2);

        let email = graph.get_by_id(NodeId::intern("email_input")).unwrap();
        assert!(matches!(email.kind, NodeKind::Generic));
        assert_eq!(email.annotations.len(), 2);

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of nested generic failed");
        let email2 = graph2.get_by_id(NodeId::intern("email_input")).unwrap();
        assert!(matches!(email2.kind, NodeKind::Generic));
        assert_eq!(email2.annotations, email.annotations);
    }

    #[test]
    fn parse_generic_with_properties() {
        let input = r#"
@card {
  fill: #FFFFFF
  corner: 8
}
"#;
        let graph = parse_document(input).unwrap();
        let card = graph.get_by_id(NodeId::intern("card")).unwrap();
        assert!(matches!(card.kind, NodeKind::Generic));
        assert!(card.style.fill.is_some());
        assert_eq!(card.style.corner_radius, Some(8.0));
    }

    #[test]
    fn roundtrip_edge_with_trigger_anim() {
        let input = r#"
rect @a { w: 50 h: 50 }
rect @b { w: 50 h: 50 }

edge @hover_edge {
  from: @a
  to: @b
  stroke: #6C5CE7 2
  arrow: end

  anim :hover {
    opacity: 0.5
    ease: ease_out 200ms
  }
}
"#;
        let graph = parse_document(input).unwrap();
        assert_eq!(graph.edges.len(), 1);
        let edge = &graph.edges[0];
        assert_eq!(edge.animations.len(), 1);
        assert_eq!(edge.animations[0].trigger, AnimTrigger::Hover);
        assert_eq!(edge.animations[0].duration_ms, 200);

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("trigger anim roundtrip failed");
        let edge2 = &graph2.edges[0];
        assert_eq!(edge2.animations.len(), 1);
        assert_eq!(edge2.animations[0].trigger, AnimTrigger::Hover);
    }

    #[test]
    fn roundtrip_edge_with_flow() {
        let input = r#"
rect @src { w: 50 h: 50 }
rect @dst { w: 50 h: 50 }

edge @data {
  from: @src
  to: @dst
  arrow: end
  flow: pulse 800ms
}
"#;
        let graph = parse_document(input).unwrap();
        let edge = &graph.edges[0];
        assert!(edge.flow.is_some());
        let flow = edge.flow.unwrap();
        assert_eq!(flow.kind, FlowKind::Pulse);
        assert_eq!(flow.duration_ms, 800);

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("flow roundtrip failed");
        let edge2 = &graph2.edges[0];
        let flow2 = edge2.flow.unwrap();
        assert_eq!(flow2.kind, FlowKind::Pulse);
        assert_eq!(flow2.duration_ms, 800);
    }

    #[test]
    fn roundtrip_edge_dash_flow() {
        let input = r#"
rect @x { w: 50 h: 50 }
rect @y { w: 50 h: 50 }

edge @dashed {
  from: @x
  to: @y
  stroke: #EF4444 1
  flow: dash 400ms
  arrow: both
  curve: step
}
"#;
        let graph = parse_document(input).unwrap();
        let edge = &graph.edges[0];
        let flow = edge.flow.unwrap();
        assert_eq!(flow.kind, FlowKind::Dash);
        assert_eq!(flow.duration_ms, 400);
        assert_eq!(edge.arrow, ArrowKind::Both);
        assert_eq!(edge.curve, CurveKind::Step);

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("dash flow roundtrip failed");
        let edge2 = &graph2.edges[0];
        let flow2 = edge2.flow.unwrap();
        assert_eq!(flow2.kind, FlowKind::Dash);
        assert_eq!(flow2.duration_ms, 400);
    }

    #[test]
    fn test_spec_markdown_basic() {
        let input = r#"
rect @login_btn {
  ## "Primary CTA for login"
  ## accept: "disabled when fields empty"
  ## status: in_progress
  ## priority: high
  ## tag: auth
  w: 280 h: 48
  fill: #6C5CE7
}
"#;
        let graph = parse_document(input).unwrap();
        let md = emit_spec_markdown(&graph, "login.fd");

        assert!(md.starts_with("# Spec: login.fd\n"));
        assert!(md.contains("## @login_btn `rect`"));
        assert!(md.contains("> Primary CTA for login"));
        assert!(md.contains("- [ ] disabled when fields empty"));
        assert!(md.contains("- **Status:** in_progress"));
        assert!(md.contains("- **Priority:** high"));
        assert!(md.contains("- **Tag:** auth"));
        // Visual props must NOT appear
        assert!(!md.contains("280"));
        assert!(!md.contains("6C5CE7"));
    }

    #[test]
    fn test_spec_markdown_nested() {
        let input = r#"
group @form {
  layout: column gap=16 pad=32
  ## "Shipping address form"
  ## accept: "autofill from saved addresses"

  rect @email {
    ## "Email input"
    ## accept: "validates email format"
    w: 280 h: 44
  }

  rect @no_annotations {
    w: 100 h: 50
    fill: #CCC
  }
}
"#;
        let graph = parse_document(input).unwrap();
        let md = emit_spec_markdown(&graph, "checkout.fd");

        assert!(md.contains("## @form `group`"));
        assert!(md.contains("### @email `rect`"));
        assert!(md.contains("> Shipping address form"));
        assert!(md.contains("- [ ] autofill from saved addresses"));
        assert!(md.contains("- [ ] validates email format"));
        // Node without annotations should be skipped
        assert!(!md.contains("no_annotations"));
    }

    #[test]
    fn test_spec_markdown_with_edges() {
        let input = r#"
rect @login { w: 200 h: 100 }
rect @dashboard {
  ## "Main dashboard"
  w: 200 h: 100
}

edge @auth_flow {
  ## "Authentication flow"
  ## accept: "redirect within 2s"
  from: @login
  to: @dashboard
  label: "on success"
  arrow: end
}
"#;
        let graph = parse_document(input).unwrap();
        let md = emit_spec_markdown(&graph, "flow.fd");

        assert!(md.contains("## Flows"));
        assert!(md.contains("**@login** → **@dashboard**"));
        assert!(md.contains("on success"));
        assert!(md.contains("> Authentication flow"));
        assert!(md.contains("- [ ] redirect within 2s"));
    }

    #[test]
    fn roundtrip_import_basic() {
        let input = "import \"components/buttons.fd\" as btn\nrect @hero { w: 200 h: 100 }\n";
        let graph = parse_document(input).unwrap();
        assert_eq!(graph.imports.len(), 1);
        assert_eq!(graph.imports[0].path, "components/buttons.fd");
        assert_eq!(graph.imports[0].namespace, "btn");

        let output = emit_document(&graph);
        assert!(output.contains("import \"components/buttons.fd\" as btn"));

        let graph2 = parse_document(&output).expect("re-parse of import failed");
        assert_eq!(graph2.imports.len(), 1);
        assert_eq!(graph2.imports[0].path, "components/buttons.fd");
        assert_eq!(graph2.imports[0].namespace, "btn");
    }

    #[test]
    fn roundtrip_import_multiple() {
        let input = "import \"tokens.fd\" as tokens\nimport \"buttons.fd\" as btn\nrect @box { w: 50 h: 50 }\n";
        let graph = parse_document(input).unwrap();
        assert_eq!(graph.imports.len(), 2);
        assert_eq!(graph.imports[0].namespace, "tokens");
        assert_eq!(graph.imports[1].namespace, "btn");

        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse of multiple imports failed");
        assert_eq!(graph2.imports.len(), 2);
        assert_eq!(graph2.imports[0].namespace, "tokens");
        assert_eq!(graph2.imports[1].namespace, "btn");
    }

    #[test]
    fn parse_import_without_alias_errors() {
        let input = "import \"missing_alias.fd\"\nrect @box { w: 50 h: 50 }\n";
        // This should fail because "as namespace" is missing
        let result = parse_document(input);
        assert!(result.is_err());
    }

    #[test]
    fn roundtrip_comment_preserved() {
        // A `# comment` before a node should survive parse → emit → parse.
        let input = r#"
# This is a section header
rect @box {
  w: 100 h: 50
  fill: #FF0000
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        assert!(
            output.contains("# This is a section header"),
            "comment should appear in emitted output: {output}"
        );
        // Re-parse should also preserve it
        let graph2 = parse_document(&output).expect("re-parse of commented document failed");
        let node = graph2.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.comments, vec!["This is a section header"]);
    }

    #[test]
    fn roundtrip_multiple_comments_preserved() {
        let input = r#"
# Header section
# Subheading
rect @panel {
  w: 300 h: 200
}
"#;
        let graph = parse_document(input).unwrap();
        let output = emit_document(&graph);
        let graph2 = parse_document(&output).expect("re-parse failed");
        let node = graph2.get_by_id(NodeId::intern("panel")).unwrap();
        assert_eq!(node.comments.len(), 2);
        assert_eq!(node.comments[0], "Header section");
        assert_eq!(node.comments[1], "Subheading");
    }
}
