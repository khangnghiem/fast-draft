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
     * Create a node at a specific position (for drag-and-drop).
     * `kind` is \"rect\", \"ellipse\", or \"text\".
     * Returns `true` if the node was created.
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
     * Duplicate the currently selected node(s). Returns true if duplicated.
     * @returns {boolean}
     */
    duplicate_selected() {
        const ret = wasm.fdcanvas_duplicate_selected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Get annotations for a node as JSON array.
     * Returns `[]` if node not found or has no annotations.
     * @param {string} node_id
     * @returns {string}
     */
    get_annotations_json(node_id) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.fdcanvas_get_annotations_json(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Get the scene-space bounds of a node by its ID.
     * Returns `{}` if the node is not found.
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
     * Handle pointer move event. Returns true if the graph changed.
     * @param {number} x
     * @param {number} y
     * @param {number} pressure
     * @param {boolean} shift
     * @param {boolean} ctrl
     * @param {boolean} alt
     * @param {boolean} meta
     * @returns {boolean}
     */
    handle_pointer_move(x, y, pressure, shift, ctrl, alt, meta) {
        const ret = wasm.fdcanvas_handle_pointer_move(this.__wbg_ptr, x, y, pressure, shift, ctrl, alt, meta);
        return ret !== 0;
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
     * Check if text changed due to canvas interaction (for sync back to editor).
     * @returns {boolean}
     */
    has_pending_text_change() {
        const ret = wasm.fdcanvas_has_pending_text_change(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Hit-test for annotation badge dots.
     * Returns the node ID if the point hits a badge, or empty string.
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    hit_test_badge(x, y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.fdcanvas_hit_test_badge(this.__wbg_ptr, x, y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
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
     * Redo the last undone action.
     * @returns {boolean}
     */
    redo() {
        const ret = wasm.fdcanvas_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Render the scene to a Canvas2D context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} time_ms
     */
    render(ctx, time_ms) {
        wasm.fdcanvas_render(this.__wbg_ptr, ctx, time_ms);
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
     * Set annotations for a node from a JSON array.
     * Returns `true` on success.
     * @param {string} node_id
     * @param {string} json
     * @returns {boolean}
     */
    set_annotations_json(node_id, json) {
        const ptr0 = passStringToWasm0(node_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_set_annotations_json(this.__wbg_ptr, ptr0, len0, ptr1, len1);
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
     * Set the FD source text, re-parsing into the scene graph.
     * Returns `true` on success, `false` on parse error.
     * @param {string} text
     * @returns {boolean}
     */
    set_text(text) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.fdcanvas_set_text(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
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
}
if (Symbol.dispose) FdCanvas.prototype[Symbol.dispose] = FdCanvas.prototype.free;

/**
 * Parse FD source and return the scene graph as JSON for the tree preview.
 * Returns JSON `{"ok":true,"nodes":[...]}` or `{"ok":false,"error":"..."}`.
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
 * Validate FD source text. Returns JSON: `{"ok":true}` or `{"ok":false,"error":"..."}`.
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
        __wbg_lineTo_c584cff6c760c4a5: function(arg0, arg1, arg2) {
            arg0.lineTo(arg1, arg2);
        },
        __wbg_moveTo_e9190fc700d55b40: function(arg0, arg1, arg2) {
            arg0.moveTo(arg1, arg2);
        },
        __wbg_new_3eb36ae241fe6f44: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_of_9ab14f9d4bfb5040: function(arg0, arg1) {
            const ret = Array.of(arg0, arg1);
            return ret;
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
        __wbg_set_lineDashOffset_ce4b3678fdd4e226: function(arg0, arg1) {
            arg0.lineDashOffset = arg1;
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
        __wbg_strokeRect_4da24de25ed7fbaf: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.strokeRect(arg1, arg2, arg3, arg4);
        },
        __wbg_stroke_240ea7f2407d73c0: function(arg0) {
            arg0.stroke();
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
