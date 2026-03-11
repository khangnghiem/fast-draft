use crate::layout::{Viewport, resolve_layout};
use crate::model::{
    NodeKind, Paint, PathCmd, Properties, ResolvedBounds, SceneGraph, TextAlign, TextVAlign,
};
use petgraph::graph::NodeIndex;
use std::collections::HashMap;

pub fn emit_html(graph: &SceneGraph) -> String {
    let viewport = Viewport::default();
    let bounds = resolve_layout(graph, viewport);

    let mut html = String::new();
    html.push_str(
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<style>\n",
    );
    html.push_str("body { margin: 0; overflow: hidden; background-color: #ffffff; }\n");
    html.push_str("p { margin: 0; }\n");
    html.push_str(".fd-node { position: absolute; box-sizing: border-box; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    let mut divs = String::new();
    let mut svgs = String::new();
    let mut defs = String::new();

    fn paint_to_css(paint: &Paint) -> String {
        match paint {
            Paint::Solid(c) => c.to_hex(),
            Paint::LinearGradient { angle, stops } => {
                let stops_str = stops
                    .iter()
                    .map(|s| format!("{} {}%", s.color.to_hex(), s.offset * 100.0))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("linear-gradient({}deg, {})", angle, stops_str)
            }
            Paint::RadialGradient { stops } => {
                let stops_str = stops
                    .iter()
                    .map(|s| format!("{} {}%", s.color.to_hex(), s.offset * 100.0))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("radial-gradient(circle, {})", stops_str)
            }
        }
    }

    fn apply_style_css(css: &mut String, style: &Properties) {
        if let Some(fill) = &style.fill {
            css.push_str(&format!("background: {}; ", paint_to_css(fill)));
        }
        if let Some(stroke) = &style.stroke {
            let width = stroke.width;
            let color = paint_to_css(&stroke.paint);
            css.push_str(&format!("border: {}px solid {}; ", width, color));
        }
        if let Some(opacity) = style.opacity {
            css.push_str(&format!("opacity: {}; ", opacity));
        }
        if let Some(radius) = style.corner_radius {
            css.push_str(&format!("border-radius: {}px; ", radius));
        }
        if let Some(font) = &style.font {
            css.push_str(&format!("font-family: '{}', sans-serif; ", font.family));
            css.push_str(&format!("font-size: {}px; ", font.size));
            css.push_str(&format!("font-weight: {}; ", font.weight));
        }
        if let Some(align) = style.text_align {
            let align_str = match align {
                TextAlign::Left => "left",
                TextAlign::Center => "center",
                TextAlign::Right => "right",
            };
            css.push_str(&format!("text-align: {}; ", align_str));
        }
        if style.text_valign.is_some() || style.text_align.is_some() {
            css.push_str("display: flex; flex-direction: column; ");
            let justify = match style.text_valign.unwrap_or(TextVAlign::Middle) {
                TextVAlign::Top => "flex-start",
                TextVAlign::Middle => "center",
                TextVAlign::Bottom => "flex-end",
            };
            css.push_str(&format!("justify-content: {}; ", justify));
        }
    }

    fn paint_to_svg(paint: &Paint) -> String {
        match paint {
            Paint::Solid(c) => c.to_hex(),
            _ => "transparent".to_string(), // Advanced gradients unsupported for MVP SVG inline
        }
    }

    fn traverse(
        idx: NodeIndex,
        parent_bound: &ResolvedBounds,
        graph: &SceneGraph,
        bounds: &HashMap<NodeIndex, ResolvedBounds>,
        divs: &mut String,
        svgs: &mut String,
        _defs: &mut String,
    ) {
        let node = &graph.graph[idx];
        let bound = bounds.get(&idx).unwrap();
        let style = graph.resolve_style(node, &[]);

        let rel_x = bound.x - parent_bound.x;
        let rel_y = bound.y - parent_bound.y;

        match &node.kind {
            NodeKind::Frame {
                width: _,
                height: _,
                clip,
                layout: _,
            } => {
                let mut css = format!(
                    "left: {}px; top: {}px; width: {}px; height: {}px;",
                    rel_x, rel_y, bound.width, bound.height
                );
                if *clip {
                    css.push_str(" overflow: hidden;");
                }
                apply_style_css(&mut css, &style);
                divs.push_str(&format!(
                    "<div id=\"{}\" class=\"fd-node\" style=\"{}\">\n",
                    node.id, css
                ));

                for child in graph.children(idx) {
                    traverse(child, bound, graph, bounds, divs, svgs, _defs);
                }
                divs.push_str("</div>\n");
            }
            NodeKind::Group => {
                let mut css = format!(
                    "left: {}px; top: {}px; width: {}px; height: {}px;",
                    rel_x, rel_y, bound.width, bound.height
                );
                apply_style_css(&mut css, &style);
                divs.push_str(&format!(
                    "<div id=\"{}\" class=\"fd-node\" style=\"{}\">\n",
                    node.id, css
                ));

                for child in graph.children(idx) {
                    traverse(child, bound, graph, bounds, divs, svgs, _defs);
                }
                divs.push_str("</div>\n");
            }
            NodeKind::Rect {
                width: _,
                height: _,
            } => {
                let mut css = format!(
                    "left: {}px; top: {}px; width: {}px; height: {}px;",
                    rel_x, rel_y, bound.width, bound.height
                );
                apply_style_css(&mut css, &style);
                divs.push_str(&format!(
                    "<div id=\"{}\" class=\"fd-node\" style=\"{}\"></div>\n",
                    node.id, css
                ));
            }
            NodeKind::Image {
                source: _,
                width: _,
                height: _,
                fit: _,
            } => {
                let mut css = format!(
                    "left: {}px; top: {}px; width: {}px; height: {}px;",
                    rel_x, rel_y, bound.width, bound.height
                );
                apply_style_css(&mut css, &style);
                divs.push_str(&format!(
                    "<div id=\"{}\" class=\"fd-node\" style=\"{}\"></div>\n",
                    node.id, css
                ));
            }
            NodeKind::Text {
                content,
                max_width: _,
            } => {
                let mut css = format!(
                    "left: {}px; top: {}px; width: {}px; height: {}px;",
                    rel_x, rel_y, bound.width, bound.height
                );
                apply_style_css(&mut css, &style);
                let content_html = content
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                    .replace("\n", "<br>");
                divs.push_str(&format!(
                    "<div id=\"{}\" class=\"fd-node\" style=\"{}\"><p>{}</p></div>\n",
                    node.id, css, content_html
                ));
            }
            NodeKind::Ellipse { rx, ry } => {
                let cx = bound.x + rx;
                let cy = bound.y + ry;
                let fill = style
                    .fill
                    .as_ref()
                    .map(paint_to_svg)
                    .unwrap_or("none".into());
                let stroke = style
                    .stroke
                    .as_ref()
                    .map(|s| paint_to_svg(&s.paint))
                    .unwrap_or("none".into());
                let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(0.0);

                svgs.push_str(&format!(
                    "  <ellipse id=\"{}\" cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
                    node.id, cx, cy, rx, ry, fill, stroke, stroke_width
                ));
            }
            NodeKind::Path { commands } => {
                let mut d = String::new();
                for cmd in commands {
                    match cmd {
                        PathCmd::MoveTo(x, y) => {
                            d.push_str(&format!("M {} {} ", bound.x + x, bound.y + y))
                        }
                        PathCmd::LineTo(x, y) => {
                            d.push_str(&format!("L {} {} ", bound.x + x, bound.y + y))
                        }
                        PathCmd::QuadTo(cx, cy, x, y) => d.push_str(&format!(
                            "Q {} {} {} {} ",
                            bound.x + cx,
                            bound.y + cy,
                            bound.x + x,
                            bound.y + y
                        )),
                        PathCmd::CubicTo(c1x, c1y, c2x, c2y, x, y) => d.push_str(&format!(
                            "C {} {} {} {} {} {} ",
                            bound.x + c1x,
                            bound.y + c1y,
                            bound.x + c2x,
                            bound.y + c2y,
                            bound.x + x,
                            bound.y + y
                        )),
                        PathCmd::Close => d.push_str("Z "),
                    }
                }
                let fill = style
                    .fill
                    .as_ref()
                    .map(paint_to_svg)
                    .unwrap_or("none".into());
                let stroke = style
                    .stroke
                    .as_ref()
                    .map(|s| paint_to_svg(&s.paint))
                    .unwrap_or("none".into());
                let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(0.0);

                svgs.push_str(&format!(
                    "  <path id=\"{}\" d=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
                    node.id,
                    d.trim(),
                    fill,
                    stroke,
                    stroke_width
                ));
            }
            _ => {
                for child in graph.children(idx) {
                    traverse(child, bound, graph, bounds, divs, svgs, _defs);
                }
            }
        }
    }

    let root_bound = bounds.get(&graph.root).cloned().unwrap_or(ResolvedBounds {
        x: 0.0,
        y: 0.0,
        width: viewport.width,
        height: viewport.height,
    });

    for child in graph.children(graph.root) {
        traverse(
            child,
            &root_bound,
            graph,
            &bounds,
            &mut divs,
            &mut svgs,
            &mut defs,
        );
    }

    for edge in &graph.edges {
        let style = graph.resolve_style_for_edge(edge, &[]);
        let (x1, y1) = match edge.from {
            crate::model::EdgeAnchor::Node(id) => {
                if let Some(idx) = graph.id_index.get(&id) {
                    if let Some(b) = bounds.get(idx) {
                        (b.x + b.width / 2.0, b.y + b.height / 2.0)
                    } else {
                        (0.0, 0.0)
                    }
                } else {
                    (0.0, 0.0)
                }
            }
            crate::model::EdgeAnchor::Point(x, y) => (x, y),
        };
        let (x2, y2) = match edge.to {
            crate::model::EdgeAnchor::Node(id) => {
                if let Some(idx) = graph.id_index.get(&id) {
                    if let Some(b) = bounds.get(idx) {
                        (b.x + b.width / 2.0, b.y + b.height / 2.0)
                    } else {
                        (0.0, 0.0)
                    }
                } else {
                    (0.0, 0.0)
                }
            }
            crate::model::EdgeAnchor::Point(x, y) => (x, y),
        };

        let stroke = style
            .stroke
            .as_ref()
            .map(|s| paint_to_svg(&s.paint))
            .unwrap_or("#000000".into());
        let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(2.0);

        svgs.push_str(&format!(
            "  <line id=\"{}\" x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
            edge.id, x1, y1, x2, y2, stroke, stroke_width
        ));
    }

    html.push_str(&divs);
    html.push_str("<svg style=\"position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;\">\n");
    if !defs.is_empty() {
        html.push_str("  <defs>\n");
        html.push_str(&defs);
        html.push_str("  </defs>\n");
    }
    html.push_str(&svgs);
    html.push_str("</svg>\n");
    html.push_str("</body>\n</html>\n");

    html
}
