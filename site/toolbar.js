// ── Toolbar System ──────────────────────────────────────────────────────────
// Handles: tool selection, drag-to-create, plus menu, and float/snap mechanics

/**
 * Initialize toolbar system and interactions.
 *
 * @param {object} api
 * @param {HTMLCanvasElement} api.canvasCanvas
 * @param {() => object|null} api.getFdCanvas
 * @param {() => object|null} api.getEditorView
 * @param {() => number} api.getPanX
 * @param {() => number} api.getPanY
 * @param {() => number} api.getZoomLevel
 * @param {() => object|null} api.getSmartDefaults
 * @param {() => string|null} api.getLockedTool
 * @param {(t: string|null) => void} api.setLockedTool
 * @param {() => number} api.getLastToolBtnTime
 * @param {(t: number) => void} api.setLastToolBtnTime
 * @param {() => string} api.getLastToolBtnName
 * @param {(n: string) => void} api.setLastToolBtnName
 * @param {(p: object|null) => void} api.setDtcPreview
 * @param {() => void} api.markRenderDirty
 * @param {() => void} api.markUiDirty
 * @param {() => void} api.renderCanvas
 * @param {() => void} api.syncCanvasToEditor
 * @param {() => void} api.refreshLayersPanel
 * @param {(tool: string) => void} api.updateToolbar
 * @param {(msg: string) => void} api.showToast
 * @param {() => void} api.toggleLeftPanel
 * @param {() => void} api.toggleRightPanel
 * @param {() => void} api.adjustMinimapForToolbar
 * @param {(x: number, y: number, canvas: HTMLCanvasElement) => {x: number, y: number}} api.screenToScene
 */
export function initToolbar(api) {
  // ── Drag-to-Create state ──
  let dtcActive = false;
  let dtcStartX = 0, dtcStartY = 0;
  let dtcTool = '';
  const DTC_DRAG_THRESHOLD = 5;

  /** Insert a shape at the given scene coordinates via FD code injection */
  function insertShapeAt(type, sceneX, sceneY) {
    if (!api.getEditorView()) return;
    const [w, h] = DTC_SIZES[type] || [100, 80];
    const x = Math.round(sceneX);
    const y = Math.round(sceneY);

    const fdCanvas = api.getFdCanvas();
    if (fdCanvas) {
      const success = fdCanvas.insert_node_at(type, x, y, w, h);
      if (success) {
        // Sync the updated `.fd` text *from* WASM back to CodeMirror
        api.syncCanvasToEditor();

        fdCanvas.set_tool('select');
        api.updateToolbar('select');
        api.canvas.style.cursor = '';
      }
    }

    api.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} created`);
    api.markRenderDirty();
    api.markUiDirty();
    api.renderCanvas();
    api.refreshLayersPanel();
  }

  /** Insert a shape at the center of the visible viewport */
  function insertShapeAtCenter(type) {
    const canvasEl = document.getElementById('fd-canvas');
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const centerClientX = rect.left + rect.width / 2;
    const centerClientY = rect.top + rect.height / 2;
    const [w, h] = DTC_SIZES[type] || [100, 80];
    const zoomLevel = api.getZoomLevel();
    const sceneX = ((centerClientX - rect.left) - api.getPanX()) / zoomLevel - w / 2;
    const sceneY = ((centerClientY - rect.top) - api.getPanY()) / zoomLevel - h / 2;
    insertShapeAt(type, sceneX, sceneY);
  }

  document.querySelectorAll('.ft-tool-btn[data-tool]').forEach(btn => {
    // Click to select tool — then draw on canvas (Figma/Excalidraw style)
    // CRITICAL: e.preventDefault() prevents native SVG drag from hijacking pointer events
    // See LESSONS.md: "Native Drag Hijacks SVG Pointerdown"
    btn.addEventListener('pointerdown', (e) => {
      const fdCanvas = api.getFdCanvas();
      if (!fdCanvas) return;
      e.preventDefault(); // THE FIX: prevent native SVG drag
      const tool = btn.dataset.tool;
      fdCanvas.set_tool(tool);
      api.updateToolbar(tool);
      api.canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
      // Track drag start for drag-to-create
      if (tool !== 'hand' && tool !== 'select' && tool !== 'eraser' && tool !== 'lasso' && tool !== 'arrow') {
        dtcStartX = e.clientX;
        dtcStartY = e.clientY;
        dtcTool = tool;
      }
    });

    btn.addEventListener('click', () => {
      const fdCanvas = api.getFdCanvas();
      if (!fdCanvas) return;
      const tool = btn.dataset.tool;
      const now = performance.now();
      // Double-click = lock tool (sticky mode)
      if (tool === api.getLastToolBtnName() && now - api.getLastToolBtnTime() < 400) {
        api.setLockedTool(tool);
        btn.classList.add('tool-locked');
        api.showToast(`🔒 ${tool.charAt(0).toUpperCase() + tool.slice(1)} tool locked`);
        api.setLastToolBtnTime(0);
      } else {
        // Single click = unlock if different tool
        if (api.getLockedTool() && tool !== api.getLockedTool()) {
          document.querySelector('.ft-tool-btn.tool-locked')?.classList.remove('tool-locked');
          api.setLockedTool(null);
        }
        api.setLastToolBtnTime(now);
        api.setLastToolBtnName(tool);
      }
      // Tool already set via pointerdown — just ensure consistency
      fdCanvas.set_tool(tool);
      api.updateToolbar(tool);
      api.canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
    });
  });

  // ── Drag-to-Create: pointermove + pointerup (document-level) ─────
  document.addEventListener('pointermove', (e) => {
    if (!dtcTool || dtcActive) {
      // Already in drag mode — update canvas preview position
      if (dtcActive) {
        const canvasEl = document.getElementById('fd-canvas');
        if (canvasEl) {
          const { x, y } = api.screenToScene(e.clientX, e.clientY, canvasEl);
          api.setDtcPreview({ type: dtcTool, sceneX: x, sceneY: y });
          api.markRenderDirty();
        }
      }
      return;
    }
    // Check if drag threshold reached
    const dx = e.clientX - dtcStartX;
    const dy = e.clientY - dtcStartY;
    if (Math.sqrt(dx * dx + dy * dy) >= DTC_DRAG_THRESHOLD) {
      dtcActive = true;
      const canvasEl = document.getElementById('fd-canvas');
      if (canvasEl) {
        const { x, y } = api.screenToScene(e.clientX, e.clientY, canvasEl);
        api.setDtcPreview({ type: dtcTool, sceneX: x, sceneY: y });
        api.markRenderDirty();
      }
    }
  });

  document.addEventListener('pointerup', (e) => {
    if (!dtcActive) {
      dtcTool = ''; // Reset drag tracking
      return;
    }
    // Clear canvas preview
    api.setDtcPreview(null);
    // Check if dropped over canvas
    const canvasEl = document.getElementById('fd-canvas');
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        // Convert screen → scene coords
        const sceneX = ((e.clientX - rect.left) - api.getPanX()) / api.getZoomLevel();
        const sceneY = ((e.clientY - rect.top) - api.getPanY()) / api.getZoomLevel();
        const [w, h] = DTC_SIZES[dtcTool] || [100, 80];
        insertShapeAt(dtcTool, sceneX - w / 2, sceneY - h / 2);
      } else {
        api.showToast('Drop on canvas to create shape');
      }
    }
    dtcActive = false;
    dtcTool = '';
  });

  // ── Insert Menu (+  button) ───────────────────────────────────────
  const insertBtn = document.getElementById('insert-btn');
  const insertMenu = document.getElementById('insert-menu');
  if (insertBtn && insertMenu) {
    insertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = insertMenu.classList.contains('visible');
      if (isOpen) {
        insertMenu.classList.remove('visible');
      } else {
        // Position menu relative to button, adapting to toolbar edge
        const btnRect = insertBtn.getBoundingClientRect();
        const toolbarEl = document.getElementById('floating-toolbar');
        const toolbarRect = toolbarEl ? toolbarEl.getBoundingClientRect() : btnRect;
        // Reset positioning
        insertMenu.style.left = '';
        insertMenu.style.right = '';
        insertMenu.style.top = '';
        insertMenu.style.bottom = '';
        if (toolbarEl?.classList.contains('toolbar-docked-bottom')) {
          // Open above when toolbar at bottom
          insertMenu.style.left = (btnRect.left - toolbarRect.left) + 'px';
          insertMenu.style.bottom = (toolbarRect.bottom - btnRect.top + 4) + 'px';
        } else if (toolbarEl?.classList.contains('toolbar-docked-left')) {
          // Open to the right when toolbar at left
          insertMenu.style.left = (toolbarRect.right - toolbarRect.left + 4) + 'px';
          insertMenu.style.top = (btnRect.top - toolbarRect.top) + 'px';
        } else if (toolbarEl?.classList.contains('toolbar-docked-right')) {
          // Open to the left when toolbar at right
          insertMenu.style.right = (toolbarRect.right - toolbarRect.left + 4) + 'px';
          insertMenu.style.top = (btnRect.top - toolbarRect.top) + 'px';
        } else {
          // Default: open below (toolbar at top or floating)
          insertMenu.style.left = (btnRect.left - toolbarRect.left) + 'px';
          insertMenu.style.top = (btnRect.bottom - toolbarRect.top + 4) + 'px';
        }
        insertMenu.classList.add('visible');
      }
    });

    // Menu item click → insert shape at center
    insertMenu.querySelectorAll('.insert-menu-item[data-insert]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = item.dataset.insert;
        insertShapeAtCenter(type);
        insertMenu.classList.remove('visible');
      });
    });

    // Close menu on outside click
    document.addEventListener('pointerdown', (e) => {
      if (!insertMenu.contains(e.target) && e.target !== insertBtn) {
        insertMenu.classList.remove('visible');
      }
    });
  }

  // ── Toolbar: Drag-to-snap + Minimize ──────────────────────────────────
  const toolbar = document.getElementById('floating-toolbar');
  if (toolbar) {
    // ── Snap indicator element ──
    let snapIndicator = document.createElement('div');
    snapIndicator.className = 'toolbar-snap-indicator';
    snapIndicator.style.display = 'none';
    document.body.appendChild(snapIndicator);

    // Track drag state
    let isDragging = false;
    let gripPointerDown = false; // true between pointerdown and pointerup on grip
    let dragStartX = 0, dragStartY = 0;
    let toolbarStartX = 0, toolbarStartY = 0;
    let dragStartTbWidth = 0, dragStartTbHeight = 0; // toolbar dims at drag start (before orientation change)
    let lastSnapSide = null; // last snap side shown by indicator (null = no shadow visible)
    let cachedDragCanvasRect = null; // cached canvas rect during drag (avoids per-frame layout reads)
    const pointerHistory = [];
    const SNAP_THRESHOLD = 60;
    const SNAP_GAP = 10;
    const GRIP_DRAG_THRESHOLD = 5; // minimum px before grip counts as drag

    // ── Cached minimized dimensions (measured from DOM on first drag) ──
    let cachedMiniDims = null; // { w, h } — horizontal minimized dimensions

    /** Measure the real minimized toolbar dimensions by brief off-screen clone */
    function getMiniDims() {
      if (cachedMiniDims) return cachedMiniDims;
      // Temporarily apply minimized class, measure, and restore
      const wasMinimized = toolbar.classList.contains('toolbar-minimized');
      const wasDocked = toolbar.className.match(/toolbar-docked-(\w+)/)?.[1];
      // Ensure horizontal orientation for measurement
      toolbar.classList.remove('toolbar-docked-left', 'toolbar-docked-right');
      if (!toolbar.classList.contains('toolbar-docked-top') && !toolbar.classList.contains('toolbar-docked-bottom')) {
        toolbar.classList.add('toolbar-docked-bottom');
      }
      toolbar.classList.add('toolbar-minimized');
      const rect = toolbar.getBoundingClientRect();
      cachedMiniDims = { w: rect.width, h: rect.height };
      // Restore original state
      if (!wasMinimized) toolbar.classList.remove('toolbar-minimized');
      toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom');
      if (wasDocked) toolbar.classList.add(`toolbar-docked-${wasDocked}`);
      return cachedMiniDims;
    }

    /** Get the visible canvas bounding rect (excludes area behind panels) */
    function getCanvasRect() {
      const c = document.getElementById('fd-canvas');
      if (!c) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
      const cr = c.getBoundingClientRect();
      // The canvas grid column can extend behind panels (higher z-index).
      // Narrow the rect to the actual visible area between panels.
      const lp = document.getElementById('left-panel');
      const rp = document.getElementById('right-panel');
      let left = cr.left;
      let right = cr.right;
      if (lp) {
        const lpRight = lp.getBoundingClientRect().right;
        if (lpRight > left) left = lpRight;
      }
      if (rp) {
        const rpLeft = rp.getBoundingClientRect().left;
        if (rpLeft < right) right = rpLeft;
      }
      return { left, top: cr.top, right, bottom: cr.bottom, width: right - left, height: cr.height };
    }

    /** Detect which edge the toolbar should snap to.
     * Uses absolute pixel distance to the nearest edge — no aspect-ratio bias. */
    function getSnapSide(pointerX, pointerY, cr) {
      cr = cr || getCanvasRect();
      const distLeft = pointerX - cr.left;
      const distRight = cr.right - pointerX;
      const distTop = pointerY - cr.top;
      const distBottom = cr.bottom - pointerY;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      if (minDist === distLeft) return 'left';
      if (minDist === distRight) return 'right';
      if (minDist === distTop) return 'top';
      return 'bottom';
    }

    /** Read current docked side from DOM classes (source of truth) */
    function getCurrentDockedSide() {
      if (toolbar.classList.contains('toolbar-docked-left')) return 'left';
      if (toolbar.classList.contains('toolbar-docked-right')) return 'right';
      if (toolbar.classList.contains('toolbar-docked-top')) return 'top';
      return 'bottom';
    }

    // ── Decomposed snap functions (Fix #1: no recursion, no side-effects in query) ──

    /** Pure query: check if toolbar fits on given side.
     * Returns { fits, fitsMinimized } without mutating DOM. */
    function checkToolbarFit(side) {
      const cr = getCanvasRect();
      const isHoriz = side === 'top' || side === 'bottom';

      // Check expanded fit
      toolbar.classList.remove('toolbar-minimized');
      toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right');
      toolbar.classList.add(`toolbar-docked-${side}`);
      const tbRect = toolbar.getBoundingClientRect();
      const fits = isHoriz
        ? tbRect.width <= cr.width - 2 * SNAP_GAP
        : tbRect.height <= cr.height - 2 * SNAP_GAP;

      // Check minimized fit using cached dims
      const mini = getMiniDims();
      // Mini dims are always horizontal; swap for vertical
      const miniMajor = isHoriz ? mini.w : mini.h;
      const fitsMinimized = isHoriz
        ? miniMajor <= cr.width - 2 * SNAP_GAP
        : miniMajor <= cr.height - 2 * SNAP_GAP;

      return { fits, fitsMinimized, tbRect, cr };
    }

    /** Pure positioning: place toolbar on edge, clamped within canvas. No overflow logic. */
    function positionToolbar(side, dropX, dropY, grabOffsetX, grabOffsetY) {
      toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right', 'toolbar-dragging', 'toolbar-floating');
      toolbar.style.cssText = '';
      toolbar.style.visibility = 'visible';
      toolbar.classList.add(`toolbar-docked-${side}`);
      document.documentElement.dataset.toolbar = side;

      const tbRect = toolbar.getBoundingClientRect();
      const cr = getCanvasRect();

      if (side === 'top' || side === 'bottom') {
        let left;
        if (dropX != null && grabOffsetX != null) {
          const srcW = dragStartTbWidth || tbRect.width || 1;
          const grabRatioX = grabOffsetX / srcW;
          left = dropX - grabRatioX * tbRect.width;
        } else if (dropX != null) {
          left = dropX - tbRect.width / 2;
        } else {
          left = cr.left + (cr.width - tbRect.width) / 2;
        }
        left = Math.max(cr.left + SNAP_GAP, Math.min(left, cr.right - tbRect.width - SNAP_GAP));
        toolbar.style.position = 'fixed';
        toolbar.style.left = left + 'px';
        toolbar.style.top = side === 'top' ? (cr.top + SNAP_GAP) + 'px' : (cr.bottom - tbRect.height - SNAP_GAP) + 'px';
        toolbar.style.transform = 'none';
      } else {
        let top;
        if (dropY != null && grabOffsetY != null) {
          const srcH = dragStartTbHeight || tbRect.height || 1;
          const grabRatioY = grabOffsetY / srcH;
          top = dropY - grabRatioY * tbRect.height;
        } else if (dropY != null) {
          top = dropY - tbRect.height / 2;
        } else {
          top = cr.top + (cr.height - tbRect.height) / 2;
        }
        top = Math.max(cr.top + SNAP_GAP, Math.min(top, cr.bottom - tbRect.height - SNAP_GAP));
        toolbar.style.position = 'fixed';
        toolbar.style.top = top + 'px';
        toolbar.style.left = side === 'left' ? (cr.left + SNAP_GAP) + 'px' : (cr.right - tbRect.width - SNAP_GAP) + 'px';
        toolbar.style.transform = 'none';
      }
    }

    /** Orchestrator: snap toolbar to edge with overflow handling.
     * NO recursion. Preserves user's minimize state — only auto-minimizes on overflow. */
    function applyToolbarSnap(side, dropX, dropY, grabOffsetX, grabOffsetY) {
      const wasMinimized = toolbar.classList.contains('toolbar-minimized');
      const isHoriz = side === 'top' || side === 'bottom';
      const { fits, fitsMinimized } = checkToolbarFit(side);

      if (wasMinimized) {
        // User explicitly minimized — preserve state, just reposition
        toolbar.classList.add('toolbar-minimized');
      } else if (fits) {
        // Fits expanded — keep expanded
      } else if (fitsMinimized) {
        // Overflows expanded — auto-minimize on same edge
        toolbar.classList.add('toolbar-minimized');
        localStorage.setItem('fd-toolbar-minimized', '1');
      } else {
        // Doesn't fit even minimized — try opposite axis minimized
        const oppSide = isHoriz ? 'left' : 'top';
        const { fitsMinimized: oppFitsMini } = checkToolbarFit(oppSide);
        if (oppFitsMini) {
          toolbar.classList.add('toolbar-minimized');
          localStorage.setItem('fd-toolbar-minimized', '1');
          positionToolbar(oppSide, isHoriz ? null : dropX, isHoriz ? dropY : null, grabOffsetX, grabOffsetY);
          localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: oppSide, x: dropX, y: dropY }));
          requestAnimationFrame(() => api.adjustMinimapForToolbar());
          return;
        }
        // Last resort: keep minimized on original side, accept overflow
        toolbar.classList.add('toolbar-minimized');
        localStorage.setItem('fd-toolbar-minimized', '1');
      }

      positionToolbar(side, dropX, dropY, grabOffsetX, grabOffsetY);
      localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side, x: dropX, y: dropY }));
      requestAnimationFrame(() => api.adjustMinimapForToolbar());
    }

    /** Re-clamp toolbar to canvas bounds (call on panel toggle / resize).
     * Fix #4: auto-restore if toolbar is minimized but now fits expanded. */
    function reclampToolbar() {
      if (isDragging) return;
      const saved = parseToolbarPos();
      const side = saved ? saved.side : 'bottom';

      // Auto-restore: if minimized, check if expanded toolbar now fits
      if (toolbar.classList.contains('toolbar-minimized')) {
        const { fits } = checkToolbarFit(side);
        if (fits) {
          toolbar.classList.remove('toolbar-minimized');
          localStorage.setItem('fd-toolbar-minimized', '0');
        }
      }

      positionToolbar(side, saved?.x, saved?.y);
      requestAnimationFrame(() => api.adjustMinimapForToolbar());
    }
    // Expose for panel toggle code to call
    window.__fdReclampToolbar = reclampToolbar;

    /** Parse saved toolbar position with migration from old string format */
    function parseToolbarPos() {
      const raw = localStorage.getItem('fd-toolbar-pos');
      if (!raw) return { side: 'bottom', x: null, y: null };
      try {
        const obj = JSON.parse(raw);
        if (obj && obj.side) return obj;
      } catch (_) {}
      // Migration: old format was just a string like 'top'
      if (['top', 'bottom', 'left', 'right'].includes(raw)) {
        return { side: raw, x: null, y: null };
      }
      return { side: 'bottom', x: null, y: null };
    }

    function showSnapIndicator(side, pointerX, pointerY, grabOffsetX, grabOffsetY, cachedCr, cachedTbDims) {
      lastSnapSide = side; // track for pointerup
      if (side) {
        const tbRect = cachedTbDims || toolbar.getBoundingClientRect();
        const cr = cachedCr || getCanvasRect();
        // If the target snap edge enforces a different orientation than current, swap dimensions for the shadow
        let gw = tbRect.width, gh = tbRect.height;
        const isCurrentlyHorizontal = gw >= gh;
        const isTargetHorizontal = side === 'top' || side === 'bottom';
        if (isCurrentlyHorizontal !== isTargetHorizontal) {
          gw = tbRect.height;
          gh = tbRect.width;
        }

        // Fix #2: Use DOM-measured minimized dimensions instead of hardcoded guesses
        const wouldOverflow = isTargetHorizontal
          ? gw > cr.width - 2 * SNAP_GAP
          : gh > cr.height - 2 * SNAP_GAP;
        if (wouldOverflow && !toolbar.classList.contains('toolbar-minimized')) {
          const mini = getMiniDims();
          // mini is horizontal (w=major, h=minor)
          gw = isTargetHorizontal ? mini.w : mini.h;
          gh = isTargetHorizontal ? mini.h : mini.w;
        }

        snapIndicator.style.display = 'block';
        snapIndicator.style.width = gw + 'px';
        snapIndicator.style.height = gh + 'px';
        const srcW = dragStartTbWidth || tbRect.width || 1;
        const srcH = dragStartTbHeight || tbRect.height || 1;
        const grabRatioX = (grabOffsetX || 0) / srcW;
        const grabRatioY = (grabOffsetY || 0) / srcH;
        const offsetAlongW = grabRatioX * gw;
        const offsetAlongH = grabRatioY * gh;
        if (side === 'top' || side === 'bottom') {
          const left = Math.max(cr.left + SNAP_GAP, Math.min(pointerX - offsetAlongW, cr.right - gw - SNAP_GAP));
          snapIndicator.style.left = left + 'px';
          snapIndicator.style.top = side === 'top' ? (cr.top + SNAP_GAP) + 'px' : (cr.bottom - gh - SNAP_GAP) + 'px';
        } else {
          const top = Math.max(cr.top + SNAP_GAP, Math.min(pointerY - offsetAlongH, cr.bottom - gh - SNAP_GAP));
          snapIndicator.style.left = side === 'left' ? (cr.left + SNAP_GAP) + 'px' : (cr.right - gw - SNAP_GAP) + 'px';
          snapIndicator.style.top = top + 'px';
        }
      } else {
        snapIndicator.style.display = 'none';
      }
    }

    // ── Drag start ──
    toolbar.querySelectorAll('.toolbar-grip').forEach(grip => {
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Clear DTC state — user is dragging toolbar, not creating a shape.
        dtcTool = '';
        dtcActive = false;
        gripPointerDown = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = toolbar.getBoundingClientRect();
        toolbarStartX = rect.left;
        toolbarStartY = rect.top;
        dragStartTbWidth = rect.width;
        dragStartTbHeight = rect.height;
        lastSnapSide = null;
        pointerHistory.length = 0;
        // Eagerly cache minimized dims on first drag
        getMiniDims();
        // Cache canvas rect to avoid per-frame layout reads during drag
        cachedDragCanvasRect = getCanvasRect();
        grip.setPointerCapture(e.pointerId);
      });

      // ── Double-click to minimize/expand (Hybrid Cascade) ──
      grip.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const gripEl = e.currentTarget;
        const gripBefore = gripEl.getBoundingClientRect();
        const isMinimized = toolbar.classList.contains('toolbar-minimized');

        if (isMinimized) {
          // ── EXPAND: Hybrid Cascade ──
          const currentSide = getCurrentDockedSide();
          const isHoriz = currentSide === 'top' || currentSide === 'bottom';

          // Step 1: Does it fit expanded on current edge?
          const { fits } = checkToolbarFit(currentSide);
          if (fits) {
            toolbar.classList.remove('toolbar-minimized');
          } else {
            // Step 2: Would it fit if we collapsed a panel?
            const h = document.documentElement;
            const lpOpen = h.dataset.lp === 'open';
            const rpOpen = h.dataset.rp === 'open';
            const collapseLeft = lpOpen && (currentSide === 'left' || currentSide === 'top' || currentSide === 'bottom');
            const collapseRight = rpOpen && !collapseLeft;
            const panelWidth = collapseLeft
              ? (parseInt(h.style.getPropertyValue('--left-panel-width'), 10) || 260)
              : collapseRight
                ? (parseInt(h.style.getPropertyValue('--right-panel-width'), 10) || 260)
                : 0;
            const cr = getCanvasRect();
            const expandedRect = toolbar.getBoundingClientRect();
            const wouldFitAfterCollapse = isHoriz
              ? expandedRect.width <= (cr.width + panelWidth) - 2 * SNAP_GAP
              : expandedRect.height <= (cr.height + panelWidth) - 2 * SNAP_GAP;

            if (wouldFitAfterCollapse && (collapseLeft || collapseRight)) {
              toolbar.classList.remove('toolbar-minimized');
              if (collapseLeft) api.toggleLeftPanel();
              else api.toggleRightPanel();
            } else {
              // Step 3: Would it fit on opposite axis?
              const oppSide = isHoriz ? 'left' : 'top';
              const { fits: oppFits } = checkToolbarFit(oppSide);
              if (oppFits) {
                toolbar.classList.remove('toolbar-minimized');
                localStorage.setItem('fd-toolbar-minimized', '0');
                positionToolbar(oppSide, null, null);
                localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: oppSide, x: null, y: null }));
                api.adjustMinimapForToolbar();
                return;
              } else {
                // Step 4: Soft block
                toolbar.classList.add('toolbar-minimized');
                api.showToast('Close a panel or widen your window to expand');
                return;
              }
            }
          }
        } else {
          // ── MINIMIZE ──
          toolbar.classList.add('toolbar-minimized');
        }

        localStorage.setItem('fd-toolbar-minimized', toolbar.classList.contains('toolbar-minimized') ? '1' : '0');
        // Grip-anchored positioning: keep grip stationary
        const gripAfter = gripEl.getBoundingClientRect();
        const tbRect2 = toolbar.getBoundingClientRect();
        const deltaX = gripBefore.left - gripAfter.left;
        const deltaY = gripBefore.top - gripAfter.top;
        let newLeft = tbRect2.left + deltaX;
        let newTop = tbRect2.top + deltaY;
        const cr2 = getCanvasRect();
        newLeft = Math.max(cr2.left + SNAP_GAP, Math.min(newLeft, cr2.right - tbRect2.width - SNAP_GAP));
        newTop = Math.max(cr2.top + SNAP_GAP, Math.min(newTop, cr2.bottom - tbRect2.height - SNAP_GAP));
        toolbar.style.left = newLeft + 'px';
        toolbar.style.top = newTop + 'px';
        toolbar.style.transform = 'none';
        const finalSide = getCurrentDockedSide();
        localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: finalSide, x: newLeft + tbRect2.width / 2, y: newTop + tbRect2.height / 2 }));
        api.adjustMinimapForToolbar();
      });
    });

    // ── Drag move ──
    document.addEventListener('pointermove', (e) => {
      // Deferred drag start — enter drag mode only after exceeding threshold
      if (gripPointerDown && !isDragging) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) >= GRIP_DRAG_THRESHOLD) {
          isDragging = true;
          const currentDirection = getComputedStyle(toolbar).flexDirection;
          toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right');
          toolbar.classList.add('toolbar-dragging');
          toolbar.style.left = toolbarStartX + 'px';
          toolbar.style.top = toolbarStartY + 'px';
          toolbar.style.transform = 'translate3d(0, 0, 0)';
          toolbar.style.right = 'auto';
          toolbar.style.bottom = 'auto';
          toolbar.style.flexDirection = currentDirection;
        }
        return;
      }
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      toolbar.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;

      // Track velocity
      pointerHistory.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      if (pointerHistory.length > 5) pointerHistory.shift();

      // Show snap indicator — always shows since getSnapSide always returns a side
      const grabOffX = dragStartX - toolbarStartX;
      const grabOffY = dragStartY - toolbarStartY;
      const cachedTbDims = { width: dragStartTbWidth, height: dragStartTbHeight };
      showSnapIndicator(getSnapSide(e.clientX, e.clientY, cachedDragCanvasRect), e.clientX, e.clientY, grabOffX, grabOffY, cachedDragCanvasRect, cachedTbDims);
    });

    // ── Drag end / snap ──
    document.addEventListener('pointerup', (e) => {
      // Grip click (no drag) — toolbar never left docked state, just clear flag
      if (gripPointerDown && !isDragging) {
        gripPointerDown = false;
        return;
      }
      if (!isDragging) return;
      isDragging = false;
      gripPointerDown = false;
      cachedDragCanvasRect = null;

      // Compute grab offset for snap positioning
      const grabOffX = dragStartX - toolbarStartX;
      const grabOffY = dragStartY - toolbarStartY;

      // Always snap to nearest orientation-locked edge (no floating mode)
      const side = getSnapSide(e.clientX, e.clientY);
      showSnapIndicator(null); // hide the indicator
      applyToolbarSnap(side, e.clientX, e.clientY, grabOffX, grabOffY);
    });

    // ── Restore saved state (suppress transition to avoid startup jump) ──
    toolbar.style.transition = 'none';
    const savedPos = parseToolbarPos();
    // Migrate any old 'floating' state to 'bottom'
    const restoreSide = savedPos.side === 'floating' ? 'bottom' : savedPos.side;
    // Use positionToolbar (no overflow logic) — let reclamp handle it after layout settles
    positionToolbar(restoreSide, savedPos.x, savedPos.y);
    toolbar.style.visibility = 'visible'; // reveal after JS positioned it
    if (localStorage.getItem('fd-toolbar-minimized') === '1') {
      toolbar.classList.add('toolbar-minimized');
    }
    // Double-rAF: re-enable transitions and reclamp after layout settles (Fix #8)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toolbar.style.transition = '';
        reclampToolbar(); // now panels are settled, safe to check overflow
      });
    });

    // ── Re-clamp on window resize ──
    window.addEventListener('resize', () => requestAnimationFrame(() => reclampToolbar()));
  }
}

/** Default dimensions for each shape type (arrow excluded — needs two anchors).
 *  Module-scope so drawDtcPreview() can access them from renderCanvas(). */
export const DTC_SIZES = {
  rect: [120, 80], ellipse: [90, 90], text: [80, 24],
  frame: [200, 150], pen: [120, 80]
};

/** Draw the drag-to-create preview shape on the canvas in scene coordinates.
 *  Since renderCanvas() already applies the zoom/pan transform, the shape
 *  automatically appears at the correct screen size — true WYSIWYG.
 *
 * @param {CanvasRenderingContext2D} canvasCtx 
 * @param {object} dtcPreview 
 * @param {object} smartDefaults 
 * @param {number} zoomLevel 
 */
export function drawDtcPreview(canvasCtx, dtcPreview, smartDefaults, zoomLevel) {
  if (!dtcPreview) return;
  const { type, sceneX, sceneY } = dtcPreview;
  const [w, h] = DTC_SIZES[type] || [100, 80];
  const x = sceneX - w / 2;
  const y = sceneY - h / 2;

  // Use actual default styles (same as insertShapeAt applies)
  const isDarkNow = document.body.classList.contains('dark-theme');
  const defaultFill = smartDefaults.fill || (isDarkNow ? '#2C2C2E' : '#F0F0F0');
  const defaultStroke = smartDefaults.stroke || (isDarkNow ? '#CCCCCC' : '#333333');
  const strokeWidth = (smartDefaults.strokeWidth || 1.5) / zoomLevel;
  const cornerRadius = smartDefaults.cornerRadius || 8;

  canvasCtx.save();
  canvasCtx.globalAlpha = 0.6;

  if (type === 'ellipse') {
    canvasCtx.beginPath();
    canvasCtx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    canvasCtx.fillStyle = defaultFill;
    canvasCtx.fill();
    canvasCtx.strokeStyle = defaultStroke;
    canvasCtx.lineWidth = strokeWidth;
    canvasCtx.stroke();
  } else if (type === 'text') {
    const fontSize = 14 / zoomLevel;
    canvasCtx.font = `${fontSize}px Inter, sans-serif`;
    canvasCtx.fillStyle = isDarkNow ? '#FFFFFF' : '#1C1C1E';
    canvasCtx.textAlign = 'left';
    canvasCtx.textBaseline = 'middle';
    canvasCtx.fillText('Text', x, y + h / 2);
  } else {
    // Default: rect or frame
    canvasCtx.beginPath();
    canvasCtx.roundRect(x, y, w, h, cornerRadius / zoomLevel);
    canvasCtx.fillStyle = defaultFill;
    canvasCtx.fill();
    canvasCtx.strokeStyle = defaultStroke;
    canvasCtx.lineWidth = strokeWidth;
    canvasCtx.stroke();
  }
  canvasCtx.restore();
}
