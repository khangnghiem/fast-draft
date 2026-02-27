# Group Reparent on Drag-Out

> R3.34 | Status: planned

## Behavior

When a child node is moved outside its parent group via drag or nudge:

| Overlap State                                      | Behavior              | Description                                                                                                             |
| -------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Partial overlap** (child BB intersects group BB) | **Expand group**      | Group grows to contain child _(current behavior)_                                                                       |
| **Zero overlap** (child BB fully outside group BB) | **Detach → reparent** | Child is removed from group and attached to the nearest ancestor whose bounds contain the child, or root canvas if none |

### Detach Algorithm

```
After MoveNode updates bounds:
1. Get child bounding box (CB) and parent group bounding box (GB)
2. Compute overlap = intersection_area(CB, GB)
3. If overlap > 0 → expand parent (existing behavior)
4. If overlap == 0 → detach:
   a. Walk up ancestor chain (parent → grandparent → ...)
   b. For each ancestor group:
      - If ancestor bounds fully contain CB → reparent child to ancestor, STOP
   c. If no containing ancestor found → reparent to root
   d. Convert child's Position constraint to be relative to new parent
   e. Shrink old parent group to fit remaining children
```

### Multi-Level Reparenting

A child deeply nested in `group_a > group_b > group_c` can jump multiple levels:

```
Drag @leaf far outside all groups:
  group_c: shrink (lost a child)
  group_b: shrink (if group_c got smaller)
  Root: gains @leaf directly
```

### Constraint Fixup

When reparenting, the child's `Position { x, y }` constraint changes basis:

```
new_rel_x = child_abs_x - new_parent_abs_x
new_rel_y = child_abs_y - new_parent_abs_y
```

## Edge Cases

- **Root children** — nodes at root level have no parent group → no detach logic needed
- **Frames** — frames clip children; dragging outside a frame should also detach (same rule)
- **Managed layouts** (Column/Row/Grid) — detach also applies; child exits the flow
- **Last child detached** — empty group remains (user can delete manually)
- **Move group itself** — moving an entire group never detaches it from _its_ parent (only child moves trigger detach)
- **Undo** — detach is captured in the undo text snapshot; undo fully restores parent/child relationship

## Implementation Notes

| Module      | File                           | Changes                                                                     |
| ----------- | ------------------------------ | --------------------------------------------------------------------------- |
| Sync engine | `crates/fd-editor/src/sync.rs` | Replace `expand_parent_group_bounds` with `handle_child_group_relationship` |
| Model       | `crates/fd-core/src/model.rs`  | No changes needed (`reparent_node` already exists)                          |

## Test Coverage

| Test                                       | What it covers                           |
| ------------------------------------------ | ---------------------------------------- |
| `sync_move_partial_overlap_expands_group`  | Child with overlap → group grows         |
| `sync_move_detaches_child_from_group`      | Child fully outside → reparented to root |
| `sync_move_detaches_through_nested_groups` | Multi-level jump                         |
| `sync_move_within_group_no_detach`         | Small move inside → no change            |
