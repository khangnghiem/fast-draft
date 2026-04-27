//! AI Touch preview lifecycle for the WASM canvas bridge.

use crate::FdCanvas;
use fd_core::id::NodeId;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug)]
pub(crate) struct AiPreviewState {
    pub baseline_id: String,
    pub baseline_text: String,
    pub has_candidate: bool,
    pub selected_ids: Vec<String>,
}

#[derive(Serialize)]
struct BeginPreviewResponse {
    ok: bool,
    #[serde(rename = "baselineId")]
    baseline_id: String,
    #[serde(rename = "selectedIds")]
    selected_ids: Vec<String>,
}

#[derive(Serialize)]
struct PreviewResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    noop: Option<bool>,
}

fn to_json<T: Serialize>(value: &T, fallback: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| fallback.to_string())
}

fn next_baseline_id() -> String {
    #[cfg(target_arch = "wasm32")]
    {
        format!(
            "ai-preview-{}-{}",
            js_sys::Date::now(),
            (js_sys::Math::random() * 1_000_000_000.0) as u64
        )
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        format!("ai-preview-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed))
    }
}

impl FdCanvas {
    fn restore_ai_preview_selection(&mut self, selected_ids: &[String]) {
        self.select_tool.selected.clear();
        self.select_tool.visual_highlight.clear();
        for id_str in selected_ids {
            let id = NodeId::intern(id_str);
            let is_node = self.engine.graph.get_by_id(id).is_some();
            let is_edge = self.engine.graph.edges.iter().any(|e| e.id == id);
            if is_node || is_edge {
                self.select_tool.selected.push(id);
                self.select_tool.visual_highlight.push(id);
            }
        }
    }
}

#[wasm_bindgen]
impl FdCanvas {
    /// Capture baseline text and selection for a non-undoable AI preview.
    pub fn ai_begin_preview(&mut self) -> String {
        let selected_ids: Vec<String> = self
            .select_tool
            .selected
            .iter()
            .map(|id| id.as_str().to_string())
            .collect();
        let baseline_id = next_baseline_id();
        self.ai_preview = Some(AiPreviewState {
            baseline_id: baseline_id.clone(),
            baseline_text: self.engine.current_text().to_string(),
            has_candidate: false,
            selected_ids: selected_ids.clone(),
        });
        to_json(
            &BeginPreviewResponse {
                ok: true,
                baseline_id,
                selected_ids,
            },
            r#"{"ok":false,"baselineId":"","selectedIds":[]}"#,
        )
    }

    /// Apply candidate FD text as a preview. Invalid FD leaves baseline active.
    pub fn ai_apply_preview(&mut self, baseline_id: &str, candidate_fd: &str) -> String {
        let Some(preview) = self.ai_preview.as_ref() else {
            return to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some("No active AI preview".to_string()),
                    noop: None,
                },
                r#"{"ok":false}"#,
            );
        };
        if preview.baseline_id != baseline_id {
            return to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some("AI preview baseline mismatch".to_string()),
                    noop: None,
                },
                r#"{"ok":false}"#,
            );
        }

        if candidate_fd.trim() == preview.baseline_text.trim() {
            return to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some("No changes from AI".to_string()),
                    noop: Some(true),
                },
                r#"{"ok":false}"#,
            );
        }

        let baseline_text = preview.baseline_text.clone();
        match fd_core::parser::parse_document(candidate_fd) {
            Ok(_) => {
                let result = self.set_text(candidate_fd);
                let candidate_applied = result.contains(r#""ok":true"#);
                if !candidate_applied {
                    return to_json(
                        &PreviewResponse {
                            ok: false,
                            error: Some("Candidate FD did not apply".to_string()),
                            noop: None,
                        },
                        r#"{"ok":false}"#,
                    );
                }
                if let Some(preview) = self.ai_preview.as_mut() {
                    preview.has_candidate = true;
                } else {
                    let _ = self.set_text(&baseline_text);
                    return to_json(
                        &PreviewResponse {
                            ok: false,
                            error: Some("AI preview state lost".to_string()),
                            noop: None,
                        },
                        r#"{"ok":false}"#,
                    );
                }
                to_json(
                    &PreviewResponse {
                        ok: true,
                        error: None,
                        noop: None,
                    },
                    r#"{"ok":true}"#,
                )
            }
            Err(error) => to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some(error),
                    noop: None,
                },
                r#"{"ok":false}"#,
            ),
        }
    }

    /// Discard an active AI preview and restore baseline text/selection.
    pub fn ai_discard_preview(&mut self, baseline_id: &str) -> bool {
        let Some(preview) = self.ai_preview.clone() else {
            return false;
        };
        if preview.baseline_id != baseline_id {
            return false;
        }
        let _ = self.set_text(&preview.baseline_text);
        self.restore_ai_preview_selection(&preview.selected_ids);
        self.ai_preview = None;
        true
    }

    /// Commit preview text as one undoable text snapshot.
    pub fn ai_commit_preview(&mut self, baseline_id: &str, summary: &str) -> String {
        let Some(preview) = self.ai_preview.clone() else {
            return to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some("No active AI preview".to_string()),
                    noop: None,
                },
                r#"{"ok":false}"#,
            );
        };
        if preview.baseline_id != baseline_id {
            return to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some("AI preview baseline mismatch".to_string()),
                    noop: None,
                },
                r#"{"ok":false}"#,
            );
        }
        if !preview.has_candidate {
            return to_json(
                &PreviewResponse {
                    ok: false,
                    error: Some("No candidate preview to commit".to_string()),
                    noop: None,
                },
                r#"{"ok":false}"#,
            );
        }
        let preview_text = self.engine.current_text().to_string();
        self.restore_ai_preview_selection(&preview.selected_ids);
        self.commands
            .push_snapshot(preview.baseline_text, preview_text, summary);
        self.ai_preview = None;
        to_json(
            &PreviewResponse {
                ok: true,
                error: None,
                noop: None,
            },
            r#"{"ok":true}"#,
        )
    }
}
