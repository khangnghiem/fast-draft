---
name: rust-wasm
description: Rust development patterns for the FTD workspace (crate structure, testing, WASM)
---

# Rust + WASM Development Skill

## Workspace Layout

```
ftd/
├── Cargo.toml          # Workspace root
├── crates/
│   ├── ftd-core/       # Data model, parser, emitter, layout
│   ├── ftd-render/     # Vello/wgpu renderer, hit testing
│   └── ftd-editor/     # Sync engine, tools, undo/redo, input
├── ftd-vscode/         # VS Code extension (TypeScript + WASM)
└── examples/
    └── demo.ftd
```

## Common Commands

### Build & Test

```bash
cargo check --workspace        # Fast type check
cargo test --workspace         # Run all tests
cargo test -p ftd-core         # Test one crate
cargo test -- --nocapture      # See println!/dbg! output
cargo clippy --workspace       # Lint
cargo fmt --all                # Format
```

### WASM Build

```bash
# Install wasm-pack if needed
cargo install wasm-pack

# Build for web target
wasm-pack build crates/ftd-render --target web

# Build with specific features
wasm-pack build crates/ftd-render --target web -- --features wasm
```

## Coding Patterns

### Adding a New Node Type

1. Add variant to `NodeKind` enum in `crates/ftd-core/src/model.rs`
2. Add parsing logic in `parse_node()` in `crates/ftd-core/src/parser.rs`
3. Add emission logic in `emit_node()` in `crates/ftd-core/src/emitter.rs`
4. Add intrinsic size in `intrinsic_size()` in `crates/ftd-core/src/layout.rs`
5. Add rendering in `paint_node()` in `crates/ftd-render/src/paint.rs`
6. Add hit testing in `hit_test_node()` in `crates/ftd-render/src/hit.rs`
7. Write tests for round-trip: parse → emit → re-parse

### Adding a New Style Property

1. Add field to `Style` struct in `model.rs`
2. Parse it in `parse_style_property()` and `parse_node_property()` in `parser.rs`
3. Emit it in `emit_style_block()` and `emit_node()` in `emitter.rs`
4. Merge it in `merge_style()` in `model.rs`
5. Apply it to rendering in `paint.rs`

### Adding a New Tool

1. Implement the `Tool` trait in `crates/ftd-editor/src/tools.rs`
2. Handle input events → produce `GraphMutation` values
3. Register in tool selection (future: toolbar UI)

### Adding a New Constraint

1. Add variant to `Constraint` enum in `model.rs`
2. Parse in `parse_constraint_line()` / `parse_node_property()`
3. Emit in `emit_constraint()` in `emitter.rs`
4. Resolve in `apply_constraint()` in `layout.rs`

## Key Dependencies

| Crate      | Purpose                     | Docs                                |
| ---------- | --------------------------- | ----------------------------------- |
| `petgraph` | DAG for scene graph         | [docs.rs](https://docs.rs/petgraph) |
| `winnow`   | Streaming parser            | [docs.rs](https://docs.rs/winnow)   |
| `lasso`    | String interning for NodeId | [docs.rs](https://docs.rs/lasso)    |
| `smallvec` | Inline small arrays         | [docs.rs](https://docs.rs/smallvec) |
| `vello`    | GPU 2D renderer             | [docs.rs](https://docs.rs/vello)    |
| `wgpu`     | GPU abstraction             | [docs.rs](https://docs.rs/wgpu)     |
| `serde`    | Serialization traits        | [docs.rs](https://docs.rs/serde)    |

## Testing Conventions

- Every new parser feature must have a round-trip test
- Test files go in `examples/` as `.ftd` files
- Use `pretty_assertions` for diff-friendly assertions
- Test names: `parse_<feature>`, `emit_<feature>`, `roundtrip_<feature>`, `layout_<feature>`
