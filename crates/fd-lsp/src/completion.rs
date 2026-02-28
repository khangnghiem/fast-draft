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
            "frame",
            "Frame container with clip",
            "frame @${1:name} {\n  w: ${2:300} h: ${3:200}\n  $0\n}",
        ),
        (
            "theme",
            "Reusable theme definition (legacy: style)",
            "theme ${1:name} {\n  fill: #${2:6C5CE7}\n}",
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
        (
            "shadow:",
            "Drop shadow (ox,oy,blur,#color)",
            CompletionItemKind::PROPERTY,
        ),
        (
            "clip:",
            "Clip children to bounds (frames)",
            CompletionItemKind::PROPERTY,
        ),
        (
            "x:",
            "Horizontal position (parent-relative)",
            CompletionItemKind::PROPERTY,
        ),
        (
            "y:",
            "Vertical position (parent-relative)",
            CompletionItemKind::PROPERTY,
        ),
        (
            "align:",
            "Text alignment (left|center|right [top|middle|bottom])",
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
        ("frame", "Nested frame"),
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
        label: "when".to_string(),
        kind: Some(CompletionItemKind::SNIPPET),
        detail: Some("Animation block (legacy: anim)".to_string()),
        insert_text: Some("when :${1|hover,press,enter|} {\n  $0\n}".to_string()),
        insert_text_format: Some(InsertTextFormat::SNIPPET),
        ..Default::default()
    });

    // Spec block
    items.push(CompletionItem {
        label: "spec".to_string(),
        kind: Some(CompletionItemKind::SNIPPET),
        detail: Some("Structured annotation block".to_string()),
        insert_text: Some(
            "spec {\n  \"${1:description}\"\n  status: ${2|todo,doing,done,blocked|}\n  priority: ${3|low,medium,high,critical|}\n}"
                .to_string(),
        ),
        insert_text_format: Some(InsertTextFormat::SNIPPET),
        ..Default::default()
    });

    // Annotation shorthand
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
            ("todo", "To do (not started)"),
            ("doing", "In progress"),
            ("done", "Completed"),
            ("blocked", "Blocked / waiting"),
        ],
        "priority" => &[
            ("low", "Low priority"),
            ("medium", "Medium priority"),
            ("high", "High priority"),
            ("critical", "Critical priority"),
        ],
        "fill" | "background" | "color" => &[
            ("#6C5CE7", "Purple"),
            ("#FF6B6B", "Red-ish"),
            ("#3B82F6", "Blue"),
            ("#22C55E", "Green"),
            ("#F59E0B", "Amber"),
            ("#EC4899", "Pink"),
            ("#333333", "Dark gray"),
            ("#FFFFFF", "White"),
            ("red", "Named: red"),
            ("blue", "Named: blue"),
            ("green", "Named: green"),
            ("purple", "Named: purple"),
            ("orange", "Named: orange"),
            ("pink", "Named: pink"),
            ("white", "Named: white"),
            ("black", "Named: black"),
        ],
        "align" | "text_align" => &[
            ("left", "Left-align text"),
            ("center", "Center-align text"),
            ("right", "Right-align text"),
            ("left top", "Left + top"),
            ("center middle", "Center + middle (default)"),
            ("right bottom", "Right + bottom"),
        ],
        "clip" => &[("true", "Clip children to bounds")],
        "arrow" => &[
            ("none", "No arrowheads"),
            ("start", "Arrow at start"),
            ("end", "Arrow at end"),
            ("both", "Arrows at both ends"),
        ],
        "curve" => &[
            ("straight", "Straight line"),
            ("smooth", "Smooth curve"),
            ("step", "Step / orthogonal routing"),
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
        assert!(
            labels.contains(&"theme"),
            "should suggest `theme` not `style`"
        );
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
        assert_eq!(compute_brace_depth(text, Position::new(2, 4)), 2);
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
