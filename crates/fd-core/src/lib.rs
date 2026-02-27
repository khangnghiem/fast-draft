pub mod emitter;
pub mod format;
pub mod id;
pub mod layout;
pub mod lint;
pub mod model;
pub mod parser;
pub mod resolve;
pub mod transform;

pub use format::{FormatConfig, format_document};
pub use id::NodeId;
pub use layout::{Viewport, resolve_layout};
pub use lint::{LintDiagnostic, LintSeverity, lint_document};
pub use model::*;
pub use transform::{dedup_use_styles, hoist_styles, sort_nodes};

// Re-export petgraph types so downstream crates don't need a direct dependency
pub use petgraph::graph::NodeIndex;
