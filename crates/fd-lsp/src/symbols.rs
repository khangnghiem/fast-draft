//! Document symbols: provide outline/go-to-symbol for FD documents.

use fd_core::SceneGraph;
use tower_lsp::lsp_types::*;

/// Compute document symbols from parsed scene graph.
///
/// Returns a flat list of `SymbolInformation` for nodes and styles,
/// with line ranges computed from the source text.
#[allow(deprecated)] // SymbolInformation::deprecated is deprecated but required
pub fn compute_symbols(text: &str, graph: Option<&SceneGraph>) -> Vec<SymbolInformation> {
    let mut symbols = Vec::new();

    // Style definitions
    for (i, line) in text.lines().enumerate() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("style ")
            && let Some(name) = rest.split_whitespace().next()
        {
            symbols.push(SymbolInformation {
                name: format!("style {}", name),
                kind: SymbolKind::CLASS,
                location: Location {
                    uri: Url::parse("file:///dummy").unwrap(),
                    range: Range {
                        start: Position::new(i as u32, 0),
                        end: Position::new(i as u32, line.len() as u32),
                    },
                },
                tags: None,
                deprecated: None,
                container_name: None,
            });
        }
    }

    // Scene graph nodes
    if let Some(graph) = graph {
        let node_lines = find_node_lines(text);
        for (id_str, line_num) in &node_lines {
            if let Some(node) = graph.get_by_id(fd_core::NodeId::intern(id_str)) {
                let kind_name = match &node.kind {
                    fd_core::NodeKind::Root => continue,
                    fd_core::NodeKind::Generic => "",
                    fd_core::NodeKind::Group { .. } => "group",
                    fd_core::NodeKind::Frame { .. } => "frame",
                    fd_core::NodeKind::Rect { .. } => "rect",
                    fd_core::NodeKind::Ellipse { .. } => "ellipse",
                    fd_core::NodeKind::Path { .. } => "path",
                    fd_core::NodeKind::Text { .. } => "text",
                };

                let line = text.lines().nth(*line_num).unwrap_or("");

                symbols.push(SymbolInformation {
                    name: if kind_name.is_empty() {
                        format!("@{}", id_str)
                    } else {
                        format!("{} @{}", kind_name, id_str)
                    },
                    kind: match kind_name {
                        "group" | "frame" => SymbolKind::NAMESPACE,
                        "text" => SymbolKind::STRING,
                        _ => SymbolKind::OBJECT,
                    },
                    location: Location {
                        uri: Url::parse("file:///dummy").unwrap(),
                        range: Range {
                            start: Position::new(*line_num as u32, 0),
                            end: Position::new(*line_num as u32, line.len() as u32),
                        },
                    },
                    tags: None,
                    deprecated: None,
                    container_name: None,
                });
            }
        }
    }

    symbols
}

/// Find all `@id` declarations and their line numbers.
fn find_node_lines(text: &str) -> Vec<(String, usize)> {
    let mut results = Vec::new();
    let node_keywords = ["group", "frame", "rect", "ellipse", "path", "text"];

    for (i, line) in text.lines().enumerate() {
        let trimmed = line.trim();

        // Generic node: line starts with @id {
        if let Some(after_at) = trimmed.strip_prefix('@') {
            let id: String = after_at
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            if !id.is_empty() && !id.starts_with("_anon_") {
                let rest = after_at[id.len()..].trim_start();
                if rest.starts_with('{') {
                    results.push((id, i));
                    continue;
                }
            }
        }

        // Typed node: keyword @id {
        for keyword in &node_keywords {
            if trimmed.starts_with(keyword)
                && let Some(at_pos) = trimmed.find('@')
            {
                let after_at = &trimmed[at_pos + 1..];
                let id: String = after_at
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !id.is_empty() && !id.starts_with("_anon_") {
                    results.push((id, i));
                }
            }
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_node_lines_basic() {
        let text = "rect @box {\n  w: 100\n}\ntext @label \"Hi\" {\n  fill: #333\n}";
        let lines = find_node_lines(text);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].0, "box");
        assert_eq!(lines[0].1, 0);
        assert_eq!(lines[1].0, "label");
        assert_eq!(lines[1].1, 3);
    }

    #[test]
    fn compute_symbols_with_graph() {
        let text = "style accent {\n  fill: #6C5CE7\n}\nrect @box {\n  w: 100 h: 50\n}";
        let graph = fd_core::parser::parse_document(text).ok();
        let syms = compute_symbols(text, graph.as_ref());

        let names: Vec<&str> = syms.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"style accent"));
        assert!(names.contains(&"rect @box"));
    }
}
