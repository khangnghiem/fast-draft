use std::cmp::min;

/// Represents the type of a completion item, determining its icon and grouping.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionKind {
    /// A top-level node definition keyword (e.g., `rect`, `ellipse`, `group`).
    Keyword,
    /// A node body property (e.g., `fill:`, `stroke:`).
    Property,
    /// A value for a property (e.g., `#6C5CE7`, `center`).
    Value,
    /// A block structure snippet (e.g., `when :hover { ... }`).
    Snippet,
    /// A reference to a style or another node (e.g., `use: ...`).
    Reference,
}

/// Data structure containing the static parts of an LSP completion item.
#[derive(Debug, Clone)]
pub struct CompletionItemData {
    /// The label displayed in the completion menu.
    pub label: &'static str,
    /// A short description shown alongside the label.
    pub detail: &'static str,
    /// The kind of the completion item.
    pub kind: CompletionKind,
    /// The snippet template, optionally containing `$0`, `$1`, etc.
    pub snippet: Option<&'static str>,
}

/// Returns completion items that are valid at the top level of a document.
pub fn top_level_items() -> Vec<CompletionItemData> {
    vec![
        CompletionItemData {
            label: "import",
            detail: "Import another .fd file",
            kind: CompletionKind::Keyword,
            snippet: Some("import \"${1:path.fd}\" as ${2:name}"),
        },
        CompletionItemData {
            label: "group",
            detail: "Group container for child nodes",
            kind: CompletionKind::Keyword,
            snippet: Some("group @${1:name} {\n  $0\n}"),
        },
        CompletionItemData {
            label: "rect",
            detail: "Rectangle shape",
            kind: CompletionKind::Keyword,
            snippet: Some("rect @${1:name} {\n  w: ${2:100} h: ${3:50}\n  fill: #${4:6C5CE7}\n}"),
        },
        CompletionItemData {
            label: "ellipse",
            detail: "Ellipse / circle shape",
            kind: CompletionKind::Keyword,
            snippet: Some("ellipse @${1:name} {\n  w: ${2:50} h: ${3:50}\n  fill: #${4:FF6B6B}\n}"),
        },
        CompletionItemData {
            label: "text",
            detail: "Text label",
            kind: CompletionKind::Keyword,
            snippet: Some("text @${1:name} \"${2:Hello}\" {\n  fill: #${3:333333}\n}"),
        },
        CompletionItemData {
            label: "path",
            detail: "Freeform path",
            kind: CompletionKind::Keyword,
            snippet: Some("path @${1:name} {\n  $0\n}"),
        },
        CompletionItemData {
            label: "frame",
            detail: "Frame container with clip",
            kind: CompletionKind::Keyword,
            snippet: Some("frame @${1:name} {\n  w: ${2:300} h: ${3:200}\n  $0\n}"),
        },
        CompletionItemData {
            label: "style",
            detail: "Reusable style definition",
            kind: CompletionKind::Keyword,
            snippet: Some("style ${1:name} {\n  fill: #${2:6C5CE7}\n}"),
        },
        CompletionItemData {
            label: "edge",
            detail: "Edge / connection between nodes",
            kind: CompletionKind::Keyword,
            snippet: Some(
                "edge @${1:name} {\n  from: @${2:source}\n  to: @${3:target}\n  arrow: end\n}",
            ),
        },
    ]
}

/// Returns completion items that are valid inside the body of a node block.
pub fn node_body_items() -> Vec<CompletionItemData> {
    vec![
        CompletionItemData {
            label: "w:",
            detail: "Width",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "h:",
            detail: "Height",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "fill:",
            detail: "Fill color",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "stroke:",
            detail: "Stroke color and width",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "corner:",
            detail: "Corner radius",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "opacity:",
            detail: "Opacity (0.0–1.0)",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "font:",
            detail: "Font family, weight, size",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "bg:",
            detail: "Background with inline shadow/corner",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "use:",
            detail: "Reference a named style",
            kind: CompletionKind::Reference,
            snippet: None,
        },
        CompletionItemData {
            label: "layout:",
            detail: "Layout mode for children",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "shadow:",
            detail: "Drop shadow (ox,oy,blur,#color)",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "clip:",
            detail: "Clip children to bounds (frames)",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "x:",
            detail: "Horizontal position (parent-relative)",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "y:",
            detail: "Vertical position (parent-relative)",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "align:",
            detail: "Text alignment (left|center|right [top|middle|bottom])",
            kind: CompletionKind::Property,
            snippet: None,
        },
        CompletionItemData {
            label: "group",
            detail: "Nested group",
            kind: CompletionKind::Keyword,
            snippet: None,
        },
        CompletionItemData {
            label: "rect",
            detail: "Nested rectangle",
            kind: CompletionKind::Keyword,
            snippet: None,
        },
        CompletionItemData {
            label: "ellipse",
            detail: "Nested ellipse",
            kind: CompletionKind::Keyword,
            snippet: None,
        },
        CompletionItemData {
            label: "text",
            detail: "Nested text",
            kind: CompletionKind::Keyword,
            snippet: None,
        },
        CompletionItemData {
            label: "path",
            detail: "Nested path",
            kind: CompletionKind::Keyword,
            snippet: None,
        },
        CompletionItemData {
            label: "frame",
            detail: "Nested frame",
            kind: CompletionKind::Keyword,
            snippet: None,
        },
        CompletionItemData {
            label: "when",
            detail: "Animation block",
            kind: CompletionKind::Snippet,
            snippet: Some("when :${1|hover,press,enter|} {\n  $0\n}"),
        },
        CompletionItemData {
            label: "spec",
            detail: "Structured annotation block",
            kind: CompletionKind::Snippet,
            snippet: Some("spec {\n  \"${1:description}\"\n}"),
        },
        CompletionItemData {
            label: "##",
            detail: "Annotation",
            kind: CompletionKind::Snippet,
            snippet: Some("## \"${1:description}\""),
        },
    ]
}

/// Returns context-specific completion values based on the current property key.
pub fn value_completions_data(property: &str) -> Vec<CompletionItemData> {
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
        _ => &[],
    };

    let mut items = Vec::new();
    for &(label, detail) in values {
        items.push(CompletionItemData {
            label,
            detail,
            kind: CompletionKind::Value,
            snippet: None,
        });
    }
    items
}

/// Computes the nesting depth (number of unmatched open braces) at a given cursor position.
pub fn compute_brace_depth(text: &str, line: usize, col: usize) -> usize {
    let mut depth: i32 = 0;
    for (i, ln) in text.lines().enumerate() {
        if i > line {
            break;
        }
        let end = if i == line {
            min(col, ln.len())
        } else {
            ln.len()
        };
        for ch in ln[..end].chars() {
            match ch {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
        }
    }
    depth.max(0) as usize
}
