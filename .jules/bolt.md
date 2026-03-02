## 2024-05-24 - [Avoid Heap Allocations in Color Parsing and Emitting]
**Learning:** The `Color::to_hex` method in `crates/fd-core/src/model.rs` was heavily utilizing the `format!` macro, which resulted in significant heap allocations and decreased performance when emitting large arrays of nodes with styled colors.
**Action:** Implemented a direct byte manipulation approach using string capacity and a custom hex conversion logic without the `format!` macro, which drastically improved the performance by reducing overhead related to memory allocations. Avoid `format!` in hot paths.
