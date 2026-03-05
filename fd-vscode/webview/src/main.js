// ─── main.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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

