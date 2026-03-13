//! Typed JSON response structs for the WASM ↔ JS boundary.
//!
//! Replaces hand-rolled `format!(r#"{{...}}"#)` patterns with
//! `#[derive(Serialize)]` structs for type-safe, correct JSON output.

use serde::Serialize;

/// Result of `handle_pointer_move()`.
#[derive(Serialize)]
pub(crate) struct PointerMoveResult {
    pub changed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<BoundsInfo>,
}

/// Result of `handle_pointer_up()`.
#[derive(Serialize)]
pub(crate) struct PointerUpResult {
    pub changed: bool,
    #[serde(rename = "toolSwitched")]
    pub tool_switched: bool,
    pub tool: String,
}

/// Result of `handle_key()`.
#[derive(Serialize)]
pub(crate) struct KeyResult {
    pub changed: bool,
    pub action: String,
    pub tool: String,
    #[serde(rename = "toolSwitched")]
    pub tool_switched: bool,
}

/// Bounding box info bundled with pointer results.
#[derive(Serialize)]
pub(crate) struct BoundsInfo {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Result of `evaluate_drop()`.
#[derive(Serialize)]
pub(crate) struct DropResult {
    pub detached: bool,
    #[serde(rename = "nodeId")]
    pub node_id: String,
    #[serde(rename = "fromGroupId")]
    pub from_group_id: String,
}

/// Result of `evaluate_near_detach()`.
#[derive(Serialize)]
pub(crate) struct NearDetachResult {
    #[serde(rename = "parentId")]
    pub parent_id: String,
    #[serde(rename = "childCx")]
    pub child_cx: f32,
    #[serde(rename = "childCy")]
    pub child_cy: f32,
    #[serde(rename = "parentCx")]
    pub parent_cx: f32,
    #[serde(rename = "parentCy")]
    pub parent_cy: f32,
}

/// Diagnostics entry for code mode.
#[derive(Serialize)]
pub(crate) struct DiagnosticEntry {
    pub line: u32,
    pub col: u32,
    #[serde(rename = "endCol")]
    pub end_col: u32,
    pub message: String,
    pub severity: String,
}

/// Completion item for code mode.
#[derive(Serialize)]
pub(crate) struct CompletionItem {
    pub label: String,
    pub kind: String,
    pub detail: String,
}

/// Validate result.
#[derive(Serialize)]
pub(crate) struct ValidateResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Parse-to-JSON result.
#[derive(Serialize)]
pub(crate) struct ParseResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nodes: Option<serde_json::Value>,
}
