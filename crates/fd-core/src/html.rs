use crate::model::*;
use petgraph::graph::NodeIndex;
use std::collections::HashMap;
use std::fmt::Write;

/// Export to HTML+CSS: emit_html(graph) -> String
/// Generates a standalone responsive HTML page;
/// shapes → `<div>`, text → `<div>`, SVG for ellipse/path/edge
pub fn emit_html(graph: &SceneGraph, bounds: &HashMap<NodeIndex, ResolvedBounds>) -> String {
    let mut out = String::new();
    out.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    out.push_str("<meta charset=\"utf-8\">\n");
    out.push_str("<title>FD Export</title>\n");
    out.push_str("<style>\n");
    out.push_str("  body { margin: 0; padding: 0; overflow: hidden; background-color: #ffffff; font-family: 'Inter', sans-serif; }\n");
    out.push_str("  .fd-canvas { position: relative; width: 100vw; height: 100vh; }\n");
    out.push_str("  .fd-node { position: absolute; box-sizing: border-box; }\n");
    out.push_str(
        "  .fd-svg-wrapper { position: absolute; pointer-events: none; overflow: visible; }\n",
    );
    out.push_str("</style>\n");
    out.push_str("</head>\n<body>\n");
    out.push_str("<div class=\"fd-canvas\">\n");

    // We do a flattened top-down rendering using the absolute bounds.
    let root_children = graph.children(graph.root);
    for idx in root_children {
        emit_html_node(&mut out, graph, idx, bounds);
    }

    // Now emit edges
    for edge in &graph.edges {
        emit_html_edge(&mut out, edge, graph, bounds);
    }

    out.push_str("</div>\n</body>\n</html>");
    out
}

fn emit_html_node(
    out: &mut String,
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
) {
    let node = &graph.graph[idx];
    let default_bounds = ResolvedBounds {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    };
    let b = bounds.get(&idx).unwrap_or(&default_bounds);

    let style = graph.resolve_style(node, &[]);

    // We render based on kind
    match &node.kind {
        NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
            let mut css = format!(
                "left: {}px; top: {}px; width: {}px; height: {}px;",
                b.x, b.y, b.width, b.height
            );

            css.push_str(&style_to_css(&style));

            writeln!(out, "  <div class=\"fd-node\" style=\"{}\"></div>", css).unwrap();
        }
        NodeKind::Text { content, .. } => {
            let mut css = format!(
                "left: {}px; top: {}px; width: {}px; height: {}px;",
                b.x, b.y, b.width, b.height
            );
            css.push_str(&style_to_css(&style));
            css.push_str(" display: flex;");

            let h_align = match style.text_align.unwrap_or(TextAlign::Center) {
                TextAlign::Left => "flex-start",
                TextAlign::Center => "center",
                TextAlign::Right => "flex-end",
            };
            let v_align = match style.text_valign.unwrap_or(TextVAlign::Middle) {
                TextVAlign::Top => "flex-start",
                TextVAlign::Middle => "center",
                TextVAlign::Bottom => "flex-end",
            };
            write!(
                &mut css,
                " align-items: {}; justify-content: {};",
                v_align, h_align
            )
            .unwrap();

            let escaped_content = content
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br>");
            writeln!(
                out,
                "  <div class=\"fd-node\" style=\"{}\">{}</div>",
                css, escaped_content
            )
            .unwrap();
        }
        NodeKind::Ellipse { rx, ry } => {
            let rx = *rx;
            let ry = *ry;
            let svg_css = format!(
                "left: {}px; top: {}px; width: {}px; height: {}px;",
                b.x, b.y, b.width, b.height
            );
            writeln!(
                out,
                "  <svg class=\"fd-svg-wrapper\" style=\"{}\" viewBox=\"0 0 {} {}\">",
                svg_css, b.width, b.height
            )
            .unwrap();

            let fill = svg_fill(&style.fill);
            let stroke_attr = svg_stroke(&style.stroke);
            let opacity = style.opacity.unwrap_or(1.0);

            writeln!(out, "    <ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" {} opacity=\"{}\" />",
                b.width / 2.0, b.height / 2.0, rx, ry, fill, stroke_attr, opacity).unwrap();
            writeln!(out, "  </svg>").unwrap();
        }
        NodeKind::Image { source, .. } => {
            let mut css = format!(
                "left: {}px; top: {}px; width: {}px; height: {}px;",
                b.x, b.y, b.width, b.height
            );
            css.push_str(&style_to_css(&style));
            let ImageSource::File(src) = source;
            writeln!(
                out,
                "  <img class=\"fd-node\" style=\"{}\" src=\"{}\" alt=\"\" />",
                css, src
            )
            .unwrap();
        }
        NodeKind::Path { commands } => {
            let svg_css = format!(
                "left: {}px; top: {}px; width: {}px; height: {}px;",
                b.x, b.y, b.width, b.height
            );
            writeln!(
                out,
                "  <svg class=\"fd-svg-wrapper\" style=\"{}\" viewBox=\"0 0 {} {}\">",
                svg_css, b.width, b.height
            )
            .unwrap();

            let mut d = String::new();
            for cmd in commands {
                match cmd {
                    PathCmd::MoveTo(x, y) => write!(&mut d, "M {} {} ", x, y).unwrap(),
                    PathCmd::LineTo(x, y) => write!(&mut d, "L {} {} ", x, y).unwrap(),
                    PathCmd::QuadTo(cx, cy, ex, ey) => {
                        write!(&mut d, "Q {} {} {} {} ", cx, cy, ex, ey).unwrap()
                    }
                    PathCmd::CubicTo(c1x, c1y, c2x, c2y, ex, ey) => {
                        write!(&mut d, "C {} {} {} {} {} {} ", c1x, c1y, c2x, c2y, ex, ey).unwrap()
                    }
                    PathCmd::Close => write!(&mut d, "Z ").unwrap(),
                }
            }

            let fill = svg_fill(&style.fill);
            let stroke_attr = svg_stroke(&style.stroke);
            let opacity = style.opacity.unwrap_or(1.0);

            writeln!(
                out,
                "    <path d=\"{}\" fill=\"{}\" {} opacity=\"{}\" />",
                d.trim(),
                fill,
                stroke_attr,
                opacity
            )
            .unwrap();
            writeln!(out, "  </svg>").unwrap();
        }
        NodeKind::Group => {
            // Groups are purely structural; recurse on children
        }
        _ => {}
    }

    // Recurse
    for child_idx in graph.children(idx) {
        emit_html_node(out, graph, child_idx, bounds);
    }
}

fn emit_html_edge(
    out: &mut String,
    edge: &Edge,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
) {
    let style = graph.resolve_style_for_edge(edge, &[]);

    let default_bounds = ResolvedBounds {
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
    };

    // Resolve endpoints
    let (x1, y1) = match &edge.from {
        EdgeAnchor::Point(x, y) => (*x, *y),
        EdgeAnchor::Node(id) => {
            if let Some(idx) = graph.index_of(*id) {
                let b = bounds.get(&idx).unwrap_or(&default_bounds);
                b.center()
            } else {
                (0.0, 0.0)
            }
        }
    };

    let (x2, y2) = match &edge.to {
        EdgeAnchor::Point(x, y) => (*x, *y),
        EdgeAnchor::Node(id) => {
            if let Some(idx) = graph.index_of(*id) {
                let b = bounds.get(&idx).unwrap_or(&default_bounds);
                b.center()
            } else {
                (0.0, 0.0)
            }
        }
    };

    // Simple bounding box for the SVG covering the edge line
    let min_x = x1.min(x2) - 10.0;
    let min_y = y1.min(y2) - 10.0;
    let max_x = x1.max(x2) + 10.0;
    let max_y = y1.max(y2) + 10.0;
    let w = max_x - min_x;
    let h = max_y - min_y;

    let svg_css = format!(
        "left: {}px; top: {}px; width: {}px; height: {}px;",
        min_x, min_y, w, h
    );
    writeln!(
        out,
        "  <svg class=\"fd-svg-wrapper\" style=\"{}\" viewBox=\"0 0 {} {}\">",
        svg_css, w, h
    )
    .unwrap();

    let stroke_attr = svg_stroke(&style.stroke);
    let opacity = style.opacity.unwrap_or(1.0);

    // Transform global coords to SVG local coords
    let lx1 = x1 - min_x;
    let ly1 = y1 - min_y;
    let lx2 = x2 - min_x;
    let ly2 = y2 - min_y;

    writeln!(
        out,
        "    <line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" {} opacity=\"{}\" />",
        lx1, ly1, lx2, ly2, stroke_attr, opacity
    )
    .unwrap();
    writeln!(out, "  </svg>").unwrap();
}

fn style_to_css(style: &Properties) -> String {
    let mut css = String::new();

    if let Some(fill) = &style.fill {
        match fill {
            Paint::Solid(c) => write!(&mut css, " background-color: {};", c.to_hex()).unwrap(),
            Paint::LinearGradient { angle, stops } => {
                write!(&mut css, " background: linear-gradient({}deg", angle).unwrap();
                for stop in stops {
                    write!(
                        &mut css,
                        ", {} {}%",
                        stop.color.to_hex(),
                        stop.offset * 100.0
                    )
                    .unwrap();
                }
                css.push_str(");");
            }
            Paint::RadialGradient { stops } => {
                css.push_str(" background: radial-gradient(circle");
                for stop in stops {
                    write!(
                        &mut css,
                        ", {} {}%",
                        stop.color.to_hex(),
                        stop.offset * 100.0
                    )
                    .unwrap();
                }
                css.push_str(");");
            }
        }
    }

    #[allow(clippy::collapsible_if)]
    if let Some(stroke) = &style.stroke {
        if let Paint::Solid(c) = &stroke.paint {
            write!(
                &mut css,
                " border: {}px solid {};",
                stroke.width,
                c.to_hex()
            )
            .unwrap();
        }
    }

    if let Some(radius) = style.corner_radius {
        write!(&mut css, " border-radius: {}px;", radius).unwrap();
    }

    if let Some(opacity) = style.opacity {
        write!(&mut css, " opacity: {};", opacity).unwrap();
    }

    if let Some(font) = &style.font {
        write!(
            &mut css,
            " font-family: '{}', sans-serif; font-size: {}px; font-weight: {};",
            font.family, font.size, font.weight
        )
        .unwrap();
    }

    if let Some(shadow) = &style.shadow {
        write!(
            &mut css,
            " box-shadow: {}px {}px {}px {};",
            shadow.offset_x,
            shadow.offset_y,
            shadow.blur,
            shadow.color.to_hex()
        )
        .unwrap();
    }

    css
}

fn svg_fill(fill: &Option<Paint>) -> String {
    if let Some(f) = fill {
        match f {
            Paint::Solid(c) => c.to_hex(),
            _ => "none".to_string(), // gradients not yet implemented in SVG emission
        }
    } else {
        "none".to_string()
    }
}

fn svg_stroke(stroke: &Option<Stroke>) -> String {
    if let Some(s) = stroke {
        if let Paint::Solid(c) = &s.paint {
            format!("stroke=\"{}\" stroke-width=\"{}\"", c.to_hex(), s.width)
        } else {
            "stroke=\"none\"".to_string()
        }
    } else {
        "stroke=\"none\"".to_string()
    }
}
#[cfg(test)]
#[path = "html_tests.rs"]
mod tests;
