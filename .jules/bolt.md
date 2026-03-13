## 2024-05-24 - [Avoid `try/catch` and `JSON.parse` empty strings in `get_node_bounds`]
**Learning:** `JSON.parse` wrapped in a `try/catch` block for `fdCanvas.get_node_bounds` (which returns `{}` or empty values often on missing nodes) can be slow in a tight loop. Furthermore, using `Regex.exec` stateful matching in a `while` loop is slower than a `String.match` mapped over the slice of the string.
**Action:** Use `fdCanvas.get_node_bounds_json(id)` instead of `get_node_bounds(id)` since it's already used for early-bail and avoids `try/catch` when handling `{}` checks manually. Use `String.match` and substring slice in loops for string extraction.

## 2024-05-24 - [Avoid O(N^2) in Vector Membership Checks]
**Learning:** Using `Vec::contains()` in a loop creates an O(N^2) complexity bottleneck, especially when preserving insertion order in layout algorithms.
**Action:** When maintaining ordered collections (like `Vec<String>` for struct fields), use a local `HashSet<String>` alongside it for O(1) membership checks during population to avoid lifetime complexities and performance hits.
