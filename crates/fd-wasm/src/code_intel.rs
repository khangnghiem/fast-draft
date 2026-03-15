//! Code mode helpers — diagnostics, completions, hover, validation.
//!
//! These are standalone functions that don't require canvas state,
//! plus `impl FdCanvas` wrappers that delegate to the standalone versions.

use crate::FdCanvas;
use crate::responses::{CompletionItem, DiagnosticEntry, ParseResult, ValidateResult};
use wasm_bindgen::prelude::*;

// ─── FdCanvas wrappers ──────────────────────────────────────────────────

#[wasm_bindgen]
impl FdCanvas {
    /// Get parse diagnostics for the current document text.
    pub fn get_diagnostics(&mut self) -> String {
        let text = self.engine.text.clone();
        get_diagnostics_for_text(&text)
    }

    /// Get context-aware completions at the cursor position.
    pub fn get_completions(&self, line: u32, col: u32) -> String {
        let text = self.engine.text.clone();
        get_completions_for_text(&text, line, col)
    }

    /// Get hover information at the cursor position.
    pub fn get_hover(&self, line: u32, col: u32) -> String {
        let text = self.engine.text.clone();
        get_hover_for_text(&text, line, col)
    }

    /// Compute the AI comprehensibility score (R4.21).
    /// Returns JSON: `{"total":72,"metrics":[{"name":"...","label":"...","score":15,"suggestion":"..."},...]}`
    pub fn compute_score(&self) -> String {
        let report = fd_core::score::compute_score(&self.engine.graph);
        let metrics_json: Vec<String> = report
            .metrics
            .iter()
            .map(|m| {
                format!(
                    r#"{{"name":"{}","label":"{}","score":{},"suggestion":"{}"}}"#,
                    m.name,
                    m.label,
                    m.score,
                    m.suggestion.replace('"', r#"\""#)
                )
            })
            .collect();
        format!(
            r#"{{"total":{},"metrics":[{}]}}"#,
            report.total,
            metrics_json.join(",")
        )
    }
}

// ─── Standalone validation functions (no canvas needed) ──────────────────

/// Validate FD source text.
#[wasm_bindgen]
pub fn validate(source: &str) -> String {
    match fd_core::parser::parse_document(source) {
        Ok(_) => serde_json::to_string(&ValidateResult {
            ok: true,
            error: None,
        })
        .unwrap_or_else(|_| r#"{"ok":true}"#.to_string()),
        Err(e) => serde_json::to_string(&ValidateResult {
            ok: false,
            error: Some(e),
        })
        .unwrap_or_else(|_| r#"{"ok":false,"error":"unknown"}"#.to_string()),
    }
}

/// Parse FD source and return the scene graph as JSON for the tree preview.
#[wasm_bindgen]
pub fn parse_to_json(source: &str) -> String {
    match fd_core::parser::parse_document(source) {
        Ok(graph) => {
            let nodes = collect_node_tree(&graph, graph.root);
            serde_json::to_string(&ParseResult {
                ok: true,
                error: None,
                nodes: Some(nodes),
            })
            .unwrap_or_else(|e| {
                serde_json::to_string(&ParseResult {
                    ok: false,
                    error: Some(format!("Serialization error: {e}")),
                    nodes: None,
                })
                .unwrap_or_default()
            })
        }
        Err(e) => serde_json::to_string(&ParseResult {
            ok: false,
            error: Some(e),
            nodes: None,
        })
        .unwrap_or_default(),
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────

fn get_diagnostics_for_text(text: &str) -> String {
    match fd_core::parser::parse_document(text) {
        Ok(_) => "[]".to_string(),
        Err(err_msg) => {
            let (line, col) = extract_error_pos(text, &err_msg);
            let entry = DiagnosticEntry {
                line,
                col,
                end_col: col + 1,
                message: err_msg,
                severity: "error".to_string(),
            };
            serde_json::to_string(&vec![entry]).unwrap_or_else(|_| "[]".to_string())
        }
    }
}

fn extract_error_pos(source: &str, error: &str) -> (u32, u32) {
    if let Some(at_idx) = error.find("at '") {
        let remaining = &error[at_idx + 4..];
        if let Some(end) = remaining.find('\'') {
            let snippet = &remaining[..end];
            if let Some(offset) = source.find(snippet) {
                return offset_to_lc(source, offset);
            }
        }
    }
    let line_count = source.lines().count();
    if line_count == 0 {
        return (0, 0);
    }
    let last_line = line_count.saturating_sub(1) as u32;
    let last_col = source.lines().last().map_or(0, |l| l.len() as u32);
    (last_line, last_col)
}

fn offset_to_lc(source: &str, offset: usize) -> (u32, u32) {
    let mut line = 0u32;
    let mut col = 0u32;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 0;
        } else {
            col += 1;
        }
    }
    (line, col)
}

fn get_completions_for_text(text: &str, line: u32, col: u32) -> String {
    let cur_line = text.lines().nth(line as usize).unwrap_or("");
    let end = std::cmp::min(col as usize, cur_line.len());
    let before = cur_line[..end].trim();

    if let Some(prop) = before
        .strip_suffix(':')
        .or_else(|| before.strip_suffix(": "))
    {
        let prop_name = prop.split_whitespace().last().unwrap_or("");
        return completions_json(&fd_core::completion::value_completions_data(prop_name));
    }

    let depth = fd_core::completion::compute_brace_depth(text, line, col);
    if depth == 0 {
        completions_json(&fd_core::completion::top_level_items())
    } else {
        completions_json(&fd_core::completion::node_body_items())
    }
}

fn completions_json(items: &[(&str, &str, &str)]) -> String {
    let entries: Vec<CompletionItem> = items
        .iter()
        .map(|(label, kind, detail)| CompletionItem {
            label: label.to_string(),
            kind: kind.to_string(),
            detail: detail.to_string(),
        })
        .collect();
    serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string())
}

fn get_hover_for_text(text: &str, line: u32, col: u32) -> String {
    let Some(cur_line) = text.lines().nth(line as usize) else {
        return String::new();
    };
    let word = extract_word(cur_line, col as usize);
    if word.is_empty() {
        return String::new();
    }

    // @id hover — show node kind
    if let Some(id) = word.strip_prefix('@') {
        let pattern = format!("@{id}");
        for ln in text.lines() {
            let trimmed = ln.trim();
            if trimmed.contains(&pattern) {
                for kw in &["rect", "ellipse", "text", "frame", "group", "path", "edge"] {
                    if trimmed.starts_with(kw) {
                        let escaped = format!(
                            "**@{id}** — {kind} node",
                            kind = kw
                                .chars()
                                .next()
                                .unwrap()
                                .to_uppercase()
                                .collect::<String>()
                                + &kw[1..]
                        );
                        return format!(r#"{{"content":"{escaped}"}}"#);
                    }
                }
            }
        }
        return format!(r#"{{"content":"**@{id}** — node reference"}}"#);
    }

    // Keyword / property hover
    let info = match word {
        "rect" => {
            "**rect** — Rectangle shape.\\n\\nProperties: `w:` `h:` `fill:` `stroke:` `corner:` `opacity:`"
        }
        "ellipse" => {
            "**ellipse** — Ellipse or circle shape.\\n\\nProperties: `w:` `h:` `fill:` `stroke:` `opacity:`"
        }
        "text" => {
            "**text** — Text label node.\\n\\nInline content: `text @id \\\"content\\\" { ... }`"
        }
        "frame" => {
            "**frame** — Visible container with explicit size.\\n\\nSupports `layout:` for auto arrangement."
        }
        "group" => {
            "**group** — Organizational container.\\n\\nInvisible on canvas. Auto-sizes to children."
        }
        "path" => "**path** — Freeform vector path.\\n\\nSVG-like commands via `d:` property.",
        "style" | "theme" => {
            "**style** — Reusable style definition.\\n\\nApply to nodes with `use: style_name`."
        }
        "edge" => {
            "**edge** — Connection between nodes.\\n\\n`from:` `to:` `arrow:` `curve:` `flow:`"
        }
        "w" | "width" => "**w:** — Width in pixels.",
        "h" | "height" => "**h:** — Height in pixels.",
        "fill" => "**fill:** — Fill color. Accepts `#RGB`, `#RRGGBB`, named colors.",
        "stroke" => "**stroke:** — Stroke color and width.",
        "corner" => "**corner:** — Corner radius.",
        "opacity" => "**opacity:** — 0.0 (transparent) to 1.0 (opaque).",
        "font" => "**font:** — Font spec: `\\\"Family\\\" weight size`.",
        "bg" => "**bg:** — Background with inline corner/shadow.",
        "use" => "**use:** — Reference a named style.",
        "layout" => "**layout:** — Children arrangement: `column`, `row`, `grid`, `free`.",
        "when" | "anim" => "**when** — Animation block. Triggers: `:hover`, `:press`, `:enter`.",
        "spec" => "**spec** — Structured annotation block.",
        "ease" => "**ease:** — Easing: `linear`, `ease_in`, `ease_out`, `spring`.",
        "shadow" => "**shadow:** — Drop shadow `(ox,oy,blur,#color)`.",
        "align" => "**align:** — Text alignment: `left|center|right [top|middle|bottom]`.",
        _ => return String::new(),
    };

    format!(r#"{{"content":"{info}"}}"#)
}

fn extract_word(line: &str, col: usize) -> &str {
    let bytes = line.as_bytes();
    let col = col.min(line.len());
    let start = (0..col)
        .rev()
        .take_while(|&i| {
            i < bytes.len()
                && (bytes[i].is_ascii_alphanumeric()
                    || bytes[i] == b'_'
                    || bytes[i] == b'@'
                    || bytes[i] == b'#')
        })
        .count();
    let begin = col.saturating_sub(start);
    let end_off = (col..line.len())
        .take_while(|&i| bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_')
        .count();
    &line[begin..col + end_off]
}

/// Recursively collect nodes into a serializable tree structure.
fn collect_node_tree(graph: &fd_core::SceneGraph, idx: fd_core::NodeIndex) -> serde_json::Value {
    let node = &graph.graph[idx];
    let kind_str = match &node.kind {
        fd_core::NodeKind::Root => "root",
        fd_core::NodeKind::Generic => "generic",
        fd_core::NodeKind::Group => "group",
        fd_core::NodeKind::Frame { .. } => "frame",
        fd_core::NodeKind::Rect { .. } => "rect",
        fd_core::NodeKind::Ellipse { .. } => "ellipse",
        fd_core::NodeKind::Path { .. } => "path",
        fd_core::NodeKind::Image { .. } => "image",
        fd_core::NodeKind::Text { .. } => "text",
    };
    let children: Vec<serde_json::Value> = graph
        .children(idx)
        .into_iter()
        .map(|child_idx| collect_node_tree(graph, child_idx))
        .collect();

    let mut obj = serde_json::json!({
        "id": node.id.as_str(),
        "kind": kind_str,
    });
    if let fd_core::NodeKind::Text { content, .. } = &node.kind {
        obj["text"] = serde_json::Value::String(content.clone());
    }
    if let fd_core::NodeKind::Rect { width, height } = &node.kind {
        obj["width"] = serde_json::json!(width);
        obj["height"] = serde_json::json!(height);
    }
    if !children.is_empty() {
        obj["children"] = serde_json::Value::Array(children);
    }
    if let Some(note) = &node.note {
        obj["note"] = serde_json::Value::String(note.clone());
    }
    obj
}
