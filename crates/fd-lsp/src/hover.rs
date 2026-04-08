//! Hover: show contextual information on hover.

use fd_core::SceneGraph;
use tower_lsp::lsp_types::*;

/// Compute hover information at the given position.
///
/// - Hovering an `@id` → shows node type and properties.
/// - Hovering a node keyword → shows description from FD spec.
/// - Hovering a property name → shows accepted values.
/// - Hovering a note file path → shows file path info.
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

    // Note file path hover: detect "path.md" on lines starting with note/spec
    if let Some(info) = hover_note_file_path(line) {
        return Some(info);
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
        fd_core::NodeKind::Group => "Group",
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
        fd_core::NodeKind::Image {
            source,
            width,
            height,
            ..
        } => {
            let src = match source {
                fd_core::model::ImageSource::File(p) => p.as_str(),
            };
            let desc = format!("**Image** — {}×{} src=\"{}\"", width, height, src);
            return Some(make_hover(&desc));
        }
        fd_core::NodeKind::Icon { library, name } => {
            let desc = format!("**Icon** — `{}.{}`", library, name);
            return Some(make_hover(&desc));
        }
        fd_core::NodeKind::Text { content, .. } => {
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
            "**group** — Organizational container (like Figma Group).\n\nInvisible on canvas. Auto-sizes to children. No own styles or layout modes."
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
        "path" => {
            "**path** — Freeform vector path.\n\nSupports SVG-like path commands via `d:` property."
        }
        "image" => {
            "**image** — Embedded image node.\n\nProperties: `src:` `w:` `h:` `fit:` (`cover`|`contain`|`fill`|`none`)"
        }
        "icon" => {
            "**icon** — Semantic icon node.\n\nReferences an external icon library (e.g., Lucide).\nProperties: `icon: library.name` `w:` `h:` `stroke:` `fill:`\nExample: `icon @search { icon: lucide.search }`"
        }
        "style" | "theme" => {
            "**style** — Reusable style definition.\n\nDefine once, apply to nodes with `use: style_name`.\n(Legacy keyword `theme` also accepted.)"
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
        "anim" | "when" => {
            "**when** — Animation block.\n\nFormat: `when :trigger { props }`\nTriggers: `:hover`, `:press`, `:enter`\n(Legacy keyword `anim` also accepted.)"
        }
        "ease" => {
            "**ease:** — Easing function.\n\nValues: `linear`, `ease_in`, `ease_out`, `ease_in_out`, `spring`\nFormat: `ease: spring 300ms`"
        }
        "spring" => "**spring** — Spring physics easing.\n\nnatural bounce animation.",
        // Annotations / notes
        "note" | "spec" => {
            "**note** — Markdown note block.\n\nInline: `note \"description\"`\nBlock: `note { markdown content }`\nFile link: `note \"./path.md\"` (renders linked file)\n\n`@include(\"path.md\")` can embed files within block notes.\n(Legacy keyword `spec` also accepted.)"
        }
        _ => return None,
    };

    Some(make_hover(info))
}

/// Detect file path references in note lines: `note "./path.md"`.
fn hover_note_file_path(line: &str) -> Option<Hover> {
    let trimmed = line.trim();
    // Match: note "path.md" or spec "path.md"
    let path = if let Some(rest) = trimmed
        .strip_prefix("note ")
        .or_else(|| trimmed.strip_prefix("spec "))
    {
        let rest = rest.trim();
        if rest.starts_with('"') && rest.ends_with('"') && rest.len() > 2 {
            let inner = &rest[1..rest.len() - 1];
            if inner.ends_with(".md") {
                Some(inner)
            } else {
                None
            }
        } else {
            None
        }
    }
    // Match: @include("path.md") within block notes
    else if trimmed.contains("@include(") {
        let start = trimmed.find("@include(\"")? + 10;
        let end = trimmed[start..].find("\")")? + start;
        let inner = &trimmed[start..end];
        if inner.ends_with(".md") {
            Some(inner)
        } else {
            None
        }
    } else {
        None
    };

    path.map(|p| {
        make_hover(&format!(
            "📎 **Linked file**: `{}`\n\nThis note references an external markdown file.\nIn VS Code, the file content is rendered inline in the Notes panel.",
            p
        ))
    })
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

    #[test]
    fn hover_on_style_keyword() {
        let result = hover_keyword("style");
        assert!(result.is_some(), "should have hover info for `style`");
    }

    #[test]
    fn hover_on_when_keyword() {
        let result = hover_keyword("when");
        assert!(result.is_some(), "should have hover info for `when`");
    }
}
