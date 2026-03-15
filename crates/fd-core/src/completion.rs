//! Shared auto-completion context logic and static string definitions for both LSP and WASM Webview.

pub fn compute_brace_depth(text: &str, line: u32, col: u32) -> usize {
    let mut depth: i32 = 0;
    for (i, ln) in text.lines().enumerate() {
        if i > line as usize {
            break;
        }
        let end = if i == line as usize {
            std::cmp::min(col as usize, ln.len())
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

/// The top level keywords to suggest.
pub fn top_level_items() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("rect", "keyword", "Rectangle shape"),
        ("ellipse", "keyword", "Ellipse / circle shape"),
        ("text", "keyword", "Text label"),
        ("frame", "keyword", "Frame container with clip"),
        ("group", "keyword", "Group container"),
        ("path", "keyword", "Freeform path"),
        ("style", "keyword", "Reusable style definition"),
        ("edge", "keyword", "Edge / connection"),
        ("import", "keyword", "Import another .fd file"),
    ]
}

/// Node properties available for suggestion inside blocks.
pub fn node_body_items() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("w:", "property", "Width"),
        ("h:", "property", "Height"),
        ("fill:", "property", "Fill color"),
        ("stroke:", "property", "Stroke color and width"),
        ("corner:", "property", "Corner radius"),
        ("opacity:", "property", "Opacity (0.0–1.0)"),
        ("font:", "property", "Font family, weight, size"),
        ("bg:", "property", "Background shorthand"),
        ("use:", "property", "Reference a named style"),
        ("layout:", "property", "Layout mode for children"),
        ("shadow:", "property", "Drop shadow"),
        ("clip:", "property", "Clip children to bounds"),
        ("x:", "property", "X position"),
        ("y:", "property", "Y position"),
        ("align:", "property", "Text alignment"),
        ("when", "keyword", "Animation block"),
        ("spec", "keyword", "Annotation block"),
        ("rect", "keyword", "Nested rectangle"),
        ("ellipse", "keyword", "Nested ellipse"),
        ("text", "keyword", "Nested text"),
        ("frame", "keyword", "Nested frame"),
        ("group", "keyword", "Nested group"),
    ]
}

/// Values available to suggest after a property colon context.
pub fn value_completions_data(property: &str) -> Vec<(&'static str, &'static str, &'static str)> {
    match property {
        "layout" => vec![
            ("column", "value", "Vertical stack"),
            ("row", "value", "Horizontal stack"),
            ("grid", "value", "Grid layout"),
            ("free", "value", "Free positioning"),
        ],
        "ease" => vec![
            ("linear", "value", "Linear easing"),
            ("ease_in", "value", "Ease in"),
            ("ease_out", "value", "Ease out"),
            ("ease_in_out", "value", "Ease in-out"),
            ("spring", "value", "Spring physics"),
        ],
        "status" => vec![
            ("todo", "value", "Not started"),
            ("doing", "value", "In progress"),
            ("done", "value", "Completed"),
            ("blocked", "value", "Blocked"),
        ],
        "priority" => vec![
            ("low", "value", "Low"),
            ("medium", "value", "Medium"),
            ("high", "value", "High"),
            ("critical", "value", "Critical"),
        ],
        "fill" | "background" | "color" => vec![
            ("#6C5CE7", "value", "Purple"),
            ("#FF6B6B", "value", "Red"),
            ("#3B82F6", "value", "Blue"),
            ("#22C55E", "value", "Green"),
            ("#F59E0B", "value", "Amber"),
            ("#EC4899", "value", "Pink"),
            ("#333333", "value", "Dark gray"),
            ("#FFFFFF", "value", "White"),
            ("red", "value", "Named: red"),
            ("blue", "value", "Named: blue"),
            ("green", "value", "Named: green"),
            ("purple", "value", "Named: purple"),
            ("orange", "value", "Named: orange"),
            ("pink", "value", "Named: pink"),
            ("white", "value", "Named: white"),
            ("black", "value", "Named: black"),
        ],
        "align" => vec![
            ("left", "value", "Left-align"),
            ("center", "value", "Center-align"),
            ("right", "value", "Right-align"),
        ],
        "arrow" => vec![
            ("none", "value", "No arrow"),
            ("start", "value", "Arrow at start"),
            ("end", "value", "Arrow at end"),
            ("both", "value", "Arrow at both ends"),
        ],
        "curve" => vec![
            ("straight", "value", "Straight line"),
            ("smooth", "value", "Smooth bezier curve"),
            ("step", "value", "Orthogonal step routing"),
        ],
        _ => vec![],
    }
}
