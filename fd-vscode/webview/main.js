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
// ── canvas-core/state.js ──
// ─── canvas-core/state.js ─── Shared canvas state
// Imported by both site/playground.js and fd-vscode/webview/src/main.js.
//
// This module holds the mutable state that drives the canvas lifecycle:
// zoom, pan, dirty flags, grid, motion preferences, and tool defaults.
// Platform-specific code (CodeMirror, VS Code postMessage) stays in the
// respective host files.

// ─── Zoom / Pan ──────────────────────────────────────────────────────────

let panX = 0;
let panY = 0;
let panStartX = 0;
let panStartY = 0;
let panDragging = false;
let zoomLevel = 1.0;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const ZOOM_STEP = 1.25;
const ZOOM_WHEEL_FACTOR = 1.04;

/** Update pan offsets. */
function setPan(x, y) { panX = x; panY = y; }
/** Update zoom level (clamped). */
function setZoom(z) { zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)); }
/** Start pan drag tracking. */
function startPanDrag(sx, sy) { panStartX = sx; panStartY = sy; panDragging = true; }
/** End pan drag tracking. */
function endPanDrag() { panDragging = false; }

// ─── Dirty Flags ─────────────────────────────────────────────────────────

let renderDirty = true;
/** @type {number} Monotonic generation counter — bumped on every scene mutation */
let sceneGeneration = 0;
/** Side-effect throttle timer */
let sideEffectTimer = null;
/** Whether the scene contains edge flow animations (keeps render loop alive) */
let hasFlowEdges = false;

/** Mark the canvas as needing a re-render on the next animation frame. */
function markDirty() { renderDirty = true; }

/** Clear the dirty flag (called after each render). */
function clearDirty() { renderDirty = false; }

/** Bump the scene generation counter (call on any data mutation). */
function bumpGeneration(fdCanvas) {
  sceneGeneration++;
  markDirty();
  if (fdCanvas) {
    try { hasFlowEdges = fdCanvas.has_active_flows(); } catch (_) {}
  }
}

/** Set the side-effect timer reference (for throttled panel updates). */
function setSideEffectTimer(t) { sideEffectTimer = t; }

// ─── Grid ────────────────────────────────────────────────────────────────

let gridEnabled = false;
const GRID_SPACING = 20;

function setGridEnabled(v) { gridEnabled = v; }
function toggleGrid() { gridEnabled = !gridEnabled; markDirty(); }

// ─── Reduce Motion ───────────────────────────────────────────────────────

const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };
let reduceMotion = prefersReducedMotion.matches;

/** Initialize motion preference listener. */
function initMotionPreference() {
  // Check localStorage override (site playground stores manual toggle)
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

function setReduceMotion(v) { reduceMotion = v; }

// ─── Smart Defaults (Sticky Styles Per Tool) ─────────────────────────────

const toolDefaults = {
  rect:    { fill: 'none', stroke: '#333333', strokeWidth: 2.5, opacity: 1 },
  ellipse: { fill: 'none', stroke: '#333333', strokeWidth: 2.5, opacity: 1 },
  pen:     { stroke: '#333333', strokeWidth: 2, opacity: 1 },
  arrow:   { stroke: '#333333', strokeWidth: 2, opacity: 1 },
  text:    { fill: '#333333', fontSize: 16, opacity: 1 },
  frame:   { stroke: '#6B7280', strokeWidth: 1, opacity: 1 },
};

/** Capture a property change into the current tool's defaults. */
function captureDefault(fdCanvas, prop, value) {
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
function applyDefaultsToNewNode(fdCanvas, toolName) {
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
function screenToScene(clientX, clientY, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) - panX) / zoomLevel,
    y: ((clientY - rect.top) - panY) / zoomLevel,
  };
}

/** Map PointerEvent.pointerType to WASM u8: 0=mouse, 1=touch, 2=pen. */
function pointerTypeToU8(pointerType) {
  if (pointerType === 'touch') return 1;
  if (pointerType === 'pen') return 2;
  return 0;
}

// ─── Toast Notification ──────────────────────────────────────────────────

/** Show a brief toast notification at the bottom of the canvas. */
function showToast(message, durationMs = 1200, container = null) {
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
// ── canvas-core/render.js ──
// ─── canvas-core/render.js ─── Shared render loop + tween engine
// Imported by both site/playground.js and fd-vscode/webview/src/main.js.
//
// This module provides:
// - Tween engine for CSS-like animations (hover/press transitions)
// - Dirty-flag render loop (rAF-based, zero cost when idle)
// - Grid drawing utility
// - Fit-to-content viewport calculation

import * as S from './state.js';

// ─── Tween Engine ────────────────────────────────────────────────────────

/** Active tweens: { nodeId, prop, from, to, startTime, duration, easeFn } */
const activeTweens = [];

const EASE_FNS = {
  linear:      (t) => t,
  ease_out:    (t) => 1 - Math.pow(1 - t, 3),
  ease_in:     (t) => t * t * t,
  ease_in_out: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/** Start a tween (replaces existing same-node+prop tween). */
function startTween(nodeId, prop, from, to, duration, easeName) {
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

/** Evaluate all active tweens, returning { nodeId → { prop → value } }. */
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

// ─── Detach Animation ────────────────────────────────────────────────────

/**
 * Play a snappy "detach pop" animation when a node is reparented out.
 * @param {any} fdCanvas - WASM canvas instance
 * @param {string} nodeId - ID of detached node
 * @param {HTMLCanvasElement} canvas - canvas element for overlay positioning
 */
function playDetachAnimation(fdCanvas, nodeId, canvas) {
  if (!fdCanvas || !nodeId || S.reduceMotion) return;

  // Inject @keyframes on first use
  if (!document.getElementById('detach-anim-style')) {
    const style = document.createElement('style');
    style.id = 'detach-anim-style';
    style.textContent = `
      @keyframes detachPop {
        0%   { opacity: 1; transform: scale(1.08); }
        60%  { opacity: 0.7; transform: scale(1.0); }
        100% { opacity: 0; transform: scale(0.98); }
      }
    `;
    document.head.appendChild(style);
  }

  try {
    const boundsJson = fdCanvas.get_node_bounds(nodeId);
    if (!boundsJson) return;
    const b = JSON.parse(boundsJson);
    if (!b.width) return;

    const screenX = b.x * S.zoomLevel + S.panX;
    const screenY = b.y * S.zoomLevel + S.panY;
    const screenW = b.width * S.zoomLevel;
    const screenH = b.height * S.zoomLevel;
    const pad = 6;

    const glowOverlay = document.createElement('div');
    glowOverlay.className = 'detach-glow';
    glowOverlay.style.cssText = `
      position: absolute;
      left: ${screenX - pad}px; top: ${screenY - pad}px;
      width: ${screenW + pad * 2}px; height: ${screenH + pad * 2}px;
      border: 2px solid #00D2B4; border-radius: 6px;
      box-shadow: 0 0 12px #00D2B480, inset 0 0 8px #00D2B420;
      pointer-events: none;
      animation: detachPop 250ms ease-out forwards;
      z-index: 9999;
    `;

    const container = canvas.parentElement || document.body;
    container.appendChild(glowOverlay);
    setTimeout(() => glowOverlay.remove(), 300);
  } catch (_) { /* skip if bounds unavailable */ }

  S.markDirty();
}

// ─── Grid Drawing ────────────────────────────────────────────────────────

/** Draw subtle grid overlay in scene space (call inside zoom/pan transform). */
function drawGrid(ctx) {
  if (!S.gridEnabled || !ctx) return;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const left = -S.panX / S.zoomLevel;
  const top = -S.panY / S.zoomLevel;
  const right = left + w / S.zoomLevel;
  const bottom = top + h / S.zoomLevel;
  const startX = Math.floor(left / S.GRID_SPACING) * S.GRID_SPACING;
  const startY = Math.floor(top / S.GRID_SPACING) * S.GRID_SPACING;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5 / S.zoomLevel;
  ctx.beginPath();
  for (let x = startX; x <= right; x += S.GRID_SPACING) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = startY; y <= bottom; y += S.GRID_SPACING) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Render Loop ─────────────────────────────────────────────────────────

/** Animation loop ID. */
let animFrameId = null;

/**
 * Start the dirty-checked animation loop.
 * The loop keeps running via rAF but only calls renderFn when:
 *   - renderDirty is true (user interaction, text change, resize)
 *   - activeTweens are in progress (spring/ease animations)
 *   - hasFlowEdges is true (pulse/dash edge animations)
 *
 * @param {Function} renderFn - Platform-specific render function
 * @param {Function} [extraDirtyCheck] - Optional additional dirty check (e.g. erasePoofs)
 */
function startAnimLoop(renderFn, extraDirtyCheck) {
  if (animFrameId !== null) return; // already running
  function loop() {
    const extraDirty = extraDirtyCheck ? extraDirtyCheck() : false;
    if (S.renderDirty || activeTweens.length > 0 || S.hasFlowEdges || extraDirty) {
      S.clearDirty();
      renderFn();
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

// ─── Fit to Content ──────────────────────────────────────────────────────

/**
 * Auto-center scene content in canvas viewport.
 * @param {HTMLCanvasElement} canvasEl - The canvas element
 * @param {any} fdCanvas - WASM canvas instance
 * @param {Function} [onComplete] - Callback after zoom/pan updated (e.g. updateZoomIndicator)
 */
function fitToContent(canvasEl, fdCanvas, onComplete) {
  if (!fdCanvas) return;
  try {
    const text = fdCanvas.get_text();
    const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const nodes = [];
    for (const m of text.matchAll(idRegex)) {
      try {
        const bj = fdCanvas.get_node_bounds_json(m[1]);
        if (bj && bj !== "{}") {
          const b = JSON.parse(bj);
          if (b.width > 0 && b.height > 0) nodes.push(b);
        }
      } catch (_) {}
    }
    if (nodes.length === 0) return;

    let sx = Infinity, sy = Infinity, sx2 = -Infinity, sy2 = -Infinity;
    for (const n of nodes) {
      sx = Math.min(sx, n.x);
      sy = Math.min(sy, n.y);
      sx2 = Math.max(sx2, n.x + n.width);
      sy2 = Math.max(sy2, n.y + n.height);
    }
    const pad = 40;
    sx -= pad; sy -= pad; sx2 += pad; sy2 += pad;
    const sw = sx2 - sx, sh = sy2 - sy;
    const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight;
    if (cw === 0 || ch === 0) return;

    S.setZoom(Math.min(cw / sw, ch / sh, S.ZOOM_MAX));
    S.setPan(
      (cw - sw * S.zoomLevel) / 2 - sx * S.zoomLevel,
      (ch - sh * S.zoomLevel) / 2 - sy * S.zoomLevel,
    );
    S.markDirty();
    if (onComplete) onComplete();
  } catch (_) {}
}

/**
 * Get the bounding box of all scene content.
 * @param {any} fdCanvas - WASM canvas instance
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
function getSceneBounds(fdCanvas) {
  if (!fdCanvas) return null;
  try {
    const text = fdCanvas.get_text();
    const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let sx = Infinity, sy = Infinity, sx2 = -Infinity, sy2 = -Infinity;
    let found = false;
    for (const m of text.matchAll(idRegex)) {
      try {
        const bj = fdCanvas.get_node_bounds_json(m[1]);
        if (bj && bj !== "{}") {
          const b = JSON.parse(bj);
          if (b.width > 0 && b.height > 0) {
            sx = Math.min(sx, b.x);
            sy = Math.min(sy, b.y);
            sx2 = Math.max(sx2, b.x + b.width);
            sy2 = Math.max(sy2, b.y + b.height);
            found = true;
          }
        }
      } catch (_) {}
    }
    if (!found) return null;
    return { x: sx, y: sy, w: sx2 - sx, h: sy2 - sy };
  } catch (_) {
    return null;
  }
}

// ─── Zoom Utilities ──────────────────────────────────────────────────────

/**
 * Zoom by a multiplier, anchored at a screen-space point.
 * @param {number} mx - Screen X anchor
 * @param {number} my - Screen Y anchor
 * @param {number} factor - Zoom multiplier
 * @param {Function} [onComplete] - Callback (e.g. updateZoomIndicator)
 */
function zoomAtPoint(mx, my, factor, onComplete) {
  const oldZoom = S.zoomLevel;
  S.setZoom(S.zoomLevel * factor);
  S.setPan(
    mx - (mx - S.panX) * (S.zoomLevel / oldZoom),
    my - (my - S.panY) * (S.zoomLevel / oldZoom),
  );
  S.markDirty();
  if (onComplete) onComplete();
}

/**
 * Zoom to a specific level, centered on the canvas.
 * @param {HTMLCanvasElement} canvasEl
 * @param {number} newZoom
 * @param {Function} [onComplete]
 */
function zoomToCenter(canvasEl, newZoom, onComplete) {
  const cr = canvasEl.getBoundingClientRect();
  const cx = cr.width / 2;
  const cy = cr.height / 2;
  const clamped = Math.max(S.ZOOM_MIN, Math.min(S.ZOOM_MAX, newZoom));
  S.setPan(
    cx - (cx - S.panX) * (clamped / S.zoomLevel),
    cy - (cy - S.panY) * (clamped / S.zoomLevel),
  );
  S.setZoom(clamped);
  S.markDirty();
  if (onComplete) onComplete();
}
// ── canvas-core/clipboard.js ──
// ─── canvas-core/clipboard.js ─── Shared clipboard utilities
// Pure FD text manipulation — no DOM or platform dependencies.

/**
 * Extract the .fd text block for a single node by its ID.
 * @param {string} text - Full FD source text
 * @param {string} nodeId - Node ID (without @)
 * @returns {string} The block string, or "" if not found
 */
function extractNodeBlock(text, nodeId) {
  const lines = text.split('\n');
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${nodeId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return '';

  const startIndent = lines[startIdx].match(/^\s*/)[0].length;
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Build a batch-aware ID rename map for paste operations.
 * Ensures pasted nodes get unique IDs that don't conflict with existing text.
 *
 * @param {Set<string>} allIds - Set of @id declarations in the pasted block
 * @param {string} existingText - Current FD source text (for conflict detection)
 * @returns {Map<string, string>} Map of oldId → newId
 */
function buildPasteIdMap(allIds, existingText) {
  const idMap = new Map();
  const batchMaxCache = new Map();

  for (const oldId of allIds) {
    const stem = oldId.replace(/_(?:\d+|cp\d+)$/, '');
    let maxN = batchMaxCache.get(stem) || 0;
    if (maxN === 0) {
      maxN = 1;
      const re = new RegExp(`@${stem}_(\\d+)\\b`, 'g');
      let match;
      while ((match = re.exec(existingText)) !== null) {
        maxN = Math.max(maxN, parseInt(match[1]));
      }
      if (new RegExp(`@${stem}\\b`).test(existingText)) {
        maxN = Math.max(maxN, 1);
      }
    }
    const newN = maxN + 1;
    batchMaxCache.set(stem, newN);
    idMap.set(oldId, stem + '_' + newN);
  }

  return idMap;
}

/**
 * Apply an ID rename map to pasted FD text.
 * Replaces all @oldId references with @newId.
 *
 * @param {string} pasteText - FD text to rename IDs in
 * @param {Map<string, string>} idMap - Map of oldId → newId
 * @returns {string} Text with renamed IDs
 */
function applyIdRenames(pasteText, idMap) {
  let result = pasteText;
  for (const [oldId, newId] of idMap) {
    result = result.replace(new RegExp(`@${oldId}\\b`, 'g'), `@${newId}`);
  }
  return result;
}

/**
 * Collect all @id declarations from FD text.
 * @param {string} text - FD source text
 * @returns {Set<string>} Set of declared node IDs
 */
function collectDeclaredIds(text) {
  const idPattern = /@(\w+)\s*\{/g;
  const ids = new Set();
  let m;
  while ((m = idPattern.exec(text)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}
// ── canvas-core/viewport.js ──
// ─── canvas-core/viewport.js ─── Shared viewport geometry
// Pure math and geometry — no DOM or platform dependencies.

/**
 * Detect resize handle under cursor, return CSS cursor name.
 * @param {any} fdCanvas - WASM canvas instance
 * @param {number} x - Scene-space X
 * @param {number} y - Scene-space Y
 * @param {number} hitRadius - Hit radius in scene-space px (default 8)
 * @returns {string} CSS cursor name, or "" if not over a handle
 */
function getResizeHandleCursor(fdCanvas, x, y, hitRadius = 8) {
  if (!fdCanvas) return '';
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return '';
  let b;
  try {
    b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) { return ''; }
  if (b.x === undefined) return '';

  // Check if selected node is text (horizontal-only resize)
  const propsJson = fdCanvas.get_selected_node_props();
  let isText = false;
  try { isText = JSON.parse(propsJson).kind === 'text'; } catch (_) {}

  const r = hitRadius;

  if (isText) {
    const handles = [
      { hx: b.x, hy: b.y + b.height / 2, cursor: 'ew-resize' },
      { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: 'ew-resize' },
    ];
    for (const { hx, hy, cursor } of handles) {
      const dx = x - hx, dy = y - hy;
      if (dx * dx + dy * dy <= r * r) return cursor;
    }
    return '';
  }

  const handles = [
    { hx: b.x, hy: b.y, cursor: 'nwse-resize' },
    { hx: b.x + b.width / 2, hy: b.y, cursor: 'ns-resize' },
    { hx: b.x + b.width, hy: b.y, cursor: 'nesw-resize' },
    { hx: b.x, hy: b.y + b.height / 2, cursor: 'ew-resize' },
    { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: 'ew-resize' },
    { hx: b.x, hy: b.y + b.height, cursor: 'nesw-resize' },
    { hx: b.x + b.width / 2, hy: b.y + b.height, cursor: 'ns-resize' },
    { hx: b.x + b.width, hy: b.y + b.height, cursor: 'nwse-resize' },
  ];
  for (const { hx, hy, cursor } of handles) {
    const dx = x - hx, dy = y - hy;
    if (dx * dx + dy * dy <= r * r) return cursor;
  }
  return '';
}

/**
 * Compute pinch distance between two touch points.
 * @param {{ clientX: number, clientY: number }} t1
 * @param {{ clientX: number, clientY: number }} t2
 * @returns {number}
 */
function pinchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute pinch center between two touch points.
 * @param {{ clientX: number, clientY: number }} t1
 * @param {{ clientX: number, clientY: number }} t2
 * @returns {{ x: number, y: number }}
 */
function pinchCenter(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

/**
 * Nudge the selected node by step pixels in the given arrow direction.
 * @param {any} fdCanvas - WASM canvas instance
 * @param {string} arrowKey - 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
 * @param {number} step - Pixels to nudge (1 for normal, 10 for Shift)
 * @returns {boolean} Whether the scene changed
 */
function nudgeSelected(fdCanvas, arrowKey, step) {
  if (!fdCanvas) return false;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return false;

  try {
    const boundsJson = fdCanvas.get_node_bounds(selectedId);
    const b = JSON.parse(boundsJson);
    if (b.x === undefined) return false;

    let newX = b.x, newY = b.y;
    switch (arrowKey) {
      case 'ArrowUp':    newY -= step; break;
      case 'ArrowDown':  newY += step; break;
      case 'ArrowLeft':  newX -= step; break;
      case 'ArrowRight': newX += step; break;
    }

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = newX - b.x;
    const dy = newY - b.y;
    fdCanvas.handle_pointer_down(cx, cy, 1.0, false, false, false, false);
    const moveResult = JSON.parse(fdCanvas.handle_pointer_move(cx + dx, cy + dy, 1.0, false, false, false, false));
    const upResult = JSON.parse(fdCanvas.handle_pointer_up(cx + dx, cy + dy, false, false, false, false));
    return upResult.changed || moveResult.changed;
  } catch (_) {
    return false;
  }
}
// ── canvas-core/shortcuts.js ──
// ─── canvas-core/shortcuts.js ─── Shared shortcut data + help overlay HTML
// Platform-independent shortcut definitions and help overlay builder.

/** Tool shortcut key map (single-key shortcuts for tool activation). */
const TOOL_SHORTCUTS = {
  r: 'rect',
  o: 'ellipse',
  p: 'pen',
  a: 'arrow',
  t: 'text',
  f: 'frame',
  e: 'eraser',
};

/** Tool cycle order (matches toolbar visual order). */
const TOOL_CYCLE = ['hand', 'select', 'rect', 'ellipse', 'pen', 'arrow', 'text', 'eraser'];

/** Double-press threshold for tool locking (ms). */
const DOUBLE_PRESS_MS = 400;

/** Zoom step multiplier for ⌘+/⌘− keyboard shortcuts. */
const ZOOM_STEP = 1.25;

/**
 * Build the shortcut help overlay HTML.
 * @returns {string} HTML string for the shortcut help panel
 */
function buildShortcutHelpHtml() {
  const isMac = typeof navigator !== 'undefined'
    ? navigator.platform.toUpperCase().indexOf('MAC') >= 0
    : true;
  const cmd = isMac ? '⌘' : 'Ctrl+';

  const sections = [
    {
      title: 'Tools',
      shortcuts: [
        ['V', 'Select / Move'],
        ['R', 'Rectangle'],
        ['O', 'Ellipse'],
        ['P', 'Pen (freehand)'],
        ['A', 'Arrow'],
        ['T', 'Text'],
        ['F', 'Frame'],
        ['E', 'Eraser'],
        ['Tab', 'Toggle last two tools'],
        ['R R', 'Lock tool (stays active)'],
        ['Escape', 'Unlock tool / Deselect'],
      ],
    },
    {
      title: 'Edit',
      shortcuts: [
        [`${cmd}Z`, 'Undo'],
        [`${cmd}⇧Z`, 'Redo'],
        ['Del / ⌫', 'Delete selected'],
        [`${cmd}D`, 'Duplicate (+10,+10)'],
        [`${cmd}A`, 'Select all'],
        [`${cmd}G`, 'Group selected'],
        [`${cmd}⇧G`, 'Ungroup'],
        [`${cmd}C`, 'Copy'],
        [`${cmd}X`, 'Cut'],
        [`${cmd}V`, 'Paste'],
        [`⌥${cmd}C`, 'Copy Style'],
        [`⌥${cmd}V`, 'Paste Style'],
      ],
    },
    {
      title: 'Transform',
      shortcuts: [
        [`${cmd}[`, 'Send backward'],
        [`${cmd}]`, 'Bring forward'],
        [`${cmd}⇧[`, 'Send to back'],
        [`${cmd}⇧]`, 'Bring to front'],
        ['Arrow keys', 'Nudge 1px'],
        ['Shift+Arrow', 'Nudge 10px'],
      ],
    },
    {
      title: 'View',
      shortcuts: [
        [`${cmd}+`, 'Zoom in'],
        [`${cmd}−`, 'Zoom out'],
        ['0', 'Reset zoom to 100%'],
        [`${cmd}0`, 'Zoom to fit'],
        [`${cmd}1`, 'Zoom to selection'],
        ['L', 'Toggle Layers panel'],
        ['G', 'Toggle grid overlay'],
        ['Space (hold)', 'Pan / hand tool'],
        [`${cmd} (hold)`, 'Temp. hand tool'],
        ['Pinch', 'Trackpad zoom'],
      ],
    },
    {
      title: 'Modifiers (while dragging)',
      shortcuts: [
        ['Shift', 'Constrain axis / square'],
        ['Alt+drag', 'Duplicate while moving'],
        ['Double-click', 'Edit text / create text'],
        ['Dbl-click tool', 'Lock tool (🔒)'],
      ],
    },
    {
      title: 'Apple Pencil Pro',
      shortcuts: [
        ['Squeeze', 'Toggle last two tools'],
        ['Barrel Roll', 'Rotate brush angle'],
      ],
    },
  ];

  let html = `
    <div class="help-panel">
      <div class="help-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="help-close" aria-label="Close">×</button>
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
// ── canvas-core/inline-edit.js ──
// ─── canvas-core/inline-edit.js ─── Shared inline text editor
// Imported by both site/playground.js and fd-vscode/webview/src/inline-edit.js.
//
// Double-click text/shape → floating textarea for in-place editing.
// Enter = commit, Escape = cancel, live-sync on every keystroke.

/** Whether the inline editor is currently open */
let inlineEditorActive = false;

/**
 * Compute relative luminance of a hex color (0=black, 1=white).
 */
function hexLuminance(hex) {
  if (!hex || hex.length < 4) return 1;
  let r, g, b;
  if (hex.length <= 5) {
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    r = parseInt(hex.slice(1, 3), 16) / 255;
    g = parseInt(hex.slice(3, 5), 16) / 255;
    b = parseInt(hex.slice(5, 7), 16) / 255;
  }
  const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Measure a text node and update its WASM bounds.
 * Returns true if bounds changed.
 */
function measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId) {
  if (!fdCanvas) return false;
  const propsJson = fdCanvas.get_node_props(nodeId);
  if (!propsJson) return false;
  let props;
  try { props = JSON.parse(propsJson); } catch (_) { return false; }
  const text = props.text || "";
  if (!text) return false;

  const fontSize = props.fontSize || 14;
  const fontFamily = props.fontFamily || "Inter, system-ui, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const maxWidth = props.maxWidth || null;
  const lineHeight = fontSize * 1.2;

  const measureCtx = canvasEl.getContext("2d");
  measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  let measuredWidth, measuredHeight;
  if (maxWidth) {
    const paragraphs = text.split("\n");
    let totalLines = 0;
    let maxLineWidth = 0;
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) { totalLines++; continue; }
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
    measuredWidth = maxWidth;
    measuredHeight = Math.max(totalLines * lineHeight, lineHeight);
  } else {
    const metrics = measureCtx.measureText(text);
    measuredWidth = metrics.width;
    const rawGlyphHeight = (metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null)
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : lineHeight;
    measuredHeight = Math.max(rawGlyphHeight, lineHeight);
  }

  const changed = fdCanvas.update_text_metrics(nodeId, measuredWidth, measuredHeight);
  if (changed) {
    fdCanvas.finalize_bounds();
    return true;
  }
  return false;
}

/**
 * Measure all text nodes and update bounds.
 * @param {Function} renderFn — render callback
 */
function measureAllTextNodes(fdCanvas, canvasEl, renderFn) {
  if (!fdCanvas) return;
  const text = fdCanvas.get_text();
  const textIdRe = /text\s+@(\w+)\s+"/g;
  let match;
  let anyChanged = false;
  while ((match = textIdRe.exec(text)) !== null) {
    if (measureAndUpdateTextBounds(fdCanvas, canvasEl, match[1])) {
      anyChanged = true;
    }
  }
  if (anyChanged && renderFn) renderFn();
}

/**
 * Open a floating textarea over a node for in-place editing.
 *
 * @param {Object} opts
 * @param {string} opts.nodeId       — ID of the node to edit
 * @param {string} opts.propKey      — property key ("content")
 * @param {string} opts.currentValue — current text value
 * @param {any}    opts.fdCanvas     — WASM FdCanvas instance
 * @param {HTMLCanvasElement} opts.canvasEl — the canvas element
 * @param {HTMLElement} opts.container   — overlay container
 * @param {Function} opts.renderFn   — render callback
 * @param {Function} opts.syncFn     — text sync callback
 * @param {Function} [opts.updatePanelFn] — properties panel update callback
 * @param {number} opts.panX         — current pan X
 * @param {number} opts.panY         — current pan Y
 * @param {number} opts.zoomLevel    — current zoom
 */
function openInlineEditor(opts) {
  if (inlineEditorActive) return;

  const {
    nodeId, propKey, currentValue,
    fdCanvas, canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    panX, panY, zoomLevel,
  } = opts;

  // Force-measure text bounds BEFORE reading them
  measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);

  const boundsJson = fdCanvas.get_node_bounds(nodeId);
  const b = JSON.parse(boundsJson);
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;

  // Read node props for styling
  fdCanvas.select_by_id(nodeId);
  fdCanvas.clear_pressed();
  renderFn();
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

  const rawFontSize = props.fontSize || 14;
  const fontSize = Math.round(rawFontSize * zoomLevel);
  const fontFamily = props.fontFamily || "Inter";
  const fontWeight = props.fontWeight || 400;
  const lineHeight = Math.round(rawFontSize * 1.2 * zoomLevel);

  const sx = (b.x || 0) * zoomLevel + panX;
  const sy = (b.y || 0) * zoomLevel + panY;
  const sw = Math.max(bw * zoomLevel, 80);
  const sh = Math.max(bh * zoomLevel, lineHeight + 4);

  // Colors
  const isDark = document.body.classList.contains("dark-theme") ||
                 document.body.classList.contains("vscode-dark");
  const isTextNode = props.kind === "text";
  let bgColor, textColor;

  if (isTextNode) {
    bgColor = "transparent";
    textColor = props.fill || (isDark ? "#E0E0E0" : "#1C1C1E");
  } else if (props.fill) {
    bgColor = props.fill;
    textColor = hexLuminance(props.fill) < 0.4 ? "#FFFFFF" : "#1C1C1E";
  } else {
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#E0E0E0" : "#1C1C1E";
  }

  const hAlign = props.textAlign || (isTextNode ? "left" : "center");
  const vAlign = props.textVAlign || "top";
  const originalValue = currentValue;

  // Vertical padding
  const topOffset = 2;
  let padTop = 0, padBottom = 0;
  if (vAlign === "top") {
    padTop = topOffset;
  } else if (vAlign === "middle") {
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

  // Border radius
  let borderRadius = "8px";
  if (props.kind === "ellipse") borderRadius = "50%";
  else if (props.kind === "rect" || props.kind === "frame") {
    const cr = props.cornerRadius !== undefined ? Math.round(props.cornerRadius * zoomLevel) : 0;
    borderRadius = `${cr}px`;
  } else if (isTextNode) borderRadius = "0";

  const outlineStyle = isTextNode ? "1px solid #4FC3F7" : "2px solid #4FC3F7";
  const boxShadow = isTextNode ? "none" : "0 2px 8px rgba(0,0,0,0.12)";

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`, `top:${sy}px`,
    `width:${sw}px`, `height:${sh}px`,
    `padding:${padTop}px 0 ${padBottom}px 0`,
    `font:${fontWeight} ${fontSize}px ${fontFamily}`,
    `border:none`,
    `outline:${outlineStyle}`, `outline-offset:-1px`,
    `border-radius:${borderRadius}`,
    `background:${bgColor}`, `color:${textColor}`,
    `resize:none`, `z-index:100`,
    `box-shadow:${boxShadow}`,
    `line-height:${lineHeight}px`,
    `overflow:hidden`, `text-align:${hAlign}`,
    `box-sizing:border-box`,
    `-webkit-text-size-adjust:100%`,
    `word-wrap:break-word`, `white-space:pre-wrap`,
    `overflow-wrap:break-word`,
  ].join(";");

  container.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let lastSyncedValue = currentValue;
  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    renderFn();
    syncFn();
  });

  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;
    if (newVal === originalValue) { renderFn(); return; }
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      if (propKey === "content") measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
      renderFn();
      syncFn();
      if (updatePanelFn) updatePanelFn();
    }
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, originalValue);
      renderFn();
      syncFn();
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  });

  textarea.addEventListener("blur", () => { setTimeout(commit, 150); });
}

/**
 * Setup double-click handler for inline editing on a canvas.
 *
 * @param {Object} opts
 * @param {any}    opts.fdCanvas   — WASM FdCanvas instance getter
 * @param {HTMLCanvasElement} opts.canvasEl — the canvas element
 * @param {HTMLElement} opts.container — overlay container
 * @param {Function} opts.renderFn — render callback
 * @param {Function} opts.syncFn   — text sync callback
 * @param {Function} [opts.updatePanelFn] — properties panel update
 * @param {Function} opts.getPanX  — getter for panX
 * @param {Function} opts.getPanY  — getter for panY
 * @param {Function} opts.getZoom  — getter for zoomLevel
 * @param {Function} opts.screenToScene — coord transform function
 */
function setupInlineEditor(opts) {
  const {
    canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    getPanX, getPanY, getZoom, screenToScene,
  } = opts;

  canvasEl.addEventListener("dblclick", (e) => {
    const fdCanvas = typeof opts.fdCanvas === 'function' ? opts.fdCanvas() : opts.fdCanvas;
    if (!fdCanvas) return;

    const { x, y } = screenToScene(e.clientX, e.clientY, canvasEl);
    const nodeId = fdCanvas.get_selected_id();

    // No selection → create new text node
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        renderFn();
        syncFn();
        const newId = fdCanvas.get_selected_id();
        if (newId) {
          setTimeout(() => openInlineEditor({
            nodeId: newId, propKey: "content", currentValue: "",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }
      e.preventDefault();
      return;
    }

    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props.id) return;

    // Edge → edit/create label
    if (props.kind === "edge") {
      const edgeId = props.id;
      const source = fdCanvas.get_text();
      const edgeBlockRe = new RegExp(`edge\\s+@${edgeId}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 's');
      const edgeMatch = source.match(edgeBlockRe);
      if (edgeMatch) {
        const textChildRe = /text\s+@(\w+)\s+"([^"]*)"/;
        const textMatch = edgeMatch[1].match(textChildRe);
        if (textMatch) {
          fdCanvas.select_by_id(textMatch[1]);
          renderFn();
          openInlineEditor({
            nodeId: textMatch[1], propKey: "content", currentValue: textMatch[2],
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          });
        } else {
          const textId = "label_" + edgeId;
          const esc = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`(edge\\s+@${esc}\\s*\\{)`);
          const m2 = source.match(re);
          if (m2) {
            const insertPos = source.indexOf(m2[0]) + m2[0].length;
            const newSource = source.slice(0, insertPos)
              + `\n  text @${textId} "Label" {}`
              + source.slice(insertPos);
            const textBefore = source;
            fdCanvas.set_text(newSource);
            fdCanvas.push_undo_snapshot(textBefore, newSource);
            renderFn();
            syncFn();
            fdCanvas.select_by_id(textId);
            renderFn();
            setTimeout(() => openInlineEditor({
              nodeId: textId, propKey: "content", currentValue: "Label",
              fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
              panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
            }), 50);
          }
        }
      }
      e.preventDefault();
      return;
    }

    const isText = props.kind === "text";
    const isShape = props.kind === "rect" || props.kind === "ellipse" || props.kind === "frame";
    if (!isText && !isShape) return;

    if (isText) {
      openInlineEditor({
        nodeId: props.id, propKey: "content", currentValue: props.content || "",
        fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
        panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
      });
    } else {
      const existingTextId = fdCanvas.get_text_child_id(props.id);
      if (existingTextId) {
        fdCanvas.select_by_id(existingTextId);
        renderFn();
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        openInlineEditor({
          nodeId: existingTextId, propKey: "content", currentValue: childProps.content || "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        });
      } else {
        const newTextId = fdCanvas.create_child_text(props.id, "Text");
        if (newTextId) {
          renderFn();
          syncFn();
          setTimeout(() => openInlineEditor({
            nodeId: newTextId, propKey: "content", currentValue: "Text",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }
    }
    e.preventDefault();
  });
}
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
let handPanClientStartX = null;  // Track click vs drag for deselect
let handPanClientStartY = null;

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

/** Current view mode: "design" | "specs" */
let viewMode = "design";

/** Current note filter: "all" | "todo" | "doing" | "done" | "blocked" */
let noteFilter = "all";

/** Note badge toggle — independent of view mode */
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
/** Whether the scene has edge flow animations (pulse/dash) — keeps render loop alive */
let hasFlowEdges = false;

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
  if (!fdCanvas || !nodeId || reduceMotion) return;

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

// ─── Gesture Constants ──────────────────────────────────────────────────
const ZOOM_WHEEL_FACTOR = 1.04;
let canvasDragOccurred = false; // tracks whether a real canvas drag happened (for post-drop menu)

// ─── Post-drop reparent context menu ────────────────────────────────────
function showDropContextMenu(clientX, clientY, selectedId, hitId) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu ctx-menu-visible';
  menu.style.cssText = `position:fixed;left:${clientX}px;top:${clientY}px;z-index:200;
    min-width:160px;padding:4px;background:var(--vscode-menu-background,#1e1e1e);
    border:1px solid var(--vscode-menu-border,#454545);border-radius:8px;
    box-shadow:0 8px 30px rgba(0,0,0,0.3);font-size:12px;`;

  const items = [
    { icon: '📦', label: `Nest into @${hitId}`, action: 'nest' },
    { icon: '⊙', label: `Center in @${hitId}`, action: 'center-nest' },
  ];

  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'ctx-menu-item';
    el.innerHTML = `<span class="ctx-menu-icon">${item.icon}</span><span class="ctx-menu-label">${item.label}</span>`;
    el.addEventListener('click', () => {
      menu.remove();
      let changed = false;
      if (item.action === 'nest') {
        changed = fdCanvas.reparent_into(selectedId, hitId);
      } else if (item.action === 'center-nest') {
        changed = fdCanvas.reparent_into_centered
          ? fdCanvas.reparent_into_centered(selectedId, hitId)
          : fdCanvas.reparent_into(selectedId, hitId);
      }
      if (changed) {
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        showToast(`Nested into @${hitId}`);
      }
    });
    menu.appendChild(el);
  }

  document.body.appendChild(menu);

  // Auto-dismiss on click elsewhere
  const dismiss = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('pointerdown', dismiss, true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0);
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

    // Middle-click or Space+click → always pan
    if (e.button === 1 || isPanning) {
      panDragging = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      canvas.style.cursor = "grabbing";
      canvasPointerId = e.pointerId;
      e.preventDefault();
      return;
    }

    // Hand tool: finger/mouse → pan; Apple Pencil → fall through to Select (WASM)
    if (fdCanvas.get_tool_name() === 'hand' && e.pointerType !== 'pen') {
      panDragging = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      handPanClientStartX = e.clientX;
      handPanClientStartY = e.clientY;
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

    // Alt+drag duplication is handled entirely by WASM via
    // duplicate_selected_at(0,0) — JS only tracks altCloneActive
    // to suppress the style-picker eyedropper on pointer-up.
    const isAlt = e.altKey || modAltHeld;
    if (isAlt && !e.metaKey && !e.ctrlKey) {
      const hitId = fdCanvas.hit_test_at(x, y);
      if (hitId) {
        altCloneActive = true;
        // Switch to select for drawing tools so WASM sees SelectTool
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

    // Update pointer type for adaptive hit radii (iPad touch/pencil)
    if (fdCanvas.set_pointer_type) {
      const pt = e.pointerType === 'touch' ? 1 : e.pointerType === 'pen' ? 2 : 0;
      fdCanvas.set_pointer_type(pt);
    }

    const changed = fdCanvas.handle_pointer_down(
      x,
      y,
      e.pressure || 1.0,
      e.shiftKey,
      e.ctrlKey,
      isAlt,
      e.metaKey
    );
    if (changed) render();
    canvasPointerId = e.pointerId;
    canvasDragOccurred = false; // reset drag tracking

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

    const isAltMove = e.altKey || modAltHeld;
    const moveResult = JSON.parse(fdCanvas.handle_pointer_move(
      x,
      y,
      e.pressure || 1.0,
      e.shiftKey,
      e.ctrlKey,
      isAltMove,
      e.metaKey
    ));
    const changed = moveResult.changed;
    if (changed) { render(); canvasDragOccurred = true; }

    // ── Canvas→Layers cross-drag: highlight layer items when pointer enters Layers panel ──
    if (canvasDragOccurred && canvasPointerId !== -1) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId) {
        const layersPanel = document.getElementById('layers-panel');
        const panelRect = layersPanel?.getBoundingClientRect();
        const overLayers = panelRect && e.clientX >= panelRect.left && e.clientX <= panelRect.right
          && e.clientY >= panelRect.top && e.clientY <= panelRect.bottom;

        if (overLayers) {
          const elUnder = document.elementFromPoint(e.clientX, e.clientY);
          const layerItem = elUnder?.closest('.layer-item');
          if (layersPanel) clearLayerDragIndicators(layersPanel);

          if (layerItem) {
            const targetId = layerItem.getAttribute('data-node-id');
            if (targetId && targetId !== selectedId) {
              const zone = getDropZone(e, layerItem);
              const kind = layerItem.getAttribute('data-node-kind');
              const isContainer = ['rect','ellipse','frame','group'].includes(kind);
              if (zone === 'nest' && isContainer) {
                layerItem.classList.add('drag-over-nest');
              } else if (zone === 'above') {
                layerItem.classList.add('drag-over-above');
              } else {
                layerItem.classList.add('drag-over-below');
              }
            }
          } else if (elUnder?.closest('.layers-body')) {
            const body = layersPanel.querySelector('.layers-body');
            if (body) body.classList.add('drag-over-root');
          }

          // Show ghost label
          let ghost = document.getElementById('canvas-drag-ghost');
          if (!ghost) {
            ghost = document.createElement('div');
            ghost.id = 'canvas-drag-ghost';
            ghost.style.cssText = 'position:fixed;z-index:300;pointer-events:none;' +
              'padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;' +
              'font-family:var(--vscode-editor-font-family,monospace);' +
              'color:var(--vscode-focusBorder,#007AFF);' +
              'background:var(--vscode-menu-background,#1e1e1e);' +
              'border:1px solid var(--vscode-focusBorder,#007AFF);' +
              'box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;';
            document.body.appendChild(ghost);
          }
          ghost.textContent = `@${selectedId}`;
          ghost.style.left = (e.clientX + 12) + 'px';
          ghost.style.top = (e.clientY - 8) + 'px';
          ghost.style.display = 'block';
        } else {
          const layersPanel2 = document.getElementById('layers-panel');
          if (layersPanel2) clearLayerDragIndicators(layersPanel2);
          const ghost = document.getElementById('canvas-drag-ghost');
          if (ghost) ghost.style.display = 'none';
        }
      }
    }

    // Read ghost origin bounds for Alt+drag preview
    if (altCloneActive && fdCanvas.get_alt_drag_ghost) {
      try {
        const ghostJson = fdCanvas.get_alt_drag_ghost();
        altDragGhosts = ghostJson ? JSON.parse(ghostJson) : [];
      } catch (_) { altDragGhosts = []; }
    }
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
        // Moving: show (X, Y) from bundled bounds (no extra WASM calls)
        if (changed && moveResult.bounds) {
          const b = moveResult.bounds;
          showDimensionTooltip(e.clientX, e.clientY, `(${Math.round(b.x)}, ${Math.round(b.y)})`);
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

      // (⌘+drag reparent removed — reparent via Layers panel drag-drop or post-drop menu)
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
      handPanClientStartX = null;
      handPanClientStartY = null;
      canvas.style.cursor = (isPanning || fdCanvas.get_tool_name() === 'hand') ? "grab" : "";
      // Re-apply modifier cursors if modifier keys still held after pan
      if (fdCanvas.get_tool_name() === 'hand') {
        if (e.metaKey && !e.altKey) {
          canvas.classList.add('modifier-cmd-select');
        } else if (e.altKey && !e.metaKey) {
          canvas.classList.add('modifier-alt');
        }
      }
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;
    const isAltUp = e.altKey || modAltHeld;
    const resultJson = fdCanvas.handle_pointer_up(
      x,
      y,
      e.shiftKey,
      e.ctrlKey,
      isAltUp,
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
    if (isAltUp && !altCloneActive && !cmdTempSelectActive && result.changed) {
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
    // Notify extension of canvas selection (for Code ↔ Canvas sync)
    // Skip during inline editing — prevents focus stealing that kills the textarea
    if (!inlineEditorActive) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId !== lastNotifiedSelectedId) {
        // Selection changed — full sync (panels + code highlight)
        syncSelection(selectedId, "canvas");
      } else if (selectedId) {
        // Same node re-clicked — re-highlight code ("show me the code" intent)
        vscode.postMessage({ type: "nodeSelected", id: selectedId });
      }
    }

    // Hide dimension tooltip
    pointerIsDown = false;
    hideDimensionTooltip();

    // Animation drop on release removed (bug #4)

    // ── Post-drop reparent context menu ──
    const wasDragging = canvasDragOccurred;
    canvasDragOccurred = false;

    // Clean up ghost label
    const ghost = document.getElementById('canvas-drag-ghost');
    if (ghost) ghost.style.display = 'none';

    // ── Canvas→Layers cross-drop ──
    let canvasToLayersDone = false;
    if (wasDragging) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId) {
        const layersPanel = document.getElementById('layers-panel');
        const panelRect = layersPanel?.getBoundingClientRect();
        const overLayers = panelRect && e.clientX >= panelRect.left && e.clientX <= panelRect.right
          && e.clientY >= panelRect.top && e.clientY <= panelRect.bottom;

        if (overLayers && layersPanel) {
          clearLayerDragIndicators(layersPanel);
          const elUnder = document.elementFromPoint(e.clientX, e.clientY);
          const layerItem = elUnder?.closest('.layer-item');
          const textBefore = fdCanvas.get_text();
          let changed = false;

          if (layerItem) {
            const targetId = layerItem.getAttribute('data-node-id');
            if (targetId && targetId !== selectedId) {
              const zone = getDropZone(e, layerItem);
              const kind = layerItem.getAttribute('data-node-kind');
              const isContainer = ['rect','ellipse','frame','group'].includes(kind);

              if (zone === 'nest' && isContainer) {
                changed = fdCanvas.reparent_into(selectedId, targetId);
              } else {
                const targetIndex = getSiblingIndex(layersPanel, targetId);
                const insertIndex = zone === 'above' ? targetIndex : targetIndex + 1;
                const targetItem = layersPanel.querySelector(`.layer-item[data-node-id="${targetId}"]`);
                const dragItem = layersPanel.querySelector(`.layer-item[data-node-id="${selectedId}"]`);
                const targetParent = targetItem?.parentElement?.getAttribute?.('data-parent-id');
                const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id');
                if (targetParent && dragParent && targetParent === dragParent) {
                  changed = fdCanvas.reorder_child(selectedId, insertIndex);
                } else if (targetParent) {
                  changed = fdCanvas.reparent_into(selectedId, targetParent);
                  if (changed) fdCanvas.reorder_child(selectedId, insertIndex);
                } else {
                  changed = fdCanvas.reparent_into(selectedId, 'root');
                  if (changed) fdCanvas.reorder_child(selectedId, insertIndex);
                }
              }
            }
          } else if (elUnder?.closest('.layers-body')) {
            const parentId = fdCanvas.get_parent_id ? fdCanvas.get_parent_id(selectedId) : '';
            if (parentId) {
              changed = fdCanvas.reparent_into(selectedId, 'root');
            }
          }

          if (changed) {
            const textAfter = fdCanvas.get_text();
            if (textBefore !== textAfter) {
              vscode.postMessage({ type: 'pushUndo', textBefore, textAfter });
            }
            render();
            syncTextToExtension();
            updatePropertiesPanel();
            refreshLayersPanel();
            showToast(`Moved @${selectedId}`);
            canvasToLayersDone = true;
          }
        }
      }
    }

    if (wasDragging && !canvasToLayersDone && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId && fdCanvas.hit_test_at_excluding) {
        try {
          const hitId = fdCanvas.hit_test_at_excluding(x, y, selectedId);
          if (hitId && hitId !== selectedId) {
            const containerKinds = ['rect', 'ellipse', 'frame', 'group'];
            const hitKind = fdCanvas.get_node_kind ? fdCanvas.get_node_kind(hitId) : '';
            if (containerKinds.includes(hitKind)) {
              const parentId = fdCanvas.get_parent_id ? fdCanvas.get_parent_id(selectedId) : '';
              if (parentId !== hitId) {
                showDropContextMenu(e.clientX, e.clientY, selectedId, hitId);
              }
            }
          }
        } catch (_) { /* hit_test_at_excluding or get_node_kind may not exist */ }
      }
    }

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

    // ── Post-release: remeasure text bounds after resize ──
    // When a text node is resized (sets max_width) or a parent shape is
    // resized (propagates max_width to child text), JS measureText() gives
    // the accurate wrapped height that the heuristic can only estimate.
    if (result.changed && fdCanvas) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId) {
        // If selected node is text → measure it directly
        measureAndUpdateTextBounds(selectedId);
        // If selected node is a parent → measure all text children
        try {
          const childIds = JSON.parse(fdCanvas.get_text_children(selectedId));
          for (const childId of childIds) {
            measureAndUpdateTextBounds(childId);
          }
        } catch (_) { /* ignore parse errors */ }
        render();
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
    altDragGhosts = [];

    // Re-apply modifier cursors if modifier keys still held after pointer-up
    if (fdCanvas.get_tool_name() === 'hand') {
      if (e.metaKey && !e.altKey) {
        canvas.classList.add('modifier-cmd-select');
      } else if (e.altKey && !e.metaKey) {
        canvas.classList.add('modifier-alt');
      }
    }

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
    // Pinch-to-zoom on trackpad fires as wheel with ctrlKey
    // Also allow zoom while panning (Space held)
    if (e.ctrlKey || e.metaKey || isPanning) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      zoomAtPoint(mx, my, e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR);
    } else {
      // Let native trackpad momentum handle scroll for smooth pan
      panX -= e.deltaX;
      panY -= e.deltaY;
      render();
    }
  }, { passive: false });
}

// ─── Touch & Gesture Support ───────────────────────────────────────────────
// Gesture hierarchy: 1-finger = object, 2-finger = viewport, 3-finger = edit, 4-finger = app.

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

  // Velocity history for weighted average
  let velocityHistory = [];

  // ── 3-finger tap/double-tap state (undo/redo) ──
  let threeFingerTouchStart = 0;
  let threeFingerStartPositions = [];
  let lastThreeFingerTapTime = 0;

  // ── 3-finger pinch state (copy/paste) ──
  let threeFingerStartArea = 0;
  let threeFingerPinchHandled = false;

  // ── 3-finger long-press state (edit menu) ──
  let threeFingerLongPressTimer = null;

  // ── 4-finger state ──
  let fourFingerTouchStart = 0;
  let fourFingerStartPositions = [];
  let fourFingerHandled = false;

  // Tool cycle order (matches toolbar visual order)
  const TOOL_CYCLE = ['hand', 'select', 'rect', 'ellipse', 'pen', 'arrow', 'text', 'eraser'];

  function applyInertia() {
    const friction = 0.95;
    inertiaVx *= friction;
    inertiaVy *= friction;
    if (Math.abs(inertiaVx) < 0.1 && Math.abs(inertiaVy) < 0.1) {
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
      const initialDist = pinchDistance(touches[0], touches[1]);
      // Smart disambiguation: reject if fingers too close (accidental palm)
      if (initialDist < 30) {
        return;
      }
      lastPinchDist = initialDist;
      lastPinchCenter = pinchCenter(touches[0], touches[1]);
      velocityHistory = [];
      e.preventDefault();
    }

    if (count === 3) {
      // Start three-finger gesture detection (swipe/tap/pinch/long-press)
      isGesturing = true;
      threeFingerHandled = false;
      threeFingerPinchHandled = false;
      const touches = [...activeTouches.values()];
      threeFingerStartX = touches.reduce((s, t) => s + t.clientX, 0) / 3;
      threeFingerTouchStart = performance.now();
      threeFingerStartPositions = touches.map(t => ({ x: t.clientX, y: t.clientY }));

      // Compute bounding area for pinch detection
      const xs = touches.map(t => t.clientX);
      const ys = touches.map(t => t.clientY);
      threeFingerStartArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));

      // Start 3-finger long-press timer (500ms → edit menu)
      if (threeFingerLongPressTimer) clearTimeout(threeFingerLongPressTimer);
      threeFingerLongPressTimer = setTimeout(() => {
        threeFingerLongPressTimer = null;
        if (activeTouches.size === 3 && !threeFingerHandled && !threeFingerPinchHandled) {
          threeFingerHandled = true;
          showThreeFingerEditMenu(touches);
        }
      }, 500);

      e.preventDefault();
    }

    if (count === 4) {
      // Start four-finger gesture detection (tap/swipe)
      isGesturing = true;
      fourFingerHandled = false;
      const touches = [...activeTouches.values()];
      fourFingerTouchStart = performance.now();
      fourFingerStartPositions = touches.map(t => ({ x: t.clientX, y: t.clientY }));
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

      // Track velocity for inertia (weighted 3-frame average)
      const now = performance.now();
      const dt = now - lastPanTime || 16;
      const frameVx = dx * (16 / dt);
      const frameVy = dy * (16 / dt);
      velocityHistory.push({ vx: frameVx, vy: frameVy });
      if (velocityHistory.length > 3) velocityHistory.shift();
      // Weighted average: recent frames count more
      const weights = velocityHistory.length === 3 ? [0.2, 0.3, 0.5] :
                      velocityHistory.length === 2 ? [0.4, 0.6] : [1.0];
      inertiaVx = 0; inertiaVy = 0;
      for (let i = 0; i < velocityHistory.length; i++) {
        inertiaVx += velocityHistory[i].vx * weights[i];
        inertiaVy += velocityHistory[i].vy * weights[i];
      }
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
        if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
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

      // ── 3-finger pinch detection (copy / paste) ──
      if (!threeFingerPinchHandled && threeFingerStartArea > 0) {
        const xs = touches.map(t => t.clientX);
        const ys = touches.map(t => t.clientY);
        const currentArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        const ratio = currentArea / threeFingerStartArea;

        if (ratio < 0.4) {
          // Pinch-in → copy
          threeFingerPinchHandled = true;
          threeFingerHandled = true;
          if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
          copySelectedAsFd();
          showToast('Copied');
          e.preventDefault();
        } else if (ratio > 2.5) {
          // Pinch-out → paste
          threeFingerPinchHandled = true;
          threeFingerHandled = true;
          if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
          pasteFromClipboard();
          e.preventDefault();
        }
      }
    }

    // ── 4-finger swipe detection ──
    if (count === 4 && !fourFingerHandled) {
      const touches = [...activeTouches.values()];
      const avgX = touches.reduce((s, t) => s + t.clientX, 0) / 4;
      const avgY = touches.reduce((s, t) => s + t.clientY, 0) / 4;
      const startAvgX = fourFingerStartPositions.reduce((s, p) => s + p.x, 0) / 4;
      const startAvgY = fourFingerStartPositions.reduce((s, p) => s + p.y, 0) / 4;
      const dx = avgX - startAvgX;
      const dy = avgY - startAvgY;

      const SWIPE_THRESHOLD = 50;

      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        fourFingerHandled = true;
        if (dy < 0) {
          // Swipe up → zoom-to-fit
          zoomToFit();
        } else {
          // Swipe down → zoom-to-selection (or reset to 100%)
          if (fdCanvas) {
            const selectedId = fdCanvas.get_selected_id();
            if (selectedId) {
              zoomToSelection();
            } else {
              // No selection → reset to 100%
              const container = document.getElementById("canvas-container");
              const cw = container.clientWidth;
              const ch = container.clientHeight;
              zoomLevel = 1.0;
              panX = cw / 2;
              panY = ch / 2;
              updateZoomIndicator();
              render();
            }
          }
        }
        e.preventDefault();
      } else if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe → cycle tool
        fourFingerHandled = true;
        if (fdCanvas) {
          const currentTool = fdCanvas.get_tool_name();
          const currentIdx = TOOL_CYCLE.indexOf(currentTool);
          const dir = dx > 0 ? 1 : -1;
          const nextIdx = (currentIdx + dir + TOOL_CYCLE.length) % TOOL_CYCLE.length;
          const nextTool = TOOL_CYCLE[nextIdx];
          fdCanvas.set_tool(nextTool);
          updateToolbarActive(nextTool);
          canvas.style.cursor = (nextTool === 'select' || nextTool === 'eraser' || nextTool === 'hand') ? '' : 'crosshair';
          if (nextTool === 'hand') canvas.style.cursor = 'grab';
          showToast(nextTool.charAt(0).toUpperCase() + nextTool.slice(1));
        }
        e.preventDefault();
      }
    }
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    const prevCount = activeTouches.size;
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }

    clearLongPress();
    if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }

    // Check if pencil lifted
    for (const t of e.changedTouches) {
      if (t.touchType === "stylus") {
        pencilActive = false;
      }
    }

    // ── 3-finger tap / double-tap detection (undo / redo) ──
    if (prevCount === 3 && activeTouches.size === 0 && !threeFingerHandled && !threeFingerPinchHandled) {
      const elapsed = performance.now() - threeFingerTouchStart;
      if (elapsed < 200) {
        const maxMove = threeFingerStartPositions.reduce((max, p, i) => {
          const endT = e.changedTouches[i];
          if (!endT) return max;
          const dist = Math.hypot(endT.clientX - p.x, endT.clientY - p.y);
          return Math.max(max, dist);
        }, 0);

        if (maxMove < 15) {
          const now = performance.now();
          if (now - lastThreeFingerTapTime < 400) {
            // Double-tap → redo
            lastThreeFingerTapTime = 0;
            if (fdCanvas) {
              const resultJson = fdCanvas.handle_key("z", false, true, false, true);
              const result = JSON.parse(resultJson);
              if (result.changed) {
                render();
                syncTextToExtension();
              }
            }
          } else {
            // Single tap → schedule undo (wait for potential double-tap)
            lastThreeFingerTapTime = now;
            setTimeout(() => {
              if (lastThreeFingerTapTime === now && fdCanvas) {
                const resultJson = fdCanvas.handle_key("z", false, false, false, true);
                const result = JSON.parse(resultJson);
                if (result.changed) {
                  render();
                  syncTextToExtension();
                }
              }
            }, 400);
          }
        }
      }
    }

    // ── 4-finger tap detection (fullscreen toggle) ──
    if (prevCount === 4 && activeTouches.size === 0 && !fourFingerHandled) {
      const elapsed = performance.now() - fourFingerTouchStart;
      if (elapsed < 250) {
        const maxMove = fourFingerStartPositions.reduce((max, p, i) => {
          const endT = e.changedTouches[i];
          if (!endT) return max;
          const dist = Math.hypot(endT.clientX - p.x, endT.clientY - p.y);
          return Math.max(max, dist);
        }, 0);

        if (maxMove < 20) {
          // Toggle fullscreen mode
          const isFull = document.body.classList.contains("fullscreen-mode");
          applyFullscreenMode(!isFull);
          vscode.setState({ ...(vscode.getState() || {}), fullscreenMode: !isFull });
        }
      }
    }

    // Start inertia if two-finger gesture just ended
    if (activeTouches.size === 0 && isGesturing) {
      isGesturing = false;
      lastPinchDist = 0;
      if (!reduceMotion && (Math.abs(inertiaVx) > 1 || Math.abs(inertiaVy) > 1)) {
        inertiaRaf = requestAnimationFrame(applyInertia);
      }
    }
  });

  canvas.addEventListener("touchcancel", (e) => {
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }
    clearLongPress();
    if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
    cancelInertia();
    isGesturing = false;
    pencilActive = false;
  });

  // ── 3-finger long-press edit menu ──
  function showThreeFingerEditMenu(touches) {
    const cx = touches.reduce((s, t) => s + t.clientX, 0) / 3;
    const cy = touches.reduce((s, t) => s + t.clientY, 0) / 3;

    const existing = document.getElementById('three-finger-edit-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'three-finger-edit-menu';
    menu.style.cssText = `
      position: fixed; left: ${cx}px; top: ${cy - 50}px; transform: translateX(-50%);
      display: flex; gap: 2px; padding: 6px 8px;
      background: rgba(30,30,30,0.92); backdrop-filter: blur(12px);
      border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      z-index: 10001; font-size: 13px; color: #fff; user-select: none;
    `;

    const actions = [
      { label: 'Undo', fn: () => { if (!fdCanvas) return; const r = JSON.parse(fdCanvas.handle_key("z", false, false, false, true)); if (r.changed) { render(); syncTextToExtension(); } } },
      { label: 'Redo', fn: () => { if (!fdCanvas) return; const r = JSON.parse(fdCanvas.handle_key("z", false, true, false, true)); if (r.changed) { render(); syncTextToExtension(); } } },
      { label: 'Cut', fn: () => cutSelectedAsFd() },
      { label: 'Copy', fn: () => { copySelectedAsFd(); showToast('Copied'); } },
      { label: 'Paste', fn: () => pasteFromClipboard() },
    ];

    for (const action of actions) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = `
        border: none; background: transparent; color: #fff; padding: 6px 12px;
        cursor: pointer; border-radius: 6px; font-size: 13px; font-weight: 500;
      `;
      btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(255,255,255,0.15)'; });
      btn.addEventListener('pointerleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        action.fn();
        menu.remove();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    const dismiss = () => { menu.remove(); document.removeEventListener('pointerdown', dismiss); };
    setTimeout(dismiss, 3000);
    setTimeout(() => document.addEventListener('pointerdown', dismiss), 100);
  }
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

  // 4. Code: notify extension to highlight block(s) (skip if source is code)
  if (source !== "code") {
    // Send all selected IDs for multi-select code highlighting
    try {
      const allIds = JSON.parse(fdCanvas.get_selected_ids());
      if (allIds.length > 0) {
        vscode.postMessage({ type: "nodesSelected", ids: allIds });
      } else {
        vscode.postMessage({ type: "nodeSelected", id: id || "" });
      }
    } catch (_) {
      vscode.postMessage({ type: "nodeSelected", id: id || "" });
    }
  }

  // 5. Canvas focus: debounced pan/zoom (only for Code→Canvas)
  if (source === "code" && id) {
    clearTimeout(codeFocusDebounceTimer);
    codeFocusDebounceTimer = setTimeout(() => focusOnNode(id), 150);
  }

  // 6. Side panels
  updatePropertiesPanel();
  // FAB is canvas-contextual — only show when selecting via canvas click
  if (source === "canvas") updateFloatingBar();
  else hideFloatingBar();
}

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "setText": {
      if (!fdCanvas) return;
      suppressTextSync = true;
      const resultJson = fdCanvas.set_text(message.text);
      lastSyncedText = message.text; // Keep dedup in sync
      bumpGeneration(); // External text change — invalidate caches
      try {
        const r = JSON.parse(resultJson);
        if (r.layout_changed) {
          measureAllTextNodes(); // Tight text bounds after code edit
          render();
        }
      } catch (_) {
        measureAllTextNodes();
        render();
      }
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
      updateToolbarActive(message.tool);
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

// ─── Global modifier key tracking ────────────────────────────────────────
// macOS Option/Alt pressed mid-drag may not update e.altKey on pointermove
// in Electron/VS Code webviews. Track state explicitly via keydown/keyup.
let modAltHeld = false;
let modCtrlHeld = false;
let modMetaHeld = false;
let modShiftHeld = false;

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

  // ── Esc cancels active drag (node move/resize/draw) ──
  if (e.key === "Escape" && pointerIsDown && fdCanvas) {
    const cancelled = fdCanvas.cancel_drag();
    if (cancelled) {
      // Reset all JS-side drag state
      pointerIsDown = false;
      isDraggingNode = false;
      draggedNodeId = null;
      nearDetachState = null;
      altCloneActive = false;
      altDragGhosts = [];
      hideDimensionTooltip();

      // Restore tool after ⌘+drag temp Select or Alt+drag clone
      if (cmdTempSelectActive && cmdTempSelectOriginalTool) {
        fdCanvas.set_tool(cmdTempSelectOriginalTool);
        updateToolbarActive(lockedTool || cmdTempSelectOriginalTool);
        updateCanvasCursor(cmdTempSelectOriginalTool);
      }
      cmdTempSelectActive = false;
      cmdTempSelectOriginalTool = null;

      // Restore tool after Ctrl temp Eraser
      if (tempEraserMode && tempEraserPrevTool) {
        fdCanvas.set_tool(tempEraserPrevTool);
        updateToolbarActive(lockedTool || tempEraserPrevTool);
        updateCanvasCursor(tempEraserPrevTool);
      }
      tempEraserMode = false;
      tempEraserPrevTool = null;

      render();
      e.preventDefault();
      return;
    }
  }

  // Layered Escape dismissal — one layer per press (Figma-style)
  if (e.key === "Escape") {
    const ctxVisible = ctxMenu.isOpen;
    const annotVisible = !!annotationCardNodeId;
    const helpVisible = shortcutHelpVisible;
    const isFull = document.body.classList.contains("fullscreen-mode");

    if (ctxVisible) {
      closeContextMenu();
    } else if (annotVisible) {
      closeAnnotationCard();
    } else if (helpVisible) {
      closeShortcutHelp();
    } else if (isFull) {
      applyFullscreenMode(false);
      vscode.setState({ ...(vscode.getState() || {}), fullscreenMode: false });
    } else if (lockedTool) {
      unlockTool();
    } else if (fdCanvas && fdCanvas.get_selected_id()) {
      // Nothing else to dismiss → deselect all
      fdCanvas.select_by_id('');
      bumpGeneration();
      render();
      syncSelection('', 'keyboard');
    }
  }

  // ── Shift+F: toggle fullscreen ──
  if (e.key === "F" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    const isFull = document.body.classList.contains("fullscreen-mode");
    applyFullscreenMode(!isFull);
    vscode.setState({ ...(vscode.getState() || {}), fullscreenMode: !isFull });
    return;
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
        layersPanel.classList.toggle("fs-visible");
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

  // ── V key: unlock tool if locked ──
  if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
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
    bumpGeneration();
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
  // Always update tracked modifier state (even mid-drag)
  if (e.key === "Alt") modAltHeld = true;
  if (e.key === "Control") modCtrlHeld = true;
  if (e.key === "Meta") modMetaHeld = true;
  if (e.key === "Shift") modShiftHeld = true;

  // Skip cursor preview if pointer is already down (active interaction)
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
  // Always update tracked modifier state
  if (e.key === "Alt") modAltHeld = false;
  if (e.key === "Control") modCtrlHeld = false;
  if (e.key === "Meta") modMetaHeld = false;
  if (e.key === "Shift") modShiftHeld = false;

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

// Clear modifier cursors and tracked state when window loses focus
window.addEventListener("blur", () => {
  clearModifierCursors();
  modAltHeld = false;
  modCtrlHeld = false;
  modMetaHeld = false;
  modShiftHeld = false;
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
        <button class="help-close" aria-label="Close">×</button>
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
    const moveResultJson = fdCanvas.handle_pointer_move(cx + dx, cy + dy, 1.0, false, false, false, false);
    const moveResult = JSON.parse(moveResultJson);
    const upResult = JSON.parse(fdCanvas.handle_pointer_up(cx + dx, cy + dy, false, false, false, false));
    if (upResult.changed || moveResult.changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  } catch (_) { /* skip */ }
}

// ─── Annotation Card ───────────────────────────────────────────────────────

// ─── Unified Context Menu Class ────────────────────────────────────────────
/**
 * Data-driven context menu with robust dismiss, keyboard nav, and ARIA.
 * Singleton — calling open() closes any previous menu first.
 */
class ContextMenu {
  constructor() {
    this._el = null;
    this._ac = null; // AbortController
    this._activeIdx = -1;
    this._onAction = null;
    this._items = [];
  }
  get isOpen() { return this._el !== null; }

  open({ items, x, y, onAction }) {
    this.close();
    this._items = items;
    this._onAction = onAction;
    this._activeIdx = -1;
    this._ac = new AbortController();
    const sig = this._ac.signal;

    const el = document.createElement('div');
    el.className = 'ctx-menu';
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;
    this._el = el;

    // Render items
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-sep';
        sep.setAttribute('role', 'separator');
        el.appendChild(sep);
      } else if (item.type === 'header') {
        const hdr = document.createElement('div');
        hdr.className = 'ctx-menu-header';
        hdr.textContent = item.label;
        el.appendChild(hdr);
      } else if (item.type === 'custom' && item.render) {
        const wrap = document.createElement('div');
        wrap.className = 'ctx-menu-custom';
        item.render(wrap);
        el.appendChild(wrap);
      } else {
        const row = document.createElement('div');
        row.className = 'ctx-menu-item';
        if (item.danger) row.classList.add('ctx-menu-danger');
        if (item.disabled) row.classList.add('ctx-menu-disabled');
        row.setAttribute('role', 'menuitem');
        row.setAttribute('data-action', item.action || '');
        if (item.data) {
          for (const [k, v] of Object.entries(item.data)) {
            row.setAttribute('data-' + k, v);
          }
        }
        if (item.icon) {
          const ic = document.createElement('span');
          ic.className = 'ctx-menu-icon';
          ic.textContent = item.icon;
          row.appendChild(ic);
        }
        const lbl = document.createElement('span');
        lbl.className = 'ctx-menu-label';
        lbl.textContent = item.label;
        row.appendChild(lbl);
        if (item.shortcut) {
          const sc = document.createElement('span');
          sc.className = 'ctx-menu-shortcut';
          sc.textContent = item.shortcut;
          row.appendChild(sc);
        }
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.disabled) return;
          this.close();
          if (this._onAction) this._onAction(item.action, row);
        }, { signal: sig });
        el.appendChild(row);
      }
    }

    // Position (use canvas-container for relative positioning in VS Code webview)
    const container = document.getElementById('canvas-container');
    if (container) {
      container.appendChild(el);
      const cRect = container.getBoundingClientRect();
      let left = x - cRect.left;
      let top = y - cRect.top;
      // Clamp to viewport
      requestAnimationFrame(() => {
        const mw = el.offsetWidth;
        const mh = el.offsetHeight;
        if (left + mw > cRect.width) left = cRect.width - mw - 4;
        if (top + mh > cRect.height) top = cRect.height - mh - 4;
        if (left < 0) left = 4;
        if (top < 0) top = 4;
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.classList.add('ctx-menu-visible');
        el.focus();
      });
    } else {
      document.body.appendChild(el);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      requestAnimationFrame(() => {
        el.classList.add('ctx-menu-visible');
        el.focus();
      });
    }

    // Dismiss listeners (capture phase to beat stopPropagation)
    document.addEventListener('pointerdown', (e) => {
      if (!el.contains(e.target)) this.close();
    }, { capture: true, signal: sig });
    window.addEventListener('blur', () => this.close(), { signal: sig });
    window.addEventListener('resize', () => this.close(), { signal: sig });

    // Keyboard nav (capture phase)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      const actionItems = el.querySelectorAll('.ctx-menu-item:not(.ctx-menu-disabled)');
      if (!actionItems.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._activeIdx = (this._activeIdx + 1) % actionItems.length;
        this._highlight(actionItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._activeIdx = (this._activeIdx - 1 + actionItems.length) % actionItems.length;
        this._highlight(actionItems);
      } else if (e.key === 'Enter' && this._activeIdx >= 0) {
        e.preventDefault();
        actionItems[this._activeIdx]?.click();
      }
    }, { capture: true, signal: sig });
  }

  close() {
    if (this._ac) { this._ac.abort(); this._ac = null; }
    if (this._el) { this._el.remove(); this._el = null; }
    this._activeIdx = -1;
    this._onAction = null;
  }

  _highlight(items) {
    items.forEach(el => el.classList.remove('ctx-menu-active'));
    if (this._activeIdx >= 0 && this._activeIdx < items.length) {
      items[this._activeIdx].classList.add('ctx-menu-active');
      items[this._activeIdx].scrollIntoView({ block: 'nearest' });
    }
  }
}

const ctxMenu = new ContextMenu();

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
    <button class="card-close" style="font-size:14px" aria-label="Close">×</button>
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

/** Build context menu items for when a node is right-clicked */
function buildNodeMenuItems(hitId, selectedIds) {
  const isSingle = selectedIds.length <= 1;
  const canGroup = selectedIds.length >= 2;
  const source = fdCanvas.get_text();
  let canUngroup = false;
  for (const id of selectedIds) {
    if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) { canUngroup = true; break; }
  }
  const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(hitId) : false;
  const hasSpec = nodeHasSpec(hitId);

  const items = [];

  // AI Touch submenu (VS Code specific — uses custom render)
  items.push({
    action: 'ai-touch', label: 'AI Touch', icon: '✦', shortcut: '▸',
    type: 'custom',
    render: (wrap) => {
      wrap.className = 'menu-item-wrap ctx-ai-touch-wrap';
      wrap.id = 'ctx-ai-touch-wrap-dyn';
      wrap.innerHTML = `
        <div class="ctx-menu-item" role="menuitem" data-action="ai-touch">
          <span class="ctx-menu-icon">✦</span>
          <span class="ctx-menu-label">AI Touch</span>
          <span class="ctx-menu-shortcut">▸</span>
        </div>
        <div class="ctx-ai-submenu" id="ctx-ai-submenu-dyn">
          <textarea class="ctx-ai-prompt" id="ctx-ai-prompt-dyn" placeholder="e.g. Make it Apple HIG style" maxlength="200" rows="2"></textarea>
          <div class="ctx-ai-footer">
            <span class="ctx-ai-counter" id="ctx-ai-counter-dyn">0/200</span>
            <button class="ctx-ai-run" id="ctx-ai-run-dyn">Run ✦</button>
          </div>
        </div>
      `;
      // Wire AI Touch toggle
      const trigger = wrap.querySelector('[data-action="ai-touch"]');
      trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.toggle('expanded');
        const promptEl = wrap.querySelector('#ctx-ai-prompt-dyn');
        const counterEl = wrap.querySelector('#ctx-ai-counter-dyn');
        if (promptEl) {
          const saved = localStorage.getItem('fd-ai-prompt') || '';
          promptEl.value = saved;
          if (counterEl) counterEl.textContent = saved.length + '/200';
          setTimeout(() => promptEl.focus(), 50);
        }
      });
      // Wire prompt input
      const promptEl = wrap.querySelector('#ctx-ai-prompt-dyn');
      const counterEl = wrap.querySelector('#ctx-ai-counter-dyn');
      const runBtn = wrap.querySelector('#ctx-ai-run-dyn');
      if (promptEl) {
        promptEl.addEventListener('input', () => {
          if (counterEl) counterEl.textContent = promptEl.value.length + '/200';
          localStorage.setItem('fd-ai-prompt', promptEl.value);
        });
        promptEl.addEventListener('click', (e) => e.stopPropagation());
        promptEl.addEventListener('mousedown', (e) => e.stopPropagation());
        promptEl.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            ctxMenu.close();
            const ids = hitId ? [hitId] : [];
            if (typeof vscode !== 'undefined') {
              vscode.postMessage({ type: 'aiTouch', nodeIds: ids, userFocus: localStorage.getItem('fd-ai-prompt') || undefined });
            }
          }
        });
      }
      if (runBtn) {
        runBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ctxMenu.close();
          const ids = hitId ? [hitId] : [];
          if (typeof vscode !== 'undefined') {
            vscode.postMessage({ type: 'aiTouch', nodeIds: ids, userFocus: localStorage.getItem('fd-ai-prompt') || undefined });
          }
        });
      }
    }
  });

  // Notes
  if (!hasSpec) items.push({ action: 'add-annotation', label: 'Add Spec', icon: '◇' });
  if (hasSpec) items.push({ action: 'view-specs', label: 'Specs Panel', icon: '📝', shortcut: '⌘⇧N' });

  // Rename
  items.push({ action: 'rename', label: 'Rename', icon: '✏️' });
  items.push({ type: 'separator' });

  // Clipboard
  items.push({ action: 'cut', label: 'Cut', icon: '✂', shortcut: '⌘X' });
  items.push({ action: 'copy', label: 'Copy', icon: '⎘', shortcut: '⌘C' });
  items.push({ action: 'paste', label: 'Paste', icon: '📋', shortcut: '⌘V' });
  items.push({ action: 'copy-png', label: 'Copy as PNG', icon: '🖼', shortcut: '⌘⇧C' });
  items.push({ type: 'separator' });

  // Structure
  items.push({ action: 'duplicate', label: 'Duplicate', icon: '⊕', shortcut: '⌘D' });
  items.push({ action: 'group', label: 'Group', icon: '◻', shortcut: '⌘G', disabled: !canGroup });
  items.push({ action: 'ungroup', label: 'Ungroup', icon: '◫', shortcut: '⇧⌘G', disabled: !canUngroup });
  items.push({ action: 'frame', label: 'Frame Selection', icon: '⊞' });
  items.push({ type: 'separator' });

  // Z-order
  items.push({ action: 'bring-front', label: 'Bring to Front', icon: '↑', shortcut: '⌘⇧]' });
  items.push({ action: 'send-back', label: 'Send to Back', icon: '↓', shortcut: '⌘⇧[' });

  // Lock
  items.push({ action: 'lock', label: isLocked ? 'Unlock' : 'Lock', icon: isLocked ? '🔓' : '🔒' });
  items.push({ type: 'separator' });

  // Delete
  items.push({ action: 'delete', label: 'Delete', icon: '⊖', shortcut: '⌫', danger: true });

  return items;
}

/** Handle canvas context menu actions */
function doNodeAction(action, el) {
  if (!fdCanvas || !contextMenuNodeId) return;
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  if (!selectedIds.includes(contextMenuNodeId)) {
    fdCanvas.select_by_id(contextMenuNodeId);
  }

  if (action === 'add-annotation') {
    openAnnotationCard(contextMenuNodeId, parseInt(el?.style?.left || 0), parseInt(el?.style?.top || 0));
    return;
  }
  if (action === 'view-specs') {
    fdCanvas.select_by_id(contextMenuNodeId);
    render();
    openAnnotationCard(contextMenuNodeId, parseInt(el?.style?.left || 0), parseInt(el?.style?.top || 0));
    return;
  }
  if (action === 'rename') {
    const oldId = contextMenuNodeId;
    const newId = prompt(`Rename @${oldId} to:`, oldId);
    if (!newId || newId === oldId || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newId)) return;
    const text = fdCanvas.get_text();
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}\\b`, "g");
    const newText = text.replace(re, `@${newId}`);
    fdCanvas.set_text(newText);
    bumpGeneration();
    render();
    syncTextToExtension();
    return;
  }
  if (action === 'cut') {
    copySelectedAsFd();
    const changed = fdCanvas.delete_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'copy') { copySelectedAsFd(); return; }
  if (action === 'paste') { pasteFromClipboard(); return; }
  if (action === 'copy-png') { if (typeof copySelectionAsPng === 'function') copySelectionAsPng(); return; }
  if (action === 'duplicate') {
    const changed = fdCanvas.duplicate_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'group') {
    const changed = fdCanvas.group_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'ungroup') {
    const changed = fdCanvas.ungroup_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'frame') {
    const resultJson = fdCanvas.handle_key("f", false, false, false, true);
    const result = JSON.parse(resultJson);
    if (result.changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'bring-front') {
    const resultJson = fdCanvas.handle_key("]", false, true, false, true);
    const result = JSON.parse(resultJson);
    if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    return;
  }
  if (action === 'send-back') {
    const resultJson = fdCanvas.handle_key("[", false, true, false, true);
    const result = JSON.parse(resultJson);
    if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    return;
  }
  if (action === 'lock') {
    if (fdCanvas.toggle_node_locked) {
      fdCanvas.toggle_node_locked(contextMenuNodeId);
      render();
      syncTextToExtension();
    }
    return;
  }
  if (action === 'delete') {
    fdCanvas.select_by_id(contextMenuNodeId);
    const changed = fdCanvas.delete_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
}

function setupContextMenu() {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!fdCanvas) return;
    if (tempEraserMode || fdCanvas.get_tool_name() === "eraser") return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    const selectedId = fdCanvas.get_selected_id();
    fdCanvas.handle_pointer_down(x, y, 1.0);
    fdCanvas.handle_pointer_up(x, y, false, false, false, false);
    const hitId = fdCanvas.get_selected_id();
    render();

    if (!hitId) {
      if (fdCanvas.hit_test_edge_at) {
        const edgeHit = fdCanvas.hit_test_edge_at(x, y);
        if (edgeHit) {
          const container = document.getElementById("canvas-container");
          const containerRect = container.getBoundingClientRect();
          showEdgeContextMenu(edgeHit, e.clientX - containerRect.left, e.clientY - containerRect.top);
          return;
        }
      }
      ctxMenu.close();
      return;
    }

    contextMenuNodeId = hitId;
    const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
    const items = buildNodeMenuItems(hitId, selectedIds);

    ctxMenu.open({
      items,
      x: e.clientX,
      y: e.clientY,
      onAction: (action, row) => doNodeAction(action, row),
    });
  });

  // ── Layers panel: ⋮ button → open context menu ──
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
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      const items = buildNodeMenuItems(nodeId, selectedIds);
      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: (action, row) => doNodeAction(action, row),
      });
    });
  }
}

function closeContextMenu() {
  ctxMenu.close();
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

  // Delete edge
  document.getElementById("ecm-delete")?.addEventListener("click", () => {
    if (!fdCanvas || !ecmEdgeId) { closeEdgeContextMenu(); return; }
    // Select the edge and delete it
    fdCanvas.select_by_id(ecmEdgeId);
    const changed = fdCanvas.delete_selected();
    if (changed) {
      bumpGeneration();
      render();
      syncTextToExtension();
    }
    closeEdgeContextMenu();
  });

  // Reverse edge direction (swap from: and to:)
  document.getElementById("ecm-reverse")?.addEventListener("click", () => {
    if (!fdCanvas || !ecmEdgeId) { closeEdgeContextMenu(); return; }
    const text = fdCanvas.get_text();
    const esc = ecmEdgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(edge\\s+@${esc}\\s*\\{[^}]*?)\\}`, "s");
    const m = text.match(re);
    if (!m) { closeEdgeContextMenu(); return; }
    let block = m[1];
    // Extract from: and to: values
    const fromMatch = block.match(/from:\s*(.+)/);
    const toMatch = block.match(/to:\s*(.+)/);
    if (fromMatch && toMatch) {
      const fromVal = fromMatch[1].trim();
      const toVal = toMatch[1].trim();
      block = block.replace(/from:\s*.+/, `from: ${toVal}`);
      block = block.replace(/to:\s*.+/, `to: ${fromVal}`);
      const newText = text.replace(re, block + "\n}");
      fdCanvas.set_text(newText);
      bumpGeneration();
      render();
      syncTextToExtension();
    }
    closeEdgeContextMenu();
  });
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
  const btn = document.getElementById("sm-note-badge-toggle");
  if (btn) btn.classList.toggle("active", specBadgesVisible);
  vscode.setState({ ...(vscode.getState() || {}), specBadgesVisible });

  const overlay = document.getElementById("spec-overlay");
  if (specBadgesVisible || viewMode === "specs") {
    refreshSpecBadges();
  } else {
    if (overlay) { overlay.innerHTML = ""; overlay.style.display = "none"; }
  }
}

/** Set up spec badge toggle button and restore persisted state. */
function setupSpecBadgeToggle() {
  const btn = document.getElementById("sm-note-badge-toggle");
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

  // Dispatch selection change event for AI chat panel
  const selIds = [];
  try {
    const ids = JSON.parse(fdCanvas.get_selected_ids());
    selIds.push(...ids);
  } catch (_) {}
  const selKey = selIds.join(',');
  if (selKey !== updatePropertiesPanel._lastSelKey) {
    updatePropertiesPanel._lastSelKey = selKey;
    document.dispatchEvent(new CustomEvent('fd-selection-changed', { detail: { ids: selIds } }));
  }

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
      if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    },
    "props-send-back": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("[", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
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
function renderLayerNode(node, selectedIds, depth = 0) {
  const icon = LAYER_ICONS[node.kind] || "•";
  const isSelected = selectedIds.has(node.id);
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

  let html = `<div class="layer-item${isSelected ? " selected" : ""}" data-node-id="${escapeAttr(node.id)}" data-node-kind="${escapeAttr(node.kind)}" draggable="true">`;
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
      html += renderLayerNode(child, selectedIds, depth + 1);
    }
    html += `</div>`;
  }
  return html;
}

/** Refresh the layers panel content. */

// ─── Spec Summary Panel (replaces layers in Spec mode) ──────────────────

function refreshSpecsSummary(panel) {
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
    const active = noteFilter === f.key ? " active" : "";
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
  const filtered = noteFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === noteFilter)
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
      noteFilter = btn.getAttribute("data-filter") || "all";
      refreshSpecsSummary(panel);
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
  const targets = noteFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === noteFilter)
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
  if (panel) refreshSpecsSummary(panel);
}

/** Close any open layer context menu. */
function closeLayerCtxMenu() {
  ctxMenu.close();
}

/** Searchable "Move Into" picker for the extension — mirrors playground.js implementation. */
function showSearchableParentPicker(nodeId, posX, posY) {
  if (!fdCanvas?.get_container_ids) return;
  let containers;
  try { containers = JSON.parse(fdCanvas.get_container_ids()); } catch (_) { return; }
  const validTargets = containers.filter(c => c.id !== nodeId);
  if (validTargets.length === 0) { showToast('No valid containers'); return; }

  document.getElementById('parent-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'parent-picker';
  picker.style.cssText = `position:fixed;left:${posX}px;top:${posY}px;z-index:310;` +
    'min-width:220px;max-width:280px;max-height:320px;display:flex;flex-direction:column;' +
    'background:var(--vscode-menu-background,#1e1e1e);border:1px solid var(--vscode-menu-border,#454545);' +
    'border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);overflow:hidden;' +
    'font-family:var(--vscode-editor-font-family,monospace);font-size:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'padding:8px 10px 4px;color:var(--vscode-descriptionForeground,#888);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
  header.textContent = `Move @${nodeId} into`;
  picker.appendChild(header);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search containers…';
  input.style.cssText = 'margin:0 8px 4px;padding:6px 8px;border:1px solid var(--vscode-input-border,#444);' +
    'border-radius:6px;background:var(--vscode-input-background,#0A0A0A);color:var(--vscode-input-foreground,#E5E5EA);' +
    'font-size:12px;font-family:inherit;outline:none;';
  picker.appendChild(input);

  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;max-height:240px;padding:4px 0;';
  picker.appendChild(list);

  function renderList(filter) {
    list.innerHTML = '';
    const q = (filter || '').toLowerCase();
    const matches = validTargets.filter(c => c.id.toLowerCase().includes(q));
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 10px;color:var(--vscode-descriptionForeground,#666);text-align:center;';
      empty.textContent = 'No matches';
      list.appendChild(empty);
      return;
    }
    for (const t of matches.slice(0, 50)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;' +
        'color:var(--vscode-menu-foreground,#E5E5EA);transition:background .1s;';
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--vscode-list-hoverBackground,rgba(255,255,255,0.06))'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      const icon = document.createElement('span');
      icon.textContent = LAYER_ICONS[t.kind] || '•';
      icon.style.cssText = 'width:16px;text-align:center;flex-shrink:0;';
      row.appendChild(icon);

      const name = document.createElement('span');
      name.textContent = `@${t.id}`;
      name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      row.appendChild(name);

      const moveBtn = document.createElement('button');
      moveBtn.textContent = '📦';
      moveBtn.title = 'Nest (preserve position)';
      moveBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
      moveBtn.addEventListener('mouseenter', () => { moveBtn.style.background = 'var(--vscode-focusBorder,#007AFF)'; });
      moveBtn.addEventListener('mouseleave', () => { moveBtn.style.background = ''; });
      moveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, false); });
      row.appendChild(moveBtn);

      const centerBtn = document.createElement('button');
      centerBtn.textContent = '⊙';
      centerBtn.title = 'Center in container';
      centerBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
      centerBtn.addEventListener('mouseenter', () => { centerBtn.style.background = 'var(--vscode-focusBorder,#007AFF)'; });
      centerBtn.addEventListener('mouseleave', () => { centerBtn.style.background = ''; });
      centerBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, true); });
      row.appendChild(centerBtn);

      row.addEventListener('click', () => doReparent(t.id, false));
      list.appendChild(row);
    }
    if (matches.length > 50) {
      const more = document.createElement('div');
      more.style.cssText = 'padding:6px 10px;color:var(--vscode-descriptionForeground,#666);text-align:center;font-size:10px;';
      more.textContent = `…${matches.length - 50} more (refine search)`;
      list.appendChild(more);
    }
  }

  function doReparent(targetId, center) {
    const textBefore = fdCanvas.get_text();
    let changed = false;
    if (center && fdCanvas.reparent_into_centered) {
      changed = fdCanvas.reparent_into_centered(nodeId, targetId);
    } else {
      changed = fdCanvas.reparent_into(nodeId, targetId);
    }
    if (changed) {
      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
      bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
      showToast(`Moved @${nodeId} → @${targetId}`);
    }
    closePicker();
  }

  function closePicker() {
    picker.remove();
    document.removeEventListener('pointerdown', outsideClickHandler, true);
    document.removeEventListener('keydown', escHandler, true);
  }
  function outsideClickHandler(ev) { if (!picker.contains(ev.target)) closePicker(); }
  function escHandler(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); closePicker(); } }

  input.addEventListener('input', () => renderList(input.value));
  renderList('');
  document.body.appendChild(picker);

  requestAnimationFrame(() => {
    const r = picker.getBoundingClientRect();
    if (r.right > window.innerWidth) picker.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
    if (r.bottom > window.innerHeight) picker.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
  });

  setTimeout(() => {
    input.focus();
    document.addEventListener('pointerdown', outsideClickHandler, true);
    document.addEventListener('keydown', escHandler, true);
  }, 50);
}

/** Clear all drag indicators from layer items. */
function clearLayerDragIndicators(panel) {
  panel.querySelectorAll('.layer-item').forEach(el => {
    el.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
  });
  panel.querySelectorAll('.layers-body').forEach(el => {
    el.classList.remove('drag-over-root');
  });
}

/** Determine drop zone: 'above' (top 25%), 'below' (bottom 25%), 'nest' (middle 50%). */
function getDropZone(e, el) {
  const rect = el.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const h = rect.height;
  if (y < h * 0.25) return 'above';
  if (y > h * 0.75) return 'below';
  return 'nest';
}

/** Get sibling index of a node in the DOM. */
function getSiblingIndex(panel, nodeId) {
  const item = panel.querySelector(`.layer-item[data-node-id="${nodeId}"]`);
  if (!item) return 0;
  const parent = item.parentElement;
  if (!parent) return 0;
  const siblings = [...parent.querySelectorAll(':scope > .layer-item')];
  return siblings.indexOf(item);
}

/** Wire drag-and-drop handlers on layer items. */
function wireLayerDragDrop(panel) {
  if (!fdCanvas) return;
  let draggedId = null;

  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedId = item.getAttribute('data-node-id');
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetId = item.getAttribute('data-node-id');
      if (!draggedId || targetId === draggedId) return;
      clearLayerDragIndicators(panel);
      const zone = getDropZone(e, item);
      const kind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(kind);
      if (zone === 'nest' && isContainer) {
        item.classList.add('drag-over-nest');
      } else if (zone === 'above') {
        item.classList.add('drag-over-above');
      } else {
        item.classList.add('drag-over-below');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearLayerDragIndicators(panel);
      const targetId = item.getAttribute('data-node-id');
      if (!draggedId || !fdCanvas || targetId === draggedId) return;
      const textBefore = fdCanvas.get_text();
      const zone = getDropZone(e, item);
      const kind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(kind);
      let changed = false;
      if (zone === 'nest' && isContainer) {
        changed = e.altKey && fdCanvas.reparent_into_centered
          ? fdCanvas.reparent_into_centered(draggedId, targetId)
          : fdCanvas.reparent_into(draggedId, targetId);
      } else {
        const targetIndex = getSiblingIndex(panel, targetId);
        const insertIndex = zone === 'above' ? targetIndex : targetIndex + 1;
        const targetParent = item.parentElement?.getAttribute?.('data-parent-id');
        const dragItem = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
        const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id');
        if (targetParent && dragParent && targetParent === dragParent) {
          changed = fdCanvas.reorder_child(draggedId, insertIndex);
        } else if (targetParent) {
          changed = fdCanvas.reparent_into(draggedId, targetParent);
          if (changed) fdCanvas.reorder_child(draggedId, insertIndex);
        } else {
          changed = fdCanvas.reparent_into(draggedId, 'root');
          if (changed) fdCanvas.reorder_child(draggedId, insertIndex);
        }
      }
      if (changed) {
        const textAfter = fdCanvas.get_text();
        if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        refreshLayersPanel();
      }
      draggedId = null;
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      clearLayerDragIndicators(panel);
      draggedId = null;
    });
  });

  // Drop-to-root
  const layersBody = panel.querySelector('.layers-body');
  if (layersBody) {
    layersBody.addEventListener('dragover', (e) => {
      if (e.target.closest('.layer-item')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearLayerDragIndicators(panel);
      layersBody.classList.add('drag-over-root');
    });
    layersBody.addEventListener('dragleave', (e) => {
      if (!layersBody.contains(e.relatedTarget) || e.relatedTarget?.closest('.layer-item')) {
        layersBody.classList.remove('drag-over-root');
      }
    });
    layersBody.addEventListener('drop', (e) => {
      if (e.target.closest('.layer-item')) return;
      e.preventDefault();
      layersBody.classList.remove('drag-over-root');
      if (!draggedId || !fdCanvas) return;
      const textBefore = fdCanvas.get_text();
      const changed = fdCanvas.reparent_into(draggedId, 'root');
      if (changed) {
        const textAfter = fdCanvas.get_text();
        if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        refreshLayersPanel();
      }
      draggedId = null;
    });
  }
}

/** Wire right-click context menu on layer items — full parity with canvas context menu. */
function wireLayerContextMenu(panel) {
  if (!fdCanvas) return;
  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctxMenu.close();
      const nodeId = item.getAttribute('data-node-id');
      if (!nodeId) return;

      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(nodeId)) {
        fdCanvas.select_by_id(nodeId);
      }
      const nodeKind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(nodeKind);
      const hasChildren = !!item.nextElementSibling?.classList.contains('layer-children');
      const canGroup = selectedIds.length >= 2 || (selectedIds.includes(nodeId) && selectedIds.length >= 2);
      let canUngroup = false;
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
          canUngroup = true;
          break;
        }
      }
      const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(nodeId) : false;

      const items = [];

      // Rename
      items.push({ action: 'rename', label: 'Rename', icon: '✏️' });
      items.push({ type: 'separator' });

      // Clipboard
      items.push({ action: 'cut', label: 'Cut', icon: '✂', shortcut: '⌘X' });
      items.push({ action: 'copy', label: 'Copy', icon: '⎘', shortcut: '⌘C' });
      items.push({ action: 'paste', label: 'Paste', icon: '📋', shortcut: '⌘V' });
      items.push({ action: 'copy-png', label: 'Copy as PNG', icon: '🖼', shortcut: '⌘⇧C' });
      items.push({ type: 'separator' });

      // Structure
      items.push({ action: 'duplicate', label: 'Duplicate', icon: '⊕', shortcut: '⌘D' });
      items.push({ action: 'group', label: 'Group', icon: '◻', shortcut: '⌘G', disabled: !canGroup });
      items.push({ action: 'ungroup', label: 'Ungroup', icon: '◫', shortcut: '⇧⌘G', disabled: !canUngroup });
      items.push({ action: 'frame', label: 'Frame Selection', icon: '⊞' });
      items.push({ type: 'separator' });

      // Z-order
      items.push({ action: 'bring-front', label: 'Bring to Front', icon: '↑', shortcut: '⌘⇧]' });
      items.push({ action: 'send-back', label: 'Send to Back', icon: '↓', shortcut: '⌘⇧[' });

      // Lock
      items.push({ action: 'lock', label: isLocked ? 'Unlock' : 'Lock', icon: isLocked ? '🔓' : '🔒' });

      // Select Children (containers only)
      if (isContainer && hasChildren) {
        items.push({ action: 'select-children', label: 'Select Children', icon: '📂' });
      }
      items.push({ type: 'separator' });

      // Move Into — opens searchable picker
      items.push({ action: 'move-into-search', label: 'Move Into…', icon: '📦' });
      items.push({ action: 'move-to-root', label: 'Move to Root', icon: '↑' });
      items.push({ type: 'separator' });

      // Delete
      items.push({ action: 'delete', label: 'Delete', icon: '✕', shortcut: '⌫', danger: true });

      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: (action, btn) => {
          if (action === 'rename') {
            const nameEl = item.querySelector('.layer-name');
            if (nameEl) nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            return;
          }
          const textBefore = fdCanvas.get_text();
          let changed = false;
          if (action === 'cut') {
            fdCanvas.select_by_id(nodeId);
            copySelectedAsFd();
            changed = fdCanvas.delete_selected();
          } else if (action === 'copy') {
            fdCanvas.select_by_id(nodeId);
            copySelectedAsFd();
            return;
          } else if (action === 'paste') {
            pasteFromClipboard().then(() => {
              bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
            });
            return;
          } else if (action === 'copy-png') {
            fdCanvas.select_by_id(nodeId);
            if (typeof copySelectionAsPng === 'function') copySelectionAsPng();
            return;
          } else if (action === 'duplicate') {
            fdCanvas.select_by_id(nodeId);
            changed = fdCanvas.duplicate_selected();
          } else if (action === 'group') {
            changed = fdCanvas.group_selected();
          } else if (action === 'ungroup') {
            changed = fdCanvas.ungroup_selected();
          } else if (action === 'frame') {
            const resultJson = fdCanvas.handle_key('f', false, false, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'bring-front') {
            const resultJson = fdCanvas.handle_key(']', false, true, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'send-back') {
            const resultJson = fdCanvas.handle_key('[', false, true, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'lock') {
            if (fdCanvas.toggle_node_locked) { fdCanvas.toggle_node_locked(nodeId); changed = true; }
          } else if (action === 'select-children') {
            const childrenContainer = panel.querySelector(`.layer-children[data-parent-id="${nodeId}"]`);
            if (childrenContainer) {
              const childIds = [...childrenContainer.querySelectorAll(':scope > .layer-item')].map(
                el => el.getAttribute('data-node-id')
              ).filter(Boolean);
              if (childIds.length > 0) {
                fdCanvas.select_multiple_by_ids(JSON.stringify(childIds));
                bumpGeneration(); render(); updatePropertiesPanel(); updateFloatingBar(); refreshLayersPanel();
              }
            }
            return;
          } else if (action === 'move-into-search') {
            showSearchableParentPicker(nodeId, e.clientX ?? 200, e.clientY ?? 200);
            return;
          } else if (action === 'move-into') {
            changed = fdCanvas.reparent_into(nodeId, btn.getAttribute('data-target'));
          } else if (action === 'center-into') {
            const targetId = btn.getAttribute('data-target');
            changed = fdCanvas.reparent_into_centered
              ? fdCanvas.reparent_into_centered(nodeId, targetId)
              : fdCanvas.reparent_into(nodeId, targetId);
          } else if (action === 'move-to-root') {
            changed = fdCanvas.reparent_into(nodeId, 'root');
          } else if (action === 'delete') {
            fdCanvas.select_by_id(nodeId);
            changed = fdCanvas.delete_selected();
          }
          if (changed) {
            const textAfter = fdCanvas.get_text();
            if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
            bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
          }
        },
      });
    });
  });
}

/** Last layer generation + selection — skip rebuild when unchanged */
let lastLayerGeneration = -1;
let lastLayerSelectedId = "";

/** Last clicked layer item ID — for ⇧+click range select */
let lastClickedLayerId = "";

/** Flatten a layer tree into a visible-order array of IDs (respects collapsed state). */
function flattenLayerTree(nodes, panel) {
  const result = [];
  for (const node of nodes) {
    result.push(node.id);
    if (node.children.length > 0) {
      const childrenEl = panel?.querySelector(`.layer-children[data-parent-id="${node.id}"]`);
      const isCollapsed = childrenEl?.classList.contains('collapsed');
      if (!isCollapsed) {
        result.push(...flattenLayerTree(node.children, panel));
      }
    }
  }
  return result;
}

function refreshLayersPanel() {
  const panel = document.getElementById("layers-panel");
  if (!panel || !fdCanvas) return;

  // In Spec mode, show requirements summary instead of layers
  if (viewMode === "specs") {
    lastLayerGeneration = -1;
    refreshSpecsSummary(panel);
    return;
  }

  // Use full set of selected IDs for multi-select highlighting
  const selectedIds = new Set(JSON.parse(fdCanvas.get_selected_ids()));
  const selectedKey = [...selectedIds].sort().join(',');

  // Skip DOM rebuild if nothing changed (uses generation counter instead of full-text hash)
  if (sceneGeneration === lastLayerGeneration && selectedKey === lastLayerSelectedId) return;

  // Selection-only change: update highlight on existing DOM without full rebuild
  if (sceneGeneration === lastLayerGeneration && selectedKey !== lastLayerSelectedId) {
    lastLayerSelectedId = selectedKey;
    panel.querySelectorAll(".layer-item").forEach(el =>
      el.classList.toggle("selected", selectedIds.has(el.getAttribute("data-node-id")))
    );
    // Scroll first selected item into view (Canvas/Code → Layers sync)
    const selectedEl = panel.querySelector('.layer-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  lastLayerGeneration = sceneGeneration;
  lastLayerSelectedId = selectedKey;

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
    html += renderLayerNode(node, selectedIds);
  }
  html += `</div>`;

  panel.innerHTML = html;

  // Wire click handlers for layer items — ⌘+click multi, ⇧+click range, plain click
  panel.querySelectorAll(".layer-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      // Don't select when clicking chevron
      if (e.target.closest(".layer-chevron")) return;
      e.stopPropagation();
      const nodeId = item.getAttribute("data-node-id");
      if (!nodeId || !fdCanvas) return;

      // ⌘+click (Mac) / Ctrl+click (others) — toggle single node in selection
      if (e.metaKey || e.ctrlKey) {
        fdCanvas.toggle_select_by_id(nodeId);
        lastClickedLayerId = nodeId;
        // Update highlighting from actual selection state
        const newIds = new Set(JSON.parse(fdCanvas.get_selected_ids()));
        lastLayerGeneration = sceneGeneration;
        lastLayerSelectedId = [...newIds].sort().join(',');
        panel.querySelectorAll(".layer-item").forEach(el =>
          el.classList.toggle("selected", newIds.has(el.getAttribute("data-node-id")))
        );
        render();
        updatePropertiesPanel();
        updateFloatingBar();
        return;
      }

      // ⇧+click — range select from lastClickedLayerId to this node
      if (e.shiftKey && lastClickedLayerId) {
        const flatIds = flattenLayerTree(tree, panel);
        const startIdx = flatIds.indexOf(lastClickedLayerId);
        const endIdx = flatIds.indexOf(nodeId);
        if (startIdx >= 0 && endIdx >= 0) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          const rangeIds = flatIds.slice(lo, hi + 1);
          fdCanvas.select_multiple_by_ids(JSON.stringify(rangeIds));
          const newIds = new Set(rangeIds);
          lastLayerGeneration = sceneGeneration;
          lastLayerSelectedId = [...newIds].sort().join(',');
          panel.querySelectorAll(".layer-item").forEach(el =>
            el.classList.toggle("selected", newIds.has(el.getAttribute("data-node-id")))
          );
          render();
          updatePropertiesPanel();
          updateFloatingBar();
          return;
        }
      }

      // Plain click — single select
      lastClickedLayerId = nodeId;
      lastLayerGeneration = sceneGeneration;
      lastLayerSelectedId = nodeId;
      panel.querySelectorAll(".layer-item").forEach((el) => {
        el.classList.toggle("selected", el.getAttribute("data-node-id") === nodeId);
      });
      // Smart focus: pan/zoom to the selected node if needed
      focusOnNode(nodeId);
      // Central sync: Canvas select + Code highlight + side panels
      syncSelection(nodeId, "layers");
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

  // ── Layer Drag-and-Drop ──
  wireLayerDragDrop(panel);

  // ── Layer Context Menu ("Move Into") ──
  wireLayerContextMenu(panel);

  // ── Keyboard shortcuts when layers panel is focused (#7) ──
  wireLayerKeyboardShortcuts(panel);
}

/** Wire keyboard shortcuts for layers panel — Delete, ⌘C/X/V/D (#5, #7) */
function wireLayerKeyboardShortcuts(panel) {
  // Make panel focusable so it can receive key events
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');

  // Only attach once
  if (panel._layerKeysWired) return;
  panel._layerKeysWired = true;

  panel.addEventListener('keydown', (e) => {
    if (!fdCanvas) return;
    const meta = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    // Delete / Backspace → delete selected
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      e.stopPropagation();
      const changed = fdCanvas.delete_selected();
      if (changed) {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      }
      return;
    }

    // ⌘D → duplicate
    if (meta && key === 'd') {
      e.preventDefault();
      e.stopPropagation();
      const changed = fdCanvas.duplicate_selected();
      if (changed) {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      }
      return;
    }

    // ⌘C → copy
    if (meta && key === 'c' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      copySelectedAsFd();
      return;
    }

    // ⌘X → cut
    if (meta && key === 'x') {
      e.preventDefault();
      e.stopPropagation();
      cutSelectedAsFd();
      bumpGeneration();
      render();
      syncTextToExtension();
      updatePropertiesPanel();
      updateFloatingBar();
      refreshLayersPanel();
      return;
    }

    // ⌘V → paste
    if (meta && key === 'v') {
      e.preventDefault();
      e.stopPropagation();
      pasteFromClipboard().then(() => {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      });
      return;
    }

    // ⌘A → select all
    if (meta && key === 'a') {
      e.preventDefault();
      e.stopPropagation();
      selectAllNodes();
      refreshLayersPanel();
      return;
    }
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
  html += `<button class="lib-close" id="lib-close-btn" title="Close" aria-label="Close">×</button>`;
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

// ─── Panel Resize ────────────────────────────────────────────────────────

/** Set up drag-to-resize for layers and properties panels. */
function setupPanelResize() {
  const container = document.getElementById("canvas-container");
  const layersPanel = document.getElementById("layers-panel");
  const layersHandle = document.getElementById("layers-resize");
  const propsPanel = document.getElementById("props-panel");
  const layersRestore = document.getElementById("layers-restore");
  const propsRestore = document.getElementById("props-restore");

  if (!container || !layersPanel) return;

  const MIN_WIDTH = 140;
  const MAX_WIDTH = 400;
  const DEFAULT_LAYERS_W = 232;
  const DEFAULT_PROPS_W = 244;

  // Restore persisted state
  const savedState = vscode.getState() || {};
  if (savedState.layersWidth && savedState.layersWidth >= MIN_WIDTH && savedState.layersWidth <= MAX_WIDTH) {
    container.style.setProperty("--layers-width", savedState.layersWidth + "px");
  }
  if (savedState.propsWidth && savedState.propsWidth >= MIN_WIDTH && savedState.propsWidth <= MAX_WIDTH) {
    container.style.setProperty("--props-width", savedState.propsWidth + "px");
  }
  if (savedState.layersCollapsed) {
    layersPanel.classList.add("collapsed");
    container.style.setProperty("--layers-width", "0px");
  }

  /** Position layers resize handle at panel's right edge. */
  function positionLayersHandle() {
    if (!layersHandle) return;
    const w = layersPanel.classList.contains("collapsed") ? 0 : layersPanel.offsetWidth;
    layersHandle.style.left = w + "px";
    layersHandle.style.display = layersPanel.classList.contains("collapsed") ? "none" : "";
  }

  // Initial position
  requestAnimationFrame(positionLayersHandle);

  // ── Layers panel drag ──
  if (layersHandle) {
    let dragging = false;
    let startX = 0;
    let startW = 0;

    layersHandle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startW = layersPanel.offsetWidth;
      layersPanel.classList.add("no-transition");
      layersHandle.classList.add("active");
      layersHandle.setPointerCapture(e.pointerId);
    });

    layersHandle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx));
      container.style.setProperty("--layers-width", newW + "px");
      positionLayersHandle();
      renderDirty = true;
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      layersPanel.classList.remove("no-transition");
      layersHandle.classList.remove("active");
      const w = layersPanel.offsetWidth;
      vscode.setState({ ...(vscode.getState() || {}), layersWidth: w });
    };
    layersHandle.addEventListener("pointerup", endDrag);
    layersHandle.addEventListener("pointercancel", endDrag);

    // Double-click to collapse
    layersHandle.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isCollapsed = layersPanel.classList.toggle("collapsed");
      if (isCollapsed) {
        container.style.setProperty("--layers-width", "0px");
        vscode.setState({ ...(vscode.getState() || {}), layersCollapsed: true });
      } else {
        const state = vscode.getState() || {};
        const restoreW = (state.layersWidth >= MIN_WIDTH && state.layersWidth <= MAX_WIDTH) ? state.layersWidth : DEFAULT_LAYERS_W;
        container.style.setProperty("--layers-width", restoreW + "px");
        vscode.setState({ ...(vscode.getState() || {}), layersCollapsed: false });
      }
      requestAnimationFrame(() => { positionLayersHandle(); renderDirty = true; });
    });
  }

  // ── Restore strips ──
  if (layersRestore) {
    layersRestore.addEventListener("click", () => {
      layersPanel.classList.remove("collapsed");
      const state = vscode.getState() || {};
      const restoreW = (state.layersWidth >= MIN_WIDTH && state.layersWidth <= MAX_WIDTH) ? state.layersWidth : DEFAULT_LAYERS_W;
      container.style.setProperty("--layers-width", restoreW + "px");
      vscode.setState({ ...(vscode.getState() || {}), layersCollapsed: false });
      requestAnimationFrame(() => { positionLayersHandle(); renderDirty = true; });
    });
  }

  // ── Props panel: observe visibility and apply persisted width ──
  if (propsPanel) {
    const propsObserver = new MutationObserver(() => {
      if (propsPanel.classList.contains("visible") && !propsPanel.classList.contains("collapsed")) {
        const state = vscode.getState() || {};
        const w = (state.propsWidth >= MIN_WIDTH && state.propsWidth <= MAX_WIDTH) ? state.propsWidth : DEFAULT_PROPS_W;
        container.style.setProperty("--props-width", w + "px");
      } else {
        container.style.setProperty("--props-width", "0px");
      }
      renderDirty = true;
    });
    propsObserver.observe(propsPanel, { attributes: true, attributeFilter: ["class"] });
  }

  // NOTE: Props panel has no separate resize handle in VS Code since it uses
  // a flex-based layout and the panels are overlays on the canvas-container.
  // The layers panel is the primary resizable panel; props panel gets persisted width.
}
// ─── Inline Text Editor ────────────────────────────────────────────────────

/** Inline textarea for editing text nodes directly on canvas. */
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

    // Edge double-click: find/create text child and edit it
    if (props.kind === "edge") {
      const edgeId = props.id;
      const source = fdCanvas.get_text();
      // Check if edge already has a text child
      const edgeBlockRe = new RegExp(`edge\\s+@${edgeId}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 's');
      const edgeMatch = source.match(edgeBlockRe);
      if (edgeMatch) {
        const innerBlock = edgeMatch[1];
        const textChildRe = /text\s+@(\w+)\s+"([^"]*)"/;
        const textMatch = innerBlock.match(textChildRe);
        if (textMatch) {
          // Text child exists — edit it
          const textChildId = textMatch[1];
          fdCanvas.select_by_id(textChildId);
          render();
          openInlineEditor(textChildId, "content", textMatch[2]);
        } else {
          // No text child — create one via text manipulation
          const textId = "label_" + edgeId;
          const esc = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`(edge\\s+@${esc}\\s*\\{)`);
          const m2 = source.match(re);
          if (m2) {
            const insertPos = source.indexOf(m2[0]) + m2[0].length;
            const newSource = source.slice(0, insertPos)
              + `\n  text @${textId} "Label" {}`
              + source.slice(insertPos);
            const textBefore = source;
            fdCanvas.set_text(newSource);
            fdCanvas.push_undo_snapshot(textBefore, newSource);
            render();
            syncTextToExtension();
            fdCanvas.select_by_id(textId);
            render();
            setTimeout(() => openInlineEditor(textId, "content", "Label"), 50);
          }
        }
      }
      e.preventDefault();
      return;
    }

    const isText = props.kind === "text";
    const isShape = props.kind === "rect" || props.kind === "ellipse" || props.kind === "frame";
    if (!isText && !isShape) return;

    if (isText) {
      // Direct text node — edit content
      openInlineEditor(props.id, "content", props.content || "");
    } else {
      // Shape node — drill into child text (Figma behavior)
      const existingTextId = fdCanvas.get_text_child_id(props.id);
      if (existingTextId) {
        // Select the child text node and edit it
        fdCanvas.select_by_id(existingTextId);
        render();
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        openInlineEditor(existingTextId, "content", childProps.content || "");
      } else {
        // Create a new text child inside the shape
        const newTextId = fdCanvas.create_child_text(props.id, "Text");
        if (newTextId) {
          render();
          syncTextToExtension();
          setTimeout(() => openInlineEditor(newTextId, "content", "Text"), 50);
        }
      }
    }
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
  // Use exact font family from WASM renderer — no fallback chain added
  // to ensure pixel-perfect match with Canvas2D rendering
  const fontFamily = props.fontFamily || "Inter";
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
  // WASM API always returns the context-aware default (center for text-in-shape,
  // left for standalone), so this fallback is a safety net only.
  const hAlign = props.textAlign || (isTextNode ? "left" : "center");
  const vAlign = props.textVAlign || "top";

  // Store original value for Esc rollback
  const originalValue = currentValue;

  // Vertical padding: match Canvas2D text_baseline positioning exactly.
  // draw_text() uses a fixed 2.0px offset in scene-space (not zoom-scaled).
  //   top    → text_baseline="top",    y = b.y + 2.0
  //   middle → text_baseline="middle", y = b.y + h/2
  //   bottom → text_baseline="bottom", y = b.y + h - 2.0
  // Use constant 2px offset regardless of zoom (renderer uses scene-space pixels).
  const topOffset = 2;
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
      if (propKey === "content") {
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
  document.getElementById("sm-note-badge-toggle")?.addEventListener("click", (e) => {
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
  const specItem = document.getElementById("sm-note-badge-toggle");
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
  // Canonical toolbar dimensions (as if horizontal) — captured on drag start
  // so the snap ghost always reflects the target orientation, not the current one
  let canonW = 0;
  let canonH = 0;

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

  /** Compute the exact landing position for each snap edge.
   *  Uses canonW/canonH (horizontal-layout dimensions) captured at drag start
   *  so the ghost reflects the TARGET orientation, not the current one. */
  function getSnapPosition(edge, projX, projY) {
    const viewW = window.innerWidth;
    const container = document.getElementById("canvas-container");
    const cr = container.getBoundingClientRect();
    const panelW = getLayersPanelWidth();

    if (edge === "top" || edge === "bottom") {
      // Horizontal: width = canonW (long side), height = canonH (short side)
      const left = Math.max(panelW + 8, Math.min(projX, viewW - canonW - 8)) - cr.left;
      const pos = { left: left + "px", width: canonW + "px", height: canonH + "px" };
      if (edge === "top") pos.top = "8px";
      else pos.bottom = "8px";
      return pos;
    }
    // Vertical (left/right): width = canonH (short), height = canonW (long)
    const top = Math.max(8, Math.min(projY - cr.top, cr.height - canonW - 8));
    if (edge === "left") {
      const leftPx = panelW + 8 - cr.left;
      return { left: Math.max(0, leftPx) + "px", top: top + "px", width: canonH + "px", height: canonW + "px" };
    }
    return { right: "8px", top: top + "px", width: canonH + "px", height: canonW + "px" };
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

    // Commit final position — reuse getSnapPosition() for exact ghost match
    const finalX = initialLeft + dx;
    const finalY = initialTop + dy;
    const edge = computeSnap(finalX, finalY);
    const newOrientation = (edge === "left" || edge === "right") ? "vertical" : "horizontal";

    toolbar.classList.remove("horizontal", "vertical");
    toolbar.classList.add(newOrientation);

    // Get the exact same position the ghost showed
    const snapPos = getSnapPosition(edge, finalX, finalY);

    // Apply position: getSnapPosition returns css values relative to canvas-container,
    // which is what the toolbar is already positioned inside of (position:absolute)
    toolbar.style.left = snapPos.left || "auto";
    toolbar.style.right = snapPos.right || "auto";
    toolbar.style.top = snapPos.top || "auto";
    toolbar.style.bottom = snapPos.bottom || "auto";
    // Clear width/height — toolbar auto-sizes from content
    toolbar.style.width = "";
    toolbar.style.height = "";

    const newPos = {
      left: snapPos.left || undefined,
      right: snapPos.right || undefined,
      top: snapPos.top || undefined,
      bottom: snapPos.bottom || undefined,
    };
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

    // Capture canonical (horizontal-layout) dimensions so snap ghost
    // reflects the target orientation regardless of current state
    const isHoriz = toolbar.classList.contains("horizontal");
    canonW = isHoriz ? rect.width : rect.height; // long side
    canonH = isHoriz ? rect.height : rect.width; // short side

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

  // Ghost shapes match WASM create_node_at defaults exactly
  const ghostShapes = {
    rect: { w: 100, h: 80, css: "border-radius:8px;" },
    ellipse: { w: 100, h: 80, css: "border-radius:50%;" },
    pen: { w: 80, h: 60, css: "border-radius:4px;" },
    arrow: { w: 120, h: 2, css: "" },
    text: { w: 60, h: 28, css: "border-radius:4px;" },
    frame: { w: 200, h: 150, css: "border-radius:4px;" },
  };

  function createGhost(tool) {
    const shape = ghostShapes[tool] || ghostShapes.rect;
    const el = document.createElement("div");
    el.className = "dtc-ghost";
    const isDark = document.body.classList.contains("dark-theme");
    const borderColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(51,51,51,0.5)";
    const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(51,51,51,0.06)";
    // Scale ghost to match how the shape will appear on canvas at current zoom
    const sw = Math.round(shape.w * zoomLevel);
    const sh = Math.round(shape.h * zoomLevel);
    let content = "";
    if (tool === "text") {
      content = `<span style="font-size:${Math.round(14 * zoomLevel)}px;color:${borderColor};font-weight:500;">T</span>`;
    }
    if (tool === "arrow") {
      // Diagonal line ghost
      const aw = Math.round(shape.w * zoomLevel);
      el.style.cssText = `
        position:fixed;pointer-events:none;z-index:10000;
        width:${aw}px;height:${aw}px;
        transform:translate(-50%,-50%);
        opacity:0.7;
      `;
      el.innerHTML = `<svg width="${aw}" height="${aw}" viewBox="0 0 ${shape.w} ${shape.w}" fill="none">
        <line x1="10" y1="${shape.w - 10}" x2="${shape.w - 10}" y2="10"
          stroke="${borderColor}" stroke-width="2" stroke-dasharray="6 4"/>
        <path d="M${shape.w - 30},10 L${shape.w - 10},10 L${shape.w - 10},30"
          stroke="${borderColor}" stroke-width="2" fill="none"/>
      </svg>`;
    } else {
      el.style.cssText = `
        position:fixed;pointer-events:none;z-index:10000;
        width:${sw}px;height:${sh}px;
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
        removeDtcSnapEdgePreview();
      } else if (!overToolbar && dtcCancelled) {
        // Pointer left toolbar again → re-activate
        dtcCancelled = false;
        dtcGhost = createGhost(dtcTool);
      }

      if (!dtcCancelled && dtcGhost) {
        // ── Keep ghost sized to current zoom (handles zoom-while-dragging) ──
        const shape = ghostShapes[dtcTool] || ghostShapes.rect;
        const sw = Math.round(shape.w * zoomLevel) + "px";
        const sh = Math.round(shape.h * zoomLevel) + "px";
        if (dtcTool === "arrow") {
          dtcGhost.style.width = sw;
          dtcGhost.style.height = sw;
          const svgEl = dtcGhost.querySelector("svg");
          if (svgEl) { svgEl.setAttribute("width", sw); svgEl.setAttribute("height", sw); }
        } else {
          dtcGhost.style.width = sw;
          dtcGhost.style.height = sh;
        }
        // ── Alt+drag: snap ghost to cardinal position near node ──
        const canvasEl = document.getElementById("fd-canvas");
        if (e.altKey && canvasEl && fdCanvas && dtcTool !== "text") {
          const cRect = canvasEl.getBoundingClientRect();
          const rawX = ((e.clientX - cRect.left) - panX) / zoomLevel;
          const rawY = ((e.clientY - cRect.top) - panY) / zoomLevel;
          const snapPreview = dtcFindSnapTarget(rawX, rawY, dtcTool);
          if (snapPreview) {
            // Snap ghost to cardinal position
            const screenX = snapPreview.x * zoomLevel + panX + cRect.left
              + (ghostShapes[dtcTool] || ghostShapes.rect).w / 2;
            const screenY = snapPreview.y * zoomLevel + panY + cRect.top
              + (ghostShapes[dtcTool] || ghostShapes.rect).h / 2;
            moveGhost(dtcGhost, screenX, screenY);
            // Dashed edge preview line from target center to ghost center
            const shape = ghostShapes[dtcTool] || ghostShapes.rect;
            const ghostCx = snapPreview.x + shape.w / 2;
            const ghostCy = snapPreview.y + shape.h / 2;
            renderDtcSnapEdgePreview(snapPreview.targetCx, snapPreview.targetCy,
              ghostCx, ghostCy, canvasEl);
          } else {
            moveGhost(dtcGhost, e.clientX, e.clientY);
            removeDtcSnapEdgePreview();
          }
        } else {
          moveGhost(dtcGhost, e.clientX, e.clientY);
          removeDtcSnapEdgePreview();
        }

        // ── Alignment guides via WASM ──
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
      removeDtcSnapEdgePreview();
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

          // ── Snap-to-node detection (non-text tools, Alt required) ──
          const snap = e.altKey ? dtcFindSnapTarget(rawX, rawY, dtcTool) : null;
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
      removeDtcSnapEdgePreview();
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
    removeDtcSnapEdgePreview();
    dtcActive = false;
    dtcCancelled = false;
    dtcTool = null;
    dtcBtn = null;
  });

  // ── Esc cancels drag-to-create ──
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dtcTool) {
      removeGhost();
      removeDtcGuideOverlay();
      removeDtcSnapEdgePreview();
      dtcActive = false;
      dtcCancelled = false;
      dtcTool = null;
      dtcBtn = null;
      e.preventDefault();
    }
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

  // ── Snap edge preview overlay (dashed line from target node to ghost) ──
  let dtcSnapEdgeOverlay = null;

  function renderDtcSnapEdgePreview(fromX, fromY, toX, toY, canvasEl) {
    const cRect = canvasEl.getBoundingClientRect();
    if (!dtcSnapEdgeOverlay) {
      dtcSnapEdgeOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      dtcSnapEdgeOverlay.style.cssText = `
        position:fixed;pointer-events:none;z-index:9998;
        left:${cRect.left}px;top:${cRect.top}px;
        width:${cRect.width}px;height:${cRect.height}px;
      `;
      document.body.appendChild(dtcSnapEdgeOverlay);
    }
    dtcSnapEdgeOverlay.style.left = cRect.left + "px";
    dtcSnapEdgeOverlay.style.top = cRect.top + "px";
    dtcSnapEdgeOverlay.style.width = cRect.width + "px";
    dtcSnapEdgeOverlay.style.height = cRect.height + "px";
    dtcSnapEdgeOverlay.setAttribute("viewBox",
      `0 0 ${cRect.width / zoomLevel} ${cRect.height / zoomLevel}`);
    const ox = panX / zoomLevel;
    const oy = panY / zoomLevel;
    const sw = 1.5 / zoomLevel;
    const dash = `${6 / zoomLevel} ${4 / zoomLevel}`;
    dtcSnapEdgeOverlay.innerHTML = `<g transform="translate(${ox},${oy})">
      <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}"
        stroke="var(--fd-accent, #4FC3F7)" stroke-width="${sw}" stroke-dasharray="${dash}"
        stroke-linecap="round" opacity="0.7" />
      <circle cx="${toX}" cy="${toY}" r="${4 / zoomLevel}"
        fill="var(--fd-accent, #4FC3F7)" opacity="0.6" />
    </g>`;
  }

  function removeDtcSnapEdgePreview() {
    if (dtcSnapEdgeOverlay) { dtcSnapEdgeOverlay.remove(); dtcSnapEdgeOverlay = null; }
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
  fdCanvas.render(minimapCtx, performance.now(), true, false);
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

  // Reduce motion: jump directly, no animation
  if (reduceMotion) {
    panX = finalTargetPanX;
    panY = finalTargetPanY;
    zoomLevel = targetZoom;
    render();
    updateZoomIndicator();
    return;
  }

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

// (Theme is always light — no toggle needed)
let isDarkTheme = false;

function setupThemeToggle() {
  // Theme is always light — no toggle needed
}

function applyTheme(isDark) {
  // Theme is always light — no-op
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

// ─── Full Screen Mode Toggle ──────────────────────────────────────────────────

function setupFullscreenToggle() {
  const btn = document.getElementById("fullscreen-toggle-btn");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.fullscreenMode) {
    applyFullscreenMode(true);
  }

  btn.addEventListener("click", () => {
    const isFull = document.body.classList.contains("fullscreen-mode");
    applyFullscreenMode(!isFull);
    vscode.setState({ ...(vscode.getState() || {}), fullscreenMode: !isFull });
  });
}

function applyFullscreenMode(isFull) {
  const btn = document.getElementById("fullscreen-toggle-btn");
  if (isFull) {
    document.body.classList.add("fullscreen-mode");
    if (btn) { btn.textContent = '✕'; btn.title = 'Exit Full Screen (Esc)'; btn.classList.add('fs-active'); }
  } else {
    document.body.classList.remove("fullscreen-mode");
    if (btn) { btn.textContent = '⛶'; btn.title = 'Full Screen (⇧F)'; btn.classList.remove('fs-active'); }
    // Clear any fs-visible overrides when leaving fullscreen
    document.getElementById("layers-panel")?.classList.remove("fs-visible");
    document.getElementById("props-panel")?.classList.remove("fs-visible");
  }
}

// ─── Copy / Paste / Cut / Select All (Figma/Sketch standard) ─────────────────

/** Clipboard buffer for FD node text */
let fdClipboard = "";

/** Track whether clipboard content is from internal copy (vs. external paste). */
let fdClipboardIsInternal = false;

/** Cumulative paste offset — increments by 20 on each successive paste,
 *  resets when a new copy is made. */
let pasteOffsetCount = 0;

/** Extract the .fd text block for a single node by its ID.
 *  Returns the block string, or "" if not found. */
function extractNodeBlock(text, nodeId) {
  const lines = text.split("\n");
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${nodeId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return "";

  const startIndent = lines[startIdx].match(/^\s*/)[0].length;
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

/** Copy the selected node(s)' .fd block(s) to the clipboard. */
function copySelectedAsFd() {
  if (!fdCanvas) return;

  // Use emit_selection_fd for multi-node + edge support
  try {
    const selFd = fdCanvas.emit_selection_fd();
    if (selFd && selFd.trim()) {
      fdClipboard = selFd;
      fdClipboardIsInternal = true;
      pasteOffsetCount = 0;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fdClipboard).catch(() => { });
      }
      return;
    }
  } catch (_) {}

  // Fallback: multi-node via get_selected_ids + extractNodeBlock
  const text = fdCanvas.get_text();
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  if (selectedIds.length === 0) return;

  const blocks = [];
  for (const id of selectedIds) {
    const block = extractNodeBlock(text, id);
    if (block) blocks.push(block);
  }
  if (blocks.length === 0) return;

  fdClipboard = blocks.join("\n\n");
  fdClipboardIsInternal = true;
  pasteOffsetCount = 0;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(fdClipboard).catch(() => { });
  }
}

/** Cut the selected node(s) — copy + delete. */
function cutSelectedAsFd() {
  if (!fdCanvas) return;
  copySelectedAsFd();
  const changed = fdCanvas.delete_selected();
  if (changed) {
    render();
    syncTextToExtension();
  }
}

/** Paste node(s) — delegates to WASM duplicate for internal clipboard,
 *  falls back to text-based paste for external system clipboard content. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Check if system clipboard has different content (external paste)
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText.includes("@") && sysText !== fdClipboard) {
        fdClipboard = sysText;
        fdClipboardIsInternal = false;
      }
    }
  } catch (_) { /* permission denied — use internal */ }

  // Internal clipboard: delegate to WASM duplicate_selected() for correct
  // naming, constraint remapping, edge duplication, and position handling.
  if (fdClipboardIsInternal && fdClipboard) {
    fdCanvas.push_undo_snapshot(fdCanvas.get_text(), fdCanvas.get_text());
    const changed = fdCanvas.duplicate_selected();
    if (changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
    return;
  }

  // External clipboard: text-based paste with batch-aware ID renaming
  const clipText = fdClipboard;
  if (!clipText || !clipText.trim()) return;

  pasteOffsetCount++;

  // Collect all @id declarations in the pasted block
  const idPattern = /@(\w+)\s*\{/g;
  const allIds = new Set();
  let m;
  while ((m = idPattern.exec(clipText)) !== null) {
    allIds.add(m[1]);
  }
  if (allIds.size === 0) return;

  // Build renamed text: use batch-aware incremented _N naming
  const existingText = fdCanvas.get_text();
  let pasteText = clipText;
  const rootId = [...allIds][0];
  const idMap = new Map();
  const batchMaxCache = new Map(); // stem → current max N (batch-aware)

  for (const oldId of allIds) {
    const stem = oldId.replace(/_(?:\d+|cp\d+)$/, '');
    let maxN = batchMaxCache.get(stem) || 0;
    if (maxN === 0) {
      // First time seeing this stem — scan existing text
      maxN = 1;
      const re = new RegExp(`@${stem}_(\\d+)\\b`, 'g');
      let match;
      while ((match = re.exec(existingText)) !== null) {
        maxN = Math.max(maxN, parseInt(match[1]));
      }
      if (new RegExp(`@${stem}\\b`).test(existingText)) {
        maxN = Math.max(maxN, 1);
      }
    }
    const newN = maxN + 1;
    batchMaxCache.set(stem, newN);
    idMap.set(oldId, stem + '_' + newN);
  }

  // Replace all @id references with new names
  for (const [oldId, newId] of idMap) {
    pasteText = pasteText.replace(new RegExp(`@${oldId}\\b`, 'g'), `@${newId}`);
  }
  const newRootId = idMap.get(rootId) || rootId;

  // Horizontal stagger
  let xOffset = pasteOffsetCount * 20;
  try {
    const boundsJson = fdCanvas.get_node_bounds(rootId);
    if (boundsJson) {
      const bounds = JSON.parse(boundsJson);
      if (bounds && bounds.width > 0) {
        xOffset = (bounds.width + 20) * pasteOffsetCount;
      }
    }
  } catch (_) {}

  pasteText = pasteText.replace(/\b(x:\s*)(-?\d+(?:\.\d+)?)/g, (_match, prefix, val) => {
    return prefix + (parseFloat(val) + xOffset);
  });

  // Undo support
  const textBefore = fdCanvas.get_text();
  const updatedText = textBefore.trimEnd() + '\n\n' + pasteText + '\n';
  fdCanvas.set_text(updatedText);
  fdCanvas.push_undo_snapshot(textBefore, updatedText);

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
  const matches = text.match(/@\w+/g);
  if (!matches) return;

  const seenIds = new Set();
  for (let i = 0; i < matches.length; i++) {
    const id = matches[i].substring(1);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const bStr = fdCanvas.get_node_bounds_json(id);
    if (bStr && bStr !== "{}") {
      const b = JSON.parse(bStr);
      if (b.width && b.width > 0) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        foundAny = true;
      }
    }
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
  fdCanvas.render(exportCtx, performance.now(), true, true);

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
  document.getElementById("view-design")?.addEventListener("click", () => setViewMode("design"));
  document.getElementById("view-specs")?.addEventListener("click", () => setViewMode("specs"));
}

function setViewMode(mode) {
  viewMode = mode;
  const isSpecs = mode === "specs";

  document.getElementById("view-design")?.classList.toggle("active", mode === "design");
  document.getElementById("view-specs")?.classList.toggle("active", isSpecs);

  // Canvas stays visible — notes view keeps full interactivity
  const overlay = document.getElementById("spec-overlay");
  if (overlay) overlay.style.display = (isSpecs || specBadgesVisible) ? "" : "none";

  // Hide properties panel in notes view
  const props = document.getElementById("props-panel");
  if (props && isSpecs) props.classList.remove("visible");

  // Notify extension to apply/remove code-mode spec folding
  vscode.postMessage({ type: "viewModeChanged", mode });

  if (isSpecs || specBadgesVisible) {
    refreshSpecBadges();
  } else {
    // Clear badges when leaving spec view with toggle OFF
    if (overlay) overlay.innerHTML = "";
  }

  if (isSpecs) {
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

// ─── AI Chat ────────────────────────────────────────────────────────────

const AI_ENDPOINT = 'https://fast-draft.com/api/ai';

/** Chat conversation history for multi-turn context. */
const chatHistory = [];
let aiChatSending = false;

// ─── Quick-Action Chips ─────────────────────────────────

const CHIPS_NONE = [
  { label: '🎨 Improve colors', msg: 'Improve the color palette to be more harmonious and modern' },
  { label: '📐 Add header', msg: 'Add a header section to the design' },
  { label: '✦ Review design', msg: 'Review my design and suggest improvements' },
];

const CHIPS_SINGLE = [
  { label: '🎨 Restyle', msg: 'Improve the styling of this node — better colors, corner radius, shadow' },
  { label: '📝 Rename', msg: 'Suggest a better semantic name for this node' },
  { label: '✨ Add hover', msg: 'Add a subtle hover animation to this node' },
];

const CHIPS_MULTI = [
  { label: '📦 Group these', msg: 'Group these selected nodes into a frame with proper layout' },
  { label: '📐 Align layout', msg: 'Align and arrange these nodes in a clean layout' },
  { label: '🔗 Add edges', msg: 'Add connecting edges between these nodes' },
];

// ─── Selection Context ──────────────────────────────────

function getSelectionContext() {
  if (!fdCanvas) return { ids: [], fdCode: '' };
  let ids = [];
  try {
    const idsJson = fdCanvas.get_selected_ids?.();
    if (idsJson) ids = JSON.parse(idsJson);
  } catch (_) {}
  if (ids.length === 0) {
    try {
      const singleId = fdCanvas.get_selected_id?.();
      if (singleId) ids = [singleId];
    } catch (_) {}
  }
  let fdCode = '';
  if (ids.length > 0) {
    try { fdCode = fdCanvas.emit_selection_fd?.() || ''; } catch (_) {}
  }
  return { ids, fdCode };
}

function updateChatContextBadge() {
  const badge = document.getElementById('ai-chat-context-badge');
  if (!badge) return;
  const { ids } = getSelectionContext();
  if (ids.length === 0) {
    badge.classList.add('hidden');
    badge.textContent = '';
  } else if (ids.length === 1) {
    badge.classList.remove('hidden');
    badge.textContent = `📌 @${ids[0]}`;
  } else {
    badge.classList.remove('hidden');
    badge.textContent = `📌 ${ids.length} nodes selected`;
  }
}

function updateChatChips() {
  const container = document.getElementById('ai-chat-chips');
  if (!container) return;
  const { ids } = getSelectionContext();
  let chips;
  if (ids.length === 0) chips = CHIPS_NONE;
  else if (ids.length === 1) chips = CHIPS_SINGLE;
  else chips = CHIPS_MULTI;

  container.innerHTML = '';
  for (const chip of chips) {
    const btn = document.createElement('button');
    btn.className = 'ai-chat-chip';
    btn.textContent = chip.label;
    btn.addEventListener('click', () => {
      const input = document.getElementById('ai-chat-input');
      if (input) {
        input.value = chip.msg;
        input.dispatchEvent(new Event('input'));
      }
      sendChatMessage();
    });
    container.appendChild(btn);
  }
}

// ─── Message Rendering ──────────────────────────────────

function escapeHtmlChat(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderAssistantHtml(content) {
  const parts = content.split(/(```fd\n[\s\S]*?```)/g);
  let html = '';
  let blockIndex = 0;
  for (const part of parts) {
    const fdMatch = part.match(/```fd\n([\s\S]*?)```/);
    if (fdMatch) {
      const fdCode = fdMatch[1].trim();
      const bid = `fd-block-${Date.now()}-${blockIndex++}`;
      html += `<pre><code>${escapeHtmlChat(fdCode)}</code></pre>`;
      html += `<div class="fd-block-action" data-bid="${bid}">`;
      html += `<button class="fd-apply-btn" data-fd="${encodeURIComponent(fdCode)}" data-bid="${bid}">✓ Apply</button>`;
      html += `<button class="fd-reject-btn" data-bid="${bid}">✕ Skip</button>`;
      html += '</div>';
    } else {
      let md = escapeHtmlChat(part);
      md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
      md = md.replace(/\n/g, '<br>');
      html += md;
    }
  }
  return html;
}

// ─── Smart Replace ──────────────────────────────────────

function findNodeBlock(source, nodeId) {
  const regex = new RegExp(
    `^((?:rect|ellipse|text|frame|group|path|image|edge|style)\\s+@${nodeId}(?:\\s|\\{))`, 'm'
  );
  const match = source.match(regex);
  if (!match) return null;
  const start = source.indexOf(match[0]);
  if (start === -1) return null;
  let depth = 0, i = start, foundOpen = false;
  while (i < source.length) {
    if (source[i] === '{') { depth++; foundOpen = true; }
    if (source[i] === '}') { depth--; }
    if (foundOpen && depth === 0) {
      let end = i + 1;
      while (end < source.length && source[end] === '\n') end++;
      return { start, end };
    }
    i++;
  }
  const lineEnd = source.indexOf('\n', start);
  return { start, end: lineEnd === -1 ? source.length : lineEnd + 1 };
}

function extractNodeBlock(source, nodeId) {
  const range = findNodeBlock(source, nodeId);
  if (!range) return null;
  return source.slice(range.start, range.end).trim() + '\n';
}

function smartApplyFdCode(fdCode) {
  if (!fdCanvas) return;
  const current = fdCanvas.get_text();
  const nodeIdMatches = [...fdCode.matchAll(/^(?:rect|ellipse|text|frame|group|path|image|edge)\s+@(\w+)/gm)];
  if (nodeIdMatches.length === 0) {
    fdCanvas.set_text(current.trimEnd() + '\n\n' + fdCode + '\n');
    vscode.postMessage({ type: 'textUpdate', text: fdCanvas.get_text() });
    renderDirty = true;
    return;
  }
  let result = current;
  let anyReplaced = false;
  for (const match of nodeIdMatches) {
    const nodeId = match[1];
    const blockRange = findNodeBlock(result, nodeId);
    if (blockRange) {
      const newBlock = extractNodeBlock(fdCode, nodeId);
      if (newBlock) {
        result = result.slice(0, blockRange.start) + newBlock + result.slice(blockRange.end);
        anyReplaced = true;
      }
    }
  }
  if (!anyReplaced) {
    result = result.trimEnd() + '\n\n' + fdCode + '\n';
  }
  fdCanvas.set_text(result);
  vscode.postMessage({ type: 'textUpdate', text: result });
  renderDirty = true;
}

// ─── Add Message ────────────────────────────────────────

function addChatMessage(role, content) {
  const messages = document.getElementById('ai-chat-messages');
  if (!messages) return null;
  const welcome = messages.querySelector('.ai-chat-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `ai-chat-msg ${role}`;

  if (role === 'user') {
    div.textContent = content;
  } else if (role === 'thinking') {
    div.textContent = '✦ Thinking…';
  } else {
    div.innerHTML = renderAssistantHtml(content);
    div.querySelectorAll('.fd-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fdCode = decodeURIComponent(btn.dataset.fd);
        smartApplyFdCode(fdCode);
        const actionDiv = btn.closest('.fd-block-action');
        if (actionDiv) actionDiv.innerHTML = '<span style="color:#34C759;font-size:10px;font-weight:600">✓ Applied</span>';
      });
    });
    div.querySelectorAll('.fd-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionDiv = btn.closest('.fd-block-action');
        if (actionDiv) actionDiv.innerHTML = '<span style="color:#86868B;font-size:10px;font-style:italic">Skipped</span>';
      });
    });
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

// ─── Send Message ───────────────────────────────────────

async function sendChatMessage() {
  const input = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-chat-send');
  if (!input || aiChatSending) return;

  const text = input.value.trim();
  if (!text) return;

  aiChatSending = true;
  if (sendBtn) sendBtn.disabled = true;
  input.value = '';
  input.style.height = 'auto';

  const { ids: selIds, fdCode: selFd } = getSelectionContext();
  let displayMsg = text;
  if (selIds.length > 0) {
    displayMsg = `[📌 ${selIds.map(id => '@' + id).join(', ')}] ${text}`;
  }

  chatHistory.push({ role: 'user', content: text });
  addChatMessage('user', displayMsg);
  const thinkingDiv = addChatMessage('thinking', '');

  try {
    const docContent = fdCanvas ? fdCanvas.get_text() : '';
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        messages: chatHistory,
        context: docContent.slice(0, 8000),
        selection: selFd ? selFd.slice(0, 4000) : undefined,
        selection_ids: selIds.length > 0 ? selIds : undefined,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }

    if (thinkingDiv) thinkingDiv.remove();

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && response.body) {
      // ─── SSE Streaming ─────────────────────────────
      const messages = document.getElementById('ai-chat-messages');
      const div = document.createElement('div');
      div.className = 'ai-chat-msg assistant';

      const welcome = messages?.querySelector('.ai-chat-welcome');
      if (welcome) welcome.remove();
      messages?.appendChild(div);

      let accumulated = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const token = parsed.response || '';
            if (token) {
              accumulated += token;
              div.textContent = accumulated;
              messages.scrollTop = messages.scrollHeight;
            }
          } catch (_) {}
        }
      }

      // Finalize with full markdown + Apply/Skip buttons
      const finalContent = accumulated || 'No response received.';
      chatHistory.push({ role: 'assistant', content: finalContent });
      div.innerHTML = renderAssistantHtml(finalContent);

      div.querySelectorAll('.fd-apply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fdCode = decodeURIComponent(btn.dataset.fd);
          smartApplyFdCode(fdCode);
          const actionDiv = btn.closest('.fd-block-action');
          if (actionDiv) actionDiv.innerHTML = '<span style="color:#34C759;font-size:10px;font-weight:600">✓ Applied</span>';
        });
      });
      div.querySelectorAll('.fd-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const actionDiv = btn.closest('.fd-block-action');
          if (actionDiv) actionDiv.innerHTML = '<span style="color:#86868B;font-size:10px;font-style:italic">Skipped</span>';
        });
      });
      messages.scrollTop = messages.scrollHeight;
    } else {
      // ─── Fallback: full JSON response ──────────────
      const data = await response.json();
      const assistantContent = data.result || 'No response received.';
      chatHistory.push({ role: 'assistant', content: assistantContent });
      addChatMessage('assistant', assistantContent);
    }
  } catch (err) {
    if (thinkingDiv) thinkingDiv.remove();
    addChatMessage('assistant', `⚠️ Error: ${err.message}`);
  } finally {
    aiChatSending = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// ─── Panel Toggle ───────────────────────────────────────

function toggleChatPanel() {
  const panel = document.getElementById('ai-chat-panel');
  if (!panel) return;
  const willOpen = panel.classList.contains('hidden');
  if (willOpen) {
    // Exclusive: close specs panel
    const specsPanel = document.getElementById('specs-panel');
    if (specsPanel && !specsPanel.classList.contains('hidden')) {
      specsPanel.classList.add('hidden');
    }
  }
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('ai-chat-input')?.focus();
    updateChatContextBadge();
    updateChatChips();
  }
}

function clearChat() {
  chatHistory.length = 0;
  const messages = document.getElementById('ai-chat-messages');
  if (messages) {
    messages.innerHTML = '<div class="ai-chat-welcome"><p>Ask me about your design. I can modify nodes, suggest improvements, or answer questions.</p><p class="ai-chat-hint">Try: "Make the colors warmer" or "Add a header section"</p></div>';
  }
}

// ─── Setup ──────────────────────────────────────────────

function setupAiChat() {
  document.getElementById('ai-chat-btn')?.addEventListener('click', toggleChatPanel);
  document.getElementById('ai-chat-close')?.addEventListener('click', () => {
    document.getElementById('ai-chat-panel')?.classList.add('hidden');
  });
  document.getElementById('ai-chat-clear')?.addEventListener('click', clearChat);
  document.getElementById('ai-chat-send')?.addEventListener('click', sendChatMessage);

  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });
    input.addEventListener('focus', () => {
      updateChatContextBadge();
      updateChatChips();
    });
  }

  // Update chips/badge on selection changes
  document.addEventListener('fd-selection-changed', () => {
    const panel = document.getElementById('ai-chat-panel');
    if (panel && !panel.classList.contains('hidden')) {
      updateChatContextBadge();
      updateChatChips();
    }
  });

  updateChatChips();
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

    // Detect flow animations for continuous render loop
    hasFlowEdges = fdCanvas.has_active_flows();

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
    setupFullscreenToggle();
    setupZoomIndicator();
    setupGridToggle();
    setupSpecBadgeToggle();
    setupExportButton();
    setupInsertMenu();
    setupMinimap();
    setupColorSwatches();
    setupPanelResize();
    setupTouchGestures();
    setupZoomControls();
    setupUndoRedoControls();
    setupSettingsMenu();
    setupFloatingToolbar();
    setupEdgeContextMenu();
    setupAiChat();

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
  // Fill background in identity-scaled space (covers full canvas regardless of pan/zoom)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const isDark = document.body.classList.contains("dark-theme");
  ctx.fillStyle = isDark ? '#1C1C1E' : '#F5F5F7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.save();
  // Apply zoom + pan: scale by zoom, then translate by pan
  const z = zoomLevel * dpr;
  ctx.setTransform(z, 0, 0, z, panX * dpr, panY * dpr);
  // Draw grid below shapes
  if (gridEnabled) drawGrid();
  fdCanvas.render(ctx, performance.now(), gridEnabled, true);

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

  // ── Alt+drag ghost: translucent outlines at original positions ──
  if (altDragGhosts.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#4FC3F7";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    for (const g of altDragGhosts) {
      ctx.strokeRect(g.x, g.y, g.w, g.h);
    }
    ctx.restore();
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
    if (renderDirty || activeTweens.length > 0 || erasePoofs.length > 0 || hasFlowEdges) {
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
    if (viewMode === "specs" || specBadgesVisible) refreshSpecBadges();
    if (viewMode === "specs") refreshSpecView();
    refreshLayersPanel();
    renderMinimap();
  }, 100);
}


// ─── Start ───────────────────────────────────────────────────────────────────

main();

