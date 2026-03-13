//! Render and export APIs.

use crate::FdCanvas;
use crate::render2d;
use wasm_bindgen::prelude::*;
use web_sys::CanvasRenderingContext2d;

#[wasm_bindgen]
impl FdCanvas {
    /// Render the scene to a Canvas2D context.
    ///
    /// * `skip_grid` — skip drawing the background grid dots.
    /// * `skip_bg` — skip filling the background color.
    pub fn render(
        &self,
        ctx: &CanvasRenderingContext2d,
        time_ms: f64,
        skip_grid: bool,
        skip_bg: bool,
    ) {
        let selected_ids: Vec<String> = self
            .select_tool
            .visual_highlight
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        // Compute smart alignment guides when dragging/resizing
        let guides = self.compute_smart_guides();

        render2d::render_scene(
            ctx,
            &self.engine.graph,
            self.engine.current_bounds(),
            self.width,
            self.height,
            &selected_ids,
            &self.cached_theme,
            self.select_tool.marquee_rect,
            time_ms,
            self.hovered_id.as_ref().map(|id| id.as_str()),
            self.pressed_id.as_ref().map(|id| id.as_str()),
            &guides,
            self.sketchy_mode,
            self.hover_start_ms,
            skip_grid,
            skip_bg,
        );
    }

    /// Render only the selected nodes (and their children) to the given context.
    pub fn render_export(&self, ctx: &CanvasRenderingContext2d, offset_x: f64, offset_y: f64) {
        if self.select_tool.selected.is_empty() {
            return;
        }

        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        render2d::render_export(
            ctx,
            &self.engine.graph,
            self.engine.current_bounds(),
            &selected_ids,
            &self.cached_theme,
            offset_x,
            offset_y,
            self.sketchy_mode,
        );
    }

    /// Export the current selection (or entire canvas if empty) as an SVG string.
    pub fn export_svg(&self) -> String {
        let theme = if self.dark_mode {
            render2d::CanvasTheme::dark()
        } else {
            render2d::CanvasTheme::light()
        };

        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        crate::svg::render_svg(
            &self.engine.graph,
            self.engine.current_bounds(),
            &selected_ids,
            &theme,
        )
    }
}
