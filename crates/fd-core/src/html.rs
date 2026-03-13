#![allow(clippy::collapsible_if)]
#![allow(clippy::collapsible_match)]

use crate::layout::{Viewport, resolve_layout};

/// Escapes HTML characters to prevent XSS.
fn escape_html(s: &str) -> String {
    s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
}

/// Escapes HTML attribute characters to prevent XSS.
fn escape_attr(s: &str) -> String {
    escape_html(s).replace("\"", "&quot;").replace("'", "&#39;")
}
use crate::model::*;
use std::fmt::Write;

pub fn emit_html(graph: &SceneGraph) -> String {
    let mut html = String::new();
    let bounds = resolve_layout(graph, Viewport::default());

    writeln!(&mut html, "<!DOCTYPE html>").unwrap();
    writeln!(&mut html, "<html>").unwrap();
    writeln!(&mut html, "<head>").unwrap();
    writeln!(&mut html, "  <meta charset=\"utf-8\">").unwrap();
    writeln!(&mut html, "  <style>").unwrap();
    writeln!(&mut html, "    body {{ margin: 0; padding: 0; overflow: hidden; background: #f0f0f0; font-family: sans-serif; }}").unwrap();
    writeln!(
        &mut html,
        "    .fd-node {{ position: absolute; box-sizing: border-box; display: flex; }}"
    )
    .unwrap();
    writeln!(&mut html, "  </style>").unwrap();
    writeln!(&mut html, "</head>").unwrap();
    writeln!(&mut html, "<body>").unwrap();

    let mut svg_content = String::new();

    for idx in graph.graph.node_indices() {
        if matches!(graph.graph[idx].kind, NodeKind::Root) {
            continue;
        }

        let node = &graph.graph[idx];
        let Some(b) = bounds.get(&idx) else { continue };

        let props = graph.resolve_style(node, &[]);

        let mut style_str = String::new();
        write!(
            &mut style_str,
            "left: {}px; top: {}px; width: {}px; height: {}px;",
            b.x, b.y, b.width, b.height
        )
        .unwrap();

        if let Some(fill) = &props.fill {
            if let Paint::Solid(c) = fill {
                write!(&mut style_str, " background-color: {};", c.to_hex()).unwrap();
            }
        }

        if let Some(opacity) = props.opacity {
            write!(&mut style_str, " opacity: {};", opacity).unwrap();
        }

        // Handle alignment for content
        let align = props.text_align.unwrap_or(TextAlign::Center);
        let valign = props.text_valign.unwrap_or(TextVAlign::Middle);

        let justify = match align {
            TextAlign::Left => "flex-start",
            TextAlign::Center => "center",
            TextAlign::Right => "flex-end",
        };

        let align_items = match valign {
            TextVAlign::Top => "flex-start",
            TextVAlign::Middle => "center",
            TextVAlign::Bottom => "flex-end",
        };

        write!(
            &mut style_str,
            " justify-content: {}; align-items: {}; text-align: {};",
            justify,
            align_items,
            match align {
                TextAlign::Left => "left",
                TextAlign::Center => "center",
                TextAlign::Right => "right",
            }
        )
        .unwrap();

        // Handle font
        if let Some(font) = &props.font {
            write!(
                &mut style_str,
                " font-family: '{}', sans-serif; font-size: {}px; font-weight: {};",
                font.family, font.size, font.weight
            )
            .unwrap();
        }

        match &node.kind {
            NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
                if let Some(radius) = props.corner_radius {
                    write!(&mut style_str, " border-radius: {}px;", radius).unwrap();
                }
                if let Some(stroke) = &props.stroke {
                    if let Paint::Solid(c) = &stroke.paint {
                        write!(
                            &mut style_str,
                            " border: {}px solid {};",
                            stroke.width,
                            c.to_hex()
                        )
                        .unwrap();
                    }
                }
                if let Some(shadow) = &props.shadow {
                    write!(
                        &mut style_str,
                        " box-shadow: {}px {}px {}px {};",
                        shadow.offset_x,
                        shadow.offset_y,
                        shadow.blur,
                        shadow.color.to_hex()
                    )
                    .unwrap();
                }

                if let NodeKind::Frame { clip, .. } = &node.kind {
                    if *clip {
                        write!(&mut style_str, " overflow: hidden;").unwrap();
                    }
                }

                writeln!(
                    &mut html,
                    "  <div id=\"{}\" class=\"fd-node\" style=\"{}\"></div>",
                    escape_attr(node.id.as_str()),
                    style_str
                )
                .unwrap();
            }
            NodeKind::Text { content, .. } => {
                if let Some(fill) = &props.fill {
                    if let Paint::Solid(c) = fill {
                        style_str =
                            style_str.replace(&format!("background-color: {};", c.to_hex()), "");
                        write!(&mut style_str, " color: {};", c.to_hex()).unwrap();
                    }
                }
                writeln!(
                    &mut html,
                    "  <div id=\"{}\" class=\"fd-node\" style=\"{}\">{}</div>",
                    escape_attr(node.id.as_str()),
                    style_str,
                    escape_html(content)
                )
                .unwrap();
            }
            NodeKind::Image { source, fit, .. } => {
                let object_fit = match fit {
                    ImageFit::Cover => "cover",
                    ImageFit::Contain => "contain",
                    ImageFit::Fill => "fill",
                    ImageFit::None => "none",
                };

                let src = match source {
                    ImageSource::File(path) => path.clone(),
                };

                if let Some(radius) = props.corner_radius {
                    write!(&mut style_str, " border-radius: {}px;", radius).unwrap();
                }

                writeln!(
                    &mut html,
                    "  <img id=\"{}\" src=\"{}\" class=\"fd-node\" style=\"{} object-fit: {};\" />",
                    escape_attr(node.id.as_str()),
                    escape_attr(&src),
                    style_str,
                    object_fit
                )
                .unwrap();
            }
            NodeKind::Ellipse { rx, ry } => {
                let cx = b.x + rx;
                let cy = b.y + ry;
                let mut fill_str = "transparent".to_string();
                if let Some(Paint::Solid(c)) = &props.fill {
                    fill_str = c.to_hex();
                }

                let mut stroke_str = "none".to_string();
                let mut stroke_width = 0.0;
                if let Some(stroke) = &props.stroke {
                    if let Paint::Solid(c) = &stroke.paint {
                        stroke_str = c.to_hex();
                        stroke_width = stroke.width;
                    }
                }

                writeln!(&mut svg_content, "    <ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />",
                         cx, cy, rx, ry, fill_str, stroke_str, stroke_width).unwrap();
            }
            NodeKind::Path { commands } => {
                let mut d = String::new();
                let mut is_first = true;
                for cmd in commands {
                    match cmd {
                        PathCmd::MoveTo(x, y) => {
                            if is_first {
                                write!(&mut d, "M {} {}", b.x + x, b.y + y).unwrap();
                                is_first = false;
                            } else {
                                write!(&mut d, " M {} {}", b.x + x, b.y + y).unwrap();
                            }
                        }
                        PathCmd::LineTo(x, y) => {
                            write!(&mut d, " L {} {}", b.x + x, b.y + y).unwrap()
                        }
                        PathCmd::QuadTo(cx, cy, x, y) => write!(
                            &mut d,
                            " Q {} {} {} {}",
                            b.x + cx,
                            b.y + cy,
                            b.x + x,
                            b.y + y
                        )
                        .unwrap(),
                        PathCmd::CubicTo(cx1, cy1, cx2, cy2, x, y) => write!(
                            &mut d,
                            " C {} {} {} {} {} {}",
                            b.x + cx1,
                            b.y + cy1,
                            b.x + cx2,
                            b.y + cy2,
                            b.x + x,
                            b.y + y
                        )
                        .unwrap(),
                        PathCmd::Close => write!(&mut d, " Z").unwrap(),
                    }
                }

                let mut fill_str = "transparent".to_string();
                if let Some(Paint::Solid(c)) = &props.fill {
                    fill_str = c.to_hex();
                }

                let mut stroke_str = "none".to_string();
                let mut stroke_width = 0.0;
                if let Some(stroke) = &props.stroke {
                    if let Paint::Solid(c) = &stroke.paint {
                        stroke_str = c.to_hex();
                        stroke_width = stroke.width;
                    }
                }

                writeln!(
                    &mut svg_content,
                    "    <path d=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />",
                    d, fill_str, stroke_str, stroke_width
                )
                .unwrap();
            }
            _ => {}
        }
    }

    if !svg_content.is_empty() || !graph.edges.is_empty() {
        writeln!(&mut html, "  <svg style=\"position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;\">").unwrap();
        html.push_str(&svg_content);

        for edge in &graph.edges {
            let props = graph.resolve_style_for_edge(edge, &[]);
            let mut stroke_str = "#000000".to_string();
            let mut stroke_width = 1.0;
            if let Some(stroke) = &props.stroke {
                if let Paint::Solid(c) = &stroke.paint {
                    stroke_str = c.to_hex();
                    stroke_width = stroke.width;
                }
            }

            let get_pt = |anchor: &EdgeAnchor| -> Option<(f32, f32)> {
                match anchor {
                    EdgeAnchor::Point(x, y) => Some((*x, *y)),
                    EdgeAnchor::Node(id) => {
                        let idx = graph.id_index.get(id)?;
                        let b = bounds.get(idx)?;
                        Some(b.center())
                    }
                }
            };

            if let (Some((x1, y1)), Some((x2, y2))) = (get_pt(&edge.from), get_pt(&edge.to)) {
                writeln!(&mut html, "    <line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />",
                         x1, y1, x2, y2, stroke_str, stroke_width).unwrap();
            }
        }

        writeln!(&mut html, "  </svg>").unwrap();
    }

    writeln!(&mut html, "</body>").unwrap();
    writeln!(&mut html, "</html>").unwrap();

    html
}
