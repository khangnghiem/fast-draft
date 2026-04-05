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

    // ── Cached logical dimensions (independent of orientation) ──
    let cachedMiniDims = null; // { major, minor }
    let cachedExpandedMajor = 0;
    let cachedExpandedMinor = 0;

    /** Measure the real minimized toolbar dimensions mathematically safely */
    function getMiniDims() {
      if (cachedMiniDims) return cachedMiniDims;
      const wasMinimized = toolbar.classList.contains('toolbar-minimized');
      if (!wasMinimized) toolbar.classList.add('toolbar-minimized');
      const w = toolbar.offsetWidth;
      const h = toolbar.offsetHeight;
      cachedMiniDims = { major: Math.max(w, h), minor: Math.min(w, h) };
      if (!wasMinimized) toolbar.classList.remove('toolbar-minimized');
      return cachedMiniDims;
    }

    /** Ensure we know the expanded dims without dirtying DOM during drag */
    function getExpandedDims() {
      if (cachedExpandedMajor) return { major: cachedExpandedMajor, minor: cachedExpandedMinor };
      const wasMinimized = toolbar.classList.contains('toolbar-minimized');
      if (wasMinimized) toolbar.classList.remove('toolbar-minimized');
      const w = toolbar.offsetWidth;
      const h = toolbar.offsetHeight;
      cachedExpandedMajor = Math.max(w, h);
      cachedExpandedMinor = Math.min(w, h);
      if (wasMinimized) toolbar.classList.add('toolbar-minimized');
      return { major: cachedExpandedMajor, minor: cachedExpandedMinor };
    }

    /** Get the visible canvas bounding rect (excludes area behind open panels) */
    function getCanvasRect() {
      const c = document.getElementById('fd-canvas');
      if (!c) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
      const cr = c.getBoundingClientRect();
      const h = document.documentElement;
      let left = cr.left, right = cr.right;
      if (h.dataset.lp === 'open') {
        const lp = document.getElementById('left-panel');
        if (lp) left = Math.max(left, lp.getBoundingClientRect().right);
      }
      if (h.dataset.rp === 'open') {
        const rp = document.getElementById('right-panel');
        if (rp) right = Math.min(right, rp.getBoundingClientRect().left);
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

    /** Get all canvas chrome elements that toolbar must not overlap */
    function getExclusionRects() {
      const ids = [
        'chrome-left',           // sidebar toggle group
        'chrome-right',          // export + settings + hamburger
        'minimap-container',     // minimap widget
      ];
      return ids.map(id => document.getElementById(id))
        .filter(el => el && el.offsetParent !== null && typeof el.getBoundingClientRect === 'function')
        .map(el => el.getBoundingClientRect());
    }

    /** Check if a proposed toolbar rect overlaps any exclusion zone */
    function overlapsExclusion(tbRect, exclusions, gap = 8) {
      return exclusions.some(ex => !(
        tbRect.right + gap < ex.left ||
        tbRect.left - gap > ex.right ||
        tbRect.bottom + gap < ex.top ||
        tbRect.top - gap > ex.bottom
      ));
    }

    // ── Decomposed snap functions (Fix #1: no recursion, no side-effects in query) ──

    /** Pure mathematical query: check if toolbar fits on given side, and doesn't overlap exclusion zones. */
    function checkToolbarFit(side) {
      const cr = getCanvasRect();
      const isHoriz = side === 'top' || side === 'bottom';

      // 1. Get mathematical expanded dimensions based on side
      const exp = getExpandedDims();
      const tbRect = {
        width: isHoriz ? exp.major : exp.minor,
        height: isHoriz ? exp.minor : exp.major,
      };
      
      // 2. Strict physical viewport bounds checking
      let fits = true;
      if (isHoriz) {
        if (tbRect.width > cr.width - 2 * SNAP_GAP) fits = false;
      } else {
        if (tbRect.height > cr.height - 2 * SNAP_GAP) fits = false;
      }

      // 3. Mathematical intersection checking against safe exclusion zones
      if (fits) {
        const exclusions = getExclusionRects();
        let reserveTop = 0, reserveBottom = 0, reserveLeft = 0, reserveRight = 0;
        
        exclusions.forEach(ex => {
          // If the exclusion is near the target edge, we consider it reserving space
          const isNearTop = ex.top < cr.top + 100;
          const isNearBottom = ex.bottom > cr.bottom - 100;
          const isNearLeft = ex.left < cr.left + 100;
          const isNearRight = ex.right > cr.right - 100;
          
          if (side === 'left' || side === 'right') {
             if (isNearTop) reserveTop = Math.max(reserveTop, ex.bottom - cr.top);
             if (isNearBottom) reserveBottom = Math.max(reserveBottom, cr.bottom - ex.top);
          }
          if (side === 'top' || side === 'bottom') {
             if (isNearLeft) reserveLeft = Math.max(reserveLeft, ex.right - cr.left);
             if (isNearRight) reserveRight = Math.max(reserveRight, cr.right - ex.left);
          }
        });

        if (side === 'left' && tbRect.height > cr.height - reserveTop - reserveBottom - 2 * SNAP_GAP) fits = false;
        if (side === 'right' && tbRect.height > cr.height - reserveTop - reserveBottom - 2 * SNAP_GAP) fits = false;
        if (side === 'top' && tbRect.width > cr.width - reserveLeft - reserveRight - 2 * SNAP_GAP) fits = false;
        if (side === 'bottom' && tbRect.width > cr.width - reserveLeft - reserveRight - 2 * SNAP_GAP) fits = false;
      }

      // Check minimized fit using cached dims similarly
      const mini = getMiniDims();
      const fitsMinimized = isHoriz
        ? mini.major <= cr.width - 2 * SNAP_GAP
        : mini.major <= cr.height - 2 * SNAP_GAP;

      return { fits, fitsMinimized, tbRect, cr };
    }

    /** Pure positioning: set CSS variables for toolbar offsets, letting CSS rule calculate relative center */
    function positionToolbar(side, dropX, dropY, grabOffsetX, grabOffsetY, ratio) {
      toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right', 'toolbar-dragging', 'toolbar-floating');
      toolbar.classList.add(`toolbar-docked-${side}`);
      document.documentElement.dataset.toolbar = side;

      // Clear explicit styles letting CSS define dimensions before measuring
      toolbar.style.left = '';
      toolbar.style.top = '';
      toolbar.style.right = '';
      toolbar.style.bottom = '';
      toolbar.style.transform = '';
      toolbar.style.flexDirection = ''; // Clear inline flex-direction to allow CSS orientation
      
      if (dropX != null || dropY != null || ratio != null) {
        const tbRect = toolbar.getBoundingClientRect();
        const cr = getCanvasRect();

        if (side === 'top' || side === 'bottom') {
          let rx;
          if (ratio != null && ratio <= 1 && ratio >= 0) {
            rx = ratio; // Migrate or use exact ratio
          } else {
            let left;
            if (dropX != null && grabOffsetX != null) {
              const srcW = dragStartTbWidth || tbRect.width || 1;
              left = dropX - (grabOffsetX / srcW) * tbRect.width;
            } else if (dropX != null) {
              left = dropX - tbRect.width / 2;
            } else {
              // Legacy absolute edgeOffset handling or undefined fallback
              left = cr.left + (ratio || (cr.width / 2)) - tbRect.width / 2;
            }
            let offset_x = left + tbRect.width / 2 - cr.left;
            rx = cr.width > 0 ? offset_x / cr.width : 0.5;
          }

          // Bounds Constraint Avoidance
          let minRx = 0; let maxRx = 1;
          if (cr.width > 0) {
            const halfW = tbRect.width / 2;
            const padX = SNAP_GAP;
            minRx = (halfW + padX) / cr.width;
            maxRx = (cr.width - halfW - padX) / cr.width;
            
            // Dynamic exclusions constraint
            const exclusions = getExclusionRects();
            exclusions.forEach(ex => {
              const tbTop = side === 'top' ? cr.top : cr.bottom - tbRect.height;
              const tbBottom = tbTop + tbRect.height;
              const gap = 8;
              const overlapsY = !(tbBottom + gap < ex.top || tbTop - gap > ex.bottom);
              if (overlapsY) {
                if (ex.left < cr.left + cr.width/2) {
                   minRx = Math.max(minRx, (ex.right - cr.left + halfW + gap) / cr.width);
                } else {
                   maxRx = Math.min(maxRx, (ex.left - cr.left - halfW - gap) / cr.width);
                }
              }
            });
          }
          rx = Math.max(minRx, Math.min(maxRx, rx));
          
          toolbar.style.setProperty('--tb-offset-rx', rx.toString());
          toolbar.style.removeProperty('--tb-offset-ry');
        } else {
          let ry;
          if (ratio != null && ratio <= 1 && ratio >= 0) {
            ry = ratio;
          } else {
            let top;
            if (dropY != null && grabOffsetY != null) {
              const srcH = dragStartTbHeight || tbRect.height || 1;
              top = dropY - (grabOffsetY / srcH) * tbRect.height;
            } else if (dropY != null) {
              top = dropY - tbRect.height / 2;
            } else {
              top = cr.top + (ratio || (cr.height / 2)) - tbRect.height / 2;
            }
            let offset_y = top + tbRect.height / 2 - cr.top;
            ry = cr.height > 0 ? offset_y / cr.height : 0.5;
          }

          // Bounds Constraint Avoidance
          let minRy = 0; let maxRy = 1;
          if (cr.height > 0) {
            const halfH = tbRect.height / 2;
            const padY = SNAP_GAP; // padding from top/bottom
            minRy = (halfH + padY) / cr.height;
            maxRy = (cr.height - halfH - padY) / cr.height;
            
            // Dynamic exclusions constraint
            const exclusions = getExclusionRects();
            exclusions.forEach(ex => {
              const tbLeft = side === 'left' ? cr.left : cr.right - tbRect.width;
              const tbRight = tbLeft + tbRect.width;
              const gap = 8;
              const overlapsX = !(tbRight + gap < ex.left || tbLeft - gap > ex.right);
              if (overlapsX) {
                if (ex.top < cr.top + cr.height/2) {
                   minRy = Math.max(minRy, (ex.bottom - cr.top + halfH + gap) / cr.height);
                } else {
                   maxRy = Math.min(maxRy, (ex.top - cr.top - halfH - gap) / cr.height);
                }
              }
            });
          }
          ry = Math.max(minRy, Math.min(maxRy, ry));

          toolbar.style.setProperty('--tb-offset-ry', ry.toString());
          toolbar.style.removeProperty('--tb-offset-rx');
        }
      } else {
        toolbar.style.removeProperty('--tb-offset-rx');
        toolbar.style.removeProperty('--tb-offset-ry');
      }
      // Visibility is handled globally
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
          
          const oppDropX = isHoriz ? null : dropX;
          const oppDropY = isHoriz ? dropY : null;

          positionToolbar(oppSide, oppDropX, oppDropY, grabOffsetX, grabOffsetY, null);
          const oppRatio = (oppSide === 'top' || oppSide === 'bottom') 
             ? parseFloat(toolbar.style.getPropertyValue('--tb-offset-rx') || '0.5')
             : parseFloat(toolbar.style.getPropertyValue('--tb-offset-ry') || '0.5');
          localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: oppSide, edgeOffset: oppRatio }));
          requestAnimationFrame(() => api.adjustMinimapForToolbar());
          return;
        }
        // Last resort: keep minimized on original side, accept overflow
        toolbar.classList.add('toolbar-minimized');
        localStorage.setItem('fd-toolbar-minimized', '1');
      }

      positionToolbar(side, dropX, dropY, grabOffsetX, grabOffsetY, null);
      const ratio = (side === 'top' || side === 'bottom') 
         ? parseFloat(toolbar.style.getPropertyValue('--tb-offset-rx') || '0.5')
         : parseFloat(toolbar.style.getPropertyValue('--tb-offset-ry') || '0.5');
      localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side, edgeOffset: ratio }));
      requestAnimationFrame(() => api.adjustMinimapForToolbar());
    }

    /** Re-clamp toolbar to canvas bounds (call on panel toggle / resize).
     * Auto-minimizes if squeezed, auto-restores with hysteresis if space frees up. */
    function reclampToolbar() {
      if (isDragging) return;
      const saved = parseToolbarPos();
      const side = saved ? saved.side : 'bottom';

      const isMinimized = toolbar.classList.contains('toolbar-minimized');
      const isUserMinimized = localStorage.getItem('fd-toolbar-user-minimized') === '1';
      
      const { fits } = checkToolbarFit(side);

      if (!isMinimized && !fits) {
        // Space shrunk, auto-minimize
        toolbar.classList.add('toolbar-minimized');
        localStorage.setItem('fd-toolbar-minimized', '1');
      } else if (isMinimized && !isUserMinimized) {
        // Auto-restore only if user didn't explicitly minimize, and we have comfortable room
        const cr = getCanvasRect();
        const tbRect = toolbar.getBoundingClientRect();
        // Measure expanded width - temporarily remove class
        toolbar.classList.remove('toolbar-minimized');
        const expandedTb = toolbar.getBoundingClientRect();
        toolbar.classList.add('toolbar-minimized'); // Restore class until we decide
        
        const isHoriz = side === 'top' || side === 'bottom';
        // Add 40px hysteresis buffer
        const RESTORE_THRESHOLD = 40;
        const available = isHoriz ? cr.width : cr.height;
        const needed = isHoriz ? expandedTb.width : expandedTb.height;

        if (available >= needed + 2 * SNAP_GAP + RESTORE_THRESHOLD) {
          toolbar.classList.remove('toolbar-minimized');
          localStorage.setItem('fd-toolbar-minimized', '0');
        }
      }

      positionToolbar(side, null, null, null, null, saved?.edgeOffset);
      requestAnimationFrame(() => api.adjustMinimapForToolbar());
    }
    // Expose for panel toggle code to call
    window.__fdReclampToolbar = reclampToolbar;

    /** Parse saved toolbar position with migration from old string format */
    function parseToolbarPos() {
      const raw = localStorage.getItem('fd-toolbar-pos');
      if (!raw) return { side: 'bottom', edgeOffset: null };
      try {
        const obj = JSON.parse(raw);
        if (obj && obj.side) {
          // Migrate old rx/ry to edgeOffset if needed based on current canvas rect
          if (obj.edgeOffset === undefined && (obj.rx !== undefined || obj.ry !== undefined)) {
             const cr = getCanvasRect();
             if ((obj.side === 'top' || obj.side === 'bottom') && obj.rx != null) {
                obj.edgeOffset = cr.width * obj.rx;
             } else if ((obj.side === 'left' || obj.side === 'right') && obj.ry != null) {
                obj.edgeOffset = cr.height * obj.ry;
             }
          }
          return { side: obj.side, edgeOffset: obj.edgeOffset };
        }
      } catch (_) {}
      // Migration: old format was just a string like 'top'
      if (['top', 'bottom', 'left', 'right'].includes(raw)) {
        return { side: raw, edgeOffset: null };
      }
      return { side: 'bottom', edgeOffset: null };
    }

    function showSnapIndicator(side, pointerX, pointerY, grabOffsetX, grabOffsetY, cachedCr, cachedTbDims) {
      lastSnapSide = side; // track for pointerup
      if (side) {
        const { fits, tbRect, cr } = checkToolbarFit(side);
        const isTargetHorizontal = side === 'top' || side === 'bottom';
        let gw = tbRect.width;
        let gh = tbRect.height;

        if (!fits && !toolbar.classList.contains('toolbar-minimized')) {
          const mini = getMiniDims();
          gw = isTargetHorizontal ? mini.major : mini.minor;
          gh = isTargetHorizontal ? mini.minor : mini.major;
        }

        snapIndicator.style.display = 'block';
        snapIndicator.style.width = gw + 'px';
        snapIndicator.style.height = gh + 'px';
        const exp = getExpandedDims();
        const srcW = dragStartTbWidth || exp.major || 1;
        const srcH = dragStartTbHeight || exp.minor || 1;
        const grabRatioX = (grabOffsetX || 0) / srcW;
        const grabRatioY = (grabOffsetY || 0) / srcH;
        const offsetAlongW = grabRatioX * gw;
        const offsetAlongH = grabRatioY * gh;
        const exclusions = getExclusionRects();
        
        if (side === 'top' || side === 'bottom') {
          let left = Math.max(cr.left + SNAP_GAP, Math.min(pointerX - offsetAlongW, cr.right - gw - SNAP_GAP));
          const tbTop = side === 'top' ? cr.top : cr.bottom - gh;
          const tbBottom = tbTop + gh;
          exclusions.forEach(ex => {
            const gap = 8;
            if (!(tbBottom + gap < ex.top || tbTop - gap > ex.bottom)) {
              if (ex.left < cr.left + cr.width/2) {
                 left = Math.max(left, ex.right + gap);
              } else {
                 left = Math.min(left, ex.left - gw - gap);
              }
            }
          });
          snapIndicator.style.left = left + 'px';
          snapIndicator.style.top = side === 'top' ? (cr.top + SNAP_GAP) + 'px' : (cr.bottom - gh - SNAP_GAP) + 'px';
        } else {
          let top = Math.max(cr.top + SNAP_GAP, Math.min(pointerY - offsetAlongH, cr.bottom - gh - SNAP_GAP));
          const tbLeft = side === 'left' ? cr.left : cr.right - gw;
          const tbRight = tbLeft + gw;
          exclusions.forEach(ex => {
            const gap = 8;
            if (!(tbRight + gap < ex.left || tbLeft - gap > ex.right)) {
              if (ex.top < cr.top + cr.height/2) {
                 top = Math.max(top, ex.bottom + gap);
              } else {
                 top = Math.min(top, ex.top - gh - gap);
              }
            }
          });
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

      // ── Shared minimize/expand cascade (reused by dblclick + swipe) ──
      function toggleMinimize(gripEl) {
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
                positionToolbar(oppSide, null, null, null, null, null);
                const oppRatio = (oppSide === 'top' || oppSide === 'bottom') 
                   ? parseFloat(toolbar.style.getPropertyValue('--tb-offset-rx') || '0.5')
                   : parseFloat(toolbar.style.getPropertyValue('--tb-offset-ry') || '0.5');
                localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: oppSide, edgeOffset: oppRatio }));
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
          localStorage.setItem('fd-toolbar-user-minimized', '1');
        }

        if (!toolbar.classList.contains('toolbar-minimized')) {
           localStorage.removeItem('fd-toolbar-user-minimized');
        }
        localStorage.setItem('fd-toolbar-minimized', toolbar.classList.contains('toolbar-minimized') ? '1' : '0');

        // Let positionToolbar calculate the ratio based on the approximate target center point
        const tbRect2 = toolbar.getBoundingClientRect();
        const deltaX = gripBefore.left - gripAfter.left;
        const deltaY = gripBefore.top - gripAfter.top;
        const dropX = tbRect2.left + deltaX + tbRect2.width / 2;
        const dropY = tbRect2.top + deltaY + tbRect2.height / 2;
        
        const finalSide = getCurrentDockedSide();
        positionToolbar(finalSide, dropX, dropY, null, null, null);
        const ratio = (finalSide === 'top' || finalSide === 'bottom') 
           ? parseFloat(toolbar.style.getPropertyValue('--tb-offset-rx') || '0.5')
           : parseFloat(toolbar.style.getPropertyValue('--tb-offset-ry') || '0.5');
        localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: finalSide, edgeOffset: ratio }));
        api.adjustMinimapForToolbar();

        if (!toolbar.classList.contains('toolbar-minimized')) {
           requestAnimationFrame(() => reclampToolbar());
        }

        // #5: Haptic feedback — 10ms pulse on minimize/expand (silently ignored on desktop)
        if (navigator.vibrate) navigator.vibrate(10);

        // #6: Sync aria-expanded state for screen readers
        const isNowMinimized = toolbar.classList.contains('toolbar-minimized');
        toolbar.querySelectorAll('.toolbar-grip').forEach(g =>
          g.setAttribute('aria-expanded', isNowMinimized ? 'false' : 'true')
        );
      }

      // ── Double-click to minimize/expand (desktop) ──
      grip.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleMinimize(e.currentTarget);
      });

      // ── Keyboard: Enter/Space → toggle (accessibility #6) ──
      grip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleMinimize(grip);
        }
      });

      // ── Touch tap (mobile) + swipe (all platforms) ──
      // We use the touch API directly for maximum cross-device fidelity.
      // - Single tap on mobile (pointer.type === 'touch') → toggle (no dblclick needed)
      // - Short flick along minor axis (>30px minor, <80px major) → toggle on all platforms
      let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
      const SWIPE_MINOR_THRESHOLD = 30; // min displacement along collapse axis (px)
      const SWIPE_MAJOR_MAX = 80;       // max displacement along drag axis (px, so we don't confuse w/ reposition)
      const TAP_MAX_DURATION = 350;      // ms: longer than 350ms = drag attempt, not tap

      grip.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }, { passive: true });

      grip.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const totalDisplacement = Math.sqrt(dx * dx + dy * dy);
        const elapsed = Date.now() - touchStartTime;

        // ── Short tap: single tap on touch = toggle (mobile primary UX) ──
        if (totalDisplacement < 12 && elapsed < TAP_MAX_DURATION) {
          e.preventDefault();
          toggleMinimize(grip);
          return;
        }

        // ── Swipe gesture: collapse axis detection ──
        // Horizontal toolbar (top/bottom): swipe vertically to dismiss
        // Vertical toolbar (left/right): swipe horizontally to dismiss
        const currentSide = getCurrentDockedSide();
        const isHorizontalToolbar = currentSide === 'top' || currentSide === 'bottom';
        const minorDelta = isHorizontalToolbar ? Math.abs(dy) : Math.abs(dx);
        const majorDelta = isHorizontalToolbar ? Math.abs(dx) : Math.abs(dy);

        if (minorDelta >= SWIPE_MINOR_THRESHOLD && majorDelta <= SWIPE_MAJOR_MAX && elapsed < TAP_MAX_DURATION) {
          e.preventDefault();
          toggleMinimize(grip);
        }
      }, { passive: false });
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
      
      // FIRST: capture current visual position
      const firstRect = toolbar.getBoundingClientRect();
      
      // LAST: apply snap — changes CSS classes + intrinsic position
      applyToolbarSnap(side, e.clientX, e.clientY, grabOffX, grabOffY);
      
      const lastRect = toolbar.getBoundingClientRect();
      
      // INVERT: offset toolbar back to visual start position
      const dx = firstRect.left - lastRect.left;
      const dy = firstRect.top - lastRect.top;
      
      toolbar.style.transition = 'none';
      const baseTransform = (side === 'top' || side === 'bottom') ? 'translateX(-50%)' : 'translateY(-50%)';
      toolbar.style.transform = `${baseTransform} translate(${dx}px, ${dy}px)`;
      
      // PLAY: animate to final snapped position
      requestAnimationFrame(() => {
        toolbar.style.transition = 'left 0.25s cubic-bezier(0.25, 0.1, 0.25, 1), right 0.25s cubic-bezier(0.25, 0.1, 0.25, 1), top 0.25s cubic-bezier(0.25, 0.1, 0.25, 1), bottom 0.25s cubic-bezier(0.25, 0.1, 0.25, 1), transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)';
        toolbar.style.transform = ''; // clears inline so CSS takes over
        
        // Clean up inline transition after it finishes so original css rules apply
        setTimeout(() => {
           if (!isDragging) toolbar.style.transition = '';
        }, 300);
      });
    });

    // ── Restore saved state (suppress transition to avoid startup jump) ──
    toolbar.style.transition = 'none';
    const savedPos = parseToolbarPos();
    // Migrate any old 'floating' state to 'bottom'
    const restoreSide = savedPos.side === 'floating' ? 'bottom' : savedPos.side;
    // Use positionToolbar (no overflow logic) — let reclamp handle it after layout settles
    positionToolbar(restoreSide, null, null, null, null, savedPos.edgeOffset);
    toolbar.style.visibility = 'visible'; // reveal after JS positioned it
    if (localStorage.getItem('fd-toolbar-minimized') === '1') {
      toolbar.classList.add('toolbar-minimized');
      toolbar.querySelectorAll('.toolbar-grip').forEach(g => g.setAttribute('aria-expanded', 'false'));
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

  return {
    cancelDtc: () => {
      dtcTool = '';
      dtcActive = false;
    }
  };
}

/** Default dimensions for each shape type (arrow excluded — needs two anchors).
 *  Module-scope so drawDtcPreview() can access them from renderCanvas(). */
export const DTC_SIZES = {
  rect: [162, 100], ellipse: [128, 128], text: [80, 24],
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
