// ─── render.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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

