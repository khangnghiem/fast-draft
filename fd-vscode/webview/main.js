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
// Imported by both site/app.js and fd-vscode/webview/src/main.js.
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
// Imported by both site/app.js and fd-vscode/webview/src/main.js.
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
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      try {
        const bj = fdCanvas.get_node_bounds(m[1]);
        if (!bj) continue;
        const b = JSON.parse(bj);
        if (b.width > 0 && b.height > 0) nodes.push(b);
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
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      try {
        const bj = fdCanvas.get_node_bounds(m[1]);
        if (!bj) continue;
        const b = JSON.parse(bj);
        if (b.width > 0 && b.height > 0) {
          sx = Math.min(sx, b.x);
          sy = Math.min(sy, b.y);
          sx2 = Math.max(sx2, b.x + b.width);
          sy2 = Math.max(sy2, b.y + b.height);
          found = true;
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

/**
 * Transforms pasted FD text for importing as a component/module.
 * Implements Smart Detection + Namespace prefixing.
 *
 * @param {string} text - The raw FD text to import
 * @param {string} namespace - The prefix namespace (e.g. "buttons")
 * @returns {string} The transformed FD text ready to be inserted
 */
function buildImportText(text, namespace) {
  if (!text || !text.trim()) return '';
  const lines = text.split('\n');

  // Regex to detect top-level node definitions
  // Matches "rect @id {...}" or "group @id {" etc, ignoring whitespace at start
  const topLevelPattern = /^\s*(group|frame|rect|ellipse|path|text|edge|style)\s+@(\w+)/;
  
  let rootBlocksCount = 0;
  for (const line of lines) {
    // Only count lines that represent root-level blocks (not indented)
    // Actually, simple heuristic: just count occurrences of node starts without heavy indentation
    if (topLevelPattern.test(line)) {
      if (!line.match(/^\s{2,}/)) { // A true root node shouldn't have indent >= 2 spaces
        rootBlocksCount++;
      }
    }
  }

  // 1. Rename all @ids to @namespace.id
  let processedText = text;
  
  // Find all declared IDs to rename properly
  const allIdsPattern = /@(\w+)/g;
  const allIds = new Set();
  let match;
  while ((match = allIdsPattern.exec(text)) !== null) {
    // Ignore if already namespaced like @ns.id or reserved
    if (match[1] !== 'canvas') {
      allIds.add(match[1]);
    }
  }
  
  for (const id of allIds) {
    // Basic regex replace with word boundaries. Allows dot notation.
    processedText = processedText.replace(new RegExp(`@${id}\\b`, 'g'), `@${namespace}.${id}`);
  }

  // 2. Wrap if needed (Smart Detection)
  let finalText = processedText.trim();
  
  if (rootBlocksCount === 0) {
    return text; // No valid FD blocks found, just return original to let parser handle/error
  }
  
  if (rootBlocksCount === 1) {
    // #3 Smart Detection: Single root -> flat structure, no wrapper
    // The namespace prefix already applied above.
  } else {
    // Multi-root -> #1 Group Wrap
    // Wrap the entire processed text in a group labeled @import_namespace
    
    // Indent the original text for clean formatting
    const indented = finalText.split('\n').map(l => l ? '  ' + l : l).join('\n');
    finalText = `group @import_${namespace} {\n${indented}\n}`;
  }

  return finalText;
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
  
  const r = Math.max(hitRadius, 12); // Padded hit radius

  // Try parsing regular bounds
  let b;
  try {
    b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) {}

  // Edge Anchor check
  if (!b || b.x === undefined) {
    let edge;
    try { edge = JSON.parse(fdCanvas.get_edge_endpoints(selectedId)); } catch (_) {}
    if (edge && edge.startX !== undefined) {
      const handles = [
        { hx: edge.startX, hy: edge.startY, cursor: 'crosshair' },
        { hx: edge.endX, hy: edge.endY, cursor: 'crosshair' }
      ];
      for (const { hx, hy, cursor } of handles) {
        const dx = x - hx, dy = y - hy;
        if (dx * dx + dy * dy <= r * r) return cursor;
      }
    }
    return '';
  }

  // Check if selected node is text (horizontal-only resize)
  const propsJson = fdCanvas.get_selected_node_props();
  let isText = false;
  try { isText = JSON.parse(propsJson).kind === 'text'; } catch (_) {}

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
  e: 'ellipse',
  x: 'eraser',
  p: 'pen',
  a: 'arrow',
  t: 'text',
  f: 'frame',
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
        ['E / O', 'Ellipse'],
        ['P', 'Pen (freehand)'],
        ['A', 'Arrow'],
        ['T', 'Text'],
        ['F', 'Frame'],
        ['X', 'Eraser'],
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
        [`${cmd}Drag`, 'Nest into container', true],
        ['Alt+drag', 'Duplicate while moving'],
        [`${cmd}⌥Click`, 'Deep select child', true],
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
    for (const item of section.shortcuts) {
      const key = item[0];
      const desc = item[1];
      const isNew = item[2];
      const badgeHtml = isNew ? `<span class="help-badge-new">New!</span>` : '';
      html += `<div class="help-row"><dt><kbd>${key}</kbd></dt><dd>${desc}${badgeHtml}</dd></div>`;
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
// Imported by both site/app.js and fd-vscode/webview/src/inline-edit.js.
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
 * Build a CSS-ready font-family string from WASM props.
 * The WASM backend returns a pre-formatted CSS string (e.g. "Inter, sans-serif").
 * We pass it through verbatim — NO quoting, NO extra fallbacks.
 * This must match render2d.rs:525: ctx.set_font(&format!("{weight} {size}px {family}"))
 */
function buildFontFamily(propsFontFamily) {
  return propsFontFamily || 'Inter, sans-serif';
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
  const fontFamily = buildFontFamily(props.fontFamily);
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
 * @param {string} [opts.parentShapeId] — parent shape ID for text-in-shape editing
 */
async function openInlineEditor(opts) {
  if (inlineEditorActive) return;
  inlineEditorActive = true;

  let { nodeId } = opts;
  const {
    propKey, currentValue,
    fdCanvas, canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    panX, panY, zoomLevel,
    parentShapeId, createCtx,
    initialChar,
  } = opts;

  if (nodeId) {
    if (document.fonts) await document.fonts.ready;
    // Force-measure text bounds BEFORE reading them
    measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
  }

  // For text-in-shape: use parent shape bounds for textarea overlay
  let posId = nodeId;
  if (parentShapeId) posId = parentShapeId;
  else if (createCtx && createCtx.parentShapeId) posId = createCtx.parentShapeId;
  else if (createCtx && createCtx.edgeId) posId = createCtx.edgeId;

  let b;
  if (posId) {
    // Guarantee layout is resolved before reading bounds — prevents stale x/y
    // after drag or position mutations that don't trigger measureAndUpdateTextBounds.
    fdCanvas.finalize_bounds();
    const boundsJson = fdCanvas.get_node_bounds(posId);
    b = JSON.parse(boundsJson);
  } else if (createCtx && createCtx.type === "canvas") {
    b = { x: createCtx.x, y: createCtx.y, w: 80, h: 24 };
  } else {
    b = { x: 0, y: 0, w: 80, h: 24 };
  }
  const bw = b.w || 80;
  const bh = b.h || 24;

  // Suppress text rendering AND set selection BEFORE any render — prevents
  // the blue selection box from flashing for a single frame.
  if (nodeId) {
    if (fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node(nodeId);
    }
    fdCanvas.select_by_id(nodeId);
  }
  fdCanvas.clear_pressed();
  renderFn();

  // Read node props for styling
  let props;
  if (nodeId) {
    const propsJson = fdCanvas.get_selected_node_props();
    props = JSON.parse(propsJson);
  } else if (createCtx && createCtx.type === "canvas") {
    props = { kind: "text", fontSize: 14, fontFamily: "Inter, sans-serif", fontWeight: 400 };
  } else if (createCtx && createCtx.type === "child") {
    props = { kind: "text" };
  } else if (createCtx && createCtx.type === "edge") {
    props = { kind: "text", fontSize: 14 };
  } else {
    props = { kind: "text" };
  }

  const rawFontSize = props.fontSize || 14;
  // Sub-pixel precision — do NOT round. Matches Canvas2D `{weight} {size}px {family}`.
  const fontSize = rawFontSize * zoomLevel;
  const fontFamily = buildFontFamily(props.fontFamily);
  const fontWeight = props.fontWeight || 400;
  const lineHeight = rawFontSize * 1.2 * zoomLevel;

  // Offset canvas-element origin within its overlay container
  const canvasRect = canvasEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top - containerRect.top;
  const scaledW = bw * zoomLevel;
  const scaledH = bh * zoomLevel;
  const sw = Math.max(scaledW, 80) + 2;
  const sh = Math.max(scaledH, lineHeight + 4);

  // Determine node context BEFORE coordinate math
  const isTextNode = props.kind === "text";
  const isInShape = !!parentShapeId || (createCtx && createCtx.type === "child");

  // Text nodes: anchor at top-left — matches Canvas2D draw_text baseline.
  // Shapes (text-in-shape): center the editor over the shape bounds.
  const centerX = (isTextNode && !isInShape) ? 0 : (sw - scaledW) / 2;
  const centerY = (isTextNode && !isInShape) ? 0 : (sh - scaledH) / 2;
  // Sub-pixel positioning — match Canvas2D coordinate space exactly.
  // Do NOT round to integer px; CSS handles sub-pixel fine.
  const sx = (b.x || 0) * zoomLevel + panX + canvasOffsetX - centerX;
  const sy = (b.y || 0) * zoomLevel + panY + canvasOffsetY - centerY;

  // Colors & shape styling
  const isDark = document.body.classList.contains("dark-theme") ||
                 document.body.classList.contains("vscode-dark");
  let bgColor, textColor;

  // Read parent shape props for styling when editing text-in-shape
  let shapeProps = null;
  const actualParentShapeId = parentShapeId || (createCtx && createCtx.parentShapeId);
  if (isInShape && actualParentShapeId) {
    fdCanvas.select_by_id(actualParentShapeId);
    const spJson = fdCanvas.get_selected_node_props();
    shapeProps = JSON.parse(spJson);
    // Re-select the text node so mutations target the right node
    if (nodeId) fdCanvas.select_by_id(nodeId);
  }

  if (isInShape && shapeProps) {
    // Use parent shape's fill for WYSIWYG overlay
    if (shapeProps.fill && shapeProps.fill !== "none") {
      bgColor = shapeProps.fill;
      // Contrast text color on shape fill — match render2d luminance fallback
      textColor = hexLuminance(shapeProps.fill) < 0.4 ? "#FFFFFF" : "#1D1D1F";
    } else {
      bgColor = "transparent";
      // Default text color must match theme.text_primary (#1D1D1F light, #F5F5F7 dark)
      textColor = props.fill || (isDark ? "#F5F5F7" : "#1D1D1F");
    }
  } else if (isTextNode) {
    bgColor = "transparent";
    // Default text color must match theme.text_primary (#1D1D1F light, #F5F5F7 dark)
    textColor = props.fill || (isDark ? "#F5F5F7" : "#1D1D1F");
  } else if (props.fill) {
    bgColor = props.fill;
    textColor = hexLuminance(props.fill) < 0.4 ? "#FFFFFF" : "#1D1D1F";
  } else {
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#F5F5F7" : "#1D1D1F";
  }

  const hAlign = props.textAlign || (isTextNode && !isInShape ? "left" : "center");
  const vAlign = props.textVAlign || (isInShape ? "middle" : "top");
  const originalValue = currentValue;

  // Vertical padding — computed against actual bounds height (scaledH), not
  // the min-enforced textarea height (sh), so centering matches Canvas2D.
  //
  // CSS line-height > font-size creates half-leading that pushes the glyph
  // down by (lineHeight - fontSize) / 2 from the line-box top. Canvas2D
  // textBaseline="top" places the em-square top exactly at y, so the glyph
  // starts at the same position as the line-box top minus the half-leading.
  // We compensate by subtracting the half-leading from padTop so the
  // textarea glyph aligns with the Canvas2D glyph.
  const topOffset = 2 * zoomLevel;
  const halfLeading = (lineHeight - fontSize) / 2;
  let padTop = 0, padBottom = 0;
  if (vAlign === "top") {
    padTop = topOffset - halfLeading;
  } else if (vAlign === "middle") {
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, (scaledH - textHeight) / 2);
    padBottom = padTop;
  } else if (vAlign === "bottom") {
    padBottom = topOffset;
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, scaledH - textHeight - padBottom);
  }

  // Border radius — use parent shape's kind when editing text-in-shape
  const shapeKind = isInShape && shapeProps ? shapeProps.kind : props.kind;
  let borderRadius = "8px";
  if (shapeKind === "ellipse") borderRadius = "50%";
  else if (shapeKind === "rect" || shapeKind === "frame") {
    const cr = (isInShape && shapeProps ? shapeProps.cornerRadius : props.cornerRadius);
    borderRadius = cr !== undefined ? `${Math.round(cr * zoomLevel)}px` : "0";
  } else if (isTextNode && !isInShape) borderRadius = "0";

  // Subtle edit-mode affordance (Figma-inspired blue ring)
  const isTransparentBg = bgColor === 'transparent';
  const outlineStyle = isTransparentBg
    ? '1.5px solid rgba(0, 122, 255, 0.35)'
    : '1.5px solid rgba(0, 122, 255, 0.2)';
  const boxShadow = isTransparentBg
    ? '0 0 0 3px rgba(0, 122, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.06)'
    : '0 0 0 3px rgba(0, 122, 255, 0.06)';

  const isAutoWidth = isTextNode && !isInShape && !props.maxWidth;
  const whiteSpace = isAutoWidth ? 'pre' : 'pre-wrap';

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`, `top:${sy}px`,
    `width:${sw}px`, `height:${sh}px`,
    `padding:${padTop}px 0 ${padBottom}px 0`,
    `font:${fontWeight} ${fontSize}px ${fontFamily}`,
    `line-height:${lineHeight}px`,
    `border:none`,
    `outline:${outlineStyle}`, `outline-offset:1px`,
    `border-radius:${borderRadius}`,
    `background:${bgColor}`, `color:${textColor}`,
    `resize:none`, `z-index:100`,
    `box-shadow:${boxShadow}`,
    `overflow:hidden`, `text-align:${hAlign}`,
    `box-sizing:border-box`,
    `-webkit-text-size-adjust:100%`,
    `word-wrap:break-word`, `white-space:${whiteSpace}`,
    `overflow-wrap:break-word`,
    `letter-spacing:0px`,
  ].join(";");

  container.appendChild(textarea);
  textarea.focus();
  if (initialChar) {
    // Type-to-create: pre-fill with the triggering character, cursor at end
    textarea.value = initialChar;
    textarea.setSelectionRange(initialChar.length, initialChar.length);
  } else {
    textarea.select();
  }

  let lastSyncedValue = currentValue;
  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    
    if (!nodeId && createCtx && val.trim() !== "") {
      if (createCtx.type === "canvas") {
        fdCanvas.create_node_at("text", createCtx.x, createCtx.y);
        nodeId = fdCanvas.get_selected_id();
      } else if (createCtx.type === "child") {
        nodeId = fdCanvas.create_child_text(createCtx.parentShapeId, "");
      } else if (createCtx.type === "edge") {
        const textBefore = fdCanvas.get_text();
        nodeId = fdCanvas.create_edge_text_child(createCtx.edgeId, "");
        if (nodeId) {
          const textAfter = fdCanvas.get_text();
          fdCanvas.push_undo_snapshot(textBefore, textAfter);
        }
      }
      if (nodeId && fdCanvas.set_suppressed_text_node) {
        fdCanvas.set_suppressed_text_node(nodeId);
      }
    }
    
    if (nodeId) {
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, val);
      measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
      renderFn();
      syncFn();

      const boundsJson = fdCanvas.get_node_bounds(nodeId);
      if (boundsJson) {
        const newB = JSON.parse(boundsJson);
        const newScaledW = newB.w * zoomLevel;
        const newScaledH = newB.h * zoomLevel;
        const newSw = Math.max(newScaledW, 80) + 2;
        const newSh = Math.max(newScaledH, lineHeight + 4);
        textarea.style.width = `${newSw}px`;
        textarea.style.height = `${newSh}px`;
      }
    }
  });

  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    if (fdCanvas && fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node();
    }
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (!nodeId) {
      if (updatePanelFn) updatePanelFn();
      renderFn();
      return;
    }

    if (propKey === "content" && newVal.trim() === "") {
      fdCanvas.select_by_id(nodeId);
      const changed = fdCanvas.delete_selected();
      if (changed) {
        renderFn();
        syncFn();
        if (updatePanelFn) updatePanelFn();
      }
      return;
    }

    if (newVal === originalValue) {
      // No change — deselect and return to neutral canvas state
      fdCanvas.select_by_id("");
      renderFn();
      return;
    }
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      if (propKey === "content") measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
      syncFn();
      if (updatePanelFn) updatePanelFn();
    }
    // Editing complete — deselect to return canvas to neutral state
    fdCanvas.select_by_id("");
    renderFn();
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (fdCanvas && fdCanvas.set_suppressed_text_node) {
        fdCanvas.set_suppressed_text_node();
      }
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);

      if (!nodeId) {
        renderFn();
        e.stopPropagation();
        return;
      }

      if (propKey === "content" && originalValue.trim() === "") {
        fdCanvas.select_by_id(nodeId);
        if (fdCanvas.delete_selected()) {
          renderFn();
          syncFn();
          if (updatePanelFn) updatePanelFn();
        }
      } else {
        fdCanvas.select_by_id(nodeId);
        fdCanvas.set_node_prop(propKey, originalValue);
        // Cancel complete — deselect to return canvas to neutral state
        fdCanvas.select_by_id("");
        renderFn();
        syncFn();
      }
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  });

  textarea.addEventListener("blur", () => { setTimeout(commit, 0); });
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

  // Fix "weird box" bug: Web/VSCode UI elements outside the canvas often call e.preventDefault()
  // on pointerdown to stop scrolling, which blocks the browser's native blur on the textarea.
  // We attach a capture listener to `window` to intercept clicks *everywhere* in the app.
  if (!window.__fd_inline_editor_capture_installed) {
    window.addEventListener("pointerdown", (e) => {
      if (inlineEditorActive && document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
        // Only force blur if the user clicked OUTSIDE the textarea itself
        if (e.target !== document.activeElement) {
          document.activeElement.blur();
        }
      }
    }, { capture: true });
    window.__fd_inline_editor_capture_installed = true;
  }

  canvasEl.addEventListener("dblclick", (e) => {
    const fdCanvas = typeof opts.fdCanvas === 'function' ? opts.fdCanvas() : opts.fdCanvas;
    if (!fdCanvas) return;

    const { x, y } = screenToScene(e.clientX, e.clientY, canvasEl);
    let nodeId = fdCanvas.get_selected_id();

    // Fallback: hit-test at click coordinates in case selection was cleared
    // between the two pointerdown events that precede a dblclick.
    // This fixes double-click on ellipses (and rects) that were not yet selected.
    if (!nodeId) {
      const hitId = fdCanvas.hit_test_at(x, y);
      if (hitId) {
        fdCanvas.select_by_id(hitId);
        nodeId = hitId;
      }
    }

    // Still no selection after hit-test → open unmaterialized inline editor
    if (!nodeId) {
      setTimeout(() => openInlineEditor({
        nodeId: null, propKey: "content", currentValue: "",
        createCtx: { type: "canvas", x, y },
        fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
        panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
      }), 50);
      e.preventDefault();
      return;
    }

    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props.id) return;

    // Edge → edit/create label
    if (props.kind === "edge") {
      const edgeId = props.id;

      // Use WASM API to check for existing text child (idempotent, no duplicates)
      const existingTextId = fdCanvas.get_edge_text_child_id(edgeId);
      if (existingTextId) {
        // Edit existing label
        fdCanvas.select_by_id(existingTextId);
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        renderFn();
        openInlineEditor({
          nodeId: existingTextId, propKey: "content", currentValue: childProps.content || "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        });
      } else {
        // Lazy materialization for edge label
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          createCtx: { type: "edge", edgeId },
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        }), 50);
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
        // Suppress text node before selecting + rendering to prevent blue box flash
        if (fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(existingTextId);
        }
        fdCanvas.select_by_id(existingTextId);
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        openInlineEditor({
          nodeId: existingTextId, propKey: "content", currentValue: childProps.content || "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          parentShapeId: props.id,
        });
      } else {
        // Lazy materialization for child text
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          createCtx: { type: "child", parentShapeId: props.id },
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          parentShapeId: props.id,
        }), 50);
      }
    }
    e.preventDefault();
  });
}
// ── canvas-core/menu-registry.js ──
function buildUnifiedNodeMenu(nodeId, selectedIds, isContainer, hasChildren, isLocked, canGroup, canUngroup, sceneText) {
  const isMultiple = selectedIds.length > 1;
  const isSingle = !isMultiple;
  
  return [
    { type: 'header', label: isMultiple ? `${selectedIds.length} Nodes Selected` : `Node: ${nodeId}` },
    { type: 'action', icon: '⧉', label: 'Duplicate', shortcut: '⌘D', action: 'duplicate', disabled: false },
    { type: 'action', icon: '📷', label: 'Copy as PNG', shortcut: '⌘⇧E', action: 'copy-png', disabled: false },
    { type: 'action', icon: '📄', label: 'Copy FD Code', action: 'copy-fd', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '↑', label: 'Bring to Front', shortcut: '⌘⇧]', action: 'bring-front', disabled: false },
    { type: 'action', icon: '↓', label: 'Send to Back', shortcut: '⌘⇧[', action: 'send-back', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '⚏', label: 'Group', shortcut: '⌘G', action: 'group', disabled: !canGroup },
    { type: 'action', icon: '⬚', label: 'Frame Selection', shortcut: '⌘⌥G', action: 'frame', disabled: !isMultiple && !isContainer },
    { type: 'action', icon: '☷', label: 'Ungroup', shortcut: '⌘⇧G', action: 'ungroup', disabled: !canUngroup },
    { type: 'separator' },
    { type: 'action', icon: '↳', label: 'Move Into...', action: 'move-into-search', disabled: false },
    { type: 'action', icon: '↰', label: 'Move to Root', action: 'move-to-root', disabled: false },
    { type: 'action', icon: '⬚', label: 'Select Children', action: 'select-children', disabled: !hasChildren },
    { type: 'separator' },
    { type: 'action', icon: isLocked ? '🔓' : '🔒', label: isLocked ? 'Unlock' : 'Lock', shortcut: '⌘L', action: 'toggle-lock', disabled: false },
    { type: 'action', icon: '✏️', label: 'Rename', shortcut: '↵', action: 'rename', disabled: isMultiple },
    { type: 'action', icon: '💬', label: 'Add Spec/Note', action: 'add-spec', disabled: false },
    { type: 'action', icon: '✦', label: 'AI Touch', shortcut: '⌘I', action: 'ai-touch', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '🗑', label: 'Delete', shortcut: '⌫', action: 'delete', danger: true, disabled: false }
  ];
}

function buildUnifiedEdgeMenu(edgeId) {
  return [
    { type: 'header', label: `Edge @${edgeId}` },
    { type: 'action', icon: '📋', label: 'Copy', shortcut: '⌘C', action: 'copy', disabled: false },
    { type: 'action', icon: '✂', label: 'Cut', shortcut: '⌘X', action: 'cut', disabled: false },
    { type: 'action', icon: '⧉', label: 'Duplicate', shortcut: '⌘D', action: 'duplicate', disabled: false },
    { type: 'action', icon: '🗑', label: 'Delete Edge', shortcut: '⌫', action: 'delete', danger: true, disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '↔', label: 'Reverse Direction', action: 'edge-reverse', disabled: false },
    { type: 'action', icon: '✏️', label: 'Edit Label', action: 'edge-edit-label', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '📄', label: 'Copy as .fd', action: 'copy-fd', disabled: false }
  ];
}

function buildUnifiedCanvasMenu() {
  return [
    { type: 'action', icon: '📋', label: 'Paste', action: 'paste', shortcut: '⌘V', disabled: false },
    { type: 'action', icon: '▣', label: 'Select All', action: 'select-all', shortcut: '⌘A', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '➕', label: 'Add Node Here', action: 'add-node', disabled: false },
    { type: 'action', icon: '🔓', label: 'Unlock All', action: 'unlock-all', disabled: false } // We'll re-enable logic!
  ];
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
    .replace(/'/g, "&#039;");
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
    .replace(/'/g, "&#039;");
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
let canvasDragOccurred = false; // tracks whether a real canvas drag happened

// ─── ⌘+Drag Nest+Center state ──────────────────────────────────────────
let cmdDragNestTarget = null; // ID of the container highlighted during ⌘+drag

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
    if (changed) {
      render(); canvasDragOccurred = true;

      // ── ⌘+Drag nest highlight: show dashed border on target container ──
      if (e.metaKey && pointerIsDown && currentToolAtPointerDown === 'select') {
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
                  cmdDragNestTarget = hitId;
                } else {
                  cmdDragNestTarget = null;
                }
              } else {
                cmdDragNestTarget = null;
              }
            } else {
              cmdDragNestTarget = null;
            }
          } catch (_) { cmdDragNestTarget = null; }
        }
      } else if (!e.metaKey) {
        cmdDragNestTarget = null;
      }
    }

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
    const prevToolName = fdCanvas.get_tool_name();
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

    // ── Text tool: auto-open inline editor ──
    if (result.toolSwitched && prevToolName === 'text') {
      const newId = fdCanvas.get_selected_id();
      if (newId) {
        const container = document.getElementById('canvas-container') || canvas.parentNode;
        setTimeout(() => {
          openInlineEditor({
            nodeId: newId, propKey: 'content',
            currentValue: 'Text',
            fdCanvas, canvasEl: canvas, container,
            renderFn: render, syncFn: syncTextToExtension,
            updatePanelFn: updatePropertiesPanel,
            panX, panY, zoomLevel,
          });
        }, 50);
      }
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

    // ── Post-drag cleanup ──
    const wasDragging = result.wasDragging && !result.wasResizing;
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

    // ── ⌘+Drop nest+center: reparent into highlighted container ──
    if (cmdDragNestTarget && wasDragging && !canvasToLayersDone && (e.metaKey || e.ctrlKey)) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId && fdCanvas.reparent_into_centered) {
        const textBefore = fdCanvas.get_text();
        const changed = fdCanvas.reparent_into_centered(selectedId, cmdDragNestTarget);
        if (changed) {
          const textAfter = fdCanvas.get_text();
          if (textBefore !== textAfter) {
            vscode.postMessage({ type: 'pushUndo', textBefore, textAfter });
          }
          render();
          syncTextToExtension();
          updatePropertiesPanel();
          refreshLayersPanel();
          showToast(`Nested + centered into @${cmdDragNestTarget}`);
        }
      }
    }
    cmdDragNestTarget = null;

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
      if (allIds.length > 1) {
        vscode.postMessage({ type: "nodesSelected", ids: allIds });
      } else if (allIds.length === 1) {
        vscode.postMessage({ type: "nodeSelected", id: allIds[0] });
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

  // ── X-ray labels toggle (backtick) ──
  if (e.key === "`" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
      e.preventDefault();
      xrayLabels = !xrayLabels;
      markDirty();
      showToast(xrayLabels ? "X-ray labels ON" : "X-ray labels OFF");
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
  const toolShortcuts = { r: "rect", o: "ellipse", e: "ellipse", x: "eraser", p: "pen", a: "arrow", t: "text", f: "frame" };
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
        document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((b) => b.classList.remove("locked"));
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
    case "lockSelection":
      if (fdCanvas && fdCanvas.get_selected_ids) {
        const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
        let graphChanged = false;
        for (const id of selectedIds) {
          if (fdCanvas.toggle_node_locked) {
            fdCanvas.toggle_node_locked(id);
            graphChanged = true;
          }
        }
        if (graphChanged) {
          bumpGeneration();
          render();
          syncTextToExtension();
          updatePropertiesPanel();
          updateFloatingBar();
          if (typeof refreshLayersPanel === "function") refreshLayersPanel();
        }
      }
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
  if (e.key === "Shift") {
    modShiftHeld = false;
  }

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
        ["E / O", "Ellipse"],
        ["P", "Pen (freehand)"],
        ["A", "Arrow"],
        ["T", "Text"],
        ["F", "Frame"],
        ["X", "Eraser"],
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
        ["`", "Toggle X-ray node labels"],
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
  const boundsW = bounds.width ?? bounds.w;
  const screenW = boundsW * zoomLevel;

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
function upgradeUnifiedMenu(items, hitId) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.action === 'ai-touch') {
      items[i] = {
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
      };
    }
  }
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
  if (action === 'delete') {
    fdCanvas.select_by_id(contextMenuNodeId);
    const changed = fdCanvas.delete_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'unlock-all' || action === 'toggle-lock') {
    if (fdCanvas.toggle_node_locked) {
      fdCanvas.toggle_node_locked(contextMenuNodeId);
      render();
      syncTextToExtension();
    }
    return;
  }
  
  if (action === 'copy-fd') { copySelectedAsFd(); return; }
  
  // Handled layer interactions (stubbed for canvas unless implemented over bridge)
  if (action === 'move-to-root') {
    if (fdCanvas.move_selection_to_root) {
      const changed = fdCanvas.move_selection_to_root();
      if (changed) { render(); syncTextToExtension(); }
    }
    return;
  }
  if (action === 'select-children') {
    if (fdCanvas.select_children) {
      if (fdCanvas.select_children(contextMenuNodeId)) render();
    }
    return;
  }
  if (action === 'move-into-search') { return; }
}



function doDocumentAction(action, e) {
  if (!fdCanvas) return;
  
  if (action === 'paste') { pasteFromClipboard(); return; }
  if (action === 'select-all') {
    const changedJson = fdCanvas.handle_key("a", false, true, false, true);
    const result = JSON.parse(changedJson);
    if (result.changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'add-rectangle') {
    changeTool("rect");
    return;
  }
  if (action === 'add-text') {
    changeTool("text");
    return;
  }
  if (action === 'unlock-all') {
    if (fdCanvas.unlock_all) {
      fdCanvas.unlock_all();
      render();
      syncTextToExtension();
    }
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

    const hitId = fdCanvas.hit_test_at ? fdCanvas.hit_test_at(x, y) : "";
    let selectedIds = JSON.parse(fdCanvas.get_selected_ids());

    if (hitId) {
      // If we clicked on an unselected node, swap the selection strictly to it
      if (!selectedIds.includes(hitId)) {
        fdCanvas.handle_pointer_down(x, y, 1.0, false, false, false, false);
        fdCanvas.handle_pointer_up(x, y, false, false, false, false);
        selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      }
      render();
      contextMenuNodeId = hitId;
      
      const isContainer = fdCanvas.is_container ? fdCanvas.is_container(hitId) : false;
      const hasChildren = fdCanvas.has_children ? fdCanvas.has_children(hitId) : false;
      const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(hitId) : false;
      const canGroup = selectedIds.length >= 2 && (!hitId || !fdCanvas.is_node_locked(hitId));
      let canUngroup = false;
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) { canUngroup = true; break; }
      }
      
      // Get registry items
      let rawItems = buildUnifiedNodeMenu(hitId, selectedIds, isContainer, hasChildren, isLocked, canGroup, canUngroup, source);
      // Upgrade ai-touch to custom widget
      const items = upgradeUnifiedMenu(rawItems, hitId);

      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: (action, row) => doNodeAction(action, row),
      });
    } else {
      // It's empty space. Check for edge hits first...
      if (fdCanvas.hit_test_edge_at) {
        const edgeHit = fdCanvas.hit_test_edge_at(x, y);
        if (edgeHit) {
          const container = document.getElementById("canvas-container");
          const containerRect = container.getBoundingClientRect();
          showEdgeContextMenu(edgeHit, e.clientX - containerRect.left, e.clientY - containerRect.top);
          return;
        }
      }
      
      // Empty Canvas Menu
      const items = buildUnifiedCanvasMenu();
      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: (action, row) => doDocumentAction(action, e),
      });
    }
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

      const isContainer = fdCanvas.is_container ? fdCanvas.is_container(nodeId) : false;
      const hasChildren = fdCanvas.has_children ? fdCanvas.has_children(nodeId) : false;
      const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(nodeId) : false;
      const canGroup = selectedIds.length >= 2 && (!nodeId || !fdCanvas.is_node_locked(nodeId));
      let canUngroup = false;
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) { canUngroup = true; break; }
      }
      
      let rawItems = buildUnifiedNodeMenu(nodeId, selectedIds, isContainer, hasChildren, isLocked, canGroup, canUngroup, source);
      const items = upgradeUnifiedMenu(rawItems, nodeId);

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
  fdCanvas.select_by_id(edgeId);
  render();

  const getEdgeBlock = () => {
    const text = fdCanvas.get_text();
    const esc = edgeId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
    const re = new RegExp(`(edge\\\\s+@${esc}\\\\s*\\\\{[^}]*?)\\\\}`, "s");
    const m = text.match(re);
    return m ? m[1] : "";
  };

  const block = getEdgeBlock();
  const arrowMatch = block.match(/arrow:\\s*(\\S+)/);
  const curveMatch = block.match(/curve:\\s*(\\S+)/);
  const strokeMatch = block.match(/stroke:\\s*(#[\\w]+)\\s*([\\d.]+)?/);
  const flowMatch = block.match(/flow:\\s*(\\S+)(?:\\s+(\\d+)ms?)?/);

  const curArrow = arrowMatch ? arrowMatch[1] : "end";
  const curCurve = curveMatch ? curveMatch[1] : "smooth";
  const curStrokeColor = strokeMatch ? strokeMatch[1] : "#999999";
  const curStrokeWidth = (strokeMatch && strokeMatch[2]) ? strokeMatch[2] : "1";
  const curFlow = flowMatch ? flowMatch[1] : "none";
  const curFlowDur = (flowMatch && flowMatch[2]) ? flowMatch[2] : "800";

  let items = buildUnifiedEdgeMenu(edgeId);

  // Append context-menu form as a unified custom block
  items.push({
    type: 'custom',
    action: 'edge-properties',
    render: (wrap) => {
      wrap.className = 'menu-item-wrap ctx-edge-props-wrap';
      wrap.innerHTML = `
        <div class="ctx-edge-form" style="padding: 12px; font-size: 13px;">
          <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
            <label style="color:var(--ts-workspace-foreground, #ccc);">Arrow</label>
            <select id="dyn-ecm-arrow" style="background:var(--ts-workspace-background); color:var(--ts-workspace-foreground); border:1px solid var(--fd-border);">
              <option value="end" ${curArrow === 'end' ? 'selected' : ''}>End →</option>
              <option value="start" ${curArrow === 'start' ? 'selected' : ''}>← Start</option>
              <option value="both" ${curArrow === 'both' ? 'selected' : ''}>← Both →</option>
              <option value="none" ${curArrow === 'none' ? 'selected' : ''}>None</option>
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
            <label style="color:var(--ts-workspace-foreground, #ccc);">Curve</label>
            <select id="dyn-ecm-curve" style="background:var(--ts-workspace-background); color:var(--ts-workspace-foreground); border:1px solid var(--fd-border);">
              <option value="smooth" ${curCurve === 'smooth' ? 'selected' : ''}>Smooth</option>
              <option value="straight" ${curCurve === 'straight' ? 'selected' : ''}>Straight</option>
              <option value="step" ${curCurve === 'step' ? 'selected' : ''}>Step</option>
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
            <label style="color:var(--ts-workspace-foreground, #ccc);">Stroke</label>
            <div>
              <input type="color" id="dyn-ecm-stroke-color" value="${curStrokeColor}" style="width:24px; vertical-align:middle; cursor:pointer;" />
              <input type="number" id="dyn-ecm-stroke-width" value="${curStrokeWidth}" min="0.5" max="10" step="0.5" style="width:40px; background:var(--ts-workspace-background); color:var(--ts-workspace-foreground); border:1px solid var(--fd-border);" />
            </div>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <label style="color:var(--ts-workspace-foreground, #ccc);">Flow</label>
            <div>
              <select id="dyn-ecm-flow" style="background:var(--ts-workspace-background); color:var(--ts-workspace-foreground); border:1px solid var(--fd-border);">
                <option value="none" ${curFlow === 'none' ? 'selected' : ''}>None</option>
                <option value="pulse" ${curFlow === 'pulse' ? 'selected' : ''}>Pulse</option>
                <option value="dash" ${curFlow === 'dash' ? 'selected' : ''}>Dash</option>
              </select>
              <input type="number" id="dyn-ecm-flow-dur" value="${curFlowDur}" min="100" max="5000" step="100" style="width:50px; background:var(--ts-workspace-background); color:var(--ts-workspace-foreground); border:1px solid var(--fd-border); ${curFlow === 'none' ? 'display:none;' : ''}" />
            </div>
          </div>
        </div>
      `;

      const arrowSel = wrap.querySelector('#dyn-ecm-arrow');
      const curveSel = wrap.querySelector('#dyn-ecm-curve');
      const strokeColor = wrap.querySelector('#dyn-ecm-stroke-color');
      const strokeWidth = wrap.querySelector('#dyn-ecm-stroke-width');
      const flowSel = wrap.querySelector('#dyn-ecm-flow');
      const flowDur = wrap.querySelector('#dyn-ecm-flow-dur');

      const applyEdgeChange = () => {
        if (!fdCanvas) return;
        const text = fdCanvas.get_text();
        const esc = edgeId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
        const re = new RegExp(`(edge\\\\s+@${esc}\\\\s*\\\\{[^}]*?)\\\\}`, "s");
        const m = text.match(re);
        if (!m) return;
        let block = m[1];
        
        block = block.replace(/arrow:\\s*\\S+/, `arrow: ${arrowSel.value}`);
        if (!block.includes("arrow:")) block += `\\n  arrow: ${arrowSel.value}`;
        
        block = block.replace(/curve:\\s*\\S+/, `curve: ${curveSel.value}`);
        if (!block.includes("curve:")) block += `\\n  curve: ${curveSel.value}`;
        
        const sw = strokeWidth.value || "1";
        const sc = strokeColor.value || "#999";
        block = block.replace(/stroke:\\s*#?\\w+\\s*[\\d.]*/, `stroke: ${sc} ${sw}`);
        if (!block.includes("stroke:")) block += `\\n  stroke: ${sc} ${sw}`;
        
        if (flowSel.value !== "none") {
          const dur = flowDur.value || "800";
          const flowLine = `flow: ${flowSel.value} ${dur}ms`;
          if (block.includes("flow:")) {
            block = block.replace(/flow:\\s*\\S+\\s*\\d*m?s?/, flowLine);
          } else {
            block += `\\n  ${flowLine}`;
          }
        } else {
          block = block.replace(/\\n\\s*flow:\\s*\\S+\\s*\\d*m?s?/, "");
        }
        
        const newText = text.replace(re, block + "\\n}");
        fdCanvas.set_text(newText);
        bumpGeneration();
        render();
        syncTextToExtension();
      };

      arrowSel.addEventListener("change", applyEdgeChange);
      curveSel.addEventListener("change", applyEdgeChange);
      strokeColor.addEventListener("input", applyEdgeChange);
      strokeWidth.addEventListener("change", applyEdgeChange);
      flowSel.addEventListener("change", () => {
        flowDur.style.display = flowSel.value !== "none" ? "" : "none";
        applyEdgeChange();
      });
      flowDur.addEventListener("change", applyEdgeChange);
      
      // Prevent click propagation from form controls
      wrap.addEventListener("click", e => e.stopPropagation());
      wrap.addEventListener("pointerdown", e => e.stopPropagation());
      wrap.addEventListener("mousedown", e => e.stopPropagation());
    }
  });

  ctxMenu.open({
    items,
    x: screenX,
    y: screenY,
    onAction: (action) => doNodeAction(action, null)
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

    // Edge — matches both header form (edge @name @from -> @to) and body form (edge @name {)
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s+@(\w+)\s*->\s*@(\w+)/) ||
                      trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      const node = { id: edgeMatch[1], kind: "edge", text: "", children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      if (trimmed.includes('{')) { braceDepth += openBraces - closeBraces; stack.push({ node, depth: braceDepth }); }
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
  const isLocked = fdCanvas && fdCanvas.is_node_locked && fdCanvas.is_node_locked(node.id);
  html += `<span class="layer-name">${escapeHtml(node.id)}${textPreview}</span>`;
  html += `<span class="layer-kind">${escapeHtml(node.kind)}</span>`;
  if (isLocked) {
    html += `<span class="layer-lock" title="Locked">🔒</span>`;
  }
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
    // ⚡ Bolt Optimization: Refactored multiple O(N) array methods into a single pass
    // to prevent redundant iterations over node annotations.
    const descriptions = [];
    const statuses = [];
    const priorities = [];
    const accepts = [];
    const tags = [];

    for (const a of node.annotations) {
      if (a.type === "description") {
        descriptions.push(a);
      } else if (a.type === "status") {
        statuses.push(a);
      } else if (a.type === "priority") {
        priorities.push(a);
      } else if (a.type === "accept") {
        accepts.push(a);
      } else if (a.type === "tag") {
        tags.push(a);
      }
    }

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
    // ⚡ Bolt Optimization: Refactored multiple O(N) array methods into a single pass
    // to prevent redundant iterations over node annotations.
    let desc = undefined;
    let status = undefined;
    let priority = undefined;
    const accepts = [];
    const tags = [];

    for (const a of node.annotations) {
      if (a.type === "description" && !desc) {
        desc = a;
      } else if (a.type === "status" && !status) {
        status = a;
      } else if (a.type === "priority" && !priority) {
        priority = a;
      } else if (a.type === "accept") {
        accepts.push(a);
      } else if (a.type === "tag") {
        tags.push(a);
      }
    }

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

/** Searchable "Move Into" picker for the extension — mirrors app.js implementation. */
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

/** Determine drop zone dynamically based on container type. */
function getDropZone(e, el) {
  const rect = el.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const h = rect.height;
  const kind = el.getAttribute('data-node-kind');
  const isContainer = ['rect','ellipse','frame','group'].includes(kind);
  const edgePct = isContainer ? 0.15 : 0.5;

  if (y < h * edgePct) return 'above';
  if (y > h * (1 - edgePct)) return 'below';
  return isContainer ? 'nest' : 'below';
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

    item.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
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
        let targetParent = item.parentElement?.getAttribute?.('data-parent-id') || null;
        let activeTargetId = targetId;

        // Drag-to-root (unindent): If user drags mouse horizontally left of the item text (approx 24px)
        const rect = item.getBoundingClientRect();
        if (e.clientX - rect.left < 24 && targetParent) {
          // Find the root-level ancestor
          let currentParentId = targetParent;
          while (currentParentId) {
            const parentItem = panel.querySelector(`.layer-item[data-node-id="${currentParentId}"]`);
            if (!parentItem) break;
            activeTargetId = currentParentId;
            currentParentId = parentItem.parentElement?.getAttribute?.('data-parent-id') || null;
          }
          targetParent = null; // Detaching to root
        }

        const targetIndex = getSiblingIndex(panel, activeTargetId);
        // If we unnested, we logically drop it 'below' the entire group
        const insertIndex = (zone === 'above' && targetId === activeTargetId) ? targetIndex : targetIndex + 1;
        const dragItem = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
        const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id') || null;

        if (targetParent === dragParent) {
          // Same parent (including both being root) — pure reorder
          changed = fdCanvas.reorder_child(draggedId, insertIndex);
        } else if (targetParent) {
          // Different parent — reparent into target's parent, then reorder
          changed = fdCanvas.reparent_into(draggedId, targetParent);
          if (changed) {
            fdCanvas.reorder_child(draggedId, insertIndex);
          }
        } else {
          // Target is at root level — reparent to root, then reorder
          changed = fdCanvas.reparent_into(draggedId, 'root');
          // 'changed' might be false if already at root, but reorder still needs to happen
          fdCanvas.reorder_child(draggedId, insertIndex);
          changed = true; // We triggered a mutation
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
        // Flash the moved item to confirm the operation
        requestAnimationFrame(() => {
          const movedEl = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
          if (movedEl) {
            movedEl.classList.add('just-moved');
            movedEl.addEventListener('animationend', () => movedEl.classList.remove('just-moved'), { once: true });
          }
        });
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
            copySelectedAsFd();
            changed = fdCanvas.delete_selected();
          } else if (action === 'copy') {
            copySelectedAsFd();
            return;
          } else if (action === 'paste') {
            pasteFromClipboard().then(() => {
              bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
            });
            return;
          } else if (action === 'copy-png') {
            if (typeof copySelectionAsPng === 'function') copySelectionAsPng();
            return;
          } else if (action === 'duplicate') {
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
    panel.querySelectorAll(".layer-item").forEach(el => {
      const isSelected = selectedIds.has(el.getAttribute("data-node-id"));
      el.classList.toggle("selected", isSelected);
      if (isSelected) {
        let current = el.closest(".layer-children");
        while (current) {
          if (current.classList.contains("collapsed")) {
            current.classList.remove("collapsed");
            const parentId = current.getAttribute("data-parent-id");
            const chevron = panel.querySelector(`.layer-chevron[data-toggle-id="${parentId}"]`);
            if (chevron) chevron.classList.add("expanded");
          }
          current = current.parentElement?.closest(".layer-children");
        }
      }
    });
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

  // ── Auto-expand parents of selected items and scroll into view ──
  panel.querySelectorAll('.layer-item.selected').forEach(el => {
    let current = el.closest(".layer-children");
    while (current) {
      if (current.classList.contains("collapsed")) {
        current.classList.remove("collapsed");
        const parentId = current.getAttribute("data-parent-id");
        const chevron = panel.querySelector(`.layer-chevron[data-toggle-id="${parentId}"]`);
        if (chevron) chevron.classList.add("expanded");
      }
      current = current.parentElement?.closest(".layer-children");
    }
  });
  const sel = panel.querySelector('.layer-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

    // Enter → Rename
    if (key === 'enter') {
      e.preventDefault();
      e.stopPropagation();
      const sel = panel.querySelector('.layer-item.selected .layer-name');
      if (sel) {
        // Trigger the dblclick handler that sets up inline rename
        sel.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
      return;
    }

    // Space → Toggle Visibility
    if (key === ' ' || key === 'spacebar') {
      e.preventDefault();
      e.stopPropagation();
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      for (const id of selectedIds) {
        toggleNodeVisibility(id);
      }
      return;
    }

    // ⌘G → Group / ⌘⇧G → Ungroup
    if (meta && key === 'g') {
      e.preventDefault();
      e.stopPropagation();
      const changed = e.shiftKey ? fdCanvas.ungroup_selected() : fdCanvas.group_selected();
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

    // ⌘⇧L → Lock Selection
    if (meta && e.shiftKey && key === 'l') {
      e.preventDefault();
      e.stopPropagation();
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      let changed = false;
      for (const id of selectedIds) {
        if (fdCanvas.toggle_node_locked) {
          fdCanvas.toggle_node_locked(id);
          changed = true;
        }
      }
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

    // Up / Down arrow navigation
    if (key === 'arrowup' || key === 'arrowdown') {
      e.preventDefault();
      e.stopPropagation();
      
      const tree = parseLayerTree(fdCanvas.get_text());
      const flatIds = flattenLayerTree(tree, panel);
      if (flatIds.length === 0) return;

      const currentSelectedIds = JSON.parse(fdCanvas.get_selected_ids());
      let focusId = lastLayerSelectedId;
      if (currentSelectedIds.length > 0 && !flatIds.includes(focusId)) {
        focusId = currentSelectedIds[0];
      }

      let idx = flatIds.indexOf(focusId);
      if (idx === -1) idx = 0;

      const newIdx = key === 'arrowup' ? Math.max(0, idx - 1) : Math.min(flatIds.length - 1, idx + 1);
      const targetId = flatIds[newIdx];

      if (e.shiftKey) {
        // Extend selection
        const newSelectedIds = new Set(currentSelectedIds);
        newSelectedIds.add(targetId);
        fdCanvas.select_multiple_by_ids(JSON.stringify([...newSelectedIds]));
      } else {
        // Single selection
        fdCanvas.select_by_id(targetId);
      }

      lastLayerSelectedId = targetId;
      render();
      updatePropertiesPanel();
      updateFloatingBar();
      refreshLayersPanel();
      return;
    }
  });
}

// ─── Spec View Parser (client-side) ──────────────────────────────────────

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

  const matches = text.match(/@\w+/g);
  if (matches) {
    const seenIds = new Set();
    for (let i = 0; i < matches.length; i++) {
      const id = matches[i].slice(1);
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
  const matches = text.match(/@\w+/g);
  if (matches) {
    const seenIds = new Set();
    for (let i = 0; i < matches.length; i++) {
      const id = matches[i].slice(1);
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
  minimapCtx.clearRect(0, 0, mw * dpr, mh * dpr);
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
  fdCanvas.render(minimapCtx, performance.now(), true, true, false, false);
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

/** Paste node(s) — delegates to WASM paste_fd. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Check if system clipboard has different content (external paste)
  let clipText = fdClipboard;
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText !== fdClipboard) {
        clipText = sysText;
        fdClipboard = sysText;
      }
    }
  } catch (_) { /* permission denied — use internal */ }

  if (!clipText || !clipText.trim()) return;

  pasteOffsetCount++;
  const dx = pasteOffsetCount * 20;
  const dy = pasteOffsetCount * 20;

  // Push undo snapshot before starting an action
  const originalText = fdCanvas.get_text();
  fdCanvas.push_undo_snapshot(originalText, originalText);

  try {
    const resultJson = fdCanvas.paste_fd(clipText, dx, dy);
    const res = JSON.parse(resultJson);
    if (res.ok) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
  } catch (e) {
    console.warn("Paste failed:", e);
  }
}


/** Select all nodes in the scene. */
function selectAllNodes() {
  if (!fdCanvas) return;
  const count = fdCanvas.select_all();
  if (count > 0) {
    render();
    updatePropertiesPanel();
    if (typeof refreshLayersPanel === 'function') refreshLayersPanel();
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
  fdCanvas.render(exportCtx, performance.now(), true, true, false, false);

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

  // ⚡ Bolt Optimization: Refactored multiple O(N) array methods into a single pass
  // to prevent redundant iterations over node annotations.
  const descs = [];
  const statuses = [];
  const priorities = [];
  for (const a of node.annotations) {
    if (a.type === "description") descs.push(a);
    else if (a.type === "status") statuses.push(a);
    else if (a.type === "priority") priorities.push(a);
  }

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
  { label: 'Suggest Variants', msg: 'Suggest layout variants or styling improvements for the current design' },
  { label: 'Edit Style', msg: 'Update the global theme colors and typography' },
  { label: 'Review Design', msg: 'Review my design against Apple HIG and suggest improvements' },
];

const CHIPS_SINGLE = [
  { label: 'Suggest Variants', msg: 'Suggest styling variants for this node — better colors, corner radius, shadow' },
  { label: 'Edit Style', msg: 'Change the visual style properties of this widget' },
  { label: 'Add Hover State', msg: 'Add a subtle interactive hover animation to this node' },
];

const CHIPS_MULTI = [
  { label: 'Suggest Variants', msg: 'Suggest structural variants for these selected nodes' },
  { label: 'Align Objects', msg: 'Align and arrange these nodes in a clean, consistent layout' },
  { label: 'Review Design', msg: 'Review the layout and hierarchy of these selected nodes' },
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

export function updateContextBadge() {
  const badge = getContextBadge();
  const textEl = document.getElementById('ai-chat-context-text');
  if (!badge) return;

  const { ids } = getSelectionContext();
  if (ids.length === 0) {
    badge.classList.add('hidden');
    if (textEl) textEl.textContent = '';
  } else if (ids.length === 1) {
    badge.classList.remove('hidden');
    if (textEl) textEl.textContent = `📌 @${ids[0]}`;
  } else {
    badge.classList.remove('hidden');
    if (textEl) textEl.textContent = `📌 ${ids.length} selected`;
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
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
  // Build display message (show context if any)
  let displayMsg = text;
  // If user included a specific @id in their text, don't prepend context ids
  if (selIds.length > 0 && !text.includes('@')) {
    displayMsg = `[📌 ${selIds.map(id => '@' + id).join(', ')}] ${text}`;
  }
  const displayLine = addMessage('user', displayMsg, getEditorContent, setEditorContent);

  // Re-hide welcome chips
  const welcome = document.getElementById('ai-chat-welcome');
  if (welcome) welcome.style.display = 'none';

  // Add user message
  chatHistory.push({ role: 'user', content: text });
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

export function clearChatHistory() {
  chatHistory.length = 0;
  const messages = getChatMessages();
  if (messages) {
    messages.innerHTML = `<div class="ai-chat-welcome" id="ai-chat-welcome">
      <div class="ai-chat-welcome-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 2l2.4 7.6 7.6 2.4-7.6 2.4-2.4 7.6-2.4-7.6-7.6-2.4 7.6-2.4 2.4-7.6z"/>
          <path d="M5 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" opacity="0.6"/>
        </svg>
      </div>
      <div class="ai-chat-welcome-text">Design Agent</div>
      <div class="ai-chat-welcome-subtext">Select components, describe changes</div>
      <div class="ai-chat-chips" id="ai-chat-chips"></div>
    </div>`;
    updateChatChips();
  }
}

// ─── Setup ──────────────────────────────────────────────

function setupAiChat() {
  document.getElementById('ai-chat-btn')?.addEventListener('click', toggleChatPanel);
  document.getElementById('ai-chat-close')?.addEventListener('click', () => {
    document.getElementById('ai-chat-panel')?.classList.add('hidden');
  });
  document.getElementById('ai-chat-send')?.addEventListener('click', sendChatMessage);

  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    input.addEventListener('input', () => autoResize(input));

    // Update context badge on focus (selection may have changed)
    input.addEventListener('focus', () => {
      updateContextBadge();
      updateChatChips();
    });
  }

  const clearCtxBtn = document.getElementById('ai-chat-context-clear');
  if (clearCtxBtn) {
    clearCtxBtn.addEventListener('click', () => {
      // webview canvas selection clear
      try {
        if (typeof fdCanvas !== 'undefined' && fdCanvas.clear_selection) {
          fdCanvas.clear_selection();
        }
      } catch (_) {}
      updateContextBadge();
      updateChatChips();
    });
  }

  // Clear chat button located in the panel/tabs
  const clearChatBtn = document.getElementById('ai-chat-clear');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      clearChatHistory();
    });
  }

  // Update chips/badge on selection changes
  document.addEventListener('fd-selection-changed', () => {
    const panel = document.getElementById('ai-chat-panel');
    if (panel && !panel.classList.contains('hidden')) {
      updateContextBadge();
      updateChatChips();
    }
  });

  updateChatChips();
}

export { setupAiChat };
// AUTO-GENERATED by scripts/build-icons.mjs - Do not edit directly
window.lucideIcons = {"aarrow-down":"m14 12 4 4 4-4 M18 16V7 m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16 M3.304 13h6.392","aarrow-up":"m14 11 4-4 4 4 M18 16V7 m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16 M3.304 13h6.392","alarge-small":"m15 16 2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16 M15.697 14h5.606 m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16 M3.304 13h6.392","accessibility":"M 15,4 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 m18 19 1-7-6 1 m5 8 3-3 5.5 3-2.36 3.5 M4.24 14.5a5 5 0 0 0 6.88 6 M13.76 17.5a5 5 0 0 0-6.88-6","activity":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2","activity-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M17 12h-2l-2 5-2-10-2 5H7","air-vent":"M18 17.5a2.5 2.5 0 1 1-4 2.03V12 M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 8h12 M6.6 15.572A2 2 0 1 0 10 17v-5","airplay":"M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1 m12 15 5 6H7Z","alarm-check":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21 m9 13 2 2 4-4","alarm-clock":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M12 9v4l2 2 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21","alarm-clock-check":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21 m9 13 2 2 4-4","alarm-clock-minus":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21 M9 13h6","alarm-clock-off":"M6.87 6.87a8 8 0 1 0 11.26 11.26 M19.9 14.25a8 8 0 0 0-9.15-9.15 m22 6-3-3 M6.26 18.67 4 21 m2 2 20 20 M4 4 2 6","alarm-clock-plus":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21 M12 10v6 M9 13h6","alarm-minus":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21 M9 13h6","alarm-plus":"M 4,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M5 3 2 6 m22 6-3-3 M6.38 18.7 4 21 M17.64 18.67 20 21 M12 10v6 M9 13h6","alarm-smoke":"M11 21c0-2.5 2-2.5 2-5 M16 21c0-2.5 2-2.5 2-5 m19 8-.8 3a1.25 1.25 0 0 1-1.2 1H7a1.25 1.25 0 0 1-1.2-1L5 8 M21 3a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z M6 21c0-2.5 2-2.5 2-5","album":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 11 3 11 11 14 8 17 11 17 3,undefined","alert-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 12,8 L 12,12 M 12,16 L 12.01,16","alert-octagon":"M12 16h.01 M12 8v4 M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z","alert-triangle":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01","align-center":"M21 5H3 M17 12H7 M19 19H5","align-center-horizontal":"M2 12h20 M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4 M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4 M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1 M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1","align-center-vertical":"M12 2v20 M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4 M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4 M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1 M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1","align-end-horizontal":"M 6,2 h 2 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M 16,9 h 2 a 2,2 0 0,1 2,2 v 5 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -5 a 2,2 0 0,1 2,-2 Z M22 22H2","align-end-vertical":"M 4,4 h 12 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 11,14 h 5 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -5 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M22 22V2","align-horizontal-distribute-center":"M 6,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 16,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M17 22v-5 M17 7V2 M7 22v-3 M7 5V2","align-horizontal-distribute-end":"M 6,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 16,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M10 2v20 M20 2v20","align-horizontal-distribute-start":"M 6,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 16,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M4 2v20 M14 2v20","align-horizontal-justify-center":"M 4,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 18,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M12 2v20","align-horizontal-justify-end":"M 4,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 14,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M22 2v20","align-horizontal-justify-start":"M 8,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 18,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M2 2v20","align-horizontal-space-around":"M 11,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M4 22V2 M20 22V2","align-horizontal-space-between":"M 5,5 h 2 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 17,7 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z M3 2v20 M21 2v20","align-justify":"M3 5h18 M3 12h18 M3 19h18","align-left":"M21 5H3 M15 12H3 M17 19H3","align-right":"M21 5H3 M21 12H9 M21 19H7","align-start-horizontal":"M 6,6 h 2 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M 16,6 h 2 a 2,2 0 0,1 2,2 v 5 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -5 a 2,2 0 0,1 2,-2 Z M22 2H2","align-start-vertical":"M 8,14 h 5 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -5 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 8,4 h 12 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 2v20","align-vertical-distribute-center":"M22 17h-3 M22 7h-5 M5 17H2 M7 7H2 M 7,14 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,4 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z","align-vertical-distribute-end":"M 7,14 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,4 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 20h20 M2 10h20","align-vertical-distribute-start":"M 7,14 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,4 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 14h20 M2 4h20","align-vertical-justify-center":"M 7,16 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,2 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 12h20","align-vertical-justify-end":"M 7,12 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,2 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 22h20","align-vertical-justify-start":"M 7,16 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,6 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 2h20","align-vertical-space-around":"M 9,9 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M22 20H2 M22 4H2","align-vertical-space-between":"M 7,15 h 10 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 9,3 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M2 21h20 M2 3h20","ambulance":"M10 10H6 M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2 M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14 M8 8v4 M9 18h6 M 15,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 5,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","ampersand":"M16 12h3 M17.5 12a8 8 0 0 1-8 8A4.5 4.5 0 0 1 5 15.5c0-6 8-4 8-8.5a3 3 0 1 0-6 0c0 3 2.5 8.5 12 13","ampersands":"M10 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6 0 1.7 1.3 3 3 3 2.8 0 5-2.2 5-5 M22 17c-5-3-7-7-7-9a2 2 0 0 1 4 0c0 2.5-5 2.5-5 6 0 1.7 1.3 3 3 3 2.8 0 5-2.2 5-5","amphora":"M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8 M10 5H8a2 2 0 0 0 0 4h.68 M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8 M14 5h2a2 2 0 0 1 0 4h-.68 M18 22H6 M9 2h6","anchor":"M12 6v16 m19 13 2-1a9 9 0 0 1-18 0l2 1 M9 11h6 M 10,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","angry":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M16 16s-1.5-2-4-2-4 2-4 2 M7.5 8 10 9 m14 9 2.5-1 M9 10h.01 M15 10h.01","annoyed":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M8 15h8 M8 9h2 M14 9h2","antenna":"M2 12 7 2 m7 12 5-10 m12 12 5-10 m17 12 5-10 M4.5 7h15 M12 16v6","anvil":"M7 10H6a4 4 0 0 1-4-4 1 1 0 0 1 1-1h4 M7 5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a1 1 0 0 1-1-1z M9 12v5 M15 12v5 M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3 1 1 0 0 1-1 1H6a1 1 0 0 1-1-1","aperture":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m14.31 8 5.74 9.94 M9.69 8h11.48 m7.38 12 5.74-9.94 M9.69 16 3.95 6.06 M14.31 16H2.83 m16.62 12-5.74 9.94","app-window":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M10 4v4 M2 8h20 M6 4v4","app-window-mac":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M6 8h.01 M10 8h.01 M14 8h.01","apple":"M12 6.528V3a1 1 0 0 1 1-1h0 M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21","archive":"M 3,3 h 18 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -18 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8 M10 12h4","archive-restore":"M 3,3 h 18 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -18 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M4 8v11a2 2 0 0 0 2 2h2 M20 8v11a2 2 0 0 1-2 2h-2 m9 15 3-3 3 3 M12 12v9","archive-x":"M 3,3 h 18 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -18 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8 m9.5 17 5-5 m9.5 12 5 5","area-chart":"M3 3v16a2 2 0 0 0 2 2h16 M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z","armchair":"M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3 M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z M5 18v2 M19 18v2","arrow-big-down":"M9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-7.086 7.086a1 1 0 0 1-1.414 0l-7.086-7.086a.707.707 0 0 1 .5-1.207H8a1 1 0 0 0 1-1z","arrow-big-down-dash":"M14 8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h3.293a.707.707 0 0 1 .5 1.207l-6.939 6.939a1.207 1.207 0 0 1-1.708 0l-6.94-6.94a.707.707 0 0 1 .5-1.206H8a1 1 0 0 0 1-1V9a1 1 0 0 1 1-1z M9 4h6","arrow-big-left":"M10.793 19.793a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-6a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707z","arrow-big-left-dash":"M13 9a1 1 0 0 1-1-1V4.707a.707.707 0 0 0-1.207-.5l-6.94 6.94a1.207 1.207 0 0 0 0 1.707l6.94 6.94a.707.707 0 0 0 1.207-.5V16a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z M20 9v6","arrow-big-right":"M13.207 19.793a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h6a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707z","arrow-big-right-dash":"M11 9a1 1 0 0 0 1-1V4.707a.707.707 0 0 1 1.207-.5l6.94 6.94a1.207 1.207 0 0 1 0 1.707l-6.94 6.94a.707.707 0 0 1-1.207-.5V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z M4 9v6","arrow-big-up":"M9 19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-7.086-7.086a1 1 0 0 0-1.414 0l-7.086 7.086a.707.707 0 0 0 .5 1.207H8a1 1 0 0 1 1 1z","arrow-big-up-dash":"M14 16a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1h3.293a.707.707 0 0 0 .5-1.207l-6.939-6.939a1.207 1.207 0 0 0-1.708 0l-6.94 6.94a.707.707 0 0 0 .5 1.206H8a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1z M9 20h6","arrow-down":"M12 5v14 m19 12-7 7-7-7","arrow-down01":"m3 16 4 4 4-4 M7 20V4 M 15,4 h 4 v 6 h -4 Z M17 20v-6h-2 M15 20h4","arrow-down10":"m3 16 4 4 4-4 M7 20V4 M17 10V4h-2 M15 10h4 M 15,14 h 4 v 6 h -4 Z","arrow-down-az":"m3 16 4 4 4-4 M7 20V4 M20 8h-5 M15 10V6.5a2.5 2.5 0 0 1 5 0V10 M15 14h5l-5 6h5","arrow-down-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 8v8 m8 12 4 4 4-4","arrow-down-from-line":"M19 3H5 M12 21V7 m6 15 6 6 6-6","arrow-down-left":"M17 7 7 17 M17 17H7V7","arrow-down-left-from-circle":"M2 12a10 10 0 1 1 10 10 m2 22 10-10 M8 22H2v-6","arrow-down-left-from-square":"M13 21h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6 m3 21 9-9 M9 21H3v-6","arrow-down-left-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m16 8-8 8 M16 16H8V8","arrow-down-narrow-wide":"m3 16 4 4 4-4 M7 20V4 M11 4h4 M11 8h7 M11 12h10","arrow-down-right":"m7 7 10 10 M17 7v10H7","arrow-down-right-from-circle":"M12 22a10 10 0 1 1 10-10 M22 22 12 12 M22 16v6h-6","arrow-down-right-from-square":"M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6 m21 21-9-9 M21 15v6h-6","arrow-down-right-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m8 8 8 8 M16 8v8H8","arrow-down-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 8v8 m8 12 4 4 4-4","arrow-down-to-dot":"M12 2v14 m19 9-7 7-7-7 M 11,21 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","arrow-down-to-line":"M12 17V3 m6 11 6 6 6-6 M19 21H5","arrow-down-up":"m3 16 4 4 4-4 M7 20V4 m21 8-4-4-4 4 M17 4v16","arrow-down-wide-narrow":"m3 16 4 4 4-4 M7 20V4 M11 4h10 M11 8h7 M11 12h4","arrow-down-za":"m3 16 4 4 4-4 M7 4v16 M15 4h5l-5 6h5 M15 20v-3.5a2.5 2.5 0 0 1 5 0V20 M20 18h-5","arrow-left":"m12 19-7-7 7-7 M19 12H5","arrow-left-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m12 8-4 4 4 4 M16 12H8","arrow-left-from-line":"m9 6-6 6 6 6 M3 12h14 M21 19V5","arrow-left-right":"M8 3 4 7l4 4 M4 7h16 m16 21 4-4-4-4 M20 17H4","arrow-left-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m12 8-4 4 4 4 M16 12H8","arrow-left-to-line":"M3 19V5 m13 6-6 6 6 6 M7 12h14","arrow-right":"M5 12h14 m12 5 7 7-7 7","arrow-right-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m12 16 4-4-4-4 M8 12h8","arrow-right-from-line":"M3 5v14 M21 12H7 m15 18 6-6-6-6","arrow-right-left":"m16 3 4 4-4 4 M20 7H4 m8 21-4-4 4-4 M4 17h16","arrow-right-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 12h8 m12 16 4-4-4-4","arrow-right-to-line":"M17 12H3 m11 18 6-6-6-6 M21 5v14","arrow-up":"m5 12 7-7 7 7 M12 19V5","arrow-up01":"m3 8 4-4 4 4 M7 4v16 M 15,4 h 4 v 6 h -4 Z M17 20v-6h-2 M15 20h4","arrow-up10":"m3 8 4-4 4 4 M7 4v16 M17 10V4h-2 M15 10h4 M 15,14 h 4 v 6 h -4 Z","arrow-up-az":"m3 8 4-4 4 4 M7 4v16 M20 8h-5 M15 10V6.5a2.5 2.5 0 0 1 5 0V10 M15 14h5l-5 6h5","arrow-up-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m16 12-4-4-4 4 M12 16V8","arrow-up-down":"m21 16-4 4-4-4 M17 20V4 m3 8 4-4 4 4 M7 4v16","arrow-up-from-dot":"m5 9 7-7 7 7 M12 16V2 M 11,21 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","arrow-up-from-line":"m18 9-6-6-6 6 M12 3v14 M5 21h14","arrow-up-left":"M7 17V7h10 M17 17 7 7","arrow-up-left-from-circle":"M2 8V2h6 m2 2 10 10 M12 2A10 10 0 1 1 2 12","arrow-up-left-from-square":"M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6 m3 3 9 9 M3 9V3h6","arrow-up-left-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 16V8h8 M16 16 8 8","arrow-up-narrow-wide":"m3 8 4-4 4 4 M7 4v16 M11 12h4 M11 16h7 M11 20h10","arrow-up-right":"M7 7h10v10 M7 17 17 7","arrow-up-right-from-circle":"M22 12A10 10 0 1 1 12 2 M22 2 12 12 M16 2h6v6","arrow-up-right-from-square":"M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6 m21 3-9 9 M15 3h6v6","arrow-up-right-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 8h8v8 m8 16 8-8","arrow-up-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m16 12-4-4-4 4 M12 16V8","arrow-up-to-line":"M5 3h14 m18 13-6-6-6 6 M12 7v14","arrow-up-wide-narrow":"m3 8 4-4 4 4 M7 4v16 M11 12h10 M11 16h7 M11 20h4","arrow-up-za":"m3 8 4-4 4 4 M7 4v16 M15 4h5l-5 6h5 M15 20v-3.5a2.5 2.5 0 0 1 5 0V20 M20 18h-5","arrows-up-from-line":"m4 6 3-3 3 3 M7 17V3 m14 6 3-3 3 3 M17 17V3 M4 21h16","asterisk":"M12 6v12 M17.196 9 6.804 15 m6.804 9 10.392 6","asterisk-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 8v8 m8.5 14 7-4 m8.5 10 7 4","at-sign":"M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8","atom":"M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z","audio-lines":"M2 10v3 M6 6v11 M10 3v18 M14 8v7 M18 5v13 M22 10v3","audio-waveform":"M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2","award":"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526 M 6,8 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","axe":"m14 12-8.381 8.38a1 1 0 0 1-3.001-3L11 9 M15 15.5a.5.5 0 0 0 .5.5A6.5 6.5 0 0 0 22 9.5a.5.5 0 0 0-.5-.5h-1.672a2 2 0 0 1-1.414-.586l-5.062-5.062a1.205 1.205 0 0 0-1.704 0L9.352 5.648a1.205 1.205 0 0 0 0 1.704l5.062 5.062A2 2 0 0 1 15 13.828z","axis3-d":"M13.5 10.5 15 9 M4 4v15a1 1 0 0 0 1 1h15 M4.293 19.707 6 18 m9 15 1.5-1.5","axis3d":"M13.5 10.5 15 9 M4 4v15a1 1 0 0 0 1 1h15 M4.293 19.707 6 18 m9 15 1.5-1.5","baby":"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5 M15 12h.01 M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1 M9 12h.01","backpack":"M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M8 10h8 M8 18h8 M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6 M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2","badge":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z","badge-alert":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M 12,8 L 12,12 M 12,16 L 12.01,16","badge-cent":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M12 7v10 M15.4 10a4 4 0 1 0 0 4","badge-check":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z m9 12 2 2 4-4","badge-dollar-sign":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8 M12 18V6","badge-euro":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M7 12h5 M15 9.4a4 4 0 1 0 0 5.2","badge-help":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M 12,17 L 12.01,17","badge-indian-rupee":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M8 8h8 M8 12h8 m13 17-5-1h1a4 4 0 0 0 0-8","badge-info":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M 12,16 L 12,12 M 12,8 L 12.01,8","badge-japanese-yen":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z m9 8 3 3v7 m12 11 3-3 M9 12h6 M9 16h6","badge-minus":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M 8,12 L 16,12","badge-percent":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z m15 9-6 6 M9 9h.01 M15 15h.01","badge-plus":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M 12,8 L 12,16 M 8,12 L 16,12","badge-pound-sterling":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M8 12h4 M10 16V9.5a2.5 2.5 0 0 1 5 0 M8 16h7","badge-question-mark":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M 12,17 L 12.01,17","badge-russian-ruble":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M9 16h5 M9 12h5a2 2 0 1 0 0-4h-3v9","badge-swiss-franc":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M11 17V8h4 M11 12h3 M9 16h4","badge-turkish-lira":"M11 7v10a5 5 0 0 0 5-5 m15 8-6 3 M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76","badge-x":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M 15,9 L 9,15 M 9,9 L 15,15","baggage-claim":"M22 18H6a2 2 0 0 1-2-2V7a2 2 0 0 0-2-2 M17 14V4a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v10 M 9,6 h 11 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z M 16,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 7,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","balloon":"M12 16v1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v1 M12 6a2 2 0 0 1 2 2 M18 8c0 4-3.5 8-6 8s-6-4-6-8a6 6 0 0 1 12 0","ban":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M4.929 4.929 19.07 19.071","banana":"M4 13c3.5-2 8-2 10 2a5.5 5.5 0 0 1 8 5 M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z","bandage":"M10 10.01h.01 M10 14.01h.01 M14 10.01h.01 M14 14.01h.01 M18 6v12 M6 6v12 M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","banknote":"M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M6 12h.01M18 12h.01","banknote-arrow-down":"M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5 m16 19 3 3 3-3 M18 12h.01 M19 16v6 M6 12h.01 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","banknote-arrow-up":"M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5 M18 12h.01 M19 22v-6 m22 19-3-3-3 3 M6 12h.01 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","banknote-x":"M13 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5 m17 17 5 5 M18 12h.01 m22 17-5 5 M6 12h.01 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","bar-chart":"M5 21v-6 M12 21V9 M19 21V3","bar-chart2":"M5 21v-6 M12 21V3 M19 21V9","bar-chart3":"M3 3v16a2 2 0 0 0 2 2h16 M18 17V9 M13 17V5 M8 17v-3","bar-chart4":"M13 17V9 M18 17V5 M3 3v16a2 2 0 0 0 2 2h16 M8 17v-3","bar-chart-big":"M3 3v16a2 2 0 0 0 2 2h16 M 16,5 h 2 a 1,1 0 0,1 1,1 v 10 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -10 a 1,1 0 0,1 1,-1 Z M 8,8 h 2 a 1,1 0 0,1 1,1 v 7 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -7 a 1,1 0 0,1 1,-1 Z","bar-chart-horizontal":"M3 3v16a2 2 0 0 0 2 2h16 M7 16h8 M7 11h12 M7 6h3","bar-chart-horizontal-big":"M3 3v16a2 2 0 0 0 2 2h16 M 8,13 h 7 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -7 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M 8,5 h 10 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -10 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","barcode":"M3 5v14 M8 5v14 M12 5v14 M17 5v14 M21 5v14","barrel":"M10 3a41 41 0 0 0 0 18 M14 3a41 41 0 0 1 0 18 M17 3a2 2 0 0 1 1.68.92 15.25 15.25 0 0 1 0 16.16A2 2 0 0 1 17 21H7a2 2 0 0 1-1.68-.92 15.25 15.25 0 0 1 0-16.16A2 2 0 0 1 7 3z M3.84 17h16.32 M3.84 7h16.32","baseline":"M4 20h16 m6 16 6-12 6 12 M8 12h8","bath":"M10 4 8 6 M17 19v2 M2 12h20 M7 19v2 M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5","battery":"M 22 14 L 22 10 M 4,6 h 12 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","battery-charging":"m11 7-3 5h4l-3 5 M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935 M22 14v-4 M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936","battery-full":"M10 10v4 M14 10v4 M22 14v-4 M6 10v4 M 4,6 h 12 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","battery-low":"M22 14v-4 M6 14v-4 M 4,6 h 12 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","battery-medium":"M10 14v-4 M22 14v-4 M6 14v-4 M 4,6 h 12 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","battery-plus":"M10 9v6 M12.543 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.605 M22 14v-4 M7 12h6 M7.606 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.606","battery-warning":"M10 17h.01 M10 7v6 M14 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2 M22 14v-4 M6 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2","beaker":"M4.5 3h15 M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3 M6 14h12","bean":"M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z M5.341 10.62a4 4 0 1 0 5.279-5.28","bean-off":"M9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22a13.96 13.96 0 0 0 9.9-4.1 M10.75 5.093A6 6 0 0 1 22 8c0 2.411-.61 4.68-1.683 6.66 M5.341 10.62a4 4 0 0 0 6.487 1.208M10.62 5.341a4.015 4.015 0 0 1 2.039 2.04 M 2,2 L 22,22","bed":"M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9","bed-double":"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8 M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4 M12 4v6 M2 18h20","bed-single":"M3 20v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8 M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4 M3 18h18","beef":"M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3 m18.5 6 2.19 4.5a6.48 6.48 0 0 1-2.29 7.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5 M 10,8.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0","beef-off":"M11.771 6.109a2.5 2.5 0 0 1 3.12 3.12 M17.852 12.185a6.5 6.5 0 0 0-9.035-9.04 M18.013 18.013C15.029 20.349 10.831 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5 m18.5 6 2.19 4.5a6.48 6.48 0 0 1-.139 4.393 m2 2 20 20 M6.355 6.37a7 7 0 0 0-.075.23c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c3.356 0 6.993-1.267 9.85-3.151","beer":"M17 11h1a3 3 0 0 1 0 6h-1 M9 12v6 M13 12v6 M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8","beer-off":"M13 13v5 M17 11.47V8 M17 11h1a3 3 0 0 1 2.745 4.211 m2 2 20 20 M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3 M7.536 7.535C6.766 7.649 6.154 8 5.5 8a2.5 2.5 0 0 1-1.768-4.268 M8.727 3.204C9.306 2.767 9.885 2 11 2c1.56 0 2 1.5 3 1.5s1.72-.5 2.5-.5a1 1 0 1 1 0 5c-.78 0-1.5-.5-2.5-.5a3.149 3.149 0 0 0-.842.12 M9 14.6V18","bell":"M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326","bell-dot":"M10.268 21a2 2 0 0 0 3.464 0 M11.68 2.009A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673c-.824-.85-1.678-1.731-2.21-3.348 M 15,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","bell-electric":"M18.518 17.347A7 7 0 0 1 14 19 M18.8 4A11 11 0 0 1 20 9 M9 9h.01 M 18,16 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 2,9 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0 M 6,16 h 6 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z","bell-minus":"M10.268 21a2 2 0 0 0 3.464 0 M15 8h6 M16.243 3.757A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673A9.4 9.4 0 0 1 18.667 12","bell-off":"M10.268 21a2 2 0 0 0 3.464 0 M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742 m2 2 20 20 M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05","bell-plus":"M10.268 21a2 2 0 0 0 3.464 0 M15 8h6 M18 5v6 M20.002 14.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332","bell-ring":"M10.268 21a2 2 0 0 0 3.464 0 M22 8c0-2.3-.8-4.3-2-6 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326 M4 2C2.8 3.7 2 5.7 2 8","between-horizonal-end":"M 4,3 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z m22 15-3-3 3-3 M 4,14 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","between-horizonal-start":"M 9,3 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z m2 9 3 3-3 3 M 9,14 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","between-horizontal-end":"M 4,3 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z m22 15-3-3 3-3 M 4,14 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","between-horizontal-start":"M 9,3 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z m2 9 3 3-3 3 M 9,14 h 11 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -11 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","between-vertical-end":"M 4,3 h 5 a 1,1 0 0,1 1,1 v 11 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -11 a 1,1 0 0,1 1,-1 Z m9 22 3-3 3 3 M 15,3 h 5 a 1,1 0 0,1 1,1 v 11 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -11 a 1,1 0 0,1 1,-1 Z","between-vertical-start":"M 4,8 h 5 a 1,1 0 0,1 1,1 v 11 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -11 a 1,1 0 0,1 1,-1 Z m15 2-3 3-3-3 M 15,8 h 5 a 1,1 0 0,1 1,1 v 11 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -11 a 1,1 0 0,1 1,-1 Z","biceps-flexed":"M12.409 13.017A5 5 0 0 1 22 15c0 3.866-4 7-9 7-4.077 0-8.153-.82-10.371-2.462-.426-.316-.631-.832-.62-1.362C2.118 12.723 2.627 2 10 2a3 3 0 0 1 3 3 2 2 0 0 1-2 2c-1.105 0-1.64-.444-2-1 M15 14a5 5 0 0 0-7.584 2 M9.964 6.825C8.019 7.977 9.5 13 8 15","bike":"M 15,17.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0 M 2,17.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0 M 14,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M12 17.5V14l-3-3 4-3 2 3h2","binary":"M 16,14 h 0 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h 0 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 8,4 h 0 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h 0 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M6 20h4 M14 10h4 M6 14h2v6 M14 4h2v6","binoculars":"M10 10h4 M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3 M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z M 22 16 L 2 16 M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3","biohazard":"M 10,11.9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M6.7 3.4c-.9 2.5 0 5.2 2.2 6.7C6.5 9 3.7 9.6 2 11.6 m8.9 10.1 1.4.8 M17.3 3.4c.9 2.5 0 5.2-2.2 6.7 2.4-1.2 5.2-.6 6.9 1.5 m15.1 10.1-1.4.8 M16.7 20.8c-2.6-.4-4.6-2.6-4.7-5.3-.2 2.6-2.1 4.8-4.7 5.2 M12 13.9v1.6 M13.5 5.4c-1-.2-2-.2-3 0 M17 16.4c.7-.7 1.2-1.6 1.5-2.5 M5.5 13.9c.3.9.8 1.8 1.5 2.5","bird":"M16 7h.01 M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20 m20 7 2 .5-2 .5 M10 18v3 M14 17.75V21 M7 18a6 6 0 0 0 3.84-10.61","birdhouse":"M12 18v4 m17 18 1.956-11.468 m3 8 7.82-5.615a2 2 0 0 1 2.36 0L21 8 M4 18h16 M7 18 5.044 6.532 M 10,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","bitcoin":"M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727","blend":"M 2,9 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0 M 8,15 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0","blinds":"M3 3h18 M20 7H8 M20 11H8 M10 19h10 M8 15h12 M4 3v14 M 2,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","blocks":"M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2 M 15,2 h 6 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","bluetooth":"m7 7 10 10-5 5V2l5 5L7 17","bluetooth-connected":"m7 7 10 10-5 5V2l5 5L7 17 M 18,12 L 21,12 M 3,12 L 6,12","bluetooth-off":"m17 17-5 5V12l-5 5 m2 2 20 20 M14.5 9.5 17 7l-5-5v4.5","bluetooth-searching":"m7 7 10 10-5 5V2l5 5L7 17 M20.83 14.83a4 4 0 0 0 0-5.66 M18 12h.01","bold":"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8","bolt":"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","bomb":"M 2,13 a 9,9 0 1,0 18,0 a 9,9 0 1,0 -18,0 M14.35 4.65 16.3 2.7a2.41 2.41 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4l-1.95 1.95 m22 2-1.5 1.5","bone":"M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z","book":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20","book-a":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 m8 13 4-7 4 7 M9.1 11h5.7","book-alert":"M12 13h.01 M12 6v3 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20","book-audio":"M12 6v7 M16 8v3 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M8 8v3","book-check":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 m9 9.5 2 2 4-4","book-copy":"M5 7a2 2 0 0 0-2 2v11 M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21 M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10","book-dashed":"M12 17h1.5 M12 22h1.5 M12 2h1.5 M17.5 22H19a1 1 0 0 0 1-1 M17.5 2H19a1 1 0 0 1 1 1v1.5 M20 14v3h-2.5 M20 8.5V10 M4 10V8.5 M4 19.5V14 M4 4.5A2.5 2.5 0 0 1 6.5 2H8 M8 22H6.5a1 1 0 0 1 0-5H8","book-down":"M12 13V7 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 m9 10 3 3 3-3","book-headphones":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M8 12v-2a4 4 0 0 1 8 0v2 M 14,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 8,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","book-heart":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M8.62 9.8A2.25 2.25 0 1 1 12 6.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z","book-image":"m20 13.7-2.1-2.1a2 2 0 0 0-2.8 0L9.7 17 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M 8,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","book-key":"M13 2H6.5A2.5 2.5 0 0 0 4 4.5v15 M17 2v6 M17 4h2 M20 15.2V21a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M 15,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","book-lock":"M18 6V4a2 2 0 1 0-4 0v2 M20 15v6a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H10 M 13,6 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","book-marked":"M10 2v8l3-3 3 3V2 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20","book-minus":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M9 10h6","book-open":"M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z","book-open-check":"M12 21V7 m16 12 2 2 4-4 M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3","book-open-text":"M12 7v14 M16 12h2 M16 8h2 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z M6 12h2 M6 8h2","book-plus":"M12 7v6 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M9 10h6","book-search":"M11 22H5.5a1 1 0 0 1 0-5h4.501 m21 22-1.879-1.878 M3 19.5v-15A2.5 2.5 0 0 1 5.5 2H18a1 1 0 0 1 1 1v8 M 14,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","book-template":"M12 17h1.5 M12 22h1.5 M12 2h1.5 M17.5 22H19a1 1 0 0 0 1-1 M17.5 2H19a1 1 0 0 1 1 1v1.5 M20 14v3h-2.5 M20 8.5V10 M4 10V8.5 M4 19.5V14 M4 4.5A2.5 2.5 0 0 1 6.5 2H8 M8 22H6.5a1 1 0 0 1 0-5H8","book-text":"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M8 11h8 M8 7h6","book-type":"M10 13h4 M12 6v7 M16 8V6H8v2 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20","book-up":"M12 13V7 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 m9 10 3-3 3 3","book-up2":"M12 13V7 M18 2h1a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2 m9 10 3-3 3 3 m9 5 3-3 3 3","book-user":"M15 13a3 3 0 1 0-6 0 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 M 10,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","book-x":"m14.5 7-5 5 M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20 m9.5 7 5 5","bookmark":"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z","bookmark-check":"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z m9 10 2 2 4-4","bookmark-minus":"M15 10H9 M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z","bookmark-plus":"M12 7v6 M15 10H9 M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z","bookmark-x":"m14.5 7.5-5 5 M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z m9.5 7.5 5 5","boom-box":"M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4 M8 8v1 M12 8v1 M16 8v1 M 4,9 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M 6,15 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 14,15 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","bot":"M12 8V4H8 M 6,8 h 12 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M2 14h2 M20 14h2 M15 13v2 M9 13v2","bot-message-square":"M12 6V2H8 M15 11v2 M2 12h2 M20 12h2 M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z M9 11v2","bot-off":"M13.67 8H18a2 2 0 0 1 2 2v4.33 M2 14h2 M20 14h2 M22 22 2 2 M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586 M9 13v2 M9.67 4H12v2.33","bottle-wine":"M10 3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a6 6 0 0 0 1.2 3.6l.6.8A6 6 0 0 1 17 13v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8a6 6 0 0 1 1.2-3.6l.6-.8A6 6 0 0 0 10 5z M17 13h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h4","bow-arrow":"M17 3h4v4 M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17 M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05 M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z M9.707 14.293 21 3","box":"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z m3.3 7 8.7 5 8.7-5 M12 22V12","box-select":"M5 3a2 2 0 0 0-2 2 M19 3a2 2 0 0 1 2 2 M21 19a2 2 0 0 1-2 2 M5 21a2 2 0 0 1-2-2 M9 3h1 M9 21h1 M14 3h1 M14 21h1 M3 9v1 M21 9v1 M3 14v1 M21 14v1","boxes":"M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z m7 16.5-4.74-2.85 m7 16.5 5-3 M7 16.5v5.17 M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z m17 16.5-5-3 m17 16.5 4.74-2.85 M17 16.5v5.17 M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z M12 8 7.26 5.15 m12 8 4.74-2.85 M12 13.5V8","braces":"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1 M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1","brackets":"M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3 M8 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h3","brain":"M12 18V5 M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4 M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5 M17.997 5.125a4 4 0 0 1 2.526 5.77 M18 18a4 4 0 0 0 2-7.464 M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517 M6 18a4 4 0 0 1-2-7.464 M6.003 5.125a4 4 0 0 0-2.526 5.77","brain-circuit":"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z M9 13a4.5 4.5 0 0 0 3-4 M6.003 5.125A3 3 0 0 0 6.401 6.5 M3.477 10.896a4 4 0 0 1 .585-.396 M6 18a4 4 0 0 1-1.967-.516 M12 13h4 M12 18h6a2 2 0 0 1 2 2v1 M12 8h8 M16 8V5a2 2 0 0 1 2-2 M 15.5,13 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 17.5,3 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 19.5,21 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 19.5,8 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0","brain-cog":"m10.852 14.772-.383.923 m10.852 9.228-.383-.923 m13.148 14.772.382.924 m13.531 8.305-.383.923 m14.772 10.852.923-.383 m14.772 13.148.923.383 M17.598 6.5A3 3 0 1 0 12 5a3 3 0 0 0-5.63-1.446 3 3 0 0 0-.368 1.571 4 4 0 0 0-2.525 5.771 M17.998 5.125a4 4 0 0 1 2.525 5.771 M19.505 10.294a4 4 0 0 1-1.5 7.706 M4.032 17.483A4 4 0 0 0 11.464 20c.18-.311.892-.311 1.072 0a4 4 0 0 0 7.432-2.516 M4.5 10.291A4 4 0 0 0 6 18 M6.002 5.125a3 3 0 0 0 .4 1.375 m9.228 10.852-.923-.383 m9.228 13.148-.923.383 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","brick-wall":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 9v6 M16 15v6 M16 3v6 M3 15h18 M3 9h18 M8 15v6 M8 3v6","brick-wall-fire":"M16 3v2.107 M17 9c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 22 17a5 5 0 0 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C13 11.5 16 9 17 9 M21 8.274V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.938 M3 15h5.253 M3 9h8.228 M8 15v6 M8 3v6","brick-wall-shield":"M12 9v1.258 M16 3v5.46 M21 9.118V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5.75 M22 17.5c0 2.499-1.75 3.749-3.83 4.474a.5.5 0 0 1-.335-.005c-2.085-.72-3.835-1.97-3.835-4.47V14a.5.5 0 0 1 .5-.499c1 0 2.25-.6 3.12-1.36a.6.6 0 0 1 .76-.001c.875.765 2.12 1.36 3.12 1.36a.5.5 0 0 1 .5.5z M3 15h7 M3 9h12.142 M8 15v6 M8 3v6","briefcase":"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16 M 4,6 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","briefcase-business":"M12 12h.01 M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2 M22 13a18.15 18.15 0 0 1-20 0 M 4,6 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","briefcase-conveyor-belt":"M10 20v2 M14 20v2 M18 20v2 M21 20H3 M6 20v2 M8 16V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12 M 6,6 h 12 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z","briefcase-medical":"M12 11v4 M14 13h-4 M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2 M18 6v14 M6 6v14 M 4,6 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","bring-to-front":"M 10,8 h 4 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -4 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2 M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2","brush":"m11 10 3 3 M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031","brush-cleaning":"m16 22-1-4 M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1 M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z m8 22 1-4","bubbles":"M7.001 15.085A1.5 1.5 0 0 1 9 16.5 M 15,8.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0 M 2,16.5 a 5.5,5.5 0 1,0 11,0 a 5.5,5.5 0 1,0 -11,0 M 5,4.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0","bug":"M12 20v-9 M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z M14.12 3.88 16 2 M21 21a4 4 0 0 0-3.81-4 M21 5a4 4 0 0 1-3.55 3.97 M22 13h-4 M3 21a4 4 0 0 1 3.81-4 M3 5a4 4 0 0 0 3.55 3.97 M6 13H2 m8 2 1.88 1.88 M9 7.13V6a3 3 0 1 1 6 0v1.13","bug-off":"M12 20v-8 M12.656 7H14a4 4 0 0 1 4 4v1.344 M14.12 3.88 16 2 M17.123 17.123A6 6 0 0 1 6 14v-3a4 4 0 0 1 1.72-3.287 m2 2 20 20 M21 5a4 4 0 0 1-3.55 3.97 M22 13h-3.344 M3 21a4 4 0 0 1 3.81-4 M3 5a4 4 0 0 0 3.55 3.97 M6 13H2 m8 2 1.88 1.88 M9.712 4.06A3 3 0 0 1 15 6v1.13","bug-play":"M10 19.655A6 6 0 0 1 6 14v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 3.97 M14 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z M14.12 3.88 16 2 M21 5a4 4 0 0 1-3.55 3.97 M3 21a4 4 0 0 1 3.81-4 M3 5a4 4 0 0 0 3.55 3.97 M6 13H2 m8 2 1.88 1.88 M9 7.13V6a3 3 0 1 1 6 0v1.13","building":"M12 10h.01 M12 14h.01 M12 6h.01 M16 10h.01 M16 14h.01 M16 6h.01 M8 10h.01 M8 14h.01 M8 6h.01 M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3 M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z","building2":"M10 12h4 M10 8h4 M14 21v-3a2 2 0 0 0-4 0v3 M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2 M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16","bus":"M8 6v6 M15 6v6 M2 12h19.6 M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3 M 5,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M9 18h5 M 14,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","bus-front":"M4 6 2 7 M10 6h4 m22 7-2-1 M 6,3 h 12 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M4 11h16 M8 15h.01 M16 15h.01 M6 19v2 M18 21v-2","cable":"M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z M17 21v-2 M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10 M21 21v-2 M3 5V3 M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z M7 5V3","cable-car":"M10 3h.01 M14 2h.01 m2 9 20-5 M12 12V6.5 M 7,12 h 10 a 3,3 0 0,1 3,3 v 4 a 3,3 0 0,1 -3,3 h -10 a 3,3 0 0,1 -3,-3 v -4 a 3,3 0 0,1 3,-3 Z M9 12v5 M15 12v5 M4 17h16","cake":"M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8 M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1 M2 21h20 M7 8v3 M12 8v3 M17 8v3 M7 4h.01 M12 4h.01 M17 4h.01","cake-slice":"M16 13H3 M16 17H3 m7.2 7.9-3.388 2.5A2 2 0 0 0 3 12.01V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8.654c0-2-2.44-6.026-6.44-8.026a1 1 0 0 0-1.082.057L10.4 5.6 M 7,7 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","calculator":"M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M 8,6 L 16,6 M 16,14 L 16,18 M16 10h.01 M12 10h.01 M8 10h.01 M12 14h.01 M8 14h.01 M12 18h.01 M8 18h.01","calendar":"M8 2v4 M16 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 10h18","calendar1":"M11 14h1v4 M16 2v4 M3 10h18 M8 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","calendar-arrow-down":"m14 18 4 4 4-4 M16 2v4 M18 14v8 M21 11.354V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.343 M3 10h18 M8 2v4","calendar-arrow-up":"m14 18 4-4 4 4 M16 2v4 M18 22v-8 M21 11.343V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9 M3 10h18 M8 2v4","calendar-check":"M8 2v4 M16 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 10h18 m9 16 2 2 4-4","calendar-check2":"M8 2v4 M16 2v4 M21 14V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8 M3 10h18 m16 20 2 2 4-4","calendar-clock":"M16 14v2.2l1.6 1 M16 2v4 M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5 M3 10h5 M8 2v4 M 10,16 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","calendar-cog":"m15.228 16.852-.923-.383 m15.228 19.148-.923.383 M16 2v4 m16.47 14.305.382.923 m16.852 20.772-.383.924 m19.148 15.228.383-.923 m19.53 21.696-.382-.924 m20.772 16.852.924-.383 m20.772 19.148.924.383 M21 10.592V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6 M3 10h18 M8 2v4 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","calendar-days":"M8 2v4 M16 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 10h18 M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01","calendar-fold":"M3 20a2 2 0 0 0 2 2h10a2.4 2.4 0 0 0 1.706-.706l3.588-3.588A2.4 2.4 0 0 0 21 16V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z M15 22v-5a1 1 0 0 1 1-1h5 M8 2v4 M16 2v4 M3 10h18","calendar-heart":"M12.127 22H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5.125 M14.62 18.8A2.25 2.25 0 1 1 18 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z M16 2v4 M3 10h18 M8 2v4","calendar-minus":"M16 19h6 M16 2v4 M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5 M3 10h18 M8 2v4","calendar-minus2":"M8 2v4 M16 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 10h18 M10 16h4","calendar-off":"M4.2 4.2A2 2 0 0 0 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 1.82-1.18 M21 15.5V6a2 2 0 0 0-2-2H9.5 M16 2v4 M3 10h7 M21 10h-5.5 m2 2 20 20","calendar-plus":"M16 19h6 M16 2v4 M19 16v6 M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5 M3 10h18 M8 2v4","calendar-plus2":"M8 2v4 M16 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 10h18 M10 16h4 M12 14v4","calendar-range":"M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 2v4 M3 10h18 M8 2v4 M17 14h-6 M13 18H7 M7 14h.01 M17 18h.01","calendar-search":"M16 2v4 M21 11.75V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.25 m22 22-1.875-1.875 M3 10h18 M8 2v4 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","calendar-sync":"M11 10v4h4 m11 14 1.535-1.605a5 5 0 0 1 8 1.5 M16 2v4 m21 18-1.535 1.605a5 5 0 0 1-8-1.5 M21 22v-4h-4 M21 8.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4.3 M3 10h4 M8 2v4","calendar-x":"M8 2v4 M16 2v4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 10h18 m14 14-4 4 m10 14 4 4","calendar-x2":"M8 2v4 M16 2v4 M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8 M3 10h18 m17 22 5-5 m17 17 5 5","calendars":"M12 2v2 M15.726 21.01A2 2 0 0 1 14 22H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2 M18 2v2 M2 13h2 M8 8h14 M 10,3 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","camera":"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z M 9,13 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","camera-off":"M14.564 14.558a3 3 0 1 1-4.122-4.121 m2 2 20 20 M20 20H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 .819-.175 M9.695 4.024A2 2 0 0 1 10.004 4h3.993a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v7.344","candlestick-chart":"M9 5v4 M 8,9 h 2 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z M9 15v2 M17 3v2 M 16,5 h 2 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z M17 13v3 M3 3v16a2 2 0 0 0 2 2h16","candy":"M10 7v10.9 M14 6.1V17 M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4 M16.536 7.465a5 5 0 0 0-7.072 0l-2 2a5 5 0 0 0 0 7.07 5 5 0 0 0 7.072 0l2-2a5 5 0 0 0 0-7.07 M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4","candy-cane":"M5.7 21a2 2 0 0 1-3.5-2l8.6-14a6 6 0 0 1 10.4 6 2 2 0 1 1-3.464-2 2 2 0 1 0-3.464-2Z M17.75 7 15 2.1 M10.9 4.8 13 9 m7.9 9.7 2 4.4 M4.9 14.7 7 18.9","candy-off":"M10 10v7.9 M11.802 6.145a5 5 0 0 1 6.053 6.053 M14 6.1v2.243 m15.5 15.571-.964.964a5 5 0 0 1-7.071 0 5 5 0 0 1 0-7.07l.964-.965 M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4 m2 2 20 20 M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4","cannabis":"M12 22v-4 M7 12c-1.5 0-4.5 1.5-5 3 3.5 1.5 6 1 6 1-1.5 1.5-2 3.5-2 5 2.5 0 4.5-1.5 6-3 1.5 1.5 3.5 3 6 3 0-1.5-.5-3.5-2-5 0 0 2.5.5 6-1-.5-1.5-3.5-3-5-3 1.5-1 4-4 4-6-2.5 0-5.5 1.5-7 3 0-2.5-.5-5-2-7-1.5 2-2 4.5-2 7-1.5-1.5-4.5-3-7-3 0 2 2.5 5 4 6","cannabis-off":"M12 22v-4c1.5 1.5 3.5 3 6 3 0-1.5-.5-3.5-2-5 M13.988 8.327C13.902 6.054 13.365 3.82 12 2a9.3 9.3 0 0 0-1.445 2.9 M17.375 11.725C18.882 10.53 21 7.841 21 6c-2.324 0-5.08 1.296-6.662 2.684 m2 2 20 20 M21.024 15.378A15 15 0 0 0 22 15c-.426-1.279-2.67-2.557-4.25-2.907 M6.995 6.992C5.714 6.4 4.29 6 3 6c0 2 2.5 5 4 6-1.5 0-4.5 1.5-5 3 3.5 1.5 6 1 6 1-1.5 1.5-2 3.5-2 5 2.5 0 4.5-1.5 6-3","captions":"M 5,5 h 14 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M7 15h4M15 15h2M7 11h2M13 11h4","captions-off":"M10.5 5H19a2 2 0 0 1 2 2v8.5 M17 11h-.5 M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 m2 2 20 20 M7 11h4 M7 15h2.5","car":"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2 M 5,17 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M9 17h6 M 15,17 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","car-front":"m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8 M7 14h.01 M17 14h.01 M 5,10 h 14 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M5 18v2 M19 18v2","car-taxi-front":"M10 2h4 m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8 M7 14h.01 M17 14h.01 M 5,10 h 14 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M5 18v2 M19 18v2","caravan":"M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2 M2 9h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2 M22 17v1a1 1 0 0 1-1 1H10v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9 M 6,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","card-sim":"M12 14v4 M14.172 2a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 20 7.828V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M8 14h8 M 9,10 h 6 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","carrot":"M2.27 21.7s9.87-3.5 12.73-6.36a4.5 4.5 0 0 0-6.36-6.37C5.77 11.84 2.27 21.7 2.27 21.7zM8.64 14l-2.05-2.04M15.34 15l-2.46-2.46 M22 9s-1.33-2-3.5-2C16.86 7 15 9 15 9s1.33 2 3.5 2S22 9 22 9z M15 2s-2 1.33-2 3.5S15 9 15 9s2-1.84 2-3.5C17 3.33 15 2 15 2z","case-lower":"M10 9v7 M14 6v10 M 14,12.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0 M 3,12.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0","case-sensitive":"m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16 M22 9v7 M3.304 13h6.392 M 15,12.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0","case-upper":"M15 11h4.5a1 1 0 0 1 0 5h-4a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h3a1 1 0 0 1 0 5 m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16 M3.304 13h6.392","cassette-tape":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M 6,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M8 12h8 M 14,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m6 20 .7-2.9A1.4 1.4 0 0 1 8.1 16h7.8a1.4 1.4 0 0 1 1.4 1l.7 3","cast":"M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6 M2 12a9 9 0 0 1 8 8 M2 16a5 5 0 0 1 4 4 M 2,20 L 2.01,20","castle":"M10 5V3 M14 5V3 M15 21v-3a3 3 0 0 0-6 0v3 M18 3v8 M18 5H6 M22 11H2 M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9 M6 3v8","cat":"M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z M8 14v.5 M16 14v.5 M11.25 16.25h1.5L12 17l-.75-.75Z","cctv":"M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97 M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15 M2 21v-4 M7 9h.01","cctv-off":"m12.309 6.652 4.797 2.401a1 1 0 0 1 .447 1.341l-.501 1.001.605.605h2.725a1 1 0 0 1 .894 1.447l-.724 1.448 m15.166 15.166-.719 1.439a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.9 2.9 0 0 1 .873-1.037 M2 19h3.76a2 2 0 0 0 1.8-1.1l1.441-2.902 m2 2 20 20 M2 21v-4 M7 9h.01","chart-area":"M3 3v16a2 2 0 0 0 2 2h16 M7 11.207a.5.5 0 0 1 .146-.353l2-2a.5.5 0 0 1 .708 0l3.292 3.292a.5.5 0 0 0 .708 0l4.292-4.292a.5.5 0 0 1 .854.353V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z","chart-bar":"M3 3v16a2 2 0 0 0 2 2h16 M7 16h8 M7 11h12 M7 6h3","chart-bar-big":"M3 3v16a2 2 0 0 0 2 2h16 M 8,13 h 7 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -7 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M 8,5 h 10 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -10 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","chart-bar-decreasing":"M3 3v16a2 2 0 0 0 2 2h16 M7 11h8 M7 16h3 M7 6h12","chart-bar-increasing":"M3 3v16a2 2 0 0 0 2 2h16 M7 11h8 M7 16h12 M7 6h3","chart-bar-stacked":"M11 13v4 M15 5v4 M3 3v16a2 2 0 0 0 2 2h16 M 8,13 h 7 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -7 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M 8,5 h 10 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -10 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","chart-candlestick":"M9 5v4 M 8,9 h 2 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z M9 15v2 M17 3v2 M 16,5 h 2 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z M17 13v3 M3 3v16a2 2 0 0 0 2 2h16","chart-column":"M3 3v16a2 2 0 0 0 2 2h16 M18 17V9 M13 17V5 M8 17v-3","chart-column-big":"M3 3v16a2 2 0 0 0 2 2h16 M 16,5 h 2 a 1,1 0 0,1 1,1 v 10 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -10 a 1,1 0 0,1 1,-1 Z M 8,8 h 2 a 1,1 0 0,1 1,1 v 7 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -7 a 1,1 0 0,1 1,-1 Z","chart-column-decreasing":"M13 17V9 M18 17v-3 M3 3v16a2 2 0 0 0 2 2h16 M8 17V5","chart-column-increasing":"M13 17V9 M18 17V5 M3 3v16a2 2 0 0 0 2 2h16 M8 17v-3","chart-column-stacked":"M11 13H7 M19 9h-4 M3 3v16a2 2 0 0 0 2 2h16 M 16,5 h 2 a 1,1 0 0,1 1,1 v 10 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -10 a 1,1 0 0,1 1,-1 Z M 8,8 h 2 a 1,1 0 0,1 1,1 v 7 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -7 a 1,1 0 0,1 1,-1 Z","chart-gantt":"M10 6h8 M12 16h6 M3 3v16a2 2 0 0 0 2 2h16 M8 11h7","chart-line":"M3 3v16a2 2 0 0 0 2 2h16 m19 9-5 5-4-4-3 3","chart-network":"m13.11 7.664 1.78 2.672 m14.162 12.788-3.324 1.424 m20 4-6.06 1.515 M3 3v16a2 2 0 0 0 2 2h16 M 10,6 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 14,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 7,15 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","chart-no-axes-column":"M5 21v-6 M12 21V3 M19 21V9","chart-no-axes-column-decreasing":"M5 21V3 M12 21V9 M19 21v-6","chart-no-axes-column-increasing":"M5 21v-6 M12 21V9 M19 21V3","chart-no-axes-combined":"M12 16v5 M16 14v7 M20 10v11 m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15 M4 18v3 M8 14v7","chart-no-axes-gantt":"M6 5h12 M4 12h10 M12 19h8","chart-pie":"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z M21.21 15.89A10 10 0 1 1 8 2.83","chart-scatter":"M 7,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 18,5.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 11,11.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 7,16.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 17,14.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M3 3v16a2 2 0 0 0 2 2h16","chart-spline":"M3 3v16a2 2 0 0 0 2 2h16 M7 16c.5-2 1.5-7 4-7 2 0 2 3 4 3 2.5 0 4.5-5 5-7","check":"M20 6 9 17l-5-5","check-check":"M18 6 7 17l-5-5 m22 10-7.5 7.5L13 16","check-circle":"M21.801 10A10 10 0 1 1 17 3.335 m9 11 3 3L22 4","check-circle2":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m9 12 2 2 4-4","check-line":"M20 4L9 15 M21 19L3 19 M9 15L4 10","check-square":"M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344 m9 11 3 3L22 4","check-square2":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m9 12 2 2 4-4","chef-hat":"M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z M6 17h12","cherry":"M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12 M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z","chess-bishop":"M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z M15 18c1.5-.615 3-2.461 3-4.923C18 8.769 14.5 4.462 12 2 9.5 4.462 6 8.77 6 13.077 6 15.539 7.5 17.385 9 18 m16 7-2.5 2.5 M9 2h6","chess-king":"M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z m6.7 18-1-1C4.35 15.682 3 14.09 3 12a5 5 0 0 1 4.95-5c1.584 0 2.7.455 4.05 1.818C13.35 7.455 14.466 7 16.05 7A5 5 0 0 1 21 12c0 2.082-1.359 3.673-2.7 5l-1 1 M10 4h4 M12 2v6.818","chess-knight":"M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456 m15 5 1.425-1.425 m17 8 1.53-1.53 M9.713 12.185 7 18","chess-pawn":"M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z m14.5 10 1.5 8 M7 10h10 m8 18 1.5-8 M 8,6 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","chess-queen":"M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z m12.474 5.943 1.567 5.34a1 1 0 0 0 1.75.328l2.616-3.402 m20 9-3 9 m5.594 8.209 2.615 3.403a1 1 0 0 0 1.75-.329l1.567-5.34 M7 18 4 9 M 10,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 18,7 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 2,7 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","chess-rook":"M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z M10 2v2 M14 2v2 m17 18-1-9 M6 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2 M6 4h12 m7 18 1-9","chevron-down":"m6 9 6 6 6-6","chevron-down-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m16 10-4 4-4-4","chevron-down-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m16 10-4 4-4-4","chevron-first":"m17 18-6-6 6-6 M7 6v12","chevron-last":"m7 18 6-6-6-6 M17 6v12","chevron-left":"m15 18-6-6 6-6","chevron-left-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m14 16-4-4 4-4","chevron-left-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m14 16-4-4 4-4","chevron-right":"m9 18 6-6-6-6","chevron-right-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m10 8 4 4-4 4","chevron-right-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m10 8 4 4-4 4","chevron-up":"m18 15-6-6-6 6","chevron-up-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m8 14 4-4 4 4","chevron-up-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m8 14 4-4 4 4","chevrons-down":"m7 6 5 5 5-5 m7 13 5 5 5-5","chevrons-down-up":"m7 20 5-5 5 5 m7 4 5 5 5-5","chevrons-left":"m11 17-5-5 5-5 m18 17-5-5 5-5","chevrons-left-right":"m9 7-5 5 5 5 m15 7 5 5-5 5","chevrons-left-right-ellipsis":"M12 12h.01 M16 12h.01 m17 7 5 5-5 5 m7 7-5 5 5 5 M8 12h.01","chevrons-right":"m6 17 5-5-5-5 m13 17 5-5-5-5","chevrons-right-left":"m20 17-5-5 5-5 m4 17 5-5-5-5","chevrons-up":"m17 11-5-5-5 5 m17 18-5-5-5 5","chevrons-up-down":"m7 15 5 5 5-5 m7 9 5-5 5 5","church":"M10 9h4 M12 7v5 M14 21v-3a2 2 0 0 0-4 0v3 m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9 M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14","cigarette":"M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14 M18 8c0-2.5-2-2.5-2-5 M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 M22 8c0-2.5-2-2.5-2-5 M7 12v4","cigarette-off":"M12 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h13 M18 8c0-2.5-2-2.5-2-5 m2 2 20 20 M21 12a1 1 0 0 1 1 1v2a1 1 0 0 1-.5.866 M22 8c0-2.5-2-2.5-2-5 M7 12v4","circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","circle-alert":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 12,8 L 12,12 M 12,16 L 12.01,16","circle-arrow-down":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 8v8 m8 12 4 4 4-4","circle-arrow-left":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m12 8-4 4 4 4 M16 12H8","circle-arrow-out-down-left":"M2 12a10 10 0 1 1 10 10 m2 22 10-10 M8 22H2v-6","circle-arrow-out-down-right":"M12 22a10 10 0 1 1 10-10 M22 22 12 12 M22 16v6h-6","circle-arrow-out-up-left":"M2 8V2h6 m2 2 10 10 M12 2A10 10 0 1 1 2 12","circle-arrow-out-up-right":"M22 12A10 10 0 1 1 12 2 M22 2 12 12 M16 2h6v6","circle-arrow-right":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m12 16 4-4-4-4 M8 12h8","circle-arrow-up":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m16 12-4-4-4 4 M12 16V8","circle-check":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m9 12 2 2 4-4","circle-check-big":"M21.801 10A10 10 0 1 1 17 3.335 m9 11 3 3L22 4","circle-chevron-down":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m16 10-4 4-4-4","circle-chevron-left":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m14 16-4-4 4-4","circle-chevron-right":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m10 8 4 4-4 4","circle-chevron-up":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m8 14 4-4 4 4","circle-dashed":"M10.1 2.182a10 10 0 0 1 3.8 0 M13.9 21.818a10 10 0 0 1-3.8 0 M17.609 3.721a10 10 0 0 1 2.69 2.7 M2.182 13.9a10 10 0 0 1 0-3.8 M20.279 17.609a10 10 0 0 1-2.7 2.69 M21.818 10.1a10 10 0 0 1 0 3.8 M3.721 6.391a10 10 0 0 1 2.7-2.69 M6.391 20.279a10 10 0 0 1-2.69-2.7","circle-divide":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 8,12 L 16,12 M 12,16 L 12,16 M 12,8 L 12,8","circle-dollar-sign":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8 M12 18V6","circle-dot":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","circle-dot-dashed":"M10.1 2.18a9.93 9.93 0 0 1 3.8 0 M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7 M21.82 10.1a9.93 9.93 0 0 1 0 3.8 M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69 M13.9 21.82a9.94 9.94 0 0 1-3.8 0 M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7 M2.18 13.9a9.93 9.93 0 0 1 0-3.8 M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69 M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","circle-ellipsis":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M17 12h.01 M12 12h.01 M7 12h.01","circle-equal":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M7 10h10 M7 14h10","circle-fading-arrow-up":"M12 2a10 10 0 0 1 7.38 16.75 m16 12-4-4-4 4 M12 16V8 M2.5 8.875a10 10 0 0 0-.5 3 M2.83 16a10 10 0 0 0 2.43 3.4 M4.636 5.235a10 10 0 0 1 .891-.857 M8.644 21.42a10 10 0 0 0 7.631-.38","circle-fading-plus":"M12 2a10 10 0 0 1 7.38 16.75 M12 8v8 M16 12H8 M2.5 8.875a10 10 0 0 0-.5 3 M2.83 16a10 10 0 0 0 2.43 3.4 M4.636 5.235a10 10 0 0 1 .891-.857 M8.644 21.42a10 10 0 0 0 7.631-.38","circle-gauge":"M15.6 2.7a10 10 0 1 0 5.7 5.7 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M13.4 10.6 19 5","circle-help":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01","circle-minus":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M8 12h8","circle-off":"m2 2 20 20 M8.35 2.69A10 10 0 0 1 21.3 15.65 M19.08 19.08A10 10 0 1 1 4.92 4.92","circle-parking":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M9 17V7h4a3 3 0 0 1 0 6H9","circle-parking-off":"M12.656 7H13a3 3 0 0 1 2.984 3.307 M13 13H9 M19.071 19.071A1 1 0 0 1 4.93 4.93 m2 2 20 20 M8.357 2.687a10 10 0 0 1 12.956 12.956 M9 17V9","circle-pause":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 10,15 L 10,9 M 14,15 L 14,9","circle-percent":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m15 9-6 6 M9 9h.01 M15 15h.01","circle-pile":"M 10,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 10,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 14,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 18,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 2,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 6,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","circle-play":"M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","circle-plus":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M8 12h8 M12 8v8","circle-pound-sterling":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M10 16V9.5a1 1 0 0 1 5 0 M8 12h4 M8 16h7","circle-power":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 7v4 M7.998 9.003a5 5 0 1 0 8-.005","circle-question-mark":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01","circle-slash":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 9,15 L 15,9","circle-slash2":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M22 2 2 22","circle-slashed":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M22 2 2 22","circle-small":"M 6,12 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","circle-star":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M11.051 7.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.867l-1.156-1.152a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z","circle-stop":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 10,9 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","circle-user":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662","circle-user-round":"M17.925 20.056a6 6 0 0 0-11.851.001 M 8,11 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","circle-x":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m15 9-6 6 m9 9 6 6","circuit-board":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M11 9h4a2 2 0 0 0 2-2V3 M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M7 21v-4a2 2 0 0 1 2-2h4 M 13,15 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","citrus":"M21.66 17.67a1.08 1.08 0 0 1-.04 1.6A12 12 0 0 1 4.73 2.38a1.1 1.1 0 0 1 1.61-.04z M19.65 15.66A8 8 0 0 1 8.35 4.34 m14 10-5.5 5.5 M14 17.85V10H6.15","clapperboard":"m12.296 3.464 3.02 3.956 M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z m6.18 5.276 3.1 3.899","clipboard":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2","clipboard-check":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 m9 14 2 2 4-4","clipboard-clock":"M16 14v2.2l1.6 1 M16 4h2a2 2 0 0 1 2 2v.832 M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2 M 10,16 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0 M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","clipboard-copy":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2 M16 4h2a2 2 0 0 1 2 2v4 M21 14H11 m15 10-4 4 4 4","clipboard-edit":"M16 4h2a2 2 0 0 1 2 2v2 M21.34 15.664a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M8 22H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","clipboard-list":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M12 11h4 M12 16h4 M8 11h.01 M8 16h.01","clipboard-minus":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 14h6","clipboard-paste":"M11 14h10 M16 4h2a2 2 0 0 1 2 2v1.344 m17 18 4-4-4-4 M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113 M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","clipboard-pen":"M16 4h2a2 2 0 0 1 2 2v2 M21.34 15.664a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M8 22H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","clipboard-pen-line":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5 M16 4h2a2 2 0 0 1 1.73 1 M8 18h1 M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z","clipboard-plus":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 14h6 M12 17v-6","clipboard-signature":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5 M16 4h2a2 2 0 0 1 1.73 1 M8 18h1 M21.378 12.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z","clipboard-type":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 12v-1h6v1 M11 17h2 M12 11v6","clipboard-x":"M 9,2 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 m15 11-6 6 m9 11 6 6","clock":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l4 2","clock1":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l2-4","clock10":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l-4-2","clock11":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l-2-4","clock12":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6","clock2":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l4-2","clock3":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6h4","clock4":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l4 2","clock5":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l2 4","clock6":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v10","clock7":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l-2 4","clock8":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6l-4 2","clock9":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 6v6H8","clock-alert":"M12 6v6l4 2 M20 12v5 M20 21h.01 M21.25 8.2A10 10 0 1 0 16 21.16","clock-arrow-down":"M12 6v6l2 1 M12.337 21.994a10 10 0 1 1 9.588-8.767 m14 18 4 4 4-4 M18 14v8","clock-arrow-up":"M12 6v6l1.56.78 M13.227 21.925a10 10 0 1 1 8.767-9.588 m14 18 4-4 4 4 M18 22v-8","clock-check":"M12 6v6l4 2 M22 12a10 10 0 1 0-11 9.95 m22 16-5.5 5.5L14 19","clock-fading":"M12 2a10 10 0 0 1 7.38 16.75 M12 6v6l4 2 M2.5 8.875a10 10 0 0 0-.5 3 M2.83 16a10 10 0 0 0 2.43 3.4 M4.636 5.235a10 10 0 0 1 .891-.857 M8.644 21.42a10 10 0 0 0 7.631-.38","clock-plus":"M12 6v6l3.644 1.822 M16 19h6 M19 16v6 M21.92 13.267a10 10 0 1 0-8.653 8.653","closed-caption":"M10 9.17a3 3 0 1 0 0 5.66 M17 9.17a3 3 0 1 0 0 5.66 M 4,5 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","cloud":"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z","cloud-alert":"M12 12v4 M12 20h.01 M8.128 16.949A7 7 0 1 1 15.71 8h1.79a1 1 0 0 1 0 9h-1.642","cloud-backup":"M21 15.251A4.5 4.5 0 0 0 17.5 8h-1.79A7 7 0 1 0 3 13.607 M7 11v4h4 M8 19a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5 4.82 4.82 0 0 0-3.41 1.41L7 15","cloud-check":"m17 15-5.5 5.5L9 18 M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327","cloud-cog":"m10.852 19.772-.383.924 m13.148 14.228.383-.923 M13.148 19.772a3 3 0 1 0-2.296-5.544l-.383-.923 m13.53 20.696-.382-.924a3 3 0 1 1-2.296-5.544 m14.772 15.852.923-.383 m14.772 18.148.923.383 M4.2 15.1a7 7 0 1 1 9.93-9.858A7 7 0 0 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.2 m9.228 15.852-.923-.383 m9.228 18.148-.923.383","cloud-download":"M12 13v8l-4-4 m12 21 4-4 M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284","cloud-drizzle":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 M8 19v1 M8 14v1 M16 19v1 M16 14v1 M12 21v1 M12 16v1","cloud-fog":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 M16 17H7 M17 21H9","cloud-hail":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 M16 14v2 M8 14v2 M16 20h.01 M8 20h.01 M12 16v2 M12 22h.01","cloud-lightning":"M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973 m13 12-3 5h4l-3 5","cloud-moon":"M13 16a3 3 0 0 1 0 6H7a5 5 0 1 1 4.9-6z M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36","cloud-moon-rain":"M11 20v2 M18.376 14.512a6 6 0 0 0 3.461-4.127c.148-.625-.659-.97-1.248-.714a4 4 0 0 1-5.259-5.26c.255-.589-.09-1.395-.716-1.248a6 6 0 0 0-4.594 5.36 M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24 M7 19v2","cloud-off":"M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057 M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78 m2 2 20 20","cloud-rain":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 M16 14v6 M8 14v6 M12 16v6","cloud-rain-wind":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 m9.2 22 3-7 m9 13-3 7 m17 13-3 7","cloud-snow":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 M8 15h.01 M8 19h.01 M12 17h.01 M12 21h.01 M16 15h.01 M16 19h.01","cloud-sun":"M12 2v2 m4.93 4.93 1.41 1.41 M20 12h2 m19.07 4.93-1.41 1.41 M15.947 12.65a4 4 0 0 0-5.925-4.128 M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z","cloud-sun-rain":"M12 2v2 m4.93 4.93 1.41 1.41 M20 12h2 m19.07 4.93-1.41 1.41 M15.947 12.65a4 4 0 0 0-5.925-4.128 M3 20a5 5 0 1 1 8.9-4H13a3 3 0 0 1 2 5.24 M11 20v2 M7 19v2","cloud-sync":"m17 18-1.535 1.605a5 5 0 0 1-8-1.5 M17 22v-4h-4 M20.996 15.251A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607 M7 10v4h4 m7 14 1.535-1.605a5 5 0 0 1 8 1.5","cloud-upload":"M12 13v8 M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 m8 17 4-4 4 4","cloudy":"M17.5 12a1 1 0 1 1 0 9H9.006a7 7 0 1 1 6.702-9z M21.832 9A3 3 0 0 0 19 7h-2.207a5.5 5.5 0 0 0-10.72.61","clover":"M16.17 7.83 2 22 M4.02 12a2.827 2.827 0 1 1 3.81-4.17A2.827 2.827 0 1 1 12 4.02a2.827 2.827 0 1 1 4.17 3.81A2.827 2.827 0 1 1 19.98 12a2.827 2.827 0 1 1-3.81 4.17A2.827 2.827 0 1 1 12 19.98a2.827 2.827 0 1 1-4.17-3.81A1 1 0 1 1 4 12 m7.83 7.83 8.34 8.34","club":"M17.28 9.05a5.5 5.5 0 1 0-10.56 0A5.5 5.5 0 1 0 12 17.66a5.5 5.5 0 1 0 5.28-8.6Z M12 17.66L12 22","code":"m16 18 6-6-6-6 m8 6-6 6 6 6","code2":"m18 16 4-4-4-4 m6 8-4 4 4 4 m14.5 4-5 16","code-square":"m10 9-3 3 3 3 m14 15 3-3-3-3 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","code-xml":"m18 16 4-4-4-4 m6 8-4 4 4 4 m14.5 4-5 16","coffee":"M10 2v2 M14 2v2 M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1 M6 2v2","cog":"M11 10.27 7 3.34 m11 13.73-4 6.93 M12 22v-2 M12 2v2 M14 12h8 m17 20.66-1-1.73 m17 3.34-1 1.73 M2 12h2 m20.66 17-1.73-1 m20.66 7-1.73 1 m3.34 17 1.73-1 m3.34 7 1.73 1 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 4,12 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0","coins":"M13.744 17.736a6 6 0 1 1-7.48-7.48 M15 6h1v4 m6.134 14.768.866-.5 2 3.464 M 10,8 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","columns":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 3v18","columns2":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 3v18","columns3":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 M15 3v18","columns3-cog":"M10.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5.5 m14.3 19.6 1-.4 M15 3v7.5 m15.2 16.9-.9-.3 m16.6 21.7.3-.9 m16.8 15.3-.4-1 m19.1 15.2.3-.9 m19.6 21.7-.4-1 m20.7 16.8 1-.4 m21.7 19.4-.9-.3 M9 3v18 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","columns4":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7.5 3v18 M12 3v18 M16.5 3v18","columns-settings":"M10.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5.5 m14.3 19.6 1-.4 M15 3v7.5 m15.2 16.9-.9-.3 m16.6 21.7.3-.9 m16.8 15.3-.4-1 m19.1 15.2.3-.9 m19.6 21.7-.4-1 m20.7 16.8 1-.4 m21.7 19.4-.9-.3 M9 3v18 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","combine":"M14 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1 M19 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1 m7 15 3 3 m7 21 3-3H5a2 2 0 0 1-2-2v-2 M 15,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 4,3 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","command":"M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3","compass":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z","component":"M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z","computer":"M 7,2 h 10 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M 4,14 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M6 18h2 M12 18h6","concierge-bell":"M3 20a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1Z M20 16a8 8 0 1 0-16 0 M12 4v4 M10 4h4","cone":"m20.9 18.55-8-15.98a1 1 0 0 0-1.8 0l-8 15.98 M 3,19 a 9,3 0 1,0 18,0 a 9,3 0 1,0 -18,0","construction":"M 3,6 h 18 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -18 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z M17 14v7 M7 14v7 M17 3v3 M7 3v3 M10 14 2.3 6.3 m14 6 7.7 7.7 m8 6 8 8","contact":"M16 2v2 M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2 M8 2v2 M 9,11 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","contact2":"M16 2v2 M17.915 22a6 6 0 0 0-12 0 M8 2v2 M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","contact-round":"M16 2v2 M17.915 22a6 6 0 0 0-12 0 M8 2v2 M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 5,4 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","container":"M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z M10 21.9V14L2.1 9.1 m10 14 11.9-6.9 M14 19.8v-8.1 M18 17.5V9.4","contrast":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 18a6 6 0 0 0 0-12v12z","cookie":"M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5 M8.5 8.5v.01 M16 15.5v.01 M12 12v.01 M11 17v.01 M7 14v.01","cooking-pot":"M2 12h20 M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8 m4 8 16-4 m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8","copy":"M 10,8 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2","copy-check":"m12 15 2 2 4-4 M 10,8 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2","copy-minus":"M 12,15 L 18,15 M 10,8 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2","copy-plus":"M 15,12 L 15,18 M 12,15 L 18,15 M 10,8 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2","copy-slash":"M 12,18 L 18,12 M 10,8 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2","copy-x":"M 12,12 L 18,18 M 12,18 L 18,12 M 10,8 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2","copyleft":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M9.17 14.83a4 4 0 1 0 0-5.66","copyright":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M14.83 14.83a4 4 0 1 1 0-5.66","corner-down-left":"M20 4v7a4 4 0 0 1-4 4H4 m9 10-5 5 5 5","corner-down-right":"m15 10 5 5-5 5 M4 4v7a4 4 0 0 0 4 4h12","corner-left-down":"m14 15-5 5-5-5 M20 4h-7a4 4 0 0 0-4 4v12","corner-left-up":"M14 9 9 4 4 9 M20 20h-7a4 4 0 0 1-4-4V4","corner-right-down":"m10 15 5 5 5-5 M4 4h7a4 4 0 0 1 4 4v12","corner-right-up":"m10 9 5-5 5 5 M4 20h7a4 4 0 0 0 4-4V4","corner-up-left":"M20 20v-7a4 4 0 0 0-4-4H4 M9 14 4 9l5-5","corner-up-right":"m15 14 5-5-5-5 M4 20v-7a4 4 0 0 1 4-4h12","cpu":"M12 20v2 M12 2v2 M17 20v2 M17 2v2 M2 12h2 M2 17h2 M2 7h2 M20 12h2 M20 17h2 M20 7h2 M7 20v2 M7 2v2 M 6,4 h 12 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M 9,8 h 6 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","creative-commons":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M10 9.3a2.8 2.8 0 0 0-3.5 1 3.1 3.1 0 0 0 0 3.4 2.7 2.7 0 0 0 3.5 1 M17 9.3a2.8 2.8 0 0 0-3.5 1 3.1 3.1 0 0 0 0 3.4 2.7 2.7 0 0 0 3.5 1","credit-card":"M 4,5 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 2,10 L 22,10","croissant":"M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487 M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132 M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42 M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14 M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676","crop":"M6 2v14a2 2 0 0 0 2 2h14 M18 22V8a2 2 0 0 0-2-2H2","cross":"M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z","crosshair":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 22,12 L 18,12 M 6,12 L 2,12 M 12,6 L 12,2 M 12,22 L 12,18","crown":"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z M5 21h14","cuboid":"M10 22v-8 M2.336 8.89 10 14l11.715-7.029 M22 14a2 2 0 0 1-.971 1.715l-10 6a2 2 0 0 1-2.138-.05l-6-4A2 2 0 0 1 2 16v-6a2 2 0 0 1 .971-1.715l10-6a2 2 0 0 1 2.138.05l6 4A2 2 0 0 1 22 8z","cup-soda":"m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8 M5 8h14 M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0 m12 8 1-6h2","curly-braces":"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1 M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1","currency":"M 4,12 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M 3,3 L 6,6 M 21,3 L 18,6 M 3,21 L 6,18 M 21,21 L 18,18","cylinder":"M 3,5 a 9,3 0 1,0 18,0 a 9,3 0 1,0 -18,0 M3 5v14a9 3 0 0 0 18 0V5","dam":"M11 11.31c1.17.56 1.54 1.69 3.5 1.69 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M11.75 18c.35.5 1.45 1 2.75 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 10h4 M2 14h4 M2 18h4 M2 6h4 M7 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1L10 4a1 1 0 0 0-1-1z","database":"M 3,5 a 9,3 0 1,0 18,0 a 9,3 0 1,0 -18,0 M3 5V19A9 3 0 0 0 21 19V5 M3 12A9 3 0 0 0 21 12","database-backup":"M 3,5 a 9,3 0 1,0 18,0 a 9,3 0 1,0 -18,0 M3 12a9 3 0 0 0 5 2.69 M21 9.3V5 M3 5v14a9 3 0 0 0 6.47 2.88 M12 12v4h4 M13 20a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L12 16","database-search":"M21 11.693V5 m22 22-1.875-1.875 M3 12a9 3 0 0 0 8.697 2.998 M3 5v14a9 3 0 0 0 9.28 2.999 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,5 a 9,3 0 1,0 18,0 a 9,3 0 1,0 -18,0","database-zap":"M 3,5 a 9,3 0 1,0 18,0 a 9,3 0 1,0 -18,0 M3 5V19A9 3 0 0 0 15 21.84 M21 5V8 M21 12L18 17H22L19 22 M3 12A9 3 0 0 0 14.59 14.87","decimals-arrow-left":"m13 21-3-3 3-3 M20 18H10 M3 11h.01 M 8.5,3 h 0 a 2.5,2.5 0 0,1 2.5,2.5 v 3 a 2.5,2.5 0 0,1 -2.5,2.5 h 0 a 2.5,2.5 0 0,1 -2.5,-2.5 v -3 a 2.5,2.5 0 0,1 2.5,-2.5 Z","decimals-arrow-right":"M10 18h10 m17 21 3-3-3-3 M3 11h.01 M 17.5,3 h 0 a 2.5,2.5 0 0,1 2.5,2.5 v 3 a 2.5,2.5 0 0,1 -2.5,2.5 h 0 a 2.5,2.5 0 0,1 -2.5,-2.5 v -3 a 2.5,2.5 0 0,1 2.5,-2.5 Z M 8.5,3 h 0 a 2.5,2.5 0 0,1 2.5,2.5 v 3 a 2.5,2.5 0 0,1 -2.5,2.5 h 0 a 2.5,2.5 0 0,1 -2.5,-2.5 v -3 a 2.5,2.5 0 0,1 2.5,-2.5 Z","delete":"M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z m12 9 6 6 m18 9-6 6","dessert":"M10.162 3.167A10 10 0 0 0 2 13a2 2 0 0 0 4 0v-1a2 2 0 0 1 4 0v4a2 2 0 0 0 4 0v-4a2 2 0 0 1 4 0v1a2 2 0 0 0 4-.006 10 10 0 0 0-8.161-9.826 M20.804 14.869a9 9 0 0 1-17.608 0 M 10,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","diameter":"M 17,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M6.48 3.66a10 10 0 0 1 13.86 13.86 m6.41 6.41 11.18 11.18 M3.66 6.48a10 10 0 0 0 13.86 13.86","diamond":"M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z","diamond-minus":"M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z M8 12h8","diamond-percent":"M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0Z M9.2 9.2h.01 m14.5 9.5-5 5 M14.7 14.8h.01","diamond-plus":"M12 8v8 M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z M8 12h8","dice1":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 12h.01","dice2":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M15 9h.01 M9 15h.01","dice3":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 8h.01 M12 12h.01 M8 16h.01","dice4":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 8h.01 M8 8h.01 M8 16h.01 M16 16h.01","dice5":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 8h.01 M8 8h.01 M8 16h.01 M16 16h.01 M12 12h.01","dice6":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 8h.01 M16 12h.01 M16 16h.01 M8 8h.01 M8 12h.01 M8 16h.01","dices":"M 4,10 h 8 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -8 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6 M6 18h.01 M10 14h.01 M15 6h.01 M18 9h.01","diff":"M12 3v14 M5 10h14 M5 21h14","disc":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","disc2":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M12 12h.01","disc3":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M6 12c0-1.7.7-3.2 1.8-4.2 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M18 12c0 1.7-.7 3.2-1.8 4.2","disc-album":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 7,12 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M12 12h.01","divide":"M 11,6 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 5,12 L 19,12 M 11,18 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","divide-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 8,12 L 16,12 M 12,16 L 12,16 M 12,8 L 12,8","divide-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 8,12 L 16,12 M 12,16 L 12,16 M 12,8 L 12,8","dna":"m10 16 1.5 1.5 m14 8-1.5-1.5 M15 2c-1.798 1.998-2.518 3.995-2.807 5.993 m16.5 10.5 1 1 m17 6-2.891-2.891 M2 15c6.667-6 13.333 0 20-6 m20 9 .891.891 M3.109 14.109 4 15 m6.5 12.5 1 1 m7 18 2.891 2.891 M9 22c1.798-1.998 2.518-3.995 2.807-5.993","dna-off":"M15 2c-1.35 1.5-2.092 3-2.5 4.5L14 8 m17 6-2.891-2.891 M2 15c3.333-3 6.667-3 10-3 m2 2 20 20 m20 9 .891.891 M22 9c-1.5 1.35-3 2.092-4.5 2.5l-1-1 M3.109 14.109 4 15 m6.5 12.5 1 1 m7 18 2.891 2.891 M9 22c1.35-1.5 2.092-3 2.5-4.5L10 16","dock":"M2 8h20 M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M6 16h12","dog":"M11.25 16.25h1.5L12 17z M16 14v.5 M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309 M8 14v.5 M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5","dollar-sign":"M 12,2 L 12,22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6","donut":"M20.5 10a2.5 2.5 0 0 1-2.4-3H18a2.95 2.95 0 0 1-2.6-4.4 10 10 0 1 0 6.3 7.1c-.3.2-.8.3-1.2.3 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","door-closed":"M10 12h.01 M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14 M2 20h20","door-closed-locked":"M10 12h.01 M18 9V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14 M2 20h8 M20 17v-2a2 2 0 1 0-4 0v2 M 15,17 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","door-open":"M11 20H2 M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z M11 4H8a2 2 0 0 0-2 2v14 M14 12h.01 M22 20h-3","dot":"M 11.1,12.1 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","dot-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","download":"M12 15V3 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 m7 10 5 5 5-5","download-cloud":"M12 13v8l-4-4 m12 21 4-4 M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284","drafting-compass":"m12.99 6.74 1.93 3.44 M19.136 12a10 10 0 0 1-14.271 0 m21 21-2.16-3.84 m3 21 8.02-14.26 M 10,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","drama":"M10 11h.01 M14 6h.01 M18 6h.01 M6.5 13.1h.01 M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3 M17.4 9.9c-.8.8-2 .8-2.8 0 M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7 M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4","drill":"M10 18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3 1 1 0 0 1 1-1z M13 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1l-.81 3.242a1 1 0 0 1-.97.758H8 M14 4h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-3 M18 6h4 m5 10-2 8 m7 18 2-8","drone":"M10 10 7 7 m10 14-3 3 m14 10 3-3 m14 14 3 3 M14.205 4.139a4 4 0 1 1 5.439 5.863 M19.637 14a4 4 0 1 1-5.432 5.868 M4.367 10a4 4 0 1 1 5.438-5.862 M9.795 19.862a4 4 0 1 1-5.429-5.873 M 11,8 h 2 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","droplet":"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z","droplet-off":"M18.715 13.186C18.29 11.858 17.384 10.607 16 9.5c-2-1.6-3.5-4-4-6.5a10.7 10.7 0 0 1-.884 2.586 m2 2 20 20 M8.795 8.797A11 11 0 0 1 8 9.5C6 11.1 5 13 5 15a7 7 0 0 0 13.222 3.208","droplets":"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97","drum":"m2 2 8 8 m22 2-8 8 M 2,9 a 10,5 0 1,0 20,0 a 10,5 0 1,0 -20,0 M7 13.4v7.9 M12 14v8 M17 13.4v7.9 M2 9v8a10 5 0 0 0 20 0V9","drumstick":"M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23 m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59","dumbbell":"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z m2.5 21.5 1.4-1.4 m20.1 3.9 1.4-1.4 M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z m9.6 14.4 4.8-4.8","ear":"M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0 M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4","ear-off":"M6 18.5a3.5 3.5 0 1 0 7 0c0-1.57.92-2.52 2.04-3.46 M6 8.5c0-.75.13-1.47.36-2.14 M8.8 3.15A6.5 6.5 0 0 1 19 8.5c0 1.63-.44 2.81-1.09 3.76 M12.5 6A2.5 2.5 0 0 1 15 8.5M10 13a2 2 0 0 0 1.82-1.18 M 2,2 L 22,22","earth":"M21.54 15H17a2 2 0 0 0-2 2v4.54 M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17 M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05 M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","earth-lock":"M7 3.34V5a3 3 0 0 0 3 3 M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05 M21.54 15H17a2 2 0 0 0-2 2v4.54 M12 2a10 10 0 1 0 9.54 13 M20 6V4a2 2 0 1 0-4 0v2 M 15,6 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","eclipse":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 2a7 7 0 1 0 10 10","edit":"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z","edit2":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","edit3":"M13 21h8 M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","egg":"M12 2C8 2 4 8 4 14a8 8 0 0 0 16 0c0-6-4-12-8-12","egg-fried":"M 8,12.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0 M3 8c0-3.5 2.5-6 6.5-6 5 0 4.83 3 7.5 5s5 2 5 6c0 4.5-2.5 6.5-7 6.5-2.5 0-2.5 2.5-6 2.5s-7-2-7-5.5c0-3 1.5-3 1.5-5C3.5 10 3 9 3 8Z","egg-off":"m2 2 20 20 M20 14.347V14c0-6-4-12-8-12-1.078 0-2.157.436-3.157 1.19 M6.206 6.21C4.871 8.4 4 11.2 4 14a8 8 0 0 0 14.568 4.568","ellipse":"M 2,12 a 10,6 0 1,0 20,0 a 10,6 0 1,0 -20,0","ellipsis":"M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","ellipsis-vertical":"M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","equal":"M 5,9 L 19,9 M 5,15 L 19,15","equal-approximately":"M5 15a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0 M5 9a6.5 6.5 0 0 1 7 0 6.5 6.5 0 0 0 7 0","equal-not":"M 5,9 L 19,9 M 5,15 L 19,15 M 19,5 L 5,19","equal-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 10h10 M7 14h10","eraser":"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21 m5.082 11.09 8.828 8.828","ethernet-port":"m15 20 3-3h2a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2l3 3z M6 8v1 M10 8v1 M14 8v1 M18 8v1","euro":"M4 10h12 M4 14h9 M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2","ev-charger":"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5 M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16 M2 21h13 M3 7h11 m9 11-2 3h3l-2 3","expand":"m15 15 6 6 m15 9 6-6 M21 16v5h-5 M21 8V3h-5 M3 16v5h5 m3 21 6-6 M3 8V3h5 M9 9 3 3","external-link":"M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6","eye":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","eye-closed":"m15 18-.722-3.25 M2 8a10.645 10.645 0 0 0 20 0 m20 15-1.726-2.05 m4 15 1.726-2.05 m9 18 .722-3.25","eye-off":"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49 M14.084 14.158a3 3 0 0 1-4.242-4.242 M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143 m2 2 20 20","factory":"M12 16h.01 M16 16h.01 M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z M8 16h.01","fan":"M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z M12 12v.01","fast-forward":"M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z","feather":"M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z M16 8 2 22 M17.5 15H9","fence":"M4 3 2 5v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z M6 8h4 M6 18h4 m12 3-2 2v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z M14 8h4 M14 18h4 m20 3-2 2v15c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V5Z","ferris-wheel":"M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M12 2v4 m6.8 15-3.5 2 m20.7 7-3.5 2 M6.8 9 3.3 7 m20.7 17-3.5-2 m9 22 3-8 3 8 M8 22h8 M18 18.7a9 9 0 1 0-12 0","file":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5","file-archive":"M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5 M14 2v5a1 1 0 0 0 1 1h5 M8 12v-1 M8 18v-2 M8 7V6 M 6,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","file-audio":"M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343 M14 2v5a1 1 0 0 0 1 1h5 M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0","file-audio2":"M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343 M14 2v5a1 1 0 0 0 1 1h5 M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0","file-axis3-d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m8 18 4-4 M8 10v8h8","file-axis3d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m8 18 4-4 M8 10v8h8","file-badge":"M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.3 M14 2v5a1 1 0 0 0 1 1h5 m7.69 16.479 1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.879.001l-1.846.85a.5.5 0 0 1-.692-.593l1.29-4.88 M 3,14 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-badge2":"M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.3 M14 2v5a1 1 0 0 0 1 1h5 m7.69 16.479 1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.879.001l-1.846.85a.5.5 0 0 1-.692-.593l1.29-4.88 M 3,14 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-bar-chart":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 18v-2 M12 18v-4 M16 18v-6","file-bar-chart2":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 18v-1 M12 18v-6 M16 18v-3","file-box":"M14.5 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.8 M14 2v5a1 1 0 0 0 1 1h5 M11.7 14.2 7 17l-4.7-2.8 M3 13.1a2 2 0 0 0-.999 1.76v3.24a2 2 0 0 0 .969 1.78L6 21.7a2 2 0 0 0 2.03.01L11 19.9a2 2 0 0 0 1-1.76V14.9a2 2 0 0 0-.97-1.78L8 11.3a2 2 0 0 0-2.03-.01z M7 17v5","file-braces":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1 M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1","file-braces-corner":"M14 22h4a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6 M14 2v5a1 1 0 0 0 1 1h5 M5 14a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1 1 1 0 0 1 1 1v2a1 1 0 0 0 1 1 M9 22a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1","file-chart-column":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 18v-1 M12 18v-6 M16 18v-3","file-chart-column-increasing":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 18v-2 M12 18v-4 M16 18v-6","file-chart-line":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m16 13-3.5 3.5-2-2L8 17","file-chart-pie":"M15.941 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.512 M14 2v5a1 1 0 0 0 1 1h5 M4.017 11.512a6 6 0 1 0 8.466 8.475 M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z","file-check":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m9 15 2 2 4-4","file-check2":"M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6 M14 2v5a1 1 0 0 0 1 1h5 m14 20 2 2 4-4","file-check-corner":"M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6 M14 2v5a1 1 0 0 0 1 1h5 m14 20 2 2 4-4","file-clock":"M16 22h2a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v2.85 M14 2v5a1 1 0 0 0 1 1h5 M8 14v2.2l1.6 1 M 2,16 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","file-code":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 12.5 8 15l2 2.5 m14 12.5 2 2.5-2 2.5","file-code2":"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35 M14 2v5a1 1 0 0 0 1 1h5 m5 16-3 3 3 3 m9 22 3-3-3-3","file-code-corner":"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35 M14 2v5a1 1 0 0 0 1 1h5 m5 16-3 3 3 3 m9 22 3-3-3-3","file-cog":"M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8z M20 8v12a2 2 0 0 1-2 2h-4.182 m3.305 19.53.923-.382 M4 10.592V4a2 2 0 0 1 2-2h8 m4.228 16.852-.924-.383 m5.852 15.228-.383-.923 m5.852 20.772-.383.924 m8.148 15.228.383-.923 m8.53 21.696-.382-.924 m9.773 16.852.922-.383 m9.773 19.148.922.383 M 4,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-cog2":"M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8z M20 8v12a2 2 0 0 1-2 2h-4.182 m3.305 19.53.923-.382 M4 10.592V4a2 2 0 0 1 2-2h8 m4.228 16.852-.924-.383 m5.852 15.228-.383-.923 m5.852 20.772-.383.924 m8.148 15.228.383-.923 m8.53 21.696-.382-.924 m9.773 16.852.922-.383 m9.773 19.148.922.383 M 4,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-diff":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M9 10h6 M12 13V7 M9 17h6","file-digit":"M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2 M14 2v5a1 1 0 0 0 1 1h5 M10 16h2v6 M10 22h4 M 4,16 h 0 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h 0 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z","file-down":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M12 18v-6 m9 15 3 3 3-3","file-edit":"M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34 M14 2v5a1 1 0 0 0 1 1h5 M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z","file-exclamation-point":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M12 9v4 M12 17h.01","file-headphone":"M4 6.835V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-.343 M14 2v5a1 1 0 0 0 1 1h5 M2 19a2 2 0 0 1 4 0v1a2 2 0 0 1-4 0v-4a6 6 0 0 1 12 0v4a2 2 0 0 1-4 0v-1a2 2 0 0 1 4 0","file-heart":"M13 22h5a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v7 M14 2v5a1 1 0 0 0 1 1h5 M3.62 18.8A2.25 2.25 0 1 1 7 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a1 1 0 0 1-1.507 0z","file-image":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M 8,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22","file-input":"M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1 M14 2v5a1 1 0 0 0 1 1h5 M2 15h10 m9 18 3-3-3-3","file-json":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1 M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1","file-json2":"M14 22h4a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6 M14 2v5a1 1 0 0 0 1 1h5 M5 14a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1 1 1 0 0 1 1 1v2a1 1 0 0 0 1 1 M9 22a1 1 0 0 0 1-1v-2a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1","file-key":"M14 2v5a1 1 0 0 0 1 1h5 M4 12v6 M4 14h2 M9.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v4 M 2,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","file-key2":"M14 2v5a1 1 0 0 0 1 1h5 M4 12v6 M4 14h2 M9.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v4 M 2,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","file-line-chart":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m16 13-3.5 3.5-2-2L8 17","file-lock":"M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3 M14 2v5a1 1 0 0 0 1 1h5 M9 17v-2a2 2 0 0 0-4 0v2 M 4,17 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","file-lock2":"M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3 M14 2v5a1 1 0 0 0 1 1h5 M9 17v-2a2 2 0 0 0-4 0v2 M 4,17 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","file-minus":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M9 15h6","file-minus2":"M20 14V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12 M14 2v5a1 1 0 0 0 1 1h5 M14 18h6","file-minus-corner":"M20 14V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12 M14 2v5a1 1 0 0 0 1 1h5 M14 18h6","file-music":"M11.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v10.35 M14 2v5a1 1 0 0 0 1 1h5 M8 20v-7l3 1.474 M 4,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","file-output":"M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127 M14 2v5a1 1 0 0 0 1 1h5 m5 11-3 3 m5 17-3-3h10","file-pen":"M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34 M14 2v5a1 1 0 0 0 1 1h5 M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z","file-pen-line":"M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z M14.487 7.858A1 1 0 0 1 14 7V2 M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516 M8 18h1","file-pie-chart":"M15.941 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.512 M14 2v5a1 1 0 0 0 1 1h5 M4.017 11.512a6 6 0 1 0 8.466 8.475 M9 16a1 1 0 0 1-1-1v-4c0-.552.45-1.008.995-.917a6 6 0 0 1 4.922 4.922c.091.544-.365.995-.917.995z","file-play":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z","file-plus":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M9 15h6 M12 18v-6","file-plus2":"M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35 M14 2v5a1 1 0 0 0 1 1h5 M14 19h6 M17 16v6","file-plus-corner":"M11.35 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5.35 M14 2v5a1 1 0 0 0 1 1h5 M14 19h6 M17 16v6","file-question":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M12 17h.01 M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3","file-question-mark":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M12 17h.01 M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3","file-scan":"M20 10V8a2.4 2.4 0 0 0-.706-1.704l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4.35 M14 2v5a1 1 0 0 0 1 1h5 M16 14a2 2 0 0 0-2 2 M16 22a2 2 0 0 1-2-2 M20 14a2 2 0 0 1 2 2 M20 22a2 2 0 0 0 2-2","file-search":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M 9,14.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0 M13.3 16.3 15 18","file-search2":"M11.1 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.589 3.588A2.4 2.4 0 0 1 20 8v3.25 M14 2v5a1 1 0 0 0 1 1h5 m21 22-2.88-2.88 M 13,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-search-corner":"M11.1 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.589 3.588A2.4 2.4 0 0 1 20 8v3.25 M14 2v5a1 1 0 0 0 1 1h5 m21 22-2.88-2.88 M 13,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-signal":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 15h.01 M11.5 13.5a2.5 2.5 0 0 1 0 3 M15 12a5 5 0 0 1 0 6","file-signature":"M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z M14.487 7.858A1 1 0 0 1 14 7V2 M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516 M8 18h1","file-sliders":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 12h8 M10 11v2 M8 17h8 M14 16v2","file-spreadsheet":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 13h2 M14 13h2 M8 17h2 M14 17h2","file-stack":"M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1 M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1 M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z","file-symlink":"M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7 M14 2v5a1 1 0 0 0 1 1h5 m10 18 3-3-3-3","file-terminal":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m8 16 2-2-2-2 M12 18h4","file-text":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 9H8 M16 13H8 M16 17H8","file-type":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M11 18h2 M12 12v6 M9 13v-.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v.5","file-type2":"M12 22h6a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6 M14 2v5a1 1 0 0 0 1 1h5 M3 16v-1.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V16 M6 22h2 M7 14v8","file-type-corner":"M12 22h6a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v6 M14 2v5a1 1 0 0 0 1 1h5 M3 16v-1.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V16 M6 22h2 M7 14v8","file-up":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M12 12v6 m15 15-3-3-3 3","file-user":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M16 22a4 4 0 0 0-8 0 M 9,15 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","file-video":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M15.033 13.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56v-4.704a.645.645 0 0 1 .967-.56z","file-video2":"M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2 M14 2v5a1 1 0 0 0 1 1h5 m10 17.843 3.033-1.755a.64.64 0 0 1 .967.56v4.704a.65.65 0 0 1-.967.56L10 20.157 M 4,16 h 5 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","file-video-camera":"M4 12V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2 M14 2v5a1 1 0 0 0 1 1h5 m10 17.843 3.033-1.755a.64.64 0 0 1 .967.56v4.704a.65.65 0 0 1-.967.56L10 20.157 M 4,16 h 5 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","file-volume":"M4 11.55V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-1.95 M14 2v5a1 1 0 0 0 1 1h5 M12 15a5 5 0 0 1 0 6 M8 14.502a.5.5 0 0 0-.826-.381l-1.893 1.631a1 1 0 0 1-.651.243H3.5a.5.5 0 0 0-.5.501v3.006a.5.5 0 0 0 .5.501h1.129a1 1 0 0 1 .652.243l1.893 1.633a.5.5 0 0 0 .826-.38z","file-volume2":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M8 15h.01 M11.5 13.5a2.5 2.5 0 0 1 0 3 M15 12a5 5 0 0 1 0 6","file-warning":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M12 9v4 M12 17h.01","file-x":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 m14.5 12.5-5 5 m9.5 12.5 5 5","file-x2":"M11 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5 M14 2v5a1 1 0 0 0 1 1h5 m15 17 5 5 m20 17-5 5","file-xcorner":"M11 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5 M14 2v5a1 1 0 0 0 1 1h5 m15 17 5 5 m20 17-5 5","files":"M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8 M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1","film":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 3v18 M3 7.5h4 M3 12h18 M3 16.5h4 M17 3v18 M17 7.5h4 M17 16.5h4","filter":"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z","filter-x":"M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473 m16.5 3.5 5 5 m21.5 3.5-5 5","fingerprint":"M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4 M14 13.12c0 2.38 0 6.38-1 8.88 M17.29 21.02c.12-.6.43-2.3.5-3.02 M2 12a10 10 0 0 1 18-6 M2 16h.01 M21.8 16c.2-2 .131-5.354 0-6 M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2 M8.65 22c.21-.66.45-1.32.57-2 M9 6.8a6 6 0 0 1 9 5.2v2","fingerprint-pattern":"M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4 M14 13.12c0 2.38 0 6.38-1 8.88 M17.29 21.02c.12-.6.43-2.3.5-3.02 M2 12a10 10 0 0 1 18-6 M2 16h.01 M21.8 16c.2-2 .131-5.354 0-6 M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2 M8.65 22c.21-.66.45-1.32.57-2 M9 6.8a6 6 0 0 1 9 5.2v2","fire-extinguisher":"M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5 M9 18h8 M18 3h-3 M11 3a6 6 0 0 0-6 6v11 M5 13h4 M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z","fish":"M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z M18 12v.5 M16 17.93a9.77 9.77 0 0 1 0-11.86 M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33 M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4 m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98","fish-off":"M18 12.47v.03m0-.5v.47m-.475 5.056A6.744 6.744 0 0 1 15 18c-3.56 0-7.56-2.53-8.5-6 .348-1.28 1.114-2.433 2.121-3.38m3.444-2.088A8.802 8.802 0 0 1 15 6c3.56 0 6.06 2.54 7 6-.309 1.14-.786 2.177-1.413 3.058 M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33m7.48-4.372A9.77 9.77 0 0 1 16 6.07m0 11.86a9.77 9.77 0 0 1-1.728-3.618 m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98M8.53 3h5.27a2 2 0 0 1 1.98 1.67l.23 1.4M2 2l20 20","fish-symbol":"M2 16s9-15 20-4C11 23 2 8 2 8","fishing-hook":"m17.586 11.414-5.93 5.93a1 1 0 0 1-8-8l3.137-3.137a.707.707 0 0 1 1.207.5V10 M20.414 8.586 22 7 M 17,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","fishing-rod":"M4 11h1 M8 15a2 2 0 0 1-4 0V3a1 1 0 0 1 1-1h.5C14 2 20 9 20 18v4 M 16,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","flag":"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528","flag-off":"M16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528 m2 2 20 20 M4 22V4 M7.656 2H8c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10.347","flag-triangle-left":"M18 22V2.8a.8.8 0 0 0-1.17-.71L5.45 7.78a.8.8 0 0 0 0 1.44L18 15.5","flag-triangle-right":"M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5","flame":"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4","flame-kindling":"M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 1 1-10 0c0-.3 0-.6.1-.9a2 2 0 1 0 3.3-2C8 4.5 11 2 12 2Z m5 22 14-4 m5 18 14 4","flashlight":"M12 13v1 M17 2a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8A4 4 0 0 0 16 12v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V3a1 1 0 0 1 1-1z M6 6h12","flashlight-off":"M11.652 6H18 M12 13v1 M16 16v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 0-.8-2.4l-.6-.8A3 3 0 0 1 6 7V6 m2 2 20 20 M7.649 2H17a1 1 0 0 1 1 1v4a3 3 0 0 1-.6 1.8l-.6.8a4 4 0 0 0-.55 1.007","flask-conical":"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2 M6.453 15h11.094 M8.5 2h7","flask-conical-off":"M10 2v2.343 M14 2v6.343 m2 2 20 20 M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-1.755-2.96l5.227-9.563 M6.453 15H15 M8.5 2h7","flask-round":"M10 2v6.292a7 7 0 1 0 4 0V2 M5 15h14 M8.5 2h7","flip-horizontal":"M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3 M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3 M12 20v2 M12 14v2 M12 8v2 M12 2v2","flip-horizontal2":"m3 7 5 5-5 5V7 m21 7-5 5 5 5V7 M12 20v2 M12 14v2 M12 8v2 M12 2v2","flip-vertical":"M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3 M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3 M4 12H2 M10 12H8 M16 12h-2 M22 12h-2","flip-vertical2":"m17 3-5 5-5-5h10 m17 21-5-5-5 5h10 M4 12H2 M10 12H8 M16 12h-2 M22 12h-2","flower":"M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5 M12 7.5V9 M7.5 12H9 M16.5 12H15 M12 16.5V15 m8 8 1.88 1.88 M14.12 9.88 16 8 m8 16 1.88-1.88 M14.12 14.12 16 16","flower2":"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1 M 10,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M12 10v12 M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z","focus":"M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2","fold-horizontal":"M2 12h6 M22 12h-6 M12 2v2 M12 8v2 M12 14v2 M12 20v2 m19 9-3 3 3 3 m5 15 3-3-3-3","fold-vertical":"M12 22v-6 M12 8V2 M4 12H2 M10 12H8 M16 12h-2 M22 12h-2 m15 19-3-3-3 3 m15 5-3 3-3-3","folder":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z","folder-archive":"M 13,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M20.9 19.8A2 2 0 0 0 22 18V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.1 M15 11v-1 M15 17v-2","folder-check":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z m9 13 2 2 4-4","folder-clock":"M16 14v2.2l1.6 1 M7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2 M 10,16 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","folder-closed":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z M2 10h20","folder-code":"M10 10.5 8 13l2 2.5 m14 10.5 2 2.5-2 2.5 M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z","folder-cog":"M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3 m14.305 19.53.923-.382 m15.228 16.852-.923-.383 m16.852 15.228-.383-.923 m16.852 20.772-.383.924 m19.148 15.228.383-.923 m19.53 21.696-.382-.924 m20.772 16.852.924-.383 m20.772 19.148.924.383 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","folder-cog2":"M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3 m14.305 19.53.923-.382 m15.228 16.852-.923-.383 m16.852 15.228-.383-.923 m16.852 20.772-.383.924 m19.148 15.228.383-.923 m19.53 21.696-.382-.924 m20.772 16.852.924-.383 m20.772 19.148.924.383 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","folder-dot":"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z M 11,13 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","folder-down":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z M12 10v6 m15 13-3 3-3-3","folder-edit":"M2 11.5V5a2 2 0 0 1 2-2h3.9c.7 0 1.3.3 1.7.9l.8 1.2c.4.6 1 .9 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5 M11.378 13.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z","folder-git":"M 10,13 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z M14 13h3 M7 13h3","folder-git2":"M18 19a5 5 0 0 1-5-5v8 M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5 M 11,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 18,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","folder-heart":"M10.638 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v3.417 M14.62 18.8A2.25 2.25 0 1 1 18 15.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z","folder-input":"M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1 M2 13h10 m9 16 3-3-3-3","folder-kanban":"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z M8 10v4 M12 10v2 M16 10v6","folder-key":"M13 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v1.36 M19 12v6 M19 14h2 M 17,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","folder-lock":"M 15,17 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v2.5 M20 17v-2a2 2 0 1 0-4 0v2","folder-minus":"M9 13h6 M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z","folder-open":"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2","folder-open-dot":"m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2 M 13,15 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","folder-output":"M2 7.5V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-1.5 M2 13h10 m5 10-3 3 3 3","folder-pen":"M2 11.5V5a2 2 0 0 1 2-2h3.9c.7 0 1.3.3 1.7.9l.8 1.2c.4.6 1 .9 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-9.5 M11.378 13.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z","folder-plus":"M12 10v6 M9 13h6 M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z","folder-root":"M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z M 10,13 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M12 15v5","folder-search":"M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1 m21 21-1.9-1.9 M 14,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","folder-search2":"M 9,12.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0 M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z M13.3 14.3 15 16","folder-symlink":"M2 9.35V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7 m8 16 3-3-3-3","folder-sync":"M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5 M12 10v4h4 m12 14 1.535-1.605a5 5 0 0 1 8 1.5 M22 22v-4h-4 m22 18-1.535 1.605a5 5 0 0 1-8-1.5","folder-tree":"M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z M3 5a2 2 0 0 0 2 2h3 M3 3v13a2 2 0 0 0 2 2h3","folder-up":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z M12 10v6 m9 13 3-3 3 3","folder-x":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z m9.5 10.5 5 5 m14.5 10.5-5 5","folders":"M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1","footprints":"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z M16 17h4 M4 13h4","fork-knife":"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7","fork-knife-crossed":"m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8 M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7 m2.1 21.8 6.4-6.3 m19 5-7 7","forklift":"M12 12H5a2 2 0 0 0-2 2v5 M15 19h7 M16 19V2 M6 12V7a2 2 0 0 1 2-2h2.172a2 2 0 0 1 1.414.586l3.828 3.828A2 2 0 0 1 16 10.828 M7 19h4 M 11,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","form":"M4 14h6 M4 2h10 M 5,18 h 14 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -14 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z M 5,6 h 14 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -14 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","form-input":"M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M12 12h.01 M17 12h.01 M7 12h.01","forward":"m15 17 5-5-5-5 M4 18v-2a4 4 0 0 1 4-4h12","frame":"M 22,6 L 2,6 M 22,18 L 2,18 M 6,2 L 6,22 M 18,2 L 18,22","frown":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M16 16s-1.5-2-4-2-4 2-4 2 M 9,9 L 9.01,9 M 15,9 L 15.01,9","fuel":"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5 M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16 M2 21h13 M3 9h11","fullscreen":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M 8,8 h 8 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -8 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","function-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3 M9 11.2h5.7","funnel":"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z","funnel-plus":"M13.354 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l1.218-1.348 M16 6h6 M19 3v6","funnel-x":"M12.531 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14v6a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341l.427-.473 m16.5 3.5 5 5 m21.5 3.5-5 5","gallery-horizontal":"M2 3v18 M 8,3 h 8 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -8 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M22 3v18","gallery-horizontal-end":"M2 7v10 M6 5v14 M 12,3 h 8 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -8 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","gallery-thumbnails":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M4 21h1 M9 21h1 M14 21h1 M19 21h1","gallery-vertical":"M3 2h18 M 5,6 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M3 22h18","gallery-vertical-end":"M7 2h10 M5 6h14 M 5,10 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","gamepad":"M 6,12 L 10,12 M 8,10 L 8,14 M 15,13 L 15.01,13 M 18,11 L 18.01,11 M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","gamepad2":"M 6,11 L 10,11 M 8,9 L 8,13 M 15,12 L 15.01,12 M 18,10 L 18.01,10 M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z","gamepad-directional":"M11.146 15.854a1.207 1.207 0 0 1 1.708 0l1.56 1.56A2 2 0 0 1 15 18.828V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2.172a2 2 0 0 1 .586-1.414z M18.828 15a2 2 0 0 1-1.414-.586l-1.56-1.56a1.207 1.207 0 0 1 0-1.708l1.56-1.56A2 2 0 0 1 18.828 9H21a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1z M6.586 14.414A2 2 0 0 1 5.172 15H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2.172a2 2 0 0 1 1.414.586l1.56 1.56a1.207 1.207 0 0 1 0 1.708z M9 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2.172a2 2 0 0 1-.586 1.414l-1.56 1.56a1.207 1.207 0 0 1-1.708 0l-1.56-1.56A2 2 0 0 1 9 5.172z","gantt-chart":"M6 5h12 M4 12h10 M12 19h8","gantt-chart-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 8h7 M8 12h6 M11 16h5","gauge":"m12 14 4-4 M3.34 19a10 10 0 1 1 17.32 0","gauge-circle":"M15.6 2.7a10 10 0 1 0 5.7 5.7 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M13.4 10.6 19 5","gavel":"m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381 m16 16 6-6 m21.5 10.5-8-8 m8 8 6-6 m8.5 7.5 8 8","gem":"M10.5 3 8 9l4 13 4-13-2.5-6 M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z M2 9h20","georgian-lari":"M11.5 21a7.5 7.5 0 1 1 7.35-9 M13 12V3 M4 21h16 M9 12V3","ghost":"M9 10h.01 M15 10h.01 M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z","gift":"M12 7v14 M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8 M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5 M 4,7 h 16 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -16 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","git-branch":"M15 6a9 9 0 0 0-9 9V3 M 15,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","git-branch-minus":"M15 6a9 9 0 0 0-9 9V3 M21 18h-6 M 15,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","git-branch-plus":"M6 3v12 M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M15 6a9 9 0 0 0-9 9 M18 15v6 M21 18h-6","git-commit":"M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,12 L 9,12 M 15,12 L 21,12","git-commit-horizontal":"M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,12 L 9,12 M 15,12 L 21,12","git-commit-vertical":"M12 3v6 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M12 15v6","git-compare":"M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M13 6h3a2 2 0 0 1 2 2v7 M11 18H8a2 2 0 0 1-2-2V9","git-compare-arrows":"M 2,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M12 6h5a2 2 0 0 1 2 2v7 m15 9-3-3 3-3 M 16,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M12 18H7a2 2 0 0 1-2-2V9 m9 15 3 3-3 3","git-fork":"M 9,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 15,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9 M12 12v3","git-graph":"M 2,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M5 9v6 M 2,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M12 3v18 M 16,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M16 15.7A9 9 0 0 0 19 9","git-merge":"M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M6 21V9a9 9 0 0 0 9 9","git-merge-conflict":"M12 6h4a2 2 0 0 1 2 2v7 M6 12v9 M9 3 3 9 M9 9 3 3 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","git-pull-request":"M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M13 6h3a2 2 0 0 1 2 2v7 M 6,9 L 6,21","git-pull-request-arrow":"M 2,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M5 9v12 M 16,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m15 9-3-3 3-3 M12 6h5a2 2 0 0 1 2 2v7","git-pull-request-closed":"M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M6 9v12 m21 3-6 6 m21 9-6-6 M18 11.5V15 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","git-pull-request-create":"M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M6 9v12 M13 6h3a2 2 0 0 1 2 2v3 M18 15v6 M21 18h-6","git-pull-request-create-arrow":"M 2,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M5 9v12 m15 9-3-3 3-3 M12 6h5a2 2 0 0 1 2 2v3 M19 15v6 M22 18h-6","git-pull-request-draft":"M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M18 6V5 M18 11v-1 M 6,9 L 6,21","glass-water":"M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0","glasses":"M 2,15 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 14,15 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2 M2.5 13 5 7c.7-1.3 1.4-2 3-2 M21.5 13 19 7c-.7-1.3-1.5-2-3-2","globe":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20","globe2":"M21.54 15H17a2 2 0 0 0-2 2v4.54 M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17 M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05 M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","globe-lock":"M15.686 15A14.5 14.5 0 0 1 12 22a14.5 14.5 0 0 1 0-20 10 10 0 1 0 9.542 13 M2 12h8.5 M20 6V4a2 2 0 1 0-4 0v2 M 15,6 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","globe-off":"M10.114 4.462A14.5 14.5 0 0 1 12 2a10 10 0 0 1 9.313 13.643 M15.557 15.556A14.5 14.5 0 0 1 12 22 10 10 0 0 1 4.929 4.929 M15.892 10.234A14.5 14.5 0 0 0 12 2a10 10 0 0 0-3.643.687 M17.656 12H22 M19.071 19.071A10 10 0 0 1 12 22 14.5 14.5 0 0 1 8.44 8.45 M2 12h10 m2 2 20 20","globe-x":"m16 3 5 5 M2 12h20A10 10 0 1 1 12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 4-10 m21 3-5 5","goal":"M12 13V2l8 4-8 4 M20.561 10.222a9 9 0 1 1-12.55-5.29 M8.002 9.997a5 5 0 1 0 8.9 2.02","gpu":"M2 17h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H2 M2 21V3 M7 17v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-3 M 14,11 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 6,11 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","grab":"M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4 M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2 M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5 M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0","graduation-cap":"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z M22 10v6 M6 12.5V16a6 3 0 0 0 12 0v-3.5","grape":"M22 5V2l-5.89 5.89 M 13.600000000000001,15.89 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 5.109999999999999,7.4 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 9.35,11.65 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 10.91,5.85 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 15.149999999999999,10.09 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3.5599999999999996,13.2 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 7.800000000000001,17.44 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 2,19 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","grid":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 M3 15h18 M9 3v18 M15 3v18","grid2-x2":"M12 3v18 M3 12h18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","grid2-x2-check":"M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3 m16 19 2 2 4-4","grid2-x2-plus":"M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3 M16 19h6 M19 22v-6","grid2-x2-x":"M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3 m16 16 5 5 m16 21 5-5","grid2x2":"M12 3v18 M3 12h18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","grid2x2-check":"M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3 m16 19 2 2 4-4","grid2x2-plus":"M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3 M16 19h6 M19 22v-6","grid2x2-x":"M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3 m16 16 5 5 m16 21 5-5","grid3-x3":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 M3 15h18 M9 3v18 M15 3v18","grid3x2":"M15 3v18 M3 12h18 M9 3v18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","grid3x3":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 M3 15h18 M9 3v18 M15 3v18","grip":"M 11,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","grip-horizontal":"M 11,9 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,9 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,9 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,15 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,15 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,15 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","grip-vertical":"M 8,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 8,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 8,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 14,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 14,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 14,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","group":"M3 7V5c0-1.1.9-2 2-2h2 M17 3h2c1.1 0 2 .9 2 2v2 M21 17v2c0 1.1-.9 2-2 2h-2 M7 21H5c-1.1 0-2-.9-2-2v-2 M 8,7 h 5 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 11,12 h 5 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","guitar":"m11.9 12.1 4.514-4.514 M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z m6 16 2 2 M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z","ham":"M13.144 21.144A7.274 10.445 45 1 0 2.856 10.856 M13.144 21.144A7.274 4.365 45 0 0 2.856 10.856a7.274 4.365 45 0 0 10.288 10.288 M16.565 10.435 18.6 8.4a2.501 2.501 0 1 0 1.65-4.65 2.5 2.5 0 1 0-4.66 1.66l-2.024 2.025 m8.5 16.5-1-1","hamburger":"M12 16H4a2 2 0 1 1 0-4h16a2 2 0 1 1 0 4h-4.25 M5 12a2 2 0 0 1-2-2 9 7 0 0 1 18 0 2 2 0 0 1-2 2 M5 16a2 2 0 0 0-2 2 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 2 2 0 0 0-2-2q0 0 0 0 m6.67 12 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2","hammer":"m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9 m18 15 4-4 m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5","hand":"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2 M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15","hand-coins":"M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17 m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9 m2 16 6 6 M 13.1,9 a 2.9,2.9 0 1,0 5.8,0 a 2.9,2.9 0 1,0 -5.8,0 M 3,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","hand-fist":"M12.035 17.012a3 3 0 0 0-3-3l-.311-.002a.72.72 0 0 1-.505-1.229l1.195-1.195A2 2 0 0 1 10.828 11H12a2 2 0 0 0 0-4H9.243a3 3 0 0 0-2.122.879l-2.707 2.707A4.83 4.83 0 0 0 3 14a8 8 0 0 0 8 8h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v2a2 2 0 1 0 4 0 M13.888 9.662A2 2 0 0 0 17 8V5A2 2 0 1 0 13 5 M9 5A2 2 0 1 0 5 5V10 M9 7V4A2 2 0 1 1 13 4V7.268","hand-grab":"M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4 M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2 M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v5 M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8 2 2 0 1 1 4 0","hand-heart":"M11 14h2a2 2 0 0 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16 m14.45 13.39 5.05-4.694C20.196 8 21 6.85 21 5.75a2.75 2.75 0 0 0-4.797-1.837.276.276 0 0 1-.406 0A2.75 2.75 0 0 0 11 5.75c0 1.2.802 2.248 1.5 2.946L16 11.95 m2 15 6 6 m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a1 1 0 0 0-2.75-2.91","hand-helping":"M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14 m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9 m2 13 6 6","hand-metal":"M18 12.5V10a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4 M14 11V9a2 2 0 1 0-4 0v2 M10 10.5V5a2 2 0 1 0-4 0v9 m7 15-1.76-1.76a2 2 0 0 0-2.83 2.82l3.6 3.6C7.5 21.14 9.2 22 12 22h2a8 8 0 0 0 8-8V7a2 2 0 1 0-4 0v5","hand-platter":"M12 3V2 m15.4 17.4 3.2-2.8a2 2 0 1 1 2.8 2.9l-3.6 3.3c-.7.8-1.7 1.2-2.8 1.2h-4c-1.1 0-2.1-.4-2.8-1.2l-1.302-1.464A1 1 0 0 0 6.151 19H5 M2 14h12a2 2 0 0 1 0 4h-2 M4 10h16 M5 10a7 7 0 0 1 14 0 M5 14v6a1 1 0 0 1-1 1H2","handbag":"M2.048 18.566A2 2 0 0 0 4 21h16a2 2 0 0 0 1.952-2.434l-2-9A2 2 0 0 0 18 8H6a2 2 0 0 0-1.952 1.566z M8 11V6a4 4 0 0 1 8 0v5","handshake":"m11 17 2 2a1 1 0 1 0 3-3 m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4 m21 3 1 11h-2 M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3 M3 4h8","hard-drive":"M10 16h.01 M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z M21.946 12.013H2.054 M6 16h.01","hard-drive-download":"M12 2v8 m16 6-4 4-4-4 M 4,14 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M6 18h.01 M10 18h.01","hard-drive-upload":"m16 6-4-4-4 4 M12 2v8 M 4,14 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M6 18h.01 M10 18h.01","hard-hat":"M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M14 6a6 6 0 0 1 6 6v3 M4 15v-3a6 6 0 0 1 6-6 M 3,15 h 18 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -18 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","hash":"M 4,9 L 20,9 M 4,15 L 20,15 M 10,3 L 8,21 M 16,3 L 14,21","hat-glasses":"M14 18a2 2 0 0 0-4 0 m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11 M2 11h20 M 14,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 4,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","haze":"m5.2 6.2 1.4 1.4 M2 13h2 M20 13h2 m17.4 7.6 1.4-1.4 M22 17H2 M22 21H2 M16 13a4 4 0 0 0-8 0 M12 5V2.5","hd":"M10 12H6 M10 15V9 M14 14.5a.5.5 0 0 0 .5.5h1a2.5 2.5 0 0 0 2.5-2.5v-1A2.5 2.5 0 0 0 15.5 9h-1a.5.5 0 0 0-.5.5z M6 15V9 M 4,5 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","hdmi-port":"M22 9a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1l2 2h12l2-2h1a1 1 0 0 0 1-1Z M7.5 12h9","heading":"M6 12h12 M6 20V4 M18 20V4","heading1":"M4 12h8 M4 18V6 M12 18V6 m17 12 3-2v8","heading2":"M4 12h8 M4 18V6 M12 18V6 M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1","heading3":"M4 12h8 M4 18V6 M12 18V6 M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2 M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2","heading4":"M12 18V6 M17 10v3a1 1 0 0 0 1 1h3 M21 10v8 M4 12h8 M4 18V6","heading5":"M4 12h8 M4 18V6 M12 18V6 M17 13v-3h4 M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17","heading6":"M4 12h8 M4 18V6 M12 18V6 M 17,16 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M20 10c-2 2-3 3.5-3 6","headphone-off":"M21 14h-1.343 M9.128 3.47A9 9 0 0 1 21 12v3.343 m2 2 20 20 M20.414 20.414A2 2 0 0 1 19 21h-1a2 2 0 0 1-2-2v-3 M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.636-6.364","headphones":"M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3","headset":"M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z M21 16v2a4 4 0 0 1-4 4h-5","heart":"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5","heart-crack":"M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15 M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z","heart-handshake":"M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762","heart-minus":"m14.876 18.99-1.368 1.323a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5a5.2 5.2 0 0 1-.244 1.572 M15 15h6","heart-off":"M10.5 4.893a5.5 5.5 0 0 1 1.091.931.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 1.872-1.002 3.356-2.187 4.655 m16.967 16.967-3.459 3.346a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 2.747-4.761 m2 2 20 20","heart-plus":"m14.479 19.374-.971.939a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5a5.2 5.2 0 0 1-.219 1.49 M15 15h6 M18 12v6","heart-pulse":"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5 M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27","heater":"M11 8c2-3-2-3 0-6 M15.5 8c2-3-2-3 0-6 M6 10h.01 M6 14h.01 M10 16v-4 M14 16v-4 M18 16v-4 M20 6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3 M5 20v2 M19 20v2","helicopter":"M11 17v4 M14 3v8a2 2 0 0 0 2 2h5.865 M17 17v4 M18 17a4 4 0 0 0 4-4 8 6 0 0 0-8-6 6 5 0 0 0-6 5v3a2 2 0 0 0 2 2z M2 10v5 M6 3h16 M7 21h14 M8 13H2","help-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01","helping-hand":"M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14 m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9 m2 13 6 6","hexagon":"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z","highlighter":"m9 11-6 6v3h9l3-3 m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4","history":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2","home":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","hop":"M10.82 16.12c1.69.6 3.91.79 5.18.85.55.03 1-.42.97-.97-.06-1.27-.26-3.5-.85-5.18 M11.5 6.5c1.64 0 5-.38 6.71-1.07.52-.2.55-.82.12-1.17A10 10 0 0 0 4.26 18.33c.35.43.96.4 1.17-.12.69-1.71 1.07-5.07 1.07-6.71 1.34.45 3.1.9 4.88.62a.88.88 0 0 0 .73-.74c.3-2.14-.15-3.5-.61-4.88 M15.62 16.95c.2.85.62 2.76.5 4.28a.77.77 0 0 1-.9.7 16.64 16.64 0 0 1-4.08-1.36 M16.13 21.05c1.65.63 3.68.84 4.87.91a.9.9 0 0 0 .96-.96 17.68 17.68 0 0 0-.9-4.87 M16.94 15.62c.86.2 2.77.62 4.29.5a.77.77 0 0 0 .7-.9 16.64 16.64 0 0 0-1.36-4.08 M17.99 5.52a20.82 20.82 0 0 1 3.15 4.5.8.8 0 0 1-.68 1.13c-2.33.2-5.3-.32-8.27-1.57 M4.93 4.93 3 3a.7.7 0 0 1 0-1 M9.58 12.18c1.24 2.98 1.77 5.95 1.57 8.28a.8.8 0 0 1-1.13.68 20.82 20.82 0 0 1-4.5-3.15","hop-off":"M10.82 16.12c1.69.6 3.91.79 5.18.85.28.01.53-.09.7-.27 M11.14 20.57c.52.24 2.44 1.12 4.08 1.37.46.06.86-.25.9-.71.12-1.52-.3-3.43-.5-4.28 M16.13 21.05c1.65.63 3.68.84 4.87.91a.9.9 0 0 0 .7-.26 M17.99 5.52a20.83 20.83 0 0 1 3.15 4.5.8.8 0 0 1-.68 1.13c-1.17.1-2.5.02-3.9-.25 M20.57 11.14c.24.52 1.12 2.44 1.37 4.08.04.3-.08.59-.31.75 M4.93 4.93a10 10 0 0 0-.67 13.4c.35.43.96.4 1.17-.12.69-1.71 1.07-5.07 1.07-6.71 1.34.45 3.1.9 4.88.62a.85.85 0 0 0 .48-.24 M5.52 17.99c1.05.95 2.91 2.42 4.5 3.15a.8.8 0 0 0 1.13-.68c.2-2.34-.33-5.3-1.57-8.28 M8.35 2.68a10 10 0 0 1 9.98 1.58c.43.35.4.96-.12 1.17-1.5.6-4.3.98-6.07 1.05 m2 2 20 20","hospital":"M12 7v4 M14 21v-3a2 2 0 0 0-4 0v3 M14 9h-4 M18 11h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2 M18 21V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16","hotel":"M10 22v-6.57 M12 11h.01 M12 7h.01 M14 15.43V22 M15 16a5 5 0 0 0-6 0 M16 11h.01 M16 7h.01 M8 11h.01 M8 7h.01 M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z","hourglass":"M5 22h14 M5 2h14 M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22 M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2","house":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","house-heart":"M8.62 13.8A2.25 2.25 0 1 1 12 10.836a2.25 2.25 0 1 1 3.38 2.966l-2.626 2.856a.998.998 0 0 1-1.507 0z M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","house-plug":"M10 12V8.964 M14 12V8.964 M15 12a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2a1 1 0 0 1 1-1z M8.5 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-2","house-plus":"M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35 M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8 M15 18h6 M18 15v6","house-wifi":"M9.5 13.866a4 4 0 0 1 5 .01 M12 17h.01 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M7 10.754a8 8 0 0 1 10 0","ice-cream":"m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11 M17 7A5 5 0 0 0 7 7 M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4","ice-cream2":"M12 17c5 0 8-2.69 8-6H4c0 3.31 3 6 8 6m-4 4h8m-4-3v3M5.14 11a3.5 3.5 0 1 1 6.71 0 M12.14 11a3.5 3.5 0 1 1 6.71 0 M15.5 6.5a3.5 3.5 0 1 0-7 0","ice-cream-bowl":"M12 17c5 0 8-2.69 8-6H4c0 3.31 3 6 8 6m-4 4h8m-4-3v3M5.14 11a3.5 3.5 0 1 1 6.71 0 M12.14 11a3.5 3.5 0 1 1 6.71 0 M15.5 6.5a3.5 3.5 0 1 0-7 0","ice-cream-cone":"m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11 M17 7A5 5 0 0 0 7 7 M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4","id-card":"M16 10h2 M16 14h2 M6.17 15a3 3 0 0 1 5.66 0 M 7,11 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 4,5 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","id-card-lanyard":"M13.5 8h-3 m15 2-1 2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3 M16.899 22A5 5 0 0 0 7.1 22 m9 2 3 6 M 9,15 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","image":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21","image-down":"M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21 m14 19 3 3v-5.5 m17 22 3-3 M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","image-minus":"M21 9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7 M 16,5 L 22,5 M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21","image-off":"M 2,2 L 22,22 M10.41 10.41a2 2 0 1 1-2.83-2.83 M 13.5,13.5 L 6,21 M 18,12 L 21,15 M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59 M21 15V5a2 2 0 0 0-2-2H9","image-play":"M15 15.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z M21 12.17V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6 m6 21 5-5 M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","image-plus":"M16 5h6 M19 2v6 M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5 m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21 M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","image-up":"M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21 m14 19.5 3-3 3 3 M17 22v-5.5 M 7,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","image-upscale":"M16 3h5v5 M17 21h2a2 2 0 0 0 2-2 M21 12v3 m21 3-5 5 M3 7V5a2 2 0 0 1 2-2 m5 21 4.144-4.144a1.21 1.21 0 0 1 1.712 0L13 19 M9 3h3 M 4,11 h 8 a 1,1 0 0,1 1,1 v 8 a 1,1 0 0,1 -1,1 h -8 a 1,1 0 0,1 -1,-1 v -8 a 1,1 0 0,1 1,-1 Z","images":"m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16 M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2 M 12,7 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 10,2 h 10 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","import":"M12 3v12 m8 11 4 4 4-4 M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4","inbox":"M 22 12 16 12 14 15 10 15 8 12 2 12,undefined M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z","indent":"M21 5H11 M21 12H11 M21 19H11 m3 8 4 4-4 4","indent-decrease":"M21 5H11 M21 12H11 M21 19H11 m7 8-4 4 4 4","indent-increase":"M21 5H11 M21 12H11 M21 19H11 m3 8 4 4-4 4","indian-rupee":"M6 3h12 M6 8h12 m6 13 8.5 8 M6 13h3 M9 13c6.667 0 6.667-10 0-10","infinity":"M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8","info":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 16v-4 M12 8h.01","inspect":"M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6","inspection-panel":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 7h.01 M17 7h.01 M7 17h.01 M17 17h.01","italic":"M 19,4 L 10,4 M 14,20 L 5,20 M 15,4 L 9,20","iteration-ccw":"m16 14 4 4-4 4 M20 10a8 8 0 1 0-8 8h8","iteration-cw":"M4 10a8 8 0 1 1 8 8H4 m8 22-4-4 4-4","japanese-yen":"M12 9.5V21m0-11.5L6 3m6 6.5L18 3 M6 15h12 M6 11h12","joystick":"M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2Z M6 15v-2 M12 15V9 M 9,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","kanban":"M5 3v14 M12 3v8 M19 3v18","kanban-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 7v7 M12 7v4 M16 7v9","kanban-square-dashed":"M8 7v7 M12 7v4 M16 7v9 M5 3a2 2 0 0 0-2 2 M9 3h1 M14 3h1 M19 3a2 2 0 0 1 2 2 M21 9v1 M21 14v1 M21 19a2 2 0 0 1-2 2 M14 21h1 M9 21h1 M5 21a2 2 0 0 1-2-2 M3 14v1 M3 9v1","kayak":"M18 17a1 1 0 0 0-1 1v1a2 2 0 1 0 2-2z M20.97 3.61a.45.45 0 0 0-.58-.58C10.2 6.6 6.6 10.2 3.03 20.39a.45.45 0 0 0 .58.58C13.8 17.4 17.4 13.8 20.97 3.61 m6.707 6.707 10.586 10.586 M7 5a2 2 0 1 0-2 2h1a1 1 0 0 0 1-1z","key":"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4 m21 2-9.6 9.6 M 2,15.5 a 5.5,5.5 0 1,0 11,0 a 5.5,5.5 0 1,0 -11,0","key-round":"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z M 16,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0","key-square":"M12.4 2.7a2.5 2.5 0 0 1 3.4 0l5.5 5.5a2.5 2.5 0 0 1 0 3.4l-3.7 3.7a2.5 2.5 0 0 1-3.4 0L8.7 9.8a2.5 2.5 0 0 1 0-3.4z m14 7 3 3 m9.4 10.6-6.814 6.814A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814","keyboard":"M10 8h.01 M12 12h.01 M14 8h.01 M16 12h.01 M18 8h.01 M6 8h.01 M7 16h10 M8 12h.01 M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z","keyboard-music":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M6 8h4 M14 8h.01 M18 8h.01 M2 12h20 M6 12v4 M10 12v4 M14 12v4 M18 12v4","keyboard-off":"M 20 4 A2 2 0 0 1 22 6 M 22 6 L 22 16.41 M 7 16 L 16 16 M 9.69 4 L 20 4 M14 8h.01 M18 8h.01 m2 2 20 20 M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M6 8h.01 M8 12h.01","lamp":"M12 12v6 M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23Z M8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z","lamp-ceiling":"M12 2v5 M14.829 15.998a3 3 0 1 1-5.658 0 M20.92 14.606A1 1 0 0 1 20 16H4a1 1 0 0 1-.92-1.394l3-7A1 1 0 0 1 7 7h10a1 1 0 0 1 .92.606z","lamp-desk":"M10.293 2.293a1 1 0 0 1 1.414 0l2.5 2.5 5.994 1.227a1 1 0 0 1 .506 1.687l-7 7a1 1 0 0 1-1.687-.506l-1.227-5.994-2.5-2.5a1 1 0 0 1 0-1.414z m14.207 4.793-3.414 3.414 M3 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z m9.086 6.5-4.793 4.793a1 1 0 0 0-.18 1.17L7 18","lamp-floor":"M12 10v12 M17.929 7.629A1 1 0 0 1 17 9H7a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 9 2h6a1 1 0 0 1 .928.629z M9 22h6","lamp-wall-down":"M19.929 18.629A1 1 0 0 1 19 20H9a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 11 13h6a1 1 0 0 1 .928.629z M6 3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M8 6h4a2 2 0 0 1 2 2v5","lamp-wall-up":"M19.929 9.629A1 1 0 0 1 19 11H9a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 11 4h6a1 1 0 0 1 .928.629z M6 15a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z M8 18h4a2 2 0 0 0 2-2v-5","land-plot":"m12 8 6-3-6-3v10 m8 11.99-5.5 3.14a1 1 0 0 0 0 1.74l8.5 4.86a2 2 0 0 0 2 0l8.5-4.86a1 1 0 0 0 0-1.74L16 12 m6.49 12.85 11.02 6.3 M17.51 12.85 6.5 19.15","landmark":"M10 18v-7 M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z M14 18v-7 M18 18v-7 M3 22h18 M6 18v-7","languages":"m5 8 6 6 m4 14 6-6 2-3 M2 5h12 M7 2h1 m22 22-5-10-5 10 M14 18h6","laptop":"M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z M20.054 15.987H3.946","laptop2":"M 5,4 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M 2,20 L 22,20","laptop-minimal":"M 5,4 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M 2,20 L 22,20","laptop-minimal-check":"M2 20h20 m9 10 2 2 4-4 M 5,4 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","lasso":"M3.704 14.467a10 8 0 1 1 3.115 2.375 M7 22a5 5 0 0 1-2-3.994 M 3,16 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","lasso-select":"M7 22a5 5 0 0 1-2-4 M7 16.93c.96.43 1.96.74 2.99.91 M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2 M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z","laugh":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z M 9,9 L 9.01,9 M 15,9 L 15.01,9","layers":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12 M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17","layers2":"M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845","layers3":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12 M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17","layers-plus":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.831z M16 17h6 M19 14v6 M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 .825.178 M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l2.116-.962","layout":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 M9 21V9","layout-dashboard":"M 4,3 h 5 a 1,1 0 0,1 1,1 v 7 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -7 a 1,1 0 0,1 1,-1 Z M 15,3 h 5 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 15,12 h 5 a 1,1 0 0,1 1,1 v 7 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -7 a 1,1 0 0,1 1,-1 Z M 4,16 h 5 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","layout-grid":"M 4,3 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 15,3 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 15,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 4,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","layout-list":"M 4,3 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 4,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M14 4h7 M14 9h7 M14 15h7 M14 20h7","layout-panel-left":"M 4,3 h 5 a 1,1 0 0,1 1,1 v 16 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -16 a 1,1 0 0,1 1,-1 Z M 15,3 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 15,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","layout-panel-top":"M 4,3 h 16 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -16 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 4,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 15,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","layout-template":"M 4,3 h 16 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -16 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 4,14 h 7 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -7 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 17,14 h 3 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","leaf":"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12","leafy-green":"M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22 M2 22 17 7","lectern":"M16 12h3a2 2 0 0 0 1.902-1.38l1.056-3.333A1 1 0 0 0 21 6H3a1 1 0 0 0-.958 1.287l1.056 3.334A2 2 0 0 0 5 12h3 M18 6V3a1 1 0 0 0-1-1h-3 M 9,10 h 6 a 1,1 0 0,1 1,1 v 10 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -10 a 1,1 0 0,1 1,-1 Z","lens-concave":"M7 2a1 1 0 0 0-.8 1.6 14 14 0 0 1 0 16.8A1 1 0 0 0 7 22h10a1 1 0 0 0 .8-1.6 14 14 0 0 1 0-16.8A1 1 0 0 0 17 2z","lens-convex":"M13.433 2a1 1 0 0 1 .824.448 18 18 0 0 1 0 19.104 1 1 0 0 1-.824.448h-2.866a1 1 0 0 1-.824-.448 18 18 0 0 1 0-19.104A1 1 0 0 1 10.567 2z","letter-text":"M15 5h6 M15 12h6 M3 19h18 m3 12 3.553-7.724a.5.5 0 0 1 .894 0L11 12 M3.92 10h6.16","library":"m16 6 4 14 M12 6v14 M8 8v12 M4 4v16","library-big":"M 4,3 h 6 a 1,1 0 0,1 1,1 v 16 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -16 a 1,1 0 0,1 1,-1 Z M7 3v18 M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z","library-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 7v10 M11 7v10 m15 7 2 10","life-buoy":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m4.93 4.93 4.24 4.24 m14.83 9.17 4.24-4.24 m14.83 14.83 4.24 4.24 m9.17 14.83-4.24 4.24 M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","ligature":"M14 12h2v8 M14 20h4 M6 12h4 M6 20h4 M8 20V8a4 4 0 0 1 7.464-2","lightbulb":"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4","lightbulb-off":"M16.8 11.2c.8-.9 1.2-2 1.2-3.2a6 6 0 0 0-9.3-5 m2 2 20 20 M6.3 6.3a4.67 4.67 0 0 0 1.2 5.2c.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4","line-chart":"M3 3v16a2 2 0 0 0 2 2h16 m19 9-5 5-4-4-3 3","line-dot-right-horizontal":"M 3 12 L 15 12 M 15,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","line-squiggle":"M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2","line-style":"M11 5h2 M15 12h6 M19 5h2 M3 12h6 M3 19h18 M3 5h2","link":"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71","link2":"M9 17H7A5 5 0 0 1 7 7h2 M15 7h2a5 5 0 1 1 0 10h-2 M 8,12 L 16,12","link2-off":"M9 17H7A5 5 0 0 1 7 7 M15 7h2a5 5 0 0 1 4 8 M 8,12 L 12,12 M 2,2 L 22,22","list":"M3 5h.01 M3 12h.01 M3 19h.01 M8 5h13 M8 12h13 M8 19h13","list-check":"M16 5H3 M16 12H3 M11 19H3 m15 18 2 2 4-4","list-checks":"M13 5h8 M13 12h8 M13 19h8 m3 17 2 2 4-4 m3 7 2 2 4-4","list-chevrons-down-up":"M3 5h8 M3 12h8 M3 19h8 m15 5 3 3 3-3 m15 19 3-3 3 3","list-chevrons-up-down":"M3 5h8 M3 12h8 M3 19h8 m15 8 3-3 3 3 m15 16 3 3 3-3","list-collapse":"M10 5h11 M10 12h11 M10 19h11 m3 10 3-3-3-3 m3 20 3-3-3-3","list-end":"M16 5H3 M16 12H3 M9 19H3 m16 16-3 3 3 3 M21 5v12a2 2 0 0 1-2 2h-6","list-filter":"M2 5h20 M6 12h12 M9 19h6","list-filter-plus":"M12 5H2 M6 12h12 M9 19h6 M16 5h6 M19 8V2","list-indent-decrease":"M21 5H11 M21 12H11 M21 19H11 m7 8-4 4 4 4","list-indent-increase":"M21 5H11 M21 12H11 M21 19H11 m3 8 4 4-4 4","list-minus":"M16 5H3 M11 12H3 M16 19H3 M21 12h-6","list-music":"M16 5H3 M11 12H3 M11 19H3 M21 16V5 M 15,16 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","list-ordered":"M11 5h10 M11 12h10 M11 19h10 M4 4h1v5 M4 9h2 M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02","list-plus":"M16 5H3 M11 12H3 M16 19H3 M18 9v6 M21 12h-6","list-restart":"M21 5H3 M7 12H3 M7 19H3 M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14 M11 10v4h4","list-start":"M3 5h6 M3 12h13 M3 19h13 m16 8-3-3 3-3 M21 19V7a2 2 0 0 0-2-2h-6","list-todo":"M13 5h8 M13 12h8 M13 19h8 m3 17 2 2 4-4 M 4,4 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","list-tree":"M8 5h13 M13 12h8 M13 19h8 M3 10a2 2 0 0 0 2 2h3 M3 5v12a2 2 0 0 0 2 2h3","list-video":"M21 5H3 M10 12H3 M10 19H3 M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z","list-x":"M16 5H3 M11 12H3 M16 19H3 m15.5 9.5 5 5 m20.5 9.5-5 5","loader":"M12 2v4 m16.2 7.8 2.9-2.9 M18 12h4 m16.2 16.2 2.9 2.9 M12 18v4 m4.9 19.1 2.9-2.9 M2 12h4 m4.9 4.9 2.9 2.9","loader2":"M21 12a9 9 0 1 1-6.219-8.56","loader-circle":"M21 12a9 9 0 1 1-6.219-8.56","loader-pinwheel":"M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0 M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6 M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6 M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","locate":"M 2,12 L 5,12 M 19,12 L 22,12 M 12,2 L 12,5 M 12,19 L 12,22 M 5,12 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0","locate-fixed":"M 2,12 L 5,12 M 19,12 L 22,12 M 12,2 L 12,5 M 12,19 L 12,22 M 5,12 a 7,7 0 1,0 14,0 a 7,7 0 1,0 -14,0 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","locate-off":"M12 19v3 M12 2v3 M18.89 13.24a7 7 0 0 0-8.13-8.13 M19 12h3 M2 12h3 m2 2 20 20 M7.05 7.05a7 7 0 0 0 9.9 9.9","location-edit":"M17.97 9.304A8 8 0 0 0 2 10c0 4.69 4.887 9.562 7.022 11.468 M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M 7,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","lock":"M 5,11 h 14 a 2,2 0 0,1 2,2 v 7 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -7 a 2,2 0 0,1 2,-2 Z M7 11V7a5 5 0 0 1 10 0v4","lock-keyhole":"M 11,16 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 5,10 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M7 10V7a5 5 0 0 1 10 0v3","lock-keyhole-open":"M 11,16 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 5,10 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M7 10V7a5 5 0 0 1 9.33-2.5","lock-open":"M 5,11 h 14 a 2,2 0 0,1 2,2 v 7 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -7 a 2,2 0 0,1 2,-2 Z M7 11V7a5 5 0 0 1 9.9-1","log-in":"m10 17 5-5-5-5 M15 12H3 M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4","log-out":"m16 17 5-5-5-5 M21 12H9 M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4","logs":"M3 5h1 M3 12h1 M3 19h1 M8 5h1 M8 12h1 M8 19h1 M13 5h8 M13 12h8 M13 19h8","lollipop":"M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 m21 21-4.3-4.3 M11 11a2 2 0 0 0 4 0 4 4 0 0 0-8 0 6 6 0 0 0 12 0","luggage":"M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2 M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14 M10 20h4 M 14,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 6,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","msquare":"M8 16V8.5a.5.5 0 0 1 .9-.3l2.7 3.599a.5.5 0 0 0 .8 0l2.7-3.6a.5.5 0 0 1 .9.3V16 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","magnet":"m12 15 4 4 M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z m5 8 4 4","mail":"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7 M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z","mail-check":"M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 m16 19 2 2 4-4","mail-minus":"M22 15V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M16 19h6","mail-open":"M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10","mail-plus":"M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M19 16v6 M16 19h6","mail-question":"M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M18 15.28c.2-.4.5-.8.9-1a2.1 2.1 0 0 1 2.6.4c.3.4.5.8.5 1.3 0 1.3-2 2-2 2 M20 22v.01","mail-question-mark":"M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M18 15.28c.2-.4.5-.8.9-1a2.1 2.1 0 0 1 2.6.4c.3.4.5.8.5 1.3 0 1.3-2 2-2 2 M20 22v.01","mail-search":"M22 12.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h7.5 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m22 22-1.5-1.5","mail-warning":"M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 M20 14v4 M20 22v.01","mail-x":"M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9 m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7 m17 17 4 4 m21 17-4 4","mailbox":"M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z M 15,9 18 L 9 18,11 M6.5 5C9 5 11 7 11 9.5V17a2 2 0 0 1-2 2 M 6,10 L 7,10","mails":"M17 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 1-1.732 m22 5.5-6.419 4.179a2 2 0 0 1-2.162 0L7 5.5 M 9,3 h 11 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -11 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","map":"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z M15 5.764v15 M9 3.236v15","map-minus":"m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V14 M15 5.764V14 M21 18h-6 M9 3.236v15","map-pin":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","map-pin-check":"M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m16 18 2 2 4-4","map-pin-check-inside":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 m9 10 2 2 4-4","map-pin-house":"M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2 M18 22v-3 M 7,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","map-pin-minus":"M18.977 14C19.6 12.701 20 11.343 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M16 18h6","map-pin-minus-inside":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 M9 10h6","map-pin-off":"M12.75 7.09a3 3 0 0 1 2.16 2.16 M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568 m2 2 20 20 M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533 M9.13 9.13a3 3 0 0 0 3.74 3.74","map-pin-pen":"M17.97 9.304A8 8 0 0 0 2 10c0 4.69 4.887 9.562 7.022 11.468 M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M 7,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","map-pin-plus":"M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M16 18h6 M19 15v6","map-pin-plus-inside":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 M12 7v6 M9 10h6","map-pin-search":"M 12.248 21.969 a 1 1 0 0 1 -0.849 -0.17 C 9.539 20.193 4 14.993 4 10 a 8 8 0 0 1 16 0 C 20 10.42 19.961 10.841 19.888 11.262 m22 22-1.88-1.88 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","map-pin-x":"M19.752 11.901A7.78 7.78 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 19 19 0 0 0 .09-.077 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m21.5 15.5-5 5 m21.5 20.5-5-5","map-pin-xinside":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 m14.5 7.5-5 5 m9.5 7.5 5 5","map-pinned":"M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0 M 10,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712","map-plus":"m11 19-1.106-.552a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0l4.212 2.106a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619V12 M15 5.764V12 M18 15v6 M21 18h-6 M9 3.236v15","mars":"M16 3h5v5 m21 3-6.75 6.75 M 4,14 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","mars-stroke":"m14 6 4 4 M17 3h4v4 m21 3-7.75 7.75 M 3,15 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","martini":"M8 22h8 M12 11v11 m19 3-7 8-7-8Z","maximize":"M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3","maximize2":"M15 3h6v6 m21 3-7 7 m3 21 7-7 M9 21H3v-6","medal":"M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15 M11 12 5.12 2.2 m13 12 5.88-9.8 M8 7h8 M 7,17 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M12 18v-2h-.5","megaphone":"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14 M8 6v8","megaphone-off":"M11.636 6A13 13 0 0 0 19.4 3.2 1 1 0 0 1 21 4v11.344 M14.378 14.357A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1 m2 2 20 20 M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14 M8 8v6","meh":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 8,15 L 16,15 M 9,9 L 9.01,9 M 15,9 L 15.01,9","memory-stick":"M12 12v-2 M12 18v-2 M16 12v-2 M16 18v-2 M2 11h1.5 M20 18v-2 M20.5 11H22 M4 18v-2 M8 12v-2 M8 18v-2 M 4,6 h 16 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z","menu":"M4 5h16 M4 12h16 M4 19h16","menu-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 8h10 M7 12h10 M7 16h10","merge":"m8 6 4-4 4 4 M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22 m20 22-5-5","message-circle":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719","message-circle-check":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 m9 12 2 2 4-4","message-circle-code":"m10 9-3 3 3 3 m14 15 3-3-3-3 M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719","message-circle-dashed":"M10.1 2.182a10 10 0 0 1 3.8 0 M13.9 21.818a10 10 0 0 1-3.8 0 M17.609 3.72a10 10 0 0 1 2.69 2.7 M2.182 13.9a10 10 0 0 1 0-3.8 M20.28 17.61a10 10 0 0 1-2.7 2.69 M21.818 10.1a10 10 0 0 1 0 3.8 M3.721 6.391a10 10 0 0 1 2.7-2.69 m6.163 21.117-2.906.85a1 1 0 0 1-1.236-1.169l.965-2.98","message-circle-heart":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 5.004 2.224 3 3 0 0 1-.832 2.083l-3.447 3.62a1 1 0 0 1-1.45-.001z","message-circle-more":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 M8 12h.01 M12 12h.01 M16 12h.01","message-circle-off":"m2 2 20 20 M4.93 4.929a10 10 0 0 0-1.938 11.412 2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 0 0 11.302-1.989 M8.35 2.69A10 10 0 0 1 21.3 15.65","message-circle-plus":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 M8 12h8 M12 8v8","message-circle-question":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01","message-circle-question-mark":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01","message-circle-reply":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 m10 15-3-3 3-3 M7 12h8a2 2 0 0 1 2 2v1","message-circle-warning":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 M12 8v4 M12 16h.01","message-circle-x":"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719 m15 9-6 6 m9 9 6 6","message-square":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z","message-square-check":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z m9 11 2 2 4-4","message-square-code":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z m10 8-3 3 3 3 m14 14 3-3-3-3","message-square-dashed":"M14 3h2 M16 19h-2 M2 12v-2 M2 16v5.286a.71.71 0 0 0 1.212.502l1.149-1.149 M20 19a2 2 0 0 0 2-2v-1 M22 10v2 M22 6V5a2 2 0 0 0-2-2 M4 3a2 2 0 0 0-2 2v1 M8 19h2 M8 3h2","message-square-diff":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M10 15h4 M10 9h4 M12 7v4","message-square-dot":"M12.7 3H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H20a2 2 0 0 0 2-2v-4.7 M 16,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","message-square-heart":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M7.5 9.5c0 .687.265 1.383.697 1.844l3.009 3.264a1.14 1.14 0 0 0 .407.314 1 1 0 0 0 .783-.004 1.14 1.14 0 0 0 .398-.31l3.008-3.264A2.77 2.77 0 0 0 16.5 9.5 2.5 2.5 0 0 0 12 8a2.5 2.5 0 0 0-4.5 1.5","message-square-lock":"M22 8.5V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H10 M20 15v-2a2 2 0 0 0-4 0v2 M 15,15 h 6 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","message-square-more":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M12 11h.01 M16 11h.01 M8 11h.01","message-square-off":"M19 19H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.7.7 0 0 1 2 21.286V5a2 2 0 0 1 1.184-1.826 m2 2 20 20 M8.656 3H20a2 2 0 0 1 2 2v11.344","message-square-plus":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M12 8v6 M9 11h6","message-square-quote":"M14 14a2 2 0 0 0 2-2V8h-2 M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M8 14a2 2 0 0 0 2-2V8H8","message-square-reply":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z m10 8-3 3 3 3 M17 14v-1a2 2 0 0 0-2-2H7","message-square-share":"M12 3H4a2 2 0 0 0-2 2v16.286a.71.71 0 0 0 1.212.502l2.202-2.202A2 2 0 0 1 6.828 19H20a2 2 0 0 0 2-2v-4 M16 3h6v6 m16 9 6-6","message-square-text":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M7 11h10 M7 15h6 M7 7h8","message-square-warning":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z M12 15h.01 M12 7v4","message-square-x":"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z m14.5 8.5-5 5 m9.5 8.5 5 5","messages-square":"M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1","metronome":"M12 11.4V9.1 m12 17 6.59-6.59 m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2 M 18,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","mic":"M12 19v3 M19 10v2a7 7 0 0 1-14 0v-2 M 12,2 h 0 a 3,3 0 0,1 3,3 v 7 a 3,3 0 0,1 -3,3 h 0 a 3,3 0 0,1 -3,-3 v -7 a 3,3 0 0,1 3,-3 Z","mic2":"m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12 M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5 M 11,7 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0","mic-off":"M12 19v3 M15 9.34V5a3 3 0 0 0-5.68-1.33 M16.95 16.95A7 7 0 0 1 5 12v-2 M18.89 13.23A7 7 0 0 0 19 12v-2 m2 2 20 20 M9 9v3a3 3 0 0 0 5.12 2.12","mic-vocal":"m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12 M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5 M 11,7 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0","microchip":"M10 12h4 M10 17h4 M10 7h4 M18 12h2 M18 18h2 M18 6h2 M4 12h2 M4 18h2 M4 6h2 M 8,2 h 8 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -8 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z","microscope":"M6 18h8 M3 22h18 M14 22a7 7 0 1 0 0-14h-1 M9 14h2 M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3","microwave":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 11 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -11 a 2,2 0 0,1 2,-2 Z M 7,8 h 6 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M18 8v7 M6 19v2 M18 19v2","milestone":"M12 13v8 M12 3v3 M18.172 6a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z","milk":"M8 2h8 M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2 M7 15a6.472 6.472 0 0 1 5 0 6.47 6.47 0 0 0 5 0","milk-off":"M8 2h8 M9 2v1.343M15 2v2.789a4 4 0 0 0 .672 2.219l.656.984a4 4 0 0 1 .672 2.22v1.131M7.8 7.8l-.128.192A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3 M7 15a6.47 6.47 0 0 1 5 0 6.472 6.472 0 0 0 3.435.435 M 2,2 L 22,22","minimize":"M8 3v3a2 2 0 0 1-2 2H3 M21 8h-3a2 2 0 0 1-2-2V3 M3 16h3a2 2 0 0 1 2 2v3 M16 21v-3a2 2 0 0 1 2-2h3","minimize2":"m14 10 7-7 M20 10h-6V4 m3 21 7-7 M4 14h6v6","minus":"M5 12h14","minus-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M8 12h8","minus-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 12h8","mirror-rectangular":"M11 6 8 9 m16 7-8 8 M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z","mirror-round":"M10 6.6 8.6 8 M12 18v4 M15 7.5 9.5 13 M7 22h10 M 4,10 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0","monitor":"M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 8,21 L 16,21 M 12,17 L 12,21","monitor-check":"m9 10 2 2 4-4 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M12 17v4 M8 21h8","monitor-cloud":"M11 13a3 3 0 1 1 2.83-4H14a2 2 0 0 1 0 4z M12 17v4 M8 21h8 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","monitor-cog":"M12 17v4 m14.305 7.53.923-.382 m15.228 4.852-.923-.383 m16.852 3.228-.383-.924 m16.852 8.772-.383.923 m19.148 3.228.383-.924 m19.53 9.696-.382-.924 m20.772 4.852.924-.383 m20.772 7.148.924.383 M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7 M8 21h8 M 15,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","monitor-dot":"M12 17v4 M22 12.307V15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.693 M8 21h8 M 16,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","monitor-down":"M12 13V7 m15 10-3 3-3-3 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M12 17v4 M8 21h8","monitor-off":"M12 17v4 M17 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 1.184-1.826 m2 2 20 20 M8 21h8 M8.656 3H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.293 1.042","monitor-pause":"M10 13V7 M14 13V7 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M12 17v4 M8 21h8","monitor-play":"M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z M12 17v4 M8 21h8 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","monitor-smartphone":"M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8 M10 19v-3.96 3.15 M7 19h5 M 18,12 h 2 a 2,2 0 0,1 2,2 v 6 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -6 a 2,2 0 0,1 2,-2 Z","monitor-speaker":"M5.5 20H8 M17 9h.01 M 14,4 h 6 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M8 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4 M 16,15 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","monitor-stop":"M12 17v4 M8 21h8 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M 10,7 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","monitor-up":"m9 10 3-3 3 3 M12 13V7 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M12 17v4 M8 21h8","monitor-x":"m14.5 12.5-5-5 m9.5 12.5 5-5 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M12 17v4 M8 21h8","moon":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401","moon-star":"M18 5h4 M20 3v4 M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401","more-horizontal":"M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 4,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","more-vertical":"M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 11,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","motorbike":"m18 14-1-3 m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81 M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5 M 16,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 2,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","mountain":"m8 3 4 8 5-5 5 15H2L8 3z","mountain-snow":"m8 3 4 8 5-5 5 15H2L8 3z M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19","mouse":"M 12,2 h 0 a 7,7 0 0,1 7,7 v 6 a 7,7 0 0,1 -7,7 h 0 a 7,7 0 0,1 -7,-7 v -6 a 7,7 0 0,1 7,-7 Z M12 6v4","mouse-left":"M12 7.318V10 M5 10v5a7 7 0 0 0 14 0V9c0-3.527-2.608-6.515-6-7 M 5,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","mouse-off":"M12 6v.343 M18.218 18.218A7 7 0 0 1 5 15V9a7 7 0 0 1 .782-3.218 M19 13.343V9A7 7 0 0 0 8.56 2.902 M22 22 2 2","mouse-pointer":"M12.586 12.586 19 19 M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z","mouse-pointer2":"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z","mouse-pointer2-off":"m15.55 8.45 5.138 2.087a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063L8.45 15.551 M22 2 2 22 m6.816 11.528-2.779-6.84a.495.495 0 0 1 .651-.651l6.84 2.779","mouse-pointer-ban":"M2.034 2.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.944L8.204 7.545a1 1 0 0 0-.66.66l-1.066 3.443a.5.5 0 0 1-.944.033z M 10,16 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0 m11.8 11.8 8.4 8.4","mouse-pointer-click":"M14 4.1 12 6 m5.1 8-2.9-.8 m6 12-1.9 2 M7.2 2.2 8 5.1 M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z","mouse-pointer-square-dashed":"M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z M5 3a2 2 0 0 0-2 2 M19 3a2 2 0 0 1 2 2 M5 21a2 2 0 0 1-2-2 M9 3h1 M9 21h2 M14 3h1 M3 9v1 M21 9v2 M3 14v1","mouse-right":"M12 7.318V10 M19 10v5a7 7 0 0 1-14 0V9c0-3.527 2.608-6.515 6-7 M 15,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","move":"M12 2v20 m15 19-3 3-3-3 m19 9 3 3-3 3 M2 12h20 m5 9-3 3 3 3 m9 5 3-3 3 3","move3-d":"M5 3v16h16 m5 19 6-6 m2 6 3-3 3 3 m18 16 3 3-3 3","move3d":"M5 3v16h16 m5 19 6-6 m2 6 3-3 3 3 m18 16 3 3-3 3","move-diagonal":"M11 19H5v-6 M13 5h6v6 M19 5 5 19","move-diagonal2":"M19 13v6h-6 M5 11V5h6 m5 5 14 14","move-down":"M8 18L12 22L16 18 M12 2V22","move-down-left":"M11 19H5V13 M19 5L5 19","move-down-right":"M19 13V19H13 M5 5L19 19","move-horizontal":"m18 8 4 4-4 4 M2 12h20 m6 8-4 4 4 4","move-left":"M6 8L2 12L6 16 M2 12H22","move-right":"M18 8L22 12L18 16 M2 12H22","move-up":"M8 6L12 2L16 6 M12 2V22","move-up-left":"M5 11V5H11 M5 5L19 19","move-up-right":"M13 5H19V11 M19 5L5 19","move-vertical":"M12 2v20 m8 18 4 4 4-4 m8 6 4-4 4 4","music":"M9 18V5l12-2v13 M 3,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 15,16 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","music2":"M 4,18 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M12 18V2l7 4","music3":"M 8,18 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M16 18V2","music4":"M9 18V5l12-2v13 m9 9 12-2 M 3,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 15,16 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","navigation":"M 3 11 22 2 13 21 11 13 3 11,undefined Z","navigation2":"M 12 2 19 21 12 17 5 21 12 2,undefined Z","navigation2-off":"M9.31 9.31 5 21l7-4 7 4-1.17-3.17 M14.53 8.88 12 2l-1.17 3.17 M 2,2 L 22,22","navigation-off":"M8.43 8.43 3 11l8 2 2 8 2.57-5.43 M17.39 11.73 22 2l-9.73 4.61 M 2,2 L 22,22","network":"M 17,16 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z M 3,16 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z M 10,2 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3 M12 12V8","newspaper":"M15 18h-5 M18 14h-8 M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2 M 11,6 h 6 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","nfc":"M6 8.32a7.43 7.43 0 0 1 0 7.36 M9.46 6.21a11.76 11.76 0 0 1 0 11.58 M12.91 4.1a15.91 15.91 0 0 1 .01 15.8 M16.37 2a20.16 20.16 0 0 1 0 20","non-binary":"M12 2v10 m8.5 4 7 4 m8.5 8 7-4 M 7,17 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0","notebook":"M2 6h4 M2 10h4 M2 14h4 M2 18h4 M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M16 2v20","notebook-pen":"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4 M2 6h4 M2 10h4 M2 14h4 M2 18h4 M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z","notebook-tabs":"M2 6h4 M2 10h4 M2 14h4 M2 18h4 M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M15 2v20 M15 7h5 M15 12h5 M15 17h5","notebook-text":"M2 6h4 M2 10h4 M2 14h4 M2 18h4 M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M9.5 8h5 M9.5 12H16 M9.5 16H14","notepad-text":"M8 2v4 M12 2v4 M16 2v4 M 6,4 h 12 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 10h6 M8 14h8 M8 18h5","notepad-text-dashed":"M8 2v4 M12 2v4 M16 2v4 M16 4h2a2 2 0 0 1 2 2v2 M20 12v2 M20 18v2a2 2 0 0 1-2 2h-1 M13 22h-2 M7 22H6a2 2 0 0 1-2-2v-2 M4 14v-2 M4 8V6a2 2 0 0 1 2-2h2 M8 10h6 M8 14h8 M8 18h5","nut":"M12 4V2 M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592A7.003 7.003 0 0 0 19 14v-4 M12 4C8 4 4.5 6 4 8c-.243.97-.919 1.952-2 3 1.31-.082 1.972-.29 3-1 .54.92.982 1.356 2 2 1.452-.647 1.954-1.098 2.5-2 .595.995 1.151 1.427 2.5 2 1.31-.621 1.862-1.058 2.5-2 .629.977 1.162 1.423 2.5 2 1.209-.548 1.68-.967 2-2 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4Z","nut-off":"M12 4V2 M5 10v4a7.004 7.004 0 0 0 5.277 6.787c.412.104.802.292 1.102.592L12 22l.621-.621c.3-.3.69-.488 1.102-.592a7.01 7.01 0 0 0 4.125-2.939 M19 10v3.343 M12 12c-1.349-.573-1.905-1.005-2.5-2-.546.902-1.048 1.353-2.5 2-1.018-.644-1.46-1.08-2-2-1.028.71-1.69.918-3 1 1.081-1.048 1.757-2.03 2-3 .194-.776.84-1.551 1.79-2.21m11.654 5.997c.887-.457 1.28-.891 1.556-1.787 1.032.916 1.683 1.157 3 1-1.297-1.036-1.758-2.03-2-3-.5-2-4-4-8-4-.74 0-1.461.068-2.15.192 M 2,2 L 22,22","octagon":"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z","octagon-alert":"M12 16h.01 M12 8v4 M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z","octagon-minus":"M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z M8 12h8","octagon-pause":"M10 15V9 M14 15V9 M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z","octagon-x":"m15 9-6 6 M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z m9 9 6 6","omega":"M3 20h4.5a.5.5 0 0 0 .5-.5v-.282a.52.52 0 0 0-.247-.437 8 8 0 1 1 8.494-.001.52.52 0 0 0-.247.438v.282a.5.5 0 0 0 .5.5H21","option":"M3 3h6l6 18h6 M14 3h7","orbit":"M20.341 6.484A10 10 0 0 1 10.266 21.85 M3.659 17.516A10 10 0 0 1 13.74 2.152 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 17,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","origami":"M12 12V4a1 1 0 0 1 1-1h6.297a1 1 0 0 1 .651 1.759l-4.696 4.025 m12 21-7.414-7.414A2 2 0 0 1 4 12.172V6.415a1.002 1.002 0 0 1 1.707-.707L20 20.009 m12.214 3.381 8.414 14.966a1 1 0 0 1-.167 1.199l-1.168 1.163a1 1 0 0 1-.706.291H6.351a1 1 0 0 1-.625-.219L3.25 18.8a1 1 0 0 1 .631-1.781l4.165.027","outdent":"M21 5H11 M21 12H11 M21 19H11 m7 8-4 4 4 4","package":"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z M12 22V12 M 3.29 7 12 12 20.71 7,undefined m7.5 4.27 9 5.15","package2":"M12 3v6 M16.76 3a2 2 0 0 1 1.8 1.1l2.23 4.479a2 2 0 0 1 .21.891V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.472a2 2 0 0 1 .211-.894L5.45 4.1A2 2 0 0 1 7.24 3z M3.054 9.013h17.893","package-check":"M12 22V12 m16 17 2 2 4-4 M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753 M3.29 7 12 12l8.71-5 m7.5 4.27 8.997 5.148","package-minus":"M12 22V12 M16 17h6 M21 13V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955 M3.29 7 12 12l8.71-5 m7.5 4.27 8.997 5.148","package-open":"M12 22v-9 M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13 M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z","package-plus":"M12 22V12 M16 17h6 M19 14v6 M21 10.535V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.675-.955 M3.29 7 12 12l8.71-5 m7.5 4.27 8.997 5.148","package-search":"M12 22V12 M20.27 18.27 22 20 M21 10.498V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.98-.559 M3.29 7 12 12l8.71-5 m7.5 4.27 8.997 5.148 M 16,16.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0","package-x":"M12 22V12 m16.5 14.5 5 5 m16.5 19.5 5-5 M21 10.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.13-.074 M3.29 7 12 12l8.71-5 m7.5 4.27 8.997 5.148","paint-bucket":"M11 7 6 2 M18.992 12H2.041 M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595 m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33","paint-roller":"M 4,2 h 12 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M 9,16 h 2 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -2 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","paintbrush":"m14.622 17.897-10.68-2.913 M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15","paintbrush2":"M10 2v2 M14 2v4 M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1","paintbrush-vertical":"M10 2v2 M14 2v4 M17 2a1 1 0 0 1 1 1v9H6V3a1 1 0 0 1 1-1z M6 12a1 1 0 0 0-1 1v1a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v2.9a2 2 0 1 0 4 0V17a1 1 0 0 1 1-1h2a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1","palette":"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z M 13,6.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 17,10.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 6,12.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 8,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0","palmtree":"M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4 M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3 M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35 M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14","panda":"M11.25 17.25h1.5L12 18z m15 12 2 2 M18 6.5a.5.5 0 0 0-.5-.5 M20.69 9.67a4.5 4.5 0 1 0-7.04-5.5 8.35 8.35 0 0 0-3.3 0 4.5 4.5 0 1 0-7.04 5.5C2.49 11.2 2 12.88 2 14.5 2 19.47 6.48 22 12 22s10-2.53 10-7.5c0-1.62-.48-3.3-1.3-4.83 M6 6.5a.495.495 0 0 1 .5-.5 m9 12-2 2","panel-bottom":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 15h18","panel-bottom-close":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 15h18 m15 8-3 3-3-3","panel-bottom-dashed":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M14 15h1 M19 15h2 M3 15h2 M9 15h1","panel-bottom-inactive":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M14 15h1 M19 15h2 M3 15h2 M9 15h1","panel-bottom-open":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 15h18 m9 10 3-3 3 3","panel-left":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18","panel-left-close":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 m16 15-3-3 3-3","panel-left-dashed":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 14v1 M9 19v2 M9 3v2 M9 9v1","panel-left-inactive":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 14v1 M9 19v2 M9 3v2 M9 9v1","panel-left-open":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 m14 9 3 3-3 3","panel-left-right-dashed":"M15 10V9 M15 15v-1 M15 21v-2 M15 5V3 M9 10V9 M9 15v-1 M9 21v-2 M9 5V3 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","panel-right":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M15 3v18","panel-right-close":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M15 3v18 m8 9 3 3-3 3","panel-right-dashed":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M15 14v1 M15 19v2 M15 3v2 M15 9v1","panel-right-inactive":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M15 14v1 M15 19v2 M15 3v2 M15 9v1","panel-right-open":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M15 3v18 m10 15-3-3 3-3","panel-top":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18","panel-top-bottom-dashed":"M14 15h1 M14 9h1 M19 15h2 M19 9h2 M3 15h2 M3 9h2 M9 15h1 M9 9h1 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","panel-top-close":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 m9 16 3-3 3 3","panel-top-dashed":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M14 9h1 M19 9h2 M3 9h2 M9 9h1","panel-top-inactive":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M14 9h1 M19 9h2 M3 9h2 M9 9h1","panel-top-open":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 m15 14-3 3-3-3","panels-left-bottom":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 M9 15h12","panels-left-right":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 M15 3v18","panels-right-bottom":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 15h12 M15 3v18","panels-top-bottom":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M21 9H3 M21 15H3","panels-top-left":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 M9 21V9","paperclip":"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551","parentheses":"M8 21s-4-3-4-9 4-9 4-9 M16 3s4 3 4 9-4 9-4 9","parking-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M9 17V7h4a3 3 0 0 1 0 6H9","parking-circle-off":"M12.656 7H13a3 3 0 0 1 2.984 3.307 M13 13H9 M19.071 19.071A1 1 0 0 1 4.93 4.93 m2 2 20 20 M8.357 2.687a10 10 0 0 1 12.956 12.956 M9 17V9","parking-meter":"M11 15h2 M12 12v3 M12 19v3 M15.282 19a1 1 0 0 0 .948-.68l2.37-6.988a7 7 0 1 0-13.2 0l2.37 6.988a1 1 0 0 0 .948.68z M9 9a3 3 0 1 1 6 0","parking-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 17V7h4a3 3 0 0 1 0 6H9","parking-square-off":"M3.6 3.6A2 2 0 0 1 5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-.59 1.41 M3 8.7V19a2 2 0 0 0 2 2h10.3 m2 2 20 20 M13 13a3 3 0 1 0 0-6H9v2 M9 17v-2.3","party-popper":"M5.8 11.3 2 22l10.7-3.79 M4 3h.01 M22 8h.01 M15 2h.01 M22 20h.01 m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10 m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17 m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7 M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z","pause":"M 15,3 h 3 a 1,1 0 0,1 1,1 v 16 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -16 a 1,1 0 0,1 1,-1 Z M 6,3 h 3 a 1,1 0 0,1 1,1 v 16 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -16 a 1,1 0 0,1 1,-1 Z","pause-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 10,15 L 10,9 M 14,15 L 14,9","pause-octagon":"M10 15V9 M14 15V9 M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z","paw-print":"M 9,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 16,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 18,16 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z","pc-case":"M 7,2 h 10 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M15 14h.01 M9 6h6 M9 10h6","pen":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","pen-box":"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z","pen-line":"M13 21h8 M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","pen-off":"m10 10-6.157 6.162a2 2 0 0 0-.5.833l-1.322 4.36a.5.5 0 0 0 .622.624l4.358-1.323a2 2 0 0 0 .83-.5L14 13.982 m12.829 7.172 4.359-4.346a1 1 0 1 1 3.986 3.986l-4.353 4.353 m2 2 20 20","pen-square":"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z","pen-tool":"M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18 m2.3 2.3 7.286 7.286 M 9,11 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","pencil":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z m15 5 4 4","pencil-line":"M13 21h8 m15 5 4 4 M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","pencil-off":"m10 10-6.157 6.162a2 2 0 0 0-.5.833l-1.322 4.36a.5.5 0 0 0 .622.624l4.358-1.323a2 2 0 0 0 .83-.5L14 13.982 m12.829 7.172 4.359-4.346a1 1 0 1 1 3.986 3.986l-4.353 4.353 m15 5 4 4 m2 2 20 20","pencil-ruler":"M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13 m8 6 2-2 m18 16 2-2 m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17 M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z m15 5 4 4","pentagon":"M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z","percent":"M 19,5 L 5,19 M 4,6.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0 M 15,17.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0","percent-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m15 9-6 6 M9 9h.01 M15 15h.01","percent-diamond":"M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0Z M9.2 9.2h.01 m14.5 9.5-5 5 M14.7 14.8h.01","percent-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m15 9-6 6 M9 9h.01 M15 15h.01","person-standing":"M 11,5 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 m9 20 3-6 3 6 m6 8 6 2 6-2 M12 10v4","philippine-peso":"M20 11H4 M20 7H4 M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7","phone":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384","phone-call":"M13 2a9 9 0 0 1 9 9 M13 6a5 5 0 0 1 5 5 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384","phone-forwarded":"M14 6h8 m18 2 4 4-4 4 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384","phone-incoming":"M16 2v6h6 m22 2-6 6 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384","phone-missed":"m16 2 6 6 m22 2-6 6 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384","phone-off":"M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272 M22 2 2 22 M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473","phone-outgoing":"m16 8 6-6 M22 8V2h-6 M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384","pi":"M 9,4 L 9,20 M4 7c0-1.7 1.3-3 3-3h13 M18 20c-1.7 0-3-1.3-3-3V4","pi-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 7h10 M10 7v10 M16 17a2 2 0 0 1-2-2V7","piano":"M18.5 8c-1.4 0-2.6-.8-3.2-2A6.87 6.87 0 0 0 2 9v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8.5C22 9.6 20.4 8 18.5 8 M2 14h20 M6 14v4 M10 14v4 M14 14v4 M18 14v4","pickaxe":"m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999 M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024 M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069 M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z","picture-in-picture":"M2 10h6V4 m2 4 6 6 M21 10V7a2 2 0 0 0-2-2h-7 M3 14v2a2 2 0 0 0 2 2h3 M 13,14 h 8 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -8 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","picture-in-picture2":"M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4 M 14,13 h 6 a 2,2 0 0,1 2,2 v 3 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -3 a 2,2 0 0,1 2,-2 Z","pie-chart":"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z M21.21 15.89A10 10 0 1 1 8 2.83","piggy-bank":"M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z M16 10h.01 M2 8v1a2 2 0 0 0 2 2h1","pilcrow":"M13 4v16 M17 4v16 M19 4H9.5a4.5 4.5 0 0 0 0 9H13","pilcrow-left":"M14 3v11 M14 9h-3a3 3 0 0 1 0-6h9 M18 3v11 M22 18H2l4-4 m6 22-4-4","pilcrow-right":"M10 3v11 M10 9H7a1 1 0 0 1 0-6h8 M14 3v11 m18 14 4 4H2 m22 18-4 4","pilcrow-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 12H9.5a2.5 2.5 0 0 1 0-5H17 M12 7v10 M16 7v10","pill":"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z m8.5 8.5 7 7","pill-bottle":"M18 11h-4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h4 M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7 M 5,2 h 14 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -14 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","pin":"M12 17v5 M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z","pin-off":"M12 17v5 M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89 m2 2 20 20 M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11","pipette":"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12 m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z m2 22 .414-.414","pizza":"m12 14-1 1 m13.75 18.25-1.25 1.42 M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12 M18.8 9.3a1 1 0 0 0 2.1 7.7 M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z","plane":"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z","plane-landing":"M2 22h20 M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z","plane-takeoff":"M2 22h20 M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z","play":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z","play-circle":"M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","play-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z","plug":"M12 22v-5 M15 8V2 M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z M9 8V2","plug2":"M9 2v6 M15 2v6 M12 17v5 M5 8h14 M6 11V8h12v3a6 6 0 1 1-12 0Z","plug-zap":"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z m2 22 3-3 M7.5 13.5 10 11 M10.5 16.5 13 14 m18 3-4 4h6l-4 4","plug-zap2":"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z m2 22 3-3 M7.5 13.5 10 11 M10.5 16.5 13 14 m18 3-4 4h6l-4 4","plus":"M5 12h14 M12 5v14","plus-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M8 12h8 M12 8v8","plus-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 12h8 M12 8v8","pocket-knife":"M3 2v1c0 1 2 1 2 2S3 6 3 7s2 1 2 2-2 1-2 2 2 1 2 2 M18 6h.01 M6 18h.01 M20.83 8.83a4 4 0 0 0-5.66-5.66l-12 12a4 4 0 1 0 5.66 5.66Z M18 11.66V22a4 4 0 0 0 4-4V6","podcast":"M13 17a1 1 0 1 0-2 0l.5 4.5a0.5 0.5 0 0 0 1 0z M16.85 18.58a9 9 0 1 0-9.7 0 M8 14a5 5 0 1 1 8 0 M 11,11 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","pointer":"M22 14a8 8 0 0 1-8 8 M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2 M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1 M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10 M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15","pointer-off":"M10 4.5V4a2 2 0 0 0-2.41-1.957 M13.9 8.4a2 2 0 0 0-1.26-1.295 M21.7 16.2A8 8 0 0 0 22 14v-3a2 2 0 1 0-4 0v-1a2 2 0 0 0-3.63-1.158 m7 15-1.8-1.8a2 2 0 0 0-2.79 2.86L6 19.7a7.74 7.74 0 0 0 6 2.3h2a8 8 0 0 0 5.657-2.343 M6 6v8 m2 2 20 20","popcorn":"M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4 M10 22 9 8 m14 22 1-14 M20 8c.5 0 .9.4.8 1l-2.6 12c-.1.5-.7 1-1.2 1H7c-.6 0-1.1-.4-1.2-1L3.2 9c-.1-.6.3-1 .8-1Z","popsicle":"M18.6 14.4c.8-.8.8-2 0-2.8l-8.1-8.1a4.95 4.95 0 1 0-7.1 7.1l8.1 8.1c.9.7 2.1.7 2.9-.1Z m22 22-5.5-5.5","pound-sterling":"M18 7c0-5.333-8-5.333-8 0 M10 7v14 M6 21h12 M6 13h10","power":"M12 2v10 M18.4 6.6a9 9 0 1 1-12.77.04","power-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M12 7v4 M7.998 9.003a5 5 0 1 0 8-.005","power-off":"M18.36 6.64A9 9 0 0 1 20.77 15 M6.16 6.16a9 9 0 1 0 12.68 12.68 M12 2v4 m2 2 20 20","power-square":"M12 7v4 M7.998 9.003a5 5 0 1 0 8-.005 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","presentation":"M2 3h20 M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3 m7 21 5-5 5 5","printer":"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6 M 7,14 h 10 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -10 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","printer-check":"M13.5 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v.5 m16 19 2 2 4-4 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2 M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6","printer-x":"M12.531 22H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6.377 m16.5 16.5 5 5 m16.5 21.5 5-5 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.5 M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6","projector":"M5 7 3 5 M9 6V3 m13 7 2-2 M 6,13 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M11.83 12H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.17 M16 16h2","proportions":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M12 9v11 M2 9h13a2 2 0 0 1 2 2v9","puzzle":"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z","pyramid":"M2.5 16.88a1 1 0 0 1-.32-1.43l9-13.02a1 1 0 0 1 1.64 0l9 13.01a1 1 0 0 1-.32 1.44l-8.51 4.86a2 2 0 0 1-1.98 0Z M12 2v20","qr-code":"M 4,3 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 17,3 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 4,16 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M21 16h-3a2 2 0 0 0-2 2v3 M21 21v.01 M12 7v3a2 2 0 0 1-2 2H7 M3 12h.01 M12 3h.01 M12 16v.01 M16 12h1 M21 12v.01 M12 21v-1","quote":"M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z","rabbit":"M13 16a3 3 0 0 1 2.24 5 M18 12h.01 M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3 M20 8.54V4a2 2 0 1 0-4 0v3 M7.612 12.524a3 3 0 1 0-1.6 4.3","radar":"M19.07 4.93A10 10 0 0 0 6.99 3.34 M4 6h.01 M2.29 9.62A10 10 0 1 0 21.31 8.35 M16.24 7.76A6 6 0 1 0 8.23 16.67 M12 18h.01 M17.99 11.66A6 6 0 0 1 15.77 16.67 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m13.41 10.59 5.66-5.66","radiation":"M12 12h.01 M14 15.4641a4 4 0 0 1-4 0L7.52786 19.74597 A 1 1 0 0 0 7.99303 21.16211 10 10 0 0 0 16.00697 21.16211 1 1 0 0 0 16.47214 19.74597z M16 12a4 4 0 0 0-2-3.464l2.472-4.282a1 1 0 0 1 1.46-.305 10 10 0 0 1 4.006 6.94A1 1 0 0 1 21 12z M8 12a4 4 0 0 1 2-3.464L7.528 4.254a1 1 0 0 0-1.46-.305 10 10 0 0 0-4.006 6.94A1 1 0 0 0 3 12z","radical":"M3 12h3.28a1 1 0 0 1 .948.684l2.298 7.934a.5.5 0 0 0 .96-.044L13.82 4.771A1 1 0 0 1 14.792 4H21","radio":"M16.247 7.761a6 6 0 0 1 0 8.478 M19.075 4.933a10 10 0 0 1 0 14.134 M4.925 19.067a10 10 0 0 1 0-14.134 M7.753 16.239a6 6 0 0 1 0-8.478 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","radio-off":"M10.4103 10.7852C10.1529 11.1218 10 11.5425 10 11.999C10 13.1036 10.8954 13.999 12 13.999C12.5077 13.999 12.9713 13.8098 13.324 13.498 M16.1992 7.80078C17.4739 9.07549 18.0422 10.8109 17.9039 12.5134 M19.0996 4.89844C22.0892 7.88804 22.7871 12.2879 21.1932 15.936 M2 2L22 22 M4.89961 19.0984C0.999609 15.1984 0.999609 8.79844 4.89961 4.89844 M7.79922 16.1992C5.66828 14.0683 5.51165 10.6498 7.32931 8.25","radio-receiver":"M5 16v2 M19 16v2 M 4,8 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M18 12h.01","radio-tower":"M4.9 16.1C1 12.2 1 5.8 4.9 1.9 M7.8 4.7a6.14 6.14 0 0 0-.8 7.5 M 10,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M16.2 4.8c2 2 2.26 5.11.8 7.47 M19.1 1.9a9.96 9.96 0 0 1 0 14.1 M9.5 18h5 m8 22 4-11 4 11","radius":"M20.34 17.52a10 10 0 1 0-2.82 2.82 M 17,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m13.41 13.41 4.18 4.18 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","rainbow":"M22 17a10 10 0 0 0-20 0 M6 17a6 6 0 0 1 12 0 M10 17a2 2 0 0 1 4 0","rat":"M13 22H4a2 2 0 0 1 0-4h12 M13.236 18a3 3 0 0 0-2.2-5 M16 9h.01 M16.82 3.94a3 3 0 1 1 3.237 4.868l1.815 2.587a1.5 1.5 0 0 1-1.5 2.1l-2.872-.453a3 3 0 0 0-3.5 3 M17 4.988a3 3 0 1 0-5.2 2.052A7 7 0 0 0 4 14.015 4 4 0 0 0 8 18","ratio":"M 8,2 h 8 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -8 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","receipt":"M12 17V7 M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z","receipt-cent":"M12 7v10 M14.828 14.829a4 4 0 0 1-5.656 0 4 4 0 0 1 0-5.657 4 4 0 0 1 5.656 0 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z","receipt-euro":"M15.828 14.829a4 4 0 0 1-5.656 0 4 4 0 0 1 0-5.657 4 4 0 0 1 5.656 0 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z M8 12h5","receipt-indian-rupee":"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z M8 11h8 M8 7h8 M9 7a4 4 0 0 1 0 8H8l3 2","receipt-japanese-yen":"m12 10 3-3 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z M9 11h6 M9 15h6 m9 7 3 3v7","receipt-pound-sterling":"M10 17V9.5a1 1 0 0 1 5 0 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z M8 13h5 M8 17h7","receipt-russian-ruble":"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z M8 11h5a2 2 0 0 0 0-4h-3v10 M8 15h5","receipt-swiss-franc":"M10 11h4 M10 17V7h5 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z M8 15h5","receipt-text":"M13 16H8 M14 8H8 M16 12H8 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z","receipt-turkish-lira":"M10 7v10a5 5 0 0 0 5-5 m14 8-6 3 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z","rectangle-circle":"M14 4v16H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M 6,12 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0","rectangle-ellipsis":"M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M12 12h.01 M17 12h.01 M7 12h.01","rectangle-goggles":"M20 6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-1.6-.8l-1.6-2.13a1 1 0 0 0-1.6 0L9.6 17.2A2 2 0 0 1 8 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z","rectangle-horizontal":"M 4,6 h 16 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","rectangle-vertical":"M 8,2 h 8 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -8 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z","recycle":"M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5 M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12 m14 16-3 3 3 3 M8.293 13.596 7.196 9.5 3.1 10.598 m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843 m13.378 9.633 4.096 1.098 1.097-4.096","redo":"M21 7v6h-6 M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7","redo2":"m15 14 5-5-5-5 M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13","redo-dot":"M 11,17 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M21 7v6h-6 M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7","refresh-ccw":"M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16 M16 16h5v5","refresh-ccw-dot":"M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16 M16 16h5v5 M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","refresh-cw":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M8 16H3v5","refresh-cw-off":"M21 8L18.74 5.74A9.75 9.75 0 0 0 12 3C11 3 10.03 3.16 9.13 3.47 M8 16H3v5 M3 12C3 9.51 4 7.26 5.64 5.64 m3 16 2.26 2.26A9.75 9.75 0 0 0 12 21c2.49 0 4.74-1 6.36-2.64 M21 12c0 1-.16 1.97-.47 2.87 M21 3v5h-5 M22 22 2 2","refrigerator":"M5 6a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z M5 10h14 M15 7v6","regex":"M17 3v10 m12.67 5.5 8.66 5 m12.67 10.5 8.66-5 M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z","remove-formatting":"M4 7V4h16v3 M5 20h6 M13 4 8 20 m15 15 5 5 m20 15-5 5","repeat":"m17 2 4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 m7 22-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3","repeat1":"m17 2 4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 m7 22-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3 M11 10h1v4","repeat2":"m2 9 3-3 3 3 M13 18H7a2 2 0 0 1-2-2V6 m22 15-3 3-3-3 M11 6h6a2 2 0 0 1 2 2v10","replace":"M14 4a1 1 0 0 1 1-1 M15 10a1 1 0 0 1-1-1 M21 4a1 1 0 0 0-1-1 M21 9a1 1 0 0 1-1 1 m3 7 3 3 3-3 M6 10V5a2 2 0 0 1 2-2h2 M 4,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","replace-all":"M14 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1 M14 4a1 1 0 0 1 1-1 M15 10a1 1 0 0 1-1-1 M19 14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1 M21 4a1 1 0 0 0-1-1 M21 9a1 1 0 0 1-1 1 m3 7 3 3 3-3 M6 10V5a2 2 0 0 1 2-2h2 M 4,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z","reply":"M20 18v-2a4 4 0 0 0-4-4H4 m9 17-5-5 5-5","reply-all":"m12 17-5-5 5-5 M22 18v-2a4 4 0 0 0-4-4H7 m7 17-5-5 5-5","rewind":"M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z","ribbon":"M12 11.22C11 9.997 10 9 10 8a2 2 0 0 1 4 0c0 1-.998 2.002-2.01 3.22 m12 18 2.57-3.5 M6.243 9.016a7 7 0 0 1 11.507-.009 M9.35 14.53 12 11.22 M9.35 14.53C7.728 12.246 6 10.221 6 7a6 5 0 0 1 12 0c-.005 3.22-1.778 5.235-3.43 7.5l3.557 4.527a1 1 0 0 1-.203 1.43l-1.894 1.36a1 1 0 0 1-1.384-.215L12 18l-2.679 3.593a1 1 0 0 1-1.39.213l-1.865-1.353a1 1 0 0 1-.203-1.422z","road":"M12 17v4 M12 5V3 M12 9v3 M2.077 18.449A2 2 0 0 0 4 21h16a2 2 0 0 0 1.924-2.55l-4-14A2 2 0 0 0 16 3H8a2 2 0 0 0-1.924 1.45z","rocket":"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5 M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09 M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05","rocking-chair":"m15 13 3.708 7.416 M3 19a15 15 0 0 0 18 0 m3 2 3.21 9.633A2 2 0 0 0 8.109 13H18 m9 13-3.708 7.416","roller-coaster":"M6 19V5 M10 19V6.8 M14 19v-7.8 M18 5v4 M18 19v-6 M22 19V9 M2 19V9a4 4 0 0 1 4-4c2 0 4 1.33 6 4s4 4 6 4a4 4 0 1 0-3-6.65","rose":"M17 10h-1a4 4 0 1 1 4-4v.534 M17 6h1a4 4 0 0 1 1.42 7.74l-2.29.87a6 6 0 0 1-5.339-10.68l2.069-1.31 M4.5 17c2.8-.5 4.4 0 5.5.8s1.8 2.2 2.3 3.7c-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 M9.77 12C4 15 2 22 2 22 M 15,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","rotate3-d":"M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2 m15.194 13.707 3.814 1.86-1.86 3.814 M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4","rotate3d":"M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2 m15.194 13.707 3.814 1.86-1.86 3.814 M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4","rotate-ccw":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5","rotate-ccw-key":"M12 7v6 M12 9h2 M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8 M3 3v5h5 M 10,15 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","rotate-ccw-square":"M20 9V7a2 2 0 0 0-2-2h-6 m15 2-3 3 3 3 M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2","rotate-cw":"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5","rotate-cw-square":"M12 5H6a2 2 0 0 0-2 2v3 m9 8 3-3-3-3 M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2","route":"M 3,19 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15 M 15,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","route-off":"M 3,19 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M9 19h8.5c.4 0 .9-.1 1.3-.2 M5.2 5.2A3.5 3.53 0 0 0 6.5 12H12 m2 2 20 20 M21 15.3a3.5 3.5 0 0 0-3.3-3.3 M15 5h-4.3 M 15,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","router":"M 4,14 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M6.01 18H6 M10.01 18H10 M15 10v4 M17.84 7.17a4 4 0 0 0-5.66 0 M20.66 4.34a8 8 0 0 0-11.31 0","rows":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 12h18","rows2":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 12h18","rows3":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M21 9H3 M21 15H3","rows4":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M21 7.5H3 M21 12H3 M21 16.5H3","rss":"M4 11a9 9 0 0 1 9 9 M4 4a16 16 0 0 1 16 16 M 4,19 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","ruler":"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z m14.5 12.5 2-2 m11.5 9.5 2-2 m8.5 6.5 2-2 m17.5 15.5 2-2","ruler-dimension-line":"M10 15v-3 M14 15v-3 M18 15v-3 M2 8V4 M22 6H2 M22 8V4 M6 15v-3 M 4,12 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z","russian-ruble":"M6 11h8a4 4 0 0 0 0-8H9v18 M6 15h8","sailboat":"M10 2v15 M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4z M9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z","salad":"M7 21h10 M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1 m13 12 4-4 M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2","sandwich":"m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777 M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25 M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9 m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2 M 3,11 h 18 a 1,1 0 0,1 1,1 v 2 a 1,1 0 0,1 -1,1 h -18 a 1,1 0 0,1 -1,-1 v -2 a 1,1 0 0,1 1,-1 Z","satellite":"m13.5 6.5-3.148-3.148a1.205 1.205 0 0 0-1.704 0L6.352 5.648a1.205 1.205 0 0 0 0 1.704L9.5 10.5 M16.5 7.5 19 5 m17.5 10.5 3.148 3.148a1.205 1.205 0 0 1 0 1.704l-2.296 2.296a1.205 1.205 0 0 1-1.704 0L13.5 14.5 M9 21a6 6 0 0 0-6-6 M9.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l4.296-4.296a1.205 1.205 0 0 0 0-1.704l-2.296-2.296a1.205 1.205 0 0 0-1.704 0z","satellite-dish":"M4 10a7.31 7.31 0 0 0 10 10Z m9 15 3-3 M17 13a6 6 0 0 0-6-6 M21 13A10 10 0 0 0 11 3","saudi-riyal":"m20 19.5-5.5 1.2 M14.5 4v11.22a1 1 0 0 0 1.242.97L20 15.2 m2.978 19.351 5.549-1.363A2 2 0 0 0 10 16V2 M20 10 4 13.5","save":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7 M7 3v4a1 1 0 0 0 1 1h7","save-all":"M10 2v3a1 1 0 0 0 1 1h5 M18 18v-6a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6 M18 22H4a2 2 0 0 1-2-2V6 M8 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 22 6.828V16a2 2 0 0 1-2.01 2z","save-off":"M13 13H8a1 1 0 0 0-1 1v7 M14 8h1 M17 21v-4 m2 2 20 20 M20.41 20.41A2 2 0 0 1 19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 .59-1.41 M29.5 11.5s5 5 4 5 M9 3h6.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V15","scale":"M12 3v18 m19 8 3 8a5 5 0 0 1-6 0zV7 M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1 m5 8 3 8a5 5 0 0 1-6 0zV7 M7 21h10","scale3-d":"M5 7v11a1 1 0 0 0 1 1h11 M5.293 18.707 11 13 M 17,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","scale3d":"M5 7v11a1 1 0 0 0 1 1h11 M5.293 18.707 11 13 M 17,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","scaling":"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M14 15H9v-5 M16 3h5v5 M21 3 9 15","scan":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2","scan-barcode":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 7v10 M12 7v10 M17 7v10","scan-eye":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0","scan-face":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01","scan-heart":"M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M3 7V5a2 2 0 0 1 2-2h2 M7 21H5a2 2 0 0 1-2-2v-2 M7.828 13.07A3 3 0 0 1 12 8.764a3 3 0 0 1 4.172 4.306l-3.447 3.62a1 1 0 0 1-1.449 0z","scan-line":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h10","scan-qr-code":"M17 12v4a1 1 0 0 1-1 1h-4 M17 3h2a2 2 0 0 1 2 2v2 M17 8V7 M21 17v2a2 2 0 0 1-2 2h-2 M3 7V5a2 2 0 0 1 2-2h2 M7 17h.01 M7 21H5a2 2 0 0 1-2-2v-2 M 8,7 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","scan-search":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m16 16-1.9-1.9","scan-text":"M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 8h8 M7 12h10 M7 16h6","scatter-chart":"M 7,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 18,5.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 11,11.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 7,16.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M 17,14.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 M3 3v16a2 2 0 0 0 2 2h16","school":"M14 21v-3a2 2 0 0 0-4 0v3 M18 4.933V21 m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6 m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11 M6 4.933V21 M 10,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","school2":"M14 21v-3a2 2 0 0 0-4 0v3 M18 12h.01 M18 16h.01 M22 7a1 1 0 0 0-1-1h-2a2 2 0 0 1-1.143-.359L13.143 2.36a2 2 0 0 0-2.286-.001L6.143 5.64A2 2 0 0 1 5 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z M6 12h.01 M6 16h.01 M 10,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","scissors":"M 3,6 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M8.12 8.12 12 12 M20 4 8.12 15.88 M 3,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M14.8 14.8 20 20","scissors-line-dashed":"M5.42 9.42 8 12 M 2,8 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m14 6-8.58 8.58 M 2,16 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M10.8 14.8 14 18 M16 12h-2 M22 12h-2","scissors-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 7,8.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,9.56066 L 12,12 M 17,17 L 14.82,14.82 M 7,15.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,14.43934 L 17,7","scissors-square-dashed-bottom":"M 5,3 L 19,3 M 3,5 L 3,19 M 21,5 L 21,19 M 9,21 L 10,21 M 14,21 L 15,21 M 3 5 A2 2 0 0 1 5 3 M 19 3 A2 2 0 0 1 21 5 M 5 21 A2 2 0 0 1 3 19 M 21 19 A2 2 0 0 1 19 21 M 7,8.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,9.56066 L 12,12 M 17,17 L 14.82,14.82 M 7,15.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,14.43934 L 17,7","scooter":"M21 4h-3.5l2 11.05 M6.95 17h5.142c.523 0 .95-.406 1.063-.916a6.5 6.5 0 0 1 5.345-5.009 M 17,17.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0 M 2,17.5 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0","screen-share":"M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3 M8 21h8 M12 17v4 m17 8 5-5 M17 3h5v5","screen-share-off":"M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3 M8 21h8 M12 17v4 m22 3-5 5 m17 3 5 5","scroll":"M19 17V5a2 2 0 0 0-2-2H4 M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3","scroll-text":"M15 12h-5 M15 8h-5 M19 17V5a2 2 0 0 0-2-2H4 M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3","search":"m21 21-4.34-4.34 M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0","search-alert":"M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 m21 21-4.3-4.3 M11 7v4 M11 15h.01","search-check":"m8 11 2 2 4-4 M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 m21 21-4.3-4.3","search-code":"m13 13.5 2-2.5-2-2.5 m21 21-4.3-4.3 M9 8.5 7 11l2 2.5 M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0","search-slash":"m13.5 8.5-5 5 M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 m21 21-4.3-4.3","search-x":"m13.5 8.5-5 5 m8.5 8.5 5 5 M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 m21 21-4.3-4.3","section":"M16 5a4 3 0 0 0-8 0c0 4 8 3 8 7a4 3 0 0 1-8 0 M8 19a4 3 0 0 0 8 0c0-4-8-3-8-7a4 3 0 0 1 8 0","send":"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z m21.854 2.147-10.94 10.939","send-horizonal":"M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z M6 12h16","send-horizontal":"M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z M6 12h16","send-to-back":"M 16,14 h 4 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -4 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M 4,2 h 4 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -4 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M7 14v1a2 2 0 0 0 2 2h1 M14 7h1a2 2 0 0 1 2 2v1","separator-horizontal":"m16 16-4 4-4-4 M3 12h18 m8 8 4-4 4 4","separator-vertical":"M12 3v18 m16 16 4-4-4-4 m8 8-4 4 4 4","server":"M 4,2 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M 4,14 h 16 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M 6,6 L 6.01,6 M 6,18 L 6.01,18","server-cog":"m10.852 14.772-.383.923 M13.148 14.772a3 3 0 1 0-2.296-5.544l-.383-.923 m13.148 9.228.383-.923 m13.53 15.696-.382-.924a3 3 0 1 1-2.296-5.544 m14.772 10.852.923-.383 m14.772 13.148.923.383 M4.5 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5 M4.5 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-.5 M6 18h.01 M6 6h.01 m9.228 10.852-.923-.383 m9.228 13.148-.923.383","server-crash":"M6 10H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2 M6 14H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2 M6 6h.01 M6 18h.01 m13 6-4 6h6l-4 6","server-off":"M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5 M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z M22 17v-1a2 2 0 0 0-2-2h-1 M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z M6 18h.01 m2 2 20 20","settings":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","settings2":"M14 17H5 M19 7h-9 M 14,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 4,7 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","shapes":"M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z M 4,14 h 5 a 1,1 0 0,1 1,1 v 5 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -5 a 1,1 0 0,1 1,-1 Z M 14,17.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0","share":"M12 2v13 m16 6-4-4-4 4 M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8","share2":"M 15,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 3,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 15,19 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 8.59,13.51 L 15.42,17.49 M 15.41,6.51 L 8.59,10.49","sheet":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 3,9 L 21,9 M 3,15 L 21,15 M 9,9 L 9,21 M 15,9 L 15,21","shell":"M14 11a2 2 0 1 1-4 0 4 4 0 0 1 8 0 6 6 0 0 1-12 0 8 8 0 0 1 16 0 10 10 0 1 1-20 0 11.93 11.93 0 0 1 2.42-7.22 2 2 0 1 1 3.16 2.44","shelving-unit":"M12 12V9a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3 M16 20v-3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3 M20 22V2 M4 12h16 M4 20h16 M4 2v20 M4 4h16","shield":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z","shield-alert":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M12 8v4 M12 16h.01","shield-ban":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z m4.243 5.21 14.39 12.472","shield-check":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z m9 12 2 2 4-4","shield-close":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z m14.5 9.5-5 5 m9.5 9.5 5 5","shield-cog":"m10.929 14.467-.383.924 M10.929 8.923 10.546 8 M13.225 8.923 13.608 8 m13.607 15.391-.382-.924 m14.849 10.547.923-.383 m14.849 12.843.923.383 M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z m9.305 10.547-.923-.383 m9.305 12.843-.923.383 M 9.077,11.695 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","shield-cog-corner":"M11 22c-3.806-1.45-7-3.966-7-9V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v4 M14.923 16.547 14 16.164 m14.923 18.843-.923.383 M16.547 14.923 16.164 14 m16.547 20.467-.383.924 m18.843 14.923.383-.923 m19.225 21.391-.382-.924 m20.467 16.547.923-.383 m20.467 18.843.923.383 M 14.695,17.695 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","shield-ellipsis":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M8 12h.01 M12 12h.01 M16 12h.01","shield-half":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M12 22V2","shield-minus":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12h6","shield-off":"m2 2 20 20 M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71 M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264","shield-plus":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12h6 M12 9v6","shield-question":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3 M12 17h.01","shield-question-mark":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3 M12 17h.01","shield-user":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M6.376 18.91a6 6 0 0 1 11.249.003 M 8,11 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","shield-x":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z m14.5 9.5-5 5 m9.5 9.5 5 5","ship":"M12 10.189V14 M12 2v3 M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6 M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76 M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1","ship-wheel":"M 4,12 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M12 2v7.5 m19 5-5.23 5.23 M22 12h-7.5 m19 19-5.23-5.23 M12 14.5V22 M10.23 13.77 5 19 M9.5 12H2 M10.23 10.23 5 5 M 9.5,12 a 2.5,2.5 0 1,0 5,0 a 2.5,2.5 0 1,0 -5,0","shirt":"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z","shopping-bag":"M16 10a4 4 0 0 1-8 0 M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z","shopping-basket":"m15 11-1 9 m19 11-4-7 M2 11h20 m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4 M4.5 15.5h15 m5 11 4-7 m9 11 1 9","shopping-cart":"M 7,21 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 18,21 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12","shovel":"M21.56 4.56a1.5 1.5 0 0 1 0 2.122l-.47.47a3 3 0 0 1-4.212-.03 3 3 0 0 1 0-4.243l.44-.44a1.5 1.5 0 0 1 2.121 0z M3 22a1 1 0 0 1-1-1v-3.586a1 1 0 0 1 .293-.707l3.355-3.355a1.205 1.205 0 0 1 1.704 0l3.296 3.296a1.205 1.205 0 0 1 0 1.704l-3.355 3.355a1 1 0 0 1-.707.293z m9 15 7.879-7.878","shower-head":"m4 4 2.5 2.5 M13.5 6.5a4.95 4.95 0 0 0-7 7 M15 5 5 15 M14 17v.01 M10 16v.01 M13 13v.01 M16 10v.01 M11 20v.01 M17 14v.01 M20 11v.01","shredder":"M4 13V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v5 M14 2v5a1 1 0 0 0 1 1h5 M10 22v-5 M14 19v-2 M18 20v-3 M2 13h20 M6 20v-3","shrimp":"M11 12h.01 M13 22c.5-.5 1.12-1 2.5-1-1.38 0-2-.5-2.5-1 M14 2a3.28 3.28 0 0 1-3.227 1.798l-6.17-.561A2.387 2.387 0 1 0 4.387 8H15.5a1 1 0 0 1 0 13 1 1 0 0 0 0-5H12a7 7 0 0 1-7-7V8 M14 8a8.5 8.5 0 0 1 0 8 M16 16c2 0 4.5-4 4-6","shrink":"m15 15 6 6m-6-6v4.8m0-4.8h4.8 M9 19.8V15m0 0H4.2M9 15l-6 6 M15 4.2V9m0 0h4.8M15 9l6-6 M9 4.2V9m0 0H4.2M9 9 3 3","shrub":"M12 22v-5.172a2 2 0 0 0-.586-1.414L9.5 13.5 M14.5 14.5 12 17 M17 8.8A6 6 0 0 1 13.8 20H10A6.5 6.5 0 0 1 7 8a5 5 0 0 1 10 0z","shuffle":"m18 14 4 4-4 4 m18 2 4 4-4 4 M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22 M2 6h1.972a4 4 0 0 1 3.6 2.2 M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45","sidebar":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18","sidebar-close":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 m16 15-3-3 3-3","sidebar-open":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 3v18 m14 9 3 3-3 3","sigma":"M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2","sigma-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 8.9V7H8l4 5-4 5h8v-1.9","signal":"M2 20h.01 M7 20v-4 M12 20v-8 M17 20V8 M22 4v16","signal-high":"M2 20h.01 M7 20v-4 M12 20v-8 M17 20V8","signal-low":"M2 20h.01 M7 20v-4","signal-medium":"M2 20h.01 M7 20v-4 M12 20v-8","signal-zero":"M2 20h.01","signature":"m21 17-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284 M3 21h18","signpost":"M12 13v8 M12 3v3 M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z","signpost-big":"M10 9H4L2 7l2-2h6 M14 5h6l2 2-2 2h-6 M10 22V4a2 2 0 1 1 4 0v18 M8 22h8","siren":"M7 18v-6a5 5 0 1 1 10 0v6 M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z M21 12h1 M18.5 4.5 18 5 M2 12h1 M12 2v1 m4.929 4.929.707.707 M12 12v6","skip-back":"M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z M3 20V4","skip-forward":"M21 4v16 M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z","skull":"m12.5 17-.5-1-.5 1h1z M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z M 14,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 8,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","slash":"M22 2 2 22","slash-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 9,15 L 15,9","slice":"M11 16.586V19a1 1 0 0 1-1 1H2L18.37 3.63a1 1 0 1 1 3 3l-9.663 9.663a1 1 0 0 1-1.414 0L8 14","sliders":"M10 8h4 M12 21v-9 M12 8V3 M17 16h4 M19 12V3 M19 21v-5 M3 14h4 M5 10V3 M5 21v-7","sliders-horizontal":"M10 5H3 M12 19H3 M14 3v4 M16 17v4 M21 12h-9 M21 19h-5 M21 5h-7 M8 10v4 M8 12H3","sliders-vertical":"M10 8h4 M12 21v-9 M12 8V3 M17 16h4 M19 12V3 M19 21v-5 M3 14h4 M5 10V3 M5 21v-7","smartphone":"M 7,2 h 10 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M12 18h.01","smartphone-charging":"M 7,2 h 10 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M12.667 8 10 12h4l-2.667 4","smartphone-nfc":"M 3,6 h 5 a 1,1 0 0,1 1,1 v 10 a 1,1 0 0,1 -1,1 h -5 a 1,1 0 0,1 -1,-1 v -10 a 1,1 0 0,1 1,-1 Z M13 8.32a7.43 7.43 0 0 1 0 7.36 M16.46 6.21a11.76 11.76 0 0 1 0 11.58 M19.91 4.1a15.91 15.91 0 0 1 .01 15.8","smile":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M8 14s1.5 2 4 2 4-2 4-2 M 9,9 L 9.01,9 M 15,9 L 15.01,9","smile-plus":"M22 11v1a10 10 0 1 1-9-10 M8 14s1.5 2 4 2 4-2 4-2 M 9,9 L 9.01,9 M 15,9 L 15.01,9 M16 5h6 M19 2v6","snail":"M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0 M 2,13 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6 M18 3 19.1 5.2 M22 3 20.9 5.2","snowflake":"m10 20-1.25-2.5L6 18 M10 4 8.75 6.5 6 6 m14 20 1.25-2.5L18 18 m14 4 1.25 2.5L18 6 m17 21-3-6h-4 m17 3-3 6 1.5 3 M2 12h6.5L10 9 m20 10-1.5 2 1.5 2 M22 12h-6.5L14 15 m4 10 1.5 2L4 14 m7 21 3-6-1.5-3 m7 3 3 6h4","soap-dispenser-droplet":"M10.5 2v4 M14 2H7a2 2 0 0 0-2 2 M19.29 14.76A6.67 6.67 0 0 1 17 11a6.6 6.6 0 0 1-2.29 3.76c-1.15.92-1.71 2.04-1.71 3.19 0 2.22 1.8 4.05 4 4.05s4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19 M9.607 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h7V7a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3","sofa":"M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3 M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z M4 18v2 M20 18v2 M12 4v9","solar-panel":"M11 2h2 m14.28 14-4.56 8 m21 22-1.558-4H4.558 M3 10v2 M6.245 15.04A2 2 0 0 1 8 14h12a1 1 0 0 1 .864 1.505l-3.11 5.457A2 2 0 0 1 16 22H4a1 1 0 0 1-.863-1.506z M7 2a4 4 0 0 1-4 4 m8.66 7.66 1.41 1.41","sort-asc":"m3 8 4-4 4 4 M7 4v16 M11 12h4 M11 16h7 M11 20h10","sort-desc":"m3 16 4 4 4-4 M7 20V4 M11 4h10 M11 8h7 M11 12h4","soup":"M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z M7 21h10 M19.5 12 22 6 M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62 M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62 M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62","space":"M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1","spade":"M12 18v4 M2 14.499a5.5 5.5 0 0 0 9.591 3.675.6.6 0 0 1 .818.001A5.5 5.5 0 0 0 22 14.5c0-2.29-1.5-4-3-5.5l-5.492-5.312a2 2 0 0 0-3-.02L5 8.999c-1.5 1.5-3 3.2-3 5.5","sparkle":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z","sparkles":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z M20 2v4 M22 4h-4 M 2,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","speaker":"M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M12 6h.01 M 8,14 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M12 14h.01","speech":"M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20 M19.8 17.8a7.5 7.5 0 0 0 .003-10.603 M17 15a3.5 3.5 0 0 0-.025-4.975","spell-check":"m6 16 6-12 6 12 M8 12h8 m16 20 2 2 4-4","spell-check2":"m6 16 6-12 6 12 M8 12h8 M4 21c1.1 0 1.1-1 2.3-1s1.1 1 2.3 1c1.1 0 1.1-1 2.3-1 1.1 0 1.1 1 2.3 1 1.1 0 1.1-1 2.3-1 1.1 0 1.1 1 2.3 1 1.1 0 1.1-1 2.3-1","spline":"M 17,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M5 17A12 12 0 0 1 17 5","spline-pointer":"M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z M5 17A12 12 0 0 1 17 5 M 17,5 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 3,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","split":"M16 3h5v5 M8 3H3v5 M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3 m15 9 6-6","split-square-horizontal":"M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3 M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3 M 12,4 L 12,20","split-square-vertical":"M5 8V5c0-1 1-2 2-2h10c1 0 2 1 2 2v3 M19 16v3c0 1-1 2-2 2H7c-1 0-2-1-2-2v-3 M 4,12 L 20,12","spool":"M17 13.44 4.442 17.082A2 2 0 0 0 4.982 21H19a2 2 0 0 0 .558-3.921l-1.115-.32A2 2 0 0 1 17 14.837V7.66 m7 10.56 12.558-3.642A2 2 0 0 0 19.018 3H5a2 2 0 0 0-.558 3.921l1.115.32A2 2 0 0 1 7 9.163v7.178","sport-shoe":"m15 10.42 4.8-5.07 M19 18h3 M9.5 22 21.414 9.415A2 2 0 0 0 21.2 6.4l-5.61-4.208A1 1 0 0 0 14 3v2a2 2 0 0 1-1.394 1.906L8.677 8.053A1 1 0 0 0 8 9c-.155 6.393-2.082 9-4 9a2 2 0 0 0 0 4h14","spotlight":"M15.295 19.562 16 22 m17 16 3.758 2.098 m19 12.5 3.026-.598 M7.61 6.3a3 3 0 0 0-3.92 1.3l-1.38 2.79a3 3 0 0 0 1.3 3.91l6.89 3.597a1 1 0 0 0 1.342-.447l3.106-6.211a1 1 0 0 0-.447-1.341z M8 9V2","spray-can":"M3 3h.01 M7 5h.01 M11 7h.01 M3 7h.01 M7 9h.01 M3 11h.01 M 15,5 h 4 v 4 h -4 Z m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2 m13 14 8-2 m13 19 8-2","sprout":"M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3 M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4 M5 21h14","square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-activity":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M17 12h-2l-2 5-2-10-2 5H7","square-arrow-down":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 8v8 m8 12 4 4 4-4","square-arrow-down-left":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m16 8-8 8 M16 16H8V8","square-arrow-down-right":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m8 8 8 8 M16 8v8H8","square-arrow-left":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m12 8-4 4 4 4 M16 12H8","square-arrow-out-down-left":"M13 21h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6 m3 21 9-9 M9 21H3v-6","square-arrow-out-down-right":"M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6 m21 21-9-9 M21 15v6h-6","square-arrow-out-up-left":"M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6 m3 3 9 9 M3 9V3h6","square-arrow-out-up-right":"M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6 m21 3-9 9 M15 3h6v6","square-arrow-right":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 12h8 m12 16 4-4-4-4","square-arrow-right-enter":"m10 16 4-4-4-4 M3 12h11 M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3","square-arrow-right-exit":"M10 12h11 m17 16 4-4-4-4 M21 6.344V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1.344","square-arrow-up":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m16 12-4-4-4 4 M12 16V8","square-arrow-up-left":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 16V8h8 M16 16 8 8","square-arrow-up-right":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 8h8v8 m8 16 8-8","square-asterisk":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 8v8 m8.5 14 7-4 m8.5 10 7 4","square-bottom-dashed-scissors":"M 5,3 L 19,3 M 3,5 L 3,19 M 21,5 L 21,19 M 9,21 L 10,21 M 14,21 L 15,21 M 3 5 A2 2 0 0 1 5 3 M 19 3 A2 2 0 0 1 21 5 M 5 21 A2 2 0 0 1 3 19 M 21 19 A2 2 0 0 1 19 21 M 7,8.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,9.56066 L 12,12 M 17,17 L 14.82,14.82 M 7,15.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,14.43934 L 17,7","square-centerline-dashed-horizontal":"M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3 M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3 M12 20v2 M12 14v2 M12 8v2 M12 2v2","square-centerline-dashed-vertical":"M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3 M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3 M4 12H2 M10 12H8 M16 12h-2 M22 12h-2","square-chart-gantt":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 8h7 M8 12h6 M11 16h5","square-check":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m9 12 2 2 4-4","square-check-big":"M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344 m9 11 3 3L22 4","square-chevron-down":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m16 10-4 4-4-4","square-chevron-left":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m14 16-4-4 4-4","square-chevron-right":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m10 8 4 4-4 4","square-chevron-up":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m8 14 4-4 4 4","square-code":"m10 9-3 3 3 3 m14 15 3-3-3-3 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-dashed":"M5 3a2 2 0 0 0-2 2 M19 3a2 2 0 0 1 2 2 M21 19a2 2 0 0 1-2 2 M5 21a2 2 0 0 1-2-2 M9 3h1 M9 21h1 M14 3h1 M14 21h1 M3 9v1 M21 9v1 M3 14v1 M21 14v1","square-dashed-bottom":"M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2 M9 21h1 M14 21h1","square-dashed-bottom-code":"M10 9.5 8 12l2 2.5 M14 21h1 m14 9.5 2 2.5-2 2.5 M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2 M9 21h1","square-dashed-kanban":"M8 7v7 M12 7v4 M16 7v9 M5 3a2 2 0 0 0-2 2 M9 3h1 M14 3h1 M19 3a2 2 0 0 1 2 2 M21 9v1 M21 14v1 M21 19a2 2 0 0 1-2 2 M14 21h1 M9 21h1 M5 21a2 2 0 0 1-2-2 M3 14v1 M3 9v1","square-dashed-mouse-pointer":"M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z M5 3a2 2 0 0 0-2 2 M19 3a2 2 0 0 1 2 2 M5 21a2 2 0 0 1-2-2 M9 3h1 M9 21h2 M14 3h1 M3 9v1 M21 9v2 M3 14v1","square-dashed-top-solid":"M14 21h1 M21 14v1 M21 19a2 2 0 0 1-2 2 M21 9v1 M3 14v1 M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 M3 9v1 M5 21a2 2 0 0 1-2-2 M9 21h1","square-divide":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 8,12 L 16,12 M 12,16 L 12,16 M 12,8 L 12,8","square-dot":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","square-equal":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 10h10 M7 14h10","square-function":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3 M9 11.2h5.7","square-gantt-chart":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 8h7 M8 12h6 M11 16h5","square-kanban":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 7v7 M12 7v4 M16 7v9","square-library":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 7v10 M11 7v10 m15 7 2 10","square-m":"M8 16V8.5a.5.5 0 0 1 .9-.3l2.7 3.599a.5.5 0 0 0 .8 0l2.7-3.6a.5.5 0 0 1 .9.3V16 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-menu":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 8h10 M7 12h10 M7 16h10","square-minus":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 12h8","square-mouse-pointer":"M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6","square-parking":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 17V7h4a3 3 0 0 1 0 6H9","square-parking-off":"M3.6 3.6A2 2 0 0 1 5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-.59 1.41 M3 8.7V19a2 2 0 0 0 2 2h10.3 m2 2 20 20 M13 13a3 3 0 1 0 0-6H9v2 M9 17v-2.3","square-pause":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 10,15 L 10,9 M 14,15 L 14,9","square-pen":"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z","square-percent":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m15 9-6 6 M9 9h.01 M15 15h.01","square-pi":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M7 7h10 M10 7v10 M16 17a2 2 0 0 1-2-2V7","square-pilcrow":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M12 12H9.5a2.5 2.5 0 0 1 0-5H17 M12 7v10 M16 7v10","square-play":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z","square-plus":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M8 12h8 M12 8v8","square-power":"M12 7v4 M7.998 9.003a5 5 0 1 0 8-.005 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-radical":"M7 12h2l2 5 2-10h4 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-round-corner":"M21 11a8 8 0 0 0-8-8 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4","square-scissors":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 7,8.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,9.56066 L 12,12 M 17,17 L 14.82,14.82 M 7,15.5 a 1.5,1.5 0 1,0 3,0 a 1.5,1.5 0 1,0 -3,0 M 9.56066,14.43934 L 17,7","square-sigma":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M16 8.9V7H8l4 5-4 5h8v-1.9","square-slash":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 9,15 L 15,9","square-split-horizontal":"M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3 M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3 M 12,4 L 12,20","square-split-vertical":"M5 8V5c0-1 1-2 2-2h10c1 0 2 1 2 2v3 M19 16v3c0 1-1 2-2 2H7c-1 0-2-1-2-2v-3 M 4,12 L 20,12","square-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 9,8 h 6 a 1,1 0 0,1 1,1 v 6 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -6 a 1,1 0 0,1 1,-1 Z","square-stack":"M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2 M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2 M 16,14 h 4 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -4 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z","square-star":"M11.035 7.69a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-stop":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 10,9 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","square-terminal":"m7 11 2-2-2-2 M11 13h4 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-user":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2","square-user-round":"M18 21a6 6 0 0 0-12 0 M 8,11 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","square-x":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m15 9-6 6 m9 9 6 6","squares-exclude":"M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0 M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2","squares-intersect":"M10 22a2 2 0 0 1-2-2 M14 2a2 2 0 0 1 2 2 M16 22h-2 M2 10V8 M2 4a2 2 0 0 1 2-2 M20 8a2 2 0 0 1 2 2 M22 14v2 M22 20a2 2 0 0 1-2 2 M4 16a2 2 0 0 1-2-2 M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1z M8 2h2","squares-subtract":"M10 22a2 2 0 0 1-2-2 M16 22h-2 M16 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-5a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z M20 8a2 2 0 0 1 2 2 M22 14v2 M22 20a2 2 0 0 1-2 2","squares-unite":"M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z","squircle":"M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9","squircle-dashed":"M13.77 3.043a34 34 0 0 0-3.54 0 M13.771 20.956a33 33 0 0 1-3.541.001 M20.18 17.74c-.51 1.15-1.29 1.93-2.439 2.44 M20.18 6.259c-.51-1.148-1.291-1.929-2.44-2.438 M20.957 10.23a33 33 0 0 1 0 3.54 M3.043 10.23a34 34 0 0 0 .001 3.541 M6.26 20.179c-1.15-.508-1.93-1.29-2.44-2.438 M6.26 3.82c-1.149.51-1.93 1.291-2.44 2.44","squirrel":"M15.236 22a3 3 0 0 0-2.2-5 M16 20a3 3 0 0 1 3-3h1a2 2 0 0 0 2-2v-2a4 4 0 0 0-4-4V4 M18 13h.01 M18 6a4 4 0 0 0-4 4 7 7 0 0 0-7 7c0-5 4-5 4-10.5a4.5 4.5 0 1 0-9 0 2.5 2.5 0 0 0 5 0C7 10 3 11 3 17c0 2.8 2.2 5 5 5h10","stamp":"M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13 M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z M5 22h14","star":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z","star-half":"M12 18.338a2.1 2.1 0 0 0-.987.244L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679A.53.53 0 0 1 12 2","star-off":"m10.344 4.688 1.181-2.393a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.237 3.152 m17.945 17.945.43 2.505a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a8 8 0 0 0 .4-.099 m2 2 20 20","stars":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z M20 2v4 M22 4h-4 M 2,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","step-back":"M13.971 4.285A2 2 0 0 1 17 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z M21 20V4","step-forward":"M10.029 4.285A2 2 0 0 0 7 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z M3 4v16","stethoscope":"M11 2v2 M5 2v2 M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1 M8 15a6 6 0 0 0 12 0v-3 M 18,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","sticker":"M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M15 3v5a1 1 0 0 0 1 1h5 M8 13h.01 M16 13h.01 M10 16s.8 1 2 1c1.3 0 2-1 2-1","sticky-note":"M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M15 3v5a1 1 0 0 0 1 1h5","stone":"M11.264 2.205A4 4 0 0 0 6.42 4.211l-4 8a4 4 0 0 0 1.359 5.117l6 4a4 4 0 0 0 4.438 0l6-4a4 4 0 0 0 1.576-4.592l-2-6a4 4 0 0 0-2.53-2.53z M11.99 22 14 12l7.822 3.184 M14 12 8.47 2.302","stop-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 10,9 h 4 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -4 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","store":"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5 M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244 M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05","stretch-horizontal":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z M 4,14 h 16 a 2,2 0 0,1 2,2 v 2 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -2 a 2,2 0 0,1 2,-2 Z","stretch-vertical":"M 6,2 h 2 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M 16,2 h 2 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -2 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z","strikethrough":"M16 4H9a3 3 0 0 0-2.83 4 M14 12a4 4 0 0 1 0 8H6 M 4,12 L 20,12","subscript":"m4 5 8 8 m12 5-8 8 M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07","subtitles":"M 5,5 h 14 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M7 15h4M15 15h2M7 11h2M13 11h4","sun":"M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M12 2v2 M12 20v2 m4.93 4.93 1.41 1.41 m17.66 17.66 1.41 1.41 M2 12h2 M20 12h2 m6.34 17.66-1.41 1.41 m19.07 4.93-1.41 1.41","sun-dim":"M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M12 4h.01 M20 12h.01 M12 20h.01 M4 12h.01 M17.657 6.343h.01 M17.657 17.657h.01 M6.343 17.657h.01 M6.343 6.343h.01","sun-medium":"M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M12 3v1 M12 20v1 M3 12h1 M20 12h1 m18.364 5.636-.707.707 m6.343 17.657-.707.707 m5.636 5.636.707.707 m17.657 17.657.707.707","sun-moon":"M12 2v2 M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715 M16 12a4 4 0 0 0-4-4 m19 5-1.256 1.256 M20 12h2","sun-snow":"M10 21v-1 M10 4V3 M10 9a3 3 0 0 0 0 6 m14 20 1.25-2.5L18 18 m14 4 1.25 2.5L18 6 m17 21-3-6 1.5-3H22 m17 3-3 6 1.5 3 M2 12h1 m20 10-1.5 2 1.5 2 m3.64 18.36.7-.7 m4.34 6.34-.7-.7","sunrise":"M12 2v8 m4.93 10.93 1.41 1.41 M2 18h2 M20 18h2 m19.07 10.93-1.41 1.41 M22 22H2 m8 6 4-4 4 4 M16 18a4 4 0 0 0-8 0","sunset":"M12 10V2 m4.93 10.93 1.41 1.41 M2 18h2 M20 18h2 m19.07 10.93-1.41 1.41 M22 22H2 m16 6-4 4-4-4 M16 18a4 4 0 0 0-8 0","superscript":"m4 19 8-8 m12 19-8-8 M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06","swatch-book":"M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7 M 7 17h.01 m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8","swiss-franc":"M10 21V3h8 M6 16h9 M10 9.5h7","switch-camera":"M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5 M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5 M 9,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m18 22-3-3 3-3 m6 2 3 3-3 3","sword":"m11 19-6-6 m5 21-2-2 m8 16-4 4 M9.5 17.5 21 6V3h-3L6.5 14.5","swords":"M 14.5 17.5 3 6 3 3 6 3 17.5 14.5,undefined M 13,19 L 19,13 M 16,16 L 20,20 M 19,21 L 21,19 M 14.5 6.5 18 3 21 3 21 6 17.5 9.5,undefined M 5,14 L 9,18 M 7,17 L 4,20 M 3,19 L 5,21","syringe":"m18 2 4 4 m17 7 3-3 M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5 m9 11 4 4 m5 19-3 3 m14 4 6 6","table":"M12 3v18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9h18 M3 15h18","table2":"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18","table-cells-merge":"M12 21v-6 M12 9V3 M3 15h18 M3 9h18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","table-cells-split":"M12 15V9 M3 15h18 M3 9h18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","table-columns-split":"M14 14v2 M14 20v2 M14 2v2 M14 8v2 M2 15h8 M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2 M2 9h8 M22 15h-4 M22 3h-2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2 M22 9h-4 M5 3v18","table-config":"M10.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5.5 m14.3 19.6 1-.4 M15 3v7.5 m15.2 16.9-.9-.3 m16.6 21.7.3-.9 m16.8 15.3-.4-1 m19.1 15.2.3-.9 m19.6 21.7-.4-1 m20.7 16.8 1-.4 m21.7 19.4-.9-.3 M9 3v18 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","table-of-contents":"M16 5H3 M16 12H3 M16 19H3 M21 5h.01 M21 12h.01 M21 19h.01","table-properties":"M15 3v18 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M21 9H3 M21 15H3","table-rows-split":"M14 10h2 M15 22v-8 M15 2v4 M2 10h2 M20 10h2 M3 19h18 M3 22v-6a2 2 135 0 1 2-2h14a2 2 45 0 1 2 2v6 M3 2v2a2 2 45 0 0 2 2h14a2 2 135 0 0 2-2V2 M8 10h2 M9 22v-8 M9 2v4","tablet":"M 6,2 h 12 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M 12,18 L 12.01,18","tablet-smartphone":"M 5,8 h 6 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -6 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4 M8 18h.01","tablets":"M 2,7 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M 12,17 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M12 17h10 m3.46 10.54 7.08-7.08","tag":"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z M 7,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0","tags":"M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193 M 10,6.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0","tally1":"M4 4v16","tally2":"M4 4v16 M9 4v16","tally3":"M4 4v16 M9 4v16 M14 4v16","tally4":"M4 4v16 M9 4v16 M14 4v16 M19 4v16","tally5":"M4 4v16 M9 4v16 M14 4v16 M19 4v16 M22 6 2 18","tangent":"M 15,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M15.59 5.41 5.41 15.59 M 2,17 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M12 22s-4-9-1.5-11.5S22 12 22 12","target":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 6,12 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","telescope":"m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44 m13.56 11.747 4.332-.924 m16 21-3.105-6.21 M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z m6.158 8.633 1.114 4.456 m8 21 3.105-6.21 M 10,13 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","tent":"M3.5 21 14 3 M20.5 21 10 3 M15.5 21 12 15l-3.5 6 M2 21h20","tent-tree":"M 2,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 m14 5 3-3 3 3 m14 10 3-3 3 3 M17 14V2 M17 14H7l-5 8h20Z M8 14v8 m9 14 5 8","terminal":"M12 19h8 m4 17 6-6-6-6","terminal-square":"m7 11 2-2-2-2 M11 13h4 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","test-tube":"M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2 M8.5 2h7 M14.5 16h-5","test-tube2":"M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3 m16 2 6 6 M12 16H4","test-tube-diagonal":"M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3 m16 2 6 6 M12 16H4","test-tubes":"M9 2v17.5A2.5 2.5 0 0 1 6.5 22A2.5 2.5 0 0 1 4 19.5V2 M20 2v17.5a2.5 2.5 0 0 1-2.5 2.5a2.5 2.5 0 0 1-2.5-2.5V2 M3 2h7 M14 2h7 M9 16H4 M20 16h-5","text":"M21 5H3 M15 12H3 M17 19H3","text-align-center":"M21 5H3 M17 12H7 M19 19H5","text-align-end":"M21 5H3 M21 12H9 M21 19H7","text-align-justify":"M3 5h18 M3 12h18 M3 19h18","text-align-start":"M21 5H3 M15 12H3 M17 19H3","text-cursor":"M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1 M7 22h1a4 4 0 0 0 4-4v-1 M7 2h1a4 4 0 0 1 4 4v1","text-cursor-input":"M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6 M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7 M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1 M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1 M9 6v12","text-initial":"M15 5h6 M15 12h6 M3 19h18 m3 12 3.553-7.724a.5.5 0 0 1 .894 0L11 12 M3.92 10h6.16","text-quote":"M17 5H3 M21 12H8 M21 19H8 M3 12v7","text-search":"M21 5H3 M10 12H3 M10 19H3 M 14,15 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m21 19-1.9-1.9","text-select":"M14 21h1 M14 3h1 M19 3a2 2 0 0 1 2 2 M21 14v1 M21 19a2 2 0 0 1-2 2 M21 9v1 M3 14v1 M3 9v1 M5 21a2 2 0 0 1-2-2 M5 3a2 2 0 0 0-2 2 M7 12h10 M7 16h6 M7 8h8 M9 21h1 M9 3h1","text-selection":"M14 21h1 M14 3h1 M19 3a2 2 0 0 1 2 2 M21 14v1 M21 19a2 2 0 0 1-2 2 M21 9v1 M3 14v1 M3 9v1 M5 21a2 2 0 0 1-2-2 M5 3a2 2 0 0 0-2 2 M7 12h10 M7 16h6 M7 8h8 M9 21h1 M9 3h1","text-wrap":"m16 16-3 3 3 3 M3 12h14.5a1 1 0 0 1 0 7H13 M3 19h6 M3 5h18","theater":"M2 10s3-3 3-8 M22 10s-3-3-3-8 M10 2c0 4.4-3.6 8-8 8 M14 2c0 4.4 3.6 8 8 8 M2 10s2 2 2 5 M22 10s-2 2-2 5 M8 15h8 M2 22v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1 M14 22v-1a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1","thermometer":"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z","thermometer-snowflake":"m10 20-1.25-2.5L6 18 M10 4 8.75 6.5 6 6 M10.585 15H10 M2 12h6.5L10 9 M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z m4 10 1.5 2L4 14 m7 21 3-6-1.5-3 m7 3 3 6h2","thermometer-sun":"M12 2v2 M12 8a4 4 0 0 0-1.645 7.647 M2 12h2 M20 14.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z m4.93 4.93 1.41 1.41 m6.34 17.66-1.41 1.41","thumbs-down":"M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z M17 14V2","thumbs-up":"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z M7 10v12","ticket":"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M13 5v2 M13 17v2 M13 11v2","ticket-check":"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z m9 12 2 2 4-4","ticket-minus":"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M9 12h6","ticket-percent":"M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M9 9h.01 m15 9-6 6 M15 15h.01","ticket-plus":"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M9 12h6 M12 9v6","ticket-slash":"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z m9.5 14.5 5-5","ticket-x":"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z m9.5 14.5 5-5 m9.5 9.5 5 5","tickets":"m3.173 8.18 11-5a2 2 0 0 1 2.647.993L18.56 8 M6 10V8 M6 14v1 M6 19v2 M 4,8 h 16 a 2,2 0 0,1 2,2 v 9 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -9 a 2,2 0 0,1 2,-2 Z","tickets-plane":"M10.5 17h1.227a2 2 0 0 0 1.345-.52L18 12 m12 13.5 3.794.506 m3.173 8.18 11-5a2 2 0 0 1 2.647.993L18.56 8 M6 10V8 M6 14v1 M6 19v2 M 4,8 h 16 a 2,2 0 0,1 2,2 v 9 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -9 a 2,2 0 0,1 2,-2 Z","timer":"M 10,2 L 14,2 M 12,14 L 15,11 M 4,14 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0","timer-off":"M10 2h4 M4.6 11a8 8 0 0 0 1.7 8.7 8 8 0 0 0 8.7 1.7 M7.4 7.4a8 8 0 0 1 10.3 1 8 8 0 0 1 .9 10.2 m2 2 20 20 M12 12v-2","timer-reset":"M10 2h4 M12 14v-4 M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14L4 17.6 M9 17H4v5","toggle-left":"M 6,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 9,5 h 6 a 7,7 0 0,1 7,7 v 0 a 7,7 0 0,1 -7,7 h -6 a 7,7 0 0,1 -7,-7 v 0 a 7,7 0 0,1 7,-7 Z","toggle-right":"M 12,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 9,5 h 6 a 7,7 0 0,1 7,7 v 0 a 7,7 0 0,1 -7,7 h -6 a 7,7 0 0,1 -7,-7 v 0 a 7,7 0 0,1 7,-7 Z","toilet":"M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18 M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8","tool-case":"M10 15h4 m14.817 10.995-.971-1.45 1.034-1.232a2 2 0 0 0-2.025-3.238l-1.82.364L9.91 3.885a2 2 0 0 0-3.625.748L6.141 6.55l-1.725.426a2 2 0 0 0-.19 3.756l.657.27 m18.822 10.995 2.26-5.38a1 1 0 0 0-.557-1.318L16.954 2.9a1 1 0 0 0-1.281.533l-.924 2.122 M4 12.006A1 1 0 0 1 4.994 11H19a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z","toolbox":"M16 12v4 M16 6a2 2 0 0 1 1.414.586l4 4A2 2 0 0 1 22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 .586-1.414l4-4A2 2 0 0 1 8 6z M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2 M2 14h20 M8 12v4","tornado":"M21 4H3 M18 8H6 M19 12H9 M16 16h-6 M11 20H9","torus":"M 9,11 a 3,2 0 1,0 6,0 a 3,2 0 1,0 -6,0 M 2,12.5 a 10,8.5 0 1,0 20,0 a 10,8.5 0 1,0 -20,0","touchpad":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M2 14h20 M12 20v-6","touchpad-off":"M12 20v-6 M19.656 14H22 M2 14h12 m2 2 20 20 M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M9.656 4H20a2 2 0 0 1 2 2v10.344","towel-rack":"M22 7h-2 M6.5 3h11A2.5 2.5 0 0 1 20 5.5V20a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V5.5a1 1 0 0 0-5 0V17a1 1 0 0 0 1 1h4 M9 7H2","tower-control":"M18.2 12.27 20 6H4l1.8 6.27a1 1 0 0 0 .95.73h10.5a1 1 0 0 0 .96-.73Z M8 13v9 M16 22v-9 m9 6 1 7 m15 6-1 7 M12 6V2 M13 2h-2","toy-brick":"M 4,8 h 16 a 1,1 0 0,1 1,1 v 10 a 1,1 0 0,1 -1,1 h -16 a 1,1 0 0,1 -1,-1 v -10 a 1,1 0 0,1 1,-1 Z M10 8V5c0-.6-.4-1-1-1H6a1 1 0 0 0-1 1v3 M19 8V5c0-.6-.4-1-1-1h-3a1 1 0 0 0-1 1v3","tractor":"m10 11 11 .9a1 1 0 0 1 .8 1.1l-.665 4.158a1 1 0 0 1-.988.842H20 M16 18h-5 M18 5a1 1 0 0 0-1 1v5.573 M3 4h8.129a1 1 0 0 1 .99.863L13 11.246 M4 11V4 M7 15h.01 M8 10.1V4 M 16,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 2,15 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0","traffic-cone":"M16.05 10.966a5 2.5 0 0 1-8.1 0 m16.923 14.049 4.48 2.04a1 1 0 0 1 .001 1.831l-8.574 3.9a2 2 0 0 1-1.66 0l-8.574-3.91a1 1 0 0 1 0-1.83l4.484-2.04 M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0z M9.194 6.57a5 2.5 0 0 0 5.61 0","train":"M 6,3 h 12 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M4 11h16 M12 3v8 m8 19-2 3 m18 22-2-3 M8 15h.01 M16 15h.01","train-front":"M8 3.1V7a4 4 0 0 0 8 0V3.1 m9 15-1-1 m15 15 1-1 M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z m8 19-2 3 m16 19 2 3","train-front-tunnel":"M2 22V12a10 10 0 1 1 20 0v10 M15 6.8v1.4a3 2.8 0 1 1-6 0V6.8 M10 15h.01 M14 15h.01 M10 19a4 4 0 0 1-4-4v-3a6 6 0 1 1 12 0v3a4 4 0 0 1-4 4Z m9 19-2 3 m15 19 2 3","train-track":"M2 17 17 2 m2 14 8 8 m5 11 8 8 m8 8 8 8 m11 5 8 8 m14 2 8 8 M7 22 22 7","tram-front":"M 6,3 h 12 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -12 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M4 11h16 M12 3v8 m8 19-2 3 m18 22-2-3 M8 15h.01 M16 15h.01","transgender":"M12 16v6 M14 20h-4 M18 2h4v4 m2 2 7.17 7.17 M2 5.355V2h3.357 m22 2-7.17 7.17 M8 5 5 8 M 8,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","trash":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2","trash2":"M10 11v6 M14 11v6 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2","tree-deciduous":"M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z M12 19v3","tree-palm":"M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4 M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3 M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35 M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14","tree-pine":"m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z M12 22v-3","trees":"M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z M7 16v6 M13 19v3 M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5","trending-down":"M16 17h6v-6 m22 17-8.5-8.5-5 5L2 7","trending-up":"M16 7h6v6 m22 7-8.5 8.5-5-5L2 17","trending-up-down":"M14.828 14.828 21 21 M21 16v5h-5 m21 3-9 9-4-4-6 6 M21 8V3h-5","triangle":"M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z","triangle-alert":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01","triangle-dashed":"M10.17 4.193a2 2 0 0 1 3.666.013 M14 21h2 m15.874 7.743 1 1.732 m18.849 12.952 1 1.732 M21.824 18.18a2 2 0 0 1-1.835 2.824 M4.024 21a2 2 0 0 1-1.839-2.839 m5.136 12.952-1 1.732 M8 21h2 m8.102 7.743-1 1.732","triangle-right":"M22 18a2 2 0 0 1-2 2H3c-1.1 0-1.3-.6-.4-1.3L20.4 4.3c.9-.7 1.6-.4 1.6.7Z","trophy":"M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978 M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978 M18 9h1.5a1 1 0 0 0 0-5H18 M4 22h16 M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z M6 9H4.5a1 1 0 0 1 0-5H6","truck":"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2 M15 18H9 M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14 M 15,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 5,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","truck-electric":"M14 19V7a2 2 0 0 0-2-2H9 M15 19H9 M19 19h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14 M2 13v5a1 1 0 0 0 1 1h2 M4 3 2.15 5.15a.495.495 0 0 0 .35.86h2.15a.47.47 0 0 1 .35.86L3 9.02 M 15,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 5,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","turkish-lira":"M15 4 5 9 m15 8.5-10 5 M18 12a9 9 0 0 1-9 9V3","turntable":"M10 12.01h.01 M18 8v4a8 8 0 0 1-1.07 4 M 6,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z","turtle":"m12 10 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a8 8 0 1 0-16 0v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3l2-4h4Z M4.82 7.9 8 10 M15.18 7.9 12 10 M16.93 10H20a2 2 0 0 1 0 4H2","tv":"m17 2-5 5-5-5 M 4,7 h 16 a 2,2 0 0,1 2,2 v 11 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -11 a 2,2 0 0,1 2,-2 Z","tv2":"M7 21h10 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","tv-minimal":"M7 21h10 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","tv-minimal-play":"M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z M7 21h10 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","type":"M12 4v16 M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2 M9 20h6","type-outline":"M14 16.5a.5.5 0 0 0 .5.5h.5a2 2 0 0 1 0 4H9a2 2 0 0 1 0-4h.5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V8a2 2 0 0 1-4 0V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-4 0v-.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5Z","umbrella":"M12 13v7a2 2 0 0 0 4 0 M12 2v2 M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z","umbrella-off":"M12 13v7a2 2 0 0 0 4 0 M12 2v2 M18.656 13h2.336a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-12.07-7.51 m2 2 20 20 M5.961 5.957a10.28 10.28 0 0 0-3.922 5.769A1 1 0 0 0 3 13h10","underline":"M6 4v6a6 6 0 0 0 12 0V4 M 4,20 L 20,20","undo":"M3 7v6h6 M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13","undo2":"M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11","undo-dot":"M21 17a9 9 0 0 0-15-6.7L3 13 M3 7v6h6 M 11,17 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0","unfold-horizontal":"M16 12h6 M8 12H2 M12 2v2 M12 8v2 M12 14v2 M12 20v2 m19 15 3-3-3-3 m5 9-3 3 3 3","unfold-vertical":"M12 22v-6 M12 8V2 M4 12H2 M10 12H8 M16 12h-2 M22 12h-2 m15 19-3 3-3-3 m15 5-3-3-3 3","ungroup":"M 6,4 h 6 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z M 12,14 h 6 a 1,1 0 0,1 1,1 v 4 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -4 a 1,1 0 0,1 1,-1 Z","university":"M14 21v-3a2 2 0 0 0-4 0v3 M18 12h.01 M18 16h.01 M22 7a1 1 0 0 0-1-1h-2a2 2 0 0 1-1.143-.359L13.143 2.36a2 2 0 0 0-2.286-.001L6.143 5.64A2 2 0 0 1 5 6H3a1 1 0 0 0-1 1v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z M6 12h.01 M6 16h.01 M 10,10 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","unlink":"m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71 m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71 M 8,2 L 8,5 M 2,8 L 5,8 M 16,19 L 16,22 M 19,16 L 22,16","unlink2":"M15 7h2a5 5 0 0 1 0 10h-2m-6 0H7A5 5 0 0 1 7 7h2","unlock":"M 5,11 h 14 a 2,2 0 0,1 2,2 v 7 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -7 a 2,2 0 0,1 2,-2 Z M7 11V7a5 5 0 0 1 9.9-1","unlock-keyhole":"M 11,16 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 5,10 h 14 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z M7 10V7a5 5 0 0 1 9.33-2.5","unplug":"m19 5 3-3 m2 22 3-3 M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z M7.5 13.5 10 11 M10.5 16.5 13 14 m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z","upload":"M12 3v12 m17 8-5-5-5 5 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","upload-cloud":"M12 13v8 M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 m8 17 4-4 4 4","usb":"M 9,7 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M 3,20 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M4.7 19.3 19 5 m21 3-3 1 2 2Z M9.26 7.68 5 12l2 5 m10 14 5 2 3.5-3.5 m18 12 1-1 1 1-1 1Z","user":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M 8,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","user2":"M 7,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M20 21a8 8 0 0 0-16 0","user-check":"m16 11 2 2 4-4 M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M 5,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","user-check2":"M2 21a8 8 0 0 1 13.292-6 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 m16 19 2 2 4-4","user-circle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662","user-circle2":"M17.925 20.056a6 6 0 0 0-11.851.001 M 8,11 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","user-cog":"M10 15H6a4 4 0 0 0-4 4v2 m14.305 16.53.923-.382 m15.228 13.852-.923-.383 m16.852 12.228-.383-.923 m16.852 17.772-.383.924 m19.148 12.228.383-.923 m19.53 18.696-.382-.924 m20.772 13.852.924-.383 m20.772 16.148.924.383 M 15,15 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M 5,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","user-cog2":"m14.305 19.53.923-.382 m15.228 16.852-.923-.383 m16.852 15.228-.383-.923 m16.852 20.772-.383.924 m19.148 15.228.383-.923 m19.53 21.696-.382-.924 M2 21a8 8 0 0 1 10.434-7.62 m20.772 16.852.924-.383 m20.772 19.148.924.383 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","user-key":"M20 11v6 M20 13h2 M3 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 2.072.578 M 6,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 18,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","user-lock":"M19 16v-2a2 2 0 0 0-4 0v2 M9.5 15H7a4 4 0 0 0-4 4v2 M 6,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 13.899000000000001,16 h 6.202 a 0.899,0.899 0 0,1 0.899,0.899 v 3.202 a 0.899,0.899 0 0,1 -0.899,0.899 h -6.202 a 0.899,0.899 0 0,1 -0.899,-0.899 v -3.202 a 0.899,0.899 0 0,1 0.899,-0.899 Z","user-minus":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M 5,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 22,11 L 16,11","user-minus2":"M2 21a8 8 0 0 1 13.292-6 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M22 19h-6","user-pen":"M11.5 15H7a4 4 0 0 0-4 4v2 M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M 6,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","user-plus":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M 5,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 19,8 L 19,14 M 22,11 L 16,11","user-plus2":"M2 21a8 8 0 0 1 13.292-6 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M19 16v6 M22 19h-6","user-round":"M 7,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M20 21a8 8 0 0 0-16 0","user-round-check":"M2 21a8 8 0 0 1 13.292-6 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 m16 19 2 2 4-4","user-round-cog":"m14.305 19.53.923-.382 m15.228 16.852-.923-.383 m16.852 15.228-.383-.923 m16.852 20.772-.383.924 m19.148 15.228.383-.923 m19.53 21.696-.382-.924 M2 21a8 8 0 0 1 10.434-7.62 m20.772 16.852.924-.383 m20.772 19.148.924.383 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","user-round-key":"M19 11v6 M19 13h2 M2 21a8 8 0 0 1 12.868-6.349 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M 17,19 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","user-round-minus":"M2 21a8 8 0 0 1 13.292-6 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M22 19h-6","user-round-pen":"M2 21a8 8 0 0 1 10.821-7.487 M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0","user-round-plus":"M2 21a8 8 0 0 1 13.292-6 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M19 16v6 M22 19h-6","user-round-search":"M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M2 21a8 8 0 0 1 10.434-7.62 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m22 22-1.9-1.9","user-round-x":"M2 21a8 8 0 0 1 11.873-7 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 m17 17 5 5 m22 17-5 5","user-search":"M 6,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M10.3 15H7a4 4 0 0 0-4 4v2 M 14,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 m21 21-1.9-1.9","user-square":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2","user-square2":"M18 21a6 6 0 0 0-12 0 M 8,11 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z","user-star":"M16.051 12.616a1 1 0 0 1 1.909.024l.737 1.452a1 1 0 0 0 .737.535l1.634.256a1 1 0 0 1 .588 1.806l-1.172 1.168a1 1 0 0 0-.282.866l.259 1.613a1 1 0 0 1-1.541 1.134l-1.465-.75a1 1 0 0 0-.912 0l-1.465.75a1 1 0 0 1-1.539-1.133l.258-1.613a1 1 0 0 0-.282-.866l-1.156-1.153a1 1 0 0 1 .572-1.822l1.633-.256a1 1 0 0 0 .737-.535z M8 15H7a4 4 0 0 0-4 4v2 M 6,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","user-x":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M 5,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 17,8 L 22,13 M 22,8 L 17,13","user-x2":"M2 21a8 8 0 0 1 11.873-7 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 m17 17 5 5 m22 17-5 5","users":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3.128a4 4 0 0 1 0 7.744 M22 21v-2a4 4 0 0 0-3-3.87 M 5,7 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0","users2":"M18 21a8 8 0 0 0-16 0 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3","users-round":"M18 21a8 8 0 0 0-16 0 M 5,8 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3","utensils":"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7","utensils-crossed":"m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8 M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7 m2.1 21.8 6.4-6.3 m19 5-7 7","utility-pole":"M12 2v20 M2 5h20 M3 3v2 M7 3v2 M17 3v2 M21 3v2 m19 5-7 7-7-7","van":"M13 6v5a1 1 0 0 0 1 1h6.102a1 1 0 0 1 .712.298l.898.91a1 1 0 0 1 .288.702V17a1 1 0 0 1-1 1h-3 M5 18H3a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2h12c1.1 0 2.1.8 2.4 1.8l1.176 4.2 M9 18h5 M 14,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 5,18 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","variable":"M8 21s-4-3-4-9 4-9 4-9 M16 3s4 3 4 9-4 9-4 9 M 15,9 L 9,15 M 9,9 L 15,15","vault":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M 7,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 m7.9 7.9 2.7 2.7 M 16,7.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 m13.4 10.6 2.7-2.7 M 7,16.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 m7.9 16.1 2.7-2.7 M 16,16.5 a 0.5,0.5 0 1,0 1,0 a 0.5,0.5 0 1,0 -1,0 m13.4 13.4 2.7 2.7 M 10,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","vector-square":"M19.5 7a24 24 0 0 1 0 10 M4.5 7a24 24 0 0 0 0 10 M7 19.5a24 24 0 0 0 10 0 M7 4.5a24 24 0 0 1 10 0 M 18,17 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 18,2 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 3,17 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z M 3,2 h 3 a 1,1 0 0,1 1,1 v 3 a 1,1 0 0,1 -1,1 h -3 a 1,1 0 0,1 -1,-1 v -3 a 1,1 0 0,1 1,-1 Z","vegan":"M16 8q6 0 6-6-6 0-6 6 M17.41 3.59a10 10 0 1 0 3 3 M2 2a26.6 26.6 0 0 1 10 20c.9-6.82 1.5-9.5 4-14","venetian-mask":"M18 11c-1.5 0-2.5.5-3 2 M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z M6 11c1.5 0 2.5.5 3 2","venus":"M12 15v7 M9 19h6 M 6,9 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","venus-and-mars":"M10 20h4 M12 16v6 M17 2h4v4 m21 2-5.46 5.46 M 7,11 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0","verified":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z m9 12 2 2 4-4","vibrate":"m2 8 2 2-2 2 2 2-2 2 m22 8-2 2 2 2-2 2 2 2 M 9,5 h 6 a 1,1 0 0,1 1,1 v 12 a 1,1 0 0,1 -1,1 h -6 a 1,1 0 0,1 -1,-1 v -12 a 1,1 0 0,1 1,-1 Z","vibrate-off":"m2 8 2 2-2 2 2 2-2 2 m22 8-2 2 2 2-2 2 2 2 M8 8v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2 M16 10.34V6c0-.55-.45-1-1-1h-4.34 M 2,2 L 22,22","video":"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5 M 4,6 h 10 a 2,2 0 0,1 2,2 v 8 a 2,2 0 0,1 -2,2 h -10 a 2,2 0 0,1 -2,-2 v -8 a 2,2 0 0,1 2,-2 Z","video-off":"M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196 M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2 m2 2 20 20","videotape":"M 4,4 h 16 a 2,2 0 0,1 2,2 v 12 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -12 a 2,2 0 0,1 2,-2 Z M2 8h20 M 6,14 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M8 12h8 M 14,14 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","view":"M21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2 M21 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2 M 11,12 a 1,1 0 1,0 2,0 a 1,1 0 1,0 -2,0 M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0","voicemail":"M 2,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 14,12 a 4,4 0 1,0 8,0 a 4,4 0 1,0 -8,0 M 6,16 L 18,16","volleyball":"M11.1 7.1a16.55 16.55 0 0 1 10.9 4 M12 12a12.6 12.6 0 0 1-8.7 5 M16.8 13.6a16.55 16.55 0 0 1-9 7.5 M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10 M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5 M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0","volume":"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z","volume1":"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z M16 9a5 5 0 0 1 0 6","volume2":"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z M16 9a5 5 0 0 1 0 6 M19.364 18.364a9 9 0 0 0 0-12.728","volume-off":"M16 9a5 5 0 0 1 .95 2.293 M19.364 5.636a9 9 0 0 1 1.889 9.96 m2 2 20 20 m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11 M9.828 4.172A.686.686 0 0 1 11 4.657v.686","volume-x":"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z M 22,9 L 16,15 M 16,9 L 22,15","vote":"m9 12 2 2 4-4 M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z M22 19H2","wallet":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4","wallet2":"M17 14h.01 M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14","wallet-cards":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21","wallet-minimal":"M17 14h.01 M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14","wallpaper":"M12 17v4 M8 21h8 m9 17 6.1-6.1a2 2 0 0 1 2.81.01L22 15 M 6,9 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 4,3 h 16 a 2,2 0 0,1 2,2 v 10 a 2,2 0 0,1 -2,2 h -16 a 2,2 0 0,1 -2,-2 v -10 a 2,2 0 0,1 2,-2 Z","wand":"M15 4V2 M15 16v-2 M8 9h2 M20 9h2 M17.8 11.8 19 13 M15 9h.01 M17.8 6.2 19 5 m3 21 9-9 M12.2 6.2 11 5","wand2":"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72 m14 7 3 3 M5 6v4 M19 14v4 M10 2v2 M7 8H3 M21 16h-4 M11 3H9","wand-sparkles":"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72 m14 7 3 3 M5 6v4 M19 14v4 M10 2v2 M7 8H3 M21 16h-4 M11 3H9","warehouse":"M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11 M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z M6 13h12 M6 17h12","washing-machine":"M3 6h3 M17 6h.01 M 5,2 h 14 a 2,2 0 0,1 2,2 v 16 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -16 a 2,2 0 0,1 2,-2 Z M 7,13 a 5,5 0 1,0 10,0 a 5,5 0 1,0 -10,0 M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5","watch":"M12 10v2.2l1.6 1 m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05 m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05 M 6,12 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0","waves":"M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1","waves-arrow-down":"M12 10L12 2 M16 6L12 10L8 6 M2 15C2.6 15.5 3.2 16 4.5 16C7 16 7 14 9.5 14C12.1 14 11.9 16 14.5 16C17 16 17 14 19.5 14C20.8 14 21.4 14.5 22 15 M2 21C2.6 21.5 3.2 22 4.5 22C7 22 7 20 9.5 20C12.1 20 11.9 22 14.5 22C17 22 17 20 19.5 20C20.8 20 21.4 20.5 22 21","waves-arrow-up":"M12 2v8 M2 15c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 m8 6 4-4 4 4","waves-ladder":"M19 5a2 2 0 0 0-2 2v11 M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 M7 13h10 M7 9h10 M9 5a2 2 0 0 0-2 2v11","waypoints":"m10.586 5.414-5.172 5.172 m18.586 13.414-5.172 5.172 M6 12h12 M 10,20 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 10,4 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 18,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0 M 2,12 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0","webcam":"M 4,10 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M 9,10 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M7 22h10 M12 22v-4","webhook":"M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2 m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06 m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8","webhook-off":"M17 17h-5c-1.09-.02-1.94.92-2.5 1.9A3 3 0 1 1 2.57 15 M9 3.4a4 4 0 0 1 6.52.66 m6 17 3.1-5.8a2.5 2.5 0 0 0 .057-2.05 M20.3 20.3a4 4 0 0 1-2.3.7 M18.6 13a4 4 0 0 1 3.357 3.414 m12 6 .6 1 m2 2 20 20","weight":"M 9,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z","weight-tilde":"M6.5 8a2 2 0 0 0-1.906 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8z M7.999 15a2.5 2.5 0 0 1 4 0 2.5 2.5 0 0 0 4 0 M 9,5 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","wheat":"M2 22 16 8 M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z","wheat-off":"m2 22 10-10 m16 8-1.17 1.17 M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z m8 8-.53.53a3.5 3.5 0 0 0 0 4.94L9 15l1.53-1.53c.55-.55.88-1.25.98-1.97 M10.91 5.26c.15-.26.34-.51.56-.73L13 3l1.53 1.53a3.5 3.5 0 0 1 .28 4.62 M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z m16 16-.53.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.49 3.49 0 0 1 1.97-.98 M18.74 13.09c.26-.15.51-.34.73-.56L21 11l-1.53-1.53a3.5 3.5 0 0 0-4.62-.28 M 2,2 L 22,22","whole-word":"M 4,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M10 9v6 M 14,12 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0 M14 7v8 M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1","wifi":"M12 20h.01 M2 8.82a15 15 0 0 1 20 0 M5 12.859a10 10 0 0 1 14 0 M8.5 16.429a5 5 0 0 1 7 0","wifi-cog":"m14.305 19.53.923-.382 m15.228 16.852-.923-.383 m16.852 15.228-.383-.923 m16.852 20.772-.383.924 m19.148 15.228.383-.923 m19.53 21.696-.382-.924 M2 7.82a15 15 0 0 1 20 0 m20.772 16.852.924-.383 m20.772 19.148.924.383 M5 11.858a10 10 0 0 1 11.5-1.785 M8.5 15.429a5 5 0 0 1 2.413-1.31 M 15,18 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","wifi-high":"M12 20h.01 M5 12.859a10 10 0 0 1 14 0 M8.5 16.429a5 5 0 0 1 7 0","wifi-low":"M12 20h.01 M8.5 16.429a5 5 0 0 1 7 0","wifi-off":"M12 20h.01 M8.5 16.429a5 5 0 0 1 7 0 M5 12.859a10 10 0 0 1 5.17-2.69 M19 12.859a10 10 0 0 0-2.007-1.523 M2 8.82a15 15 0 0 1 4.177-2.643 M22 8.82a15 15 0 0 0-11.288-3.764 m2 2 20 20","wifi-pen":"M2 8.82a15 15 0 0 1 20 0 M21.378 16.626a1 1 0 0 0-3.004-3.004l-4.01 4.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z M5 12.859a10 10 0 0 1 10.5-2.222 M8.5 16.429a5 5 0 0 1 3-1.406","wifi-sync":"M11.965 10.105v4L13.5 12.5a5 5 0 0 1 8 1.5 M11.965 14.105h4 M17.965 18.105h4L20.43 19.71a5 5 0 0 1-8-1.5 M2 8.82a15 15 0 0 1 20 0 M21.965 22.105v-4 M5 12.86a10 10 0 0 1 3-2.032 M8.5 16.429h.01","wifi-zero":"M12 20h.01","wind":"M12.8 19.6A2 2 0 1 0 14 16H2 M17.5 8a2.5 2.5 0 1 1 2 4H2 M9.8 4.4A2 2 0 1 1 11 8H2","wind-arrow-down":"M10 2v8 M12.8 21.6A2 2 0 1 0 14 18H2 M17.5 10a2.5 2.5 0 1 1 2 4H2 m6 6 4 4 4-4","wine":"M8 22h8 M7 10h10 M12 15v7 M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z","wine-off":"M8 22h8 M7 10h3m7 0h-1.343 M12 15v7 M7.307 7.307A12.33 12.33 0 0 0 7 10a5 5 0 0 0 7.391 4.391M8.638 2.981C8.75 2.668 8.872 2.34 9 2h6c1.5 4 2 6 2 8 0 .407-.05.809-.145 1.198 M 2,2 L 22,22","workflow":"M 5,3 h 4 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -4 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z M7 11v4a2 2 0 0 0 2 2h4 M 15,13 h 4 a 2,2 0 0,1 2,2 v 4 a 2,2 0 0,1 -2,2 h -4 a 2,2 0 0,1 -2,-2 v -4 a 2,2 0 0,1 2,-2 Z","worm":"m19 12-1.5 3 M19.63 18.81 22 20 M6.47 8.23a1.68 1.68 0 0 1 2.44 1.93l-.64 2.08a6.76 6.76 0 0 0 10.16 7.67l.42-.27a1 1 0 1 0-2.73-4.21l-.42.27a1.76 1.76 0 0 1-2.63-1.99l.64-2.08A6.66 6.66 0 0 0 3.94 3.9l-.7.4a1 1 0 1 0 2.55 4.34z","wrap-text":"m16 16-3 3 3 3 M3 12h14.5a1 1 0 0 1 0 7H13 M3 19h6 M3 5h18","wrench":"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z","x":"M18 6 6 18 m6 6 12 12","xcircle":"M 2,12 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0 m15 9-6 6 m9 9 6 6","xline-top":"M18 4H6 M18 8 6 20 m6 8 12 12","xoctagon":"m15 9-6 6 M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z m9 9 6 6","xsquare":"M 5,3 h 14 a 2,2 0 0,1 2,2 v 14 a 2,2 0 0,1 -2,2 h -14 a 2,2 0 0,1 -2,-2 v -14 a 2,2 0 0,1 2,-2 Z m15 9-6 6 m9 9 6 6","zap":"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z","zap-off":"M10.513 4.856 13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317 M15.656 10H20a1 1 0 0 1 .78 1.63l-1.72 1.773 M16.273 16.273 10.88 21.83a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4a1 1 0 0 1-.78-1.63l4.507-4.643 m2 2 20 20","zodiac-aquarius":"m2 10 2.456-3.684a.7.7 0 0 1 1.106-.013l2.39 3.413a.7.7 0 0 0 1.096-.001l2.402-3.432a.7.7 0 0 1 1.098 0l2.402 3.432a.7.7 0 0 0 1.098 0l2.389-3.413a.7.7 0 0 1 1.106.013L22 10 m2 18.002 2.456-3.684a.7.7 0 0 1 1.106-.013l2.39 3.413a.7.7 0 0 0 1.097 0l2.402-3.432a.7.7 0 0 1 1.098 0l2.402 3.432a.7.7 0 0 0 1.098 0l2.389-3.413a.7.7 0 0 1 1.106.013L22 18.002","zodiac-aries":"M12 7.5a4.5 4.5 0 1 1 5 4.5 M7 12a4.5 4.5 0 1 1 5-4.5V21","zodiac-cancer":"M21 14.5A9 6.5 0 0 1 5.5 19 M3 9.5A9 6.5 0 0 1 18.5 5 M 14,14.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0 M 3,9.5 a 3.5,3.5 0 1,0 7,0 a 3.5,3.5 0 1,0 -7,0","zodiac-capricorn":"M11 21a3 3 0 0 0 3-3V6.5a1 1 0 0 0-7 0 M7 19V6a3 3 0 0 0-3-3h0 M 14,17 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","zodiac-gemini":"M16 4.525v14.948 M20 3A17 17 0 0 1 4 3 M4 21a17 17 0 0 1 16 0 M8 4.525v14.948","zodiac-leo":"M10 16c0-4-3-4.5-3-8a5 5 0 0 1 10 0c0 3.466-3 6.196-3 10a3 3 0 0 0 6 0 M 4,16 a 3,3 0 1,0 6,0 a 3,3 0 1,0 -6,0","zodiac-libra":"M3 16h6.857c.162-.012.19-.323.038-.38a6 6 0 1 1 4.212 0c-.153.057-.125.368.038.38H21 M3 20h18","zodiac-ophiuchus":"M3 10A6.06 6.06 0 0 1 12 10 A6.06 6.06 0 0 0 21 10 M6 3v12a6 6 0 0 0 12 0V3","zodiac-pisces":"M19 21a15 15 0 0 1 0-18 M20 12H4 M5 3a15 15 0 0 1 0 18","zodiac-sagittarius":"M15 3h6v6 M21 3 3 21 m9 9 6 6","zodiac-scorpio":"M10 19V5.5a1 1 0 0 1 5 0V17a2 2 0 0 0 2 2h5l-3-3 m22 19-3 3 M5 19V5.5a1 1 0 0 1 5 0 M5 5.5A2.5 2.5 0 0 0 2.5 3","zodiac-taurus":"M 6,15 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0 M18 3A6 6 0 0 1 6 3","zodiac-virgo":"M11 5.5a1 1 0 0 1 5 0V16a5 5 0 0 0 5 5 M16 11.5a1 1 0 0 1 5 0V16a5 5 0 0 1-5 5 M6 19V6a3 3 0 0 0-3-3h0 M6 5.5a1 1 0 0 1 5 0V19","zoom-in":"M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M 21,21 L 16.65,16.65 M 11,8 L 11,14 M 8,11 L 14,11","zoom-out":"M 3,11 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0 M 21,21 L 16.65,16.65 M 8,11 L 14,11"};
// ─── Initialization ──────────────────────────────────────────────────────

window.addEventListener('error', (e) => {
  if (e.message && (e.message.includes('arity') || e.message.includes('arguments') || e.message.includes('wasm') || e.message.includes('fdcanvas'))) {
    showWasmErrorToast(e.message);
  }
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason ? (e.reason.message || e.reason) : '';
  if (String(msg).includes('arity') || String(msg).includes('arguments') || String(msg).includes('wasm') || String(msg).includes('fdcanvas')) {
    showWasmErrorToast(String(msg));
  }
});

function showWasmErrorToast(msg) {
  let toast = document.getElementById('wasm-error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'wasm-error-toast';
    toast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      z-index: 9999; background: rgba(255, 59, 48, 0.15); color: #FF3B30;
      border: 1px solid rgba(255, 59, 48, 0.3); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      padding: 12px 24px; border-radius: 8px; font-family: monospace;
      font-size: 13px; box-shadow: 0 8px 32px rgba(255, 59, 48, 0.2);
      display: flex; align-items: center; gap: 12px; pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.innerHTML = '';

  const icon = document.createElement('span');
  icon.style.fontSize = '18px';
  icon.textContent = '⚠️';
  toast.appendChild(icon);

  const container = document.createElement('div');
  const bold = document.createElement('b');
  bold.textContent = 'WASM Bridge Error';
  container.appendChild(bold);
  container.appendChild(document.createElement('br'));

  const msgSpan = document.createElement('span');
  msgSpan.style.opacity = '0.9';
  msgSpan.textContent = msg;
  container.appendChild(msgSpan);

  toast.appendChild(container);

  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

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

    // Register semantic icon pack if built
    if (window.lucideIcons && wasmModule.register_icon_library) {
      wasmModule.register_icon_library("lucide", JSON.stringify(window.lucideIcons));
    }

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
    setupInlineEditor({
      canvasEl: canvas,
      container,
      renderFn: render,
      syncFn: syncTextToExtension,
      updatePanelFn: updatePropertiesPanel,
      getPanX: () => panX,
      getPanY: () => panY,
      getZoom: () => zoomLevel,
      screenToScene: screenToScene,
      fdCanvas: () => fdCanvas
    });
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
  fdCanvas.render(ctx, performance.now(), gridEnabled, true, xrayLabels, modShiftHeld);

  // ── Arrow tool: draw live preview line during drag ──
  const arrowPreviewJson = fdCanvas.get_arrow_preview();
  if (arrowPreviewJson) {
    try {
      const ap = JSON.parse(arrowPreviewJson);
      ctx.save();
      
      if (ap.x1 !== undefined && ap.y1 !== undefined) {
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
      }

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

