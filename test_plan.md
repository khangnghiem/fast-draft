1. **Explore & Pick**
   - Check `gh pr list` for existing PRs.
   - Based on status, I will implement **R3.56 — HTML+CSS export**.
   - Target: `emit_html(graph: &SceneGraph) -> String`

2. **File creation: `crates/fd-core/src/html.rs`**
   - Create new module.
   - Include it in `lib.rs` via `pub mod html;`.
   - Implement `pub fn emit_html(graph: &SceneGraph) -> String`.
   - The export must produce a single standalone HTML document containing absolutely positioned `<div>` for `Frame`/`Rect`/`Text` nodes, and a fullscreen `<svg pointer-events="none">` overlay for `Ellipse`, `Path`, and `Edge` rendering, as specified in memory guidelines.

3. **Implementation details for HTML export**
   - Import `resolve_layout(graph, None)` from `crates/fd-core/src/resolve.rs` to compute absolute geometry (`ResolvedBounds`) for every node.
   - Map node styles (`props`, resolved bounds `w`, `h`, `x`, `y`) to inline CSS. Map `Shadow`, `Color`, `Paint` to `box-shadow`, `background-color` or gradients, etc.
   - Build SVG elements for nodes like `Ellipse` and `Path`, as well as `Edge` nodes (which also need routing or simple point-to-point drawing based on resolved layout).
   - Use `std::fmt::Write` or standard `format!` for minimal dependency overhead.
   - Ensure `width` and `height` of the document container accommodates the bounding box of the graph or a reasonably large screen.
   - `emit_html` will return the raw HTML string.

4. **Testing**
   - Create a test file: `crates/fd-core/src/html_tests.rs`.
   - Add module to `lib.rs` for testing (`#[cfg(test)] mod html_tests;`).
   - Write basic tests `emit_html_basic_rect`, `emit_html_text_shadow`, `emit_html_edges` to cover various primitives.
   - Use `parse` from parser to create a SceneGraph, resolve it, and check HTML output.
   - Run `cargo check --workspace` and `cargo test --workspace` to ensure all tests pass.

5. **Pre-commit checks**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Finalize**
   - Update `docs/REQUIREMENTS.md`: Change `(planned)` to `(done)` for **R3.56**. Add CHANGELOG entry if applicable.
   - Create branch `feat/html-css-export` and push. (Simulated if no network, but follow prompt commands).
