## 2024-05-24 - [Avoid `try/catch` and `JSON.parse` empty strings in `get_node_bounds`]
**Learning:** `JSON.parse` wrapped in a `try/catch` block for `fdCanvas.get_node_bounds` (which returns `{}` or empty values often on missing nodes) can be slow in a tight loop. Furthermore, using `Regex.exec` stateful matching in a `while` loop is slower than a `String.match` mapped over the slice of the string.
**Action:** Use `fdCanvas.get_node_bounds_json(id)` instead of `get_node_bounds(id)` since it's already used for early-bail and avoids `try/catch` when handling `{}` checks manually. Use `String.match` and substring slice in loops for string extraction.

## 2024-05-24 - [Replace O(N) array lookups with O(1) HashSets in Mermaid parser]
**Learning:** The Mermaid parser in `fd-core` maintains a `Vec<String>` of `node_ids` and `ordered_ids` to preserve insertion order for layout consistency. However, using `.contains()` on these `Vec`s within tight parsing loops results in O(N^2) complexity.
**Action:** Maintain a parallel, local `HashSet<String>` alongside the `Vec<String>` during population to achieve O(1) membership checks while preserving the O(1) insertion order of the `Vec`. Avoid `set.insert(val.clone())` if `set.contains(&val)` is true to avoid string allocation overhead.
