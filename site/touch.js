// ── Touch Gesture System ──────────────────────────────────────────────────
// Provides: pinch-to-zoom, two-finger pan with momentum inertia,
// three-finger swipe/tap/pinch (undo/redo/copy/paste), four-finger swipe/tap
// (zen mode, zoom-to-fit, zoom-to-selection, tool cycle),
// long-press context menu, Apple Pencil palm rejection.
//
// Gesture hierarchy: 1-finger = object, 2-finger = viewport, 3-finger = edit, 4-finger = app.

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} api - Callback API for app integration
 * @param {() => object|null} api.getFdCanvas
 * @param {() => void} api.markRenderDirty
 * @param {() => void} api.markUiDirty
 * @param {() => void} api.syncCanvasToEditor
 * @param {(msg: string) => void} api.showToast
 * @param {() => void} api.copySelectedAsFd
 * @param {() => void} api.cutSelectedAsFd
 * @param {() => Promise<void>} api.pasteFromClipboard
 * @param {(tool: string) => void} api.updateToolbar
 * @param {() => void} api.updateZoomIndicator
 * @param {() => void} api.toggleFullscreen
 * @param {(canvas: HTMLCanvasElement) => void} api.fitToContent
 * @param {() => number} api.getZoomLevel
 * @param {(z: number) => void} api.setZoomLevel
 * @param {() => number} api.getPanX
 * @param {() => number} api.getPanY
 * @param {(x: number) => void} api.setPanX
 * @param {(y: number) => void} api.setPanY
 * @param {() => number} api.getZoomMin
 * @param {() => number} api.getZoomMax
 * @param {() => boolean} api.getReduceMotion
 */
export function setupTouchGestures(canvas, api) {
  let activeTouches = new Map();
  let lastPinchDist = 0;
  let lastPinchCenter = { x: 0, y: 0 };
  let longPressTimer = null;
  let longPressPos = null;
  let isGesturing = false;
  let threeFingerStartX = 0;
  let threeFingerHandled = false;
  let pencilActive = false;

  // Inertia state — weighted velocity for smooth momentum
  const velocityHistory = []; // last 3 frames: [{vx, vy, t}]
  let inertiaVx = 0;
  let inertiaVy = 0;
  let inertiaRaf = null;

  // ── 3-finger tap/double-tap state (undo/redo) ──
  let threeFingerTouchStart = 0;  // timestamp of 3-finger touchstart
  let threeFingerStartPositions = []; // [{x,y}] at touchstart
  let lastThreeFingerTapTime = 0;

  // ── 3-finger pinch state (copy/paste) ──
  let threeFingerStartArea = 0;   // bounding area of 3 touches at start
  let threeFingerPinchHandled = false;

  // ── 3-finger long-press state (edit menu) ──
  let threeFingerLongPressTimer = null;

  // ── 4-finger state ──
  let fourFingerTouchStart = 0;
  let fourFingerStartPositions = [];
  let fourFingerHandled = false;

  // Tool cycle order (matches toolbar visual order)
  const TOOL_CYCLE = ['hand', 'select', 'rect', 'ellipse', 'pen', 'arrow', 'text', 'eraser'];

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
    velocityHistory.length = 0;
  }

  function computeWeightedVelocity() {
    if (velocityHistory.length === 0) return { vx: 0, vy: 0 };
    // Weighted average: recent frames count more
    let totalWeight = 0;
    let vx = 0, vy = 0;
    for (let i = 0; i < velocityHistory.length; i++) {
      const weight = i + 1; // newer frames have higher index
      vx += velocityHistory[i].vx * weight;
      vy += velocityHistory[i].vy * weight;
      totalWeight += weight;
    }
    return { vx: vx / totalWeight, vy: vy / totalWeight };
  }

  function applyInertia() {
    const friction = 0.95; // Exponential decay (smoother than 0.92)
    inertiaVx *= friction;
    inertiaVy *= friction;
    // Stop when below minimum threshold
    if (Math.abs(inertiaVx) < 0.1 && Math.abs(inertiaVy) < 0.1) {
      inertiaRaf = null;
      return;
    }
    api.setPanX(api.getPanX() + inertiaVx);
    api.setPanY(api.getPanY() + inertiaVy);
    api.markRenderDirty();
    api.markUiDirty();
    inertiaRaf = requestAnimationFrame(applyInertia);
  }

  /** Zoom by a multiplier, anchored at a screen-space point. */
  function touchZoomAtPoint(mx, my, factor) {
    const oldZoom = api.getZoomLevel();
    const newZoom = Math.max(api.getZoomMin(), Math.min(api.getZoomMax(), oldZoom * factor));
    api.setZoomLevel(newZoom);
    const panX = api.getPanX();
    const panY = api.getPanY();
    api.setPanX(mx - (mx - panX) * (newZoom / oldZoom));
    api.setPanY(my - (my - panY) * (newZoom / oldZoom));
    api.updateZoomIndicator();
    api.markRenderDirty();
    api.markUiDirty();
  }

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, t);
    }

    const count = activeTouches.size;
    cancelInertia();

    // Palm rejection: if Apple Pencil is active and a finger appears, ignore fingers
    if (pencilActive && count > 0) {
      const hasPencil = [...e.touches].some(t => t.touchType === 'stylus');
      if (!hasPencil) {
        e.preventDefault();
        return;
      }
    }

    // Detect Apple Pencil
    for (const t of e.changedTouches) {
      if (t.touchType === 'stylus') {
        pencilActive = true;
      }
    }

    if (count === 1) {
      // Single finger — start long-press timer for context menu
      const t = [...activeTouches.values()][0];
      longPressPos = { x: t.clientX, y: t.clientY };
      longPressTimer = setTimeout(() => {
        const fakeEvent = new MouseEvent('contextmenu', {
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

      // Smart disambiguation: reject if fingers too close
      const dist = pinchDistance(touches[0], touches[1]);
      if (dist < 30) {
        return;
      }

      lastPinchDist = dist;
      lastPinchCenter = pinchCenter(touches[0], touches[1]);
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

  canvas.addEventListener('touchmove', (e) => {
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
        const canvasRect = canvas.getBoundingClientRect();
        const mx = center.x - canvasRect.left;
        const my = center.y - canvasRect.top;
        touchZoomAtPoint(mx, my, scale);
      }

      // Two-finger pan
      const dx = center.x - lastPinchCenter.x;
      const dy = center.y - lastPinchCenter.y;
      api.setPanX(api.getPanX() + dx);
      api.setPanY(api.getPanY() + dy);

      // Track velocity for inertia (weighted 3-frame history)
      const now = performance.now();
      const dt = velocityHistory.length > 0
        ? now - velocityHistory[velocityHistory.length - 1].t
        : 16;
      const normalizedDt = Math.max(dt, 1);
      velocityHistory.push({ vx: dx * (16 / normalizedDt), vy: dy * (16 / normalizedDt), t: now });
      if (velocityHistory.length > 3) velocityHistory.shift();

      lastPinchDist = dist;
      lastPinchCenter = center;
      api.markRenderDirty();
      api.markUiDirty();
      e.preventDefault();
    }

    if (count === 3 && !threeFingerHandled) {
      const fdCanvasRef = api.getFdCanvas();
      const touches = [...activeTouches.values()];
      const avgX = touches.reduce((s, t) => s + t.clientX, 0) / 3;
      const swipeDist = avgX - threeFingerStartX;

      // Require significant horizontal swipe
      if (Math.abs(swipeDist) > 50) {
        threeFingerHandled = true;
        if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
        if (fdCanvasRef) {
          if (swipeDist < 0) {
            // Swipe left = undo
            const changed = fdCanvasRef.handle_key('z', false, false, false, true);
            if (changed) {
              api.markRenderDirty();
              api.markUiDirty();
              api.syncCanvasToEditor();
            }
          } else {
            // Swipe right = redo
            const changed = fdCanvasRef.handle_key('z', false, true, false, true);
            if (changed) {
              api.markRenderDirty();
              api.markUiDirty();
              api.syncCanvasToEditor();
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
          api.copySelectedAsFd();
          api.showToast('Copied');
          e.preventDefault();
        } else if (ratio > 2.5) {
          // Pinch-out → paste
          threeFingerPinchHandled = true;
          threeFingerHandled = true;
          if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
          api.pasteFromClipboard();
          e.preventDefault();
        }
      }
    }

    // ── 4-finger swipe detection ──
    if (count === 4 && !fourFingerHandled) {
      const fdCanvasRef = api.getFdCanvas();
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
          api.fitToContent(canvas);
          api.markRenderDirty();
          api.markUiDirty();
        } else {
          // Swipe down → zoom-to-selection (or reset to 100% if none)
          if (fdCanvasRef) {
            const selectedId = fdCanvasRef.get_selected_id();
            if (selectedId) {
              try {
                const b = JSON.parse(fdCanvasRef.get_node_bounds_json(selectedId));
                if (b.width > 0 && b.height > 0) {
                  const cr = canvas.getBoundingClientRect();
                  const pad = 60;
                  const zoom = Math.min(cr.width / (b.width + pad), cr.height / (b.height + pad), api.getZoomMax());
                  api.setZoomLevel(Math.max(zoom, api.getZoomMin()));
                  api.setPanX(cr.width / 2 - (b.x + b.width / 2) * api.getZoomLevel());
                  api.setPanY(cr.height / 2 - (b.y + b.height / 2) * api.getZoomLevel());
                  api.updateZoomIndicator();
                  api.markRenderDirty();
                  api.markUiDirty();
                }
              } catch (_) {}
            } else {
              // No selection → reset to 100%
              const cr = canvas.getBoundingClientRect();
              api.setZoomLevel(1.0);
              api.setPanX(cr.width / 2);
              api.setPanY(cr.height / 2);
              api.updateZoomIndicator();
              api.markRenderDirty();
              api.markUiDirty();
            }
          }
        }
        e.preventDefault();
      } else if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe → cycle tool
        fourFingerHandled = true;
        if (fdCanvasRef) {
          const currentTool = fdCanvasRef.get_tool_name();
          const currentIdx = TOOL_CYCLE.indexOf(currentTool);
          const dir = dx > 0 ? 1 : -1;
          const nextIdx = (currentIdx + dir + TOOL_CYCLE.length) % TOOL_CYCLE.length;
          const nextTool = TOOL_CYCLE[nextIdx];
          fdCanvasRef.set_tool(nextTool);
          api.updateToolbar(nextTool);
          canvas.style.cursor = (nextTool === 'select' || nextTool === 'eraser' || nextTool === 'hand') ? '' : 'crosshair';
          if (nextTool === 'hand') canvas.style.cursor = 'grab';
          api.showToast(nextTool.charAt(0).toUpperCase() + nextTool.slice(1));
        }
        e.preventDefault();
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    const prevCount = activeTouches.size;
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }

    clearLongPress();
    if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }

    // Check if pencil lifted
    for (const t of e.changedTouches) {
      if (t.touchType === 'stylus') {
        pencilActive = false;
      }
    }

    // ── 3-finger tap / double-tap detection (undo / redo) ──
    if (prevCount === 3 && activeTouches.size === 0 && !threeFingerHandled && !threeFingerPinchHandled) {
      const fdCanvasRef = api.getFdCanvas();
      const elapsed = performance.now() - threeFingerTouchStart;
      if (elapsed < 200) {
        // Check total movement — must be <15px to count as tap
        const maxMove = threeFingerStartPositions.reduce((max, p, i) => {
          const endT = e.changedTouches[i];
          if (!endT) return max;
          const dist = Math.hypot(endT.clientX - p.x, endT.clientY - p.y);
          return Math.max(max, dist);
        }, 0);

        if (maxMove < 15) {
          const now = performance.now();
          if (now - lastThreeFingerTapTime < 400) {
            // Double-tap → undo
            lastThreeFingerTapTime = 0;
            if (fdCanvasRef) {
              const changed = fdCanvasRef.handle_key('z', false, false, false, true);
              if (changed) {
                api.markRenderDirty();
                api.markUiDirty();
                api.syncCanvasToEditor();
              }
            }
          } else {
            // Single tap → record time for double-tap detection (no action)
            lastThreeFingerTapTime = now;
          }
        }
      }
    }

    // ── 4-finger tap detection (zen mode toggle) ──
    if (prevCount === 4 && activeTouches.size === 0 && !fourFingerHandled) {
      const elapsed = performance.now() - fourFingerTouchStart;
      if (elapsed < 250) {
        // Check total movement — must be <20px to count as tap
        const maxMove = fourFingerStartPositions.reduce((max, p, i) => {
          const endT = e.changedTouches[i];
          if (!endT) return max;
          const dist = Math.hypot(endT.clientX - p.x, endT.clientY - p.y);
          return Math.max(max, dist);
        }, 0);

        if (maxMove < 20) {
          // Toggle fullscreen mode
          api.toggleFullscreen();
        }
      }
    }

    // Start inertia if two-finger gesture just ended
    if (activeTouches.size === 0 && isGesturing) {
      isGesturing = false;
      lastPinchDist = 0;
      const { vx, vy } = computeWeightedVelocity();
      inertiaVx = vx;
      inertiaVy = vy;
      if (!api.getReduceMotion() && (Math.abs(inertiaVx) > 0.5 || Math.abs(inertiaVy) > 0.5)) {
        inertiaRaf = requestAnimationFrame(applyInertia);
      }
    }
  });

  canvas.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }
    clearLongPress();
    if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
    isGesturing = false;
    pencilActive = false;
    cancelInertia();
  });

  // ── 3-finger long-press edit menu ──
  function showThreeFingerEditMenu(touches) {
    const fdCanvasRef = api.getFdCanvas();
    // Position at the centroid of the 3 touches
    const cx = touches.reduce((s, t) => s + t.clientX, 0) / 3;
    const cy = touches.reduce((s, t) => s + t.clientY, 0) / 3;

    // Remove existing menu if present
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
      { label: 'Undo', fn: () => { if (!fdCanvasRef) return; const c = fdCanvasRef.handle_key('z', false, false, false, true); if (c) { api.markRenderDirty(); api.markUiDirty(); api.syncCanvasToEditor(); } } },
      { label: 'Redo', fn: () => { if (!fdCanvasRef) return; const c = fdCanvasRef.handle_key('z', false, true, false, true); if (c) { api.markRenderDirty(); api.markUiDirty(); api.syncCanvasToEditor(); } } },
      { label: 'Cut', fn: () => api.cutSelectedAsFd() },
      { label: 'Copy', fn: () => { api.copySelectedAsFd(); api.showToast('Copied'); } },
      { label: 'Paste', fn: () => api.pasteFromClipboard() },
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
    // Auto-dismiss after 3s or on any touch/click elsewhere
    const dismiss = () => { menu.remove(); document.removeEventListener('pointerdown', dismiss); };
    setTimeout(dismiss, 3000);
    setTimeout(() => document.addEventListener('pointerdown', dismiss), 100);
  }
}

// ── Apple Pencil Pro Squeeze Detection ────────────────────────────────────
// On iPad Safari, Apple Pencil Pro squeeze fires as a button=5 pointer event.
// Modifier combos: plain=toggle last two tools, Shift=Pen, Ctrl=Select,
// Alt=Rect, Ctrl+Shift=Ellipse.
/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} api
 * @param {() => object|null} api.getFdCanvas
 * @param {(tool: string) => void} api.updateToolbar
 */
export function setupApplePencilPro(canvas, api) {
  canvas.addEventListener('pointerdown', (e) => {
    const fdCanvas = api.getFdCanvas();
    if (e.pointerType === 'pen' && e.button === 5 && fdCanvas) {
      const newTool = fdCanvas.handle_stylus_squeeze(
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      api.updateToolbar(newTool);
      canvas.style.cursor = (newTool === 'select' || newTool === 'eraser') ? '' : 'crosshair';
      if (newTool === 'hand') canvas.style.cursor = 'grab';
    }
  });
}
