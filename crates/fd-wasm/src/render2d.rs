//! Canvas2D software renderer.
//!
//! Walks the resolved scene graph and draws to an HTML `<canvas>` via
//! `CanvasRenderingContext2d`. Used as MVP renderer before Vello/wgpu.

use fd_core::model::*;
use fd_core::{NodeIndex, ResolvedBounds, SceneGraph};
use std::collections::HashMap;
use web_sys::CanvasRenderingContext2d;

/// Render the entire scene graph to a Canvas2D context.
pub fn render_scene(
    ctx: &CanvasRenderingContext2d,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    canvas_width: f64,
    canvas_height: f64,
    selected_id: Option<&str>,
) {
    // Clear canvas
    ctx.set_fill_style_str("#1E1E2E");
    ctx.fill_rect(0.0, 0.0, canvas_width, canvas_height);

    // Draw grid dots
    draw_grid(ctx, canvas_width, canvas_height);

    // Paint nodes recursively from root
    render_node(ctx, graph, graph.root, bounds, selected_id);
}

fn render_node(
    ctx: &CanvasRenderingContext2d,
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    selected_id: Option<&str>,
) {
    let node = &graph.graph[idx];
    let node_bounds = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let style = graph.resolve_style(node);
    let is_selected = selected_id.is_some_and(|sel| sel == node.id.as_str());

    match &node.kind {
        NodeKind::Root => {}
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
        render_node(ctx, graph, child_idx, bounds, selected_id);
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

fn draw_grid(ctx: &CanvasRenderingContext2d, width: f64, height: f64) {
    ctx.set_fill_style_str("rgba(255, 255, 255, 0.05)");
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
