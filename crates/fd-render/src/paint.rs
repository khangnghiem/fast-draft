//! Scene graph → Vello drawing commands.
//!
//! Walks the resolved scene graph and emits Vello paint operations:
//! fills, strokes, paths, text glyphs, gradients.

use fd_core::NodeIndex;
use fd_core::ResolvedBounds;
use fd_core::SceneGraph;
use fd_core::model::{NodeKind, Paint, PathCmd, StrokeCap, StrokeJoin, Style};
use kurbo::{
    Affine, BezPath, Cap, Ellipse as KurboEllipse, Join, Point, Rect, RoundedRect,
    Stroke as KurboStroke,
};
use peniko::{Color, Fill};
use std::collections::HashMap;
use vello::Scene;

/// Paint the entire scene graph to a Vello scene.
///
/// Call once per frame with a freshly-cleared `Scene`.
/// The caller presents the scene via wgpu.
pub fn paint_scene(
    scene: &mut Scene,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
) {
    paint_node(scene, graph, graph.root, bounds);
}

fn paint_node(
    scene: &mut Scene,
    graph: &SceneGraph,
    idx: fd_core::NodeIndex,
    bounds: &HashMap<fd_core::NodeIndex, ResolvedBounds>,
) {
    let node = &graph.graph[idx];
    let nb = match bounds.get(&idx) {
        Some(b) => b,
        None => return,
    };

    let style = graph.resolve_style(node, &[]);

    match &node.kind {
        NodeKind::Root | NodeKind::Generic => {}

        NodeKind::Rect { .. } => paint_rect(scene, nb, &style),

        NodeKind::Ellipse { rx, ry } => paint_ellipse(scene, nb, *rx, *ry, &style),

        NodeKind::Text { content } => {
            log::trace!(
                "TEXT @{} {:?} at ({}, {})",
                node.id.as_str(),
                content,
                nb.x,
                nb.y
            );
            // Full text shaping requires a font context; deferred to font milestone.
        }

        NodeKind::Path { commands } => paint_path(scene, commands, nb, &style),

        NodeKind::Group { .. } => {
            if style.fill.is_some() {
                paint_rect(scene, nb, &style);
            }
        }
    }

    for child_idx in graph.children(idx) {
        paint_node(scene, graph, child_idx, bounds);
    }
}

// ─── Shape painters ──────────────────────────────────────────────────────────

fn paint_rect(scene: &mut Scene, nb: &ResolvedBounds, style: &Style) {
    let kurbo_rect = Rect::new(
        nb.x as f64,
        nb.y as f64,
        (nb.x + nb.width) as f64,
        (nb.y + nb.height) as f64,
    );
    let shape: RoundedRect = kurbo_rect.to_rounded_rect(style.corner_radius.unwrap_or(0.0) as f64);
    fill_shape(scene, &shape, style);
    stroke_shape(scene, &shape, style);
}

fn paint_ellipse(scene: &mut Scene, nb: &ResolvedBounds, rx: f32, ry: f32, style: &Style) {
    let center = Point::new((nb.x + rx) as f64, (nb.y + ry) as f64);
    let shape = KurboEllipse::new(center, (rx as f64, ry as f64), 0.0);
    fill_shape(scene, &shape, style);
    stroke_shape(scene, &shape, style);
}

fn paint_path(scene: &mut Scene, commands: &[PathCmd], nb: &ResolvedBounds, style: &Style) {
    if commands.is_empty() {
        return;
    }
    let dx = nb.x as f64;
    let dy = nb.y as f64;
    let mut bez = BezPath::new();

    for cmd in commands {
        match *cmd {
            PathCmd::MoveTo(x, y) => bez.move_to((dx + x as f64, dy + y as f64)),
            PathCmd::LineTo(x, y) => bez.line_to((dx + x as f64, dy + y as f64)),
            PathCmd::QuadTo(cx, cy, ex, ey) => bez.quad_to(
                (dx + cx as f64, dy + cy as f64),
                (dx + ex as f64, dy + ey as f64),
            ),
            PathCmd::CubicTo(c1x, c1y, c2x, c2y, ex, ey) => bez.curve_to(
                (dx + c1x as f64, dy + c1y as f64),
                (dx + c2x as f64, dy + c2y as f64),
                (dx + ex as f64, dy + ey as f64),
            ),
            PathCmd::Close => bez.close_path(),
        }
    }

    fill_shape(scene, &bez, style);
    stroke_shape(scene, &bez, style);
}

// ─── Fill and stroke ─────────────────────────────────────────────────────────

fn fill_shape<S: kurbo::Shape>(scene: &mut Scene, shape: &S, style: &Style) {
    if let Some(paint) = &style.fill {
        let color = paint_to_color(paint, style.opacity);
        scene.fill(Fill::NonZero, Affine::IDENTITY, color, None, shape);
    }
}

fn stroke_shape<S: kurbo::Shape>(scene: &mut Scene, shape: &S, style: &Style) {
    if let Some(stroke) = &style.stroke {
        let vello_stroke = KurboStroke {
            width: stroke.width as f64,
            join: match stroke.join {
                StrokeJoin::Miter => Join::Miter,
                StrokeJoin::Round => Join::Round,
                StrokeJoin::Bevel => Join::Bevel,
            },
            start_cap: map_cap(stroke.cap),
            end_cap: map_cap(stroke.cap),
            ..Default::default()
        };
        let color = paint_to_color(&stroke.paint, style.opacity);
        scene.stroke(&vello_stroke, Affine::IDENTITY, color, None, shape);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn map_cap(cap: StrokeCap) -> Cap {
    match cap {
        StrokeCap::Butt => Cap::Butt,
        StrokeCap::Round => Cap::Round,
        StrokeCap::Square => Cap::Square,
    }
}

fn paint_to_color(paint: &Paint, opacity: Option<f32>) -> Color {
    let alpha = opacity.unwrap_or(1.0).clamp(0.0, 1.0);
    match paint {
        Paint::Solid(c) => Color::from_rgba8(
            (c.r * 255.0) as u8,
            (c.g * 255.0) as u8,
            (c.b * 255.0) as u8,
            (c.a * alpha * 255.0) as u8,
        ),
        Paint::LinearGradient { stops, .. } | Paint::RadialGradient { stops } => stops
            .first()
            .map(|s| {
                Color::from_rgba8(
                    (s.color.r * 255.0) as u8,
                    (s.color.g * 255.0) as u8,
                    (s.color.b * 255.0) as u8,
                    (s.color.a * alpha * 255.0) as u8,
                )
            })
            .unwrap_or(Color::from_rgb8(0, 0, 0)),
    }
}
