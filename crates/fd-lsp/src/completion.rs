//! Completions: context-aware FD completions.

use tower_lsp::lsp_types::*;

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
        let items = fd_core::completion::value_completions_data(prop);
        return items
            .into_iter()
            .map(|(label, _kind, detail)| CompletionItem {
                label: label.to_string(),
                kind: Some(CompletionItemKind::VALUE),
                detail: Some(detail.to_string()),
                ..Default::default()
            })
            .collect();
    }

    // Detect if we're inside a block or at top level
    let depth = fd_core::completion::compute_brace_depth(text, pos.line, pos.character);

    if depth == 0 {
        top_level_completions()
    } else {
        node_body_completions()
    }
}

fn top_level_completions() -> Vec<CompletionItem> {
    let keywords = [
        (
            "import",
            "Import another .fd file",
            "import \"${1:path.fd}\" as ${2:name}",
        ),
        (
            "group",
            "Group container for child nodes",
            "group @${1:name} {\n  $0\n}",
        ),
        (
            "rect",
            "Rectangle shape",
            "rect @${1:name} {\n  w: ${2:100} h: ${3:50}\n  fill: #${4:6C5CE7}\n}",
        ),
        (
            "ellipse",
            "Ellipse / circle shape",
            "ellipse @${1:name} {\n  w: ${2:50} h: ${3:50}\n  fill: #${4:FF6B6B}\n}",
        ),
        (
            "text",
            "Text label",
            "text @${1:name} \"${2:Hello}\" {\n  fill: #${3:333333}\n}",
        ),
        ("path", "Freeform path", "path @${1:name} {\n  $0\n}"),
        (
            "frame",
            "Frame container with clip",
            "frame @${1:name} {\n  w: ${2:300} h: ${3:200}\n  $0\n}",
        ),
        (
            "style",
            "Reusable style definition (legacy: theme)",
            "style ${1:name} {\n  fill: #${2:6C5CE7}\n}",
        ),
        (
            "edge",
            "Edge / connection between nodes",
            "edge @${1:name} {\n  from: @${2:source}\n  to: @${3:target}\n  arrow: end\n}",
        ),
    ];

    keywords
        .into_iter()
        .map(|(label, detail, snippet)| CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::KEYWORD),
            detail: Some(detail.to_string()),
            insert_text: Some(snippet.to_string()),
            insert_text_format: Some(InsertTextFormat::SNIPPET),
            ..Default::default()
        })
        .collect()
}

fn node_body_completions() -> Vec<CompletionItem> {
    let props = fd_core::completion::node_body_items();
    let mut completions = vec![];
    for (label, kind_str, detail) in props {
        let kind = match kind_str {
            "property" => CompletionItemKind::PROPERTY,
            "keyword" => CompletionItemKind::KEYWORD,
            _ => CompletionItemKind::TEXT,
        };
        completions.push(CompletionItem {
            label: label.to_string(),
            kind: Some(kind),
            detail: Some(detail.to_string()),
            insert_text: Some(label.to_string()),
            insert_text_format: Some(InsertTextFormat::PLAIN_TEXT),
            ..Default::default()
        });
    }

    // Snippets for blocks inside node bodies
    let blocks = [
        ("when", "Animation block", "when ${1:hover} {\n  $0\n}"),
        ("spec", "Annotation block", "spec {\n  status: ${1:todo}\n}"),
    ];

    for (label, detail, snippet) in blocks {
        completions.push(CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::KEYWORD),
            detail: Some(detail.to_string()),
            insert_text: Some(snippet.to_string()),
            insert_text_format: Some(InsertTextFormat::SNIPPET),
            ..Default::default()
        });
    }

    completions
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
        assert_eq!(fd_core::completion::compute_brace_depth(text, 2, 4), 2);
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
