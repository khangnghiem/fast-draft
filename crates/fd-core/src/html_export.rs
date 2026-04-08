//! HTML+CSS export: SceneGraph → standalone HTML page.
//!
//! Maps FD nodes to HTML elements:
//! - Rect/Frame → `<div>` with absolute positioning
//! - Ellipse → `<div>` with `border-radius: 50%`
//! - Text → `<p>` with font styles
//! - Path → inline `<svg>` element
//! - Group → wrapper `<div>` containing children
//!
//! Animations (hover/press triggers) become CSS transitions.

use crate::id::NodeId;
use crate::model::*;
use petgraph::graph::NodeIndex;
use std::collections::HashMap;
use std::fmt::Write;

/// Convert a SceneGraph (or a subset of selected nodes) to a standalone HTML page.
///
/// If `selected_ids` is empty, all top-level nodes are exported.
/// Returns a complete HTML document string.
pub fn export_html(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    selected_ids: &[String],
) -> String {
    let root_selection = collect_root_selection(graph, selected_ids);

    let mut elements = Vec::new();
    let mut css_rules = Vec::new();
    let mut id_counter: u64 = 1;

    for &idx in &root_selection {
        collect_html_elements(
            graph,
            idx,
            bounds,
            &mut elements,
            &mut css_rules,
            &mut id_counter,
        );
    }

    build_html_document(&elements, &css_rules)
}

/// An intermediate HTML element representation.
struct HtmlElement {
    tag: &'static str,
    css_class: String,
    inline_style: String,
    content: String,
    children: Vec<HtmlElement>,
    /// SVG content for path elements.
    svg_content: Option<String>,
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

/// Recursively collect HTML elements from the scene graph.
fn collect_html_elements(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    elements: &mut Vec<HtmlElement>,
    css_rules: &mut Vec<String>,
    id_counter: &mut u64,
) {
    let node = &graph.graph[idx];
    let b = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let style = graph.resolve_style(node, &[]);
    let class_name = format!("fd-{}", {
        let v = *id_counter;
        *id_counter += 1;
        v
    });

    let mut inline_styles = Vec::new();

    // Position and size
    inline_styles.push(format!("left: {}px", format_num(b.x)));
    inline_styles.push(format!("top: {}px", format_num(b.y)));
    inline_styles.push(format!("width: {}px", format_num(b.width)));
    inline_styles.push(format!("height: {}px", format_num(b.height)));
    inline_styles.push("position: absolute".to_string());

    // Fill
    if let Some(ref fill) = style.fill {
        inline_styles.push(format!("background: {}", paint_to_css(fill)));
    }

    // Stroke
    if let Some(ref stroke) = style.stroke {
        inline_styles.push(format!(
            "border: {}px solid {}",
            format_num(stroke.width),
            paint_to_css(&stroke.paint)
        ));
        inline_styles.push("box-sizing: border-box".to_string());
    }

    // Corner radius
    if let Some(r) = style.corner_radius
        && r > 0.0
    {
        inline_styles.push(format!("border-radius: {}px", format_num(r)));
    }

    // Opacity
    if let Some(op) = style.opacity
        && (op - 1.0).abs() > 0.001
    {
        inline_styles.push(format!("opacity: {}", format_num(op)));
    }

    // Shadow
    if let Some(ref shadow) = style.shadow {
        let color = color_to_css(&shadow.color);
        inline_styles.push(format!(
            "box-shadow: {}px {}px {}px {}",
            format_num(shadow.offset_x),
            format_num(shadow.offset_y),
            format_num(shadow.blur),
            color,
        ));
    }

    // Build animations as CSS transitions
    let has_animations = !node.animations.is_empty();
    if has_animations {
        inline_styles.push("transition: all 0.3s ease".to_string());
        build_animation_css(&class_name, &node.animations, &style, css_rules);
    }

    let mut element = match &node.kind {
        NodeKind::Rect { .. } | NodeKind::Frame { .. } | NodeKind::Image { .. } => {
            if matches!(&node.kind, NodeKind::Frame { clip: true, .. }) {
                inline_styles.push("overflow: hidden".to_string());
            }
            HtmlElement {
                tag: "div",
                css_class: class_name.clone(),
                inline_style: inline_styles.join("; "),
                content: String::new(),
                children: Vec::new(),
                svg_content: None,
            }
        }
        NodeKind::Ellipse { .. } => {
            inline_styles.push("border-radius: 50%".to_string());
            HtmlElement {
                tag: "div",
                css_class: class_name.clone(),
                inline_style: inline_styles.join("; "),
                content: String::new(),
                children: Vec::new(),
                svg_content: None,
            }
        }
        NodeKind::Text { content, .. } => {
            // Text styling
            if let Some(ref font) = style.font {
                inline_styles.push(format!("font-family: '{}', sans-serif", font.family));
                inline_styles.push(format!("font-size: {}px", format_num(font.size)));
                if font.weight != 400 {
                    inline_styles.push(format!("font-weight: {}", font.weight));
                }
            }

            // Text alignment
            let text_align = style.text_align.unwrap_or(TextAlign::Center);
            inline_styles.push(format!(
                "text-align: {}",
                match text_align {
                    TextAlign::Left => "left",
                    TextAlign::Center => "center",
                    TextAlign::Right => "right",
                }
            ));

            // Vertical alignment via flexbox
            let valign = style.text_valign.unwrap_or(TextVAlign::Middle);
            inline_styles.push("display: flex".to_string());
            inline_styles.push(format!(
                "align-items: {}",
                match valign {
                    TextVAlign::Top => "flex-start",
                    TextVAlign::Middle => "center",
                    TextVAlign::Bottom => "flex-end",
                }
            ));
            inline_styles.push(format!(
                "justify-content: {}",
                match text_align {
                    TextAlign::Left => "flex-start",
                    TextAlign::Center => "center",
                    TextAlign::Right => "flex-end",
                }
            ));

            // Text color from fill
            if let Some(ref fill) = style.fill {
                inline_styles.push(format!("color: {}", paint_to_css(fill)));
            }

            // Remove background for text (fill is used for text color)
            inline_styles.retain(|s| !s.starts_with("background:"));

            inline_styles.push("margin: 0".to_string());
            inline_styles.push("white-space: pre-wrap".to_string());
            inline_styles.push("word-break: break-word".to_string());

            // Convert FD newlines (backslash) to HTML line breaks
            let html_content = content.replace('\\', "<br>");

            HtmlElement {
                tag: "p",
                css_class: class_name.clone(),
                inline_style: inline_styles.join("; "),
                content: html_content,
                children: Vec::new(),
                svg_content: None,
            }
        }
        NodeKind::Path { commands } => {
            let svg = path_to_svg(commands, b);
            HtmlElement {
                tag: "div",
                css_class: class_name.clone(),
                inline_style: inline_styles.join("; "),
                content: String::new(),
                children: Vec::new(),
                svg_content: Some(svg),
            }
        }
        NodeKind::Group | NodeKind::Root | NodeKind::Generic | NodeKind::Icon { .. } => {
            HtmlElement {
                tag: "div",
                css_class: class_name.clone(),
                inline_style: inline_styles.join("; "),
                content: String::new(),
                children: Vec::new(),
                svg_content: None,
            }
        }
    };

    // Recurse into children
    for child_idx in graph.children(idx) {
        let mut child_elements = Vec::new();
        collect_html_elements(
            graph,
            child_idx,
            bounds,
            &mut child_elements,
            css_rules,
            id_counter,
        );
        element.children.extend(child_elements);
    }

    elements.push(element);
}

/// Build CSS animation rules for hover/press triggers.
fn build_animation_css(
    class_name: &str,
    animations: &[AnimKeyframe],
    _base_style: &Properties,
    css_rules: &mut Vec<String>,
) {
    for anim in animations {
        let pseudo_class = match anim.trigger {
            AnimTrigger::Hover => ":hover",
            AnimTrigger::Press => ":active",
            _ => continue, // Enter/Custom not supported as CSS yet
        };

        let duration_s = anim.duration_ms as f64 / 1000.0;
        let easing = match &anim.easing {
            Easing::Linear => "linear".to_string(),
            Easing::EaseIn => "ease-in".to_string(),
            Easing::EaseOut => "ease-out".to_string(),
            Easing::EaseInOut => "ease-in-out".to_string(),
            Easing::Spring => "cubic-bezier(0.175, 0.885, 0.32, 1.275)".to_string(),
            Easing::CubicBezier(a, b, c, d) => {
                format!("cubic-bezier({}, {}, {}, {})", a, b, c, d)
            }
        };

        let mut props = Vec::new();

        if let Some(ref fill) = anim.properties.fill {
            props.push(format!("background: {}", paint_to_css(fill)));
        }
        if let Some(op) = anim.properties.opacity {
            props.push(format!("opacity: {}", format_num(op)));
        }
        if let Some(scale) = anim.properties.scale {
            let mut transforms = vec![format!("scale({})", format_num(scale))];
            if let Some((tx, ty)) = anim.properties.translate {
                transforms.push(format!(
                    "translate({}px, {}px)",
                    format_num(tx),
                    format_num(ty)
                ));
            }
            if let Some(rot) = anim.properties.rotate {
                transforms.push(format!("rotate({}deg)", format_num(rot)));
            }
            props.push(format!("transform: {}", transforms.join(" ")));
        } else {
            let mut transforms = Vec::new();
            if let Some((tx, ty)) = anim.properties.translate {
                transforms.push(format!(
                    "translate({}px, {}px)",
                    format_num(tx),
                    format_num(ty)
                ));
            }
            if let Some(rot) = anim.properties.rotate {
                transforms.push(format!("rotate({}deg)", format_num(rot)));
            }
            if !transforms.is_empty() {
                props.push(format!("transform: {}", transforms.join(" ")));
            }
        }

        if !props.is_empty() {
            let mut rule = String::new();
            let _ = writeln!(rule, ".{}{} {{", class_name, pseudo_class);
            let _ = writeln!(
                rule,
                "  transition: all {}s {};",
                format_num_f64(duration_s),
                easing
            );
            for prop in &props {
                let _ = writeln!(rule, "  {};", prop);
            }
            rule.push('}');
            css_rules.push(rule);
        }
    }
}

/// Convert a Paint to a CSS color/gradient value.
fn paint_to_css(paint: &Paint) -> String {
    match paint {
        Paint::Solid(c) => color_to_css(c),
        Paint::LinearGradient { angle, stops } => {
            let mut parts = vec![format!("{}deg", angle)];
            for stop in stops {
                parts.push(format!(
                    "{} {}%",
                    color_to_css(&stop.color),
                    (stop.offset * 100.0) as u32
                ));
            }
            format!("linear-gradient({})", parts.join(", "))
        }
        Paint::RadialGradient { stops } => {
            let parts: Vec<String> = stops
                .iter()
                .map(|s| format!("{} {}%", color_to_css(&s.color), (s.offset * 100.0) as u32))
                .collect();
            format!("radial-gradient(circle, {})", parts.join(", "))
        }
    }
}

/// Convert a Color to a CSS rgba/hex string.
fn color_to_css(c: &Color) -> String {
    if (c.a - 1.0).abs() < 0.001 {
        c.to_hex()
    } else {
        format!(
            "rgba({}, {}, {}, {})",
            (c.r * 255.0).round() as u8,
            (c.g * 255.0).round() as u8,
            (c.b * 255.0).round() as u8,
            format_num(c.a),
        )
    }
}

/// Convert path commands to an inline SVG element.
fn path_to_svg(commands: &[PathCmd], b: &ResolvedBounds) -> String {
    let mut d = String::new();
    for cmd in commands {
        match cmd {
            PathCmd::MoveTo(x, y) => {
                let _ = write!(d, "M {} {} ", format_num(*x - b.x), format_num(*y - b.y));
            }
            PathCmd::LineTo(x, y) => {
                let _ = write!(d, "L {} {} ", format_num(*x - b.x), format_num(*y - b.y));
            }
            PathCmd::QuadTo(cx, cy, x, y) => {
                let _ = write!(
                    d,
                    "Q {} {} {} {} ",
                    format_num(*cx - b.x),
                    format_num(*cy - b.y),
                    format_num(*x - b.x),
                    format_num(*y - b.y)
                );
            }
            PathCmd::CubicTo(c1x, c1y, c2x, c2y, x, y) => {
                let _ = write!(
                    d,
                    "C {} {} {} {} {} {} ",
                    format_num(*c1x - b.x),
                    format_num(*c1y - b.y),
                    format_num(*c2x - b.x),
                    format_num(*c2y - b.y),
                    format_num(*x - b.x),
                    format_num(*y - b.y)
                );
            }
            PathCmd::Close => {
                d.push_str("Z ");
            }
        }
    }

    format!(
        r#"<svg width="{}" height="{}" viewBox="0 0 {} {}" xmlns="http://www.w3.org/2000/svg"><path d="{}" fill="none" stroke="currentColor" stroke-width="2"/></svg>"#,
        format_num(b.width),
        format_num(b.height),
        format_num(b.width),
        format_num(b.height),
        d.trim(),
    )
}

/// Build the complete HTML document from elements and CSS rules.
fn build_html_document(elements: &[HtmlElement], css_rules: &[String]) -> String {
    let mut html = String::with_capacity(4096);

    html.push_str("<!DOCTYPE html>\n");
    html.push_str("<html lang=\"en\">\n<head>\n");
    html.push_str("  <meta charset=\"UTF-8\">\n");
    html.push_str("  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    html.push_str("  <title>Fast Draft Export</title>\n");
    html.push_str("  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n");
    html.push_str("  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n");

    // Collect unique font families
    let mut fonts = Vec::new();
    collect_fonts_from_elements(elements, &mut fonts);
    fonts.sort();
    fonts.dedup();

    if !fonts.is_empty() {
        let font_params: Vec<String> = fonts
            .iter()
            .map(|f| format!("family={}", f.replace(' ', "+")))
            .collect();
        let _ = writeln!(
            html,
            "  <link href=\"https://fonts.googleapis.com/css2?{}&display=swap\" rel=\"stylesheet\">",
            font_params.join("&")
        );
    }

    html.push_str("  <style>\n");
    html.push_str("    * { margin: 0; padding: 0; box-sizing: border-box; }\n");
    html.push_str(
        "    body { min-height: 100vh; position: relative; font-family: 'Inter', sans-serif; }\n",
    );
    html.push_str("    .fd-canvas { position: relative; width: 100%; min-height: 100vh; }\n");

    // Write animation CSS rules
    for rule in css_rules {
        let _ = writeln!(html, "    {}", rule);
    }

    html.push_str("  </style>\n");
    html.push_str("</head>\n<body>\n");
    html.push_str("  <div class=\"fd-canvas\">\n");

    for element in elements {
        write_html_element(&mut html, element, 2);
    }

    html.push_str("  </div>\n");
    html.push_str("</body>\n</html>\n");
    html
}

/// Collect unique font families from elements recursively.
fn collect_fonts_from_elements(elements: &[HtmlElement], fonts: &mut Vec<String>) {
    for el in elements {
        // Extract font-family from inline style
        if let Some(start) = el.inline_style.find("font-family: '") {
            let rest = &el.inline_style[start + 14..];
            if let Some(end) = rest.find('\'') {
                let family = &rest[..end];
                fonts.push(family.to_string());
            }
        }
        collect_fonts_from_elements(&el.children, fonts);
    }
}

/// Write a single HTML element with indentation.
fn write_html_element(out: &mut String, el: &HtmlElement, indent: usize) {
    let pad = "    ".repeat(indent);

    if let Some(ref svg) = el.svg_content {
        let _ = writeln!(
            out,
            "{}<div class=\"{}\" style=\"{}\">",
            pad, el.css_class, el.inline_style
        );
        let _ = writeln!(out, "{}  {}", pad, svg);
        let _ = writeln!(out, "{}</div>", pad);
        return;
    }

    let has_children = !el.children.is_empty();
    let has_content = !el.content.is_empty();

    if !has_children && !has_content {
        let _ = writeln!(
            out,
            "{}<{} class=\"{}\" style=\"{}\"></{}>",
            pad, el.tag, el.css_class, el.inline_style, el.tag
        );
    } else if has_content && !has_children {
        let _ = writeln!(
            out,
            "{}<{} class=\"{}\" style=\"{}\">{}</{}>",
            pad, el.tag, el.css_class, el.inline_style, el.content, el.tag
        );
    } else {
        let _ = writeln!(
            out,
            "{}<{} class=\"{}\" style=\"{}\">",
            pad, el.tag, el.css_class, el.inline_style
        );
        if has_content {
            let _ = writeln!(out, "{}  {}", pad, el.content);
        }
        for child in &el.children {
            write_html_element(out, child, indent + 1);
        }
        let _ = writeln!(out, "{}</{}>", pad, el.tag);
    }
}

/// Format a float: strip trailing zeros, integers without decimal.
fn format_num(v: f32) -> String {
    if v == v.floor() && v.abs() < 1e9 {
        format!("{}", v as i64)
    } else {
        let s = format!("{:.2}", v);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

/// Format a f64 similarly.
fn format_num_f64(v: f64) -> String {
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
    fn export_html_rect() {
        let (graph, bounds) = parse_and_resolve("rect @box { w: 100 h: 60 fill: #FF0000 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<div"));
        assert!(html.contains("width: 100px"));
        assert!(html.contains("height: 60px"));
        assert!(html.contains("background: #FF0000"));
    }

    #[test]
    fn export_html_ellipse() {
        let (graph, bounds) = parse_and_resolve("ellipse @circle { w: 80 h: 80 fill: #00FF00 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("border-radius: 50%"));
        assert!(html.contains("background: #00FF00"));
    }

    #[test]
    fn export_html_text() {
        let (graph, bounds) = parse_and_resolve("text @label \"Hello World\" {}");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("<p"));
        assert!(html.contains("Hello World"));
    }

    #[test]
    fn export_html_text_with_font() {
        let (graph, bounds) =
            parse_and_resolve("text @title \"Dashboard\" { font: \"Inter\" bold 24 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("font-family: 'Inter'"));
        assert!(html.contains("font-size: 24px"));
        assert!(html.contains("font-weight: 700"));
        assert!(html.contains("Dashboard"));
    }

    #[test]
    fn export_html_selection() {
        let input = "rect @a { w: 100 h: 50 }\nrect @b { w: 200 h: 80 }";
        let (graph, bounds) = parse_and_resolve(input);
        let html = export_html(&graph, &bounds, &["a".to_string()]);

        // Should have only one div with width: 100px
        assert!(html.contains("width: 100px"));
        assert!(!html.contains("width: 200px"));
    }

    #[test]
    fn export_html_empty_graph() {
        let graph = SceneGraph::new();
        let bounds = HashMap::new();
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<div class=\"fd-canvas\">"));
    }

    #[test]
    fn export_html_corner_radius() {
        let (graph, bounds) = parse_and_resolve("rect @r { w: 100 h: 50 corner: 12 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("border-radius: 12px"));
    }

    #[test]
    fn export_html_opacity() {
        let (graph, bounds) = parse_and_resolve("rect @r { w: 100 h: 50 opacity: 0.5 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("opacity: 0.5"));
    }

    #[test]
    fn export_html_shadow() {
        let (graph, bounds) =
            parse_and_resolve("rect @r { w: 100 h: 50 shadow: (4,4,8,#00000040) }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("box-shadow:"));
    }

    #[test]
    fn export_html_stroke() {
        let (graph, bounds) = parse_and_resolve("rect @r { w: 100 h: 50 stroke: #333 2 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("border:"));
        assert!(html.contains("#333333"));
    }

    #[test]
    fn export_html_nested_frame() {
        let input = r#"
frame @container { w: 400 h: 300 fill: #F0F0F0
  rect @child { w: 100 h: 50 fill: #FF0000 }
}
"#;
        let (graph, bounds) = parse_and_resolve(input);
        let html = export_html(&graph, &bounds, &[]);

        // Parent div should contain child div
        assert!(html.contains("fd-canvas"));
        // Both elements should be present
        let div_count = html.matches("<div").count();
        assert!(
            div_count >= 3,
            "Expected at least 3 divs (canvas + frame + child), got {}",
            div_count
        );
    }

    #[test]
    fn export_html_hover_animation() {
        let input = r#"
rect @btn { w: 120 h: 40 fill: #6C5CE7
  when :hover {
    fill: #A29BFE
    ease: ease_out 200
  }
}
"#;
        let (graph, bounds) = parse_and_resolve(input);
        let html = export_html(&graph, &bounds, &[]);

        // Should have a :hover CSS rule
        assert!(html.contains(":hover"));
        assert!(html.contains("background:"));
        assert!(html.contains("transition:"));
    }

    #[test]
    fn export_html_google_fonts() {
        let (graph, bounds) = parse_and_resolve("text @t \"Hi\" { font: \"Roboto\" 16 }");
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("fonts.googleapis.com"));
        assert!(html.contains("Roboto"));
    }

    #[test]
    fn export_html_gradient() {
        let (graph, bounds) = parse_and_resolve(
            "rect @g { w: 200 h: 100 fill: linear(90deg, #FF0000 0, #0000FF 1) }",
        );
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.contains("linear-gradient"));
    }

    #[test]
    fn export_html_valid_structure() {
        let input = r#"
rect @card { w: 200 h: 150 fill: #3498DB corner: 12 }
ellipse @avatar { w: 60 h: 60 fill: #E74C3C }
text @title "Dashboard" { font: "Inter" bold 24 }
"#;
        let (graph, bounds) = parse_and_resolve(input);
        let html = export_html(&graph, &bounds, &[]);

        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("</html>"));
        assert!(html.contains("<head>"));
        assert!(html.contains("</head>"));
        assert!(html.contains("<body>"));
        assert!(html.contains("</body>"));
    }
}
