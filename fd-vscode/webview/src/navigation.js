// ─── navigation.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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
  document.getElementById("sm-spec-badge-toggle")?.addEventListener("click", (e) => {
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
  const specItem = document.getElementById("sm-spec-badge-toggle");
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

    // Commit final position — normalize to px now (not on pointerdown)
    const finalX = initialLeft + dx;
    const finalY = initialTop + dy;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const edge = computeSnap(finalX, finalY);

    let newPos = {};
    let newOrientation = "horizontal";

    if (edge === "right") {
      newOrientation = "vertical";
      newPos = { right: "2vw", top: Math.max(2, (finalY / viewH) * 100) + "vh" };
    } else if (edge === "left") {
      newOrientation = "vertical";
      newPos = { left: "calc(232px + 2vw)", top: Math.max(2, (finalY / viewH) * 100) + "vh" };
    } else if (edge === "top") {
      newOrientation = "horizontal";
      newPos = { top: "2vh", left: Math.max(2, (finalX / viewW) * 100) + "vw" };
    } else {
      newOrientation = "horizontal";
      newPos = { bottom: "1.5vh", left: Math.max(2, (finalX / viewW) * 100) + "vw" };
    }

    toolbar.classList.remove("horizontal", "vertical");
    toolbar.classList.add(newOrientation);

    toolbar.style.left = newPos.left || "auto";
    toolbar.style.right = newPos.right || "auto";
    toolbar.style.top = newPos.top || "auto";
    toolbar.style.bottom = newPos.bottom || "auto";

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

  const ghostShapes = {
    rect: { w: 120, h: 80, css: "border-radius:8px;" },
    ellipse: { w: 100, h: 100, css: "border-radius:50%;" },
    pen: { w: 80, h: 60, css: "border-radius:4px;" },
    arrow: { w: 120, h: 2, css: "" },
    text: { w: 60, h: 28, css: "border-radius:4px;" },
    frame: { w: 140, h: 100, css: "border-radius:4px;" },
  };

  function createGhost(tool) {
    const shape = ghostShapes[tool] || ghostShapes.rect;
    const el = document.createElement("div");
    el.className = "dtc-ghost";
    const isDark = document.body.classList.contains("dark-theme");
    const borderColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(51,51,51,0.5)";
    const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(51,51,51,0.06)";
    let content = "";
    if (tool === "text") {
      content = `<span style="font-size:14px;color:${borderColor};font-weight:500;">T</span>`;
    }
    if (tool === "arrow") {
      // Diagonal line ghost
      el.style.cssText = `
        position:fixed;pointer-events:none;z-index:10000;
        width:${shape.w}px;height:${shape.w}px;
        transform:translate(-50%,-50%);
        opacity:0.7;
      `;
      el.innerHTML = `<svg width="${shape.w}" height="${shape.w}" viewBox="0 0 ${shape.w} ${shape.w}" fill="none">
        <line x1="10" y1="${shape.w - 10}" x2="${shape.w - 10}" y2="10"
          stroke="${borderColor}" stroke-width="2" stroke-dasharray="6 4"/>
        <path d="M${shape.w - 30},10 L${shape.w - 10},10 L${shape.w - 10},30"
          stroke="${borderColor}" stroke-width="2" fill="none"/>
      </svg>`;
    } else {
      el.style.cssText = `
        position:fixed;pointer-events:none;z-index:10000;
        width:${shape.w}px;height:${shape.h}px;
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
      } else if (!overToolbar && dtcCancelled) {
        // Pointer left toolbar again → re-activate
        dtcCancelled = false;
        dtcGhost = createGhost(dtcTool);
      }

      if (!dtcCancelled && dtcGhost) {
        moveGhost(dtcGhost, e.clientX, e.clientY);

        // ── Alignment guides via WASM ──
        const canvasEl = document.getElementById("fd-canvas");
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

          // ── Snap-to-node detection (non-text tools) ──
          const snap = dtcFindSnapTarget(rawX, rawY, dtcTool);
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
    dtcActive = false;
    dtcCancelled = false;
    dtcTool = null;
    dtcBtn = null;
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
  fdCanvas.render(minimapCtx, performance.now());
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

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

let isDarkTheme = false;

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;

  // Restore persisted theme
  const savedState = vscode.getState();
  if (savedState && savedState.darkTheme) {
    isDarkTheme = true;
    applyTheme(true);
  }

  btn.addEventListener("click", () => {
    isDarkTheme = !isDarkTheme;
    applyTheme(isDarkTheme);
    vscode.setState({ ...(vscode.getState() || {}), darkTheme: isDarkTheme });
  });
}

function applyTheme(isDark) {
  const btn = document.getElementById("theme-toggle-btn");
  if (isDark) {
    document.body.classList.add("dark-theme");
    if (btn) btn.textContent = "☀️";
  } else {
    document.body.classList.remove("dark-theme");
    if (btn) btn.textContent = "🌙";
  }
  if (fdCanvas) {
    fdCanvas.set_theme(isDark);
    render();
  }
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

// ─── Zen Mode Toggle ──────────────────────────────────────────────────────────

function setupZenModeToggle() {
  const btn = document.getElementById("zen-toggle-btn");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.zenMode) {
    applyZenMode(true);
  }

  btn.addEventListener("click", () => {
    const isZen = document.body.classList.contains("zen-mode");
    applyZenMode(!isZen);
    vscode.setState({ ...(vscode.getState() || {}), zenMode: !isZen });
  });
}

function applyZenMode(isZen) {
  const btn = document.getElementById("zen-toggle-btn");
  if (isZen) {
    document.body.classList.add("zen-mode");
    if (btn) { btn.textContent = '🔧'; btn.title = 'Switch to Full mode'; }
  } else {
    document.body.classList.remove("zen-mode");
    if (btn) { btn.textContent = '🧘'; btn.title = 'Switch to Zen mode'; }
    // Clear any zen-visible overrides when leaving zen mode
    document.getElementById("layers-panel")?.classList.remove("zen-visible");
    document.getElementById("props-panel")?.classList.remove("zen-visible");
  }
}

