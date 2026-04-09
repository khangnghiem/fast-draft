//! Cross-platform theme contract.
//!
//! Single source of truth for visual constants across all FD platforms
//! (web, VS Code, Tauri desktop, iOS, Android). Each platform consumes
//! these values through its native theming system.

use serde::{Deserialize, Serialize};

/// Platform-agnostic theme contract.
///
/// Defines all visual constants that must be consistent across platforms.
/// The Rust renderer (`render2d.rs`) derives `CanvasTheme` from this.
/// JavaScript hosts consume it via `get_theme_json()` WASM API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThemeContract {
    // ── Canvas ──────────────────────────────────────────────────────
    /// Canvas background color (the drawing surface)
    pub canvas_bg: String,
    /// Grid overlay color (dots/lines)
    pub grid_color: String,

    // ── Selection & Interaction ─────────────────────────────────────
    /// Selection highlight accent (handle dots, selection box)
    pub selection_accent: String,
    /// Smart guide line color
    pub smart_guide_color: String,

    // ── Panels & UI Chrome ─────────────────────────────────────────
    /// Panel background (layers, properties, toolbar)
    pub panel_bg: String,
    /// Panel border / separator color
    pub panel_border: String,

    // ── Text ────────────────────────────────────────────────────────
    /// Primary text color (labels, headings)
    pub text_primary: String,
    /// Secondary text color (captions, hints)
    pub text_secondary: String,

    // ── Accent ──────────────────────────────────────────────────────
    /// Primary accent color (buttons, links, active states)
    pub accent: String,

    // ── Placeholders ────────────────────────────────────────────────
    /// Generic node placeholder border
    pub placeholder_border: String,
    /// Generic node placeholder background
    pub placeholder_bg: String,
    /// Generic node placeholder text
    pub placeholder_text: String,

    // ── Typography ──────────────────────────────────────────────────
    /// Default font family stack
    pub font_family: String,
    /// Base font size in px
    pub font_size_base: f32,
    /// Default border radius in px
    pub border_radius: f32,
}

impl ThemeContract {
    /// Light theme — Apple HIG-inspired warm white.
    ///
    /// Returns a new instance configured with standard light mode colors.
    pub fn light() -> Self {
        Self {
            canvas_bg: "#F5F5F7".into(),
            grid_color: "rgba(0, 0, 0, 0.05)".into(),
            selection_accent: "#007AFF".into(),
            smart_guide_color: "#FF3B30".into(),
            panel_bg: "rgba(255, 255, 255, 0.8)".into(),
            panel_border: "rgba(0, 0, 0, 0.06)".into(),
            text_primary: "#1D1D1F".into(),
            text_secondary: "#86868B".into(),
            accent: "#007AFF".into(),
            placeholder_border: "#86868B".into(),
            placeholder_bg: "rgba(142, 142, 147, 0.06)".into(),
            placeholder_text: "#86868B".into(),
            font_family: "Inter, SF Pro, system-ui, sans-serif".into(),
            font_size_base: 13.0,
            border_radius: 8.0,
        }
    }

    /// Dark theme — macOS Catppuccin Mocha-inspired.
    ///
    /// Returns a new instance configured with standard dark mode colors.
    pub fn dark() -> Self {
        Self {
            canvas_bg: "#1C1C1E".into(),
            grid_color: "rgba(255, 255, 255, 0.04)".into(),
            selection_accent: "#0A84FF".into(),
            smart_guide_color: "#FF453A".into(),
            panel_bg: "rgba(44, 44, 46, 0.8)".into(),
            panel_border: "rgba(255, 255, 255, 0.08)".into(),
            text_primary: "#F5F5F7".into(),
            text_secondary: "#98989D".into(),
            accent: "#0A84FF".into(),
            placeholder_border: "#636366".into(),
            placeholder_bg: "rgba(99, 99, 102, 0.08)".into(),
            placeholder_text: "#98989D".into(),
            font_family: "Inter, SF Pro, system-ui, sans-serif".into(),
            font_size_base: 13.0,
            border_radius: 8.0,
        }
    }

    /// Serialize to JSON for JavaScript consumption.
    ///
    /// Serializes the `ThemeContract` instance to a JSON string representation.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_light_fields_non_empty() {
        let t = ThemeContract::light();
        assert!(!t.canvas_bg.is_empty());
        assert!(!t.grid_color.is_empty());
        assert!(!t.selection_accent.is_empty());
        assert!(!t.panel_bg.is_empty());
        assert!(!t.text_primary.is_empty());
        assert!(!t.accent.is_empty());
        assert!(!t.font_family.is_empty());
        assert!(t.font_size_base > 0.0);
        assert!(t.border_radius >= 0.0);
    }

    #[test]
    fn theme_dark_fields_non_empty() {
        let t = ThemeContract::dark();
        assert!(!t.canvas_bg.is_empty());
        assert!(!t.grid_color.is_empty());
        assert!(!t.selection_accent.is_empty());
        assert!(!t.panel_bg.is_empty());
        assert!(!t.text_primary.is_empty());
        assert!(!t.accent.is_empty());
    }

    #[test]
    fn theme_light_dark_differ() {
        let l = ThemeContract::light();
        let d = ThemeContract::dark();
        assert_ne!(l.canvas_bg, d.canvas_bg, "light and dark bg should differ");
        assert_ne!(
            l.text_primary, d.text_primary,
            "light and dark text should differ"
        );
    }

    #[test]
    fn theme_to_json_roundtrip() {
        let original = ThemeContract::light();
        let json = original.to_json();
        let parsed: ThemeContract = serde_json::from_str(&json).unwrap();
        assert_eq!(original, parsed);
    }

    #[test]
    fn canvas_theme_from_contract() {
        let contract = ThemeContract::light();
        // Verify the contract's placeholder fields match CanvasTheme expectations
        assert_eq!(contract.placeholder_border, "#86868B");
        assert_eq!(contract.placeholder_bg, "rgba(142, 142, 147, 0.06)");
        assert_eq!(contract.placeholder_text, "#86868B");
    }
}
