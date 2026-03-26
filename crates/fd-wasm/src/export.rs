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
        let selected_ids: Vec<String> = if self.ui_suppressed {
            Vec::new()
        } else {
            self.select_tool
                .visual_highlight
                .iter()
                .map(|id| id.as_str().to_string())
                .collect()
        };

        // Compute smart alignment guides when dragging/resizing
        let guides = if self.ui_suppressed {
            Vec::new()
        } else {
            self.compute_smart_guides()
        };

        // Suppress marquee during inline edit
        let marquee_rect = if self.ui_suppressed {
            None
        } else {
            self.select_tool.marquee_rect
        };

        render2d::render_scene(
            ctx,
            &self.engine.graph,
            self.engine.current_bounds(),
            self.width,
            self.height,
            &selected_ids,
            &self.cached_theme,
            marquee_rect,
            time_ms,
            self.hovered_id.as_ref().map(|id| id.as_str()),
            self.pressed_id.as_ref().map(|id| id.as_str()),
            &guides,
            self.sketchy_mode,
            self.hover_start_ms,
            skip_grid,
            skip_bg,
            self.pointer_type.handle_visual_size() as f64,
            self.pointer_type.corners_only(),
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

    /// Export the current selection (or entire canvas if empty) as Excalidraw v2 JSON.
    ///
    /// The output can be pasted directly into excalidraw.com.
    pub fn export_excalidraw(&self) -> String {
        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        fd_core::excalidraw::export_excalidraw(
            &self.engine.graph,
            self.engine.current_bounds(),
            &selected_ids,
        )
    }

    /// Export the current selection (or entire canvas if empty) as a standalone HTML page.
    ///
    /// The output is a complete HTML document with embedded CSS that can be
    /// saved as an `.html` file and opened in any browser.
    pub fn export_html(&self) -> String {
        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();

        fd_core::html_export::export_html(
            &self.engine.graph,
            self.engine.current_bounds(),
            &selected_ids,
        )
    }

    /// Emit FD text for only the currently selected nodes.
    ///
    /// Returns valid FD text containing just the selected node blocks
    /// (including children for groups/frames). If nothing is selected,
    /// returns the full document. Used by AI Touch to provide accurate
    /// selection context without fragile regex extraction.
    pub fn emit_selection_fd(&self) -> String {
        if self.select_tool.selected.is_empty() {
            return fd_core::emitter::emit_document(&self.engine.graph);
        }

        let mut out = String::with_capacity(512);
        let bounds = self.engine.current_bounds();

        for id in &self.select_tool.selected {
            // Check if it's an edge
            if let Some(edge) = self.engine.graph.edges.iter().find(|e| e.id == *id) {
                fd_core::emitter::emit_edge_standalone(
                    &mut out,
                    edge,
                    &self.engine.graph,
                    self.engine.graph.edge_defaults.as_ref(),
                );
                out.push('\n');
                continue;
            }

            // It's a node — emit its subtree
            if let Some(idx) = self.engine.graph.index_of(*id) {
                fd_core::emitter::emit_node_standalone(&mut out, &self.engine.graph, idx, bounds);
                out.push('\n');
            }
        }

        out
    }
}
