//! Keyboard shortcut mapping.
//!
//! Maps key + modifier combos to semantic `ShortcutAction`s.
//! The shortcut map lives in Rust so it's shared across WASM and native.
//!
//! Inspired by Screenbrush conventions where applicable:
//! - Tab toggles between two most‑used tools
//! - ⌘ hold = temporary hand/move tool
//! - ⌥⌘ = copy/duplicate while moving
//! - Shift = constrain (straight lines, square shapes)
//! - ⌘Delete = clear selected

/// Actions that keyboard shortcuts can trigger.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShortcutAction {
    // ── Tool switching ──
    ToolSelect,
    ToolRect,
    ToolEllipse,
    ToolPen,
    ToolText,
    /// Toggle between current and previous tool (Screenbrush: Tab).
    ToggleLastTool,

    // ── Edit ──
    Undo,
    Redo,
    Delete,
    SelectAll,
    Duplicate,
    Copy,
    Cut,
    Paste,
    /// Clear all selected (Screenbrush: ⌘Delete).
    ClearAll,

    // ── View ──
    ZoomIn,
    ZoomOut,
    ZoomToFit,
    PanStart,
    PanEnd,

    // ── Z-order ──
    SendBackward,
    BringForward,
    SendToBack,
    BringToFront,

    // ── UI ──
    Deselect,
    ShowHelp,
}

/// Resolves key events into shortcut actions.
///
/// Uses platform-aware modifier detection: on macOS `meta` is ⌘,
/// on other platforms `ctrl` serves the same role.
///
/// Shortcut philosophy follows Screenbrush where applicable:
/// - Tab = toggle last two tools
/// - Hold ⌘ during pointer = temporary hand/move mode (handled in JS)
/// - ⌥⌘ during pointer = copy while moving (handled via Modifiers)
/// - Shift = constrain (axis lock, square)
pub struct ShortcutMap;

impl ShortcutMap {
    /// Resolve a key event to an action.
    ///
    /// `key` is the `KeyboardEvent.key` value (e.g. `"z"`, `"Delete"`).
    /// Returns `None` if the key combo has no binding.
    pub fn resolve(
        key: &str,
        ctrl: bool,
        shift: bool,
        _alt: bool,
        meta: bool,
    ) -> Option<ShortcutAction> {
        let cmd = ctrl || meta;

        // ── Modifier combos first (most specific) ──
        if cmd && shift {
            return match key {
                "z" | "Z" => Some(ShortcutAction::Redo),
                "[" => Some(ShortcutAction::SendToBack),
                "]" => Some(ShortcutAction::BringToFront),
                "?" => Some(ShortcutAction::ShowHelp),
                _ => None,
            };
        }

        if cmd {
            return match key {
                "z" | "Z" => Some(ShortcutAction::Undo),
                "y" | "Y" => Some(ShortcutAction::Redo),
                "a" | "A" => Some(ShortcutAction::SelectAll),
                "d" | "D" => Some(ShortcutAction::Duplicate),
                "c" | "C" => Some(ShortcutAction::Copy),
                "x" | "X" => Some(ShortcutAction::Cut),
                "v" | "V" => Some(ShortcutAction::Paste),
                "=" | "+" => Some(ShortcutAction::ZoomIn),
                "-" => Some(ShortcutAction::ZoomOut),
                "0" => Some(ShortcutAction::ZoomToFit),
                "[" => Some(ShortcutAction::SendBackward),
                "]" => Some(ShortcutAction::BringForward),
                // Screenbrush: ⌘Delete = clear all
                "Delete" | "Backspace" => Some(ShortcutAction::ClearAll),
                _ => None,
            };
        }

        if shift {
            return match key {
                "?" => Some(ShortcutAction::ShowHelp),
                _ => None,
            };
        }

        // ── Single keys (no modifiers) ──
        match key {
            "v" | "V" => Some(ShortcutAction::ToolSelect),
            "r" | "R" => Some(ShortcutAction::ToolRect),
            "o" | "O" => Some(ShortcutAction::ToolEllipse),
            "p" | "P" => Some(ShortcutAction::ToolPen),
            "t" | "T" => Some(ShortcutAction::ToolText),
            // Screenbrush: Tab = toggle between two most-used tools
            "Tab" => Some(ShortcutAction::ToggleLastTool),
            "Delete" | "Backspace" => Some(ShortcutAction::Delete),
            "Escape" => Some(ShortcutAction::Deselect),
            " " => Some(ShortcutAction::PanStart),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_tool_shortcuts() {
        assert_eq!(
            ShortcutMap::resolve("v", false, false, false, false),
            Some(ShortcutAction::ToolSelect)
        );
        assert_eq!(
            ShortcutMap::resolve("r", false, false, false, false),
            Some(ShortcutAction::ToolRect)
        );
        assert_eq!(
            ShortcutMap::resolve("o", false, false, false, false),
            Some(ShortcutAction::ToolEllipse)
        );
        assert_eq!(
            ShortcutMap::resolve("p", false, false, false, false),
            Some(ShortcutAction::ToolPen)
        );
        assert_eq!(
            ShortcutMap::resolve("t", false, false, false, false),
            Some(ShortcutAction::ToolText)
        );
    }

    #[test]
    fn resolve_tab_toggles_tool() {
        assert_eq!(
            ShortcutMap::resolve("Tab", false, false, false, false),
            Some(ShortcutAction::ToggleLastTool)
        );
    }

    #[test]
    fn resolve_undo_redo() {
        // Cmd+Z → Undo
        assert_eq!(
            ShortcutMap::resolve("z", false, false, false, true),
            Some(ShortcutAction::Undo)
        );
        // Ctrl+Z → Undo
        assert_eq!(
            ShortcutMap::resolve("z", true, false, false, false),
            Some(ShortcutAction::Undo)
        );
        // Cmd+Shift+Z → Redo
        assert_eq!(
            ShortcutMap::resolve("z", false, true, false, true),
            Some(ShortcutAction::Redo)
        );
        // Cmd+Y → Redo
        assert_eq!(
            ShortcutMap::resolve("y", false, false, false, true),
            Some(ShortcutAction::Redo)
        );
    }

    #[test]
    fn resolve_delete() {
        assert_eq!(
            ShortcutMap::resolve("Delete", false, false, false, false),
            Some(ShortcutAction::Delete)
        );
        assert_eq!(
            ShortcutMap::resolve("Backspace", false, false, false, false),
            Some(ShortcutAction::Delete)
        );
    }

    #[test]
    fn resolve_cmd_delete_clears_all() {
        // Screenbrush: ⌘Delete = clear
        assert_eq!(
            ShortcutMap::resolve("Delete", false, false, false, true),
            Some(ShortcutAction::ClearAll)
        );
        assert_eq!(
            ShortcutMap::resolve("Backspace", true, false, false, false),
            Some(ShortcutAction::ClearAll)
        );
    }

    #[test]
    fn resolve_z_order() {
        assert_eq!(
            ShortcutMap::resolve("[", false, false, false, true),
            Some(ShortcutAction::SendBackward)
        );
        assert_eq!(
            ShortcutMap::resolve("]", false, false, false, true),
            Some(ShortcutAction::BringForward)
        );
        assert_eq!(
            ShortcutMap::resolve("[", false, true, false, true),
            Some(ShortcutAction::SendToBack)
        );
        assert_eq!(
            ShortcutMap::resolve("]", false, true, false, true),
            Some(ShortcutAction::BringToFront)
        );
    }

    #[test]
    fn resolve_clipboard() {
        assert_eq!(
            ShortcutMap::resolve("c", false, false, false, true),
            Some(ShortcutAction::Copy)
        );
        assert_eq!(
            ShortcutMap::resolve("x", false, false, false, true),
            Some(ShortcutAction::Cut)
        );
        assert_eq!(
            ShortcutMap::resolve("v", false, false, false, true),
            Some(ShortcutAction::Paste)
        );
    }

    #[test]
    fn resolve_unknown_key() {
        assert_eq!(ShortcutMap::resolve("q", false, false, false, false), None);
        assert_eq!(ShortcutMap::resolve("7", false, false, false, false), None);
    }

    #[test]
    fn resolve_modifier_precedence() {
        assert_eq!(ShortcutMap::resolve("z", false, false, false, false), None);
        assert_eq!(
            ShortcutMap::resolve("z", false, false, false, true),
            Some(ShortcutAction::Undo)
        );
    }

    #[test]
    fn resolve_zoom() {
        assert_eq!(
            ShortcutMap::resolve("=", false, false, false, true),
            Some(ShortcutAction::ZoomIn)
        );
        assert_eq!(
            ShortcutMap::resolve("-", false, false, false, true),
            Some(ShortcutAction::ZoomOut)
        );
        assert_eq!(
            ShortcutMap::resolve("0", false, false, false, true),
            Some(ShortcutAction::ZoomToFit)
        );
    }

    #[test]
    fn resolve_escape_and_space() {
        assert_eq!(
            ShortcutMap::resolve("Escape", false, false, false, false),
            Some(ShortcutAction::Deselect)
        );
        assert_eq!(
            ShortcutMap::resolve(" ", false, false, false, false),
            Some(ShortcutAction::PanStart)
        );
    }

    #[test]
    fn resolve_help() {
        assert_eq!(
            ShortcutMap::resolve("?", false, true, false, false),
            Some(ShortcutAction::ShowHelp)
        );
    }
}
