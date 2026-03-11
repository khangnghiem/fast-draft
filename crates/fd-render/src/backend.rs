//! Pluggable rendering backend abstraction.
//!
//! Defines the `DrawBackend` trait — a platform-agnostic 2D drawing API
//! that mirrors the Canvas2D surface used by the WASM renderer.
//!
//! ## Implementations
//!
//! | Backend              | Platform        | Status   |
//! |----------------------|-----------------|----------|
//! | `Canvas2dBackend`    | Web / WASM      | Current  |
//! | `CoreGraphicsBackend`| iOS / macOS     | Planned  |
//! | `VelloBackend`       | Desktop (Tauri) | Planned  |
//!
//! ## Usage
//!
//! Future versions of `render2d.rs` will accept `&dyn DrawBackend` instead
//! of `&CanvasRenderingContext2d`, enabling the same rendering code to run
//! on all platforms.

/// Text measurement result from `measure_text`.
#[derive(Debug, Clone, Default)]
pub struct TextMetrics {
    /// Width of the measured text in pixels.
    pub width: f64,
    /// Height from the baseline to the top of the bounding box.
    pub actual_bounding_box_ascent: f64,
    /// Height from the baseline to the bottom of the bounding box.
    pub actual_bounding_box_descent: f64,
}

/// Platform-agnostic 2D drawing backend.
///
/// Each method corresponds to a Canvas2D operation. Platform implementations
/// map these to their native drawing APIs:
///
/// - **Web**: `CanvasRenderingContext2d` (current renderer)
/// - **iOS**: `CGContext` via CoreGraphics
/// - **Desktop**: Vello scene builder
///
/// The trait is intentionally thin (~25 methods) — it covers only the
/// operations actually used by `render2d.rs`. Additional methods can be
/// added as the renderer evolves.
pub trait DrawBackend {
    // ── State management ────────────────────────────────────────────

    /// Save the current drawing state (transform, clip, styles).
    fn save(&self);

    /// Restore the most recently saved drawing state.
    fn restore(&self);

    // ── Style setters ───────────────────────────────────────────────

    /// Set the fill color/style (CSS color string).
    fn set_fill_style(&self, color: &str);

    /// Set the stroke color/style (CSS color string).
    fn set_stroke_style(&self, color: &str);

    /// Set the stroke line width in pixels.
    fn set_line_width(&self, width: f64);

    /// Set the global opacity (0.0 = transparent, 1.0 = opaque).
    fn set_global_alpha(&self, alpha: f64);

    /// Set the line dash pattern (e.g., `[6.0, 4.0]` for dashed lines).
    fn set_line_dash(&self, segments: &[f64]);

    /// Set the line dash offset for marching-ants effects.
    fn set_line_dash_offset(&self, offset: f64);

    /// Set the line join style ("round", "bevel", "miter").
    fn set_line_join(&self, join: &str);

    // ── Shadow ──────────────────────────────────────────────────────

    /// Set the shadow blur radius.
    fn set_shadow_blur(&self, blur: f64);

    /// Set the shadow X offset.
    fn set_shadow_offset_x(&self, x: f64);

    /// Set the shadow Y offset.
    fn set_shadow_offset_y(&self, y: f64);

    /// Set the shadow color (CSS color string).
    fn set_shadow_color(&self, color: &str);

    // ── Path operations ─────────────────────────────────────────────

    /// Begin a new path.
    fn begin_path(&self);

    /// Close the current sub-path.
    fn close_path(&self);

    /// Move the pen to (x, y) without drawing.
    fn move_to(&self, x: f64, y: f64);

    /// Draw a straight line from the current point to (x, y).
    fn line_to(&self, x: f64, y: f64);

    /// Draw a circular arc.
    fn arc(&self, x: f64, y: f64, radius: f64, start_angle: f64, end_angle: f64);

    /// Draw an arc connecting two tangent lines (for rounded corners).
    fn arc_to(&self, x1: f64, y1: f64, x2: f64, y2: f64, radius: f64);

    /// Draw a quadratic Bézier curve.
    fn quadratic_curve_to(&self, cpx: f64, cpy: f64, x: f64, y: f64);

    /// Draw a cubic Bézier curve.
    fn bezier_curve_to(&self, cp1x: f64, cp1y: f64, cp2x: f64, cp2y: f64, x: f64, y: f64);

    /// Draw an ellipse (used for ellipse shapes).
    #[allow(clippy::too_many_arguments)]
    fn ellipse(
        &self,
        x: f64,
        y: f64,
        radius_x: f64,
        radius_y: f64,
        rotation: f64,
        start_angle: f64,
        end_angle: f64,
    );

    // ── Drawing operations ──────────────────────────────────────────

    /// Fill the current path with the current fill style.
    fn fill(&self);

    /// Stroke the current path with the current stroke style.
    fn stroke(&self);

    /// Fill a rectangle.
    fn fill_rect(&self, x: f64, y: f64, width: f64, height: f64);

    /// Stroke a rectangle.
    fn stroke_rect(&self, x: f64, y: f64, width: f64, height: f64);

    /// Clear a rectangular area to transparent.
    fn clear_rect(&self, x: f64, y: f64, width: f64, height: f64);

    // ── Text ────────────────────────────────────────────────────────

    /// Set the font (CSS font string, e.g., "14px Inter").
    fn set_font(&self, font: &str);

    /// Set text alignment ("left", "center", "right").
    fn set_text_align(&self, align: &str);

    /// Set text baseline ("top", "middle", "bottom", "alphabetic").
    fn set_text_baseline(&self, baseline: &str);

    /// Fill text at position (x, y).
    fn fill_text(&self, text: &str, x: f64, y: f64);

    /// Measure text width and height.
    fn measure_text(&self, text: &str) -> TextMetrics;

    // ── Transform ───────────────────────────────────────────────────

    /// Apply a translation transform.
    fn translate(&self, x: f64, y: f64);

    /// Apply a scale transform.
    fn scale(&self, x: f64, y: f64);

    /// Set the full transform matrix.
    fn set_transform(&self, a: f64, b: f64, c: f64, d: f64, e: f64, f: f64);

    // ── Clipping ────────────────────────────────────────────────────

    /// Clip to the current path.
    fn clip(&self);
}
