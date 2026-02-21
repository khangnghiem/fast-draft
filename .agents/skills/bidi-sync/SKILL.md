---
name: bidi-sync
description: How the bidirectional sync engine works between FD text and canvas
---

# Bidirectional Sync Skill

## Overview

The sync engine is the heart of FD — it keeps the `.fd` text source and the visual canvas in lock-step. Every edit, whether from text or canvas, flows through a single authoritative `SceneGraph`.

## Architecture

```
  Text Editor              Sync Engine              Canvas
  ┌─────────┐         ┌─────────────────┐         ┌─────────┐
  │  .fd   │ ──────► │  Parser         │         │  Vello  │
  │  source │         │       ↓         │         │  wgpu   │
  │         │         │  SceneGraph ◄───┼─────── │  render │
  │         │ ◄────── │       ↓         │         │         │
  │         │         │  Emitter        │ ──────► │  paint  │
  └─────────┘         └─────────────────┘         └─────────┘
```

## Data Flow

### Text → Canvas (user edits `.fd` source)

1. Text editor sends new/changed text to `SyncEngine::set_text()` or `update_text_range()`
2. Parser re-parses text into a new `SceneGraph`
3. Layout solver resolves constraints → `ResolvedBounds`
4. Renderer paints from bounds

### Canvas → Text (user drags/draws on canvas)

1. Input event → active `Tool` → produces `GraphMutation`
2. `SyncEngine::apply_mutation()` mutates the graph in-place
3. `SyncEngine::flush_to_text()` re-emits only the affected text
4. Text editor receives the updated text

## Key Types

| Type            | Location                     | Purpose                                                       |
| --------------- | ---------------------------- | ------------------------------------------------------------- |
| `SyncEngine`    | `fd-editor/src/sync.rs`     | Holds graph, text, bounds; handles both directions            |
| `GraphMutation` | `fd-editor/src/sync.rs`     | Enum of mutations (move, resize, add, remove, set style/text) |
| `Tool` trait    | `fd-editor/src/tools.rs`    | Converts input events → mutations                             |
| `CommandStack`  | `fd-editor/src/commands.rs` | Undo/redo with inverse computation                            |
| `InputEvent`    | `fd-editor/src/input.rs`    | Normalized mouse/touch/stylus events                          |

## Adding a New Mutation Type

1. Add variant to `GraphMutation` enum in `sync.rs`
2. Handle it in `SyncEngine::apply_mutation()`
3. Compute its inverse in `compute_inverse()` in `commands.rs`
4. Write a test in `sync.rs::tests`

## Performance Rules

- **Canvas → Text hot path**: `apply_mutation()` must be <1ms (no full re-emit during drag)
- **Batch mutations**: Call `flush_to_text()` at end of gesture, not every frame
- **Text → Canvas**: `set_text()` does full re-parse; `update_text_range()` for incremental (future)
- **Layout**: `resolve_layout()` is O(n) in node count — fine for <10K nodes
