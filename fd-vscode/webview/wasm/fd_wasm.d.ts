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
     * `trigger` is "hover", "press", or "enter".
     * `props_json` is a JSON object with optional keys: scale, opacity, rotate, fill, duration, ease.
     * Returns `true` on success.
     */
    add_animation_to_node(node_id: string, trigger: string, props_json: string): boolean;
    /**
     * Clear the pressed interaction state.
     *
     * Called from JS when entering inline text editing to suppress
     * press animations that cause a visual shape jump on double-click.
     */
    clear_pressed(): void;
    /**
     * Create a node at a specific position (for drag-and-drop).
     * `kind` is "rect", "ellipse", "text", or "frame".
     * Returns `true` if the node was created.
     */
    create_node_at(kind: string, x: number, y: number): boolean;
    /**
     * Delete the currently selected node(s). Returns true if any was deleted.
     */
    delete_selected(): boolean;
    /**
     * Duplicate the currently selected node(s). Returns true if duplicated.
     */
    duplicate_selected(): boolean;
    /**
     * Get annotations for a node as JSON array.
     * Returns `[]` if node not found or has no annotations.
     */
    get_annotations_json(node_id: string): string;
    /**
     * Get the arrow tool's live preview line during drag.
     * Returns JSON `{"x1":..,"y1":..,"x2":..,"y2":..}` or `""` if not dragging.
     */
    get_arrow_preview(): string;
    /**
     * Get animations for a node as a JSON array.
     * Returns `[]` if node not found or has no animations.
     */
    get_node_animations_json(node_id: string): string;
    /**
     * Get the scene-space bounds of a node by its ID.
     * Returns `{}` if the node is not found.
     */
    get_node_bounds(node_id: string): string;
    /**
     * Get the currently selected node ID, or empty string if none.
     * Returns the first selected node for backward compatibility.
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
     * Check if sketchy rendering mode is enabled.
     */
    get_sketchy_mode(): boolean;
    /**
     * Get the current FD source text (synced from graph).
     */
    get_text(): string;
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
     * Handle pointer move event. Returns true if the graph changed.
     */
    handle_pointer_move(x: number, y: number, pressure: number, shift: boolean, ctrl: boolean, alt: boolean, meta: boolean): boolean;
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
     * Check if text changed due to canvas interaction (for sync back to editor).
     */
    has_pending_text_change(): boolean;
    /**
     * Hit-test at scene-space coordinates. Returns the topmost node ID, or empty string.
     */
    hit_test_at(x: number, y: number): string;
    /**
     * Hit-test for annotation badge dots.
     * Returns the node ID if the point hits a badge, or empty string.
     */
    hit_test_badge(x: number, y: number): string;
    /**
     * Create a new canvas controller with the given dimensions.
     */
    constructor(width: number, height: number);
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
     */
    render(ctx: CanvasRenderingContext2D, time_ms: number): void;
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
     * Set annotations for a node from a JSON array.
     * Returns `true` on success.
     */
    set_annotations_json(node_id: string, json: string): boolean;
    /**
     * Set a property on the currently selected node.
     * Returns `true` if the property was set.
     */
    set_node_prop(key: string, value: string): boolean;
    /**
     * Enable or disable sketchy (hand-drawn) rendering mode.
     */
    set_sketchy_mode(enabled: boolean): void;
    /**
     * Set the FD source text, re-parsing into the scene graph.
     * Returns `true` on success, `false` on parse error.
     */
    set_text(text: string): boolean;
    /**
     * Set the canvas theme.
     */
    set_theme(is_dark: boolean): void;
    /**
     * Switch the active tool, remembering the previous one.
     */
    set_tool(name: string): void;
    /**
     * Undo the last action.
     */
    undo(): boolean;
    /**
     * Ungroup all selected groups. Returns true if any were ungrouped.
     */
    ungroup_selected(): boolean;
}

/**
 * Parse FD source and return the scene graph as JSON for the tree preview.
 * Returns JSON `{"ok":true,"nodes":[...]}` or `{"ok":false,"error":"..."}`.
 */
export function parse_to_json(source: string): string;

/**
 * Validate FD source text. Returns JSON: `{"ok":true}` or `{"ok":false,"error":"..."}`.
 */
export function validate(source: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_fdcanvas_free: (a: number, b: number) => void;
    readonly fdcanvas_add_animation_to_node: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly fdcanvas_clear_pressed: (a: number) => void;
    readonly fdcanvas_create_node_at: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_delete_selected: (a: number) => number;
    readonly fdcanvas_duplicate_selected: (a: number) => number;
    readonly fdcanvas_get_annotations_json: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_arrow_preview: (a: number) => [number, number];
    readonly fdcanvas_get_node_animations_json: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_node_bounds: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_selected_id: (a: number) => [number, number];
    readonly fdcanvas_get_selected_ids: (a: number) => [number, number];
    readonly fdcanvas_get_selected_node_props: (a: number) => [number, number];
    readonly fdcanvas_get_sketchy_mode: (a: number) => number;
    readonly fdcanvas_get_text: (a: number) => [number, number];
    readonly fdcanvas_get_tool_name: (a: number) => [number, number];
    readonly fdcanvas_group_selected: (a: number) => number;
    readonly fdcanvas_handle_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly fdcanvas_handle_pointer_down: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly fdcanvas_handle_pointer_move: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly fdcanvas_handle_pointer_up: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly fdcanvas_handle_stylus_squeeze: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly fdcanvas_has_pending_text_change: (a: number) => number;
    readonly fdcanvas_hit_test_at: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_hit_test_badge: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_new: (a: number, b: number) => number;
    readonly fdcanvas_redo: (a: number) => number;
    readonly fdcanvas_remove_node_animations: (a: number, b: number, c: number) => number;
    readonly fdcanvas_render: (a: number, b: any, c: number) => void;
    readonly fdcanvas_resize: (a: number, b: number, c: number) => void;
    readonly fdcanvas_select_by_id: (a: number, b: number, c: number) => number;
    readonly fdcanvas_set_annotations_json: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_set_node_prop: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_set_sketchy_mode: (a: number, b: number) => void;
    readonly fdcanvas_set_text: (a: number, b: number, c: number) => number;
    readonly fdcanvas_set_theme: (a: number, b: number) => void;
    readonly fdcanvas_set_tool: (a: number, b: number, c: number) => void;
    readonly fdcanvas_undo: (a: number) => number;
    readonly fdcanvas_ungroup_selected: (a: number) => number;
    readonly parse_to_json: (a: number, b: number) => [number, number];
    readonly validate: (a: number, b: number) => [number, number];
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
