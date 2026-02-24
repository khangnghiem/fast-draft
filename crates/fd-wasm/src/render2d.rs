//! Canvas2D software renderer.
//!
//! Walks the resolved scene graph and draws to an HTML `<canvas>` via
//! `CanvasRenderingContext2d`. Used as MVP renderer before Vello/wgpu.

use fd_core::model::*;
use fd_core::{NodeIndex, ResolvedBounds, SceneGraph};
use std::collections::HashMap;
use web_sys::CanvasRenderingContext2d;

/// Theme-dependent colors for the canvas renderer.
pub struct CanvasTheme {
    pub bg: &'static str,
    pub grid: &'static str,
    pub badge_border: &'static str,
    pub placeholder_border: &'static str,
    pub placeholder_bg: &'static str,
    pub placeholder_text: &'static str,
}

impl CanvasTheme {
    /// Light theme — Apple-style warm white canvas.
    pub fn light() -> Self {
        Self {
            bg: "#F5F5F7",
            grid: "rgba(0, 0, 0, 0.05)",
            badge_border: "#F5F5F7",
            placeholder_border: "#86868B",
            placeholder_bg: "rgba(142, 142, 147, 0.06)",
            placeholder_text: "#86868B",
        }
    }

    /// Dark theme — macOS dark mode.
    pub fn dark() -> Self {
        Self {
            bg: "#1C1C1E",
            grid: "rgba(255, 255, 255, 0.04)",
            badge_border: "#1C1C1E",
            placeholder_border: "#636366",
            placeholder_bg: "rgba(99, 99, 102, 0.08)",
            placeholder_text: "#98989D",
        }
    }
}

/// Render the entire scene graph to a Canvas2D context.
#[allow(clippy::too_many_arguments)]
pub fn render_scene(
    ctx: &CanvasRenderingContext2d,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    canvas_width: f64,
    canvas_height: f64,
    selected_ids: &[String],
    theme: &CanvasTheme,
    marquee_rect: Option<(f32, f32, f32, f32)>,
    time_ms: f64,
    hovered_id: Option<&str>,
    pressed_id: Option<&str>,
    smart_guides: &[(f64, f64, f64, f64)],
) {
    // Clear canvas
    ctx.set_fill_style_str(theme.bg);
    ctx.fill_rect(0.0, 0.0, canvas_width, canvas_height);

    // Draw grid dots
    draw_grid(ctx, canvas_width, canvas_height, theme);

    // Paint nodes recursively from root
    render_node(
        ctx,
        graph,
        graph.root,
        bounds,
        selected_ids,
        theme,
        hovered_id,
        pressed_id,
    );

    // Draw edges between nodes
    draw_edges(ctx, graph, bounds, time_ms, hovered_id, pressed_id);

    // Draw smart guides (alignment lines)
    draw_smart_guides(ctx, smart_guides);

    // Draw marquee selection rectangle (on top of everything)
    if let Some((rx, ry, rw, rh)) = marquee_rect {
        draw_marquee_rect(ctx, rx, ry, rw, rh);
    }
}

#[allow(clippy::too_many_arguments)]
fn render_node(
    ctx: &CanvasRenderingContext2d,
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    selected_ids: &[String],
    theme: &CanvasTheme,
    hovered_id: Option<&str>,
    pressed_id: Option<&str>,
) {
    let node = &graph.graph[idx];
    let node_bounds = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let mut triggers = Vec::new();
    if Some(node.id.as_str()) == hovered_id {
        triggers.push(fd_core::model::AnimTrigger::Hover);
    }
    if Some(node.id.as_str()) == pressed_id {
        triggers.push(fd_core::model::AnimTrigger::Press);
    }
    let style = graph.resolve_style(node, &triggers);
    let is_selected = selected_ids.iter().any(|sel| sel == node.id.as_str());

    match &node.kind {
        NodeKind::Root => {}
        NodeKind::Generic => {
            draw_generic_placeholder(ctx, node_bounds, node.id.as_str(), theme);
        }
        NodeKind::Rect { .. } => {
            draw_rect(ctx, node_bounds, &style, is_selected);
            if let Some(ref label) = style.label {
                draw_shape_label(ctx, node_bounds, label, &style);
            }
        }
        NodeKind::Ellipse { .. } => {
            draw_ellipse(ctx, node_bounds, &style, is_selected);
            if let Some(ref label) = style.label {
                draw_shape_label(ctx, node_bounds, label, &style);
            }
        }
        NodeKind::Text { content } => {
            draw_text(ctx, node_bounds, content, &style);
        }
        NodeKind::Group { .. } => {
            draw_group_bg(ctx, node_bounds, &style);
        }
        NodeKind::Frame { .. } => {
            draw_rect(ctx, node_bounds, &style, is_selected);
            if let Some(ref label) = style.label {
                draw_shape_label(ctx, node_bounds, label, &style);
            }
        }
        NodeKind::Path { commands } => {
            draw_path(ctx, node_bounds, commands, &style, is_selected);
        }
    }

    // Paint children
    for child_idx in graph.children(idx) {
        render_node(
            ctx,
            graph,
            child_idx,
            bounds,
            selected_ids,
            theme,
            hovered_id,
            pressed_id,
        );
    }

    // Annotation badge (drawn after children so it's on top)
    if !node.annotations.is_empty() && !matches!(node.kind, NodeKind::Root) {
        draw_annotation_badge(ctx, node_bounds, &node.annotations, theme);
    }

    // Selection overlay (drawn after children so it's on top)
    if is_selected {
        draw_selection_handles(ctx, node_bounds);
    }
}

// ─── Drawing primitives ─────────────────────────────────────────────────

fn draw_rect(ctx: &CanvasRenderingContext2d, b: &ResolvedBounds, style: &Style, is_selected: bool) {
    let (x, y, w, h) = (b.x as f64, b.y as f64, b.width as f64, b.height as f64);
    let radius = style.corner_radius.unwrap_or(0.0) as f64;

    ctx.save();
    apply_opacity(ctx, style);
    apply_shadow(ctx, style);

    // Fill
    rounded_rect_path(ctx, x, y, w, h, radius);
    apply_fill(ctx, style, x, y, w, h);
    ctx.fill();
    clear_shadow(ctx);

    // Stroke
    if let Some(ref stroke) = style.stroke {
        let stroke_color = resolve_paint_color(&stroke.paint);
        ctx.set_stroke_style_str(&stroke_color);
        ctx.set_line_width(stroke.width as f64);
        rounded_rect_path(ctx, x, y, w, h, radius);
        ctx.stroke();
    }

    // Selection highlight
    if is_selected {
        ctx.set_stroke_style_str("#4FC3F7");
        ctx.set_line_width(2.0);
        rounded_rect_path(ctx, x - 1.0, y - 1.0, w + 2.0, h + 2.0, radius);
        ctx.stroke();
    }

    ctx.restore();
}

fn draw_ellipse(
    ctx: &CanvasRenderingContext2d,
    b: &ResolvedBounds,
    style: &Style,
    is_selected: bool,
) {
    let cx = b.x as f64 + b.width as f64 / 2.0;
    let cy = b.y as f64 + b.height as f64 / 2.0;
    let rx = b.width as f64 / 2.0;
    let ry = b.height as f64 / 2.0;

    ctx.save();
    apply_opacity(ctx, style);
    apply_shadow(ctx, style);

    ctx.begin_path();
    let _ = ctx.ellipse(cx, cy, rx, ry, 0.0, 0.0, std::f64::consts::TAU);
    apply_fill(ctx, style, cx - rx, cy - ry, rx * 2.0, ry * 2.0);
    ctx.fill();
    clear_shadow(ctx);

    if let Some(ref stroke) = style.stroke {
        let stroke_color = resolve_paint_color(&stroke.paint);
        ctx.set_stroke_style_str(&stroke_color);
        ctx.set_line_width(stroke.width as f64);
        ctx.stroke();
    }

    if is_selected {
        ctx.set_stroke_style_str("#4FC3F7");
        ctx.set_line_width(2.0);
        ctx.begin_path();
        let _ = ctx.ellipse(cx, cy, rx + 1.0, ry + 1.0, 0.0, 0.0, std::f64::consts::TAU);
        ctx.stroke();
    }

    ctx.restore();
}

fn draw_text(ctx: &CanvasRenderingContext2d, b: &ResolvedBounds, content: &str, style: &Style) {
    ctx.save();
    apply_opacity(ctx, style);

    let font_spec = style.font.as_ref();
    let family = font_spec.map_or("Inter, sans-serif", |f| f.family.as_str());
    let size = font_spec.map_or(14.0, |f| f.size);
    let weight = font_spec.map_or(400, |f| f.weight);

    ctx.set_font(&format!("{weight} {size}px {family}"));

    let fill_color = resolve_fill_color(style);
    ctx.set_fill_style_str(&fill_color);
    ctx.set_text_baseline("top");

    let _ = ctx.fill_text(content, b.x as f64, b.y as f64 + 2.0);

    ctx.restore();
}

/// Draw a label centered inside a shape (rect or ellipse).
fn draw_shape_label(
    ctx: &CanvasRenderingContext2d,
    b: &ResolvedBounds,
    label: &str,
    style: &Style,
) {
    ctx.save();
    apply_opacity(ctx, style);

    let font_spec = style.font.as_ref();
    let family = font_spec.map_or("Inter, sans-serif", |f| f.family.as_str());
    let size = font_spec.map_or(13.0, |f| f.size);
    let weight = font_spec.map_or(500, |f| f.weight);

    ctx.set_font(&format!("{weight} {size}px {family}"));

    // Use contrasting color: if fill is dark use white, else use a dark color
    let text_color = pick_label_color(style);
    ctx.set_fill_style_str(&text_color);
    ctx.set_text_align("center");
    ctx.set_text_baseline("middle");

    let cx = b.x as f64 + b.width as f64 / 2.0;
    let cy = b.y as f64 + b.height as f64 / 2.0;
    let _ = ctx.fill_text(label, cx, cy);

    ctx.restore();
}

/// Pick a readable label color based on the shape's fill luminance.
fn pick_label_color(style: &Style) -> String {
    match &style.fill {
        Some(Paint::Solid(c)) => {
            // Perceived luminance (sRGB)
            let lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
            if lum > 0.5 {
                "#1C1C1E".to_string()
            } else {
                "#FFFFFF".to_string()
            }
        }
        _ => "#1C1C1E".to_string(),
    }
}

fn draw_group_bg(ctx: &CanvasRenderingContext2d, b: &ResolvedBounds, style: &Style) {
    if style.fill.is_none() && style.stroke.is_none() {
        return;
    }

    let (x, y, w, h) = (b.x as f64, b.y as f64, b.width as f64, b.height as f64);
    let radius = style.corner_radius.unwrap_or(0.0) as f64;

    ctx.save();
    apply_opacity(ctx, style);

    if style.fill.is_some() {
        let fill_color = resolve_fill_color(style);
        ctx.set_fill_style_str(&fill_color);
        rounded_rect_path(ctx, x, y, w, h, radius);
        ctx.fill();
    }

    if let Some(ref stroke) = style.stroke {
        let stroke_color = resolve_paint_color(&stroke.paint);
        ctx.set_stroke_style_str(&stroke_color);
        ctx.set_line_width(stroke.width as f64);
        rounded_rect_path(ctx, x, y, w, h, radius);
        ctx.stroke();
    }

    ctx.restore();
}

/// Draw a freehand path from its PathCmd commands.
fn draw_path(
    ctx: &CanvasRenderingContext2d,
    b: &ResolvedBounds,
    commands: &[PathCmd],
    style: &Style,
    is_selected: bool,
) {
    if commands.is_empty() {
        return;
    }

    let dx = b.x as f64;
    let dy = b.y as f64;
    let (w, h) = (b.width as f64, b.height as f64);

    ctx.save();
    apply_opacity(ctx, style);
    apply_shadow(ctx, style);

    ctx.begin_path();
    for cmd in commands {
        match *cmd {
            PathCmd::MoveTo(x, y) => ctx.move_to(dx + x as f64, dy + y as f64),
            PathCmd::LineTo(x, y) => ctx.line_to(dx + x as f64, dy + y as f64),
            PathCmd::QuadTo(cx, cy, ex, ey) => ctx.quadratic_curve_to(
                dx + cx as f64,
                dy + cy as f64,
                dx + ex as f64,
                dy + ey as f64,
            ),
            PathCmd::CubicTo(c1x, c1y, c2x, c2y, ex, ey) => ctx.bezier_curve_to(
                dx + c1x as f64,
                dy + c1y as f64,
                dx + c2x as f64,
                dy + c2y as f64,
                dx + ex as f64,
                dy + ey as f64,
            ),
            PathCmd::Close => ctx.close_path(),
        }
    }

    // Fill
    if style.fill.is_some() {
        apply_fill(ctx, style, dx, dy, w, h);
        ctx.fill();
    }
    clear_shadow(ctx);

    // Stroke
    let stroke_color = style
        .stroke
        .as_ref()
        .map(|s| resolve_paint_color(&s.paint))
        .unwrap_or_else(|| "#5E5CE6".to_string());
    let stroke_width = style.stroke.as_ref().map_or(1.5, |s| s.width as f64);
    ctx.set_stroke_style_str(&stroke_color);
    ctx.set_line_width(stroke_width);
    ctx.stroke();

    if is_selected {
        ctx.set_stroke_style_str("#4FC3F7");
        ctx.set_line_width(2.0);
        ctx.stroke();
    }

    ctx.restore();
}

/// Draw a generic placeholder node — dashed border with @id label.
fn draw_generic_placeholder(
    ctx: &CanvasRenderingContext2d,
    b: &ResolvedBounds,
    id: &str,
    theme: &CanvasTheme,
) {
    let (x, y, w, h) = (b.x as f64, b.y as f64, b.width as f64, b.height as f64);
    ctx.save();

    // Dashed border
    ctx.set_stroke_style_str(theme.placeholder_border);
    ctx.set_line_width(1.0);
    let _ = ctx.set_line_dash(&js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_f64(4.0),
        &wasm_bindgen::JsValue::from_f64(4.0),
    ));
    rounded_rect_path(ctx, x, y, w, h, 6.0);
    ctx.stroke();

    // Background fill (subtle)
    ctx.set_fill_style_str(theme.placeholder_bg);
    ctx.fill();

    // @id label centered
    ctx.set_font("11px Inter, system-ui, sans-serif");
    ctx.set_fill_style_str(theme.placeholder_text);
    ctx.set_text_align("center");
    ctx.set_text_baseline("middle");
    let label = format!("@{}", id);
    let _ = ctx.fill_text(&label, x + w / 2.0, y + h / 2.0);

    ctx.restore();
}

fn draw_selection_handles(ctx: &CanvasRenderingContext2d, b: &ResolvedBounds) {
    let (x, y, w, h) = (b.x as f64, b.y as f64, b.width as f64, b.height as f64);
    let handle_size = 7.0;
    let half = handle_size / 2.0;

    ctx.set_fill_style_str("#FFFFFF");
    ctx.set_stroke_style_str("#4FC3F7");
    ctx.set_line_width(1.5);

    // 8-point handles: corners + midpoints (Figma/Sketch style)
    let handles = [
        // Corners
        (x - half, y - half),         // TopLeft
        (x + w - half, y - half),     // TopRight
        (x - half, y + h - half),     // BottomLeft
        (x + w - half, y + h - half), // BottomRight
        // Midpoints
        (x + w / 2.0 - half, y - half),     // TopCenter
        (x + w / 2.0 - half, y + h - half), // BottomCenter
        (x - half, y + h / 2.0 - half),     // MiddleLeft
        (x + w - half, y + h / 2.0 - half), // MiddleRight
    ];

    for (hx, hy) in handles {
        ctx.fill_rect(hx, hy, handle_size, handle_size);
        ctx.stroke_rect(hx, hy, handle_size, handle_size);
    }
}

fn draw_grid(ctx: &CanvasRenderingContext2d, width: f64, height: f64, theme: &CanvasTheme) {
    ctx.set_fill_style_str(theme.grid);
    let spacing = 20.0;
    let mut x = 0.0;
    while x < width {
        let mut y = 0.0;
        while y < height {
            ctx.fill_rect(x, y, 1.0, 1.0);
            y += spacing;
        }
        x += spacing;
    }
}

/// Draw the marquee (rubber-band) selection rectangle.
fn draw_marquee_rect(ctx: &CanvasRenderingContext2d, x: f32, y: f32, w: f32, h: f32) {
    let (x, y, w, h) = (x as f64, y as f64, w as f64, h as f64);
    if w < 1.0 && h < 1.0 {
        return;
    }

    ctx.save();

    // Semi-transparent blue fill
    ctx.set_fill_style_str("rgba(79, 195, 247, 0.08)");
    ctx.fill_rect(x, y, w, h);

    // Dashed blue border
    ctx.set_stroke_style_str("#4FC3F7");
    ctx.set_line_width(1.0);
    let _ = ctx.set_line_dash(&js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_f64(4.0),
        &wasm_bindgen::JsValue::from_f64(4.0),
    ));
    ctx.stroke_rect(x, y, w, h);

    ctx.restore();
}

/// Draw smart alignment guide lines (Figma/Sketch snap guides).
fn draw_smart_guides(ctx: &CanvasRenderingContext2d, guides: &[(f64, f64, f64, f64)]) {
    if guides.is_empty() {
        return;
    }
    ctx.save();
    ctx.set_stroke_style_str("#FF6B8A"); // Figma-style magenta-pink
    ctx.set_line_width(0.5);
    let _ = ctx.set_line_dash(&js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_f64(4.0),
        &wasm_bindgen::JsValue::from_f64(3.0),
    ));

    for &(x1, y1, x2, y2) in guides {
        ctx.begin_path();
        ctx.move_to(x1, y1);
        ctx.line_to(x2, y2);
        ctx.stroke();
    }

    ctx.restore();
}

// ─── Annotation badge ────────────────────────────────────────────────────

/// Draw a colored dot at the top-right of annotated nodes.
///
/// Color encodes the first status found:
///   - draft → red (#EF4444)
///   - in_progress → yellow (#F59E0B)
///   - done → green (#10B981)
///   - no status → gray (#6B7280)
fn draw_annotation_badge(
    ctx: &CanvasRenderingContext2d,
    b: &ResolvedBounds,
    annotations: &[Annotation],
    theme: &CanvasTheme,
) {
    let count = annotations.len();
    let radius = 5.0;
    let cx = b.x as f64 + b.width as f64 + 2.0;
    let cy = b.y as f64 - 2.0;

    // Determine color from first Status annotation
    let color = annotations
        .iter()
        .find_map(|a| match a {
            Annotation::Status(s) => Some(s.as_str()),
            _ => None,
        })
        .map(|s| match s {
            "draft" => "#EF4444",
            "in_progress" => "#F59E0B",
            "done" => "#10B981",
            _ => "#6B7280",
        })
        .unwrap_or("#6B7280");

    ctx.save();

    // Draw dot
    ctx.set_fill_style_str(color);
    ctx.begin_path();
    let _ = ctx.arc(cx, cy, radius, 0.0, std::f64::consts::TAU);
    ctx.fill();

    // Border matches canvas background for visibility
    ctx.set_stroke_style_str(theme.badge_border);
    ctx.set_line_width(1.5);
    ctx.stroke();

    // Count label if > 1
    if count > 1 {
        ctx.set_font("bold 8px Inter, sans-serif");
        ctx.set_fill_style_str("#FFFFFF");
        ctx.set_text_baseline("middle");
        ctx.set_text_align("center");
        let _ = ctx.fill_text(&count.to_string(), cx, cy);
    }

    ctx.restore();
}

// ─── Edge rendering ─────────────────────────────────────────────────────────

fn draw_edges(
    ctx: &CanvasRenderingContext2d,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    time_ms: f64,
    hovered_id: Option<&str>,
    pressed_id: Option<&str>,
) {
    use fd_core::model::{ArrowKind, CurveKind};

    for edge in &graph.edges {
        let from_idx = match graph.index_of(edge.from) {
            Some(i) => i,
            None => continue,
        };
        let to_idx = match graph.index_of(edge.to) {
            Some(i) => i,
            None => continue,
        };
        let from_b = match bounds.get(&from_idx) {
            Some(b) => b,
            None => continue,
        };
        let to_b = match bounds.get(&to_idx) {
            Some(b) => b,
            None => continue,
        };

        let (x1, y1) = from_b.center();
        let (x2, y2) = to_b.center();

        // Resolve stroke
        let mut triggers = Vec::new();
        if Some(edge.id.as_str()) == hovered_id {
            triggers.push(fd_core::model::AnimTrigger::Hover);
        }
        if Some(edge.id.as_str()) == pressed_id {
            triggers.push(fd_core::model::AnimTrigger::Press);
        }
        let resolved = graph.resolve_style_for_edge(edge, &triggers);
        let (stroke_color, stroke_width) = if let Some(ref stroke) = resolved.stroke {
            (resolve_paint_color(&stroke.paint), stroke.width as f64)
        } else {
            ("#6B7080".to_string(), 1.5)
        };

        ctx.save();
        apply_opacity(ctx, &resolved);
        ctx.set_stroke_style_str(&stroke_color);
        ctx.set_line_width(stroke_width);

        ctx.begin_path();
        match edge.curve {
            CurveKind::Straight => {
                ctx.move_to(x1 as f64, y1 as f64);
                ctx.line_to(x2 as f64, y2 as f64);
            }
            CurveKind::Smooth => {
                let mx = ((x1 + x2) / 2.0) as f64;
                let my = ((y1 + y2) / 2.0) as f64;
                let dx = (x2 - x1).abs();
                let dy = (y2 - y1).abs();
                let offset = (dx.max(dy) * 0.3) as f64;
                ctx.move_to(x1 as f64, y1 as f64);
                ctx.quadratic_curve_to(mx, my - offset, x2 as f64, y2 as f64);
            }
            CurveKind::Step => {
                let mx = ((x1 + x2) / 2.0) as f64;
                ctx.move_to(x1 as f64, y1 as f64);
                ctx.line_to(mx, y1 as f64);
                ctx.line_to(mx, y2 as f64);
                ctx.line_to(x2 as f64, y2 as f64);
            }
        }
        ctx.stroke();

        // Arrowheads
        if matches!(edge.arrow, ArrowKind::End | ArrowKind::Both) {
            draw_arrowhead(ctx, x1, y1, x2, y2, &stroke_color, stroke_width);
        }
        if matches!(edge.arrow, ArrowKind::Start | ArrowKind::Both) {
            draw_arrowhead(ctx, x2, y2, x1, y1, &stroke_color, stroke_width);
        }

        // Flow animation (pulse dot or marching dashes)
        if let Some(ref flow) = edge.flow {
            draw_flow_animation(ctx, x1, y1, x2, y2, flow, &stroke_color, time_ms);
        }

        // Label at midpoint
        if let Some(ref label) = edge.label {
            let mx = ((x1 + x2) / 2.0) as f64;
            let my = ((y1 + y2) / 2.0) as f64;
            ctx.set_font("11px Inter, system-ui, sans-serif");
            ctx.set_fill_style_str(&stroke_color);
            ctx.set_text_align("center");
            ctx.set_text_baseline("bottom");
            let _ = ctx.fill_text(label, mx, my - 6.0);
        }

        ctx.restore();
    }
}

/// Draw a flow animation (pulse dot or marching dashes) along a straight edge segment.
///
/// `phase` ∈ [0, 1) driven by `time_ms / duration_ms mod 1`.
#[allow(clippy::too_many_arguments)]
fn draw_flow_animation(
    ctx: &CanvasRenderingContext2d,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    flow: &fd_core::model::FlowAnim,
    color: &str,
    time_ms: f64,
) {
    use fd_core::model::FlowKind;

    let dur = flow.duration_ms.max(1) as f64;
    let phase = (time_ms % dur) / dur; // 0.0 → 1.0 per cycle

    let x1d = x1 as f64;
    let y1d = y1 as f64;
    let x2d = x2 as f64;
    let y2d = y2 as f64;

    match flow.kind {
        FlowKind::Pulse => {
            // A single dot travelling from source to target
            let px = x1d + (x2d - x1d) * phase;
            let py = y1d + (y2d - y1d) * phase;
            ctx.save();
            ctx.begin_path();
            ctx.set_fill_style_str(color);
            ctx.arc(px, py, 4.5, 0.0, std::f64::consts::TAU)
                .unwrap_or(());
            ctx.fill();
            ctx.restore();
        }
        FlowKind::Dash => {
            // Marching dashes: offset the dash pattern by `phase * pattern_len`
            let dash_len = 12.0_f64;
            let gap_len = 6.0_f64;
            let pattern_len = dash_len + gap_len;
            let offset = phase * pattern_len;

            ctx.save();
            ctx.set_stroke_style_str(color);
            ctx.set_line_width(2.5);
            let arr = js_sys::Array::of2(
                &wasm_bindgen::JsValue::from_f64(dash_len),
                &wasm_bindgen::JsValue::from_f64(gap_len),
            );
            let _ = ctx.set_line_dash(&arr);
            ctx.set_line_dash_offset(-offset);
            ctx.begin_path();
            ctx.move_to(x1d, y1d);
            ctx.line_to(x2d, y2d);
            ctx.stroke();
            // Reset dash
            let _ = ctx.set_line_dash(&js_sys::Array::new());
            ctx.set_line_dash_offset(0.0);
            ctx.restore();
        }
    }
}

fn draw_arrowhead(
    ctx: &CanvasRenderingContext2d,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    color: &str,
    line_width: f64,
) {
    let angle = ((y2 - y1) as f64).atan2((x2 - x1) as f64);
    let size = 8.0 + line_width * 1.5;
    let x2d = x2 as f64;
    let y2d = y2 as f64;

    ctx.save();
    ctx.set_fill_style_str(color);
    ctx.begin_path();
    ctx.move_to(x2d, y2d);
    ctx.line_to(
        x2d - size * (angle - 0.4).cos(),
        y2d - size * (angle - 0.4).sin(),
    );
    ctx.line_to(
        x2d - size * (angle + 0.4).cos(),
        y2d - size * (angle + 0.4).sin(),
    );
    ctx.close_path();
    ctx.fill();
    ctx.restore();
}

// ─── Helpers ─────────────────────────────────────────────────────────────

fn rounded_rect_path(ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64, h: f64, r: f64) {
    let r = r.min(w / 2.0).min(h / 2.0);
    ctx.begin_path();
    ctx.move_to(x + r, y);
    ctx.line_to(x + w - r, y);
    ctx.arc_to(x + w, y, x + w, y + r, r).unwrap_or(());
    ctx.line_to(x + w, y + h - r);
    ctx.arc_to(x + w, y + h, x + w - r, y + h, r).unwrap_or(());
    ctx.line_to(x + r, y + h);
    ctx.arc_to(x, y + h, x, y + h - r, r).unwrap_or(());
    ctx.line_to(x, y + r);
    ctx.arc_to(x, y, x + r, y, r).unwrap_or(());
    ctx.close_path();
}

/// Set the fill style — creates a CanvasGradient for gradient paints.
fn apply_fill(ctx: &CanvasRenderingContext2d, style: &Style, x: f64, y: f64, w: f64, h: f64) {
    match &style.fill {
        Some(Paint::LinearGradient { angle, stops }) => {
            let rad = (*angle as f64).to_radians();
            let (sin_a, cos_a) = (rad.sin(), rad.cos());
            let cx = x + w / 2.0;
            let cy = y + h / 2.0;
            let len = (w * cos_a.abs() + h * sin_a.abs()) / 2.0;
            let (x0, y0) = (cx - len * cos_a, cy - len * sin_a);
            let (x1, y1) = (cx + len * cos_a, cy + len * sin_a);
            let grad = ctx.create_linear_gradient(x0, y0, x1, y1);
            for stop in stops {
                let _ = grad.add_color_stop(stop.offset, &stop.color.to_hex());
            }
            ctx.set_fill_style_canvas_gradient(&grad);
        }
        Some(Paint::RadialGradient { stops }) => {
            let cx = x + w / 2.0;
            let cy = y + h / 2.0;
            let r = w.min(h) / 2.0;
            match ctx.create_radial_gradient(cx, cy, 0.0, cx, cy, r) {
                Ok(grad) => {
                    for stop in stops {
                        let _ = grad.add_color_stop(stop.offset, &stop.color.to_hex());
                    }
                    ctx.set_fill_style_canvas_gradient(&grad);
                }
                Err(_) => {
                    let fallback = stops
                        .first()
                        .map(|s| s.color.to_hex())
                        .unwrap_or_else(|| "#CCC".to_string());
                    ctx.set_fill_style_str(&fallback);
                }
            }
        }
        Some(Paint::Solid(c)) => ctx.set_fill_style_str(&c.to_hex()),
        None => ctx.set_fill_style_str("#CCCCCC"),
    }
}

/// Apply CSS drop-shadow from Style.shadow.
fn apply_shadow(ctx: &CanvasRenderingContext2d, style: &Style) {
    if let Some(ref shadow) = style.shadow {
        ctx.set_shadow_blur(shadow.blur as f64);
        ctx.set_shadow_offset_x(shadow.offset_x as f64);
        ctx.set_shadow_offset_y(shadow.offset_y as f64);
        ctx.set_shadow_color(&shadow.color.to_hex());
    }
}

/// Clear shadow after fill so stroke doesn't inherit it.
fn clear_shadow(ctx: &CanvasRenderingContext2d) {
    ctx.set_shadow_blur(0.0);
    ctx.set_shadow_offset_x(0.0);
    ctx.set_shadow_offset_y(0.0);
    ctx.set_shadow_color("transparent");
}

fn resolve_fill_color(style: &Style) -> String {
    match &style.fill {
        Some(paint) => resolve_paint_color(paint),
        None => "#CCCCCC".to_string(),
    }
}

fn resolve_paint_color(paint: &Paint) -> String {
    match paint {
        Paint::Solid(c) => c.to_hex(),
        Paint::LinearGradient { stops, .. } | Paint::RadialGradient { stops } => {
            // Fallback: use first stop color
            stops
                .first()
                .map(|s| s.color.to_hex())
                .unwrap_or_else(|| "#CCCCCC".to_string())
        }
    }
}

fn apply_opacity(ctx: &CanvasRenderingContext2d, style: &Style) {
    if let Some(opacity) = style.opacity {
        ctx.set_global_alpha(opacity as f64);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fd_core::model::{Color, GradientStop, Paint, Style};

    // ─── CanvasTheme ─────────────────────────────────────────────────────

    #[test]
    fn light_theme_fields_non_empty() {
        let t = CanvasTheme::light();
        assert!(!t.bg.is_empty());
        assert!(!t.grid.is_empty());
        assert!(!t.badge_border.is_empty());
        assert!(!t.placeholder_border.is_empty());
        assert!(!t.placeholder_bg.is_empty());
        assert!(!t.placeholder_text.is_empty());
    }

    #[test]
    fn dark_theme_fields_non_empty() {
        let t = CanvasTheme::dark();
        assert!(!t.bg.is_empty());
        assert!(!t.grid.is_empty());
        assert!(!t.badge_border.is_empty());
    }

    #[test]
    fn light_dark_themes_differ() {
        let l = CanvasTheme::light();
        let d = CanvasTheme::dark();
        assert_ne!(l.bg, d.bg, "light and dark bg should differ");
    }

    // ─── pick_label_color ────────────────────────────────────────────────

    #[test]
    fn label_color_dark_fill_returns_white() {
        let style = Style {
            fill: Some(Paint::Solid(Color {
                r: 0.0,
                g: 0.0,
                b: 0.0,
                a: 1.0,
            })),
            ..Style::default()
        };
        assert_eq!(pick_label_color(&style), "#FFFFFF");
    }

    #[test]
    fn label_color_light_fill_returns_dark() {
        let style = Style {
            fill: Some(Paint::Solid(Color {
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: 1.0,
            })),
            ..Style::default()
        };
        assert_eq!(pick_label_color(&style), "#1C1C1E");
    }

    #[test]
    fn label_color_no_fill_returns_dark() {
        let style = Style::default();
        assert_eq!(pick_label_color(&style), "#1C1C1E");
    }

    #[test]
    fn label_color_gradient_fill_returns_dark() {
        let style = Style {
            fill: Some(Paint::LinearGradient {
                angle: 90.0,
                stops: vec![],
            }),
            ..Style::default()
        };
        // Gradient doesn't match Solid branch → falls through to default
        assert_eq!(pick_label_color(&style), "#1C1C1E");
    }

    // ─── resolve_fill_color ──────────────────────────────────────────────

    #[test]
    fn fill_color_solid() {
        let style = Style {
            fill: Some(Paint::Solid(Color {
                r: 1.0,
                g: 0.0,
                b: 0.0,
                a: 1.0,
            })),
            ..Style::default()
        };
        assert_eq!(resolve_fill_color(&style), "#FF0000");
    }

    #[test]
    fn fill_color_none_returns_default() {
        let style = Style::default();
        assert_eq!(resolve_fill_color(&style), "#CCCCCC");
    }

    #[test]
    fn fill_color_gradient_uses_first_stop() {
        let style = Style {
            fill: Some(Paint::LinearGradient {
                angle: 0.0,
                stops: vec![GradientStop {
                    offset: 0.0,
                    color: Color {
                        r: 0.0,
                        g: 1.0,
                        b: 0.0,
                        a: 1.0,
                    },
                }],
            }),
            ..Style::default()
        };
        assert_eq!(resolve_fill_color(&style), "#00FF00");
    }

    // ─── resolve_paint_color ─────────────────────────────────────────────

    #[test]
    fn paint_color_solid_hex() {
        let paint = Paint::Solid(Color {
            r: 0.0,
            g: 0.0,
            b: 1.0,
            a: 1.0,
        });
        assert_eq!(resolve_paint_color(&paint), "#0000FF");
    }

    #[test]
    fn paint_color_linear_gradient_fallback() {
        let paint = Paint::LinearGradient {
            angle: 45.0,
            stops: vec![
                GradientStop {
                    offset: 0.0,
                    color: Color {
                        r: 1.0,
                        g: 0.5,
                        b: 0.0,
                        a: 1.0,
                    },
                },
                GradientStop {
                    offset: 1.0,
                    color: Color {
                        r: 0.0,
                        g: 0.0,
                        b: 1.0,
                        a: 1.0,
                    },
                },
            ],
        };
        // Should return the first stop color
        assert_eq!(resolve_paint_color(&paint), "#FF8000");
    }

    #[test]
    fn paint_color_radial_gradient_fallback() {
        let paint = Paint::RadialGradient {
            stops: vec![GradientStop {
                offset: 0.0,
                color: Color {
                    r: 0.0,
                    g: 1.0,
                    b: 1.0,
                    a: 1.0,
                },
            }],
        };
        assert_eq!(resolve_paint_color(&paint), "#00FFFF");
    }

    #[test]
    fn paint_color_empty_gradient_returns_default() {
        let paint = Paint::LinearGradient {
            angle: 0.0,
            stops: vec![],
        };
        assert_eq!(resolve_paint_color(&paint), "#CCCCCC");
    }
}
