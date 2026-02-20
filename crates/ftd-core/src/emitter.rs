//! Emitter: SceneGraph → FTD text format.
//!
//! Produces minimal, token-efficient output that round-trips through the parser.

use crate::id::NodeId;
use crate::model::*;
use petgraph::graph::NodeIndex;
use std::fmt::Write;

/// Emit a `SceneGraph` as an FTD text document.
#[must_use]
pub fn emit_document(graph: &SceneGraph) -> String {
    let mut out = String::with_capacity(1024);
    out.push_str("# FTD v1\n\n");

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

    indent(out, depth);

    // Node kind keyword + optional @id + optional inline text
    match &node.kind {
        NodeKind::Root => return,
        NodeKind::Group { .. } => write!(out, "group @{}", node.id.as_str()).unwrap(),
        NodeKind::Rect { .. } => write!(out, "rect @{}", node.id.as_str()).unwrap(),
        NodeKind::Ellipse { .. } => write!(out, "ellipse @{}", node.id.as_str()).unwrap(),
        NodeKind::Path { .. } => write!(out, "path @{}", node.id.as_str()).unwrap(),
        NodeKind::Text { content } => {
            write!(out, "text @{} \"{}\"", node.id.as_str(), content).unwrap();
        }
    }

    out.push_str(" {\n");

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
}
