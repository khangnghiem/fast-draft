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
export const activeTweens = [];

export const EASE_FNS = {
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
export function startTween(nodeId, prop, from, to, duration, easeName) {
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
export function evalTweens(now) {
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
export function playDetachAnimation(fdCanvas, nodeId, canvas) {
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
    const boundsJson = fdCanvas.get_node_bounds_json(nodeId);
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
export function drawGrid(ctx) {
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
export function startAnimLoop(renderFn, extraDirtyCheck) {
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
export function stopAnimLoop() {
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
export function fitToContent(canvasEl, fdCanvas, onComplete) {
  if (!fdCanvas) return;
  try {
    const text = fdCanvas.get_text();
    const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const nodes = [];
    let m;
    for (const m of text.matchAll(idRegex)) {
      const bj = fdCanvas.get_node_bounds_json(m[1]);
      if (!bj || bj === "{}") continue;
      const b = JSON.parse(bj);
      if (b.width > 0 && b.height > 0) nodes.push(b);
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
export function getSceneBounds(fdCanvas) {
  if (!fdCanvas) return null;
  try {
    const text = fdCanvas.get_text();
    const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let sx = Infinity, sy = Infinity, sx2 = -Infinity, sy2 = -Infinity;
    let found = false;
    let m;
    for (const m of text.matchAll(idRegex)) {
      try {
        const bj = fdCanvas.get_node_bounds_json(m[1]);
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
export function zoomAtPoint(mx, my, factor, onComplete) {
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
export function zoomToCenter(canvasEl, newZoom, onComplete) {
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
