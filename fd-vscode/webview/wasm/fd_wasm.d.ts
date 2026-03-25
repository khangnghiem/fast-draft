/* tslint:disable */
/* eslint-disable */

/**
 * The main WASM-facing canvas controller.
 *
 * Holds the sync engine, command stack, and active tool. All interaction
 * from the webview JS goes through this struct.
 */
export class FdCanvas {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add an animation to a node by ID.
     */
    add_animation_to_node(node_id: string, trigger: string, props_json: string): boolean;
    /**
     * Add a node to the current selection without clearing (⌘+click add mode).
     * Returns true if the node was found and added (ignores if already selected).
     */
    add_to_selection(node_id: string): boolean;
    /**
     * Cancel an in-progress drag gesture (Esc mid-drag).
     *
     * Restores the scene to the pre-drag state by abandoning the batch
     * snapshot and resetting all tool drag flags. Returns `true` if a
     * drag was actually cancelled.
     */
    cancel_drag(): boolean;
    /**
     * Clear the pressed interaction state.
     *
     * Called from JS when entering inline text editing to suppress
     * press animations that cause a visual shape jump on double-click.
     */
    clear_pressed(): void;
    /**
     * Compute alignment guides for a hypothetical rect at (x, y, w, h).
     */
    compute_guides_for_rect(x: number, y: number, w: number, h: number): string;
    /**
     * Compute the AI comprehensibility score (R4.21).
     * Returns JSON: `{"total":72,"metrics":[{"name":"...","label":"...","score":15,"suggestion":"..."},...]}`
     */
    compute_score(): string;
    /**
     * Create a text node as a child of an existing shape.
     */
    create_child_text(parent_id: string, content: string): string;
    /**
     * Create an edge between two nodes.
     */
    create_edge(from_id: string, to_id: string): string;
    /**
     * Create a standalone edge with point anchors.
     */
    create_edge_at(x1: number, y1: number, x2: number, y2: number): string;
    /**
     * Create a node at a specific position (for drag-and-drop).
     */
    create_node_at(kind: string, x: number, y: number): boolean;
    /**
     * Delete the currently selected node(s). Returns true if any was deleted.
     */
    delete_selected(): boolean;
    /**
     * Detach a text child from its parent edge.
     */
    detach_text_from_edge(text_id: string): string;
    /**
     * Duplicate the currently selected node(s). Returns true if duplicated.
     */
    duplicate_selected(): boolean;
    /**
     * Duplicate selected node(s) with a custom offset. Returns true if duplicated.
     * Handles multi-select: clones ALL selected nodes, deep-copies Group/Frame
     * subtrees, remaps internal references, and duplicates edges between them.
     * Use (0, 0) for Alt+drag clone-in-place.
     */
    duplicate_selected_at(dx: number, dy: number): boolean;
    /**
     * Emit FD text for only the currently selected nodes.
     *
     * Returns valid FD text containing just the selected node blocks
     * (including children for groups/frames). If nothing is selected,
     * returns the full document. Used by AI Touch to provide accurate
     * selection context without fragile regex extraction.
     */
    emit_selection_fd(): string;
    /**
     * Evaluate a drop for structural detach.
     */
    evaluate_drop(node_id: string): string;
    /**
     * Evaluate if a dragging node is near detaching from its parent group.
     */
    evaluate_near_detach(node_id: string): string;
    /**
     * Export the current selection (or entire canvas if empty) as Excalidraw v2 JSON.
     *
     * The output can be pasted directly into excalidraw.com.
     */
    export_excalidraw(): string;
    /**
     * Export the current selection (or entire canvas if empty) as a standalone HTML page.
     *
     * The output is a complete HTML document with embedded CSS that can be
     * saved as an `.html` file and opened in any browser.
     */
    export_html(): string;
    /**
     * Export the current selection (or entire canvas if empty) as an SVG string.
     */
    export_svg(): string;
    /**
     * Post-release: expand parent groups to contain overflowing children.
     */
    finalize_bounds(): boolean;
    /**
     * Find the edge whose text_child matches the given text node ID.
     */
    find_edge_for_text(text_id: string): string;
    /**
     * Get all specs across the entire document.
     */
    get_all_specs(): string;
    /**
     * Get ghost origin bounds for Alt+drag visual feedback.
     * Returns a JSON array of `{x, y, w, h}` objects, or empty string
     * if no Alt+drag clone is active.
     */
    get_alt_drag_ghost(): string;
    /**
     * Get the arrow tool's live preview line during drag.
     */
    get_arrow_preview(): string;
    /**
     * Get context-aware completions at the cursor position.
     */
    get_completions(line: number, col: number): string;
    /**
     * Return a JSON array of valid container node IDs for the "Move Into" menu.
     * Each entry is `{"id": "...", "kind": "..."}`.
     */
    get_container_ids(): string;
    /**
     * Whether to show only corner handles (true for touch).
     */
    get_corners_only(): boolean;
    /**
     * Get parse diagnostics for the current document text.
     */
    get_diagnostics(): string;
    /**
     * Get the visual handle size for the current pointer type (for JS rendering).
     */
    get_handle_visual_size(): number;
    /**
     * Get hover information at the cursor position.
     */
    get_hover(line: number, col: number): string;
    /**
     * Get animations for a node as a JSON array.
     */
    get_node_animations_json(node_id: string): string;
    /**
     * Get the scene-space bounds of a node by its ID.
     */
    get_node_bounds(node_id: string): string;
    /**
     * Get the resolved bounds of a node by its `@id` as JSON.
     */
    get_node_bounds_json(id_str: string): string;
    /**
     * Return the kind name of a node (e.g. "rect", "ellipse", "frame", "group", "text").
     * Returns empty string if the node doesn't exist.
     */
    get_node_kind(node_id: string): string;
    /**
     * Get basic properties of a node by its ID (without selecting it).
     */
    get_node_props(node_id: string): string;
    /**
     * Return the parent ID of a node, or empty string if it's a root-level node.
     */
    get_parent_id(node_id: string): string;
    /**
     * Get the bounding box of all non-root nodes in the scene.
     */
    get_scene_bounds(): string;
    /**
     * Get the currently selected node ID, or empty string if none.
     * Returns the first selected node.
     */
    get_selected_id(): string;
    /**
     * Get all selected node IDs as a JSON array.
     */
    get_selected_ids(): string;
    /**
     * Get properties of the currently selected node as JSON.
     * Returns `{}` if no node is selected.
     */
    get_selected_node_props(): string;
    /**
     * Get the union bounding box of all currently selected nodes (including children).
     * Returns `[x, y, width, height]` array, or `None` if selection is empty.
     */
    get_selection_bounds(): Float64Array | undefined;
    /**
     * Check if sketchy rendering mode is enabled.
     */
    get_sketchy_mode(): boolean;
    /**
     * Get the displayable spec text for a node.
     */
    get_spec(node_id: string): string;
    /**
     * Get the current FD source text (synced from graph).
     */
    get_text(): string;
    /**
     * Get the ID of the first text child node of a shape.
     */
    get_text_child_id(parent_id: string): string;
    /**
     * Get IDs of all direct Text children of a node.
     */
    get_text_children(node_id: string): string;
    /**
     * Get the current theme as a JSON object.
     */
    get_theme_json(): string;
    /**
     * Get the current tool name.
     */
    get_tool_name(): string;
    /**
     * Group the currently selected nodes. Returns true if grouped.
     */
    group_selected(): boolean;
    /**
     * Handle a keyboard event. Returns a JSON string:
     * `{"changed":bool, "action":"<action_name>", "tool":"<tool_name>"}`
     */
    handle_key(key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean): string;
    /**
     * Handle pointer down event. Returns true if the graph changed.
     */
    handle_pointer_down(x: number, y: number, pressure: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): boolean;
    /**
     * Handle pointer move event. Returns JSON string:
     * `{"changed":bool}` or `{"changed":bool,"bounds":{"x":N,"y":N,"w":N,"h":N}}`
     * when actively dragging a selected node (for dimension tooltip).
     */
    handle_pointer_move(x: number, y: number, pressure: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): string;
    /**
     * Handle pointer up event. Returns a JSON string:
     * `{"changed":bool, "toolSwitched":bool, "tool":"<name>"}`
     *
     * After a drawing gesture (Rect/Ellipse/Pen/Text) completes,
     * the tool automatically switches back to Select.
     */
    handle_pointer_up(x: number, y: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): string;
    /**
     * Handle Apple Pencil Pro squeeze: toggles between current and previous tool.
     *
     * Modifier combos:
     * - **No modifier**: toggle current ↔ previous tool (original behavior)
     * - **Shift**: switch to Pen tool
     * - **Ctrl / Meta**: switch to Select tool
     * - **Alt**: switch to Rect tool
     * - **Ctrl+Shift**: switch to Ellipse tool
     *
     * Returns the name of the new active tool.
     */
    handle_stylus_squeeze(shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): string;
    /**
     * Check if any edge in the scene has a flow animation.
     */
    has_active_flows(): boolean;
    /**
     * Check if text changed due to canvas interaction (for sync back to editor).
     */
    has_pending_text_change(): boolean;
    /**
     * Check if a node has any direct Text children.
     */
    has_text_child(node_id: string): boolean;
    /**
     * Hit-test at scene-space coordinates. Returns the topmost node ID, or empty string.
     */
    hit_test_at(x: number, y: number): string;
    /**
     * Hit-test at scene-space coordinates, excluding a specific node (and its children).
     * Used for ⌘+drag reparent so the dragged node doesn't block the container underneath.
     */
    hit_test_at_excluding(x: number, y: number, exclude_id: string): string;
    /**
     * Hit-test for edges only at scene-space coordinates.
     */
    hit_test_edge_at(x: number, y: number): string;
    /**
     * Import a Mermaid diagram, converting it to FD format.
     */
    import_mermaid(mermaid_text: string): boolean;
    /**
     * Insert a new node (used by JS Drag-to-Create from toolbar).
     * Bypasses JS string construction to enforce WASM defaults.
     */
    insert_node_at(kind_str: string, x: number, y: number, w: number, h: number): boolean;
    /**
     * Check if a node is locked. Returns false if node not found.
     */
    is_node_locked(id: string): boolean;
    /**
     * Create a new canvas controller with the given dimensions.
     */
    constructor(width: number, height: number);
    /**
     * Get the parent ID of a node. Returns empty string for root-level nodes.
     */
    parent_of(node_id: string): string;
    /**
     * Push a text snapshot for undo support.
     */
    push_undo_snapshot(text_before: string, text_after: string): void;
    /**
     * Redo the last undone action.
     */
    redo(): boolean;
    /**
     * Remove all animations from a node. Returns `true` if changed.
     */
    remove_node_animations(node_id: string): boolean;
    /**
     * Render the scene to a Canvas2D context.
     *
     * * `skip_grid` — skip drawing the background grid dots.
     * * `skip_bg` — skip filling the background color.
     */
    render(ctx: CanvasRenderingContext2D, time_ms: number, skip_grid: boolean, skip_bg: boolean): void;
    /**
     * Render only the selected nodes (and their children) to the given context.
     */
    render_export(ctx: CanvasRenderingContext2D, offset_x: number, offset_y: number): void;
    /**
     * Reorder a child node to a specific z-order index within its parent.
     * Used by layer panel drag-to-reorder.
     */
    reorder_child(child_id: string, index: number): boolean;
    /**
     * Reparent a node into a target container (⌘+drag or layer drag).
     *
     * The target must be a container type (Rect, Ellipse, Frame, Group)
     * or "root" to move to the document root.
     * Returns true if the reparent succeeded.
     */
    reparent_into(child_id: string, target_id: string): boolean;
    /**
     * Reparent a node into a target container and center it.
     *
     * Same validation as `reparent_into` but instead of preserving
     * visual position, strips positional constraints and adds
     * `CenterIn(target)` so the child is centered in the new parent.
     */
    reparent_into_centered(child_id: string, target_id: string): boolean;
    /**
     * Resize the canvas.
     */
    resize(width: number, height: number): void;
    /**
     * Select a node by its ID (e.g. from text editor cursor).
     * Returns `true` if the node was found and selected.
     */
    select_by_id(node_id: string): boolean;
    /**
     * Select multiple nodes by their IDs from a JSON array (⇧+click range select).
     * Replaces the current selection with the provided IDs.
     * Returns the number of valid nodes that were selected.
     */
    select_multiple_by_ids(ids_json: string): number;
    /**
     * Set a property on ALL currently selected nodes (bulk editing).
     * Returns `true` if any node was changed.
     */
    set_multi_node_prop(key: string, value: string): boolean;
    /**
     * Set a node's position constraint to an absolute (x, y) coordinate.
     * Used by Layers→Canvas cross-drag to place a node at the drop position.
     */
    set_node_position(node_id: string, x: number, y: number): boolean;
    /**
     * Set a property on the currently selected node.
     * Returns `true` if the property was set.
     */
    set_node_prop(key: string, value: string): boolean;
    /**
     * Set the current pointer device type (0=mouse, 1=touch, 2=pen).
     * Called from JS before each pointer event to adapt hit radii and handle sizes.
     */
    set_pointer_type(ptype: number): void;
    /**
     * Enable or disable sketchy (hand-drawn) rendering mode.
     */
    set_sketchy_mode(enabled: boolean): void;
    /**
     * Set the spec for a node from raw markdown text.
     */
    set_spec(node_id: string, content: string): boolean;
    /**
     * Set the FD source text, re-parsing into the scene graph.
     * Returns a JSON string: `{"ok":true,"layout_changed":bool}`
     */
    set_text(text: string): string;
    /**
     * Set the canvas theme.
     */
    set_theme(is_dark: boolean): void;
    /**
     * Switch the active tool, remembering the previous one.
     */
    set_tool(name: string): void;
    /**
     * Toggle the locked state of a node. Returns the new locked state.
     */
    toggle_node_locked(id: string): boolean;
    /**
     * Toggle a node in/out of the current selection (⌘+click in layers).
     * If the node is already selected, deselect it. Otherwise, add it.
     * Returns true if the node was found (valid id).
     */
    toggle_select_by_id(node_id: string): boolean;
    /**
     * Undo the last action.
     */
    undo(): boolean;
    /**
     * Ungroup all selected groups. Returns true if any were ungrouped.
     */
    ungroup_selected(): boolean;
    /**
     * Update a text node's resolved bounds using JS-measured dimensions.
     */
    update_text_metrics(node_id: string, measured_width: number, measured_height: number): boolean;
}

/**
 * Parse FD source and return the scene graph as JSON for the tree preview.
 */
export function parse_to_json(source: string): string;

/**
 * Validate FD source text.
 */
export function validate(source: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_fdcanvas_free: (a: number, b: number) => void;
    readonly fdcanvas_get_arrow_preview: (a: number) => [number, number];
    readonly fdcanvas_get_corners_only: (a: number) => number;
    readonly fdcanvas_get_handle_visual_size: (a: number) => number;
    readonly fdcanvas_get_sketchy_mode: (a: number) => number;
    readonly fdcanvas_get_text: (a: number) => [number, number];
    readonly fdcanvas_get_theme_json: (a: number) => [number, number];
    readonly fdcanvas_get_tool_name: (a: number) => [number, number];
    readonly fdcanvas_has_active_flows: (a: number) => number;
    readonly fdcanvas_has_pending_text_change: (a: number) => number;
    readonly fdcanvas_import_mermaid: (a: number, b: number, c: number) => number;
    readonly fdcanvas_insert_node_at: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly fdcanvas_new: (a: number, b: number) => number;
    readonly fdcanvas_push_undo_snapshot: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly fdcanvas_redo: (a: number) => number;
    readonly fdcanvas_resize: (a: number, b: number, c: number) => void;
    readonly fdcanvas_set_pointer_type: (a: number, b: number) => void;
    readonly fdcanvas_set_sketchy_mode: (a: number, b: number) => void;
    readonly fdcanvas_set_text: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_set_theme: (a: number, b: number) => void;
    readonly fdcanvas_set_tool: (a: number, b: number, c: number) => void;
    readonly fdcanvas_undo: (a: number) => number;
    readonly fdcanvas_compute_score: (a: number) => [number, number];
    readonly fdcanvas_get_completions: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_diagnostics: (a: number) => [number, number];
    readonly fdcanvas_get_hover: (a: number, b: number, c: number) => [number, number];
    readonly parse_to_json: (a: number, b: number) => [number, number];
    readonly validate: (a: number, b: number) => [number, number];
    readonly fdcanvas_create_child_text: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_create_edge: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_create_edge_at: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_create_node_at: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_detach_text_from_edge: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_evaluate_drop: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_evaluate_near_detach: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_finalize_bounds: (a: number) => number;
    readonly fdcanvas_find_edge_for_text: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_container_ids: (a: number) => [number, number];
    readonly fdcanvas_get_node_kind: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_parent_id: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_text_child_id: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_reorder_child: (a: number, b: number, c: number, d: number) => number;
    readonly fdcanvas_reparent_into: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_reparent_into_centered: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_set_node_position: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_cancel_drag: (a: number) => number;
    readonly fdcanvas_handle_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly fdcanvas_handle_pointer_down: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly fdcanvas_handle_pointer_move: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly fdcanvas_handle_pointer_up: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly fdcanvas_handle_stylus_squeeze: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_add_to_selection: (a: number, b: number, c: number) => number;
    readonly fdcanvas_clear_pressed: (a: number) => void;
    readonly fdcanvas_delete_selected: (a: number) => number;
    readonly fdcanvas_duplicate_selected: (a: number) => number;
    readonly fdcanvas_duplicate_selected_at: (a: number, b: number, c: number) => number;
    readonly fdcanvas_get_alt_drag_ghost: (a: number) => [number, number];
    readonly fdcanvas_get_selected_id: (a: number) => [number, number];
    readonly fdcanvas_get_selected_ids: (a: number) => [number, number];
    readonly fdcanvas_get_selection_bounds: (a: number) => any;
    readonly fdcanvas_group_selected: (a: number) => number;
    readonly fdcanvas_select_by_id: (a: number, b: number, c: number) => number;
    readonly fdcanvas_select_multiple_by_ids: (a: number, b: number, c: number) => number;
    readonly fdcanvas_toggle_select_by_id: (a: number, b: number, c: number) => number;
    readonly fdcanvas_ungroup_selected: (a: number) => number;
    readonly fdcanvas_compute_guides_for_rect: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_emit_selection_fd: (a: number) => [number, number];
    readonly fdcanvas_export_excalidraw: (a: number) => [number, number];
    readonly fdcanvas_export_html: (a: number) => [number, number];
    readonly fdcanvas_export_svg: (a: number) => [number, number];
    readonly fdcanvas_get_node_bounds: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_node_bounds_json: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_node_props: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_scene_bounds: (a: number) => [number, number];
    readonly fdcanvas_get_selected_node_props: (a: number) => [number, number];
    readonly fdcanvas_get_text_children: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_has_text_child: (a: number, b: number, c: number) => number;
    readonly fdcanvas_hit_test_at: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_hit_test_at_excluding: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_hit_test_edge_at: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_is_node_locked: (a: number, b: number, c: number) => number;
    readonly fdcanvas_parent_of: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_render: (a: number, b: any, c: number, d: number, e: number) => void;
    readonly fdcanvas_render_export: (a: number, b: any, c: number, d: number) => void;
    readonly fdcanvas_set_multi_node_prop: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_set_node_prop: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_toggle_node_locked: (a: number, b: number, c: number) => number;
    readonly fdcanvas_update_text_metrics: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_add_animation_to_node: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly fdcanvas_get_all_specs: (a: number) => [number, number];
    readonly fdcanvas_get_node_animations_json: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_spec: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_remove_node_animations: (a: number, b: number, c: number) => number;
    readonly fdcanvas_set_spec: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
