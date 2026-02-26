use crate::render2d::CanvasTheme;
use fd_core::NodeIndex;
use fd_core::model::ResolvedBounds;
use fd_core::model::{NodeKind, SceneGraph};
use std::collections::HashMap;

fn paint_to_svg_color(p: &fd_core::model::Paint) -> String {
    match p {
        fd_core::model::Paint::Solid(c) => {
            if (c.a - 1.0).abs() < f32::EPSILON {
                format!(
                    "#{:02X}{:02X}{:02X}",
                    (c.r * 255.0) as u8,
                    (c.g * 255.0) as u8,
                    (c.b * 255.0) as u8
                )
            } else {
                format!(
                    "rgba({}, {}, {}, {})",
                    (c.r * 255.0) as u8,
                    (c.g * 255.0) as u8,
                    (c.b * 255.0) as u8,
                    c.a
                )
            }
        }
        fd_core::model::Paint::LinearGradient { stops, .. }
        | fd_core::model::Paint::RadialGradient { stops } => {
            if let Some(first) = stops.first() {
                format!(
                    "#{:02X}{:02X}{:02X}",
                    (first.color.r * 255.0) as u8,
                    (first.color.g * 255.0) as u8,
                    (first.color.b * 255.0) as u8
                )
            } else {
                "#000000".to_string()
            }
        }
    }
}

pub fn render_svg(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    selected_ids: &[String],
    theme: &CanvasTheme,
) -> String {
    let mut root_selection = Vec::new();

    // If no selection, export everything.
    if selected_ids.is_empty() {
        // Collect all top-level nodes in the root
        for idx in graph.children(graph.root) {
            root_selection.push(idx);
        }
    } else {
        // Only export distinct selected subtrees
        for id in selected_ids {
            if let Some(idx) = graph.index_of(fd_core::id::NodeId::intern(id)) {
                let has_selected_ancestor = selected_ids.iter().any(|other_id| {
                    other_id != id && {
                        graph.is_ancestor_of(
                            fd_core::id::NodeId::intern(other_id),
                            fd_core::id::NodeId::intern(id),
                        )
                    }
                });
                if !has_selected_ancestor {
                    root_selection.push(idx);
                }
            }
        }
    }

    // Determine the overall bounding box
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;
    let mut found = false;

    #[allow(clippy::too_many_arguments)]
    fn expand_bounds(
        graph: &SceneGraph,
        bounds_map: &HashMap<NodeIndex, ResolvedBounds>,
        idx: NodeIndex,
        min_x: &mut f32,
        min_y: &mut f32,
        max_x: &mut f32,
        max_y: &mut f32,
        found: &mut bool,
    ) {
        if let Some(b) = bounds_map.get(&idx) {
            *min_x = (*min_x).min(b.x);
            *min_y = (*min_y).min(b.y);
            *max_x = (*max_x).max(b.x + b.width);
            *max_y = (*max_y).max(b.y + b.height);
            *found = true;
        }
        for child in graph.children(idx) {
            expand_bounds(graph, bounds_map, child, min_x, min_y, max_x, max_y, found);
        }
    }

    for &idx in &root_selection {
        expand_bounds(
            graph, bounds, idx, &mut min_x, &mut min_y, &mut max_x, &mut max_y, &mut found,
        );
    }

    if !found {
        min_x = 0.0;
        min_y = 0.0;
        max_x = 800.0;
        max_y = 600.0;
    }

    let pad = 16.0;
    let width = max_x - min_x + pad * 2.0;
    let height = max_y - min_y + pad * 2.0;
    let offset_x = min_x - pad;
    let offset_y = min_y - pad;

    let mut svg = String::new();
    svg.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\">\n"
    ));

    // SVG defs can go here if needed (e.g., fonts or global styles)
    svg.push_str("<style>\n");
    svg.push_str("  text { font-family: Inter, system-ui, sans-serif; }\n");
    svg.push_str("</style>\n");

    // Group to handle the global offset/translation
    svg.push_str(&format!(
        "<g transform=\"translate({}, {})\">\n",
        -offset_x, -offset_y
    ));

    for &idx in &root_selection {
        render_node_svg(&mut svg, graph, idx, bounds, theme);
    }

    svg.push_str("</g>\n</svg>");
    svg
}

#[allow(clippy::only_used_in_recursion)]
fn render_node_svg(
    out: &mut String,
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    theme: &CanvasTheme,
) {
    let node = &graph.graph[idx];
    let b = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let style = graph.resolve_style(node, &[]);
    let opacity = style.opacity.unwrap_or(1.0);
    let fill = style
        .fill
        .as_ref()
        .map(paint_to_svg_color)
        .unwrap_or_else(|| "none".to_string());
    let stroke = style
        .stroke
        .as_ref()
        .map(|s| paint_to_svg_color(&s.paint))
        .unwrap_or_else(|| "none".to_string());
    let stroke_width = style.stroke.as_ref().map(|s| s.width).unwrap_or(2.0);

    // Apply scale transform if needed
    let has_scale = style.scale.is_some_and(|s| (s - 1.0).abs() > f32::EPSILON) || opacity < 1.0;
    if has_scale {
        let cx = b.x + b.width / 2.0;
        let cy = b.y + b.height / 2.0;
        let s = style.scale.unwrap_or(1.0);
        out.push_str(&format!(
            "<g transform=\"translate({}, {}) scale({}) translate({}, {})\" opacity=\"{}\">\n",
            cx, cy, s, -cx, -cy, opacity
        ));
    }

    match &node.kind {
        NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
            let r = style.corner_radius.unwrap_or(0.0);
            out.push_str(&format!(
                "  <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
                b.x, b.y, b.width, b.height, r, r, fill, stroke, stroke_width
            ));
        }
        NodeKind::Ellipse { .. } => {
            let cx = b.x + b.width / 2.0;
            let cy = b.y + b.height / 2.0;
            let rx = b.width / 2.0;
            let ry = b.height / 2.0;
            out.push_str(&format!(
                "  <ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
                cx, cy, rx, ry, fill, stroke, stroke_width
            ));
        }
        NodeKind::Text { content } => {
            let font_size = style.font.as_ref().map(|f| f.size).unwrap_or(16.0);
            let text_fill = style
                .fill
                .as_ref()
                .map(paint_to_svg_color)
                .unwrap_or_else(|| "#000000".to_string());
            let align = match style.text_align {
                Some(fd_core::model::TextAlign::Center) => "middle",
                Some(fd_core::model::TextAlign::Right) => "end",
                _ => "start",
            };

            // X position depends on text-anchor
            let x = match style.text_align {
                Some(fd_core::model::TextAlign::Center) => b.x + b.width / 2.0,
                Some(fd_core::model::TextAlign::Right) => b.x + b.width,
                _ => b.x,
            };

            // Simple text rendering (single line for now, to perfectly wrap would need split)
            let lines: Vec<&str> = content.split('\\').collect();
            let line_height = font_size * 1.2;
            let total_height = lines.len() as f32 * line_height;

            // Y position depends on vertical align
            let mut y = match style.text_valign {
                Some(fd_core::model::TextVAlign::Middle) => {
                    b.y + (b.height - total_height) / 2.0 + font_size * 0.8
                }
                Some(fd_core::model::TextVAlign::Bottom) => {
                    b.y + b.height - total_height + font_size * 0.8
                }
                _ => b.y + font_size * 0.9,
            };

            for line in lines {
                // Escape HTML chars
                let clean = line
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;");
                out.push_str(&format!(
                    "  <text x=\"{}\" y=\"{}\" font-size=\"{}\" fill=\"{}\" text-anchor=\"{}\">{}</text>\n",
                    x, y, font_size, text_fill, align, clean
                ));
                y += line_height;
            }
        }
        NodeKind::Path { commands } => {
            // Need to convert PathCmds to an SVG path data string
            let mut d = String::new();
            for cmd in commands {
                match cmd {
                    fd_core::model::PathCmd::MoveTo(px, py) => {
                        d.push_str(&format!("M {} {} ", b.x + px, b.y + py))
                    }
                    fd_core::model::PathCmd::LineTo(px, py) => {
                        d.push_str(&format!("L {} {} ", b.x + px, b.y + py))
                    }
                    fd_core::model::PathCmd::QuadTo(cpx, cpy, px, py) => d.push_str(&format!(
                        "Q {} {} {} {} ",
                        b.x + cpx,
                        b.y + cpy,
                        b.x + px,
                        b.y + py
                    )),
                    fd_core::model::PathCmd::CubicTo(c1x, c1y, c2x, c2y, px, py) => {
                        d.push_str(&format!(
                            "C {} {} {} {} {} {} ",
                            b.x + c1x,
                            b.y + c1y,
                            b.x + c2x,
                            b.y + c2y,
                            b.x + px,
                            b.y + py
                        ))
                    }
                    fd_core::model::PathCmd::Close => d.push_str("Z "),
                }
            }
            out.push_str(&format!(
                "  <path d=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
                d, fill, stroke, stroke_width
            ));
        }
        NodeKind::Group { .. } | NodeKind::Root | NodeKind::Generic => {
            // Groups might have a background optionally (if style has fill)
            if fill != "none" {
                let r = style.corner_radius.unwrap_or(0.0);
                out.push_str(&format!(
                    "  <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"{}\" />\n",
                    b.x, b.y, b.width, b.height, r, r, fill, stroke, stroke_width
                ));
            }
        }
    }

    // Paint children
    for child_idx in graph.children(idx) {
        render_node_svg(out, graph, child_idx, bounds, theme);
    }

    if has_scale {
        out.push_str("</g>\n");
    }
}
