/**
 * Cross-Platform Theme Contract
 *
 * TypeScript mirror of `fd_core::theme::ThemeContract` in Rust.
 * These values are the single source of truth for visual constants
 * across all FD platforms.
 *
 * On web/VS Code: consumed directly from JS.
 * On native: obtained via `fdCanvas.get_theme_json()` WASM API.
 */
export interface ThemeContract {
  // ── Canvas ──────────────────────────────────────────────────────
  canvas_bg: string;
  grid_color: string;

  // ── Selection & Interaction ─────────────────────────────────────
  selection_accent: string;
  smart_guide_color: string;

  // ── Panels & UI Chrome ─────────────────────────────────────────
  panel_bg: string;
  panel_border: string;

  // ── Text ────────────────────────────────────────────────────────
  text_primary: string;
  text_secondary: string;

  // ── Accent ──────────────────────────────────────────────────────
  accent: string;

  // ── Placeholders ────────────────────────────────────────────────
  placeholder_border: string;
  placeholder_bg: string;
  placeholder_text: string;

  // ── Typography ──────────────────────────────────────────────────
  font_family: string;
  font_size_base: number;
  border_radius: number;
}

/** Light theme — Apple HIG-inspired warm white. */
export const LIGHT_THEME: ThemeContract = {
  canvas_bg: "#F5F5F7",
  grid_color: "rgba(0, 0, 0, 0.05)",
  selection_accent: "#007AFF",
  smart_guide_color: "#FF3B30",
  panel_bg: "rgba(255, 255, 255, 0.8)",
  panel_border: "rgba(0, 0, 0, 0.06)",
  text_primary: "#1D1D1F",
  text_secondary: "#86868B",
  accent: "#007AFF",
  placeholder_border: "#86868B",
  placeholder_bg: "rgba(142, 142, 147, 0.06)",
  placeholder_text: "#86868B",
  font_family: "Inter, SF Pro, system-ui, sans-serif",
  font_size_base: 13,
  border_radius: 8,
};

/** Dark theme — kept for reference but not exported (canvas is light-only). */
const DARK_THEME: ThemeContract = {
  canvas_bg: "#1C1C1E",
  grid_color: "rgba(255, 255, 255, 0.04)",
  selection_accent: "#0A84FF",
  smart_guide_color: "#FF453A",
  panel_bg: "rgba(44, 44, 46, 0.8)",
  panel_border: "rgba(255, 255, 255, 0.08)",
  text_primary: "#F5F5F7",
  text_secondary: "#98989D",
  accent: "#0A84FF",
  placeholder_border: "#636366",
  placeholder_bg: "rgba(99, 99, 102, 0.08)",
  placeholder_text: "#98989D",
  font_family: "Inter, SF Pro, system-ui, sans-serif",
  font_size_base: 13,
  border_radius: 8,
};

/** Get the canvas theme (always light). */
export function getTheme(): ThemeContract {
  return LIGHT_THEME;
}
