# Context Menu Specifications

The Fast Draft context menu system is a unified, data-driven, and keyboard-navigable component used across both the Canvas and the Layers panel. It ensures that right-click interactions are context-aware and provide consistent actions whether the user interacts with nodes, edges, or empty space.

## Gesture Fallback (Canvas)
- **Short-click**: Opens the context menu at the cursor position.
- **Drag (> 5px)**: Automatically transitions into a pan gesture (temporary Hand tool), bypassing the context menu. This prevents accidental menus when the user intends to navigate.

## Action Matrix

The following matrix outlines the available actions across different interaction contexts.

| Action Category / Context | Canvas: Space | Canvas: Node | Canvas: Edge | Layers: Space | Layers: Item(s) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Creation** | Paste, Add (Rect, Ellipse, Text) | - | - | Paste, Add (Rect, Ellipse, Text, Edge) | - |
| **Clipboard** | - | Copy, Cut | Copy, Cut | - | Copy, Cut, Paste, Copy as PNG |
| **Basic Edit** | - | Duplicate, Delete | Duplicate, Delete | - | Duplicate, Delete |
| **Z-Order** | - | Bring Forward, Send Backward | - | - | Bring to Front, Send to Back |
| **Structure** | - | Group, Ungroup | - | - | Group, Ungroup, Frame Selection, Select Children* |
| **Reparent/Hierarchy**| - | - | - | - | Move Into... (Search), Move to Root |
| **Edge Specific** | - | - | Reverse Direction, Edit Label | - | - |
| **Document Level** | Fit to Content | - | - | Format, Dedup IDs, Select All, Fit to Content | - |
| **Item Specific (Single)**| - | Rename, Lock/Unlock, Add Note, Copy as .fd | Copy as .fd | - | Rename, Lock/Unlock |

*\* `Select Children` only appears if the selected layer item is a container (Group, Frame, Rect, Ellipse) and has child nodes.*

## Implementation Details

- **Responsive Viewport Clamping**: Menus always stay within the visible browser viewport.
- **Singleton Pattern**: Only one context menu instance is open at a time; opening a new menu automatically closes any existing one.
- **Keyboard Navigation**: Standard `ArrowUp`, `ArrowDown`, `Enter`, and `Escape` handlers are wired into the capture phase to bypass canvas shortcuts while the menu is open.
- **Accessibility**: ARIA roles (`menu`, `menuitem`, `separator`) and dynamic focus management are built-in.
- **Multi-select Awareness**: Actions dynamically show pluralized labels (e.g., "Duplicate 3 items") and batch operations when multiple nodes are selected.
