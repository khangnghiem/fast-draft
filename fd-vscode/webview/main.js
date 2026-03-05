/**
 * FD Webview — WASM loader + message bridge.
 *
 * ⚠️  AUTO-GENERATED — do not edit directly.
 * Edit source modules in webview/src/ and run: pnpm run build:webview
 *
 * Loads the Rust WASM module, initializes the FdCanvas, and bridges
 * between the VS Code extension (postMessage) and the WASM engine.
 *
 * NOTE: We use dynamic import() instead of static `import ... from`
 * because relative module resolution fails silently in VS Code webviews
 * (the vscode-webview:// resource scheme doesn't support it).
 */
/**
 * FD Webview — WASM loader + message bridge.
 *
 * Loads the Rust WASM module, initializes the FdCanvas, and bridges
 * between the VS Code extension (postMessage) and the WASM engine.
 *
 * NOTE: We use dynamic import() instead of static `import ... from`
 * because relative module resolution fails silently in VS Code webviews
 * (the vscode-webview:// resource scheme doesn't support it).
 */

// VS Code API (shared — already acquired in inline script)
const vscode = window.vscodeApi;

/** @type {any} */
let FdCanvas = null;

/** @type {any} */
let fdCanvas = null;

/** Last selection ID sent to extension — avoids redundant nodeSelected messages */
let lastNotifiedSelectedId = "";

/** Canvas pan offset (JS-side, applied via ctx.translate) */
let panX = 0;
let panY = 0;
let panStartX = 0;
let panStartY = 0;
let panDragging = false;

/** Zoom level (1.0 = 100%, range 0.1–10) */
let zoomLevel = 1.0;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const ZOOM_STEP = 1.25; // Each ⌘+/⌘− multiplies by this

/** @type {CanvasRenderingContext2D | null} */
let ctx = null;

/** @type {HTMLCanvasElement} */
let canvas;

/** Track if we're in the middle of a programmatic text update */
let suppressTextSync = false;

/** Currently open annotation card target node ID */
let annotationCardNodeId = null;

/** Node ID from right-click context menu */
let contextMenuNodeId = null;

/** Current view mode: "all" | "design" | "spec" */
let viewMode = "all";

/** Current spec filter: "all" | "todo" | "doing" | "done" | "blocked" */
let specFilter = "all";

/** Spec badge toggle — independent of view mode */
let specBadgesVisible = false;


// ─── Performance: Dirty Flag & Generation Counter ────────────────────────
/** Dirty flag — when true, the next animation frame will re-render */
let renderDirty = true;
/** Monotonic generation counter — bumped on every scene mutation */
let sceneGeneration = 0;
/** Side-effect throttle timer (layers, minimap, selection bar) */
let sideEffectTimer = null;
/** Cached scene bounds + generation for minimap */
let cachedSceneBounds = null;
let sceneBoundsGeneration = -1;

/** Mark the canvas as needing a re-render on the next animation frame. */
function markDirty() { renderDirty = true; }
/** Bump the scene generation counter (call on any data mutation). */
function bumpGeneration() { sceneGeneration++; markDirty(); }

/** Grid overlay state */
let gridEnabled = false;
const GRID_BASE_SPACING = 20;

/** Hidden nodes set (layer visibility toggle) */
const hiddenNodes = new Set();

/** Pointer interaction tracking for dimension tooltip */
let pointerIsDown = false;
let pointerDownSceneX = 0;
let pointerDownSceneY = 0;
let currentToolAtPointerDown = "select";

// ─── Modifier Drag State ─────────────────────────────────────────────────
/** ⌘+drag on drawing tool → temporary Select mode (Screenbrush) */
let cmdTempSelectActive = false;
let cmdTempSelectOriginalTool = null;
/** Alt+drag clone-and-drag active */
let altCloneActive = false;
/** Ctrl+click on any tool → temporary eraser mode */
let tempEraserMode = false;
let tempEraserPrevTool = null;

// ─── Eraser Poof Animation ───────────────────────────────────────────────
/** Entries: { x, y, width, height, startTime } — brief red fade on erase */
const erasePoofs = [];

// ─── Smart Defaults (Sticky Styles Per Tool) ─────────────────────────────
/** Session-only style defaults per tool type (Excalidraw-style) */
const toolDefaults = {
  rect: { fill: "none", stroke: "#333333", strokeWidth: 2.5, opacity: 1 },
  ellipse: { fill: "none", stroke: "#333333", strokeWidth: 2.5, opacity: 1 },
  pen: { stroke: "#333333", strokeWidth: 2, opacity: 1 },
  arrow: { stroke: "#333333", strokeWidth: 2, opacity: 1 },
  text: { fill: "#333333", fontSize: 16, opacity: 1 },
  frame: { stroke: "#6B7280", strokeWidth: 1, opacity: 1 },
};

/** Style picker: Alt+click a node → copies its style as defaults */
let stylePickerActive = false;

// Interaction state for Near-Detach feedback
let nearDetachState = null;

/** Capture a property change into the current tool's defaults */
function captureDefault(prop, value) {
  const toolName = fdCanvas ? fdCanvas.get_tool_name() : "select";
  // Also capture for the last-used drawing tool (for "select" mode edits)
  const targets = [toolName, lastDrawingTool].filter(Boolean);
  for (const t of targets) {
    if (toolDefaults[t]) {
      const map = {
        fill: "fill", stroke: "stroke", stroke_width: "strokeWidth",
        opacity: "opacity", font_size: "fontSize"
      };
      const key = map[prop] || prop;
      if (key in toolDefaults[t]) {
        toolDefaults[t][key] = isNaN(Number(value)) ? value : Number(value);
      }
    }
  }
}

/** Store the last drawing tool used for default capturing from Select mode */
let lastDrawingTool = "rect";

/** Show a brief toast notification at the bottom of the canvas */
function showToast(message, durationMs = 1200) {
  const existing = document.getElementById("fd-toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "fd-toast";
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 500;
    color: #fff; background: rgba(30,30,46,0.85); backdrop-filter: blur(8px);
    pointer-events: none; z-index: 9999; opacity: 0;
    transition: opacity 150ms ease;
  `;
  (canvas ? canvas.parentElement : document.body).appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, durationMs);
}

/** Apply stored defaults to the currently selected (newly created) node */
function applyDefaultsToNewNode(toolName) {
  if (!fdCanvas) return;
  const defaults = toolDefaults[toolName];
  if (!defaults) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;
  if (defaults.fill) fdCanvas.set_node_prop("fill", defaults.fill);
  if (defaults.stroke) fdCanvas.set_node_prop("stroke", defaults.stroke);
  if (defaults.strokeWidth !== undefined) fdCanvas.set_node_prop("stroke_width", String(defaults.strokeWidth));
  if (defaults.opacity !== undefined && defaults.opacity !== 1) fdCanvas.set_node_prop("opacity", String(defaults.opacity));
  if (defaults.fontSize !== undefined) fdCanvas.set_node_prop("font_size", String(defaults.fontSize));
}

/** Copy all style properties from the currently selected node into tool defaults (style picker) */
function pickStyleFromSelectedNode() {
  if (!fdCanvas) return;
  const propsJson = fdCanvas.get_selected_node_props();
  let props;
  try { props = JSON.parse(propsJson); } catch (_) { return; }
  if (!props || !props.kind) return;
  // Determine which tool default to update based on node kind
  const kindToTool = {
    rect: "rect", ellipse: "ellipse", pen: "pen",
    arrow: "arrow", text: "text", frame: "frame"
  };
  const toolName = kindToTool[props.kind] || "rect";
  const defaults = toolDefaults[toolName] || toolDefaults.rect;
  if (props.fill) defaults.fill = props.fill;
  if (props.strokeColor) defaults.stroke = props.strokeColor;
  if (props.strokeWidth !== undefined) defaults.strokeWidth = props.strokeWidth;
  if (props.opacity !== undefined) defaults.opacity = props.opacity;
  if (props.fontSize !== undefined) defaults.fontSize = props.fontSize;
  // Also set as global "all tools" hint
  for (const t of Object.keys(toolDefaults)) {
    if (props.fill && toolDefaults[t].fill !== undefined) toolDefaults[t].fill = props.fill;
    if (props.strokeColor && toolDefaults[t].stroke !== undefined) toolDefaults[t].stroke = props.strokeColor;
    if (props.opacity !== undefined) toolDefaults[t].opacity = props.opacity;
  }
}
/** Node ID of the drag-over drop target (for animation assignment) */
let animDropTargetId = null;
/** Cached bounds of the drop target node */
let animDropTargetBounds = null;
/** Whether we are dragging a selected node (for node-on-node drop detection) */
let isDraggingNode = false;
/** The ID of the node being dragged */
let draggedNodeId = null;

// ─── Tween Engine ────────────────────────────────────────────────────────
/** Active tweens: { nodeId, prop, from, to, startTime, duration, easeFn } */
const activeTweens = [];

const EASE_FNS = {
  linear: (t) => t,
  ease_out: (t) => 1 - Math.pow(1 - t, 3),
  ease_in: (t) => t * t * t,
  ease_in_out: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

function startTween(nodeId, prop, from, to, duration, easeName) {
  // Remove any existing tween on same node+prop
  for (let i = activeTweens.length - 1; i >= 0; i--) {
    if (activeTweens[i].nodeId === nodeId && activeTweens[i].prop === prop) {
      activeTweens.splice(i, 1);
    }
  }
  activeTweens.push({
    nodeId, prop, from, to,
    startTime: performance.now(),
    duration: duration || 300,
    easeFn: EASE_FNS[easeName] || EASE_FNS.spring,
  });
}

/** Evaluate all active tweens, returning a map of { nodeId → { prop → value } } */
function evalTweens(now) {
  const overrides = {};
  for (let i = activeTweens.length - 1; i >= 0; i--) {
    const tw = activeTweens[i];
    let t = (now - tw.startTime) / tw.duration;
    if (t >= 1) { t = 1; activeTweens.splice(i, 1); }
    const v = tw.from + (tw.to - tw.from) * tw.easeFn(t);
    if (!overrides[tw.nodeId]) overrides[tw.nodeId] = {};
    overrides[tw.nodeId][tw.prop] = v;
  }
  return overrides;
}

/**
 * Play a snappy "detach pop" animation when a node is reparented out of a group.
 * Uses a brief scale-pop tween (105% → 100%) and a glow pulse overlay.
 */
function playDetachAnimation(nodeId) {
  if (!fdCanvas || !nodeId) return;

  // Inject @keyframes on first use
  if (!document.getElementById("detach-anim-style")) {
    const style = document.createElement("style");
    style.id = "detach-anim-style";
    style.textContent = `
      @keyframes detachPop {
        0%   { opacity: 1; transform: scale(1.08); }
        60%  { opacity: 0.7; transform: scale(1.0); }
        100% { opacity: 0; transform: scale(0.98); }
      }
    `;
    document.head.appendChild(style);
  }

  // Create a temporary glow overlay on the canvas for the detached node
  try {
    const boundsJson = fdCanvas.get_node_bounds(nodeId);
    if (!boundsJson) return;
    const b = JSON.parse(boundsJson);
    if (!b.width) return;

    // Draw a brief glow ring around the detached node
    const glowOverlay = document.createElement("div");
    glowOverlay.className = "detach-glow";

    // Position in screen space (account for zoom + pan)
    const screenX = b.x * zoomLevel + panX;
    const screenY = b.y * zoomLevel + panY;
    const screenW = b.width * zoomLevel;
    const screenH = b.height * zoomLevel;

    const pad = 6;
    glowOverlay.style.cssText = `
      position: absolute;
      left: ${screenX - pad}px;
      top: ${screenY - pad}px;
      width: ${screenW + pad * 2}px;
      height: ${screenH + pad * 2}px;
      border: 2px solid #00D2B4;
      border-radius: 6px;
      box-shadow: 0 0 12px #00D2B480, inset 0 0 8px #00D2B420;
      pointer-events: none;
      animation: detachPop 250ms ease-out forwards;
      z-index: 9999;
    `;

    const container = canvas.parentElement || document.body;
    container.appendChild(glowOverlay);

    // Clean up after animation
    setTimeout(() => {
      glowOverlay.remove();
    }, 300);
  } catch (_) { /* skip if bounds unavailable */ }

  // Force re-render to reflect tree structure change
  renderDirty = true;
}

// ─── Pointer Events ──────────────────────────────────────────────────────

function setupPointerEvents() {
  const dpr = window.devicePixelRatio || 1;

  // Track canvas pointer ownership via document-level listeners
  let canvasPointerId = -1;

  canvas.addEventListener("pointerdown", (e) => {
    if (!fdCanvas) return;

    // Skip if pointer originated inside the floating toolbar (DOM ancestry)
    if (e.target.closest && e.target.closest('#floating-toolbar')) return;

    clearModifierCursors(); // Modifier preview ends when interaction starts
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Middle-click or Space+click → start pan drag
    if (e.button === 1 || isPanning) {
      panDragging = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      canvas.style.cursor = "grabbing";
      canvasPointerId = e.pointerId;
      e.preventDefault();
      return;
    }

    // Adjust for pan offset and zoom level → scene-space coords
    const x = (rawX - panX) / zoomLevel;
    const y = (rawY - panY) / zoomLevel;


    // Close annotation card if clicking elsewhere
    closeAnnotationCard();
    closeContextMenu();

    // ── ⌘+drag on drawing tool = temporary Select (Screenbrush) ──
    const currentTool = fdCanvas.get_tool_name();
    const drawingTools = ["rect", "ellipse", "pen", "arrow", "text", "frame"];
    const isDrawingTool = drawingTools.includes(currentTool);
    if (isDrawingTool && e.metaKey && !e.ctrlKey) {
      cmdTempSelectActive = true;
      cmdTempSelectOriginalTool = currentTool;
      fdCanvas.set_tool("select");
    }

    // ── Ctrl+click = temporary Eraser (from any non-eraser tool) ──
    if (e.ctrlKey && !e.metaKey && currentTool !== "eraser") {
      tempEraserMode = true;
      tempEraserPrevTool = currentTool;
      fdCanvas.set_tool("eraser");
      updateToolbarActive("eraser");
    }

    // ── Alt+drag = clone and drag ──
    if (e.altKey && !e.metaKey && !e.ctrlKey) {
      const hitId = fdCanvas.hit_test_at(x, y);
      if (hitId) {
        // Ensure the node is selected first
        fdCanvas.select_by_id(hitId);
        // Duplicate in-place (0,0 offset), new clone becomes selected
        fdCanvas.duplicate_selected_at(0.0, 0.0);
        render();
        syncTextToExtension();
        altCloneActive = true;
        // Now switch to select to drag the clone
        if (isDrawingTool) {
          cmdTempSelectActive = true;
          cmdTempSelectOriginalTool = currentTool;
          fdCanvas.set_tool("select");
        }
      }
    }

    // Eraser: capture poof BEFORE WASM deletes the node
    if (fdCanvas.get_tool_name() === "eraser") {
      const hitId = fdCanvas.hit_test_at(x, y);
      if (hitId) {
        try {
          const b = JSON.parse(fdCanvas.get_node_bounds_json(hitId));
          if (b.width) erasePoofs.push({ ...b, startTime: performance.now() });
        } catch (_) { /* ignore */ }
      }
    }

    const changed = fdCanvas.handle_pointer_down(
      x,
      y,
      e.pressure || 1.0,
      e.shiftKey,
      e.ctrlKey,
      e.altKey,
      e.metaKey
    );
    if (changed) render();
    canvasPointerId = e.pointerId;

    // Track interaction start for dimension tooltip
    pointerIsDown = true;
    hideFloatingBar();
    pointerDownSceneX = x;
    pointerDownSceneY = y;
    currentToolAtPointerDown = fdCanvas.get_tool_name();

    // Track node drag for animation drop detection
    if (currentToolAtPointerDown === "select") {
      const selId = fdCanvas.get_selected_id();
      if (selId) {
        isDraggingNode = true;
        draggedNodeId = selId;
      }
    }
  });

  document.addEventListener("pointermove", (e) => {
    if (!fdCanvas) return;
    // During active drag, only process our owned pointer
    if (canvasPointerId !== -1 && e.pointerId !== canvasPointerId) return;
    // Skip if toolbar drag or drag-to-create is in progress
    if (ftDragging || dtcTool) return;
    // During hover (no active drag), only process events over the canvas
    if (canvasPointerId === -1 && e.target !== canvas) return;

    // Pan drag in progress
    if (panDragging) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      render();
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;
    // Eraser: capture poof BEFORE WASM deletes the node on drag
    if (pointerIsDown && fdCanvas.get_tool_name() === "eraser") {
      const hitId = fdCanvas.hit_test_at(x, y);
      if (hitId) {
        try {
          const b = JSON.parse(fdCanvas.get_node_bounds_json(hitId));
          if (b.width) erasePoofs.push({ ...b, startTime: performance.now() });
        } catch (_) { /* ignore */ }
      }
    }

    const changed = fdCanvas.handle_pointer_move(
      x,
      y,
      e.pressure || 1.0,
      e.shiftKey,
      e.ctrlKey,
      e.altKey,
      e.metaKey
    );
    if (changed) render();
    // Arrow tool: always re-render during drag for live preview line
    else if (pointerIsDown && currentToolAtPointerDown === "arrow") render();

    // ── Resize handle cursor feedback (hover only, not during drag) ──
    if (!pointerIsDown && !isPanning) {
      const resizeCursor = getResizeHandleCursor(x, y);
      if (resizeCursor) {
        canvas.style.cursor = resizeCursor;
      } else if (canvas.style.cursor && canvas.style.cursor.includes("resize")) {
        // Clear resize cursor when no longer over a handle
        canvas.style.cursor = "";
      }

      // ── Spec hover tooltip (show spec on node hover) ──
      const hoveredId = fdCanvas.hit_test_at(x, y);
      if (hoveredId) {
        showSpecTooltip(hoveredId, e.clientX, e.clientY);
      } else {
        hideSpecTooltip();
      }
    }

    // Show dimension tooltip during drag
    if (pointerIsDown) {
      const tool = currentToolAtPointerDown;
      if (tool === "rect" || tool === "ellipse" || tool === "text") {
        // Drawing: show W × H
        const w = Math.abs(x - pointerDownSceneX);
        const h = Math.abs(y - pointerDownSceneY);
        if (w > 2 || h > 2) {
          showDimensionTooltip(e.clientX, e.clientY, `${Math.round(w)} × ${Math.round(h)}`);
        }
      } else if (tool === "select") {
        // Moving: show (X, Y) of selected node
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId && changed) {
          try {
            const b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
            if (b.x !== undefined) {
              showDimensionTooltip(e.clientX, e.clientY, `(${Math.round(b.x)}, ${Math.round(b.y)})`);
            }
          } catch (_) { /* skip */ }
        }
      }
    }

    // Animation drop-zone detection removed (bug #4)

    // ── Near-detach detection (evaluate EVERY frame, not gated on changed) ──
    if (isDraggingNode && draggedNodeId) {
      const ndJson = fdCanvas.evaluate_near_detach(draggedNodeId);
      if (ndJson) {
        try {
          nearDetachState = JSON.parse(ndJson);
        } catch (_) { nearDetachState = null; }
      } else {
        nearDetachState = null;
      }
    } else if (!isDraggingNode) {
      nearDetachState = null;
    }
  });

  document.addEventListener("pointerup", (e) => {
    if (!fdCanvas) return;
    // Skip entirely if no canvas pointerdown started this interaction
    if (canvasPointerId === -1) return;
    // Only handle events from our owned pointer
    if (e.pointerId !== canvasPointerId) return;
    canvasPointerId = -1;

    // End pan drag
    if (panDragging) {
      panDragging = false;
      canvas.style.cursor = isPanning ? "grab" : "";
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;
    const resultJson = fdCanvas.handle_pointer_up(
      x,
      y,
      e.shiftKey,
      e.ctrlKey,
      e.altKey,
      e.metaKey
    );
    const result = JSON.parse(resultJson);
    if (result.changed) {
      render();
      syncTextToExtension();
    }
    // Auto-switch toolbar/cursor when tool changes (e.g. after drawing)
    if (result.toolSwitched) {
      // ── Apply smart defaults to newly created node ──
      if (result.changed && currentToolAtPointerDown) {
        lastDrawingTool = currentToolAtPointerDown;
        applyDefaultsToNewNode(currentToolAtPointerDown);
        render();
        syncTextToExtension();
      }
      if (lockedTool) {
        // Override: re-activate locked tool instead of switching to Select
        fdCanvas.set_tool(lockedTool);
        updateToolbarActive(lockedTool);
        updateLockedIndicator(lockedTool);
      } else {
        updateToolbarActive(result.tool);
      }
    }

    // ── Alt+click style picker (eyedropper for styles) ──
    if (e.altKey && !altCloneActive && !cmdTempSelectActive && result.changed) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId) {
        pickStyleFromSelectedNode();
        stylePickerActive = true;
        // Brief visual feedback — could add a toast here
        setTimeout(() => { stylePickerActive = false; }, 100);
      }
    }


    // Update properties panel after interaction ends
    updatePropertiesPanel();
    updateFloatingBar();
    // Notify extension of canvas selection change (for Code ↔ Canvas sync)
    // Skip during inline editing — prevents focus stealing that kills the textarea
    if (!inlineEditorActive) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId !== lastNotifiedSelectedId) {
        syncSelection(selectedId, "canvas");
      }
    }

    // Hide dimension tooltip
    pointerIsDown = false;
    hideDimensionTooltip();

    // Animation drop on release removed (bug #4)

    // ── Detach snap feedback: scale pop + glow on group detach ──
    if (isDraggingNode && fdCanvas && draggedNodeId) {
      const detachJson = fdCanvas.evaluate_drop(draggedNodeId);
      if (detachJson) {
        try {
          const detach = JSON.parse(detachJson);
          if (detach.detached) {
            playDetachAnimation(detach.nodeId);
            // Sync text since the graph changed (structural detach)
            syncTextToExtension();
          }
        } catch (_) { /* ignore parse errors */ }
      }

      // ── Edge text child detach: >40px from edge midpoint ──
      try {
        const edgeId = fdCanvas.find_edge_for_text(draggedNodeId);
        if (edgeId) {
          const edgeBounds = JSON.parse(fdCanvas.get_node_bounds(draggedNodeId));
          const textCx = edgeBounds.x + edgeBounds.width / 2;
          const textCy = edgeBounds.y + edgeBounds.height / 2;
          // Compute edge midpoint from edge endpoints
          const src = fdCanvas.get_text();
          const edgeMatch = src.match(new RegExp(`edge\\s+@${edgeId}\\b[^}]*}`));
          if (edgeMatch) {
            // Simple heuristic: if text is far from its original position, detach
            const EDGE_DETACH_THRESHOLD = 40;
            const fromMatch = edgeMatch[0].match(/from:\s+@(\w+)/);
            const toMatch = edgeMatch[0].match(/to:\s+@(\w+)/);
            if (fromMatch && toMatch) {
              try {
                const fb = JSON.parse(fdCanvas.get_node_bounds(fromMatch[1]));
                const tb = JSON.parse(fdCanvas.get_node_bounds(toMatch[1]));
                const mx = (fb.x + fb.width / 2 + tb.x + tb.width / 2) / 2;
                const my = (fb.y + fb.height / 2 + tb.y + tb.height / 2) / 2;
                const dist = Math.hypot(textCx - mx, textCy - my);
                if (dist > EDGE_DETACH_THRESHOLD) {
                  fdCanvas.detach_text_from_edge(draggedNodeId);
                  playDetachAnimation(draggedNodeId);
                  syncTextToExtension();
                }
              } catch (_) { /* endpoint bounds not available */ }
            }
          }
        }
      } catch (_) { /* edge detach check failed */ }
    }

    // ── Post-release: expand parents to contain overflowing children ──
    if (isDraggingNode && fdCanvas) {
      if (fdCanvas.finalize_bounds()) {
        render();
        syncTextToExtension();
      }
    }

    isDraggingNode = false;
    draggedNodeId = null;
    animDropTargetId = null;
    animDropTargetBounds = null;
    nearDetachState = null;

    // ── Restore tool after ⌘+drag temp Select or Alt+drag clone ──
    if (cmdTempSelectActive && cmdTempSelectOriginalTool) {
      fdCanvas.set_tool(cmdTempSelectOriginalTool);
      updateToolbarActive(lockedTool || cmdTempSelectOriginalTool);
      if (lockedTool) updateLockedIndicator(lockedTool);
      updateCanvasCursor(cmdTempSelectOriginalTool);
    }
    cmdTempSelectActive = false;
    cmdTempSelectOriginalTool = null;
    altCloneActive = false;

    // ── Restore tool after Ctrl temp Eraser ──
    if (tempEraserMode && tempEraserPrevTool && fdCanvas) {
      fdCanvas.set_tool(tempEraserPrevTool);
      updateToolbarActive(lockedTool || tempEraserPrevTool);
      updateCanvasCursor(tempEraserPrevTool);
    }
    tempEraserMode = false;
    tempEraserPrevTool = null;
  });

  // ── Wheel / Trackpad → Pan or Zoom ──
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    // Pinch-to-zoom on trackpad fires as wheel with ctrlKey
    // Also allow zoom while panning (Space held)
    if (e.ctrlKey || e.metaKey || isPanning) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      zoomAtPoint(mx, my, e.deltaY < 0 ? 1.03 : 1 / 1.03);
    } else {
      panX -= e.deltaX;
      panY -= e.deltaY;
      render();
    }
  }, { passive: false });
}

// ─── Touch & Gesture Support ───────────────────────────────────────────────

function setupTouchGestures() {
  let activeTouches = new Map();
  let lastPinchDist = 0;
  let lastPinchCenter = { x: 0, y: 0 };
  let longPressTimer = null;
  let longPressPos = null;
  let isGesturing = false;
  let threeFingerStartX = 0;
  let threeFingerHandled = false;
  let pencilActive = false;

  // Inertia state
  let inertiaVx = 0;
  let inertiaVy = 0;
  let lastPanTime = 0;
  let inertiaRaf = null;

  function pinchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pinchCenter(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function cancelInertia() {
    if (inertiaRaf) {
      cancelAnimationFrame(inertiaRaf);
      inertiaRaf = null;
    }
  }

  function applyInertia() {
    const friction = 0.92;
    inertiaVx *= friction;
    inertiaVy *= friction;
    if (Math.abs(inertiaVx) < 0.5 && Math.abs(inertiaVy) < 0.5) {
      inertiaRaf = null;
      return;
    }
    panX += inertiaVx;
    panY += inertiaVy;
    render();
    inertiaRaf = requestAnimationFrame(applyInertia);
  }

  canvas.addEventListener("touchstart", (e) => {
    // Store all active touches
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, t);
    }

    const count = activeTouches.size;
    cancelInertia();

    // Palm rejection: if Apple Pencil is active and a finger appears, ignore fingers
    if (pencilActive && count > 0) {
      // Only let pencil touches through
      const hasPencil = [...e.touches].some(t => t.touchType === "stylus");
      if (!hasPencil) {
        e.preventDefault();
        return;
      }
    }

    // Detect Apple Pencil
    for (const t of e.changedTouches) {
      if (t.touchType === "stylus") {
        pencilActive = true;
      }
    }

    if (count === 1) {
      // Single finger — start long-press timer
      const t = [...activeTouches.values()][0];
      longPressPos = { x: t.clientX, y: t.clientY };
      longPressTimer = setTimeout(() => {
        // Simulate right-click context menu at this position
        const rect = canvas.getBoundingClientRect();
        const fakeEvent = new MouseEvent("contextmenu", {
          clientX: longPressPos.x,
          clientY: longPressPos.y,
          bubbles: true,
        });
        canvas.dispatchEvent(fakeEvent);
        isGesturing = true;
        longPressTimer = null;
      }, 500);
    } else {
      clearLongPress();
    }

    if (count === 2) {
      // Start pinch / two-finger pan
      isGesturing = true;
      const touches = [...activeTouches.values()];
      lastPinchDist = pinchDistance(touches[0], touches[1]);
      lastPinchCenter = pinchCenter(touches[0], touches[1]);
      e.preventDefault();
    }

    if (count === 3) {
      // Start three-finger swipe detection
      isGesturing = true;
      threeFingerHandled = false;
      const touches = [...activeTouches.values()];
      threeFingerStartX = touches.reduce((s, t) => s + t.clientX, 0) / 3;
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    // Update all tracked touches
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, t);
    }

    const count = activeTouches.size;

    // Cancel long-press if moved too far
    if (count === 1 && longPressTimer && longPressPos) {
      const t = [...activeTouches.values()][0];
      const dx = t.clientX - longPressPos.x;
      const dy = t.clientY - longPressPos.y;
      if (dx * dx + dy * dy > 100) {
        clearLongPress();
      }
    }

    if (count === 2) {
      const touches = [...activeTouches.values()];
      const dist = pinchDistance(touches[0], touches[1]);
      const center = pinchCenter(touches[0], touches[1]);

      // Pinch-to-zoom
      if (lastPinchDist > 0) {
        const scale = dist / lastPinchDist;
        const rect = canvas.getBoundingClientRect();
        const mx = center.x - rect.left;
        const my = center.y - rect.top;
        zoomAtPoint(mx, my, scale);
      }

      // Two-finger pan
      const dx = center.x - lastPinchCenter.x;
      const dy = center.y - lastPinchCenter.y;
      panX += dx;
      panY += dy;

      // Track velocity for inertia
      const now = performance.now();
      const dt = now - lastPanTime || 16;
      inertiaVx = dx * (16 / dt);
      inertiaVy = dy * (16 / dt);
      lastPanTime = now;

      lastPinchDist = dist;
      lastPinchCenter = center;
      render();
      e.preventDefault();
    }

    if (count === 3 && !threeFingerHandled) {
      const touches = [...activeTouches.values()];
      const avgX = touches.reduce((s, t) => s + t.clientX, 0) / 3;
      const swipeDist = avgX - threeFingerStartX;

      // Require significant horizontal swipe
      if (Math.abs(swipeDist) > 50) {
        threeFingerHandled = true;
        if (fdCanvas) {
          if (swipeDist < 0) {
            // Swipe left = undo
            const resultJson = fdCanvas.handle_key("z", false, false, false, true);
            const result = JSON.parse(resultJson);
            if (result.changed) {
              render();
              syncTextToExtension();
            }
          } else {
            // Swipe right = redo
            const resultJson = fdCanvas.handle_key("z", false, true, false, true);
            const result = JSON.parse(resultJson);
            if (result.changed) {
              render();
              syncTextToExtension();
            }
          }
        }
        e.preventDefault();
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }

    clearLongPress();

    // Check if pencil lifted
    for (const t of e.changedTouches) {
      if (t.touchType === "stylus") {
        pencilActive = false;
      }
    }

    // Start inertia if two-finger gesture just ended
    if (activeTouches.size === 0 && isGesturing) {
      isGesturing = false;
      lastPinchDist = 0;
      if (Math.abs(inertiaVx) > 1 || Math.abs(inertiaVy) > 1) {
        inertiaRaf = requestAnimationFrame(applyInertia);
      }
    }
  });

  canvas.addEventListener("touchcancel", (e) => {
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }
    clearLongPress();
    isGesturing = false;
    pencilActive = false;
  });
}


// ─── Resize ──────────────────────────────────────────────────────────────

function setupResizeObserver(container) {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const dpr = window.devicePixelRatio || 1;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      if (fdCanvas) {
        fdCanvas.resize(width, height);
        render();
      }
    }
  });
  observer.observe(container);
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

/** Currently locked tool (null = no lock, e.g. "rect", "ellipse") */
let lockedTool = null;

/** Track last shortcut press for double-press detection */
let lastShortcutKey = null;
let lastShortcutTime = 0;
const DOUBLE_PRESS_MS = 400;

function setupToolbar() {
  // Top toolbar no longer has tool buttons — they moved to floating toolbar.
  // This now handles both .tool-btn[data-tool] (if any remain) and .ft-tool-btn[data-tool].
  const allToolBtns = document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]");
  allToolBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.getAttribute("data-tool");
      if (!fdCanvas || !tool) return;

      // If clicking the already-active & already-locked tool → unlock
      if (lockedTool === tool) {
        unlockTool();
        return;
      }

      // Clicking Select always unlocks
      if (tool === "select") {
        unlockTool();
      }

      // Update active state across all tool buttons
      allToolBtns.forEach((b) => {
        b.classList.remove("active");
        b.classList.remove("locked");
      });
      // Activate the matching tool in both toolbars
      document.querySelectorAll(`[data-tool="${tool}"]`).forEach((b) => {
        b.classList.add("active");
      });

      fdCanvas.set_tool(tool);
      updateCanvasCursor(tool);
    });

    // Double-click to lock
    btn.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const tool = btn.getAttribute("data-tool");
      if (!tool || tool === "select") return;
      lockTool(tool);
    });
  });

  // Floating toolbar collapse/expand: click active tool icon to toggle
  const floatingToolbar = document.getElementById("floating-toolbar");
  if (floatingToolbar) {
    floatingToolbar.addEventListener("dblclick", (e) => {
      // Double-click the toolbar background (not a button) = toggle collapse
      if (e.target === floatingToolbar || e.target.classList.contains("ft-drag-handle")) {
        floatingToolbar.classList.toggle("collapsed");
        vscode.setState({ ...(vscode.getState() || {}), ftCollapsed: floatingToolbar.classList.contains("collapsed") });
      }
    });
  }
}

/** Lock the given tool — it stays active after shape creation. */
function lockTool(tool) {
  lockedTool = tool;
  if (fdCanvas) {
    fdCanvas.set_tool(tool);
  }
  updateToolbarActive(tool);
  updateLockedIndicator(tool);
}

/** Unlock tool and switch back to Select. */
function unlockTool() {
  lockedTool = null;
  document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((b) => b.classList.remove("locked"));
  if (fdCanvas) {
    fdCanvas.set_tool("select");
  }
  updateToolbarActive("select");
}

/** Show lock indicator on the correct toolbar button. */
function updateLockedIndicator(tool) {
  document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("locked", btn.getAttribute("data-tool") === tool);
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
}

// ─── Message Bridge (Extension ↔ Webview) ────────────────────────────────

/** Debounce timer for Code→Canvas focusOnNode — prevents animation jitter
 *  when rapidly arrowing through lines in the text editor. */
let codeFocusDebounceTimer = null;

/**
 * Central selection sync — one function, all panels.
 * Ensures that selecting a node/edge in ANY panel updates all others.
 *
 * @param {string} id - Node or edge ID (from @id), or "" to deselect
 * @param {'canvas'|'layers'|'code'|'keyboard'} source - Origin panel
 */
function syncSelection(id, source) {
  if (!fdCanvas) return;

  // 1. Canvas: select + render (skip if source is canvas — already selected)
  if (source !== "canvas") {
    fdCanvas.select_by_id(id || "");
    // select_by_id returns false for edge IDs — that's OK, edges
    // don't have canvas selection highlights yet
    render();
  }

  // 2. Dedup state — prevents redundant nodeSelected round-trips
  lastNotifiedSelectedId = id || "";

  // 3. Layers: highlight + scroll into view
  refreshLayersPanel();

  // 4. Code: notify extension to highlight line (skip if source is code)
  if (source !== "code") {
    vscode.postMessage({ type: "nodeSelected", id: id || "" });
  }

  // 5. Canvas focus: debounced pan/zoom (only for Code→Canvas)
  if (source === "code" && id) {
    clearTimeout(codeFocusDebounceTimer);
    codeFocusDebounceTimer = setTimeout(() => focusOnNode(id), 150);
  }

  // 6. Side panels
  updatePropertiesPanel();
  updateFloatingBar();
}

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "setText": {
      if (!fdCanvas) return;
      suppressTextSync = true;
      fdCanvas.set_text(message.text);
      lastSyncedText = message.text; // Keep dedup in sync
      bumpGeneration(); // External text change — invalidate caches
      measureAllTextNodes(); // Tight text bounds after code edit
      render();
      suppressTextSync = false;

      break;
    }
    case "selectNode": {
      // Code cursor moved to a node/edge line → sync all panels
      syncSelection(message.nodeId || "", "code");
      break;
    }
    case "libraryData": {
      // Library data received from extension host
      libraryComponents = message.libraries || [];
      refreshLibraryPanel();
      break;
    }
    case "toolChanged": {
      if (!fdCanvas) return;
      fdCanvas.set_tool(message.tool);
      // Update toolbar UI (both top and floating)
      document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-tool") === message.tool
        );
      });
      break;
    }
    case "setViewMode": {
      setViewMode(message.mode);
      break;
    }
  }
});

/** Last text sent to extension — skip sync if unchanged */
let lastSyncedText = "";

function syncTextToExtension() {
  if (!fdCanvas || suppressTextSync) return;
  const text = fdCanvas.get_text();
  // Skip if text hasn't changed — avoids full document replacement that destroys cursor
  if (text === lastSyncedText) return;
  lastSyncedText = text;
  bumpGeneration(); // Scene data changed — invalidate caches
  vscode.postMessage({
    type: "textChanged",
    text: text,
  });
}


// ─── Keyboard shortcuts (delegated to WASM) ─────────────────────────────

/** Whether we're in pan mode (Space held) */
let isPanning = false;

document.addEventListener("keydown", (e) => {
  if (!fdCanvas) return;

  // Don't intercept if an input/textarea is focused
  if (
    document.activeElement &&
    (document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA")
  ) {
    return;
  }

  // Close annotation card / context menu on Escape (before WASM)
  if (e.key === "Escape") {
    closeAnnotationCard();
    closeContextMenu();
    closeShortcutHelp();
  }

  // ── Grid toggle shortcut ──
  if (e.key === "g" || e.key === "G") {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggleGrid();
      return;
    }
  }

  // ── Library panel toggle shortcut ──
  if ((e.key === "l" || e.key === "L") && e.shiftKey) {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggleLibraryPanel();
      return;
    }
  }

  // ── Arrow-key nudge (Figma/Sketch standard) ──
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    const selectedId = fdCanvas.get_selected_id();
    if (selectedId && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudgeSelected(e.key, step);
      return;
    }
  }

  // ── Zoom to selection (⌘1 / Ctrl+1) ──
  if ((e.metaKey || e.ctrlKey) && e.key === "1") {
    e.preventDefault();
    zoomToSelection();
    return;
  }

  // ── Select all (⌘A / Ctrl+A) ──
  if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A") && !e.shiftKey) {
    e.preventDefault();
    selectAllNodes();
    return;
  }

  // ── Copy as PNG (⌘⇧C / Ctrl+Shift+C) ──
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
    e.preventDefault();
    copySelectionAsPng();
    return;
  }

  // ── Add/Edit spec annotation (⌘I / Ctrl+I) ──
  if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I") && !e.shiftKey) {
    e.preventDefault();
    const selId = fdCanvas?.get_selected_id();
    if (selId) {
      const boundsJson = fdCanvas.get_node_bounds(selId);
      const b = JSON.parse(boundsJson);
      const cx = (b.x + b.width / 2 + panX) * currentZoom;
      const cy = (b.y + panY) * currentZoom;
      openAnnotationCard(selId, cx, cy);
    }
    return;
  }

  // ── Copy selected node (⌘C / Ctrl+C) ──
  if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C") && !e.shiftKey) {
    copySelectedAsFd();
    // Don't preventDefault — allow native copy to also work
    return;
  }

  // ── Paste from clipboard (⌘V / Ctrl+V) ──
  if ((e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V") && !e.shiftKey) {
    e.preventDefault();
    pasteFromClipboard();
    return;
  }

  // ── Zoom shortcuts (JS-side, before WASM) ──
  if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
    e.preventDefault();
    zoomBy(ZOOM_STEP);
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "-") {
    e.preventDefault();
    zoomBy(1 / ZOOM_STEP);
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "0") {
    e.preventDefault();
    zoomToFit();
    return;
  }

  // ── L key: toggle Layers panel (always works, crucial in Zen mode) ──
  if (e.key === "l" || e.key === "L") {
    const active = document.activeElement;
    const isTextInput = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !isTextInput) {
      e.preventDefault();
      const layersPanel = document.getElementById("layers-panel");
      if (layersPanel) {
        layersPanel.classList.toggle("zen-visible");
      }
      return;
    }
  }

  // ── 0 key: reset zoom to 100% ──
  if (e.key === "0" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const active = document.activeElement;
    const isTextInput = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (!isTextInput) {
      e.preventDefault();
      cameraZoom = 1.0;
      updateZoomIndicator();
      render();
      return;
    }
  }

  // ── V key or Escape: unlock tool if locked ──
  if ((e.key === "v" || e.key === "V" || e.key === "Escape") && !e.metaKey && !e.ctrlKey) {
    if (lockedTool) {
      e.preventDefault();
      unlockTool();
      return;
    }
  }

  // ── Double-press detection for tool locking (RR, OO, PP, AA, TT) ──
  const toolShortcuts = { r: "rect", o: "ellipse", p: "pen", a: "arrow", t: "text", f: "frame", e: "eraser" };
  const lowerKey = e.key.toLowerCase();
  if (toolShortcuts[lowerKey] && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const now = Date.now();
    if (lastShortcutKey === lowerKey && (now - lastShortcutTime) < DOUBLE_PRESS_MS) {
      // Double-press detected — lock this tool
      e.preventDefault();
      lockTool(toolShortcuts[lowerKey]);
      lastShortcutKey = null;
      lastShortcutTime = 0;
      return;
    }
    lastShortcutKey = lowerKey;
    lastShortcutTime = now;
  } else {
    // Reset double-press tracker on non-tool keys
    lastShortcutKey = null;
    lastShortcutTime = 0;
  }

  // Delegate to WASM shortcut resolver
  const resultJson = fdCanvas.handle_key(
    e.key,
    e.ctrlKey,
    e.shiftKey,
    e.altKey,
    e.metaKey
  );
  const result = JSON.parse(resultJson);

  if (result.action === "none") return;

  e.preventDefault();

  // Handle graph changes
  if (result.changed) {
    render();
    syncTextToExtension();
    closeContextMenu();
    closeAnnotationCard();
  }

  // Handle tool switches from keyboard
  if (result.toolSwitched) {
    if (lockedTool && result.tool === "select") {
      // Don't switch to select if a tool is locked — this shouldn't normally happen
      // from keyboard, but guard anyway
    } else {
      // Switching to a new tool via keyboard clears previous lock
      if (lockedTool && result.tool !== lockedTool) {
        lockedTool = null;
        document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => b.classList.remove("locked"));
      }
      updateToolbarActive(result.tool);
    }
  }

  // Handle JS-side actions
  switch (result.action) {
    case "deselect":
      closeAnnotationCard();
      closeContextMenu();
      render();
      break;
    case "panStart":
      isPanning = true;
      canvas.style.cursor = "grab";
      break;
    case "toggleLastTool":
      updateToolbarActive(result.tool);
      break;
    case "clearAll":
      render();
      syncTextToExtension();
      break;
    case "showHelp":
      toggleShortcutHelp();
      break;
    case "copyStyle":
      showToast("Style copied");
      break;
    case "pasteStyle":
      if (result.changed) {
        render();
        syncTextToExtension();
        showToast("Style pasted");
      }
      break;
  }

  // Notify extension of selection changes from keyboard actions
  if (result.changed || result.action === "deselect") {
    const selectedId = fdCanvas.get_selected_id();
    syncSelection(selectedId, "keyboard");
  }

  // Update cursor when tool changes via shortcut
  if (result.toolSwitched) {
    updateCanvasCursor(result.tool);
  }
});

/** Whether we're holding ⌘ for temporary hand tool (Screenbrush-style) */
let isCmdHold = false;
let toolBeforeCmdHold = null;

// ── Modifier-hold cursor feedback ────────────────────────────────────────
// When a bare modifier key is held (no other key pressed), show a preview
// cursor so the user knows what action will happen before they click.
// Cmd → grab (pan), Alt → copy (duplicate), Ctrl → red eraser (delete).

/** Clear all modifier cursor classes from the canvas. */
function clearModifierCursors() {
  canvas.classList.remove("modifier-cmd", "modifier-alt", "modifier-ctrl");
}

document.addEventListener("keydown", (e) => {
  // Skip if pointer is already down (active interaction handles its own cursor)
  if (pointerIsDown) return;
  // Skip if a text input is focused
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return;

  // Cmd/Meta held alone → grab cursor (pan preview)
  if (e.key === "Meta" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    clearModifierCursors();
    canvas.classList.add("modifier-cmd");
  }
  // Alt/Option held alone → copy cursor (clone preview)
  if (e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    clearModifierCursors();
    canvas.classList.add("modifier-alt");
  }
  // Ctrl held alone → red eraser cursor (delete preview)
  if (e.key === "Control" && !e.metaKey && !e.altKey && !e.shiftKey) {
    clearModifierCursors();
    canvas.classList.add("modifier-ctrl");
  }
}, true);

document.addEventListener("keyup", (e) => {
  if (e.key === " " && isPanning) {
    isPanning = false;
    canvas.style.cursor = "";
  }
  // Screenbrush: Release ⌘ → restore previous tool
  if (e.key === "Meta" && isCmdHold && fdCanvas) {
    isCmdHold = false;
    canvas.style.cursor = "";
    if (toolBeforeCmdHold) {
      fdCanvas.set_tool(toolBeforeCmdHold);
      updateToolbarActive(toolBeforeCmdHold);
      toolBeforeCmdHold = null;
    }
  }
  // Release Ctrl → restore from temporary eraser mode
  if (e.key === "Control" && tempEraserMode && fdCanvas) {
    if (tempEraserPrevTool) {
      fdCanvas.set_tool(tempEraserPrevTool);
      updateToolbarActive(lockedTool || tempEraserPrevTool);
      updateCanvasCursor(tempEraserPrevTool);
    }
    tempEraserMode = false;
    tempEraserPrevTool = null;
  }
  // Clear modifier cursor class on any modifier release
  if (e.key === "Meta" || e.key === "Alt" || e.key === "Control") {
    clearModifierCursors();
  }
});

// Clear modifier cursors when window loses focus (handles Cmd+Tab, Alt+Tab, etc.)
window.addEventListener("blur", () => {
  clearModifierCursors();
  // Also restore from temp modes if window lost focus mid-hold
  if (isCmdHold && fdCanvas && toolBeforeCmdHold) {
    isCmdHold = false;
    canvas.style.cursor = "";
    fdCanvas.set_tool(toolBeforeCmdHold);
    updateToolbarActive(toolBeforeCmdHold);
    toolBeforeCmdHold = null;
  }
});

// ─── Apple Pencil Pro ────────────────────────────────────────────────────

/**
 * Apple Pencil Pro squeeze detection.
 * On iPad Safari / Catalyst, the squeeze fires as a button=5 pointer event.
 * In VS Code webview (Electron), we listen for stylus button changes.
 * NOTE: Must be called after canvas is assigned (inside main()).
 */
function setupApplePencilPro() {
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "pen" && e.button === 5 && fdCanvas) {
      const newTool = fdCanvas.handle_stylus_squeeze(
        e.shiftKey,
        e.ctrlKey,
        e.altKey,
        e.metaKey
      );
      updateToolbarActive(newTool);
    }
  });
}

function updateToolbarActive(tool) {
  document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
  updateCanvasCursor(tool);
}

function updateCanvasCursor(tool) {
  canvas.className = canvas.className.replace(/tool-\w+/g, "").trim();
  canvas.classList.add(`tool-${tool || "select"}`);
}

/**
 * Check if scene-space coords (x, y) are over a resize handle of the
 * currently selected node. Returns a CSS cursor name or empty string.
 * Handle radius is 5px in scene-space (matches WASM hit_test_resize_handle).
 */
function getResizeHandleCursor(x, y) {
  if (!fdCanvas) return "";
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return "";
  let b;
  try {
    b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) { return ""; }
  if (b.x === undefined) return "";

  // Check if selected node is text (horizontal-only resize)
  const propsJson = fdCanvas.get_selected_node_props();
  let isText = false;
  try { isText = JSON.parse(propsJson).kind === "text"; } catch (_) { /* ignore */ }

  const r = 8; // hit radius in scene-space px (bug #6: increased from 5)

  if (isText) {
    // Text nodes: horizontal-only resize handles (Apple Preview style)
    const handles = [
      { hx: b.x, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-left
      { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-right
    ];
    for (const { hx, hy, cursor } of handles) {
      const dx = x - hx;
      const dy = y - hy;
      if (dx * dx + dy * dy <= r * r) return cursor;
    }
    return "";
  }

  const handles = [
    { hx: b.x, hy: b.y, cursor: "nwse-resize" }, // top-left
    { hx: b.x + b.width / 2, hy: b.y, cursor: "ns-resize" }, // top-center
    { hx: b.x + b.width, hy: b.y, cursor: "nesw-resize" }, // top-right
    { hx: b.x, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-left
    { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-right
    { hx: b.x, hy: b.y + b.height, cursor: "nesw-resize" }, // bottom-left
    { hx: b.x + b.width / 2, hy: b.y + b.height, cursor: "ns-resize" }, // bottom-center
    { hx: b.x + b.width, hy: b.y + b.height, cursor: "nwse-resize" }, // bottom-right
  ];
  for (const { hx, hy, cursor } of handles) {
    const dx = x - hx;
    const dy = y - hy;
    if (dx * dx + dy * dy <= r * r) return cursor;
  }
  return "";
}


// ─── Shortcut Help Overlay ───────────────────────────────────────────────

let shortcutHelpVisible = false;

function toggleShortcutHelp() {
  shortcutHelpVisible ? closeShortcutHelp() : openShortcutHelp();
}

function openShortcutHelp() {
  let overlay = document.getElementById("shortcut-help");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "shortcut-help";
    overlay.innerHTML = buildShortcutHelpHtml();
    document.getElementById("canvas-container").appendChild(overlay);

    overlay.querySelector(".help-close").addEventListener("click", () => {
      closeShortcutHelp();
    });
  }
  overlay.classList.add("visible");
  shortcutHelpVisible = true;
}

function closeShortcutHelp() {
  const overlay = document.getElementById("shortcut-help");
  if (overlay) {
    overlay.classList.remove("visible");
  }
  shortcutHelpVisible = false;
}

function buildShortcutHelpHtml() {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const cmd = isMac ? "⌘" : "Ctrl+";

  const sections = [
    {
      title: "Tools",
      shortcuts: [
        ["V", "Select / Move"],
        ["R", "Rectangle"],
        ["O", "Ellipse"],
        ["P", "Pen (freehand)"],
        ["A", "Arrow"],
        ["T", "Text"],
        ["F", "Frame"],
        ["E", "Eraser"],
        ["Tab", "Toggle last two tools"],
        ["R R", "Lock tool (stays active)"],
        ["Escape", "Unlock tool / Deselect"],
      ],
    },
    {
      title: "Edit",
      shortcuts: [
        [`${cmd}Z`, "Undo"],
        [`${cmd}⇧Z`, "Redo"],
        ["Del / ⌫", "Delete selected"],
        [`${cmd}D`, "Duplicate (+10,+10)"],
        [`${cmd}A`, "Select all"],
        [`${cmd}G`, "Group selected"],
        [`${cmd}⇧G`, "Ungroup"],
        [`${cmd}C`, "Copy"],
        [`${cmd}X`, "Cut"],
        [`${cmd}V`, "Paste"],
        [`⌥${cmd}C`, "Copy Style"],
        [`⌥${cmd}V`, "Paste Style"],
      ],
    },
    {
      title: "Transform",
      shortcuts: [
        [`${cmd}[`, "Send backward"],
        [`${cmd}]`, "Bring forward"],
        [`${cmd}⇧[`, "Send to back"],
        [`${cmd}⇧]`, "Bring to front"],
        ["Arrow keys", "Nudge 1px"],
        ["Shift+Arrow", "Nudge 10px"],
      ],
    },
    {
      title: "View",
      shortcuts: [
        [`${cmd}+`, "Zoom in"],
        [`${cmd}−`, "Zoom out"],
        ["0", "Reset zoom to 100%"],
        [`${cmd}0`, "Zoom to fit"],
        [`${cmd}1`, "Zoom to selection"],
        ["L", "Toggle Layers panel"],
        ["G", "Toggle grid overlay"],
        ["Space (hold)", "Pan / hand tool"],
        [`${cmd} (hold)`, "Temp. hand tool"],
        ["Pinch", "Trackpad zoom"],
      ],
    },
    {
      title: "Modifiers (while dragging)",
      shortcuts: [
        ["Shift", "Constrain axis / square"],
        ["Alt+drag", "Duplicate while moving"],
        ["Double-click", "Edit text / create text"],
        ["Dbl-click tool", "Lock tool (🔒)"],
      ],
    },
    {
      title: "Apple Pencil Pro",
      shortcuts: [
        ["Squeeze", "Toggle last two tools"],
        ["Barrel Roll", "Rotate brush angle"],
      ],
    },
  ];

  let html = `
    <div class="help-panel">
      <div class="help-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="help-close">×</button>
      </div>
      <div class="help-body">
  `;

  for (const section of sections) {
    html += `<div class="help-section"><h4>${section.title}</h4><dl>`;
    for (const [key, desc] of section.shortcuts) {
      html += `<div class="help-row"><dt><kbd>${key}</kbd></dt><dd>${desc}</dd></div>`;
    }
    html += `</dl></div>`;
  }

  html += `
      </div>
      <div class="help-footer">Press <kbd>?</kbd> to close</div>
    </div>
  `;

  return html;
}


// ─── Arrow-Key Nudge (Figma/Sketch standard) ─────────────────────────────────

/** Nudge the selected node by step pixels in the arrow direction. */
function nudgeSelected(arrowKey, step) {
  if (!fdCanvas) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;

  try {
    const boundsJson = fdCanvas.get_node_bounds(selectedId);
    const b = JSON.parse(boundsJson);
    if (b.x === undefined) return;

    let newX = b.x;
    let newY = b.y;

    switch (arrowKey) {
      case "ArrowUp": newY -= step; break;
      case "ArrowDown": newY += step; break;
      case "ArrowLeft": newX -= step; break;
      case "ArrowRight": newX += step; break;
    }

    // Use handle_pointer sequence to move the node to the new position
    // This correctly updates constraints and triggers bidi sync
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = newX - b.x;
    const dy = newY - b.y;
    fdCanvas.handle_pointer_down(cx, cy, 1.0, false, false, false, false);
    const changed = fdCanvas.handle_pointer_move(cx + dx, cy + dy, 1.0, false, false, false, false);
    const upResult = JSON.parse(fdCanvas.handle_pointer_up(cx + dx, cy + dy, false, false, false, false));
    if (upResult.changed || changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  } catch (_) { /* skip */ }
}

// ─── Annotation Card ───────────────────────────────────────────────────────

// ─── Floating Action Bar (Contextual Toolbar) ──────────────────────────────

/** Position the floating action bar above the selected node's bounds */
function updateFloatingBar() {
  const fab = document.getElementById("floating-action-bar");
  if (!fab || !fdCanvas) return;

  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId || pointerIsDown || inlineEditorActive) {
    fab.classList.remove("visible");
    return;
  }

  // Get node bounds in scene space
  let bounds;
  try {
    bounds = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) {
    fab.classList.remove("visible");
    return;
  }
  if (bounds.x === undefined) {
    fab.classList.remove("visible");
    return;
  }

  // Scene → screen coords (apply pan + zoom)
  const canvas = document.getElementById("fd-canvas");
  const rect = canvas.getBoundingClientRect();
  const screenX = bounds.x * zoomLevel + panX + rect.left;
  const screenY = bounds.y * zoomLevel + panY + rect.top;
  const screenW = bounds.w * zoomLevel;

  // Position bar centered above node, 36px gap
  const barX = screenX + screenW / 2;
  const barY = screenY - 36;

  // Clamp to stay within canvas bounds
  const containerRect = document.getElementById("canvas-container").getBoundingClientRect();
  const clampedY = Math.max(containerRect.top + 4, barY);

  fab.style.left = `${barX - containerRect.left}px`;
  fab.style.top = `${clampedY - containerRect.top}px`;
  fab.classList.add("visible");

  // Read current node props for the controls
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

  // Update fill color
  const fillEl = document.getElementById("fab-fill");
  if (fillEl && props.fill) {
    let hex = props.fill;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    fillEl.value = hex.substring(0, 7);
  }

  // Update stroke color
  const strokeEl = document.getElementById("fab-stroke");
  if (strokeEl && props.strokeColor) {
    let hex = props.strokeColor;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    strokeEl.value = hex.substring(0, 7);
  }

  // Stroke width
  const strokeW = document.getElementById("fab-stroke-w");
  if (strokeW) strokeW.value = props.strokeWidth !== undefined ? props.strokeWidth : 1;

  // Opacity
  const opSlider = document.getElementById("fab-opacity");
  const opVal = document.getElementById("fab-opacity-val");
  const op = props.opacity !== undefined ? props.opacity : 1;
  if (opSlider) opSlider.value = op;
  if (opVal) opVal.textContent = `${Math.round(op * 100)}%`;

  // Font size — show only for text nodes
  const isText = props.kind === "text";
  document.querySelectorAll(".fab-text-only").forEach(el => {
    el.style.display = isText ? "" : "none";
  });
  if (isText) {
    const fsEl = document.getElementById("fab-font-size");
    if (fsEl && props.fontSize) fsEl.value = props.fontSize;
  }
}

function hideFloatingBar() {
  const fab = document.getElementById("floating-action-bar");
  if (fab) fab.classList.remove("visible");
}

// ─── Delete Button (Floating Action Bar) ───────────────────────────────────
document.getElementById("deleteSelectedBtn")?.addEventListener("click", () => {
  if (!fdCanvas) return;
  const changed = fdCanvas.delete_selected();
  if (changed) {
    render();
    syncTextToExtension();
    updateFloatingBar();
  }
});



function setupFloatingBar() {
  const fab = document.getElementById("floating-action-bar");
  if (!fab) return;

  // ── Fill color change ──
  document.getElementById("fab-fill").addEventListener("input", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("fill", e.target.value);
    captureDefault("fill", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Stroke color change ──
  document.getElementById("fab-stroke").addEventListener("input", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("stroke", e.target.value);
    captureDefault("stroke", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Stroke width change ──
  document.getElementById("fab-stroke-w").addEventListener("change", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("stroke_width", e.target.value);
    captureDefault("stroke_width", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Opacity slider ──
  const opSlider = document.getElementById("fab-opacity");
  const opVal = document.getElementById("fab-opacity-val");
  opSlider.addEventListener("input", (e) => {
    if (!fdCanvas) return;
    opVal.textContent = `${Math.round(e.target.value * 100)}%`;
    fdCanvas.set_node_prop("opacity", e.target.value);
    captureDefault("opacity", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Font size change ──
  document.getElementById("fab-font-size").addEventListener("change", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("font_size", e.target.value);
    captureDefault("font_size", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });


  // Prevent FAB clicks from deselecting the node
  fab.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });
}

function setupAnnotationCard() {
  document.getElementById("card-close-btn").addEventListener("click", () => {
    closeAnnotationCard();
  });

  // Save on field changes with debounce
  let saveTimer = null;
  const debounceSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAnnotationCard, 300);
  };

  document.getElementById("ann-description").addEventListener("input", debounceSave);
  document.getElementById("ann-status").addEventListener("change", debounceSave);
  document.getElementById("ann-priority").addEventListener("change", debounceSave);
  document.getElementById("ann-tags").addEventListener("input", debounceSave);

  document.getElementById("ann-add-accept").addEventListener("click", () => {
    addAcceptRow("");
  });
}

/**
 * Open the annotation card for a given node, positioned near the click.
 */
function openAnnotationCard(nodeId, clientX, clientY) {
  if (!fdCanvas) return;
  annotationCardNodeId = nodeId;

  const card = document.getElementById("annotation-card");
  const container = document.getElementById("canvas-container");
  const containerRect = container.getBoundingClientRect();

  // Position card near badge click, clamped to container
  let left = clientX - containerRect.left + 10;
  let top = clientY - containerRect.top - 10;
  left = Math.min(left, containerRect.width - 290);
  top = Math.max(top, 0);
  if (top + 350 > containerRect.height) top = containerRect.height - 350;

  card.style.left = left + "px";
  card.style.top = top + "px";

  // Populate from WASM
  const json = fdCanvas.get_annotations_json(nodeId);
  const annotations = JSON.parse(json);

  // Clear fields
  document.getElementById("ann-description").value = "";
  document.getElementById("ann-status").value = "";
  document.getElementById("ann-priority").value = "";
  document.getElementById("ann-tags").value = "";
  document.getElementById("ann-accept-list").innerHTML = "";

  // Set card title
  document.getElementById("card-title").textContent = `@${nodeId}`;

  // Populate fields from annotations
  for (const ann of annotations) {
    if (ann.Description !== undefined) {
      document.getElementById("ann-description").value = ann.Description;
    } else if (ann.Accept !== undefined) {
      addAcceptRow(ann.Accept);
    } else if (ann.Status !== undefined) {
      document.getElementById("ann-status").value = ann.Status;
    } else if (ann.Priority !== undefined) {
      document.getElementById("ann-priority").value = ann.Priority;
    } else if (ann.Tag !== undefined) {
      const current = document.getElementById("ann-tags").value;
      document.getElementById("ann-tags").value = current
        ? current + ", " + ann.Tag
        : ann.Tag;
    }
  }

  card.classList.add("visible");
}

function closeAnnotationCard() {
  const card = document.getElementById("annotation-card");
  if (card.classList.contains("visible")) {
    saveAnnotationCard();
    card.classList.remove("visible");
    annotationCardNodeId = null;
  }
}

function saveAnnotationCard() {
  if (!fdCanvas || !annotationCardNodeId) return;

  const annotations = [];

  // Description
  const desc = document.getElementById("ann-description").value.trim();
  if (desc) {
    annotations.push({ Description: desc });
  }

  // Accept criteria
  document.querySelectorAll("#ann-accept-list .accept-item input[type='text']").forEach((input) => {
    const val = input.value.trim();
    if (val) {
      annotations.push({ Accept: val });
    }
  });

  // Status
  const status = document.getElementById("ann-status").value;
  if (status) {
    annotations.push({ Status: status });
  }

  // Priority
  const priority = document.getElementById("ann-priority").value;
  if (priority) {
    annotations.push({ Priority: priority });
  }

  // Tags
  const tags = document.getElementById("ann-tags").value.trim();
  if (tags) {
    tags.split(",").forEach((t) => {
      const trimmed = t.trim();
      if (trimmed) annotations.push({ Tag: trimmed });
    });
  }

  const json = JSON.stringify(annotations);
  fdCanvas.set_annotations_json(annotationCardNodeId, json);
  render();
  syncTextToExtension();
}

function addAcceptRow(value) {
  const list = document.getElementById("ann-accept-list");
  const item = document.createElement("div");
  item.className = "accept-item";
  item.innerHTML = `
    <input type="text" value="${escapeAttr(value)}" placeholder="Acceptance criterion">
    <button class="card-close" style="font-size:14px">×</button>
  `;
  item.querySelector("button").addEventListener("click", () => {
    item.remove();
    saveAnnotationCard();
  });
  item.querySelector("input").addEventListener("input", () => {
    clearTimeout(item._timer);
    item._timer = setTimeout(saveAnnotationCard, 300);
  });
  list.appendChild(item);
}

function escapeAttr(s) {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Check if a node has a spec annotation block.
 * Uses parseAnnotatedNodes to detect matching spec data.
 */
function nodeHasSpec(nodeId) {
  if (!fdCanvas || !nodeId) return false;
  const source = fdCanvas.get_text();
  const nodes = parseAnnotatedNodes(source);
  return nodes.some(n => n.id === nodeId);
}

/**
 * Remove spec block(s) from a node's FD source via text manipulation.
 * Handles both inline `spec "..."` and block `spec { ... }` forms.
 */
function removeNodeSpec(nodeId) {
  if (!fdCanvas || !nodeId) return;
  let source = fdCanvas.get_text();
  const lines = source.split("\n");
  const result = [];
  let insideTargetNode = false;
  let nodeDepth = 0;
  let skipSpecBlock = false;
  let specBlockDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Detect target node start
    const nodeRe = new RegExp(`^(?:group|frame|rect|ellipse|path|text)\\s+@${nodeId}(?:\\s|\\{)`);
    if (nodeRe.test(trimmed)) {
      insideTargetNode = true;
      nodeDepth = 0;
    }

    if (insideTargetNode) {
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;

      // Skip inline spec line
      if (trimmed.match(/^spec\s+"/)) {
        continue; // drop this line
      }

      // Skip block spec start
      if (trimmed.match(/^spec\s*\{/) || trimmed === "spec{") {
        skipSpecBlock = true;
        specBlockDepth = opens - closes;
        continue;
      }

      if (skipSpecBlock) {
        specBlockDepth += opens - closes;
        if (specBlockDepth <= 0) skipSpecBlock = false;
        continue;
      }

      nodeDepth += opens - closes;
      if (trimmed === "}" && nodeDepth < 0) {
        insideTargetNode = false;
      }
    }

    result.push(lines[i]);
  }

  const newSource = result.join("\n");
  fdCanvas.set_text(newSource);
}

// ─── Context Menu (Right-Click) ─────────────────────────────────────────

function setupContextMenu() {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!fdCanvas) return;
    // On macOS, Ctrl+click fires contextmenu alongside the eraser pointerdown.
    // Suppress the context menu when eraser is active (temp or permanent).
    if (tempEraserMode || fdCanvas.get_tool_name() === "eraser") return;

    const rect = canvas.getBoundingClientRect();
    // Adjust for pan offset to get scene-space coords
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    // Hit-test for a node
    const selectedId = fdCanvas.get_selected_id();
    // Try to find node under pointer via selecting
    fdCanvas.handle_pointer_down(x, y, 1.0);
    fdCanvas.handle_pointer_up(x, y, false, false, false, false);
    const hitId = fdCanvas.get_selected_id();
    render();

    if (!hitId) {
      closeContextMenu();
      return;
    }

    contextMenuNodeId = hitId;
    const menu = document.getElementById("context-menu");
    const container = document.getElementById("canvas-container");
    const containerRect = container.getBoundingClientRect();
    menu.style.left = (e.clientX - containerRect.left) + "px";
    menu.style.top = (e.clientY - containerRect.top) + "px";

    // Enable/disable Group and Ungroup based on selection
    const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
    const groupBtn = document.getElementById("ctx-group");
    const ungroupBtn = document.getElementById("ctx-ungroup");

    // Group requires 2+ items selected
    const canGroup = selectedIds.length >= 2;
    groupBtn.classList.toggle("disabled", !canGroup);

    // Ungroup requires at least one selected item to be a group
    let canUngroup = false;
    if (selectedIds.length >= 1) {
      // Check each selected node's kind via the FD source text
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        // Match "group @id" in source — if found, this node is a group
        const groupRe = new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`);
        if (groupRe.test(source)) {
          canUngroup = true;
          break;
        }
      }
    }
    ungroupBtn.classList.toggle("disabled", !canUngroup);

    // Show/hide spec-related menu items based on whether node has a spec
    const hasSpec = nodeHasSpec(contextMenuNodeId);
    document.getElementById("ctx-add-annotation").style.display = hasSpec ? "none" : "";
    document.getElementById("ctx-view-spec").style.display = hasSpec ? "" : "none";
    document.getElementById("ctx-show-specs")?.style && (
      document.getElementById("ctx-show-specs").style.display = hasSpec ? "" : "none"
    );

    menu.classList.add("visible");
  });

  document.getElementById("ctx-add-annotation").addEventListener("click", () => {
    if (contextMenuNodeId) {
      const menu = document.getElementById("context-menu");
      const menuRect = menu.getBoundingClientRect();
      openAnnotationCard(contextMenuNodeId, menuRect.left, menuRect.top);
    }
    closeContextMenu();
  });

  // View Spec via context menu
  document.getElementById("ctx-view-spec")?.addEventListener("click", () => {
    if (contextMenuNodeId) {
      if (fdCanvas) fdCanvas.select_by_id(contextMenuNodeId);
      render();
      const menu = document.getElementById("context-menu");
      const menuRect = menu.getBoundingClientRect();
      openAnnotationCard(contextMenuNodeId, menuRect.left, menuRect.top);
    }
    closeContextMenu();
  });

  // Show Specs via context menu — opens spec annotation card
  document.getElementById("ctx-show-specs")?.addEventListener("click", () => {
    if (contextMenuNodeId) {
      if (fdCanvas) fdCanvas.select_by_id(contextMenuNodeId);
      render();
      const menu = document.getElementById("context-menu");
      const menuRect = menu.getBoundingClientRect();
      openAnnotationCard(contextMenuNodeId, menuRect.left, menuRect.top);
    }
    closeContextMenu();
  });



  // Duplicate via context menu
  document.getElementById("ctx-duplicate").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(contextMenuNodeId)) {
        fdCanvas.select_by_id(contextMenuNodeId);
      }
      const changed = fdCanvas.duplicate_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Group via context menu
  document.getElementById("ctx-group").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(contextMenuNodeId)) {
        fdCanvas.select_by_id(contextMenuNodeId);
      }
      const changed = fdCanvas.group_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Ungroup via context menu
  document.getElementById("ctx-ungroup").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(contextMenuNodeId)) {
        fdCanvas.select_by_id(contextMenuNodeId);
      }
      const changed = fdCanvas.ungroup_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Cut via context menu
  document.getElementById("ctx-cut")?.addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      copySelectedAsFd();
      const changed = fdCanvas.delete_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Copy via context menu
  document.getElementById("ctx-copy")?.addEventListener("click", () => {
    if (fdCanvas) {
      copySelectedAsFd();
    }
    closeContextMenu();
  });

  // Paste via context menu
  document.getElementById("ctx-paste")?.addEventListener("click", () => {
    if (fdCanvas) {
      pasteFromClipboard();
    }
    closeContextMenu();
  });

  // Copy as PNG via context menu
  document.getElementById("ctx-copy-png")?.addEventListener("click", () => {
    if (fdCanvas) {
      copySelectionAsPng();
    }
    closeContextMenu();
  });

  // Frame Selection via context menu
  document.getElementById("ctx-frame")?.addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      // Simulate ⌘+frame by wrapping selected nodes in a frame via handle_key
      const resultJson = fdCanvas.handle_key("f", false, false, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Bring to Front via context menu
  document.getElementById("ctx-bring-front")?.addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const resultJson = fdCanvas.handle_key("]", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Send to Back via context menu
  document.getElementById("ctx-send-back")?.addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const resultJson = fdCanvas.handle_key("[", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Delete via context menu
  document.getElementById("ctx-delete")?.addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      fdCanvas.select_by_id(contextMenuNodeId);
      const changed = fdCanvas.delete_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Close menu on any click
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("context-menu");
    if (!menu.contains(e.target)) {
      closeContextMenu();
    }
  });
  // ── Layers panel: ⋮ button → open context menu (VS Code webview blocks contextmenu events) ──
  const layersPanel = document.getElementById("layers-panel");
  if (layersPanel) {
    layersPanel.addEventListener("click", (e) => {
      const actionsBtn = e.target.closest(".layer-actions");
      if (!actionsBtn || !fdCanvas) return;
      e.stopPropagation();
      const nodeId = actionsBtn.getAttribute("data-actions-id");
      if (!nodeId) return;
      fdCanvas.select_by_id(nodeId);
      render();
      contextMenuNodeId = nodeId;
      const menu = document.getElementById("context-menu");
      const container = document.getElementById("canvas-container");
      const containerRect = container.getBoundingClientRect();
      menu.style.left = (e.clientX - containerRect.left) + "px";
      menu.style.top = (e.clientY - containerRect.top) + "px";
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      const groupBtn = document.getElementById("ctx-group");
      const ungroupBtn = document.getElementById("ctx-ungroup");
      groupBtn.classList.toggle("disabled", selectedIds.length < 2);
      let canUngroup = false;
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
          canUngroup = true;
          break;
        }
      }
      ungroupBtn.classList.toggle("disabled", !canUngroup);
      const hasSpec = nodeHasSpec(nodeId);
      document.getElementById("ctx-add-annotation").style.display = hasSpec ? "none" : "";
      document.getElementById("ctx-view-spec").style.display = hasSpec ? "" : "none";
      const showSpecsEl = document.getElementById("ctx-show-specs");
      if (showSpecsEl) showSpecsEl.style.display = hasSpec ? "" : "none";
      menu.classList.add("visible");
    });
  }
}

function closeContextMenu() {
  document.getElementById("context-menu").classList.remove("visible");
  contextMenuNodeId = null;
}


// ─── Edge Context Menu ──────────────────────────────────────────────────

let ecmEdgeId = null;

function showEdgeContextMenu(edgeId, screenX, screenY) {
  const menu = document.getElementById("edge-context-menu");
  if (!menu) return;
  ecmEdgeId = edgeId;
  document.getElementById("ecm-arrow").value = "end";
  document.getElementById("ecm-curve").value = "smooth";
  document.getElementById("ecm-stroke-color").value = "#999999";
  document.getElementById("ecm-stroke-width").value = "1";
  document.getElementById("ecm-flow").value = "none";
  document.getElementById("ecm-flow-dur").style.display = "none";
  menu.style.left = (screenX + 12) + "px";
  menu.style.top = (screenY - 60) + "px";
  menu.classList.add("visible");
  setTimeout(() => {
    document.addEventListener("pointerdown", ecmClickOutside, true);
    document.addEventListener("keydown", ecmEscHandler, true);
  }, 50);
}

function closeEdgeContextMenu() {
  const menu = document.getElementById("edge-context-menu");
  if (menu) menu.classList.remove("visible");
  ecmEdgeId = null;
  document.removeEventListener("pointerdown", ecmClickOutside, true);
  document.removeEventListener("keydown", ecmEscHandler, true);
}

function ecmClickOutside(e) {
  const menu = document.getElementById("edge-context-menu");
  if (menu && !menu.contains(e.target)) closeEdgeContextMenu();
}

function ecmEscHandler(e) {
  if (e.key === "Escape") { closeEdgeContextMenu(); e.preventDefault(); }
}

function setupEdgeContextMenu() {
  const arrowSel = document.getElementById("ecm-arrow");
  const curveSel = document.getElementById("ecm-curve");
  const strokeColor = document.getElementById("ecm-stroke-color");
  const strokeWidth = document.getElementById("ecm-stroke-width");
  const flowSel = document.getElementById("ecm-flow");
  const flowDur = document.getElementById("ecm-flow-dur");
  if (!arrowSel) return;

  function applyEdgeChange() {
    if (!fdCanvas || !ecmEdgeId) return;
    const text = fdCanvas.get_text();
    const esc = ecmEdgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(edge\\s+@${esc}\\s*\\{[^}]*?)\\}`, "s");
    const m = text.match(re);
    if (!m) return;
    let block = m[1];
    // Arrow
    block = block.replace(/arrow:\s*\S+/, `arrow: ${arrowSel.value}`);
    if (!block.includes("arrow:")) block += `\n  arrow: ${arrowSel.value}`;
    // Curve
    block = block.replace(/curve:\s*\S+/, `curve: ${curveSel.value}`);
    if (!block.includes("curve:")) block += `\n  curve: ${curveSel.value}`;
    // Stroke
    const sw = strokeWidth.value || "1";
    const sc = strokeColor.value || "#999";
    block = block.replace(/stroke:\s*#?\w+\s*[\d.]*/, `stroke: ${sc} ${sw}`);
    if (!block.includes("stroke:")) block += `\n  stroke: ${sc} ${sw}`;
    // Flow
    if (flowSel.value !== "none") {
      const dur = flowDur.value || "800";
      const flowLine = `flow: ${flowSel.value} ${dur}ms`;
      if (block.includes("flow:")) {
        block = block.replace(/flow:\s*\S+\s*\d*m?s?/, flowLine);
      } else {
        block += `\n  ${flowLine}`;
      }
    } else {
      block = block.replace(/\n\s*flow:\s*\S+\s*\d*m?s?/, "");
    }
    const newText = text.replace(re, block + "\n}");
    fdCanvas.set_text(newText);
    bumpGeneration();
    render();
    syncTextToExtension();
  }

  arrowSel.addEventListener("change", applyEdgeChange);
  curveSel.addEventListener("change", applyEdgeChange);
  strokeColor.addEventListener("input", applyEdgeChange);
  strokeWidth.addEventListener("change", applyEdgeChange);
  flowSel.addEventListener("change", () => {
    flowDur.style.display = flowSel.value !== "none" ? "" : "none";
    applyEdgeChange();
  });
  flowDur.addEventListener("change", applyEdgeChange);
}

/** Draw a dot grid behind shapes. Grid adapts to zoom level. */
function drawGrid() {
  if (!ctx) return;
  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  // Compute spacing: double grid spacing when dots get too close
  let spacing = GRID_BASE_SPACING;
  while (spacing * zoomLevel < 10) spacing *= 2;

  // Determine visible scene-space bounds
  const sceneLeft = -panX / zoomLevel;
  const sceneTop = -panY / zoomLevel;
  const sceneRight = (cw - panX) / zoomLevel;
  const sceneBottom = (ch - panY) / zoomLevel;

  // Snap start to grid
  const startX = Math.floor(sceneLeft / spacing) * spacing;
  const startY = Math.floor(sceneTop / spacing) * spacing;

  // Choose dot vs line based on zoom
  const isDark = document.body.classList.contains("dark-theme");
  if (zoomLevel >= 3) {
    // Line grid at high zoom
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5 / zoomLevel;
    ctx.beginPath();
    for (let x = startX; x <= sceneRight; x += spacing) {
      ctx.moveTo(x, sceneTop);
      ctx.lineTo(x, sceneBottom);
    }
    for (let y = startY; y <= sceneBottom; y += spacing) {
      ctx.moveTo(sceneLeft, y);
      ctx.lineTo(sceneRight, y);
    }
    ctx.stroke();
  } else {
    // Dot grid
    const dotSize = Math.max(0.8, 1 / zoomLevel);
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
    for (let x = startX; x <= sceneRight; x += spacing) {
      for (let y = startY; y <= sceneBottom; y += spacing) {
        ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
      }
    }
  }
}

/** Toggle grid overlay on/off. */
function toggleGrid() {
  gridEnabled = !gridEnabled;
  const btn = document.getElementById("grid-toggle-btn");
  if (btn) btn.classList.toggle("grid-on", gridEnabled);
  // Persist grid state
  vscode.setState({ ...(vscode.getState() || {}), gridEnabled });
  render();
}

/** Set up grid toggle button and restore persisted state. */
function setupGridToggle() {
  const btn = document.getElementById("grid-toggle-btn");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.gridEnabled) {
    gridEnabled = true;
    btn.classList.add("grid-on");
  }

  btn.addEventListener("click", toggleGrid);
}

/** Toggle spec badge overlay on/off (independent of Spec View mode). */
function toggleSpecBadges() {
  specBadgesVisible = !specBadgesVisible;
  const btn = document.getElementById("sm-spec-badge-toggle");
  if (btn) btn.classList.toggle("active", specBadgesVisible);
  vscode.setState({ ...(vscode.getState() || {}), specBadgesVisible });

  const overlay = document.getElementById("spec-overlay");
  if (specBadgesVisible || viewMode === "spec") {
    refreshSpecBadges();
  } else {
    if (overlay) { overlay.innerHTML = ""; overlay.style.display = "none"; }
  }
}

/** Set up spec badge toggle button and restore persisted state. */
function setupSpecBadgeToggle() {
  const btn = document.getElementById("sm-spec-badge-toggle");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.specBadgesVisible) {
    specBadgesVisible = true;
    btn.classList.add("active");
    setTimeout(() => { if (fdCanvas) refreshSpecBadges(); }, 500);
  }

  btn.addEventListener("click", toggleSpecBadges);
}

// ─── Properties Panel ────────────────────────────────────────────────────

let propsSuppressSync = false;

function setupPropertiesPanel() {
  const fields = [
    { id: "prop-fill", key: "fill" },
    { id: "prop-stroke-color", key: "strokeColor" },
    { id: "prop-stroke-w", key: "strokeWidth" },
    { id: "prop-corner", key: "cornerRadius" },
    { id: "prop-w", key: "width" },
    { id: "prop-h", key: "height" },
    { id: "prop-text-content", key: "content" },

  ];

  let debounceTimer = null;

  for (const { id, key } of fields) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("input", () => {
      if (propsSuppressSync || !fdCanvas) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const changed = fdCanvas.set_node_prop(key, el.value);
        if (changed) {
          captureDefault(key, el.value);
          render();
          syncTextToExtension();
        }
      }, 100);
    });
  }

  // Opacity slider
  const opacitySlider = document.getElementById("prop-opacity");
  const opacityVal = document.getElementById("prop-opacity-val");
  if (opacitySlider) {
    opacitySlider.addEventListener("input", () => {
      if (propsSuppressSync || !fdCanvas) return;
      const v = parseFloat(opacitySlider.value);
      if (opacityVal) opacityVal.textContent = Math.round(v * 100) + "%";
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const changed = fdCanvas.set_node_prop("opacity", String(v));
        if (changed) {
          captureDefault("opacity", String(v));
          render();
          syncTextToExtension();
        }
      }, 100);
    });
  }
}

function updatePropertiesPanel() {
  if (!fdCanvas) return;
  const json = fdCanvas.get_selected_node_props();
  const props = JSON.parse(json);
  const panel = document.getElementById("props-panel");

  if (!props.id) {
    panel.classList.remove("visible");
    return;
  }

  propsSuppressSync = true;
  panel.classList.add("visible");

  // Title
  document.getElementById("props-node-id").textContent = `@${props.id}`;
  document.getElementById("props-kind").textContent = props.kind || "";

  // Position & Size
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? Math.round(val) : "";
  };
  setVal("prop-x", props.x);
  setVal("prop-y", props.y);
  setVal("prop-w", props.width);
  setVal("prop-h", props.height);

  // Fill color
  const fillEl = document.getElementById("prop-fill");
  if (fillEl && props.fill) {
    // Ensure 6-digit hex for color input
    let hex = props.fill;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    fillEl.value = hex.substring(0, 7);
  }

  // Stroke
  const strokeEl = document.getElementById("prop-stroke-color");
  if (strokeEl && props.strokeColor) {
    let hex = props.strokeColor;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    strokeEl.value = hex.substring(0, 7);
  }
  setVal("prop-stroke-w", props.strokeWidth);

  // Corner radius
  setVal("prop-corner", props.cornerRadius);

  // Opacity
  const opacitySlider = document.getElementById("prop-opacity");
  const opacityVal = document.getElementById("prop-opacity-val");
  const opacity = props.opacity !== undefined ? props.opacity : 1;
  if (opacitySlider) opacitySlider.value = opacity;
  if (opacityVal) opacityVal.textContent = Math.round(opacity * 100) + "%";

  // Text content (for text nodes)
  const textSection = document.getElementById("props-text-section");
  const textInput = document.getElementById("prop-text-content");

  if (props.kind === "text") {
    if (textSection) textSection.style.display = "";
    if (textInput) textInput.value = props.content || "";
  } else {
    if (textSection) textSection.style.display = "none";
  }

  // Alignment grid — show for text/rect/ellipse nodes
  const alignSection = document.getElementById("props-align-section");
  if (alignSection) {
    const showAlign = props.kind === "text" || props.kind === "rect" || props.kind === "ellipse";
    alignSection.style.display = showAlign ? "" : "none";
    if (showAlign) {
      const h = props.textAlign || "center";
      const v = props.textVAlign || "middle";
      document.querySelectorAll(".align-cell").forEach(cell => {
        const cellH = cell.dataset.h;
        const cellV = cell.dataset.v;
        cell.classList.toggle("active", cellH === h && cellV === v);
      });
    }
  }

  // Show/hide appearance section based on kind
  const appearance = document.getElementById("props-appearance");
  if (appearance) {
    appearance.style.display = (props.kind === "root" || props.kind === "group") ? "none" : "";
  }

  // Actions section state
  updatePropsActionsState();

  propsSuppressSync = false;
}

// ─── Alignment Grid Picker ─────────────────────────────────────────────────

function setupAlignGrid() {
  const grid = document.getElementById("align-grid");
  if (!grid) return;
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".align-cell");
    if (!cell || !fdCanvas) return;
    const h = cell.dataset.h;
    const v = cell.dataset.v;
    fdCanvas.set_node_prop("textAlign", h);
    fdCanvas.set_node_prop("textVAlign", v);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });
}

// ─── Props Actions (Group, Ungroup, Duplicate, etc.) ───────────────────────

function setupPropsActions() {
  const actions = {
    "props-group": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.group_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
    "props-ungroup": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.ungroup_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
    "props-duplicate": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.duplicate_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
    "props-frame": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("f", false, false, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { render(); syncTextToExtension(); }
    },
    "props-bring-front": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("]", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { render(); syncTextToExtension(); }
    },
    "props-send-back": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("[", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { render(); syncTextToExtension(); }
    },
    "props-copy-png": () => {
      if (!fdCanvas) return;
      copySelectionAsPng();
    },
    "props-delete": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.delete_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
  };

  for (const [id, handler] of Object.entries(actions)) {
    document.getElementById(id)?.addEventListener("click", (e) => {
      e.stopPropagation();
      handler();
      updatePropertiesPanel();
      updateFloatingBar();
      refreshLayersPanel();
    });
  }
}

/** Enable/disable action buttons based on current selection state. */
function updatePropsActionsState() {
  if (!fdCanvas) return;
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  const canGroup = selectedIds.length >= 2;

  // Check if any selected node is a group
  let canUngroup = false;
  if (selectedIds.length >= 1) {
    const source = fdCanvas.get_text();
    for (const id of selectedIds) {
      if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
        canUngroup = true;
        break;
      }
    }
  }

  document.getElementById("props-group")?.classList.toggle("disabled", !canGroup);
  document.getElementById("props-ungroup")?.classList.toggle("disabled", !canUngroup);
  document.getElementById("props-frame")?.classList.toggle("disabled", !canGroup);
}


// ─── Layers Panel (Tree View) ────────────────────────────────────────────

const LAYER_ICONS = {
  group: "◻",
  frame: "▣",
  rect: "▢",
  ellipse: "○",
  path: "〜",
  text: "T",
  style: "◆",
  edge: "⟶",
  spec: "◇",
};

/**
 * Parse FD source into a hierarchical layer tree.
 * Returns array of { id, kind, text, children[] }.
 */
function parseLayerTree(source) {
  const lines = source.split("\n");
  const root = [];
  const stack = []; // { node, depth }
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Style definition
    const styleMatch = trimmed.match(/^style\s+(\w+)\s*\{/);
    if (styleMatch) {
      const node = { id: styleMatch[1], kind: "style", text: "", children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      braceDepth += openBraces - closeBraces;
      stack.push({ node, depth: braceDepth });
      continue;
    }

    // Edge
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      const node = { id: edgeMatch[1], kind: "edge", text: "", children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      braceDepth += openBraces - closeBraces;
      stack.push({ node, depth: braceDepth });
      continue;
    }

    // Typed node
    const nodeMatch = trimmed.match(
      /^(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?/
    );
    if (nodeMatch) {
      const node = {
        id: nodeMatch[2],
        kind: nodeMatch[1],
        text: nodeMatch[3] || "",
        children: [],
      };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      if (trimmed.endsWith("{")) {
        braceDepth += 1;
        stack.push({ node, depth: braceDepth });
      }
      continue;
    }

    // Generic node
    const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
    if (genericMatch) {
      const node = { id: genericMatch[1], kind: "spec", text: "", children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      braceDepth += openBraces - closeBraces;
      stack.push({ node, depth: braceDepth });
      continue;
    }

    // Closing brace
    if (trimmed === "}") {
      braceDepth -= 1;
      while (stack.length > 0 && stack[stack.length - 1].depth > braceDepth) {
        stack.pop();
      }
      continue;
    }

    braceDepth += openBraces - closeBraces;
  }

  return root;
}

/** Render a layer tree node as HTML with Figma-style indentation. */
function renderLayerNode(node, selectedId, depth = 0) {
  const icon = LAYER_ICONS[node.kind] || "•";
  const isSelected = node.id === selectedId;
  const hasChildren = node.children.length > 0;
  const textPreview = node.text ? `<span class="layer-text-preview">"${escapeHtml(node.text)}"</span>` : "";

  // Indent guides for depth
  let indent = "";
  for (let i = 0; i < depth; i++) {
    indent += `<span class="layer-indent-guide"></span>`;
  }

  // Disclosure chevron
  const chevronClass = hasChildren ? "layer-chevron expanded" : "layer-chevron empty";
  const chevron = `<span class="${chevronClass}" data-toggle-id="${escapeAttr(node.id)}">▶</span>`;

  let html = `<div class="layer-item${isSelected ? " selected" : ""}" data-node-id="${escapeAttr(node.id)}">`;
  html += `<span class="layer-indent">${indent}</span>`;
  html += chevron;
  html += `<span class="layer-icon">${icon}</span>`;
  html += `<span class="layer-name">${escapeHtml(node.id)}${textPreview}</span>`;
  html += `<span class="layer-kind">${escapeHtml(node.kind)}</span>`;
  html += `<span class="layer-actions" data-actions-id="${escapeAttr(node.id)}" title="More actions">⋮</span>`;
  html += `<span class="layer-eye" data-eye-id="${escapeAttr(node.id)}" title="Toggle visibility">👁</span>`;
  html += `</div>`;

  if (hasChildren) {
    html += `<div class="layer-children" data-parent-id="${escapeAttr(node.id)}">`;
    for (const child of node.children) {
      html += renderLayerNode(child, selectedId, depth + 1);
    }
    html += `</div>`;
  }
  return html;
}

/** Refresh the layers panel content. */

// ─── Spec Summary Panel (replaces layers in Spec mode) ──────────────────

function refreshSpecSummary(panel) {
  if (!fdCanvas) return;
  const source = fdCanvas.get_text();
  const annotated = parseAnnotatedNodes(source);
  const selectedId = fdCanvas.get_selected_id() || "";

  // Count total meaningful nodes for coverage %
  const tree = parseLayerTree(source);
  const countNodes = (nodes) => nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
  const totalNodes = countNodes(tree);
  const coveragePct = totalNodes > 0 ? Math.round((annotated.length / totalNodes) * 100) : 0;

  // Header with coverage % and action buttons
  let html = `<div class="layers-header">`;
  html += `<span class="layers-title">Requirements</span>`;
  html += `<span class="layers-count" title="${annotated.length} of ${totalNodes} nodes have specs">${coveragePct}%</span>`;
  html += `<div class="spec-header-actions">`;
  html += `<button class="spec-action-btn" id="spec-export-btn" title="Export spec report (copies markdown to clipboard)">↗</button>`;
  html += `<select class="spec-bulk-status" id="spec-bulk-status" title="Set status on all visible specs">`;
  html += `<option value="">Bulk…</option>`;
  html += `<option value="todo">→ To Do</option>`;
  html += `<option value="doing">→ Doing</option>`;
  html += `<option value="done">→ Done</option>`;
  html += `<option value="blocked">→ Blocked</option>`;
  html += `</select>`;
  html += `</div>`;
  html += `</div>`;

  // Filter tabs
  const filters = [
    { key: "all", label: "All" },
    { key: "todo", label: "To Do" },
    { key: "doing", label: "Doing" },
    { key: "done", label: "Done" },
    { key: "blocked", label: "Blocked" },
  ];
  html += `<div class="spec-filter-tabs">`;
  for (const f of filters) {
    const active = specFilter === f.key ? " active" : "";
    // Count per filter
    let count;
    if (f.key === "all") {
      count = annotated.length;
    } else {
      count = annotated.filter(n =>
        n.annotations.some(a => a.type === "status" && a.value === f.key)
      ).length;
    }
    html += `<button class="spec-filter-btn${active}" data-filter="${f.key}">${f.label} <span class="spec-filter-count">${count}</span></button>`;
  }
  html += `</div>`;

  // Filter nodes by status
  const filtered = specFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === specFilter)
    );

  if (filtered.length === 0 && annotated.length === 0) {
    html += `<div class="spec-empty-state">`;
    html += `<div style="font-size:24px;margin-bottom:8px;opacity:0.4">◇</div>`;
    html += `<div style="opacity:0.5;font-size:12px">No spec annotations yet</div>`;
    html += `<div style="opacity:0.35;font-size:11px;margin-top:4px">Right-click a node → Add Spec, or press ⌘I</div>`;
    html += `</div>`;
    panel.innerHTML = html;
    return;
  }

  if (filtered.length === 0) {
    html += `<div class="spec-empty-state">`;
    html += `<div style="opacity:0.5;font-size:12px">No specs with this status</div>`;
    html += `</div>`;
    panel.innerHTML = html;
    wireSpecPanelHandlers(panel, annotated);
    return;
  }

  html += `<div class="layers-body">`;
  for (const node of filtered) {
    const isSelected = node.id === selectedId;
    const descriptions = node.annotations.filter(a => a.type === "description");
    const statuses = node.annotations.filter(a => a.type === "status");
    const priorities = node.annotations.filter(a => a.type === "priority");
    const accepts = node.annotations.filter(a => a.type === "accept");
    const tags = node.annotations.filter(a => a.type === "tag");

    html += `<div class="spec-summary-card${isSelected ? ' selected' : ''}" data-spec-id="${escapeAttr(node.id)}">`;
    html += `<div class="spec-card-header">`;
    html += `<span class="spec-card-id">@${escapeHtml(node.id)}</span>`;
    if (node.kind) {
      html += `<span class="spec-card-kind">${escapeHtml(node.kind)}</span>`;
    }
    html += `</div>`;
    if (descriptions.length > 0) {
      html += `<div class="spec-card-desc">${escapeHtml(descriptions[0].value)}</div>`;
    }
    if (statuses.length > 0 || priorities.length > 0) {
      html += `<div class="spec-card-badges">`;
      for (const s of statuses) {
        html += `<span class="spec-card-badge status-${escapeAttr(s.value)}">${escapeHtml(s.value)}</span>`;
      }
      for (const p of priorities) {
        html += `<span class="spec-card-badge priority-${escapeAttr(p.value)}">⚡ ${escapeHtml(p.value)}</span>`;
      }
      html += `</div>`;
    }
    if (accepts.length > 0) {
      html += `<div class="spec-card-accepts">`;
      for (const a of accepts) {
        html += `<div class="spec-card-accept-item">✓ ${escapeHtml(a.value)}</div>`;
      }
      html += `</div>`;
    }
    if (tags.length > 0) {
      html += `<div class="spec-card-tags">`;
      for (const t of tags) {
        html += `<span class="spec-card-tag">${escapeHtml(t.value)}</span>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  panel.innerHTML = html;
  wireSpecPanelHandlers(panel, annotated);
}

function wireSpecPanelHandlers(panel, annotated) {
  // Filter tab handlers
  panel.querySelectorAll(".spec-filter-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      specFilter = btn.getAttribute("data-filter") || "all";
      refreshSpecSummary(panel);
    });
  });

  // Card click handlers
  panel.querySelectorAll(".spec-summary-card").forEach(card => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const nodeId = card.getAttribute("data-spec-id");
      if (nodeId && fdCanvas) {
        if (fdCanvas.select_by_id(nodeId)) render();
        const rect = card.getBoundingClientRect();
        openAnnotationCard(nodeId, rect.right + 8, rect.top);
        panel.querySelectorAll(".spec-summary-card").forEach(c =>
          c.classList.toggle("selected", c.getAttribute("data-spec-id") === nodeId)
        );
      }
    });
  });

  // Export button
  document.getElementById("spec-export-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    exportSpecReport(annotated);
  });

  // Bulk status dropdown
  document.getElementById("spec-bulk-status")?.addEventListener("change", (e) => {
    e.stopPropagation();
    const newStatus = e.target.value;
    if (newStatus) {
      bulkSetStatus(annotated, newStatus);
      e.target.value = "";
    }
  });
}

function exportSpecReport(annotated) {
  if (!fdCanvas) return;
  let md = `# Spec Report\n\n`;
  md += `> Generated from FD canvas\n\n`;

  for (const node of annotated) {
    const desc = node.annotations.find(a => a.type === "description");
    const status = node.annotations.find(a => a.type === "status");
    const priority = node.annotations.find(a => a.type === "priority");
    const accepts = node.annotations.filter(a => a.type === "accept");
    const tags = node.annotations.filter(a => a.type === "tag");

    md += `## @${node.id}`;
    if (node.kind) md += ` (${node.kind})`;
    md += `\n\n`;
    if (desc) md += `${desc.value}\n\n`;
    if (status) md += `**Status:** ${status.value}\n`;
    if (priority) md += `**Priority:** ${priority.value}\n`;
    if (status || priority) md += `\n`;
    if (accepts.length > 0) {
      md += `**Acceptance Criteria:**\n`;
      for (const a of accepts) md += `- [ ] ${a.value}\n`;
      md += `\n`;
    }
    if (tags.length > 0) {
      md += `**Tags:** ${tags.map(t => t.value).join(", ")}\n\n`;
    }
    md += `---\n\n`;
  }

  navigator.clipboard.writeText(md).then(() => {
    vscode.postMessage({ type: "info", text: `Spec report copied to clipboard (${annotated.length} nodes)` });
  });
}

function bulkSetStatus(annotated, newStatus) {
  if (!fdCanvas) return;
  // Apply status to currently visible (filtered) nodes
  const targets = specFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === specFilter)
    );

  for (const node of targets) {
    const json = fdCanvas.get_annotations_json(node.id);
    const anns = JSON.parse(json);
    // Remove existing status, add new
    const filtered = anns.filter(a => a.Status === undefined);
    filtered.push({ Status: newStatus });
    fdCanvas.set_annotations_json(node.id, JSON.stringify(filtered));
  }
  render();
  syncTextToExtension();
  // Refresh to show updated statuses
  const panel = document.getElementById("layers-panel");
  if (panel) refreshSpecSummary(panel);
}

/** Last layer generation + selection — skip rebuild when unchanged */
let lastLayerGeneration = -1;
let lastLayerSelectedId = "";

function refreshLayersPanel() {
  const panel = document.getElementById("layers-panel");
  if (!panel || !fdCanvas) return;

  // In Spec mode, show requirements summary instead of layers
  if (viewMode === "spec") {
    lastLayerGeneration = -1;
    refreshSpecSummary(panel);
    return;
  }

  const selectedId = fdCanvas.get_selected_id() || "";

  // Skip DOM rebuild if nothing changed (uses generation counter instead of full-text hash)
  if (sceneGeneration === lastLayerGeneration && selectedId === lastLayerSelectedId) return;

  // Selection-only change: update highlight on existing DOM without full rebuild
  if (sceneGeneration === lastLayerGeneration && selectedId !== lastLayerSelectedId) {
    lastLayerSelectedId = selectedId;
    panel.querySelectorAll(".layer-item").forEach(el =>
      el.classList.toggle("selected", el.getAttribute("data-node-id") === selectedId)
    );
    // Scroll selected item into view (Canvas/Code → Layers sync)
    const selectedEl = panel.querySelector('.layer-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  lastLayerGeneration = sceneGeneration;
  lastLayerSelectedId = selectedId;

  const source = fdCanvas.get_text();

  const tree = parseLayerTree(source);

  // Count total nodes
  const countNodes = (nodes) => nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
  const totalCount = countNodes(tree);

  let html = `<div class="layers-header">`;
  html += `<span class="layers-title">Layers</span>`;
  html += `<span class="layers-count">${totalCount}</span>`;
  html += `</div>`;
  html += `<div class="layers-body">`;
  for (const node of tree) {
    html += renderLayerNode(node, selectedId);
  }
  html += `</div>`;

  panel.innerHTML = html;

  // Wire click handlers for layer items (selection)
  panel.querySelectorAll(".layer-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      // Don't select when clicking chevron
      if (e.target.closest(".layer-chevron")) return;
      e.stopPropagation();
      const nodeId = item.getAttribute("data-node-id");
      if (nodeId && fdCanvas) {
        // Pre-set generation so refreshLayersPanel() inside syncSelection skips DOM rebuild.
        // This keeps our DOM references valid for the highlight update below.
        lastLayerGeneration = sceneGeneration;
        lastLayerSelectedId = nodeId;
        // Update selection highlight in layers (DOM still intact because rebuild was skipped)
        panel.querySelectorAll(".layer-item").forEach((el) => {
          el.classList.toggle("selected", el.getAttribute("data-node-id") === nodeId);
        });
        // Smart focus: pan/zoom to the selected node if needed
        focusOnNode(nodeId);
        // Central sync: Canvas select + Code highlight + side panels
        syncSelection(nodeId, "layers");
      }
    });
  });

  // Wire chevron toggle for expand/collapse
  panel.querySelectorAll(".layer-chevron:not(.empty)").forEach((chevron) => {
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      const toggleId = chevron.getAttribute("data-toggle-id");
      const childrenContainer = panel.querySelector(`.layer-children[data-parent-id="${toggleId}"]`);
      if (childrenContainer) {
        const isCollapsed = childrenContainer.classList.toggle("collapsed");
        chevron.classList.toggle("expanded", !isCollapsed);
      }
    });
  });

  // Wire double-click on layer name for inline rename (Figma/Sketch)
  panel.querySelectorAll(".layer-name").forEach((nameEl) => {
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const item = nameEl.closest(".layer-item");
      if (!item) return;
      const oldId = item.getAttribute("data-node-id");
      if (!oldId) return;

      // Create inline input
      const input = document.createElement("input");
      input.type = "text";
      input.value = oldId;
      input.style.cssText = [
        "font-size:11px",
        "font-family:inherit",
        "padding:1px 4px",
        "border:1px solid var(--fd-accent)",
        "border-radius:4px",
        "background:var(--fd-input-bg)",
        "color:var(--fd-text)",
        "outline:none",
        "width:100%",
        "box-shadow:0 0 0 2px var(--fd-input-focus)",
      ].join(";");

      // Replace name span with input
      nameEl.textContent = "";
      nameEl.appendChild(input);
      input.focus();
      input.select();

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const newId = input.value.trim().replace(/[^a-zA-Z0-9_]/g, "_");
        if (input.parentNode) input.parentNode.removeChild(input);
        if (!newId || newId === oldId || !fdCanvas) {
          refreshLayersPanel();
          return;
        }
        // Rename in the FD source: replace all @old_id references
        const text = fdCanvas.get_text();
        const renamed = text.replace(
          new RegExp(`@${oldId}\\b`, "g"),
          `@${newId}`
        );
        if (renamed !== text) {
          const ok = fdCanvas.set_text(renamed);
          if (ok) {
            render();
            syncTextToExtension();
          }
        }
        refreshLayersPanel();
      };

      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); }
        if (ev.key === "Escape") { ev.preventDefault(); refreshLayersPanel(); }
        ev.stopPropagation();
      });
      input.addEventListener("blur", () => setTimeout(commit, 100));
    });
  });

  // Wire eye icon for layer visibility toggle
  panel.querySelectorAll(".layer-eye").forEach((eyeEl) => {
    const nodeId = eyeEl.getAttribute("data-eye-id");
    if (hiddenNodes.has(nodeId)) {
      eyeEl.classList.add("hidden-layer");
      eyeEl.textContent = "⊘";
    }
    eyeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNodeVisibility(nodeId);
    });
  });
}

// ─── Spec View Parser (client-side) ──────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseSpecAnnotation(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "}") return null;
  const acceptMatch = trimmed.match(/^accept:\s*"([^"]*)"/);
  if (acceptMatch) return { type: "accept", value: acceptMatch[1] };
  const statusMatch = trimmed.match(/^status:\s*(\S+)/);
  if (statusMatch) return { type: "status", value: statusMatch[1] };
  const priorityMatch = trimmed.match(/^priority:\s*(\S+)/);
  if (priorityMatch) return { type: "priority", value: priorityMatch[1] };
  const tagMatch = trimmed.match(/^tag:\s*(.+)/);
  if (tagMatch) return { type: "tag", value: tagMatch[1].trim() };
  const descMatch = trimmed.match(/^"([^"]*)"/);
  if (descMatch) return { type: "description", value: descMatch[1] };
  return null;
}


// ─── Color Swatches (Sketch/Figma preset palette) ─────────────────────────────

const COLOR_PRESETS = [
  "#000000", "#FFFFFF", "#FF3B30", "#FF9500",
  "#FFCC00", "#34C759", "#007AFF", "#5856D6",
  "#AF52DE", "#FF2D55", "#8E8E93", "#48484A",
];
/** Recently used colors (max 6) */
const recentColors = [];

/** Set up color swatches in the properties panel. */
function setupColorSwatches() {
  const swatchContainer = document.getElementById("fill-swatches");
  if (!swatchContainer) return;

  renderSwatches(swatchContainer, "fill");
}

/** Render color swatches into a container for a given property. */
function renderSwatches(container, propName) {
  container.innerHTML = "";
  const currentFill = document.getElementById("prop-fill")?.value || "";

  // Build palette: recent colors + presets
  const palette = [...new Set([...recentColors, ...COLOR_PRESETS])].slice(0, 18);

  palette.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    if (color.toUpperCase() === currentFill.toUpperCase()) {
      swatch.className += " active";
    }
    swatch.style.background = color;
    // White border for very dark colors
    if (isColorDark(color)) {
      swatch.style.borderColor = "rgba(255,255,255,0.2)";
    }
    swatch.addEventListener("click", () => {
      const fillInput = document.getElementById("prop-fill");
      if (fillInput) {
        fillInput.value = color;
        fillInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      addRecentColor(color);
      renderSwatches(container, propName);
    });
    container.appendChild(swatch);
  });
}

/** Add a color to recent colors list. */
function addRecentColor(color) {
  const normalized = color.toUpperCase();
  const idx = recentColors.indexOf(normalized);
  if (idx >= 0) recentColors.splice(idx, 1);
  recentColors.unshift(normalized);
  if (recentColors.length > 6) recentColors.pop();
}

/** Check if a hex color is dark. */
function isColorDark(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}




// ─── Layer Visibility Toggle ──────────────────────────────────────────────────

/** Toggle node visibility in the canvas. Uses CSS opacity on render. */
function toggleNodeVisibility(nodeId) {
  if (hiddenNodes.has(nodeId)) {
    hiddenNodes.delete(nodeId);
  } else {
    hiddenNodes.add(nodeId);
  }
  // Set opacity on the node via the WASM API
  if (fdCanvas) {
    // Select the node temporarily to set its opacity
    const currentSelection = fdCanvas.get_selected_id();
    fdCanvas.select_by_id(nodeId);
    const opacity = hiddenNodes.has(nodeId) ? "0.15" : "1";
    fdCanvas.set_node_prop("opacity", opacity);
    // Restore previous selection
    if (currentSelection && currentSelection !== nodeId) {
      fdCanvas.select_by_id(currentSelection);
    } else if (!currentSelection) {
      fdCanvas.select_by_id("");
    }
    syncTextToExtension();
    render();
  }
  refreshLayersPanel();
}


// ─── Library Panel ───────────────────────────────────────────────────────

/** Library component data from extension host */
let libraryComponents = [];
let librarySearchQuery = "";

/** Toggle library panel visibility */
function toggleLibraryPanel() {
  const panel = document.getElementById("library-panel");
  if (!panel) return;
  const isVisible = panel.classList.toggle("visible");
  if (isVisible) {
    // Request library data from extension on first open
    vscode.postMessage({ type: "requestLibraries" });
    refreshLibraryPanel();
  }
}

/** Render library panel contents */
function refreshLibraryPanel() {
  const panel = document.getElementById("library-panel");
  if (!panel) return;

  let html = `<div class="lib-header">`;
  html += `<span class="lib-title">📦 Libraries</span>`;
  html += `<button class="lib-close" id="lib-close-btn" title="Close">×</button>`;
  html += `</div>`;
  html += `<input class="lib-search" id="lib-search" type="text" placeholder="Search components…" value="${escapeAttr(librarySearchQuery)}">`;

  if (libraryComponents.length === 0) {
    html += `<div class="lib-empty">`;
    html += `<div class="lib-empty-icon">📦</div>`;
    html += `<div>No libraries found</div>`;
    html += `<div style="margin-top:4px;opacity:0.6">Add .fd files to a <code>libraries/</code> folder</div>`;
    html += `</div>`;
    panel.innerHTML = html;
    wireLibraryHandlers(panel);
    return;
  }

  const query = librarySearchQuery.toLowerCase();

  for (const lib of libraryComponents) {
    const filtered = lib.components.filter(c =>
      !query || c.name.toLowerCase().includes(query) || c.kind.toLowerCase().includes(query)
    );
    if (filtered.length === 0) continue;

    html += `<div class="lib-group-label">${escapeHtml(lib.name)} (${filtered.length})</div>`;
    for (const comp of filtered) {
      const icon = comp.kind === "theme" ? "◆" : (comp.kind === "group" ? "◻" : LAYER_ICONS[comp.kind] || "•");
      html += `<div class="lib-component" data-lib-name="${escapeAttr(lib.name)}" data-comp-name="${escapeAttr(comp.name)}" data-comp-code="${escapeAttr(comp.code)}">`;
      html += `<span class="lib-icon">${icon}</span>`;
      html += `<span class="lib-name">${escapeHtml(comp.name)}</span>`;
      html += `<span class="lib-kind">${escapeHtml(comp.kind)}</span>`;
      html += `</div>`;
    }
  }

  panel.innerHTML = html;
  wireLibraryHandlers(panel);
}

/** Wire event handlers for library panel */
function wireLibraryHandlers(panel) {
  // Close button
  document.getElementById("lib-close-btn")?.addEventListener("click", () => {
    panel.classList.remove("visible");
    updateSettingsToggleStates();
  });

  // Search input
  document.getElementById("lib-search")?.addEventListener("input", (e) => {
    librarySearchQuery = e.target.value;
    refreshLibraryPanel();
    // Re-focus search input after re-render
    const searchInput = document.getElementById("lib-search");
    if (searchInput) {
      searchInput.focus();
      searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
    }
  });

  // Component click — insert into document
  panel.querySelectorAll(".lib-component").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = item.getAttribute("data-comp-code");
      if (!code || !fdCanvas) return;
      // Append component code to current document text
      const currentText = fdCanvas.get_text();
      const separator = currentText.endsWith("\n") ? "\n" : "\n\n";
      const newText = currentText + separator + code + "\n";
      fdCanvas.set_text(newText);
      bumpGeneration();
      render();
      syncTextToExtension();
      // Brief visual feedback
      item.style.background = "var(--fd-accent)";
      item.style.color = "var(--fd-accent-fg)";
      setTimeout(() => {
        item.style.background = "";
        item.style.color = "";
      }, 300);
    });
  });
}

// ─── Inline Text Editor ────────────────────────────────────────────────────

/** Inline textarea for editing text nodes and shape labels directly on canvas. */
let inlineEditorActive = false;

function setupInlineEditor() {
  canvas.addEventListener("dblclick", (e) => {
    if (!fdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    // Hit-test the scene to find the clicked node
    const nodeId = fdCanvas.get_selected_id();

    // If nothing selected, create a new text node at click position (Figma behavior)
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        render();
        syncTextToExtension();
        // Open inline editor on the newly created text node
        const newId = fdCanvas.get_selected_id();
        if (newId) {
          setTimeout(() => openInlineEditor(newId, "content", ""), 50);
        }
      }
      e.preventDefault();
      return;
    }

    // Get node props to know kind and current content
    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props.id) return;

    const isText = props.kind === "text";
    const isShape = props.kind === "rect" || props.kind === "ellipse";
    if (!isText && !isShape) return;

    const propKey = isText ? "content" : "label";
    const currentValue = isText ? (props.content || "") : (props.label || "");

    openInlineEditor(props.id, propKey, currentValue);
    e.preventDefault();
  });
}

/**
 * Compute relative luminance of a hex color for contrast calculation.
 * Returns 0 (black) to 1 (white).
 */
function hexLuminance(hex) {
  if (!hex || hex.length < 4) return 1;
  let r, g, b;
  if (hex.length <= 5) {
    // #RGB or #RGBA
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    // #RRGGBB or #RRGGBBAA
    r = parseInt(hex.slice(1, 3), 16) / 255;
    g = parseInt(hex.slice(3, 5), 16) / 255;
    b = parseInt(hex.slice(5, 7), 16) / 255;
  }
  // sRGB to linear
  const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Measure a text node's content and update its bounds via WASM.
 * Uses Canvas2D measureText() to get the tight bounding box,
 * then sends dimensions back to the engine. After updating,
 * calls finalize_bounds() so parent containers can expand.
 * Returns true if bounds changed.
 */
function measureAndUpdateTextBounds(nodeId) {
  if (!fdCanvas) return false;

  // Get the text content from the node's properties
  const propsJson = fdCanvas.get_node_props(nodeId);
  if (!propsJson) return false;

  let props;
  try { props = JSON.parse(propsJson); } catch (_) { return false; }

  const text = props.text || "";
  if (!text) return false;

  // Extract font properties
  const fontSize = props.fontSize || 14;
  const fontFamily = props.fontFamily || "Inter, system-ui, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const maxWidth = props.maxWidth || null;

  // Measure using the off-screen canvas
  const measureCtx = canvas.getContext("2d");
  measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  let measuredWidth;
  let measuredHeight;
  const lineHeight = fontSize * 1.2;

  if (maxWidth) {
    // Word-wrap measurement: split text into lines that fit within maxWidth
    const paragraphs = text.split("\n");
    let totalLines = 0;
    let maxLineWidth = 0;
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) {
        totalLines++;
        continue;
      }
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = measureCtx.measureText(testLine).width;
        if (currentLine && testWidth > maxWidth) {
          maxLineWidth = Math.max(maxLineWidth, measureCtx.measureText(currentLine).width);
          totalLines++;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        maxLineWidth = Math.max(maxLineWidth, measureCtx.measureText(currentLine).width);
        totalLines++;
      }
    }
    measuredWidth = maxWidth; // Width stays at maxWidth
    measuredHeight = Math.max(totalLines * lineHeight, lineHeight);
  } else {
  // Single-line measurement (original behavior)
    const metrics = measureCtx.measureText(text);
    measuredWidth = metrics.width;
    // Use precise glyph metrics when available, but ensure height is at least
    // fontSize * 1.2 to match the renderer's effective line height.
    const rawGlyphHeight = (metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null)
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : lineHeight;
    measuredHeight = Math.max(rawGlyphHeight, lineHeight);
  }

  // Send measured dimensions to WASM
  const changed = fdCanvas.update_text_metrics(nodeId, measuredWidth, measuredHeight);
  if (changed) {
    // Cascade parent expansion
    fdCanvas.finalize_bounds();
    return true;
  }
  return false;
}

/**
 * Measure all text nodes in the document and update their bounds.
 * Called after set_text() to ensure all text nodes have tight bounds.
 */
function measureAllTextNodes() {
  if (!fdCanvas) return;
  const text = fdCanvas.get_text();
  // Find all text node IDs
  const textIdRe = /text\s+@(\w+)\s+"/g;
  let match;
  let anyChanged = false;
  while ((match = textIdRe.exec(text)) !== null) {
    if (measureAndUpdateTextBounds(match[1])) {
      anyChanged = true;
    }
  }
  if (anyChanged) {
    render();
  }
}

/**
 * Show a floating textarea over the node for in-place text editing.
 */
function openInlineEditor(nodeId, propKey, currentValue) {
  if (inlineEditorActive) return;

  // Force-measure text bounds BEFORE reading them — ensures the bounds
  // reflect the actual rendered text size, not a stale intrinsic_size heuristic.
  // This fixes both "double-click shape jump" and "editing vs non-editing mismatch".
  measureAndUpdateTextBounds(nodeId);

  const boundsJson = fdCanvas.get_node_bounds(nodeId);
  const b = JSON.parse(boundsJson);
  // Use minimum size for zero-width nodes (e.g. new text nodes)
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;

  const container = document.getElementById("canvas-container");

  // Read node fill color for background matching
  fdCanvas.select_by_id(nodeId);
  // Clear press animation state to prevent visual shape jump on dblclick
  fdCanvas.clear_pressed();
  // Render to show correct bounds before textarea overlay appears
  render();
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

  // Get font info FIRST — needed for height calculation.
  // Compute lineHeight from unscaled font size first, then scale — this
  // matches how Canvas2D's draw_text() computes line_height = size * 1.2.
  const rawFontSize = props.fontSize || 14;
  const fontSize = Math.round(rawFontSize * zoomLevel);
  const fontFamily = props.fontFamily || "Inter, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const lineHeight = Math.round(rawFontSize * 1.2 * zoomLevel);

  // Convert scene-space bounds to screen-space
  const sx = (b.x || 0) * zoomLevel + panX;
  const sy = (b.y || 0) * zoomLevel + panY;
  const sw = Math.max(bw * zoomLevel, 80);
  // Use actual bounds height — correctly sized for wrapped text
  const sh = Math.max(bh * zoomLevel, lineHeight + 4);

  // Determine background & text color based on node kind
  let bgColor;
  let textColor;
  const isDark = document.body.classList.contains("dark-theme");
  const isTextNode = props.kind === "text";

  if (isTextNode) {
    // Text node: fill = text color, not background
    // Use themed background, and the node's fill as text color
    bgColor = "transparent";
    textColor = props.fill || (isDark ? "#E0E0E0" : "#1C1C1E");
  } else if (props.fill) {
  // Shape node with fill: use as background
    bgColor = props.fill;
    const lum = hexLuminance(props.fill);
    textColor = lum < 0.4 ? "#FFFFFF" : "#1C1C1E";
  } else {
    // Shape without fill: themed fallback
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#E0E0E0" : "#1C1C1E";
  }

  // Get text alignment — WASM API returns effective defaults (left/top for
  // standalone text, center/middle for text-in-shape)
  const hAlign = props.textAlign || "left";
  const vAlign = props.textVAlign || "top";

  // Store original value for Esc rollback
  const originalValue = currentValue;

  // Vertical padding: match Canvas2D text_baseline positioning exactly.
  // draw_text() uses:
  //   top    → text_baseline="top",    y = b.y + 2.0
  //   middle → text_baseline="middle", y = b.y + h/2
  //   bottom → text_baseline="bottom", y = b.y + h - 2.0
  // Since we use outline (not border), the textarea content area == node bounds.
  const topOffset = Math.round(2 * zoomLevel);
  let padTop = 0;
  let padBottom = 0;
  if (vAlign === "top") {
    padTop = topOffset;
  } else if (vAlign === "middle") {
  // CSS vertical centering via equal top/bottom padding
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, Math.round((sh - textHeight) / 2));
    padBottom = padTop;
  } else if (vAlign === "bottom") {
    padBottom = topOffset;
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, sh - textHeight - padBottom);
  }

  // Horizontal padding: match Canvas2D x-position within the bounds.
  // draw_text() uses:
  //   left   → x = b.x
  //   center → x = b.x + b.width/2  (text-align:center handles this)
  //   right  → x = b.x + b.width    (text-align:right handles this)
  // CSS text-align handles the horizontal positioning, so no extra padding needed.
  const padLeft = 0;
  const padRight = 0;

  // Compute border-radius matching the node's actual shape
  let borderRadius = "8px";
  if (props.kind === "ellipse") {
    borderRadius = "50%";
  } else if (props.kind === "rect" || props.kind === "frame") {
    const cr = props.cornerRadius !== undefined ? Math.round(props.cornerRadius * zoomLevel) : 0;
    borderRadius = `${cr}px`;
  } else if (isTextNode) {
    borderRadius = "0";
  }

  // Text nodes: minimal Apple Preview-style editor (thin border, no shadow)
  // Shape nodes: retain visible overlay for contrast against shape fill
  const outlineStyle = isTextNode ? "1px solid #4FC3F7" : "2px solid #4FC3F7";
  const boxShadow = isTextNode ? "none" : "0 2px 8px rgba(0,0,0,0.12)";

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`,
    `top:${sy}px`,
    `width:${sw}px`,
    `height:${sh}px`,
    `padding:${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`,
    `font:${fontWeight} ${fontSize}px ${fontFamily}`,
    `border:none`,
    `outline:${outlineStyle}`,
    `outline-offset:-1px`,
    `border-radius:${borderRadius}`,
    `background:${bgColor}`,
    `color:${textColor}`,
    `resize:none`,
    `z-index:100`,
    `box-shadow:${boxShadow}`,
    `line-height:${lineHeight}px`,
    `overflow:hidden`,
    `text-align:${hAlign}`,
    `box-sizing:border-box`,
    `-webkit-text-size-adjust:100%`,
    `word-wrap:break-word`,
    `white-space:pre-wrap`,
    `overflow-wrap:break-word`,
  ].join(";");

  container.appendChild(textarea);
  textarea.focus();
  textarea.select();

  /** Live-sync text to Code Mode on every keystroke */
  let lastSyncedValue = currentValue;
  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    render();
    syncTextToExtension();
  });

  /** Commit: close editor, set final prop, sync */
  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;
    // Skip mutation if value unchanged — avoids SetStyle flattening inherited styles
    if (newVal === originalValue) {
      render();
      return;
    }
    // Re-select and set final value (in case of any race)
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      // Measure text content and update bounds for intrinsic sizing
      if (propKey === "content" || propKey === "label") {
        measureAndUpdateTextBounds(nodeId);
      }
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Cancel: revert to original value
      inlineEditorActive = false;
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      // Restore original text in the node
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, originalValue);
      render();
      syncTextToExtension();
      e.stopPropagation();
      return;
    }
    // Shift+Enter = newline; plain Enter = commit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  });

  // Delay blur→commit to avoid premature removal from focus-stealing
  textarea.addEventListener("blur", () => {
    setTimeout(commit, 150);
  });
}

// ─── Dimension Tooltip (R3.18) ────────────────────────────────────────────────

/** Module-level drag state (shared with pointer.js document listeners) */
let dtcTool = null;
let dtcActive = false;
let ftDragging = false;   // true while toolbar is being dragged

/** Show a floating dimension tooltip near the cursor. */
function showDimensionTooltip(clientX, clientY, text) {
  const el = document.getElementById("dimension-tooltip");
  if (!el) return;
  const container = document.getElementById("canvas-container");
  const containerRect = container.getBoundingClientRect();
  el.textContent = text;
  el.style.display = "block";
  // Position slightly below and right of cursor
  el.style.left = (clientX - containerRect.left + 12) + "px";
  el.style.top = (clientY - containerRect.top + 18) + "px";
}

/** Hide the dimension tooltip. */
function hideDimensionTooltip() {
  const el = document.getElementById("dimension-tooltip");
  if (el) el.style.display = "none";
}



// ─── Zoom Helpers ─────────────────────────────────────────────────────────────

/** Zoom by a multiplier, centered on the canvas middle. */
function zoomBy(factor) {
  const container = document.getElementById("canvas-container");
  const cx = container.clientWidth / 2;
  const cy = container.clientHeight / 2;
  zoomAtPoint(cx, cy, factor);
}

/** Zoom by a multiplier, anchored at a screen-space point (mx, my). */
function zoomAtPoint(mx, my, factor) {
  const oldZoom = zoomLevel;
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * factor));
  // Adjust pan so the point under the cursor stays fixed
  panX = mx - (mx - panX) * (zoomLevel / oldZoom);
  panY = my - (my - panY) * (zoomLevel / oldZoom);
  render();
  updateZoomIndicator();
}

/** Zoom to fit all nodes in the viewport with padding. */
/** Get the width of the layers panel overlay to offset viewport centering. */
function getLayersPanelWidth() {
  const panel = document.getElementById("layers-panel");
  return panel ? panel.offsetWidth : 0;
}

function zoomToFit() {
  if (!fdCanvas) return;
  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const panelW = getLayersPanelWidth();

  // Usable viewport = full width minus the layers panel overlay
  const usableW = cw - panelW;

  // Get all node bounds from the WASM engine
  const text = fdCanvas.get_text();
  if (!text || text.trim().length === 0) {
    // Empty document — reset to 100%, offset by panel
    zoomLevel = 1;
    panX = panelW;
    panY = 0;
    render();
    updateZoomIndicator();
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let foundAny = false;

  const nodeIdPattern = /@(\w+)/g;
  let match;
  const seenIds = new Set();
  while ((match = nodeIdPattern.exec(text)) !== null) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    try {
      const boundsJson = fdCanvas.get_node_bounds(id);
      const b = JSON.parse(boundsJson);
      if (b.width && b.width > 0) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        foundAny = true;
      }
    } catch (_) { /* skip */ }
  }

  if (!foundAny) {
    zoomLevel = 1;
    panX = panelW;
    panY = 0;
  } else {
    const padding = 40;
    const sceneW = maxX - minX;
    const sceneH = maxY - minY;
    const fitZoom = Math.min(
      (usableW - padding * 2) / Math.max(sceneW, 1),
      (ch - padding * 2) / Math.max(sceneH, 1)
    );
    const FIT_ZOOM_MAX = 2.0; // Cap fit-zoom at 200% so small designs don't blow up
    zoomLevel = Math.max(ZOOM_MIN, Math.min(FIT_ZOOM_MAX, fitZoom));
    // Center the scene in the usable area (right of layers panel)
    panX = panelW + (usableW - sceneW * zoomLevel) / 2 - minX * zoomLevel;
    panY = (ch - sceneH * zoomLevel) / 2 - minY * zoomLevel;
  }

  render();
  updateZoomIndicator();
}

/** Update the zoom level indicator in both toolbar and bottom-left controls. */
function updateZoomIndicator() {
  const pct = Math.round(zoomLevel * 100) + "%";
  const el = document.getElementById("zoom-level");
  if (el) el.textContent = pct;
  const blEl = document.getElementById("zoom-reset-btn");
  if (blEl) blEl.textContent = pct;
}

function setupZoomIndicator() {
  const el = document.getElementById("zoom-level");
  if (el) {
    el.addEventListener("click", () => {
      resetZoomToCenter();
    });
  }
}

/** Reset zoom to 100% centered on current viewport center. */
function resetZoomToCenter() {
  const container = document.getElementById("canvas-container");
  const cx = container.clientWidth / 2;
  const cy = container.clientHeight / 2;
  const oldZoom = zoomLevel;
  zoomLevel = 1.0;
  panX = cx - (cx - panX) * (1.0 / oldZoom);
  panY = cy - (cy - panY) * (1.0 / oldZoom);
  render();
  updateZoomIndicator();
}

/** Set up zoom controls inside the minimap overlay (Google Maps-style). */
function setupZoomControls() {
  const zoomIn = document.getElementById("zoom-in-btn");
  const zoomOut = document.getElementById("zoom-out-btn");
  const zoomReset = document.getElementById("zoom-reset-btn");

  // Prevent zoom button clicks from bubbling to minimap pan handler
  const zoomContainer = document.getElementById("minimap-zoom-controls");
  if (zoomContainer) {
    zoomContainer.addEventListener("pointerdown", (e) => e.stopPropagation());
    zoomContainer.addEventListener("pointermove", (e) => e.stopPropagation());
    zoomContainer.addEventListener("pointerup", (e) => e.stopPropagation());
  }

  if (zoomIn) {
    zoomIn.addEventListener("click", (e) => {
      e.stopPropagation();
      const container = document.getElementById("canvas-container");
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const oldZoom = zoomLevel;
      zoomLevel = Math.min(ZOOM_MAX, zoomLevel * 1.25);
      panX = cx - (cx - panX) * (zoomLevel / oldZoom);
      panY = cy - (cy - panY) * (zoomLevel / oldZoom);
      render();
      updateZoomIndicator();
    });
  }

  if (zoomOut) {
    zoomOut.addEventListener("click", (e) => {
      e.stopPropagation();
      const container = document.getElementById("canvas-container");
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const oldZoom = zoomLevel;
      zoomLevel = Math.max(ZOOM_MIN, zoomLevel / 1.25);
      panX = cx - (cx - panX) * (zoomLevel / oldZoom);
      panY = cy - (cy - panY) * (zoomLevel / oldZoom);
      render();
      updateZoomIndicator();
    });
  }

  if (zoomReset) {
    zoomReset.addEventListener("click", (e) => {
      e.stopPropagation();
      resetZoomToCenter();
    });
  }
}

/** Set up bottom-left undo/redo buttons (Excalidraw-style). */
function setupUndoRedoControls() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("z", false, false, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) {
        render();
        syncTextToExtension();
      }
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("z", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) {
        render();
        syncTextToExtension();
      }
    });
  }
}

/** Set up settings hamburger menu (☰). */
function setupSettingsMenu() {
  const btn = document.getElementById("settings-menu-btn");
  const menu = document.getElementById("settings-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("visible");
    updateSettingsToggleStates();
  });

  // Grid toggle
  document.getElementById("sm-grid-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleGrid();
    updateSettingsToggleStates();
  });

  // Spec badges toggle
  document.getElementById("sm-spec-badge-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleSpecBadges();
    updateSettingsToggleStates();
  });

  // Library panel toggle
  document.getElementById("sm-library-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLibraryPanel();
    updateSettingsToggleStates();
  });

  // Sketchy mode toggle
  document.getElementById("sm-sketchy-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!fdCanvas) return;
    const enabled = !fdCanvas.get_sketchy_mode();
    fdCanvas.set_sketchy_mode(enabled);
    const sketchyBtn = document.getElementById("sketchy-toggle-btn");
    if (sketchyBtn) sketchyBtn.classList.toggle("active", enabled);
    vscode.setState({ ...(vscode.getState() || {}), sketchyMode: enabled });
    render();
    updateSettingsToggleStates();
  });

  // Theme toggle
  document.getElementById("sm-theme-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    isDarkTheme = !isDarkTheme;
    applyTheme(isDarkTheme);
    vscode.setState({ ...(vscode.getState() || {}), darkTheme: isDarkTheme });
    updateSettingsToggleStates();
  });

  // Export actions
  menu.querySelectorAll(".settings-menu-item[data-export]").forEach(item => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      menu.classList.remove("visible");
      const action = item.dataset.export;
      switch (action) {
        case "png-clip": await copySelectionAsPng(); break;
        case "png-file": exportToPng(); break;
        case "svg-file": exportToSvg(); break;
        case "fd-clip":
          copySelectedAsFd();
          vscode.postMessage({ type: "info", text: "Copied .fd text to clipboard!" });
          break;
      }
    });
  });

  // Shortcuts
  document.getElementById("sm-shortcuts")?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.remove("visible");
    toggleShortcutHelp();
  });

  // Close when clicking outside
  document.addEventListener("pointerdown", (e) => {
    if (menu.classList.contains("visible") && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("visible");
    }
  });
}

/** Update toggle-on class for settings menu items. */
function updateSettingsToggleStates() {
  const gridItem = document.getElementById("sm-grid-toggle");
  const specItem = document.getElementById("sm-spec-badge-toggle");
  const sketchyItem = document.getElementById("sm-sketchy-toggle");
  const themeItem = document.getElementById("sm-theme-toggle");
  if (gridItem) gridItem.classList.toggle("toggle-on", gridEnabled);
  if (specItem) specItem.classList.toggle("toggle-on", specBadgesVisible);
  if (sketchyItem) sketchyItem.classList.toggle("toggle-on", fdCanvas ? fdCanvas.get_sketchy_mode() : false);
  if (themeItem) themeItem.classList.toggle("toggle-on", isDarkTheme);
  const libItem = document.getElementById("sm-library-toggle");
  const libPanel = document.getElementById("library-panel");
  if (libItem) libItem.classList.toggle("toggle-on", libPanel && libPanel.classList.contains("visible"));
}

/** Set up floating toolbar drag handle (move between top and bottom). */
/** Set up floating toolbar drag handle and roll animation. */
function setupFloatingToolbar() {
  const toolbar = document.getElementById("floating-toolbar");
  if (!toolbar) return;

  // Restore persisted state
  const savedState = vscode.getState() || {};
  if (savedState.ftRolledUp) {
    toolbar.classList.add("rolled-up");
  } else {
    toolbar.classList.add("unrolled");
  }

  // Restore orientation and position
  const orientation = savedState.ftOrientation || "horizontal";
  toolbar.classList.remove("horizontal", "vertical");
  toolbar.classList.add(orientation);

  if (savedState.ftPosition) {
    toolbar.style.left = savedState.ftPosition.left || "auto";
    toolbar.style.right = savedState.ftPosition.right || "auto";
    toolbar.style.top = savedState.ftPosition.top || "auto";
    toolbar.style.bottom = savedState.ftPosition.bottom || "auto";
  }

  function updateRollWidths() {
    const buttons = Array.from(toolbar.querySelectorAll(".ft-tool-btn"));
    const activeIndex = buttons.findIndex(btn => btn.classList.contains("active"));
    const total = buttons.length;

    // Limits
    const minW = 12;
    const maxW = 26;

    if (activeIndex === -1 || total < 2) {
      toolbar.style.setProperty("--left-roll-width", "18px");
      toolbar.style.setProperty("--right-roll-width", "18px");
      return;
    }

    const prop = activeIndex / (total - 1);
    const leftW = minW + (prop * (maxW - minW));
    const rightW = minW + ((1 - prop) * (maxW - minW));

    toolbar.style.setProperty("--left-roll-width", `${leftW}px`);
    toolbar.style.setProperty("--right-roll-width", `${rightW}px`);
  }

  // Check roll initially
  if (savedState.ftRolledUp) {
    updateRollWidths();
  }

  // Observe active class to update asymmetric roll
  const observer = new MutationObserver(() => {
    if (toolbar.classList.contains("rolled-up")) {
      updateRollWidths();
    }
  });
  toolbar.querySelectorAll(".ft-tool-btn").forEach(btn => {
    observer.observe(btn, { attributes: true, attributeFilter: ["class"] });
  });

  // ftDragging is declared at module scope (above) so
  // pointer.js document-level listeners can check for active toolbar drags
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTime = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let activePointerId = -1;

  /** Compute snap target using closest-edge comparison */
  function computeSnap(projX, projY) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const tbW = toolbar.offsetWidth;
    const tbH = toolbar.offsetHeight;
    const panelW = getLayersPanelWidth();

    // Distance from each edge of the projected toolbar to the viewport edge
    const dTop = projY;
    const dBottom = viewH - (projY + tbH);
    const dLeft = projX - panelW; // account for layers panel
    const dRight = viewW - (projX + tbW);

    // Find the closest edge
    const edges = [
      { edge: "top", dist: dTop },
      { edge: "bottom", dist: dBottom },
      { edge: "left", dist: dLeft },
      { edge: "right", dist: dRight },
    ];
    edges.sort((a, b) => a.dist - b.dist);
    return edges[0].edge;
  }

  /** Compute the exact landing position for each snap edge */
  function getSnapPosition(edge, projX, projY) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const container = document.getElementById("canvas-container");
    const cr = container.getBoundingClientRect();
    const panelW = getLayersPanelWidth();
    // Toolbar dimensions (approximate for the snapped orientation)
    const tbW = toolbar.offsetWidth;
    const tbH = toolbar.offsetHeight;

    if (edge === "top") {
      // Horizontal at top: left based on drag X, clamped
      const left = Math.max(panelW + 8, Math.min(projX, viewW - tbW - 8)) - cr.left;
      return { left: left + "px", top: "8px", width: tbW + "px", height: tbH + "px" };
    }
    if (edge === "bottom") {
      const left = Math.max(panelW + 8, Math.min(projX, viewW - tbW - 8)) - cr.left;
      return { left: left + "px", bottom: "8px", width: tbW + "px", height: tbH + "px" };
    }
    if (edge === "left") {
      // Vertical on left: after layers panel
      const leftPx = panelW + 8 - cr.left;
      const top = Math.max(8, Math.min(projY - cr.top, cr.height - tbW - 8));
      return { left: Math.max(0, leftPx) + "px", top: top + "px", width: tbH + "px", height: tbW + "px" };
    }
    // right
    const top = Math.max(8, Math.min(projY - cr.top, cr.height - tbW - 8));
    return { right: "8px", top: top + "px", width: tbH + "px", height: tbW + "px" };
  }

  /** Show snap guide as a ghost rectangle at the exact landing position */
  function showSnapGuide(edge, projX, projY) {
    let guide = document.getElementById("ft-snap-guide");
    if (!guide) {
      guide = document.createElement("div");
      guide.id = "ft-snap-guide";
      document.getElementById("canvas-container").appendChild(guide);
    }
    const pos = getSnapPosition(edge, projX, projY);
    guide.style.cssText = "position:absolute;pointer-events:none;z-index:9999;";
    guide.style.left = pos.left || "auto";
    guide.style.right = pos.right || "auto";
    guide.style.top = pos.top || "auto";
    guide.style.bottom = pos.bottom || "auto";
    guide.style.width = pos.width;
    guide.style.height = pos.height;
    guide.style.border = "2px dashed var(--fd-accent, #4FC3F7)";
    guide.style.borderRadius = "10px";
    guide.style.opacity = "0.6";
    guide.style.display = "block";
  }

  /** Hide the snap guide overlay */
  function hideSnapGuide() {
    const guide = document.getElementById("ft-snap-guide");
    if (guide) guide.style.display = "none";
  }

  // Document-level listeners for toolbar drag
  document.addEventListener("pointermove", (e) => {
    if (!ftDragging || e.pointerId !== activePointerId) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    // Drag visual: apply translate + lift effect (no position change)
    toolbar.style.transition = "none";
    toolbar.style.transform = `translate(${dx}px, ${dy}px)`;
    toolbar.style.boxShadow = "0 8px 32px rgba(0,0,0,0.25)";
    toolbar.style.opacity = "0.92";

    // Show snap guide preview
    const projX = initialLeft + dx;
    const projY = initialTop + dy;
    const edge = computeSnap(projX, projY);
    showSnapGuide(edge, projX, projY);
  });

  document.addEventListener("pointerup", (e) => {
    if (!ftDragging || e.pointerId !== activePointerId) return;
    ftDragging = false;
    activePointerId = -1;
    hideSnapGuide();

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const timeElapsed = Date.now() - dragStartTime;

    toolbar.style.transform = "";
    toolbar.style.transition = "";
    toolbar.style.boxShadow = "";
    toolbar.style.opacity = "";

    // Handle Click (Roll/Unroll)
    if (dist < 5 && timeElapsed < 300) {
      const isRolled = toolbar.classList.toggle("rolled-up");
      toolbar.classList.toggle("unrolled", !isRolled);
      vscode.setState({ ...(vscode.getState() || {}), ftRolledUp: isRolled });
      if (isRolled) updateRollWidths();
      return;
    }

    // Commit final position — normalize to px now (not on pointerdown)
    const finalX = initialLeft + dx;
    const finalY = initialTop + dy;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const edge = computeSnap(finalX, finalY);

    let newPos = {};
    let newOrientation = "horizontal";

    if (edge === "right") {
      newOrientation = "vertical";
      newPos = { right: "2vw", top: Math.max(2, (finalY / viewH) * 100) + "vh" };
    } else if (edge === "left") {
      newOrientation = "vertical";
      newPos = { left: "calc(232px + 2vw)", top: Math.max(2, (finalY / viewH) * 100) + "vh" };
    } else if (edge === "top") {
      newOrientation = "horizontal";
      newPos = { top: "2vh", left: Math.max(2, (finalX / viewW) * 100) + "vw" };
    } else {
      newOrientation = "horizontal";
      newPos = { bottom: "1.5vh", left: Math.max(2, (finalX / viewW) * 100) + "vw" };
    }

    toolbar.classList.remove("horizontal", "vertical");
    toolbar.classList.add(newOrientation);

    toolbar.style.left = newPos.left || "auto";
    toolbar.style.right = newPos.right || "auto";
    toolbar.style.top = newPos.top || "auto";
    toolbar.style.bottom = newPos.bottom || "auto";

    vscode.setState({ ...(vscode.getState() || {}), ftPosition: newPos, ftOrientation: newOrientation });

    if (toolbar.classList.contains("rolled-up")) {
      updateRollWidths();
    }
  });

  // Allow drag from anywhere on the toolbar except tool buttons
  // (tool buttons have their own pointerdown for drag-to-create)
  toolbar.addEventListener("pointerdown", (e) => {
    // Skip if target is a tool button or inside one (handled by drag-to-create)
    if (e.target.closest(".ft-tool-btn")) return;

    activePointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTime = Date.now();

    // Record initial position WITHOUT modifying CSS — avoids jump on click
    const rect = toolbar.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Set ftDragging AFTER recording initial state
    ftDragging = true;

    e.preventDefault();
    e.stopPropagation();
  });

  // ── Drag-to-Create: drag a tool button onto the canvas ──
  const DRAG_THRESHOLD = 5;
  // dtcTool and dtcActive are declared at module scope (above) so
  // pointer.js document-level listeners can check for active toolbar drags
  let dtcStartX = 0;
  let dtcStartY = 0;
  let dtcGhost = null;
  let dtcCancelled = false; // true when pointer re-enters toolbar
  let dtcGuideOverlay = null; // SVG overlay for alignment guides

  const ghostShapes = {
    rect: { w: 120, h: 80, css: "border-radius:8px;" },
    ellipse: { w: 100, h: 100, css: "border-radius:50%;" },
    pen: { w: 80, h: 60, css: "border-radius:4px;" },
    arrow: { w: 120, h: 2, css: "" },
    text: { w: 60, h: 28, css: "border-radius:4px;" },
    frame: { w: 140, h: 100, css: "border-radius:4px;" },
  };

  function createGhost(tool) {
    const shape = ghostShapes[tool] || ghostShapes.rect;
    const el = document.createElement("div");
    el.className = "dtc-ghost";
    const isDark = document.body.classList.contains("dark-theme");
    const borderColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(51,51,51,0.5)";
    const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(51,51,51,0.06)";
    let content = "";
    if (tool === "text") {
      content = `<span style="font-size:14px;color:${borderColor};font-weight:500;">T</span>`;
    }
    if (tool === "arrow") {
      // Diagonal line ghost
      el.style.cssText = `
        position:fixed;pointer-events:none;z-index:10000;
        width:${shape.w}px;height:${shape.w}px;
        transform:translate(-50%,-50%);
        opacity:0.7;
      `;
      el.innerHTML = `<svg width="${shape.w}" height="${shape.w}" viewBox="0 0 ${shape.w} ${shape.w}" fill="none">
        <line x1="10" y1="${shape.w - 10}" x2="${shape.w - 10}" y2="10"
          stroke="${borderColor}" stroke-width="2" stroke-dasharray="6 4"/>
        <path d="M${shape.w - 30},10 L${shape.w - 10},10 L${shape.w - 10},30"
          stroke="${borderColor}" stroke-width="2" fill="none"/>
      </svg>`;
    } else {
      el.style.cssText = `
        position:fixed;pointer-events:none;z-index:10000;
        width:${shape.w}px;height:${shape.h}px;
        border:2px dashed ${borderColor};
        background:${bg};
        ${shape.css}
        transform:translate(-50%,-50%);
        display:flex;align-items:center;justify-content:center;
        opacity:0.7;
        box-shadow:0 2px 12px rgba(0,0,0,0.08);
      `;
      el.innerHTML = content;
    }
    document.body.appendChild(el);
    return el;
  }

  function moveGhost(el, x, y) {
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  function removeGhost() {
    if (dtcGhost) { dtcGhost.remove(); dtcGhost = null; }
  }

  // Track which button initiated the drag for click suppression
  let dtcBtn = null;

  // Attach pointerdown to each tool button (except select)
  toolbar.querySelectorAll(".ft-tool-btn[data-tool]").forEach((btn) => {
    const tool = btn.getAttribute("data-tool");
    if (tool === "select") return;

    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); // Prevent scroll-handle drag from activating
      e.preventDefault();  // Prevent native drag on SVG icons — critical for dtc
      dtcTool = tool;
      dtcBtn = btn;
      dtcStartX = e.clientX;
      dtcStartY = e.clientY;
      dtcActive = false;

    });

    // Suppress click after drag-to-create
    btn.addEventListener("click", (e) => {
      if (btn._dtcSuppressClick) {
        btn._dtcSuppressClick = false;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  });

  // Document-level listeners for drag-to-create
  document.addEventListener("pointermove", (e) => {
    if (!dtcTool) return;
    const dx = e.clientX - dtcStartX;
    const dy = e.clientY - dtcStartY;
    if (!dtcActive && (dx * dx + dy * dy) >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
      dtcActive = true;
      dtcCancelled = false;
      dtcGhost = createGhost(dtcTool);
    }
    if (dtcActive) {
      // ── Cancel/re-drag: detect pointer over toolbar ──
      const tbRect = toolbar.getBoundingClientRect();
      const overToolbar = e.clientX >= tbRect.left && e.clientX <= tbRect.right
        && e.clientY >= tbRect.top && e.clientY <= tbRect.bottom;
      if (overToolbar && !dtcCancelled) {
        // Pointer re-entered toolbar → cancel
        dtcCancelled = true;
        removeGhost();
        removeDtcGuideOverlay();
      } else if (!overToolbar && dtcCancelled) {
        // Pointer left toolbar again → re-activate
        dtcCancelled = false;
        dtcGhost = createGhost(dtcTool);
      }

      if (!dtcCancelled && dtcGhost) {
        moveGhost(dtcGhost, e.clientX, e.clientY);

        // ── Alignment guides via WASM ──
        const canvasEl = document.getElementById("fd-canvas");
        if (canvasEl && fdCanvas) {
          const cRect = canvasEl.getBoundingClientRect();
          const sceneX = ((e.clientX - cRect.left) - panX) / zoomLevel;
          const sceneY = ((e.clientY - cRect.top) - panY) / zoomLevel;
          const shape = ghostShapes[dtcTool] || ghostShapes.rect;
          const gw = shape.w / zoomLevel;
          const gh = shape.h / zoomLevel;
          // Center the hypothetical shape at cursor
          const gx = sceneX - gw / 2;
          const gy = sceneY - gh / 2;
          try {
            const guidesJson = fdCanvas.compute_guides_for_rect(gx, gy, gw, gh);
            const guides = JSON.parse(guidesJson);
            renderDtcGuideOverlay(guides, canvasEl);
          } catch (_) {
            removeDtcGuideOverlay();
          }
        }
      }
    }
  });

  document.addEventListener("pointerup", (e) => {
    if (!dtcTool) return;

    if (dtcActive && !dtcCancelled) {
      // Drag-to-create: check if drop is over the canvas
      removeGhost();
      removeDtcGuideOverlay();
      const canvasEl = document.getElementById("fd-canvas");
      if (canvasEl && fdCanvas) {
        const rect = canvasEl.getBoundingClientRect();
        const cx = e.clientX;
        const cy = e.clientY;
        if (cx >= rect.left && cx <= rect.right
          && cy >= rect.top && cy <= rect.bottom) {
          const rawX = ((cx - rect.left) - panX) / zoomLevel;
          const rawY = ((cy - rect.top) - panY) / zoomLevel;

          // ── Text drop-to-consume: text on shape or edge ──
          if (dtcTool === "text") {
            const consumed = dtcTextConsume(rawX, rawY, cx, cy, rect);
            if (consumed) {
              dtcActive = false;
              dtcCancelled = false;
              dtcTool = null;
              if (dtcBtn) dtcBtn._dtcSuppressClick = true;
              dtcBtn = null;
              return;
            }
          }

          // ── Snap-to-node detection (non-text tools) ──
          const snap = dtcFindSnapTarget(rawX, rawY, dtcTool);
          const sceneX = snap ? snap.x : rawX;
          const sceneY = snap ? snap.y : rawY;

          const created = fdCanvas.create_node_at(dtcTool, sceneX, sceneY);
          if (created) {
            lastDrawingTool = dtcTool;
            applyDefaultsToNewNode(dtcTool);
            bumpGeneration();

            // ── Auto-create edge if snapped ──
            if (snap && snap.targetId) {
              const newNodeId = fdCanvas.get_selected_id();
              if (newNodeId) {
                const edgeId = fdCanvas.create_edge(snap.targetId, newNodeId);
                if (edgeId) {
                  bumpGeneration();
                  const midSX = (cx + ((snap.targetCx * zoomLevel + panX) + rect.left)) / 2;
                  const midSY = (cy + ((snap.targetCy * zoomLevel + panY) + rect.top)) / 2;
                  showEdgeContextMenu(edgeId, midSX, midSY);
                }
              }
            }

            render();
            syncTextToExtension();
            updatePropertiesPanel();
          }
        }
      }
      dtcActive = false;
      dtcCancelled = false;
      dtcTool = null;
      if (dtcBtn) dtcBtn._dtcSuppressClick = true;
      dtcBtn = null;
    } else {
      // Cancelled or no drag — clean up
      removeGhost();
      removeDtcGuideOverlay();
      dtcActive = false;
      dtcCancelled = false;
      dtcTool = null;
      dtcBtn = null;
    }
  });

  document.addEventListener("pointercancel", () => {
    if (!dtcTool) return;
    removeGhost();
    removeDtcGuideOverlay();
    dtcActive = false;
    dtcCancelled = false;
    dtcTool = null;
    dtcBtn = null;
  });

  // ── Alignment guide overlay for drag-to-create ──
  function renderDtcGuideOverlay(guides, canvasEl) {
    if (!guides || guides.length === 0) { removeDtcGuideOverlay(); return; }
    const cRect = canvasEl.getBoundingClientRect();
    if (!dtcGuideOverlay) {
      dtcGuideOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      dtcGuideOverlay.style.cssText = `
        position:fixed;pointer-events:none;z-index:9999;
        left:${cRect.left}px;top:${cRect.top}px;
        width:${cRect.width}px;height:${cRect.height}px;
      `;
      document.body.appendChild(dtcGuideOverlay);
    }
    // Update position/size
    dtcGuideOverlay.style.left = cRect.left + "px";
    dtcGuideOverlay.style.top = cRect.top + "px";
    dtcGuideOverlay.style.width = cRect.width + "px";
    dtcGuideOverlay.style.height = cRect.height + "px";
    dtcGuideOverlay.setAttribute("viewBox",
      `0 0 ${cRect.width / zoomLevel} ${cRect.height / zoomLevel}`);

    // Transform from scene-space to viewport-space
    const ox = panX / zoomLevel;
    const oy = panY / zoomLevel;
    let inner = `<g transform="translate(${ox},${oy})">`;
    for (const [x1, y1, x2, y2] of guides) {
      inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
        stroke="#FF6B8A" stroke-width="${0.5 / zoomLevel}" stroke-dasharray="${4 / zoomLevel} ${3 / zoomLevel}" />`;
    }
    inner += `</g>`;
    dtcGuideOverlay.innerHTML = inner;
  }

  function removeDtcGuideOverlay() {
    if (dtcGuideOverlay) { dtcGuideOverlay.remove(); dtcGuideOverlay = null; }
  }
  // ── Text drop-to-consume helper ──
  function dtcTextConsume(sceneX, sceneY, screenX, screenY, canvasRect) {
    if (!fdCanvas) return false;
    const source = fdCanvas.get_text();

    // (Text-to-shape reparent removed — text tool creates at drop position only)

    // PRIORITY 2: Drop near an edge → add text as child inside edge block
    const edgeTarget = dtcFindNearestEdge(sceneX, sceneY);
    if (edgeTarget) {
      const consumed = dtcAddTextToEdge(edgeTarget.edgeId, sceneX, sceneY);
      if (consumed) return true;
    }

    // PRIORITY 3: Empty canvas — return false, let normal create flow handle it
    return false;
  }

  /** Find the nearest edge within 30px of a scene point. */
  function dtcFindNearestEdge(sceneX, sceneY) {
    if (!fdCanvas) return null;
    const source = fdCanvas.get_text();
    // Find all edge blocks and check distance to their from→to line
    const edgeRe = /edge\s+@(\S+)\s*\{[^}]*from:\s*@(\S+)[^}]*to:\s*@(\S+)/g;
    let closest = null;
    let closestDist = 30; // 30px threshold
    let match;
    while ((match = edgeRe.exec(source)) !== null) {
      const edgeId = match[1];
      const fromId = match[2];
      const toId = match[3];
      let fromBounds, toBounds;
      try {
        fromBounds = JSON.parse(fdCanvas.get_node_bounds(fromId));
        toBounds = JSON.parse(fdCanvas.get_node_bounds(toId));
      } catch (_) { continue; }
      if (!fromBounds || !toBounds) continue;
      const fx = fromBounds.x + fromBounds.width / 2;
      const fy = fromBounds.y + fromBounds.height / 2;
      const tx = toBounds.x + toBounds.width / 2;
      const ty = toBounds.y + toBounds.height / 2;
      const dist = pointToSegmentDist(sceneX, sceneY, fx, fy, tx, ty);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { edgeId, fromId, toId, midX: (fx + tx) / 2, midY: (fy + ty) / 2 };
      }
    }
    return closest;
  }

  /** Distance from point (px,py) to line segment (ax,ay)-(bx,by). */
  function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /** Add a child text node inside an edge block in the FD source. */
  function dtcAddTextToEdge(edgeId, sceneX, sceneY) {
    if (!fdCanvas) return false;
    let source = fdCanvas.get_text();
    const esc = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(edge\\s+@${esc}\\s*\\{)`, "s");
    const m = source.match(re);
    if (!m) return false;
    // Generate a text node ID
    const textId = "text_" + Math.random().toString(36).slice(2, 8);
    const textBlock = `\n  text @${textId} "Text"`;
    // Insert after the edge opening brace
    const insertPos = source.indexOf(m[0]) + m[0].length;
    source = source.slice(0, insertPos) + textBlock + source.slice(insertPos);
    const ok = fdCanvas.set_text(source);
    if (ok) {
      bumpGeneration();
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
    return ok;
  }

  // ── Snap-to-node helper ──
  const DTC_SNAP_THRESHOLD = 40;
  const DTC_SNAP_GAP = 20;

  function dtcFindSnapTarget(dropX, dropY, toolKind) {
    if (!fdCanvas) return null;
    const newW = toolKind === "ellipse" ? 100 : toolKind === "frame" ? 200 : 120;
    const newH = toolKind === "ellipse" ? 100 : toolKind === "frame" ? 150 : 80;
    const offsets = [
      [0, 0], [DTC_SNAP_THRESHOLD, 0], [-DTC_SNAP_THRESHOLD, 0],
      [0, DTC_SNAP_THRESHOLD], [0, -DTC_SNAP_THRESHOLD],
      [DTC_SNAP_THRESHOLD, DTC_SNAP_THRESHOLD], [-DTC_SNAP_THRESHOLD, -DTC_SNAP_THRESHOLD],
      [DTC_SNAP_THRESHOLD * 2, 0], [-DTC_SNAP_THRESHOLD * 2, 0],
      [0, DTC_SNAP_THRESHOLD * 2], [0, -DTC_SNAP_THRESHOLD * 2],
    ];
    let nearestId = null;
    for (const [ox, oy] of offsets) {
      const hitId = fdCanvas.hit_test_at(dropX + ox, dropY + oy);
      if (hitId) { nearestId = hitId; break; }
    }
    if (!nearestId) return null;
    let tb;
    try { tb = JSON.parse(fdCanvas.get_node_bounds(nearestId)); } catch (_) { return null; }
    if (!tb || !tb.width) return null;
    const tRight = tb.x + tb.width;
    const tBottom = tb.y + tb.height;
    const targetCx = tb.x + tb.width / 2;
    const targetCy = tb.y + tb.height / 2;
    const candidates = [
      { x: tRight + DTC_SNAP_GAP, y: targetCy - newH / 2, dist: Math.abs(dropX - tRight), dir: "right" },
      { x: tb.x - DTC_SNAP_GAP - newW, y: targetCy - newH / 2, dist: Math.abs(dropX - tb.x), dir: "left" },
      { x: targetCx - newW / 2, y: tBottom + DTC_SNAP_GAP, dist: Math.abs(dropY - tBottom), dir: "bottom" },
      { x: targetCx - newW / 2, y: tb.y - DTC_SNAP_GAP - newH, dist: Math.abs(dropY - tb.y), dir: "top" },
    ];
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    if (best.dist > DTC_SNAP_THRESHOLD * 3) return null;
    return { x: best.x, y: best.y, targetId: nearestId, targetCx, targetCy, dir: best.dir };
  }
}


// ─── Minimap (Figma/Miro) ─────────────────────────────────────────────────────

let minimapCtx = null;
let minimapDragging = false;
/** Cached minimap scene image for smooth viewport overlay. */
let minimapSceneImageData = null;
/** Cached minimap transform params for viewport overlay. */
let minimapCachedParams = null;

/** Set up the minimap canvas and mouse events. */
function setupMinimap() {
  const minimapCanvas = document.getElementById("minimap-canvas");
  const minimapContainer = document.getElementById("minimap-container");
  if (!minimapCanvas || !minimapContainer) return;

  const dpr = window.devicePixelRatio || 1;
  minimapCanvas.width = 180 * dpr;
  minimapCanvas.height = 120 * dpr;
  minimapCtx = minimapCanvas.getContext("2d");
  minimapCtx.scale(dpr, dpr);

  // Click/drag on minimap → pan main canvas
  minimapContainer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    minimapDragging = true;
    minimapContainer.setPointerCapture(e.pointerId);
    panFromMinimap(e);
  });

  minimapContainer.addEventListener("pointermove", (e) => {
    if (!minimapDragging) return;
    panFromMinimap(e);
  });

  minimapContainer.addEventListener("pointerup", (e) => {
    minimapDragging = false;
    minimapContainer.releasePointerCapture(e.pointerId);
  });
}

/** Pan the main canvas based on click position on minimap. */
function panFromMinimap(e) {
  if (!fdCanvas) return;
  const minimapContainer = document.getElementById("minimap-container");
  const rect = minimapContainer.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Get scene bounding box
  const bounds = getSceneBounds();
  if (!bounds) return;

  const mw = 180;
  const mh = 120;
  const padding = 20;

  const sceneW = bounds.maxX - bounds.minX;
  const sceneH = bounds.maxY - bounds.minY;
  if (sceneW <= 0 || sceneH <= 0) return;

  const scale = Math.min((mw - padding * 2) / sceneW, (mh - padding * 2) / sceneH);
  const offsetX = (mw - sceneW * scale) / 2;
  const offsetY = (mh - sceneH * scale) / 2;

  // Convert minimap click to scene-space
  const sceneX = (mx - offsetX) / scale + bounds.minX;
  const sceneY = (my - offsetY) / scale + bounds.minY;

  // Center the main canvas viewport on this scene point
  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  panX = cw / 2 - sceneX * zoomLevel;
  panY = ch / 2 - sceneY * zoomLevel;
  render();
}

/** Get the scene bounding box (reused by minimap and export). */
/** Compute scene bounds (expensive — O(N) WASM calls). Use getSceneBoundsCached() instead. */
function getSceneBoundsInner() {
  if (!fdCanvas) return null;
  const text = fdCanvas.get_text();
  if (!text || text.trim().length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let foundAny = false;
  const nodeIdPattern = /@(\w+)/g;
  let match;
  const seenIds = new Set();
  while ((match = nodeIdPattern.exec(text)) !== null) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    try {
      const b = JSON.parse(fdCanvas.get_node_bounds(id));
      if (b.width && b.width > 0) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        foundAny = true;
      }
    } catch (_) { /* skip */ }
  }
  return foundAny ? { minX, minY, maxX, maxY } : null;
}

/** Cached version — only recomputes when scene generation changes. */
function getSceneBounds() {
  if (sceneBoundsGeneration === sceneGeneration && cachedSceneBounds !== undefined) {
    return cachedSceneBounds;
  }
  sceneBoundsGeneration = sceneGeneration;
  cachedSceneBounds = getSceneBoundsInner();
  return cachedSceneBounds;
}

/**
 * Full minimap render: re-renders the scene + caches the image.
 * Called from scheduleSideEffects (100ms throttle).
 */
function renderMinimap() {
  if (!minimapCtx || !fdCanvas) return;
  const mw = 180;
  const mh = 120;
  const dpr = window.devicePixelRatio || 1;

  // Clear
  minimapCtx.save();
  minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const isDark = document.body.classList.contains("dark-theme");
  minimapCtx.fillStyle = isDark ? "rgba(28,28,30,0.9)" : "rgba(245,245,247,0.9)";
  minimapCtx.fillRect(0, 0, mw, mh);

  const bounds = getSceneBounds();
  if (!bounds) {
    minimapCachedParams = null;
    minimapSceneImageData = null;
    minimapCtx.restore();
    return;
  }

  const padding = 20;
  const sceneW = bounds.maxX - bounds.minX;
  const sceneH = bounds.maxY - bounds.minY;
  if (sceneW <= 0 || sceneH <= 0) {
    minimapCachedParams = null;
    minimapSceneImageData = null;
    minimapCtx.restore();
    return;
  }

  const scale = Math.min((mw - padding * 2) / sceneW, (mh - padding * 2) / sceneH);
  const offsetX = (mw - sceneW * scale) / 2;
  const offsetY = (mh - sceneH * scale) / 2;

  // Render scene scaled into minimap
  minimapCtx.save();
  minimapCtx.translate(offsetX, offsetY);
  minimapCtx.scale(scale, scale);
  minimapCtx.translate(-bounds.minX, -bounds.minY);
  fdCanvas.render(minimapCtx, performance.now());
  minimapCtx.restore();

  // Cache the scene image (without viewport rect) for smooth overlay
  minimapSceneImageData = minimapCtx.getImageData(0, 0, mw * dpr, mh * dpr);
  minimapCachedParams = { mw, mh, dpr, isDark, bounds, scale, offsetX, offsetY };

  // Draw viewport rectangle on top
  drawMinimapViewport();

  minimapCtx.restore();
}

/**
 * Lightweight minimap viewport overlay: restores cached scene image
 * and draws only the viewport rectangle. Called from render() on every
 * frame for smooth pan/zoom tracking.
 */
function renderMinimapViewport() {
  if (!minimapCtx || !minimapSceneImageData || !minimapCachedParams) return;
  const { mw, mh, dpr, isDark, bounds, scale, offsetX, offsetY } = minimapCachedParams;

  // Restore cached scene image (clears previous viewport rect)
  minimapCtx.save();
  minimapCtx.setTransform(1, 0, 0, 1, 0, 0);
  minimapCtx.putImageData(minimapSceneImageData, 0, 0);
  minimapCtx.restore();

  // Redraw viewport in DPR-aware space
  minimapCtx.save();
  minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMinimapViewport();
  minimapCtx.restore();
}

/** Draw the viewport indicator rectangle on the minimap (assumes DPR transform). */
function drawMinimapViewport() {
  if (!minimapCachedParams) return;
  const { isDark, bounds, scale, offsetX, offsetY } = minimapCachedParams;

  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  const vpLeft = -panX / zoomLevel;
  const vpTop = -panY / zoomLevel;
  const vpW = cw / zoomLevel;
  const vpH = ch / zoomLevel;

  const rx = offsetX + (vpLeft - bounds.minX) * scale;
  const ry = offsetY + (vpTop - bounds.minY) * scale;
  const rw = vpW * scale;
  const rh = vpH * scale;

  minimapCtx.strokeStyle = isDark ? "rgba(10, 132, 255, 0.6)" : "rgba(0, 122, 255, 0.5)";
  minimapCtx.lineWidth = 1.5;
  minimapCtx.strokeRect(rx, ry, rw, rh);
  minimapCtx.fillStyle = isDark ? "rgba(10, 132, 255, 0.08)" : "rgba(0, 122, 255, 0.06)";
  minimapCtx.fillRect(rx, ry, rw, rh);
}


// ─── Smart Focus on Node (Layer Click) ───────────────────────────────────────

/** Active focus animation ID (for cancellation). */
let focusAnimId = null;

/**
 * Smoothly pan (and optionally zoom) the viewport to focus on a node.
 * - Pans to center only if the node center is far from viewport center (>20%).
 * - Auto-zooms in if BOTH dimensions are < 20px on screen (truly invisible).
 * - Auto-zooms out if max(w,h) overflows the viewport (with 15% padding).
 * - Skips zoom for thin shapes (small in one dimension only) unless overflowing.
 * - 250ms ease-out animation.
 */
function focusOnNode(nodeId) {
  if (!fdCanvas) return;
  let bounds;
  try {
    bounds = JSON.parse(fdCanvas.get_node_bounds(nodeId));
    if (!bounds || (bounds.width <= 0 && bounds.height <= 0)) return;
  } catch (_) { return; }

  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const panelW = getLayersPanelWidth();
  const usableW = cw - panelW;

  // Node center in scene space
  const nodeCX = bounds.x + bounds.width / 2;
  const nodeCY = bounds.y + bounds.height / 2;

  // Current viewport center in scene space
  const vpCenterX = (panelW + usableW / 2 - panX) / zoomLevel;
  const vpCenterY = (ch / 2 - panY) / zoomLevel;

  // Target zoom (start with current)
  let targetZoom = zoomLevel;

  // Screen-space size of the node at current zoom
  const screenW = bounds.width * zoomLevel;
  const screenH = bounds.height * zoomLevel;
  const maxScreenDim = Math.max(screenW, screenH);

  const MIN_VISIBLE_PX = 20;
  const FIT_PADDING_RATIO = 0.15;
  const FIT_TARGET_RATIO = 0.10;

  // Auto-zoom in: both dimensions < 20px (truly invisible, not just thin)
  if (screenW < MIN_VISIBLE_PX && screenH < MIN_VISIBLE_PX) {
    // Zoom so the larger dimension becomes ~25% of usable viewport
    const maxDim = Math.max(bounds.width, bounds.height, 1);
    targetZoom = (usableW * FIT_TARGET_RATIO) / maxDim;
    targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom));
  }
  // Auto-zoom out: largest screen dimension overflows viewport
  else if (maxScreenDim > Math.max(usableW, ch)) {
    const padding = Math.min(usableW, ch) * FIT_PADDING_RATIO;
    const fitZoom = Math.min(
      (usableW - padding * 2) / Math.max(bounds.width, 1),
      (ch - padding * 2) / Math.max(bounds.height, 1)
    );
    targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
  }

  // Check if we need to pan: is node center within 20% of viewport center?
  const thresholdX = usableW * 0.2 / zoomLevel;
  const thresholdY = ch * 0.2 / zoomLevel;
  const dx = Math.abs(nodeCX - vpCenterX);
  const dy = Math.abs(nodeCY - vpCenterY);
  const needsPan = dx > thresholdX || dy > thresholdY;
  const needsZoom = Math.abs(targetZoom - zoomLevel) / zoomLevel > 0.05;

  if (!needsPan && !needsZoom) return; // Already in view, skip

  // Target pan: center the node in the usable viewport at the target zoom
  const finalTargetPanX = panelW + usableW / 2 - nodeCX * targetZoom;
  const finalTargetPanY = ch / 2 - nodeCY * targetZoom;

  // Animate with ease-out
  const startPanX = panX;
  const startPanY = panY;
  const startZoom = zoomLevel;
  const duration = 250;
  const startTime = performance.now();

  // Cancel any running focus animation
  if (focusAnimId) cancelAnimationFrame(focusAnimId);

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic: 1 - (1 - t)^3
    const ease = 1 - Math.pow(1 - t, 3);

    panX = startPanX + (finalTargetPanX - startPanX) * ease;
    panY = startPanY + (finalTargetPanY - startPanY) * ease;
    zoomLevel = startZoom + (targetZoom - startZoom) * ease;

    render();
    updateZoomIndicator();

    if (t < 1) {
      focusAnimId = requestAnimationFrame(step);
    } else {
      focusAnimId = null;
    }
  }

  focusAnimId = requestAnimationFrame(step);
}

// ─── Zoom to Selection (Figma ⌘1) ────────────────────────────────────────────

/** Zoom and center the viewport on the currently selected node(s). */
function zoomToSelection() {
  if (!fdCanvas) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;

  try {
    const b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
    if (!b.width || b.width <= 0) return;

    const container = document.getElementById("canvas-container");
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Compute zoom to fit the node with some padding
    const padding = 80;
    const zx = (cw - padding * 2) / b.width;
    const zy = (ch - padding * 2) / b.height;
    zoomLevel = Math.min(zx, zy, 5); // Cap at 5x
    zoomLevel = Math.max(zoomLevel, 0.1); // Min 10%

    // Center the node in the usable area (right of layers panel)
    const panelW = getLayersPanelWidth();
    const usableW = cw - panelW;
    const nodeCenterX = b.x + b.width / 2;
    const nodeCenterY = b.y + b.height / 2;
    panX = panelW + usableW / 2 - nodeCenterX * zoomLevel;
    panY = ch / 2 - nodeCenterY * zoomLevel;

    updateZoomIndicator();
    render();
  } catch (_) { /* skip */ }
}


// ─── Help Button ─────────────────────────────────────────────────────────

function setupHelpButton() {
  const helpBtn = document.getElementById("tool-help-btn");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      toggleShortcutHelp();
    });
  }
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

let isDarkTheme = false;

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;

  // Restore persisted theme
  const savedState = vscode.getState();
  if (savedState && savedState.darkTheme) {
    isDarkTheme = true;
    applyTheme(true);
  }

  btn.addEventListener("click", () => {
    isDarkTheme = !isDarkTheme;
    applyTheme(isDarkTheme);
    vscode.setState({ ...(vscode.getState() || {}), darkTheme: isDarkTheme });
  });
}

function applyTheme(isDark) {
  const btn = document.getElementById("theme-toggle-btn");
  if (isDark) {
    document.body.classList.add("dark-theme");
    if (btn) btn.textContent = "☀️";
  } else {
    document.body.classList.remove("dark-theme");
    if (btn) btn.textContent = "🌙";
  }
  if (fdCanvas) {
    fdCanvas.set_theme(isDark);
    render();
  }
}

// ─── Sketchy Mode Toggle ──────────────────────────────────────────────────────

function setupSketchyToggle() {
  const btn = document.getElementById("sketchy-toggle-btn");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.sketchyMode) {
    btn.classList.add("active");
    if (fdCanvas) {
      fdCanvas.set_sketchy_mode(true);
      render();
    }
  }

  btn.addEventListener("click", () => {
    if (!fdCanvas) return;
    const enabled = !fdCanvas.get_sketchy_mode();
    fdCanvas.set_sketchy_mode(enabled);
    btn.classList.toggle("active", enabled);
    vscode.setState({ ...(vscode.getState() || {}), sketchyMode: enabled });
    render();
  });
}

// ─── Zen Mode Toggle ──────────────────────────────────────────────────────────

function setupZenModeToggle() {
  const btn = document.getElementById("zen-toggle-btn");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.zenMode) {
    applyZenMode(true);
  }

  btn.addEventListener("click", () => {
    const isZen = document.body.classList.contains("zen-mode");
    applyZenMode(!isZen);
    vscode.setState({ ...(vscode.getState() || {}), zenMode: !isZen });
  });
}

function applyZenMode(isZen) {
  const btn = document.getElementById("zen-toggle-btn");
  if (isZen) {
    document.body.classList.add("zen-mode");
    if (btn) { btn.textContent = '🔧'; btn.title = 'Switch to Full mode'; }
  } else {
    document.body.classList.remove("zen-mode");
    if (btn) { btn.textContent = '🧘'; btn.title = 'Switch to Zen mode'; }
    // Clear any zen-visible overrides when leaving zen mode
    document.getElementById("layers-panel")?.classList.remove("zen-visible");
    document.getElementById("props-panel")?.classList.remove("zen-visible");
  }
}

// ─── Copy / Paste / Select All (Figma/Sketch standard) ───────────────────────

/** Clipboard buffer for FD node text */
let fdClipboard = "";

/** Copy the selected node's .fd block to the clipboard. */
function copySelectedAsFd() {
  if (!fdCanvas) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;

  const text = fdCanvas.get_text();
  const lines = text.split("\n");

  // Find the line that starts the node declaration
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${selectedId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return;

  // Determine the indentation of the start line
  const startIndent = lines[startIdx].match(/^\s*/)[0].length;

  // Collect all lines belonging to this block (same or deeper indentation)
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }

  fdClipboard = lines.slice(startIdx, endIdx).join("\n");

  // Also copy to system clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fdClipboard).catch(() => { });
  }
}

/** Paste a node from the FD clipboard. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Try reading from system clipboard first
  let clipText = fdClipboard;
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText.includes("@")) {
        clipText = sysText;
      }
    }
  } catch (_) { /* permission denied, use internal clipboard */ }

  if (!clipText.trim()) return;

  // Recursively rename ALL @ids inside the pasted block to avoid collisions
  const suffix = "_cp" + Math.floor(Math.random() * 9000 + 1000);
  const idPattern = /@(\w+)\s*\{/g;
  const allIds = new Set();
  let m;
  while ((m = idPattern.exec(clipText)) !== null) {
    allIds.add(m[1]);
  }
  if (allIds.size === 0) return;

  // Build renamed text: replace each @oldId with @oldId_cpXXXX everywhere
  let pasteText = clipText;
  const rootId = [...allIds][0]; // First ID = root node for selection
  for (const oldId of allIds) {
    const newId = oldId + suffix;
    // Replace @id declarations and all references (use:, center_in:, etc.)
    pasteText = pasteText.replace(new RegExp(`@${oldId}\\b`, "g"), `@${newId}`);
  }
  const newRootId = rootId + suffix;

  // Append to current text
  const currentText = fdCanvas.get_text();
  const updatedText = currentText.trimEnd() + "\n\n" + pasteText + "\n";
  fdCanvas.set_text(updatedText);
  render();
  syncTextToExtension();

  // Select the newly pasted root node
  fdCanvas.select_by_id(newRootId);
  render();
  updatePropertiesPanel();
}

/** Select all nodes in the scene. */
function selectAllNodes() {
  if (!fdCanvas) return;
  const text = fdCanvas.get_text();
  if (!text) return;

  // Find all node IDs
  const nodeIdPattern = /@(\w+)/g;
  let match;
  const ids = [];
  const seen = new Set();
  while ((match = nodeIdPattern.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      ids.push(match[1]);
      seen.add(match[1]);
    }
  }

  if (ids.length === 0) return;

  // Select the first node (multi-select would need WASM API support)
  // Select the first node
  if (ids.length > 0) {
    fdCanvas.select_by_id(ids[0]);
    render();
    updatePropertiesPanel();
  }
}

/** Copy the selected node(s) as a transparent PNG to the system clipboard. */
async function copySelectionAsPng() {
  if (!fdCanvas) return;

  const boundsArr = fdCanvas.get_selection_bounds();
  if (!boundsArr) return; // No selection

  // boundsArr is Float64Array[x, y, width, height]
  const bx = boundsArr[0];
  const by = boundsArr[1];
  const bw = boundsArr[2];
  const bh = boundsArr[3];

  // Add a small transparent padding
  const padding = 16;
  const exportW = bw + padding * 2;
  const exportH = bh + padding * 2;
  const offsetX = bx - padding;
  const offsetY = by - padding;

  // Create an offscreen canvas
  const offscreen = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 2; // Default to retina

  offscreen.width = exportW * dpr;
  offscreen.height = exportH * dpr;

  const offCtx = offscreen.getContext("2d");
  offCtx.scale(dpr, dpr);
  // Canvas defaults to transparent background

  // Draw exactly the selected nodes with correct translation
  fdCanvas.render_export(offCtx, offsetX, offsetY);

  // Helper inside toBlob
  offscreen.toBlob(blob => {
    if (!blob) {
      vscode.postMessage({ type: "error", text: "Failed to generate PNG blob." });
      return;
    }

    // Write blob to os clipboard
    try {
      const item = new ClipboardItem({ "image/png": blob });
      navigator.clipboard.write([item]).then(() => {
        vscode.postMessage({ type: "info", text: "Selection copied as PNG!" });
      }).catch(err => {
        console.error("Clipboard write error:", err);
        vscode.postMessage({ type: "error", text: "Failed to copy image to clipboard. Check permissions." });
      });
    } catch (err) {
      console.error(err);
      vscode.postMessage({ type: "error", text: "Clipboard image API not supported in this environment." });
    }
  }, "image/png");
}



// ─── Export PNG (Figma/Sketch) ────────────────────────────────────────────────

/** Export the current canvas as a PNG image. */
function exportToPng() {
  if (!fdCanvas || !ctx || !canvas) return;

  // Compute scene bounding box
  const text = fdCanvas.get_text();
  if (!text || text.trim().length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let foundAny = false;
  const nodeIdPattern = /@(\w+)/g;
  let match;
  const seenIds = new Set();
  while ((match = nodeIdPattern.exec(text)) !== null) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    try {
      const b = JSON.parse(fdCanvas.get_node_bounds(id));
      if (b.width && b.width > 0) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        foundAny = true;
      }
    } catch (_) { /* skip */ }
  }

  if (!foundAny) return;

  // Add padding
  const padding = 40;
  const sceneW = maxX - minX + padding * 2;
  const sceneH = maxY - minY + padding * 2;

  // Create an offscreen canvas for the export
  const exportCanvas = document.createElement("canvas");
  const dpr = 2; // Export at 2x resolution for high-quality
  exportCanvas.width = sceneW * dpr;
  exportCanvas.height = sceneH * dpr;
  const exportCtx = exportCanvas.getContext("2d");

  // White background
  const isDark = document.body.classList.contains("dark-theme");
  exportCtx.fillStyle = isDark ? "#1C1C1E" : "#FFFFFF";
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  // Render scene centered in export canvas
  exportCtx.setTransform(dpr, 0, 0, dpr, (padding - minX) * dpr, (padding - minY) * dpr);
  fdCanvas.render(exportCtx, performance.now());

  // Send to extension for save dialog
  const dataUrl = exportCanvas.toDataURL("image/png");
  vscode.postMessage({ type: "exportPng", dataUrl });
}

/** Set up the export dropdown menu. */
function setupExportButton() {
  const btn = document.getElementById("export-menu-btn");
  const menu = document.getElementById("export-menu");
  if (!btn || !menu) return;

  // Toggle menu
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("visible");
  });

  // Handle menu actions
  document.querySelectorAll(".export-menu-item").forEach(item => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      menu.classList.remove("visible");
      if (item.classList.contains("disabled")) return;

      const action = item.dataset.export;
      switch (action) {
        case "png-clip":
          await copySelectionAsPng();
          break;
        case "png-file":
          exportToPng();
          break;
        case "svg-file":
          exportToSvg();
          break;
        case "fd-clip":
          copySelectedAsFd();
          vscode.postMessage({ type: "info", text: "Copied .fd text to clipboard!" });
          break;
      }
    });
  });

  // Close when clicking outside
  document.addEventListener("pointerdown", (e) => {
    if (menu.classList.contains("visible") && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("visible");
    }
  });
}

/** Set up the insert dropdown menu (Insert button in top bar). */
function setupInsertMenu() {
  const btn = document.getElementById("insert-menu-btn");
  const menu = document.getElementById("insert-menu");
  if (!btn || !menu) return;

  // Toggle menu
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("visible");
  });

  // Handle insert actions — activate the tool (same as top bar tool buttons)
  document.querySelectorAll(".insert-menu-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("visible");
      const shape = item.dataset.insert;
      if (!shape) return;

      // Activate the corresponding tool button in the toolbar
      const toolBtn = document.querySelector(`.tool-btn[data-tool="${shape}"]`);
      if (toolBtn) {
        toolBtn.click();
      }
    });
  });

  // Close when clicking outside
  document.addEventListener("pointerdown", (e) => {
    if (menu.classList.contains("visible") && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("visible");
    }
  });
}

/** Save selection (or full canvas) as an SVG file. */
function exportToSvg() {
  if (!fdCanvas) return;
  const svgStr = fdCanvas.export_svg();
  if (!svgStr) {
    vscode.postMessage({ type: "error", text: "Failed to generate SVG." });
    return;
  }
  vscode.postMessage({ type: "exportSvg", svgStr });
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────

/** Default dimensions for shapes when dropped from palette. */
const DEFAULT_SHAPE_SIZES = {
  rect: [100, 80],
  ellipse: [100, 80],
  text: [80, 24],
  frame: [200, 150],
  line: [120, 4],
  arrow: [120, 4],
};

function setupDragAndDrop() {
  // Canvas drop target (kept for future drag-from-insert support)
  canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!fdCanvas) return;
    const shape = e.dataTransfer.getData("text/plain");
    if (!shape) return;

    const rect = canvas.getBoundingClientRect();
    // Adjust for pan offset to place node in scene-space coords
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    // Line & arrow: create as thin rect with stroke-only styling
    if (shape === "line" || shape === "arrow") {
      const changed = fdCanvas.create_node_at("rect", x, y);
      if (changed) {
        // Restyle to a thin line: narrow height, no fill, black stroke
        const selId = fdCanvas.get_selected_id();
        if (selId) {
          fdCanvas.set_node_prop("width", "120");
          fdCanvas.set_node_prop("height", "2");
          fdCanvas.set_node_prop("fill", "#000000");
          fdCanvas.set_node_prop("cornerRadius", "0");
        }
        render();
        syncTextToExtension();
        updatePropertiesPanel();
      }
      return;
    }

    const changed = fdCanvas.create_node_at(shape, x, y);
    if (changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  });
}

// ─── Animation Picker ────────────────────────────────────────────────────

const ANIM_PRESETS = [
  {
    group: "Hover", trigger: "hover", items: [
      { label: "Scale Up", icon: "↗", props: { scale: 1.1 }, ease: "spring", duration: 300 },
      { label: "Fade", icon: "◐", props: { opacity: 0.6 }, ease: "ease_in_out", duration: 200 },
      { label: "Color Shift", icon: "◆", props: { fill: "#D63031" }, ease: "ease_out", duration: 250 },
      { label: "Rotate", icon: "↻", props: { rotate: 5 }, ease: "spring", duration: 400 },
      { label: "Lift & Glow", icon: "✦", props: { scale: 1.06 }, ease: "spring", duration: 400 },
    ]
  },
  {
    group: "Press", trigger: "press", items: [
      { label: "Squish", icon: "↙", props: { scale: 0.88 }, ease: "spring", duration: 150 },
      { label: "Dim", icon: "◑", props: { opacity: 0.5 }, ease: "ease_out", duration: 100 },
      { label: "Flash", icon: "⚡", props: { fill: "#FFF" }, ease: "linear", duration: 80 },
    ]
  },
  {
    group: "Enter", trigger: "enter", items: [
      { label: "Fade In", icon: "▶", props: { opacity: 1.0 }, ease: "ease_out", duration: 500 },
      { label: "Pop In", icon: "◉", props: { scale: 1.0, opacity: 1.0 }, ease: "spring", duration: 600 },
      { label: "Slide Up", icon: "⬆", props: { opacity: 1.0 }, ease: "ease_in_out", duration: 400 },
    ]
  },
];

let animPickerTargetId = null;

function setupAnimPicker() {
  const picker = document.getElementById("anim-picker");
  if (!picker) return;

  // Close button
  document.getElementById("anim-picker-close")?.addEventListener("click", closeAnimPicker);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker.classList.contains("visible")) {
      closeAnimPicker();
    }
  });

  // Close on click outside
  document.addEventListener("pointerdown", (e) => {
    if (picker.classList.contains("visible") && !picker.contains(e.target)) {
      closeAnimPicker();
    }
  });
}

function closeAnimPicker() {
  const picker = document.getElementById("anim-picker");
  if (picker) picker.classList.remove("visible");
  animPickerTargetId = null;
}

function openAnimPicker(targetNodeId, clientX, clientY) {
  if (!fdCanvas) return;
  const picker = document.getElementById("anim-picker");
  const body = document.getElementById("anim-picker-body");
  if (!picker || !body) return;

  animPickerTargetId = targetNodeId;
  body.innerHTML = "";

  // Show existing animations on this node
  try {
    const existing = JSON.parse(fdCanvas.get_node_animations_json(targetNodeId));
    if (existing.length > 0) {
      const existLabel = document.createElement("div");
      existLabel.className = "picker-group-label";
      existLabel.textContent = "Current Animations";
      body.appendChild(existLabel);

      for (const anim of existing) {
        const row = document.createElement("div");
        row.className = "picker-existing";
        const trigger = anim.trigger?.Custom || anim.trigger || "?";
        const triggerName = typeof trigger === "string" ? trigger : Object.keys(trigger)[0]?.toLowerCase() || "?";
        row.innerHTML = `<span>:${triggerName}</span> <span style="flex:1;opacity:0.6">${anim.duration_ms || 300}ms</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.className = "pe-remove";
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", () => {
          fdCanvas.remove_node_animations(targetNodeId);
          render();
          syncTextToExtension();
          openAnimPicker(targetNodeId, clientX, clientY); // Refresh
        });
        row.appendChild(removeBtn);
        body.appendChild(row);
      }

      const sep = document.createElement("div");
      sep.className = "picker-sep";
      body.appendChild(sep);
    }
  } catch (_) { /* no existing animations */ }

  // Build preset groups
  for (const group of ANIM_PRESETS) {
    const groupLabel = document.createElement("div");
    groupLabel.className = "picker-group-label";
    groupLabel.textContent = group.group;
    body.appendChild(groupLabel);

    for (const preset of group.items) {
      const row = document.createElement("div");
      row.className = "picker-item";
      row.innerHTML = `<span class="pi-icon">${preset.icon}</span><span class="pi-label">${preset.label}</span><span class="pi-meta">${preset.duration}ms</span>`;

      // Live preview on hover
      row.addEventListener("mouseenter", () => {
        if (preset.props.scale != null) {
          startTween(targetNodeId, "scale", 1.0, preset.props.scale, preset.duration, preset.ease);
        }
        if (preset.props.opacity != null) {
          startTween(targetNodeId, "opacity", 1.0, preset.props.opacity, preset.duration, preset.ease);
        }
        render();
      });

      row.addEventListener("mouseleave", () => {
        // Reset tweens back
        if (preset.props.scale != null) {
          startTween(targetNodeId, "scale", preset.props.scale, 1.0, 200, "ease_out");
        }
        if (preset.props.opacity != null) {
          startTween(targetNodeId, "opacity", preset.props.opacity, 1.0, 200, "ease_out");
        }
        render();
      });

      // Commit on click
      row.addEventListener("click", () => {
        const propsJson = JSON.stringify({
          ...preset.props,
          duration: preset.duration,
          ease: preset.ease,
        });
        const changed = fdCanvas.add_animation_to_node(
          targetNodeId,
          group.trigger,
          propsJson
        );
        if (changed) {
          render();
          syncTextToExtension();
          updatePropertiesPanel();
        }
        closeAnimPicker();
      });

      body.appendChild(row);
    }
  }

  // Position the picker near the drop point
  const container = document.getElementById("canvas-container");
  const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0, width: 800, height: 600 };
  let left = clientX - containerRect.left + 12;
  let top = clientY - containerRect.top + 12;
  // Keep within bounds
  const pw = 260, ph = 400;
  if (left + pw > containerRect.width) left = containerRect.width - pw - 8;
  if (top + ph > containerRect.height) top = Math.max(8, containerRect.height - ph - 8);

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  picker.classList.add("visible");
}


// ─── View Mode Toggle ────────────────────────────────────────────────────

function setupViewToggle() {
  document.getElementById("view-all")?.addEventListener("click", () => setViewMode("all"));
  document.getElementById("view-design")?.addEventListener("click", () => setViewMode("design"));
  document.getElementById("view-spec")?.addEventListener("click", () => setViewMode("spec"));
}

function setViewMode(mode) {
  viewMode = mode;
  const isSpec = mode === "spec";

  document.getElementById("view-all")?.classList.toggle("active", mode === "all");
  document.getElementById("view-design")?.classList.toggle("active", mode === "design");
  document.getElementById("view-spec")?.classList.toggle("active", isSpec);

  // Canvas stays visible — spec view keeps full interactivity
  const overlay = document.getElementById("spec-overlay");
  if (overlay) overlay.style.display = (isSpec || specBadgesVisible) ? "" : "none";

  // Hide properties panel in spec view
  const props = document.getElementById("props-panel");
  if (props && isSpec) props.classList.remove("visible");

  // Notify extension to apply/remove code-mode spec folding
  vscode.postMessage({ type: "viewModeChanged", mode });

  if (isSpec || specBadgesVisible) {
    refreshSpecBadges();
  } else {
    // Clear badges when leaving spec view with toggle OFF
    if (overlay) overlay.innerHTML = "";
  }

  if (isSpec) {
    refreshSpecView();
  }

  // Always refresh layers (it's always visible)
  refreshLayersPanel();
}

/**
 * Render spec info for the selected node in the spec overlay.
 * In Design/All view: only show spec details for the currently selected node.
 * Badge pins are removed; specs appear on hover via tooltip.
 */
function refreshSpecBadges() {
  const overlay = document.getElementById("spec-overlay");
  if (!overlay || !fdCanvas) return;

  // In design/all modes, hide the overlay (tooltip handles hover display)
  overlay.style.display = "none";
  overlay.innerHTML = "";
}

/** Cached annotated nodes for hover tooltip lookups. */
let cachedAnnotatedNodes = [];
let cachedAnnotatedSource = "";

/** Refresh the annotated nodes cache if source changed. */
function refreshAnnotatedCache() {
  if (!fdCanvas) return;
  const source = fdCanvas.get_text();
  if (source !== cachedAnnotatedSource) {
    cachedAnnotatedSource = source;
    cachedAnnotatedNodes = parseAnnotatedNodes(source);
  }
}

/** Show spec hover tooltip at screen position for a given node. */
function showSpecTooltip(nodeId, clientX, clientY) {
  const tooltip = document.getElementById("spec-hover-tooltip");
  if (!tooltip) return;

  refreshAnnotatedCache();
  const node = cachedAnnotatedNodes.find(n => n.id === nodeId);
  if (!node || node.annotations.length === 0) {
    hideSpecTooltip();
    return;
  }

  const descs = node.annotations.filter(a => a.type === "description");
  const statuses = node.annotations.filter(a => a.type === "status");
  const priorities = node.annotations.filter(a => a.type === "priority");

  let html = `<div class="spec-tip-id">◇ @${escapeHtml(node.id)}</div>`;
  if (descs.length > 0) {
    html += `<div class="spec-tip-desc">${escapeHtml(descs[0].value)}</div>`;
  }
  if (statuses.length > 0 || priorities.length > 0) {
    html += `<div class="spec-tip-badges">`;
    for (const s of statuses) {
      html += `<span class="spec-tip-badge status-${escapeAttr(s.value)}">${escapeHtml(s.value)}</span>`;
    }
    for (const p of priorities) {
      html += `<span class="spec-tip-badge priority-${escapeAttr(p.value)}">⚡ ${escapeHtml(p.value)}</span>`;
    }
    html += `</div>`;
  }

  tooltip.innerHTML = html;
  const container = document.getElementById("canvas-container");
  const containerRect = container.getBoundingClientRect();
  tooltip.style.left = (clientX - containerRect.left + 14) + "px";
  tooltip.style.top = (clientY - containerRect.top - 10) + "px";
  tooltip.classList.add("visible");
}

/** Hide the spec hover tooltip. */
function hideSpecTooltip() {
  const tooltip = document.getElementById("spec-hover-tooltip");
  if (tooltip) tooltip.classList.remove("visible");
}

function refreshSpecView() {
  // Badges are now handled by refreshSpecBadges()
  refreshSpecBadges();
}

/**
 * Parse .fd source to find nodes that have spec annotations.
 * Returns array of { id, kind, annotations[] }.
 */
function parseAnnotatedNodes(source) {
  const lines = source.split("\n");
  const result = [];
  let pendingAnnotations = [];
  let currentNodeId = "";
  let currentNodeKind = "";
  let insideNode = false;
  let braceDepth = 0;
  let insideEdge = false;
  let currentEdge = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    if (trimmed.startsWith("#")) continue;

    // Spec block (inline or block form)
    if (trimmed.startsWith("spec ") || trimmed.startsWith("spec{")) {
      // Inline form: spec "description"
      const inlineMatch = trimmed.match(/^spec\s+"([^"]*)"/);
      if (inlineMatch) {
        const ann = { type: "description", value: inlineMatch[1] };
        if (insideEdge && currentEdge) {
          currentEdge.annotations.push(ann);
        } else {
          pendingAnnotations.push(ann);
        }
        continue;
      }
      // Block form: spec { ... }
      if (trimmed.includes("{")) {
        let specDepth = (trimmed.match(/\{/g) || []).length;
        specDepth -= (trimmed.match(/\}/g) || []).length;
        const lineIdx = lines.indexOf(line);
        let j = lineIdx + 1;
        while (j < lines.length && specDepth > 0) {
          const specLine = lines[j].trim();
          specDepth += (specLine.match(/\{/g) || []).length;
          specDepth -= (specLine.match(/\}/g) || []).length;
          if (specLine !== "}" && specLine.length > 0 && specDepth >= 0) {
            const ann = parseSpecAnnotation(specLine);
            if (ann) {
              if (insideEdge && currentEdge) {
                currentEdge.annotations.push(ann);
              } else {
                pendingAnnotations.push(ann);
              }
            }
          }
          j++;
        }
      }
      continue;
    }

    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      insideEdge = true;
      currentEdge = { id: edgeMatch[1], annotations: [] };
      braceDepth += openBraces - closeBraces;
      continue;
    }

    if (insideEdge && currentEdge) {
      braceDepth += openBraces - closeBraces;
      if (trimmed === "}") {
        insideEdge = false;
        currentEdge = null;
      }
      continue;
    }

    if (trimmed === "}") {
      braceDepth -= 1;
      if (insideNode && currentNodeId) {
        if (pendingAnnotations.length > 0) {
          result.push({ id: currentNodeId, kind: currentNodeKind, annotations: [...pendingAnnotations] });
        }
        pendingAnnotations = [];
        currentNodeId = "";
        currentNodeKind = "";
        insideNode = braceDepth > 0;
      }
      continue;
    }

    const nodeMatch = trimmed.match(
      /^(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"[^"]*")?\s*\{?/
    );
    if (nodeMatch) {
      if (currentNodeId && pendingAnnotations.length > 0) {
        result.push({ id: currentNodeId, kind: currentNodeKind, annotations: [...pendingAnnotations] });
        pendingAnnotations = [];
      }
      currentNodeKind = nodeMatch[1];
      currentNodeId = nodeMatch[2];
      insideNode = true;
      if (trimmed.endsWith("{")) braceDepth += 1;
      continue;
    }

    const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
    if (genericMatch) {
      if (currentNodeId && pendingAnnotations.length > 0) {
        result.push({ id: currentNodeId, kind: currentNodeKind, annotations: [...pendingAnnotations] });
        pendingAnnotations = [];
      }
      currentNodeKind = "spec";
      currentNodeId = genericMatch[1];
      insideNode = true;
      braceDepth += 1;
      continue;
    }

    braceDepth += openBraces - closeBraces;
  }

  if (currentNodeId && pendingAnnotations.length > 0) {
    result.push({ id: currentNodeId, kind: currentNodeKind, annotations: [...pendingAnnotations] });
  }

  return result;
}

// ─── Initialization ──────────────────────────────────────────────────────

async function main() {
  canvas = document.getElementById("fd-canvas");
  const loading = document.getElementById("loading");
  const status = document.getElementById("status");

  try {
    // Dynamic import — use absolute webview URI to bypass relative path resolution
    const wasmJsUrl = window.wasmJsUrl;
    const wasmModule = await import(wasmJsUrl);
    const init = wasmModule.default;
    FdCanvas = wasmModule.FdCanvas;

    // Initialize WASM — pass explicit binary URL for webview compatibility
    await init(window.wasmBinaryUrl || undefined);

    // Set up canvas
    const container = document.getElementById("canvas-container");
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Create WASM canvas controller
    fdCanvas = new FdCanvas(width, height);

    // Load initial text if available
    if (window.initialText) {
      fdCanvas.set_text(window.initialText);
    }

    // Measure all text nodes for tight bounding boxes
    measureAllTextNodes();

    // Start animation loop (covers flow animation + initial render)
    startAnimLoop();

    // Center content accounting for layers panel overlay
    zoomToFit();

    // Hide loading overlay
    if (loading) loading.style.display = "none";
    if (status) status.textContent = "Ready";

    // Set up event listeners
    setupPointerEvents();
    setupResizeObserver(container);
    setupToolbar();
    setupViewToggle();
    setupAnnotationCard();
    setupContextMenu();
    setupPropertiesPanel();
    setupInlineEditor();
    setupAlignGrid();
    setupPropsActions();
    setupDragAndDrop();
    setupAnimPicker();
    setupHelpButton();
    setupFloatingBar();

    setupApplePencilPro();
    setupThemeToggle();
    setupSketchyToggle();
    setupZenModeToggle();
    setupZoomIndicator();
    setupGridToggle();
    setupSpecBadgeToggle();
    setupExportButton();
    setupInsertMenu();
    setupMinimap();
    setupColorSwatches();
    setupTouchGestures();
    setupZoomControls();
    setupUndoRedoControls();
    setupSettingsMenu();
    setupFloatingToolbar();
    setupEdgeContextMenu();

    // Ensure no stale menus are visible after init
    closeContextMenu();
    hideFloatingBar();
    closeEdgeContextMenu();

    // Tell extension we're ready
    vscode.postMessage({ type: "ready" });
  } catch (err) {
    console.error("FD WASM init failed:", err);
    if (loading) loading.textContent = "Failed to load FD engine: " + err;
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────

function render() {
  if (!fdCanvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  // Clear the entire canvas buffer before drawing to prevent trails
  // when panning or dragging outside the original viewport.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.save();
  // Apply zoom + pan: scale by zoom, then translate by pan
  const z = zoomLevel * dpr;
  ctx.setTransform(z, 0, 0, z, panX * dpr, panY * dpr);
  // Draw grid below shapes
  if (gridEnabled) drawGrid();
  fdCanvas.render(ctx, performance.now());

  // ── Arrow tool: draw live preview line during drag ──
  const arrowPreviewJson = fdCanvas.get_arrow_preview();
  if (arrowPreviewJson) {
    try {
      const ap = JSON.parse(arrowPreviewJson);
      ctx.save();
      ctx.strokeStyle = "#6B7080";
      ctx.lineWidth = 1.5;
      // Solid line (not dashed)
      ctx.beginPath();
      ctx.moveTo(ap.x1, ap.y1);
      ctx.lineTo(ap.x2, ap.y2);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(ap.y2 - ap.y1, ap.x2 - ap.x1);
      const headLen = 10;
      ctx.beginPath();
      ctx.moveTo(ap.x2, ap.y2);
      ctx.lineTo(
        ap.x2 - headLen * Math.cos(angle - Math.PI / 6),
        ap.y2 - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(ap.x2, ap.y2);
      ctx.lineTo(
        ap.x2 - headLen * Math.cos(angle + Math.PI / 6),
        ap.y2 - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();

      // ── Fix #3: Highlight target node under cursor during arrow drag ──
      if (ap.target_id) {
        try {
          const targetBoundsJson = fdCanvas.get_node_bounds(ap.target_id);
          if (targetBoundsJson) {
            const tb = JSON.parse(targetBoundsJson);
            const pad = 4;
            ctx.beginPath();
            ctx.roundRect(tb.x - pad, tb.y - pad, tb.width + pad * 2, tb.height + pad * 2, 6);
            ctx.strokeStyle = "#4FC3F7";
            ctx.lineWidth = 2.5;
            ctx.shadowColor = "#4FC3F7";
            ctx.shadowBlur = 8;
            ctx.stroke();
          }
        } catch (_) { /* ignore */ }
      }

      ctx.restore();
    } catch (_) { /* ignore parse errors */ }
  }

  // Animation drop-zone glow ring removed (bug #4)

  // ── Draw near-detach rubber-band and glow ──
  if (nearDetachState) {
    const { parentId, childCx, childCy, parentCx, parentCy } = nearDetachState;
    ctx.save();

    // Draw rubber-band line
    ctx.beginPath();
    ctx.moveTo(childCx, childCy);
    ctx.lineTo(parentCx, parentCy);
    ctx.strokeStyle = "#8A2BE2"; // Purple
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();

    // Draw parent group glow
    try {
      const parentBoundsJson = fdCanvas.get_node_bounds(parentId);
      if (parentBoundsJson) {
        const pb = JSON.parse(parentBoundsJson);
        const pad = 4;
        ctx.beginPath();
        ctx.roundRect(pb.x - pad, pb.y - pad, pb.width + pad * 2, pb.height + pad * 2, 8);
        ctx.strokeStyle = "#8A2BE2";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#8A2BE2";
        ctx.shadowBlur = 12;
        ctx.stroke();
        // Inner/extra glow
        ctx.globalAlpha = 0.5;
        ctx.shadowBlur = 24;
        ctx.stroke();
      }
    } catch (_) {
      // Fallback dot if bounds fail
      ctx.beginPath();
      ctx.arc(parentCx, parentCy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#8A2BE2";
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Eraser poof fade-out overlays ──
  if (erasePoofs.length > 0) {
    const now = performance.now();
    for (let i = erasePoofs.length - 1; i >= 0; i--) {
      const p = erasePoofs[i];
      const elapsed = now - p.startTime;
      const duration = 150;
      if (elapsed >= duration) {
        erasePoofs.splice(i, 1);
        continue;
      }
      const t = elapsed / duration;
      const alpha = (1 - t) * 0.3;
      const scale = 1 + t * 0.15;
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      const sw = p.width * scale;
      const sh = p.height * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#FF3B30";
      const r = Math.min(sw, sh) * 0.08;
      const rx = cx - sw / 2;
      const ry = cy - sh / 2;
      ctx.beginPath();
      ctx.roundRect(rx, ry, sw, sh, r);
      ctx.fill();
      ctx.restore();
    }
    if (erasePoofs.length > 0) renderDirty = true;
  }

  ctx.restore();

  // Update minimap viewport indicator smoothly (scene re-renders at lower frequency)
  renderMinimapViewport();

  // Schedule side-effects at lower frequency (~10fps) to avoid DOM/WASM thrashing
  scheduleSideEffects();
}

/** Animation loop ID for flow animations (pulse/dash edges). */
let animFrameId = null;

/**
 * Start the dirty-checked animation loop.
 * The loop keeps running via rAF but only calls render() when:
 *   - renderDirty is true (user interaction, text change, resize, etc.)
 *   - activeTweens are in progress (spring/ease animations)
 * When idle, this loop is essentially free (no WASM calls, no DOM work).
 */
function startAnimLoop() {
  if (animFrameId !== null) return; // already running
  function loop() {
    if (renderDirty || activeTweens.length > 0 || erasePoofs.length > 0) {
      renderDirty = false;
      render();
    }
    animFrameId = requestAnimationFrame(loop);
  }
  animFrameId = requestAnimationFrame(loop);
}

/** Stop the animation loop (e.g. when canvas is hidden). */
function stopAnimLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

/**
 * Schedule side-effects (layers panel, minimap, selection bar) at ~10fps.
 * These cross the WASM boundary and touch the DOM, so we throttle them
 * to avoid dominating frame time during rapid interactions.
 */
function scheduleSideEffects() {
  if (sideEffectTimer) return; // already scheduled
  sideEffectTimer = setTimeout(() => {
    sideEffectTimer = null;
    if (viewMode === "spec" || specBadgesVisible) refreshSpecBadges();
    if (viewMode === "spec") refreshSpecView();
    refreshLayersPanel();
    renderMinimap();
  }, 100);
}


// ─── Start ───────────────────────────────────────────────────────────────────

main();

