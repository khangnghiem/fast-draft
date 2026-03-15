#!/bin/bash
echo "Looking for duplicated strings or logic in completions..."
grep -A 10 "top_level_completions" crates/fd-lsp/src/completion.rs
echo "---"
grep -A 10 "top_level_items" crates/fd-wasm/src/code_intel.rs
