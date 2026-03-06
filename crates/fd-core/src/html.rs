use crate::id::NodeId;
use crate::layout::{Viewport, resolve_layout};
use crate::model::*;
use std::collections::HashMap;
use std::fmt::Write;

/// Escapes text for HTML output to prevent XSS.
fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

/// Helper to generate a CSS class name from a NodeId.
fn css_class(id: NodeId) -> String {
    format!("s-{}", id.as_str())
}

/// Convert FD Easing to CSS timing function.
fn easing_to_css(easing: &Easing) -> String {
    match easing {
        Easing::Linear => "linear".to_string(),
        Easing::EaseIn => "ease-in".to_string(),
        Easing::EaseOut => "ease-out".to_string(),
        Easing::EaseInOut => "ease-in-out".to_string(),
        Easing::Spring => "cubic-bezier(0.175, 0.885, 0.32, 1.275)".to_string(), // Approximation
        Easing::CubicBezier(x1, y1, x2, y2) => format!("cubic-bezier({x1}, {y1}, {x2}, {y2})"),
    }
}

/// Convert FD Paint to CSS value.
fn paint_to_css(paint: &Paint) -> String {
    match paint {
        Paint::Solid(c) => c.to_hex(),
        Paint::LinearGradient { angle, stops } => {
            let mut s = format!("linear-gradient({angle}deg");
            for stop in stops {
                write!(s, ", {} {}%", stop.color.to_hex(), stop.offset * 100.0).unwrap();
            }
            s.push(')');
            s
        }
        Paint::RadialGradient { stops } => {
            let mut s = "radial-gradient(circle".to_string();
            for stop in stops {
                write!(s, ", {} {}%", stop.color.to_hex(), stop.offset * 100.0).unwrap();
            }
            s.push(')');
            s
        }
    }
}

/// Emit CSS rules for a given Style.
fn emit_css_properties(out: &mut String, style: &Style) {
    if let Some(fill) = &style.fill {
        writeln!(out, "      background: {};", paint_to_css(fill)).unwrap();
    }
    if let Some(stroke) = &style.stroke {
        let paint = paint_to_css(&stroke.paint);
        writeln!(out, "      border: {}px solid {};", stroke.width, paint).unwrap();
    }
    if let Some(opacity) = style.opacity {
        writeln!(out, "      opacity: {opacity};").unwrap();
    }
    if let Some(corner) = style.corner_radius {
        writeln!(out, "      border-radius: {corner}px;").unwrap();
    }
    if let Some(shadow) = &style.shadow {
        writeln!(
            out,
            "      box-shadow: {}px {}px {}px {};",
            shadow.offset_x,
            shadow.offset_y,
            shadow.blur,
            shadow.color.to_hex()
        )
        .unwrap();
    }
    if let Some(font) = &style.font {
        writeln!(out, "      font-family: '{}', sans-serif;", font.family).unwrap();
        writeln!(out, "      font-weight: {};", font.weight).unwrap();
        writeln!(out, "      font-size: {}px;", font.size).unwrap();
    }
    if style.text_align.is_some() || style.text_valign.is_some() {
        writeln!(out, "      display: flex;").unwrap();
        let justify = match style.text_align.unwrap_or_default() {
            TextAlign::Left => "flex-start",
            TextAlign::Center => "center",
            TextAlign::Right => "flex-end",
        };
        writeln!(out, "      justify-content: {justify};").unwrap();
        let align = match style.text_valign.unwrap_or_default() {
            TextVAlign::Top => "flex-start",
            TextVAlign::Middle => "center",
            TextVAlign::Bottom => "flex-end",
        };
        writeln!(out, "      align-items: {align};").unwrap();
    }
}

/// Emit CSS for a hover/press animation keyframe.
fn emit_anim_css(out: &mut String, selector: &str, anim: &AnimKeyframe) {
    let pseudo = match &anim.trigger {
        AnimTrigger::Hover => ":hover",
        AnimTrigger::Press => ":active",
        AnimTrigger::Enter | AnimTrigger::Custom(_) => return, // Handle CSS animations separately if needed
    };

    let transition = format!("all {}ms {}", anim.duration_ms, easing_to_css(&anim.easing));

    // Apply the transition to the base class
    writeln!(out, "    {} {{ transition: {transition}; }}", selector).unwrap();

    writeln!(out, "    {}{} {{", selector, pseudo).unwrap();
    if let Some(fill) = &anim.properties.fill {
        writeln!(out, "      background: {};", paint_to_css(fill)).unwrap();
    }
    if let Some(opacity) = anim.properties.opacity {
        writeln!(out, "      opacity: {opacity};").unwrap();
    }

    let mut transform = String::new();
    if let Some(scale) = anim.properties.scale {
        write!(transform, "scale({scale}) ").unwrap();
    }
    if let Some(rotate) = anim.properties.rotate {
        write!(transform, "rotate({rotate}deg) ").unwrap();
    }
    if let Some((tx, ty)) = anim.properties.translate {
        write!(transform, "translate({tx}px, {ty}px) ").unwrap();
    }
    if !transform.is_empty() {
        writeln!(out, "      transform: {};", transform.trim()).unwrap();
    }

    writeln!(out, "    }}").unwrap();
}

fn render_node(
    out: &mut String,
    graph: &SceneGraph,
    idx: petgraph::graph::NodeIndex,
    bounds: &HashMap<petgraph::graph::NodeIndex, ResolvedBounds>,
) {
    let node = &graph.graph[idx];

    // Build classes string
    let mut classes = String::new();
    for style_id in &node.use_styles {
        classes.push_str(&css_class(*style_id));
        classes.push(' ');
    }
    classes.push_str(&format!("n-{}", node.id.as_str()));

    let bound = bounds.get(&idx).copied().unwrap_or_default();
    let parent = graph.parent(idx);
    let parent_bound = parent
        .and_then(|p| bounds.get(&p))
        .copied()
        .unwrap_or_default();

    // Relative position
    let left = bound.x - parent_bound.x;
    let top = bound.y - parent_bound.y;

    match &node.kind {
        NodeKind::Rect { width, height } | NodeKind::Frame { width, height, .. } => {
            let tag = "div";
            writeln!(
                out,
                r#"    <{tag} id="{}" class="{classes}" style="position: absolute; left: {}px; top: {}px; width: {}px; height: {}px;"{}>"#,
                escape_html(node.id.as_str()),
                left,
                top,
                width,
                height,
                if let NodeKind::Frame { clip: true, .. } = node.kind { r#" overflow: hidden;"# } else { "" }
            )
            .unwrap();

            // Children
            for child_idx in graph.children(idx) {
                render_node(out, graph, child_idx, bounds);
            }

            writeln!(out, "    </{tag}>").unwrap();
        }
        NodeKind::Group => {
            writeln!(
                out,
                r#"    <div id="{}" class="{classes}" style="position: absolute; left: {}px; top: {}px; width: {}px; height: {}px; pointer-events: none;">"#,
                escape_html(node.id.as_str()),
                left,
                top,
                bound.width,
                bound.height
            )
            .unwrap();

            for child_idx in graph.children(idx) {
                render_node(out, graph, child_idx, bounds);
            }

            writeln!(out, "    </div>").unwrap();
        }
        NodeKind::Ellipse { rx, ry } => {
            // Render as SVG for perfect shape, or div with border-radius: 50%
            writeln!(
                out,
                r#"    <div id="{}" class="{classes}" style="position: absolute; left: {}px; top: {}px; width: {}px; height: {}px; border-radius: 50%;">"#,
                escape_html(node.id.as_str()),
                left,
                top,
                rx * 2.0,
                ry * 2.0
            )
            .unwrap();
            writeln!(out, "    </div>").unwrap();
        }
        NodeKind::Text { content, max_width } => {
            let width_style = if let Some(w) = max_width {
                format!(" max-width: {w}px; white-space: normal;")
            } else {
                " white-space: pre;".to_string()
            };

            // Flex layout is handled by emit_css_properties if text_align is set on style
            writeln!(
                out,
                r#"    <div id="{}" class="{classes}" style="position: absolute; left: {}px; top: {}px; width: {}px; height: {}px; box-sizing: border-box;{width_style}">"#,
                escape_html(node.id.as_str()),
                left,
                top,
                bound.width,
                bound.height
            )
            .unwrap();

            // Wrap in span to apply text color correctly if needed, or rely on flex
            writeln!(out, "      {}", escape_html(content)).unwrap();
            writeln!(out, "    </div>").unwrap();
        }
        NodeKind::Path { commands } => {
            // Render path as an SVG
            writeln!(
                out,
                r#"    <svg id="{}" class="{classes}" style="position: absolute; left: {}px; top: {}px; width: {}px; height: {}px; overflow: visible;">"#,
                escape_html(node.id.as_str()),
                left,
                top,
                bound.width,
                bound.height
            )
            .unwrap();

            let mut d = String::new();
            for cmd in commands {
                match cmd {
                    PathCmd::MoveTo(x, y) => write!(d, "M {x} {y} ").unwrap(),
                    PathCmd::LineTo(x, y) => write!(d, "L {x} {y} ").unwrap(),
                    PathCmd::QuadTo(cx, cy, x, y) => write!(d, "Q {cx} {cy} {x} {y} ").unwrap(),
                    PathCmd::CubicTo(cx1, cy1, cx2, cy2, x, y) => {
                        write!(d, "C {cx1} {cy1} {cx2} {cy2} {x} {y} ").unwrap()
                    }
                    PathCmd::Close => d.push_str("Z "),
                }
            }

            // Style will be applied to the SVG, we need path stroke/fill
            writeln!(
                out,
                r#"      <path d="{}" fill="currentColor" />"#,
                d.trim()
            )
            .unwrap();
            writeln!(out, "    </svg>").unwrap();
        }
        _ => {
            // Generic or root
            for child_idx in graph.children(idx) {
                render_node(out, graph, child_idx, bounds);
            }
        }
    }
}

/// Generate HTML for edges (rendered as a single SVG overlay).
fn render_edges(
    out: &mut String,
    graph: &SceneGraph,
    bounds: &HashMap<petgraph::graph::NodeIndex, ResolvedBounds>,
    viewport: Viewport,
) {
    if graph.edges.is_empty() {
        return;
    }

    writeln!(
        out,
        r#"    <svg class="edges-overlay" style="position: absolute; left: 0; top: 0; width: {}px; height: {}px; pointer-events: none; overflow: visible;">"#,
        viewport.width, viewport.height
    )
    .unwrap();

    // Define markers for arrows
    writeln!(out, "      <defs>").unwrap();
    // Default arrow marker
    writeln!(
        out,
        r#"        <marker id="arrow-end" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">"#
    ).unwrap();
    writeln!(
        out,
        r#"          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />"#
    )
    .unwrap();
    writeln!(out, "        </marker>").unwrap();
    writeln!(out, "      </defs>").unwrap();

    for edge in &graph.edges {
        let get_point = |anchor: &EdgeAnchor| -> (f32, f32) {
            match anchor {
                EdgeAnchor::Point(x, y) => (*x, *y),
                EdgeAnchor::Node(id) => {
                    if let Some(idx) = graph.index_of(*id)
                        && let Some(b) = bounds.get(&idx)
                    {
                        return b.center();
                    }
                    (0.0, 0.0)
                }
            }
        };

        let (x1, y1) = get_point(&edge.from);
        let (x2, y2) = get_point(&edge.to);

        let mut classes = String::new();
        for style_id in &edge.use_styles {
            classes.push_str(&css_class(*style_id));
            classes.push(' ');
        }
        classes.push_str(&format!("e-{}", edge.id.as_str()));

        // Use resolved edge style
        let style = graph.resolve_style_for_edge(edge, &[]);
        let stroke_color = style
            .stroke
            .as_ref()
            .map(|s| match &s.paint {
                Paint::Solid(c) => c.to_hex(),
                _ => "#000000".to_string(),
            })
            .unwrap_or_else(|| "#000000".to_string());
        let stroke_width = style.stroke.map(|s| s.width).unwrap_or(2.0);

        let marker_start = if matches!(edge.arrow, ArrowKind::Start | ArrowKind::Both) {
            r#" marker-start="url(#arrow-end)""#
        } else {
            ""
        };
        let marker_end = if matches!(edge.arrow, ArrowKind::End | ArrowKind::Both) {
            r#" marker-end="url(#arrow-end)""#
        } else {
            ""
        };

        let d = match edge.curve {
            CurveKind::Straight => format!("M {x1} {y1} L {x2} {y2}"),
            CurveKind::Smooth => {
                let dx = (x2 - x1).abs() * 0.5;
                format!(
                    "M {x1} {y1} C {} {y1}, {} {y2}, {x2} {y2}",
                    x1 + dx,
                    x2 - dx
                )
            }
            CurveKind::Step => {
                let mid_x = x1 + (x2 - x1) / 2.0;
                format!("M {x1} {y1} L {mid_x} {y1} L {mid_x} {y2} L {x2} {y2}")
            }
        };

        writeln!(
            out,
            r#"      <path id="{}" class="{classes}" d="{d}" fill="none" stroke="{stroke_color}" stroke-width="{stroke_width}"{marker_start}{marker_end} />"#,
            escape_html(edge.id.as_str())
        ).unwrap();

        // Render edge text label
        if let Some(text_id) = edge.text_child
            && let Some(node) = graph.get_by_id(text_id)
            && let NodeKind::Text { content, .. } = &node.kind
        {
            let (ox, oy) = edge.label_offset.unwrap_or((0.0, 0.0));
            let mx = (x1 + x2) / 2.0 + ox;
            let my = (y1 + y2) / 2.0 + oy;

            writeln!(
                out,
                r#"      <text x="{mx}" y="{my}" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-family="Inter, sans-serif" font-size="12px">{}</text>"#,
                escape_html(content)
            ).unwrap();
        }
    }

    writeln!(out, "    </svg>").unwrap();
}

/// Export the SceneGraph as a standalone HTML document.
pub fn emit_html(graph: &SceneGraph) -> String {
    let mut out = String::with_capacity(8192);
    let viewport = Viewport::default(); // TODO: support explicit canvas bounds
    let bounds = resolve_layout(graph, viewport);

    // Header
    writeln!(out, "<!DOCTYPE html>").unwrap();
    writeln!(out, r#"<html lang="en">"#).unwrap();
    writeln!(out, "<head>").unwrap();
    writeln!(out, r#"  <meta charset="UTF-8">"#).unwrap();
    writeln!(
        out,
        r#"  <meta name="viewport" content="width=device-width, initial-scale=1.0">"#
    )
    .unwrap();
    writeln!(out, "  <title>FD Export</title>").unwrap();

    // Google Fonts (Inter)
    writeln!(
        out,
        r#"  <link rel="preconnect" href="https://fonts.googleapis.com">"#
    )
    .unwrap();
    writeln!(
        out,
        r#"  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>"#
    )
    .unwrap();
    writeln!(out, r#"  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">"#).unwrap();

    // Styles
    writeln!(out, "  <style>").unwrap();
    writeln!(out, "    body {{ margin: 0; background: #fafafa; }}").unwrap();
    writeln!(out, "    .fd-canvas {{ position: relative; width: {}px; height: {}px; margin: 2rem auto; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }}", viewport.width, viewport.height).unwrap();
    writeln!(out, "    * {{ box-sizing: border-box; }}").unwrap();
    writeln!(out, "    div, p {{ margin: 0; padding: 0; }}").unwrap();

    // Emit CSS for themes (shared styles)
    let mut styles: Vec<_> = graph.styles.iter().collect();
    styles.sort_by_key(|(id, _)| id.as_str().to_string());
    for (id, style) in styles {
        writeln!(out, "    .{} {{", css_class(*id)).unwrap();
        emit_css_properties(&mut out, style);
        writeln!(out, "    }}").unwrap();
    }

    // Emit inline node styles and animations
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }

        let class_name = format!("n-{}", node.id.as_str());

        // Inline styles
        writeln!(out, "    .{} {{", class_name).unwrap();
        emit_css_properties(&mut out, &node.style);

        // Layout mode applies to frames (which act as flex containers)
        if let NodeKind::Frame { layout, .. } = &node.kind {
            match layout {
                LayoutMode::Column { gap, pad } => {
                    writeln!(out, "      display: flex; flex-direction: column; gap: {gap}px; padding: {pad}px;").unwrap();
                }
                LayoutMode::Row { gap, pad } => {
                    writeln!(
                        out,
                        "      display: flex; flex-direction: row; gap: {gap}px; padding: {pad}px;"
                    )
                    .unwrap();
                }
                LayoutMode::Grid { cols, gap, pad } => {
                    writeln!(out, "      display: grid; grid-template-columns: repeat({cols}, 1fr); gap: {gap}px; padding: {pad}px;").unwrap();
                }
                LayoutMode::Free => {}
            }
        }

        writeln!(out, "    }}").unwrap();

        // Animations
        for anim in &node.animations {
            emit_anim_css(&mut out, &format!(".{}", class_name), anim);
        }
    }

    // Edge animations and specific styles
    for edge in &graph.edges {
        let class_name = format!("e-{}", edge.id.as_str());
        if edge.style.opacity.is_some() || edge.style.fill.is_some() || edge.style.stroke.is_some()
        {
            writeln!(out, "    .{} {{", class_name).unwrap();
            if let Some(opacity) = edge.style.opacity {
                writeln!(out, "      opacity: {opacity};").unwrap();
            }
            writeln!(out, "    }}").unwrap();
        }
        for anim in &edge.animations {
            emit_anim_css(&mut out, &format!(".{}", class_name), anim);
        }

        if let Some(flow) = &edge.flow {
            let anim_name = format!("flow-{}-{}", edge.id.as_str(), flow.duration_ms);
            match flow.kind {
                FlowKind::Dash => {
                    writeln!(
                        out,
                        "    @keyframes {anim_name} {{ to {{ stroke-dashoffset: -20; }} }}"
                    )
                    .unwrap();
                    writeln!(out, "    .{class_name} {{ stroke-dasharray: 10; animation: {anim_name} {}ms linear infinite; }}", flow.duration_ms).unwrap();
                }
                FlowKind::Pulse => {
                    writeln!(out, "    @keyframes {anim_name} {{ 0% {{ opacity: 0.3; stroke-width: 1px; }} 50% {{ opacity: 1; stroke-width: 3px; box-shadow: 0 0 10px currentColor; }} 100% {{ opacity: 0.3; stroke-width: 1px; }} }}").unwrap();
                    writeln!(
                        out,
                        "    .{class_name} {{ animation: {anim_name} {}ms ease-in-out infinite; }}",
                        flow.duration_ms
                    )
                    .unwrap();
                }
            }
        }
    }

    writeln!(out, "  </style>").unwrap();
    writeln!(out, "</head>").unwrap();
    writeln!(out, "<body>").unwrap();
    writeln!(out, r#"  <div class="fd-canvas">"#).unwrap();

    // Render nodes
    let children = graph.children(graph.root);
    for child_idx in children {
        render_node(&mut out, graph, child_idx, &bounds);
    }

    // Render edges overlay
    render_edges(&mut out, graph, &bounds, viewport);

    writeln!(out, "  </div>").unwrap();
    writeln!(out, "</body>").unwrap();
    writeln!(out, "</html>").unwrap();

    out
}

#[cfg(test)]
#[path = "html_tests.rs"]
mod tests;
