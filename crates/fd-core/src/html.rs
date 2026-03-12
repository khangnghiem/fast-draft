use crate::layout::{Viewport, resolve_layout};
use crate::model::*;
use std::fmt::Write;

fn escape_html(input: &str) -> String {
    input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#x27;")
}

pub fn emit_html(graph: &SceneGraph) -> String {
    let bounds = resolve_layout(graph, Viewport::default());
    let mut html = String::new();
    html.push_str("<!DOCTYPE html>\n<html>\n<head>\n<style>\n");
    html.push_str("body { margin: 0; overflow: hidden; }\n");
    html.push_str(".node { position: absolute; box-sizing: border-box; }\n");
    html.push_str("</style>\n</head>\n<body>\n");

    // Edges rendered first in a fullscreen svg overlay so they sit behind nodes
    let mut edges_svg = String::new();
    let _ = writeln!(
        edges_svg,
        "<svg style=\"position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;\">"
    );

    for edge in &graph.edges {
        let src_bounds = edge
            .from
            .node_id()
            .and_then(|id| graph.index_of(id))
            .and_then(|idx| bounds.get(&idx));
        let dst_bounds = edge
            .to
            .node_id()
            .and_then(|id| graph.index_of(id))
            .and_then(|idx| bounds.get(&idx));

        let (sx, sy) = if let Some(sb) = src_bounds {
            (sb.x + sb.width / 2.0, sb.y + sb.height / 2.0)
        } else if let EdgeAnchor::Point(x, y) = edge.from {
            (x, y)
        } else {
            continue;
        };

        let (dx, dy) = if let Some(db) = dst_bounds {
            (db.x + db.width / 2.0, db.y + db.height / 2.0)
        } else if let EdgeAnchor::Point(x, y) = edge.to {
            (x, y)
        } else {
            continue;
        };

        let mut stroke_str = "black".to_string();
        let mut stroke_width = 1.0;
        if let Some(stroke) = &edge.props.stroke {
            if let Paint::Solid(color) = &stroke.paint {
                stroke_str = color.to_hex();
            }
            stroke_width = stroke.width;
        }

        let mut extra = String::new();
        if let Some(op) = edge.props.opacity {
            let _ = write!(extra, " opacity=\"{}\"", op);
        }

        let _ = writeln!(
            edges_svg,
            "  <line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"{}\" stroke-width=\"{}\"{} />",
            sx, sy, dx, dy, stroke_str, stroke_width, extra
        );
    }
    edges_svg.push_str("</svg>\n");
    html.push_str(&edges_svg);

    // Nodes
    let mut indices: Vec<_> = bounds.keys().copied().collect();
    // Sort logically by ID index, though ideally z-index would dictate this
    indices.sort();

    for (z, &idx) in indices.iter().enumerate() {
        if idx == graph.root {
            continue;
        }
        let node = &graph.graph[idx];
        let bound = &bounds[&idx];

        let mut style = format!(
            "left: {}px; top: {}px; width: {}px; height: {}px; z-index: {};",
            bound.x,
            bound.y,
            bound.width,
            bound.height,
            z + 1
        );

        // Border/Stroke for Rects/Frames
        if let Some(stroke) = &node.props.stroke {
            if let Paint::Solid(color) = &stroke.paint {
                style.push_str(&format!(
                    " border: {}px solid {};",
                    stroke.width,
                    color.to_hex()
                ));
            }
        }

        // Corner radius
        if let Some(r) = node.props.corner_radius {
            style.push_str(&format!(" border-radius: {}px;", r));
        }

        // Opacity
        if let Some(op) = node.props.opacity {
            style.push_str(&format!(" opacity: {};", op));
        }

        // Shadow
        if let Some(sh) = &node.props.shadow {
            style.push_str(&format!(
                " box-shadow: {}px {}px {}px {};",
                sh.offset_x,
                sh.offset_y,
                sh.blur,
                sh.color.to_hex()
            ));
        }

        // Animations (Transitions)
        if !node.animations.is_empty() {
            style.push_str(" transition: all 0.3s ease;");
        }

        match &node.kind {
            NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
                if let Some(Paint::Solid(color)) = &node.props.fill {
                    style.push_str(&format!(" background-color: {};", color.to_hex()));
                }
                let _ = writeln!(html, "<div class=\"node\" style=\"{}\"></div>", style);
            }
            NodeKind::Text { content, .. } => {
                let mut text_style = style.clone();
                text_style
                    .push_str(" display: flex; align-items: center; justify-content: center;");
                if let Some(font) = &node.props.font {
                    text_style.push_str(&format!(
                        " font-family: '{}'; font-size: {}px;",
                        font.family, font.size
                    ));
                }
                if let Some(Paint::Solid(color)) = &node.props.fill {
                    text_style.push_str(&format!(" color: {};", color.to_hex()));
                }
                let _ = writeln!(
                    html,
                    "<div class=\"node\" style=\"{}\">{}</div>",
                    text_style,
                    escape_html(content)
                );
            }
            NodeKind::Ellipse { rx, ry } => {
                let mut fill_str = "none".to_string();
                if let Some(Paint::Solid(color)) = &node.props.fill {
                    fill_str = color.to_hex();
                }

                let mut stroke_str = "none".to_string();
                let mut stroke_width = 0.0;
                if let Some(stroke) = &node.props.stroke {
                    if let Paint::Solid(color) = &stroke.paint {
                        stroke_str = color.to_hex();
                    }
                    stroke_width = stroke.width;
                }

                let _ = writeln!(
                    html,
                    "<svg class=\"node\" style=\"{} pointer-events: none;\"><ellipse cx=\"50%\" cy=\"50%\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" /></svg>",
                    style, rx, ry, fill_str, stroke_str, stroke_width
                );
            }
            NodeKind::Path { commands } => {
                let mut d = String::new();
                for cmd in commands {
                    match cmd {
                        PathCmd::MoveTo(x, y) => {
                            let _ = write!(d, "M {} {} ", x, y);
                        }
                        PathCmd::LineTo(x, y) => {
                            let _ = write!(d, "L {} {} ", x, y);
                        }
                        PathCmd::QuadTo(cx, cy, x, y) => {
                            let _ = write!(d, "Q {} {} {} {} ", cx, cy, x, y);
                        }
                        PathCmd::CubicTo(c1x, c1y, c2x, c2y, x, y) => {
                            let _ = write!(d, "C {} {} {} {} {} {} ", c1x, c1y, c2x, c2y, x, y);
                        }
                        PathCmd::Close => {
                            d.push_str("Z ");
                        }
                    }
                }
                let mut stroke_str = "black".to_string();
                let mut stroke_width = 1.0;
                if let Some(stroke) = &node.props.stroke {
                    if let Paint::Solid(color) = &stroke.paint {
                        stroke_str = color.to_hex();
                    }
                    stroke_width = stroke.width;
                }

                let mut fill_str = "none".to_string();
                if let Some(Paint::Solid(color)) = &node.props.fill {
                    fill_str = color.to_hex();
                }

                let _ = writeln!(
                    html,
                    "<svg class=\"node\" style=\"{} pointer-events: none; overflow: visible;\"><path d=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" /></svg>",
                    style,
                    d.trim(),
                    fill_str,
                    stroke_str,
                    stroke_width
                );
            }
            _ => {}
        }
    }

    html.push_str("</body>\n</html>\n");
    html
}
