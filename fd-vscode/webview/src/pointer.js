// ─── pointer.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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

