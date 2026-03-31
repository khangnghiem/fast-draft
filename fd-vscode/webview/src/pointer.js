// ─── pointer.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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
          const edgeBounds = JSON.parse(fdCanvas.get_node_bounds_json(draggedNodeId));
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
                const fb = JSON.parse(fdCanvas.get_node_bounds_json(fromMatch[1]));
                const tb = JSON.parse(fdCanvas.get_node_bounds_json(toMatch[1]));
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

