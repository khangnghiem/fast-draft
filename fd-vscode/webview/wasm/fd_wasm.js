/* @ts-self-types="./fd_wasm.d.ts" */

/**
 * The main WASM-facing canvas controller.
 *
 * Holds the sync engine, command stack, and active tool. All interaction
 * from the webview JS goes through this struct.
 */
export class FdCanvas {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        FdCanvasFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_fdcanvas_free(ptr, 0);
    }
    /**
     * Add an animation to a node by ID.
     * @param {string} node_id
     * @param {string} trigger
     * @param {string} props_json
     * @returns {boolean}
     */
    add_animation_to_node(node_id, trigger, props_json) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(trigger, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(props_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_add_animation_to_node(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        return ret !== 0;
    }
    /**
     * Cancel an in-progress drag gesture (Esc mid-drag).
     *
     * Restores the scene to the pre-drag state by abandoning the batch
     * snapshot and resetting all tool drag flags. Returns `true` if a
     * drag was actually cancelled.
     * @returns {boolean}
     */
    cancel_drag() {
        const ret = wasm.fdcanvas_cancel_drag(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Clear the pressed interaction state.
     *
     * Called from JS when entering inline text editing to suppress
     * press animations that cause a visual shape jump on double-click.
     */
    clear_pressed() {
        wasm.fdcanvas_clear_pressed(this.__wbg_ptr);
    }
    /**
     * Compute alignment guides for a hypothetical rect at (x, y, w, h).
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @returns {string}
     */
    compute_guides_for_rect(x, y, w, h) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_compute_guides_for_rect(this.__wbg_ptr, x, y, w, h);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Compute the AI comprehensibility score (R4.21).
     * Returns JSON: `{"total":72,"metrics":[{"name":"...","label":"...","score":15,"suggestion":"..."},...]}`
     * @returns {string}
     */
    compute_score() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_compute_score(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Create a text node as a child of an existing shape.
     * @param {string} parent_id
     * @param {string} content
     * @returns {string}
     */
    create_child_text(parent_id, content) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(parent_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_create_child_text(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Create an edge between two nodes.
     * @param {string} from_id
     * @param {string} to_id
     * @returns {string}
     */
    create_edge(from_id, to_id) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(from_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(to_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_create_edge(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Create a standalone edge with point anchors.
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {string}
     */
    create_edge_at(x1, y1, x2, y2) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_create_edge_at(this.__wbg_ptr, x1, y1, x2, y2);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Create a node at a specific position (for drag-and-drop).
     * @param {string} kind
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    create_node_at(kind, x, y) {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_create_node_at(this.__wbg_ptr, ptr0, len0, x, y);
        return ret !== 0;
    }
    /**
     * Delete the currently selected node(s). Returns true if any was deleted.
     * @returns {boolean}
     */
    delete_selected() {
        const ret = wasm.fdcanvas_delete_selected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Detach a text child from its parent edge.
     * @param {string} text_id
     * @returns {string}
     */
    detach_text_from_edge(text_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(text_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_detach_text_from_edge(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Duplicate the currently selected node(s). Returns true if duplicated.
     * @returns {boolean}
     */
    duplicate_selected() {
        const ret = wasm.fdcanvas_duplicate_selected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Duplicate selected node(s) with a custom offset. Returns true if duplicated.
     * Handles multi-select: clones ALL selected nodes, deep-copies Group/Frame
     * subtrees, remaps internal references, and duplicates edges between them.
     * Use (0, 0) for Alt+drag clone-in-place.
     * @param {number} dx
     * @param {number} dy
     * @returns {boolean}
     */
    duplicate_selected_at(dx, dy) {
        const ret = wasm.fdcanvas_duplicate_selected_at(this.__wbg_ptr, dx, dy);
        return ret !== 0;
    }
    /**
     * Emit FD text for only the currently selected nodes.
     *
     * Returns valid FD text containing just the selected node blocks
     * (including children for groups/frames). If nothing is selected,
     * returns the full document. Used by AI Touch to provide accurate
     * selection context without fragile regex extraction.
     * @returns {string}
     */
    emit_selection_fd() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_emit_selection_fd(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Evaluate a drop for structural detach.
     * @param {string} node_id
     * @returns {string}
     */
    evaluate_drop(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_evaluate_drop(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Evaluate if a dragging node is near detaching from its parent group.
     * @param {string} node_id
     * @returns {string}
     */
    evaluate_near_detach(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_evaluate_near_detach(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Export the current selection (or entire canvas if empty) as Excalidraw v2 JSON.
     *
     * The output can be pasted directly into excalidraw.com.
     * @returns {string}
     */
    export_excalidraw() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_export_excalidraw(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Export the current selection (or entire canvas if empty) as an SVG string.
     * @returns {string}
     */
    export_svg() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_export_svg(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Post-release: expand parent groups to contain overflowing children.
     * @returns {boolean}
     */
    finalize_bounds() {
        const ret = wasm.fdcanvas_finalize_bounds(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Find the edge whose text_child matches the given text node ID.
     * @param {string} text_id
     * @returns {string}
     */
    find_edge_for_text(text_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(text_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_find_edge_for_text(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get all notes across the entire document.
     * @returns {string}
     */
    get_all_notes() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_all_notes(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get ghost origin bounds for Alt+drag visual feedback.
     * Returns a JSON array of `{x, y, w, h}` objects, or empty string
     * if no Alt+drag clone is active.
     * @returns {string}
     */
    get_alt_drag_ghost() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_alt_drag_ghost(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the arrow tool's live preview line during drag.
     * @returns {string}
     */
    get_arrow_preview() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_arrow_preview(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get context-aware completions at the cursor position.
     * @param {number} line
     * @param {number} col
     * @returns {string}
     */
    get_completions(line, col) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_completions(this.__wbg_ptr, line, col);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Whether to show only corner handles (true for touch).
     * @returns {boolean}
     */
    get_corners_only() {
        const ret = wasm.fdcanvas_get_corners_only(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get parse diagnostics for the current document text.
     * @returns {string}
     */
    get_diagnostics() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_diagnostics(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the visual handle size for the current pointer type (for JS rendering).
     * @returns {number}
     */
    get_handle_visual_size() {
        const ret = wasm.fdcanvas_get_handle_visual_size(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get hover information at the cursor position.
     * @param {number} line
     * @param {number} col
     * @returns {string}
     */
    get_hover(line, col) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_hover(this.__wbg_ptr, line, col);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get animations for a node as a JSON array.
     * @param {string} node_id
     * @returns {string}
     */
    get_node_animations_json(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_node_animations_json(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the scene-space bounds of a node by its ID.
     * @param {string} node_id
     * @returns {string}
     */
    get_node_bounds(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_node_bounds(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the resolved bounds of a node by its `@id` as JSON.
     * @param {string} id_str
     * @returns {string}
     */
    get_node_bounds_json(id_str) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(id_str, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_node_bounds_json(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get basic properties of a node by its ID (without selecting it).
     * @param {string} node_id
     * @returns {string}
     */
    get_node_props(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_node_props(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the raw markdown note for a node.
     * @param {string} node_id
     * @returns {string}
     */
    get_note(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_note(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the bounding box of all non-root nodes in the scene.
     * @returns {string}
     */
    get_scene_bounds() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_scene_bounds(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the currently selected node ID, or empty string if none.
     * Returns the first selected node for backward compatibility.
     * @returns {string}
     */
    get_selected_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_selected_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get all selected node IDs as a JSON array.
     * @returns {string}
     */
    get_selected_ids() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_selected_ids(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get properties of the currently selected node as JSON.
     * Returns `{}` if no node is selected.
     * @returns {string}
     */
    get_selected_node_props() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_selected_node_props(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the union bounding box of all currently selected nodes (including children).
     * Returns `[x, y, width, height]` array, or `None` if selection is empty.
     * @returns {Float64Array | undefined}
     */
    get_selection_bounds() {
        const ret = wasm.fdcanvas_get_selection_bounds(this.__wbg_ptr);
        return ret;
    }
    /**
     * Check if sketchy rendering mode is enabled.
     * @returns {boolean}
     */
    get_sketchy_mode() {
        const ret = wasm.fdcanvas_get_sketchy_mode(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get the current FD source text (synced from graph).
     * @returns {string}
     */
    get_text() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_text(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the ID of the first text child node of a shape.
     * @param {string} parent_id
     * @returns {string}
     */
    get_text_child_id(parent_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(parent_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_text_child_id(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get IDs of all direct Text children of a node.
     * @param {string} node_id
     * @returns {string}
     */
    get_text_children(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_text_children(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the current theme as a JSON object.
     * @returns {string}
     */
    get_theme_json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_theme_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Get the current tool name.
     * @returns {string}
     */
    get_tool_name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_get_tool_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Group the currently selected nodes. Returns true if grouped.
     * @returns {boolean}
     */
    group_selected() {
        const ret = wasm.fdcanvas_group_selected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Handle a keyboard event. Returns a JSON string:
     * `{"changed":bool, "action":"<action_name>", "tool":"<tool_name>"}`
     * @param {string} key
     * @param {boolean} ctrl
     * @param {boolean} shift
     * @param {boolean} alt
     * @param {boolean} meta
     * @returns {string}
     */
    handle_key(key, ctrl, shift, alt, meta) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_handle_key(this.__wbg_ptr, ptr0, len0, ctrl, shift, alt, meta);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Handle pointer down event. Returns true if the graph changed.
     * @param {number} x
     * @param {number} y
     * @param {number} pressure
     * @param {boolean} shift
     * @param {boolean} ctrl
     * @param {boolean} alt
     * @param {boolean} meta
     * @returns {boolean}
     */
    handle_pointer_down(x, y, pressure, shift, ctrl, alt, meta) {
        const ret = wasm.fdcanvas_handle_pointer_down(this.__wbg_ptr, x, y, pressure, shift, ctrl, alt, meta);
        return ret !== 0;
    }
    /**
     * Handle pointer move event. Returns JSON string:
     * `{"changed":bool}` or `{"changed":bool,"bounds":{"x":N,"y":N,"w":N,"h":N}}`
     * when actively dragging a selected node (for dimension tooltip).
     * @param {number} x
     * @param {number} y
     * @param {number} pressure
     * @param {boolean} shift
     * @param {boolean} ctrl
     * @param {boolean} alt
     * @param {boolean} meta
     * @returns {string}
     */
    handle_pointer_move(x, y, pressure, shift, ctrl, alt, meta) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_handle_pointer_move(this.__wbg_ptr, x, y, pressure, shift, ctrl, alt, meta);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Handle pointer up event. Returns a JSON string:
     * `{"changed":bool, "toolSwitched":bool, "tool":"<name>"}`
     *
     * After a drawing gesture (Rect/Ellipse/Pen/Text) completes,
     * the tool automatically switches back to Select.
     * @param {number} x
     * @param {number} y
     * @param {boolean} shift
     * @param {boolean} ctrl
     * @param {boolean} alt
     * @param {boolean} meta
     * @returns {string}
     */
    handle_pointer_up(x, y, shift, ctrl, alt, meta) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_handle_pointer_up(this.__wbg_ptr, x, y, shift, ctrl, alt, meta);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
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
     * @param {boolean} shift
     * @param {boolean} ctrl
     * @param {boolean} alt
     * @param {boolean} meta
     * @returns {string}
     */
    handle_stylus_squeeze(shift, ctrl, alt, meta) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_handle_stylus_squeeze(this.__wbg_ptr, shift, ctrl, alt, meta);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Check if any edge in the scene has a flow animation.
     * @returns {boolean}
     */
    has_active_flows() {
        const ret = wasm.fdcanvas_has_active_flows(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Check if text changed due to canvas interaction (for sync back to editor).
     * @returns {boolean}
     */
    has_pending_text_change() {
        const ret = wasm.fdcanvas_has_pending_text_change(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Check if a node has any direct Text children.
     * @param {string} node_id
     * @returns {boolean}
     */
    has_text_child(node_id) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_has_text_child(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Hit-test at scene-space coordinates. Returns the topmost node ID, or empty string.
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    hit_test_at(x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_hit_test_at(this.__wbg_ptr, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Hit-test for edges only at scene-space coordinates.
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    hit_test_edge_at(x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_hit_test_edge_at(this.__wbg_ptr, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Import a Mermaid diagram, converting it to FD format.
     * @param {string} mermaid_text
     * @returns {boolean}
     */
    import_mermaid(mermaid_text) {
        const ptr0 = passStringToWasm0(mermaid_text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_import_mermaid(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Check if a node is locked. Returns false if node not found.
     * @param {string} id
     * @returns {boolean}
     */
    is_node_locked(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_is_node_locked(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Create a new canvas controller with the given dimensions.
     * @param {number} width
     * @param {number} height
     */
    constructor(width, height) {
        const ret = wasm.fdcanvas_new(width, height);
        this.__wbg_ptr = ret >>> 0;
        FdCanvasFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Get the parent ID of a node. Returns empty string for root-level nodes.
     * @param {string} node_id
     * @returns {string}
     */
    parent_of(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_parent_of(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Push a text snapshot for undo support.
     * @param {string} text_before
     * @param {string} text_after
     */
    push_undo_snapshot(text_before, text_after) {
        const ptr0 = passStringToWasm0(text_before, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text_after, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.fdcanvas_push_undo_snapshot(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Redo the last undone action.
     * @returns {boolean}
     */
    redo() {
        const ret = wasm.fdcanvas_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Remove all animations from a node. Returns `true` if changed.
     * @param {string} node_id
     * @returns {boolean}
     */
    remove_node_animations(node_id) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_remove_node_animations(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Render the scene to a Canvas2D context.
     *
     * * `skip_grid` — skip drawing the background grid dots.
     * * `skip_bg` — skip filling the background color.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} time_ms
     * @param {boolean} skip_grid
     * @param {boolean} skip_bg
     */
    render(ctx, time_ms, skip_grid, skip_bg) {
        wasm.fdcanvas_render(this.__wbg_ptr, ctx, time_ms, skip_grid, skip_bg);
    }
    /**
     * Render only the selected nodes (and their children) to the given context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} offset_x
     * @param {number} offset_y
     */
    render_export(ctx, offset_x, offset_y) {
        wasm.fdcanvas_render_export(this.__wbg_ptr, ctx, offset_x, offset_y);
    }
    /**
     * Resize the canvas.
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        wasm.fdcanvas_resize(this.__wbg_ptr, width, height);
    }
    /**
     * Select a node by its ID (e.g. from text editor cursor).
     * Returns `true` if the node was found and selected.
     * @param {string} node_id
     * @returns {boolean}
     */
    select_by_id(node_id) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_select_by_id(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Set a property on ALL currently selected nodes (bulk editing).
     * Returns `true` if any node was changed.
     * @param {string} key
     * @param {string} value
     * @returns {boolean}
     */
    set_multi_node_prop(key, value) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_set_multi_node_prop(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * Set a property on the currently selected node.
     * Returns `true` if the property was set.
     * @param {string} key
     * @param {string} value
     * @returns {boolean}
     */
    set_node_prop(key, value) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_set_node_prop(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * Set the raw markdown note for a node.
     * @param {string} node_id
     * @param {string} content
     * @returns {boolean}
     */
    set_note(node_id, content) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(content, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_set_note(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * Set the current pointer device type (0=mouse, 1=touch, 2=pen).
     * Called from JS before each pointer event to adapt hit radii and handle sizes.
     * @param {number} ptype
     */
    set_pointer_type(ptype) {
        wasm.fdcanvas_set_pointer_type(this.__wbg_ptr, ptype);
    }
    /**
     * Enable or disable sketchy (hand-drawn) rendering mode.
     * @param {boolean} enabled
     */
    set_sketchy_mode(enabled) {
        wasm.fdcanvas_set_sketchy_mode(this.__wbg_ptr, enabled);
    }
    /**
     * Set the FD source text, re-parsing into the scene graph.
     * Returns a JSON string: `{"ok":true,"layout_changed":bool}`
     * @param {string} text
     * @returns {string}
     */
    set_text(text) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_set_text(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Set the canvas theme.
     * @param {boolean} is_dark
     */
    set_theme(is_dark) {
        wasm.fdcanvas_set_theme(this.__wbg_ptr, is_dark);
    }
    /**
     * Switch the active tool, remembering the previous one.
     * @param {string} name
     */
    set_tool(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.fdcanvas_set_tool(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Toggle the locked state of a node. Returns the new locked state.
     * @param {string} id
     * @returns {boolean}
     */
    toggle_node_locked(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_toggle_node_locked(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Undo the last action.
     * @returns {boolean}
     */
    undo() {
        const ret = wasm.fdcanvas_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Ungroup all selected groups. Returns true if any were ungrouped.
     * @returns {boolean}
     */
    ungroup_selected() {
        const ret = wasm.fdcanvas_ungroup_selected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Update a text node's resolved bounds using JS-measured dimensions.
     * @param {string} node_id
     * @param {number} measured_width
     * @param {number} measured_height
     * @returns {boolean}
     */
    update_text_metrics(node_id, measured_width, measured_height) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_update_text_metrics(this.__wbg_ptr, ptr0, len0, measured_width, measured_height);
        return ret !== 0;
    }
}
if (Symbol.dispose) FdCanvas.prototype[Symbol.dispose] = FdCanvas.prototype.free;

/**
 * Parse FD source and return the scene graph as JSON for the tree preview.
 * @param {string} source
 * @returns {string}
 */
export function parse_to_json(source) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.parse_to_json(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Validate FD source text.
 * @param {string} source
 * @returns {string}
 */
export function validate(source) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validate(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_debug_string_0bc8482c6e3508ae: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_undefined_9e4d92534c42d778: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_be289d5034ed271b: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_addColorStop_2f80f11dfad35dec: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.addColorStop(arg1, getStringFromWasm0(arg2, arg3));
        }, arguments); },
        __wbg_arcTo_ddf6b8adf3bf5084: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.arcTo(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_arc_60bf829e1bd2add5: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.arc(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_beginPath_9873f939d695759c: function(arg0) {
            arg0.beginPath();
        },
        __wbg_bezierCurveTo_38509204f815cfd5: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.bezierCurveTo(arg1, arg2, arg3, arg4, arg5, arg6);
        },
        __wbg_call_389efe28435a9388: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_closePath_de4e48859360b1b1: function(arg0) {
            arg0.closePath();
        },
        __wbg_createLinearGradient_b3d3d1a53abe5362: function(arg0, arg1, arg2, arg3, arg4) {
            const ret = arg0.createLinearGradient(arg1, arg2, arg3, arg4);
            return ret;
        },
        __wbg_createRadialGradient_b43c38d4bed3b571: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            const ret = arg0.createRadialGradient(arg1, arg2, arg3, arg4, arg5, arg6);
            return ret;
        }, arguments); },
        __wbg_ellipse_3343f79b255f83a4: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            arg0.ellipse(arg1, arg2, arg3, arg4, arg5, arg6, arg7);
        }, arguments); },
        __wbg_error_9a7fe3f932034cde: function(arg0) {
            console.error(arg0);
        },
        __wbg_fillRect_d44afec47e3a3fab: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.fillRect(arg1, arg2, arg3, arg4);
        },
        __wbg_fillText_4a931850b976cc62: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.fillText(getStringFromWasm0(arg1, arg2), arg3, arg4);
        }, arguments); },
        __wbg_fill_1eb35c386c8676aa: function(arg0) {
            arg0.fill();
        },
        __wbg_globalAlpha_b7066dce190ba988: function(arg0) {
            const ret = arg0.globalAlpha;
            return ret;
        },
        __wbg_instanceof_Window_ed49b2db8df90359: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_lineTo_c584cff6c760c4a5: function(arg0, arg1, arg2) {
            arg0.lineTo(arg1, arg2);
        },
        __wbg_measureText_9d64a92333bd05ee: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.measureText(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_moveTo_e9190fc700d55b40: function(arg0, arg1, arg2) {
            arg0.moveTo(arg1, arg2);
        },
        __wbg_new_3eb36ae241fe6f44: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_no_args_1c7c842f08d00ebb: function(arg0, arg1) {
            const ret = new Function(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_with_length_6523745c0bd32809: function(arg0) {
            const ret = new Float64Array(arg0 >>> 0);
            return ret;
        },
        __wbg_now_ebffdf7e580f210d: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_of_9ab14f9d4bfb5040: function(arg0, arg1) {
            const ret = Array.of(arg0, arg1);
            return ret;
        },
        __wbg_performance_06f12ba62483475d: function(arg0) {
            const ret = arg0.performance;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_quadraticCurveTo_b39b7adc73767cc0: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.quadraticCurveTo(arg1, arg2, arg3, arg4);
        },
        __wbg_restore_0d233789d098ba64: function(arg0) {
            arg0.restore();
        },
        __wbg_save_e0cc2e58b36d33c9: function(arg0) {
            arg0.save();
        },
        __wbg_scale_543277ecf8cf836b: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.scale(arg1, arg2);
        }, arguments); },
        __wbg_setLineDash_ecf27050368658c9: function() { return handleError(function (arg0, arg1) {
            arg0.setLineDash(arg1);
        }, arguments); },
        __wbg_set_fillStyle_783d3f7489475421: function(arg0, arg1, arg2) {
            arg0.fillStyle = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_fillStyle_9bd3ccbe7ecf6c2a: function(arg0, arg1) {
            arg0.fillStyle = arg1;
        },
        __wbg_set_font_575685c8f7e56957: function(arg0, arg1, arg2) {
            arg0.font = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_globalAlpha_c32898c5532572f4: function(arg0, arg1) {
            arg0.globalAlpha = arg1;
        },
        __wbg_set_index_78a85f2e336ce120: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_lineDashOffset_ce4b3678fdd4e226: function(arg0, arg1) {
            arg0.lineDashOffset = arg1;
        },
        __wbg_set_lineJoin_9b9f1aaa283be35a: function(arg0, arg1, arg2) {
            arg0.lineJoin = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_lineWidth_89fa506592f5b994: function(arg0, arg1) {
            arg0.lineWidth = arg1;
        },
        __wbg_set_shadowBlur_8aa041f690cac8d0: function(arg0, arg1) {
            arg0.shadowBlur = arg1;
        },
        __wbg_set_shadowColor_cd8db5e06be21e95: function(arg0, arg1, arg2) {
            arg0.shadowColor = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_shadowOffsetX_b7f3141c508230dc: function(arg0, arg1) {
            arg0.shadowOffsetX = arg1;
        },
        __wbg_set_shadowOffsetY_beb753d9e6d4a3ea: function(arg0, arg1) {
            arg0.shadowOffsetY = arg1;
        },
        __wbg_set_strokeStyle_087121ed5350b038: function(arg0, arg1, arg2) {
            arg0.strokeStyle = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_textAlign_cdfa5b9f1c14f5c6: function(arg0, arg1, arg2) {
            arg0.textAlign = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_textBaseline_c7ec6538cc52b073: function(arg0, arg1, arg2) {
            arg0.textBaseline = getStringFromWasm0(arg1, arg2);
        },
        __wbg_static_accessor_GLOBAL_12837167ad935116: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_e628e89ab3b1c95f: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_a621d3dfbb60d0ce: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_f8727f0cf888e0bd: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_strokeRect_4da24de25ed7fbaf: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.strokeRect(arg1, arg2, arg3, arg4);
        },
        __wbg_stroke_240ea7f2407d73c0: function(arg0) {
            arg0.stroke();
        },
        __wbg_translate_3aa10730376a8c06: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.translate(arg1, arg2);
        }, arguments); },
        __wbg_warn_f7ae1b2e66ccb930: function(arg0) {
            console.warn(arg0);
        },
        __wbg_width_9bbf873307a2ac4e: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./fd_wasm_bg.js": import0,
    };
}

const FdCanvasFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_fdcanvas_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('fd_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
