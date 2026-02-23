//! Hover: show contextual information on hover.

use fd_core::SceneGraph;
use tower_lsp::lsp_types::*;

/// Compute hover information at the given position.
///
/// - Hovering an `@id` → shows node type and properties.
/// - Hovering a node keyword → shows description from FD spec.
/// - Hovering a property name → shows accepted values.
pub fn compute_hover(text: &str, pos: Position, graph: Option<&SceneGraph>) -> Option<Hover> {
    let line = text.lines().nth(pos.line as usize)?;
    let word = extract_word_at(line, pos.character as usize);

    if word.is_empty() {
        return None;
    }

    // Node ID hover (starts with @)
    if let Some(id) = word.strip_prefix('@') {
        return hover_node_id(id, graph);
    }

    // Keyword / property hover
    hover_keyword(word)
}

/// Extract the word at a given column in a line.
fn extract_word_at(line: &str, col: usize) -> &str {
    let col = col.min(line.len());
    let bytes = line.as_bytes();

    // Find word start
    let start = (0..col)
        .rev()
        .find(|&i| !is_word_char(bytes[i]))
        .map(|i| i + 1)
        .unwrap_or(0);

    // Find word end
    let end = (col..bytes.len())
        .find(|&i| !is_word_char(bytes[i]))
        .unwrap_or(bytes.len());

    &line[start..end]
}

fn is_word_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'@' || b == b'#'
}

/// Hover info for a node `@id`.
fn hover_node_id(id: &str, graph: Option<&SceneGraph>) -> Option<Hover> {
    let graph = graph?;
    let node_id = fd_core::NodeId::intern(id);
    let node = graph.get_by_id(node_id)?;

    let kind_str = match &node.kind {
        fd_core::NodeKind::Root => "Root",
        fd_core::NodeKind::Generic => "Generic (placeholder)",
        fd_core::NodeKind::Group { .. } => "Group",
        fd_core::NodeKind::Frame { width, height, .. } => {
            let desc = format!("**Frame** — {}×{}", width, height);
            return Some(make_hover(&desc));
        }
        fd_core::NodeKind::Rect { width, height } => {
            let desc = format!("**Rect** — {}×{}", width, height);
            return Some(make_hover(&desc));
        }
        fd_core::NodeKind::Ellipse { rx, ry } => {
            let desc = format!("**Ellipse** — rx={}, ry={}", rx, ry);
            return Some(make_hover(&desc));
        }
        fd_core::NodeKind::Path { commands } => {
            let desc = format!("**Path** — {} commands", commands.len());
            return Some(make_hover(&desc));
        }
        fd_core::NodeKind::Text { content } => {
            let desc = format!("**Text** — \"{}\"", content);
            return Some(make_hover(&desc));
        }
    };

    Some(make_hover(&format!("**{}** `@{}`", kind_str, id)))
}

/// Hover info for FD keywords and properties.
fn hover_keyword(word: &str) -> Option<Hover> {
    let info = match word {
        // Node types
        "group" => {
            "**group** — Logical container for child elements.\n\nInvisible on canvas. Supports `layout:` for automatic arrangement of children."
        }
        "frame" => {
            "**frame** — Visible container with explicit size.\n\nLike a Figma frame: has fill/stroke, declared `w:` `h:`, optional `clip: true`.\nSupports `layout:` for automatic arrangement of children."
        }
        "rect" => {
            "**rect** — Rectangle shape.\n\nProperties: `w:` `h:` `fill:` `stroke:` `corner:` `opacity:`"
        }
        "ellipse" => {
            "**ellipse** — Ellipse or circle shape.\n\nProperties: `w:` (rx) `h:` (ry) `fill:` `stroke:` `opacity:`"
        }
        "text" => {
            "**text** — Text label node.\n\nInline content: `text @id \"content\" { ... }`\nProperties: `font:` `fill:` `opacity:`"
        }
        "path" => "**path** — Freeform vector path.\n\nSupports SVG-like path commands.",
        "style" => {
            "**style** — Reusable style definition.\n\nDefine once, apply to nodes with `use: style_name`."
        }
        // Properties
        "w" | "width" => "**w:** — Width of the element in pixels.",
        "h" | "height" => "**h:** — Height of the element in pixels.",
        "fill" => "**fill:** — Fill color.\n\nAccepts hex: `#RGB`, `#RRGGBB`, `#RRGGBBAA`",
        "stroke" => "**stroke:** — Stroke color and width.\n\nFormat: `stroke: #COLOR width`",
        "corner" => "**corner:** — Corner radius for rounded shapes.",
        "opacity" => "**opacity:** — Opacity value from 0.0 (transparent) to 1.0 (opaque).",
        "font" => {
            "**font:** — Font specification.\n\nFormat: `font: \"Family\" weight size`\nExample: `font: \"Inter\" 600 24`"
        }
        "bg" => {
            "**bg:** — Background fill with inline corner/shadow.\n\nFormat: `bg: #COLOR corner=N shadow=(x,y,blur,#COL)`"
        }
        "use" => "**use:** — Reference a named style definition.\n\nExample: `use: accent`",
        "layout" => {
            "**layout:** — Children arrangement mode.\n\nValues: `column`, `row`, `grid`, `free`\nModifiers: `gap=N`, `pad=N`, `cols=N`"
        }
        // Layout modes
        "column" => "**column** — Vertical stack layout.\n\nModifiers: `gap=N` `pad=N`",
        "row" => "**row** — Horizontal stack layout.\n\nModifiers: `gap=N` `pad=N`",
        "grid" => "**grid** — Grid layout.\n\nModifiers: `cols=N` `gap=N` `pad=N`",
        // Animation
        "anim" => {
            "**anim** — Animation block.\n\nFormat: `anim :trigger { props }`\nTriggers: `:hover`, `:press`, `:enter`"
        }
        "ease" => {
            "**ease:** — Easing function.\n\nValues: `linear`, `ease_in`, `ease_out`, `ease_in_out`, `spring`\nFormat: `ease: spring 300ms`"
        }
        "spring" => "**spring** — Spring physics easing.\n\nnatural bounce animation.",
        // Annotations
        "accept" => {
            "**## accept:** — Acceptance criterion annotation.\n\nFormat: `## accept: \"description\"`"
        }
        "status" => {
            "**## status:** — Status annotation.\n\nValues: `draft`, `in_progress`, `review`, `done`"
        }
        "priority" => {
            "**## priority:** — Priority annotation.\n\nValues: `low`, `medium`, `high`, `critical`"
        }
        "tag" => "**## tag:** — Tag annotation.\n\nFormat: `## tag: category_name`",
        _ => return None,
    };

    Some(make_hover(info))
}

fn make_hover(content: &str) -> Hover {
    Hover {
        contents: HoverContents::Markup(MarkupContent {
            kind: MarkupKind::Markdown,
            value: content.to_string(),
        }),
        range: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_word_from_line() {
        let line = "  fill: #FF0000";
        assert_eq!(extract_word_at(line, 4), "fill");
        assert_eq!(extract_word_at(line, 8), "#FF0000");
    }

    #[test]
    fn hover_on_keyword() {
        let result = hover_keyword("rect");
        assert!(result.is_some());
    }

    #[test]
    fn hover_on_unknown_returns_none() {
        let result = hover_keyword("foobar");
        assert!(result.is_none());
    }

    #[test]
    fn hover_on_node_id_with_graph() {
        let text = "rect @mybox { w: 100 h: 50 }";
        let graph = fd_core::parser::parse_document(text).ok();
        let result = compute_hover(text, Position::new(0, 6), graph.as_ref());
        assert!(result.is_some());
    }
}
