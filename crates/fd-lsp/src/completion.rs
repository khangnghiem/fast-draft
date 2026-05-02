//! Completions: context-aware FD completions.

use fd_core::completion::{
    CompletionItemData, CompletionKind, compute_brace_depth, node_body_items, top_level_items,
    value_completions_data,
};
use tower_lsp::lsp_types::*;

/// Compute completions at the given cursor position.
///
/// Uses a simple heuristic: look at the line content to determine context
/// (top-level, inside a node block, after a colon, etc.).
pub fn compute_completions(text: &str, pos: Position) -> Vec<CompletionItem> {
    let line = text.lines().nth(pos.line as usize).unwrap_or("");
    let before_cursor = &line[..std::cmp::min(pos.character as usize, line.len())];
    let trimmed = before_cursor.trim();

    // After a colon — suggest values
    if let Some(prop_part) = trimmed.strip_suffix(':').or_else(|| {
        if trimmed.ends_with(": ") {
            Some(trimmed.trim_end_matches(": ").trim())
        } else {
            None
        }
    }) {
        let prop = prop_part.split_whitespace().last().unwrap_or("");
        return to_lsp_items(&value_completions_data(prop));
    }

    // Detect if we're inside a block or at top level
    let depth = compute_brace_depth(text, pos.line as usize, pos.character as usize);

    if depth == 0 {
        to_lsp_items(&top_level_items())
    } else {
        to_lsp_items(&node_body_items())
    }
}

fn map_kind(kind: CompletionKind) -> CompletionItemKind {
    match kind {
        CompletionKind::Keyword => CompletionItemKind::KEYWORD,
        CompletionKind::Property => CompletionItemKind::PROPERTY,
        CompletionKind::Value => CompletionItemKind::ENUM_MEMBER,
        CompletionKind::Snippet => CompletionItemKind::SNIPPET,
        CompletionKind::Reference => CompletionItemKind::REFERENCE,
    }
}

fn to_lsp_items(items: &[CompletionItemData]) -> Vec<CompletionItem> {
    items
        .iter()
        .map(|item| {
            let mut lsp_item = CompletionItem {
                label: item.label.to_string(),
                kind: Some(map_kind(item.kind)),
                detail: Some(item.detail.to_string()),
                ..Default::default()
            };
            if let Some(snippet) = item.snippet {
                lsp_item.insert_text = Some(snippet.to_string());
                lsp_item.insert_text_format = Some(InsertTextFormat::SNIPPET);
            }
            lsp_item
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn top_level_returns_node_keywords() {
        let items = compute_completions("", Position::new(0, 0));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"rect"));
        assert!(labels.contains(&"group"));
        assert!(labels.contains(&"style"), "should suggest `style` keyword");
    }

    #[test]
    fn inside_node_returns_properties() {
        let text = "rect @box {\n  ";
        let items = compute_completions(text, Position::new(1, 2));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"w:"));
        assert!(labels.contains(&"fill:"));
        assert!(labels.contains(&"when"), "should suggest `when` not `anim`");
    }

    #[test]
    fn brace_depth_computation() {
        let text = "rect @a {\n  group @b {\n    ";
        assert_eq!(compute_brace_depth(text, 2, 4), 2);
    }

    #[test]
    fn top_level_includes_frame_and_edge() {
        let items = compute_completions("", Position::new(0, 0));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"frame"), "should suggest frame");
        assert!(labels.contains(&"edge"), "should suggest edge");
        assert!(labels.contains(&"import"), "should suggest import");
    }

    #[test]
    fn node_body_includes_spec_and_shadow() {
        let text = "rect @box {\n  ";
        let items = compute_completions(text, Position::new(1, 2));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"shadow:"), "should suggest shadow:");
        assert!(labels.contains(&"clip:"), "should suggest clip:");
        assert!(labels.contains(&"x:"), "should suggest x:");
        assert!(labels.contains(&"y:"), "should suggest y:");
        assert!(labels.contains(&"align:"), "should suggest align:");
        assert!(labels.contains(&"spec"), "should suggest spec block");
        assert!(labels.contains(&"frame"), "should suggest nested frame");
    }

    #[test]
    fn value_completions_for_fill() {
        let text = "rect @box {\n  fill:";
        let items = compute_completions(text, Position::new(1, 7));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(
            labels.contains(&"purple"),
            "should suggest named color purple"
        );
        assert!(labels.contains(&"blue"), "should suggest named color blue");
        assert!(
            labels.contains(&"#6C5CE7"),
            "should suggest hex color palette"
        );
    }

    #[test]
    fn value_completions_for_align() {
        let text = "text @t \"Hi\" {\n  align:";
        let items = compute_completions(text, Position::new(1, 8));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"left"), "should suggest left");
        assert!(labels.contains(&"center"), "should suggest center");
        assert!(labels.contains(&"right"), "should suggest right");
    }

    #[test]
    fn deep_nesting_returns_properties() {
        let text = "group @a {\n  group @b {\n    rect @c {\n      ";
        let items = compute_completions(text, Position::new(3, 6));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(
            labels.contains(&"fill:"),
            "depth 3 should still return props"
        );
        assert!(labels.contains(&"shadow:"), "depth 3 should include shadow");
    }

    #[test]
    fn value_completions_for_arrow_and_curve() {
        let text = "edge @e {\n  arrow:";
        let items = compute_completions(text, Position::new(1, 8));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"end"), "should suggest arrow: end");
        assert!(labels.contains(&"both"), "should suggest arrow: both");

        let text2 = "edge @e {\n  curve:";
        let items2 = compute_completions(text2, Position::new(1, 8));
        let labels2: Vec<&str> = items2.iter().map(|i| i.label.as_str()).collect();
        assert!(labels2.contains(&"smooth"), "should suggest curve: smooth");
    }
}
