import sys
content = open("crates/fd-lsp/src/completion.rs").read()

imports = """use tower_lsp::lsp_types::*;
use fd_core::completion::*;"""

compute_func = """pub fn compute_completions(text: &str, pos: Position) -> Vec<CompletionItem> {
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
}"""

top_level = """fn top_level_completions() -> Vec<CompletionItem> {
    let keywords = [
        (
            "import",
            "Import another .fd file",
            "import \\"${1:path.fd}\\" as ${2:name}",
        ),
        (
            "group",
            "Group container for child nodes",
            "group @${1:name} {\\n  $0\\n}",
        ),
        (
            "rect",
            "Rectangle shape",
            "rect @${1:name} {\\n  w: ${2:100} h: ${3:50}\\n  fill: #${4:6C5CE7}\\n}",
        ),
        (
            "ellipse",
            "Ellipse / circle shape",
            "ellipse @${1:name} {\\n  w: ${2:50} h: ${3:50}\\n  fill: #${4:FF6B6B}\\n}",
        ),
        (
            "text",
            "Text label",
            "text @${1:name} \\"${2:Hello}\\" {\\n  fill: #${3:333333}\\n}",
        ),
        ("path", "Freeform path", "path @${1:name} {\\n  $0\\n}"),
        (
            "frame",
            "Frame container with clip",
            "frame @${1:name} {\\n  w: ${2:300} h: ${3:200}\\n  $0\\n}",
        ),
        (
            "style",
            "Reusable style definition (legacy: theme)",
            "style ${1:name} {\\n  fill: #${2:6C5CE7}\\n}",
        ),
        (
            "edge",
            "Edge / connection between nodes",
            "edge @${1:name} {\\n  from: @${2:source}\\n  to: @${3:target}\\n  arrow: end\\n}",
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
}"""

node_body = """fn node_body_completions() -> Vec<CompletionItem> {
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
        ("when", "Animation block", "when ${1:hover} {\\n  $0\\n}"),
        ("spec", "Annotation block", "spec {\\n  status: ${1:todo}\\n}"),
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
}"""

test_block = content.split("#[cfg(test)]")[1]

with open("crates/fd-lsp/src/completion.rs", "w") as f:
    f.write(f"//! Completions: context-aware FD completions.\n\n{imports}\n\n{compute_func}\n\n{top_level}\n\n{node_body}\n\n#[cfg(test)]\n{test_block}")
