//! Completions: context-aware FD completions.

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
        return value_completions(prop);
    }

    // Detect if we're inside a block or at top level
    let depth = compute_brace_depth(text, pos);

    if depth == 0 {
        top_level_completions()
    } else {
        node_body_completions()
    }
}

/// Compute the brace nesting depth at the cursor position.
fn compute_brace_depth(text: &str, pos: Position) -> usize {
    let mut depth: i32 = 0;
    for (i, line) in text.lines().enumerate() {
        if i > pos.line as usize {
            break;
        }
        let end = if i == pos.line as usize {
            std::cmp::min(pos.character as usize, line.len())
        } else {
            line.len()
        };
        for ch in line[..end].chars() {
            match ch {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
        }
    }
    depth.max(0) as usize
}

/// Completions at the top level of an FD document.
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
            "style",
            "Reusable style block",
            "style ${1:name} {\n  fill: #${2:6C5CE7}\n}",
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

/// Completions inside a node body `{ ... }`.
fn node_body_completions() -> Vec<CompletionItem> {
    let props = [
        ("w:", "Width", CompletionItemKind::PROPERTY),
        ("h:", "Height", CompletionItemKind::PROPERTY),
        ("fill:", "Fill color", CompletionItemKind::PROPERTY),
        (
            "stroke:",
            "Stroke color and width",
            CompletionItemKind::PROPERTY,
        ),
        ("corner:", "Corner radius", CompletionItemKind::PROPERTY),
        (
            "opacity:",
            "Opacity (0.0–1.0)",
            CompletionItemKind::PROPERTY,
        ),
        (
            "font:",
            "Font family, weight, size",
            CompletionItemKind::PROPERTY,
        ),
        (
            "bg:",
            "Background with inline shadow/corner",
            CompletionItemKind::PROPERTY,
        ),
        (
            "use:",
            "Reference a named style",
            CompletionItemKind::REFERENCE,
        ),
        (
            "layout:",
            "Layout mode for children",
            CompletionItemKind::PROPERTY,
        ),
    ];

    let mut items: Vec<CompletionItem> = props
        .into_iter()
        .map(|(label, detail, kind)| CompletionItem {
            label: label.to_string(),
            kind: Some(kind),
            detail: Some(detail.to_string()),
            ..Default::default()
        })
        .collect();

    // Child node snippets
    let child_nodes = [
        ("group", "Nested group"),
        ("rect", "Nested rectangle"),
        ("ellipse", "Nested ellipse"),
        ("text", "Nested text"),
        ("path", "Nested path"),
    ];
    for (label, detail) in child_nodes {
        items.push(CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::KEYWORD),
            detail: Some(detail.to_string()),
            ..Default::default()
        });
    }

    // Animation block
    items.push(CompletionItem {
        label: "anim".to_string(),
        kind: Some(CompletionItemKind::SNIPPET),
        detail: Some("Animation block".to_string()),
        insert_text: Some("anim :${1|hover,press,enter|} {\n  $0\n}".to_string()),
        insert_text_format: Some(InsertTextFormat::SNIPPET),
        ..Default::default()
    });

    // Annotation
    items.push(CompletionItem {
        label: "##".to_string(),
        kind: Some(CompletionItemKind::SNIPPET),
        detail: Some("Annotation".to_string()),
        insert_text: Some("## \"${1:description}\"".to_string()),
        insert_text_format: Some(InsertTextFormat::SNIPPET),
        ..Default::default()
    });

    items
}

/// Value completions after a property colon.
fn value_completions(property: &str) -> Vec<CompletionItem> {
    let values: &[(&str, &str)] = match property {
        "layout" => &[
            ("column", "Vertical stack layout"),
            ("row", "Horizontal stack layout"),
            ("grid", "Grid layout"),
            ("free", "Free / absolute positioning"),
        ],
        "ease" => &[
            ("linear", "Linear easing"),
            ("ease_in", "Ease in"),
            ("ease_out", "Ease out"),
            ("ease_in_out", "Ease in-out"),
            ("spring", "Spring physics"),
        ],
        "status" => &[
            ("draft", "Draft status"),
            ("in_progress", "In progress"),
            ("review", "Under review"),
            ("done", "Completed"),
        ],
        "priority" => &[
            ("low", "Low priority"),
            ("medium", "Medium priority"),
            ("high", "High priority"),
            ("critical", "Critical priority"),
        ],
        _ => return Vec::new(),
    };

    values
        .iter()
        .map(|(label, detail)| CompletionItem {
            label: label.to_string(),
            kind: Some(CompletionItemKind::ENUM_MEMBER),
            detail: Some(detail.to_string()),
            ..Default::default()
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
        assert!(labels.contains(&"style"));
    }

    #[test]
    fn inside_node_returns_properties() {
        let text = "rect @box {\n  ";
        let items = compute_completions(text, Position::new(1, 2));
        let labels: Vec<&str> = items.iter().map(|i| i.label.as_str()).collect();
        assert!(labels.contains(&"w:"));
        assert!(labels.contains(&"fill:"));
        assert!(labels.contains(&"anim"));
    }

    #[test]
    fn brace_depth_computation() {
        let text = "rect @a {\n  group @b {\n    ";
        assert_eq!(compute_brace_depth(text, Position::new(2, 4)), 2);
    }
}
