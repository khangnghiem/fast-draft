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
) {
    // Clear canvas
    ctx.set_fill_style_str(theme.bg);
    ctx.fill_rect(0.0, 0.0, canvas_width, canvas_height);

    // Draw grid dots
    draw_grid(ctx, canvas_width, canvas_height, theme);

    // Paint nodes recursively from root
    render_node(ctx, graph, graph.root, bounds, selected_ids, theme);

    // Draw edges between nodes
    draw_edges(ctx, graph, bounds);

    // Draw marquee selection rectangle (on top of everything)
    if let Some((rx, ry, rw, rh)) = marquee_rect {
        draw_marquee_rect(ctx, rx, ry, rw, rh);
    }
}

fn render_node(
    ctx: &CanvasRenderingContext2d,
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    selected_ids: &[String],
    theme: &CanvasTheme,
) {
    let node = &graph.graph[idx];
    let node_bounds = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let style = graph.resolve_style(node);
    let is_selected = selected_ids.iter().any(|sel| sel == node.id.as_str());

    match &node.kind {
        NodeKind::Root => {}
        NodeKind::Generic => {
            draw_generic_placeholder(ctx, node_bounds, node.id.as_str(), theme);
        }
        NodeKind::Rect { .. } => {
            draw_rect(ctx, node_bounds, &style, is_selected);
        }
        NodeKind::Ellipse { .. } => {
            draw_ellipse(ctx, node_bounds, &style, is_selected);
        }
        NodeKind::Text { content } => {
            draw_text(ctx, node_bounds, content, &style);
        }
        NodeKind::Group { .. } => {
            draw_group_bg(ctx, node_bounds, &style);
        }
        NodeKind::Path { .. } => {
            draw_path_placeholder(ctx, node_bounds, &style);
        }
    }

    // Paint children
    for child_idx in graph.children(idx) {
        render_node(ctx, graph, child_idx, bounds, selected_ids, theme);
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

    // Fill
    let fill_color = resolve_fill_color(style);
    ctx.set_fill_style_str(&fill_color);
    rounded_rect_path(ctx, x, y, w, h, radius);
    ctx.fill();

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

    let fill_color = resolve_fill_color(style);
    ctx.set_fill_style_str(&fill_color);
    ctx.begin_path();
    let _ = ctx.ellipse(cx, cy, rx, ry, 0.0, 0.0, std::f64::consts::TAU);
    ctx.fill();

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

fn draw_path_placeholder(ctx: &CanvasRenderingContext2d, b: &ResolvedBounds, style: &Style) {
    // Placeholder: draw a dashed rect outline
    let (x, y, w, h) = (b.x as f64, b.y as f64, b.width as f64, b.height as f64);
    ctx.save();
    apply_opacity(ctx, style);
    ctx.set_stroke_style_str(&resolve_fill_color(style));
    ctx.set_line_width(1.0);
    let _ = ctx.set_line_dash(&js_sys::Array::of2(
        &wasm_bindgen::JsValue::from_f64(4.0),
        &wasm_bindgen::JsValue::from_f64(4.0),
    ));
    ctx.stroke_rect(x, y, w, h);
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
    let handle_size = 6.0;
    let half = handle_size / 2.0;

    ctx.set_fill_style_str("#FFFFFF");
    ctx.set_stroke_style_str("#4FC3F7");
    ctx.set_line_width(1.5);

    // Corner handles
    let corners = [
        (x - half, y - half),
        (x + w - half, y - half),
        (x - half, y + h - half),
        (x + w - half, y + h - half),
    ];

    for (hx, hy) in corners {
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
        let resolved = graph.resolve_style_for_edge(edge);
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
