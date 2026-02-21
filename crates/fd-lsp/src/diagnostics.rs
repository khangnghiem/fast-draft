//! Diagnostics: parse FD text → LSP diagnostics.

use tower_lsp::lsp_types::*;

/// Compute diagnostics by parsing the document text.
///
/// On parse failure, extracts line/column from the error message and
/// returns a single diagnostic. On success, returns an empty vec
/// (clearing previous errors).
pub fn compute_diagnostics(text: &str) -> Vec<Diagnostic> {
    match fd_core::parser::parse_document(text) {
        Ok(_) => Vec::new(),
        Err(err_msg) => {
            let (line, col) = extract_error_position(text, &err_msg);
            vec![Diagnostic {
                range: Range {
                    start: Position::new(line, col),
                    end: Position::new(line, col + 1),
                },
                severity: Some(DiagnosticSeverity::ERROR),
                source: Some("fd-lsp".to_string()),
                message: err_msg,
                ..Default::default()
            }]
        }
    }
}

/// Best-effort extraction of error position from winnow error messages.
///
/// Winnow errors typically contain the remaining unparsed text. We find
/// where that text appears in the original input to compute line/col.
fn extract_error_position(source: &str, error: &str) -> (u32, u32) {
    // winnow errors often look like: "... at '...remaining...'"
    // Try to find the remaining text in the source
    if let Some(at_idx) = error.find("at '") {
        let remaining = &error[at_idx + 4..];
        if let Some(end) = remaining.find('\'') {
            let snippet = &remaining[..end];
            // Find this snippet in the source
            if let Some(offset) = source.find(snippet) {
                return offset_to_line_col(source, offset);
            }
        }
    }

    // Fallback: report at the end of the document
    let line_count = source.lines().count();
    if line_count == 0 {
        return (0, 0);
    }
    let last_line = line_count.saturating_sub(1) as u32;
    let last_col = source.lines().last().map_or(0, |l| l.len() as u32);
    (last_line, last_col)
}

/// Convert a byte offset in source text to (line, col) zero-indexed.
fn offset_to_line_col(source: &str, offset: usize) -> (u32, u32) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_document_produces_no_diagnostics() {
        let text = r#"rect @box { w: 100 h: 50 fill: #FF0000 }"#;
        let diags = compute_diagnostics(text);
        assert!(diags.is_empty());
    }

    #[test]
    fn offset_to_line_col_basic() {
        let src = "line0\nline1\nline2";
        //          01234 5 6789A B CDEF0
        assert_eq!(offset_to_line_col(src, 0), (0, 0));
        assert_eq!(offset_to_line_col(src, 5), (0, 5));
        assert_eq!(offset_to_line_col(src, 6), (1, 0));
        assert_eq!(offset_to_line_col(src, 12), (2, 0));
    }
}
