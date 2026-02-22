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
     * Get annotations for a node as JSON array.
     * Returns `[]` if node not found or has no annotations.
     */
    get_annotations_json(node_id: string): string;
    /**
     * Get the currently selected node ID, or empty string if none.
     */
    get_selected_id(): string;
    /**
     * Get the current FD source text (synced from graph).
     */
    get_text(): string;
    /**
     * Handle pointer down event. Returns true if the graph changed.
     */
    handle_pointer_down(x: number, y: number, pressure: number): boolean;
    /**
     * Handle pointer move event. Returns true if the graph changed.
     */
    handle_pointer_move(x: number, y: number, pressure: number): boolean;
    /**
     * Handle pointer up event. Returns true if the graph changed.
     */
    handle_pointer_up(x: number, y: number): boolean;
    /**
     * Check if text changed due to canvas interaction (for sync back to editor).
     */
    has_pending_text_change(): boolean;
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
     * Render the scene to a Canvas2D context.
     */
    render(ctx: CanvasRenderingContext2D): void;
    /**
     * Resize the canvas.
     */
    resize(width: number, height: number): void;
    /**
     * Set annotations for a node from a JSON array.
     * Returns `true` on success.
     */
    set_annotations_json(node_id: string, json: string): boolean;
    /**
     * Set the FD source text, re-parsing into the scene graph.
     * Returns `true` on success, `false` on parse error.
     */
    set_text(text: string): boolean;
    /**
     * Switch the active tool.
     */
    set_tool(name: string): void;
    /**
     * Undo the last action.
     */
    undo(): boolean;
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
    readonly fdcanvas_get_annotations_json: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_get_selected_id: (a: number) => [number, number];
    readonly fdcanvas_get_text: (a: number) => [number, number];
    readonly fdcanvas_handle_pointer_down: (a: number, b: number, c: number, d: number) => number;
    readonly fdcanvas_handle_pointer_move: (a: number, b: number, c: number, d: number) => number;
    readonly fdcanvas_handle_pointer_up: (a: number, b: number, c: number) => number;
    readonly fdcanvas_has_pending_text_change: (a: number) => number;
    readonly fdcanvas_hit_test_badge: (a: number, b: number, c: number) => [number, number];
    readonly fdcanvas_new: (a: number, b: number) => number;
    readonly fdcanvas_redo: (a: number) => number;
    readonly fdcanvas_render: (a: number, b: any) => void;
    readonly fdcanvas_resize: (a: number, b: number, c: number) => void;
    readonly fdcanvas_set_annotations_json: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly fdcanvas_set_text: (a: number, b: number, c: number) => number;
    readonly fdcanvas_set_tool: (a: number, b: number, c: number) => void;
    readonly fdcanvas_undo: (a: number) => number;
    readonly parse_to_json: (a: number, b: number) => [number, number];
    readonly validate: (a: number, b: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
