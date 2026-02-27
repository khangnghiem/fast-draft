//! Document formatting pipeline: parse → transforms → emit.
//!
//! Combines lint auto-fixes, transform passes, and canonical emit into a
//! single idempotent entry point consumed by the LSP `textDocument/formatting`
//! handler and the VS Code extension.

use crate::emitter::emit_document;
use crate::parser::parse_document;
use crate::transform::{dedup_use_styles, sort_nodes};

// ─── Config ───────────────────────────────────────────────────────────────

/// Configuration for `format_document`.
///
/// All transforms default to a safe, non-destructive subset.
/// Opt-in to structural transforms via explicit `true` fields.
#[derive(Debug, Clone)]
pub struct FormatConfig {
    /// Remove duplicate `use:` references on each node. Default: **true**.
    pub dedup_use: bool,

    /// Promote repeated identical inline styles to top-level `style {}` blocks.
    /// This is *structurally destructive* (adds new style names, rewrites nodes),
    /// so it defaults to **false** — users must explicitly opt-in.
    pub hoist_styles: bool,

    /// Reorder top-level nodes by kind: Group/Frame → Rect → Ellipse → Text →
    /// Path → Generic. Relative order within each kind is preserved. Default: **true**.
    pub sort_nodes: bool,
}

impl Default for FormatConfig {
    fn default() -> Self {
        Self {
            dedup_use: true,
            hoist_styles: false,
            sort_nodes: true,
        }
    }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────

/// Parse an FD document, apply configured transforms, and re-emit canonical text.
///
/// The output is idempotent: `format_document(format_document(s, c), c) == format_document(s, c)`.
///
/// # Errors
/// Returns the parser error string if the input is not valid FD syntax.
pub fn format_document(text: &str, config: &FormatConfig) -> Result<String, String> {
    let mut scene = parse_document(text)?;

    if config.dedup_use {
        dedup_use_styles(&mut scene);
    }

    if config.hoist_styles {
        crate::transform::hoist_styles(&mut scene);
    }

    if config.sort_nodes {
        sort_nodes(&mut scene);
    }

    Ok(emit_document(&scene))
}

// ─── Tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_document_default_is_idempotent() {
        let input = r#"
# FD v1

style accent {
  fill: #6C5CE7
  corner: 10
}

rect @primary_btn {
  w: 200 h: 48
  use: accent
}
"#;
        let config = FormatConfig::default();
        let first = format_document(input, &config).expect("first format failed");
        let second = format_document(&first, &config).expect("second format failed");
        assert_eq!(first, second, "format must be idempotent");
    }

    #[test]
    fn format_document_dedupes_use_styles() {
        let input = r#"
style card {
  fill: #FFF
}
rect @box {
  w: 100 h: 50
  use: card
  use: card
}
"#;
        let config = FormatConfig::default();
        let output = format_document(input, &config).expect("format failed");
        // Should appear only once
        let use_count = output.matches("use: card").count();
        assert_eq!(use_count, 1, "duplicate use: should be removed");
    }

    #[test]
    fn format_document_preserves_comments() {
        let input = r#"
# This is a section header
rect @box {
  w: 100 h: 50
  fill: #FF0000
}
"#;
        let config = FormatConfig::default();
        let output = format_document(input, &config).expect("format failed");
        assert!(
            output.contains("# This is a section header"),
            "comments must survive formatting"
        );
    }

    #[test]
    fn format_document_sorts_nodes_by_kind() {
        let input = r#"
text @label "World" {
  font: "Inter" regular 14
}
rect @box {
  w: 100 h: 50
}
group @wrapper {
  rect @child {
    w: 50 h: 50
  }
}
"#;
        let config = FormatConfig::default();
        let output = format_document(input, &config).expect("format failed");
        // In the output, group should appear before rect, rect before text
        let group_pos = output.find("group @wrapper").expect("group not found");
        let rect_pos = output.find("rect @box").expect("rect not found");
        let text_pos = output.find("text @label").expect("text not found");
        assert!(
            group_pos < rect_pos,
            "group should come before rect in formatted output"
        );
        assert!(
            rect_pos < text_pos,
            "rect should come before text in formatted output"
        );
    }

    #[test]
    fn format_document_sort_is_idempotent() {
        let input = r#"
text @label "Hello" {
  font: "Inter" regular 14
}
ellipse @circle {
  w: 60 h: 60
}
rect @box {
  w: 100 h: 50
}
group @container {
  rect @inner {
    w: 50 h: 50
  }
}
"#;
        let config = FormatConfig::default();
        let first = format_document(input, &config).expect("first format failed");
        let second = format_document(&first, &config).expect("second format failed");
        assert_eq!(first, second, "sort + format must be idempotent");
    }
}
