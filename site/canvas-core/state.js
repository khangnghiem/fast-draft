// ─── canvas-core/state.js ─── Shared canvas state
// Imported by both site/app.js and fd-vscode/webview/src/main.js.
//
// This module holds the mutable state that drives the canvas lifecycle:
// zoom, pan, dirty flags, grid, motion preferences, and tool defaults.
// Platform-specific code (CodeMirror, VS Code postMessage) stays in the
// respective host files.

// ─── Zoom / Pan ──────────────────────────────────────────────────────────

export let panX = 0;
export let panY = 0;
export let panStartX = 0;
export let panStartY = 0;
export let panDragging = false;
export let zoomLevel = 1.0;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 10;
export const ZOOM_STEP = 1.25;
export const ZOOM_WHEEL_FACTOR = 1.04;

/** Update pan offsets. */
export function setPan(x, y) { panX = x; panY = y; }
/** Update zoom level (clamped). */
export function setZoom(z) { zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); }
/** Start pan drag tracking. */
export function startPanDrag(sx, sy) { panStartX = sx; panStartY = sy; panDragging = true; }
/** End pan drag tracking. */
export function endPanDrag() { panDragging = false; }

// ─── Dirty Flags ─────────────────────────────────────────────────────────

export let renderDirty = true;
/** @type {number} Monotonic generation counter — bumped on every scene mutation */
export let sceneGeneration = 0;
/** Side-effect throttle timer */
export let sideEffectTimer = null;
/** Whether the scene contains edge flow animations (keeps render loop alive) */
export let hasFlowEdges = false;

/** Mark the canvas as needing a re-render on the next animation frame. */
export function markDirty() { renderDirty = true; }

/** Clear the dirty flag (called after each render). */
export function clearDirty() { renderDirty = false; }

/** Bump the scene generation counter (call on any data mutation). */
export function bumpGeneration(fdCanvas) {
  sceneGeneration++;
  markDirty();
  if (fdCanvas) {
    try { hasFlowEdges = fdCanvas.has_active_flows(); } catch (_) {}
  }
}

/** Set the side-effect timer reference (for throttled panel updates). */
export function setSideEffectTimer(t) { sideEffectTimer = t; }

// ─── Grid ────────────────────────────────────────────────────────────────

export let gridEnabled = false;
export const GRID_SPACING = 20;

export function setGridEnabled(v) { gridEnabled = v; }
export function toggleGrid() { gridEnabled = !gridEnabled; markDirty(); }

// ─── Reduce Motion ───────────────────────────────────────────────────────

const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };
export let reduceMotion = prefersReducedMotion.matches;

/** Initialize motion preference listener. */
export function initMotionPreference() {
  // Check localStorage override (site app stores manual toggle)
  if (typeof localStorage !== 'undefined') {
    const manual = localStorage.getItem('fd-reduce-motion');
    if (manual === 'true') reduceMotion = true;
  }
  prefersReducedMotion.addEventListener('change', (e) => {
    reduceMotion = e.matches;
    if (typeof localStorage !== 'undefined') {
      const manual = localStorage.getItem('fd-reduce-motion');
      if (manual === 'true') reduceMotion = true;
    }
  });
}

export function setReduceMotion(v) { reduceMotion = v; }

// ─── Smart Defaults (Sticky Styles Per Tool) ─────────────────────────────

export const toolDefaults = {
  rect:    { fill: 'none', stroke: '#333333', strokeWidth: 2.5, opacity: 1 },
  ellipse: { fill: 'none', stroke: '#333333', strokeWidth: 2.5, opacity: 1 },
  pen:     { stroke: '#333333', strokeWidth: 2, opacity: 1 },
  arrow:   { stroke: '#333333', strokeWidth: 2, opacity: 1 },
  text:    { fill: '#333333', fontSize: 16, opacity: 1 },
  frame:   { stroke: '#6B7280', strokeWidth: 1, opacity: 1 },
};

/** Capture a property change into the current tool's defaults. */
export function captureDefault(fdCanvas, prop, value) {
  const toolName = fdCanvas ? fdCanvas.get_tool_name() : 'select';
  const map = {
    fill: 'fill', stroke: 'stroke', stroke_width: 'strokeWidth',
    opacity: 'opacity', font_size: 'fontSize',
  };
  const key = map[prop] || prop;
  if (toolDefaults[toolName] && key in toolDefaults[toolName]) {
    toolDefaults[toolName][key] = isNaN(Number(value)) ? value : Number(value);
  }
}

/** Apply stored defaults to the currently selected (newly created) node. */
export function applyDefaultsToNewNode(fdCanvas, toolName) {
  if (!fdCanvas) return;
  const defaults = toolDefaults[toolName];
  if (!defaults) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;
  if (defaults.fill) fdCanvas.set_node_prop('fill', defaults.fill);
  if (defaults.stroke) fdCanvas.set_node_prop('stroke', defaults.stroke);
  if (defaults.strokeWidth !== undefined) fdCanvas.set_node_prop('stroke_width', String(defaults.strokeWidth));
  if (defaults.opacity !== undefined && defaults.opacity !== 1) fdCanvas.set_node_prop('opacity', String(defaults.opacity));
  if (defaults.fontSize !== undefined) fdCanvas.set_node_prop('font_size', String(defaults.fontSize));
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Convert screen (client) coords to scene coords accounting for zoom+pan. */
export function screenToScene(clientX, clientY, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) - panX) / zoomLevel,
    y: ((clientY - rect.top) - panY) / zoomLevel,
  };
}

/** Map PointerEvent.pointerType to WASM u8: 0=mouse, 1=touch, 2=pen. */
export function pointerTypeToU8(pointerType) {
  if (pointerType === 'touch') return 1;
  if (pointerType === 'pen') return 2;
  return 0;
}

// ─── Toast Notification ──────────────────────────────────────────────────

/** Show a brief toast notification at the bottom of the canvas. */
export function showToast(message, durationMs = 1200, container = null) {
  const existing = document.getElementById('fd-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'fd-toast';
  el.textContent = message;
  el.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 500;
    color: #fff; background: rgba(30,30,46,0.85); backdrop-filter: blur(8px);
    pointer-events: none; z-index: 9999; opacity: 0;
    transition: opacity 150ms ease;
  `;
  (container || document.body).appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, durationMs);
}
