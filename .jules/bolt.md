## 2024-05-24 - [Avoid `try/catch` and `JSON.parse` empty strings in `get_node_bounds`]
**Learning:** `JSON.parse` wrapped in a `try/catch` block for `fdCanvas.get_node_bounds` (which returns `{}` or empty values often on missing nodes) can be slow in a tight loop. Furthermore, using `Regex.exec` stateful matching in a `while` loop is slower than a `String.match` mapped over the slice of the string.
**Action:** Use `fdCanvas.get_node_bounds_json(id)` instead of `get_node_bounds(id)` since it's already used for early-bail and avoids `try/catch` when handling `{}` checks manually. Use `String.match` and substring slice in loops for string extraction.

## 2024-05-24 - [Avoid O(N^2) in Vector Membership Checks]
**Learning:** Using `Vec::contains()` in a loop creates an O(N^2) complexity bottleneck, especially when preserving insertion order in layout algorithms.
**Action:** When maintaining ordered collections (like `Vec<String>` for struct fields), use a local `HashSet<String>` alongside it for O(1) membership checks during population to avoid lifetime complexities and performance hits.
## 2024-05-24 - [Avoid O(N^2) Vector Membership Checks in Layout]
**Learning:** Using `!flow_children.contains(&child_idx)` within a loop over all children in `Column`, `Row`, and `Grid` layout algorithms (`crates/fd-core/src/layout.rs`) introduces an O(N^2) complexity.
**Action:** Replace `Vec::contains()` in loops by doing a single pass over the collection to partition it into separate vectors (e.g., `flow_children` and `abs_children`) using `.push()`, eliminating the bottleneck while preserving order.
## 2024-05-15 - Fast Draft Completion Optimization Retrospective
**Learning:** In Rust string processing, optimizing `text.lines()` by eagerly collecting it into a `Vec<&str>` (`text.lines().collect()`) causes a significant performance and memory regression. The original lazy iteration `text.lines().nth(...)` is O(pos.line) and zero-allocation, whereas `.collect()` is O(Total Document Lines) and allocates memory.
**Action:** Do not collect iterators prematurely. Always prefer using lazy iterator combinations (`nth`, `take`, `find`) in Rust to avoid unnecessary allocations, especially when parsing large text documents on every keystroke.

## 2024-06-06 - [Avoid redundant array iterations with multiple `.filter()` calls]
**Learning:** In the `fd-vscode` webview and extension backend (e.g., `src/panels/spec-view.ts`), calling multiple `.filter()` or `.find()` operations on the same array (like `annotations`) results in redundant O(N) traversals. This can cause unnecessary overhead, especially as the number of elements grows.
**Action:** Refactor multiple `.filter()` and `.find()` operations on the same array into a single-pass `for...of` loop. This provides a measurable performance boost (~40-50% for small sets) by reducing redundant iterations.
