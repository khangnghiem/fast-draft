// ─── state.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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

/** Current view mode: "design" | "notes" */
let viewMode = "design";

/** Current note filter: "all" | "todo" | "doing" | "done" | "blocked" */
let noteFilter = "all";

/** Note badge toggle — independent of view mode */
let noteBadgesVisible = false;


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
/** Whether the scene has edge flow animations (pulse/dash) — keeps render loop alive */
let hasFlowEdges = false;

// ─── Security Helpers ────────────────────────────────────────────────────

/**
 * Escapes a string to prevent XSS when inserted into innerHTML.
 * Hardened to escape &, <, >, ", and ' characters.
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes a string to prevent XSS when inserted into HTML attributes.
 * Identical to escapeHtml to ensure complete coverage.
 */
function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Mark the canvas as needing a re-render on the next animation frame. */
function markDirty() { renderDirty = true; }
/** Bump the scene generation counter (call on any data mutation). */
function bumpGeneration() {
  sceneGeneration++;
  markDirty();
  if (fdCanvas) hasFlowEdges = fdCanvas.has_active_flows();
}

/** Grid overlay state */
let gridEnabled = false;
const GRID_BASE_SPACING = 20;

// Reduce Motion — respect OS setting
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = prefersReducedMotion.matches;
prefersReducedMotion.addEventListener('change', (e) => { reduceMotion = e.matches; });

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
/** Ghost bounds from WASM — original positions of nodes before Alt+drag clone */
let altDragGhosts = [];
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

