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

/** Current view mode: "design" | "spec" */
let viewMode = "design";

/** Current spec filter: "all" | "draft" | "in_progress" | "done" */
let specFilter = "all";

/** Grid overlay state */
let gridEnabled = false;
const GRID_BASE_SPACING = 20;

/** Hidden nodes set (layer visibility toggle) */
const hiddenNodes = new Set();

/** Pointer interaction tracking for dimension tooltip */
let pointerIsDown = false;
let pointerDownSceneX = 0;
let pointerDownSceneY = 0;
let currentToolAtPointerDown = "select";

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
    setupDragAndDrop();
    setupHelpButton();
    setupApplePencilPro();
    setupThemeToggle();
    setupZoomIndicator();
    setupGridToggle();
    setupExportButton();
    setupMinimap();
    setupColorSwatches();
    setupSelectionBar();

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
  ctx.restore();
  // Reposition spec badges when canvas re-renders (node moved, panned, etc.)
  if (viewMode === "spec") refreshSpecView();
  refreshLayersPanel();
  renderMinimap();
  updateSelectionBar();
}

/** Animation loop ID for flow animations (pulse/dash edges). */
let animFrameId = null;

/** Start the animation loop for continuous flow animation rendering. */
function startAnimLoop() {
  if (animFrameId !== null) return; // already running
  function loop() {
    render();
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

// ─── Pointer Events ──────────────────────────────────────────────────────

function setupPointerEvents() {
  const dpr = window.devicePixelRatio || 1;

  canvas.addEventListener("pointerdown", (e) => {
    if (!fdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Middle-click or Space+click → start pan drag
    if (e.button === 1 || isPanning) {
      panDragging = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // Adjust for pan offset and zoom level → scene-space coords
    const x = (rawX - panX) / zoomLevel;
    const y = (rawY - panY) / zoomLevel;

    // Check if clicking an annotation badge (scene-space coords)
    const badgeHit = fdCanvas.hit_test_badge(x, y);
    if (badgeHit) {
      openAnnotationCard(badgeHit, e.clientX, e.clientY);
      return;
    }

    // Close annotation card if clicking elsewhere
    closeAnnotationCard();
    closeContextMenu();

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
    canvas.setPointerCapture(e.pointerId);

    // Track interaction start for dimension tooltip
    pointerIsDown = true;
    pointerDownSceneX = x;
    pointerDownSceneY = y;
    currentToolAtPointerDown = fdCanvas.get_tool_name();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!fdCanvas) return;

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
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!fdCanvas) return;

    // End pan drag
    if (panDragging) {
      panDragging = false;
      canvas.style.cursor = isPanning ? "grab" : "";
      canvas.releasePointerCapture(e.pointerId);
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
      updateToolbarActive(result.tool);
    }
    canvas.releasePointerCapture(e.pointerId);
    // Update properties panel after interaction ends
    updatePropertiesPanel();
    // Notify extension of canvas selection change (for Code ↔ Canvas sync)
    // Skip during inline editing — prevents focus stealing that kills the textarea
    if (!inlineEditorActive) {
      const selectedId = fdCanvas.get_selected_id();
      if (selectedId !== lastNotifiedSelectedId) {
        lastNotifiedSelectedId = selectedId;
        vscode.postMessage({ type: "nodeSelected", id: selectedId });
      }
    }

    // Hide dimension tooltip
    pointerIsDown = false;
    hideDimensionTooltip();
  });

  // ── Wheel / Trackpad → Pan or Zoom ──
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    // Pinch-to-zoom on trackpad fires as wheel with ctrlKey
    if (e.ctrlKey || e.metaKey) {
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

function setupToolbar() {
  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active state
      document
        .querySelectorAll(".tool-btn[data-tool]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Switch tool in WASM
      const tool = btn.getAttribute("data-tool");
      if (fdCanvas && tool) {
        fdCanvas.set_tool(tool);
        updateCanvasCursor(tool);
      }
    });
  });
}

// ─── Message Bridge (Extension ↔ Webview) ────────────────────────────────

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "setText": {
      if (!fdCanvas) return;
      suppressTextSync = true;
      fdCanvas.set_text(message.text);
      lastSyncedText = message.text; // Keep dedup in sync
      render();
      suppressTextSync = false;
      if (viewMode === "spec") refreshSpecView();
      refreshLayersPanel();
      break;
    }
    case "selectNode": {
      if (!fdCanvas) return;
      if (fdCanvas.select_by_id(message.nodeId || "")) {
        render();
      }
      break;
    }
    case "toolChanged": {
      if (!fdCanvas) return;
      fdCanvas.set_tool(message.tool);
      // Update toolbar UI
      document.querySelectorAll(".tool-btn").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-tool") === message.tool
        );
      });
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
  vscode.postMessage({
    type: "textChanged",
    text: text,
  });
}

// ─── Keyboard shortcuts (delegated to WASM) ─────────────────────────────

/** Whether we're in pan mode (Space held) */
let isPanning = false;

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

  // Close annotation card / context menu on Escape (before WASM)
  if (e.key === "Escape") {
    closeAnnotationCard();
    closeContextMenu();
    closeShortcutHelp();
  }

  // ── Grid toggle shortcut ──
  if (e.key === "g" || e.key === "G") {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      toggleGrid();
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
    render();
    syncTextToExtension();
  }

  // Handle tool switches
  if (result.toolSwitched) {
    updateToolbarActive(result.tool);
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
    case "showHelp":
      toggleShortcutHelp();
      break;
  }

  // Notify extension of selection changes from keyboard actions
  if (result.changed || result.action === "deselect") {
    const selectedId = fdCanvas.get_selected_id();
    vscode.postMessage({ type: "nodeSelected", id: selectedId });
  }

  // Update cursor when tool changes via shortcut
  if (result.toolSwitched) {
    updateCanvasCursor(result.tool);
  }
});

/** Whether we're holding ⌘ for temporary hand tool (Screenbrush-style) */
let isCmdHold = false;
let toolBeforeCmdHold = null;

document.addEventListener("keyup", (e) => {
  if (e.key === " " && isPanning) {
    isPanning = false;
    canvas.style.cursor = "";
  }
  // Screenbrush: Release ⌘ → restore previous tool
  if ((e.key === "Meta" || e.key === "Control") && isCmdHold && fdCanvas) {
    isCmdHold = false;
    canvas.style.cursor = "";
    if (toolBeforeCmdHold) {
      fdCanvas.set_tool(toolBeforeCmdHold);
      updateToolbarActive(toolBeforeCmdHold);
      toolBeforeCmdHold = null;
    }
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
  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
  updateCanvasCursor(tool);
}

function updateCanvasCursor(tool) {
  canvas.className = canvas.className.replace(/tool-\w+/g, "").trim();
  canvas.classList.add(`tool-${tool || "select"}`);
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
        ["O", "Ellipse"],
        ["P", "Pen (freehand)"],
        ["T", "Text"],
        ["Tab", "Toggle last two tools"],
      ],
    },
    {
      title: "Edit",
      shortcuts: [
        [`${cmd}Z`, "Undo"],
        [`${cmd}⇧Z`, "Redo"],
        ["Delete", "Delete selected"],
        [`${cmd}Delete`, "Clear selected"],
        [`${cmd}D`, "Duplicate"],
        [`${cmd}A`, "Select all"],
      ],
    },
    {
      title: "Clipboard",
      shortcuts: [
        [`${cmd}C`, "Copy"],
        [`${cmd}X`, "Cut"],
        [`${cmd}V`, "Paste"],
      ],
    },
    {
      title: "View",
      shortcuts: [
        [`${cmd}+`, "Zoom in"],
        [`${cmd}−`, "Zoom out"],
        [`${cmd}0`, "Zoom to fit"],
        ["Pinch", "Trackpad zoom"],
        ["Space (hold)", "Pan / hand tool"],
        [`${cmd} (hold)`, "Temp. hand tool"],
        ["Click %", "Reset zoom to 100%"],
        ["G", "Toggle grid overlay"],
        [`${cmd}1`, "Zoom to selection"],
      ],
    },
    {
      title: "Z-Order",
      shortcuts: [
        [`${cmd}[`, "Send backward"],
        [`${cmd}]`, "Bring forward"],
        [`${cmd}⇧[`, "Send to back"],
        [`${cmd}⇧]`, "Bring to front"],
      ],
    },
    {
      title: "Modifiers (while dragging)",
      shortcuts: [
        ["Shift", "Constrain axis / square"],
        ["Alt / ⌥", "Duplicate on click"],
        [`⌥${cmd}`, "Copy while moving"],
        ["Arrow keys", "Nudge 1px"],
        ["Shift+Arrow", "Nudge 10px"],
        ["Double-click", "Create text / edit label"],
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
        <button class="help-close">×</button>
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

// ─── Annotation Card ───────────────────────────────────────────────────────

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
    <button class="card-close" style="font-size:14px">×</button>
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

function escapeAttr(s) {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Context Menu (Right-Click) ─────────────────────────────────────────

function setupContextMenu() {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!fdCanvas) return;

    const rect = canvas.getBoundingClientRect();
    // Adjust for pan offset to get scene-space coords
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    // Hit-test for a node
    const selectedId = fdCanvas.get_selected_id();
    // Try to find node under pointer via selecting
    fdCanvas.handle_pointer_down(x, y, 1.0);
    fdCanvas.handle_pointer_up(x, y, false, false, false, false);
    const hitId = fdCanvas.get_selected_id();
    render();

    if (!hitId) {
      closeContextMenu();
      return;
    }

    contextMenuNodeId = hitId;
    const menu = document.getElementById("context-menu");
    const container = document.getElementById("canvas-container");
    const containerRect = container.getBoundingClientRect();
    menu.style.left = (e.clientX - containerRect.left) + "px";
    menu.style.top = (e.clientY - containerRect.top) + "px";

    // Enable/disable Group and Ungroup based on selection
    const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
    const groupBtn = document.getElementById("ctx-group");
    const ungroupBtn = document.getElementById("ctx-ungroup");

    // Group requires 2+ items selected
    const canGroup = selectedIds.length >= 2;
    groupBtn.classList.toggle("disabled", !canGroup);

    // Ungroup requires at least one selected item to be a group
    let canUngroup = false;
    if (selectedIds.length >= 1) {
      // Check each selected node's kind via the FD source text
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        // Match "group @id" in source — if found, this node is a group
        const groupRe = new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`);
        if (groupRe.test(source)) {
          canUngroup = true;
          break;
        }
      }
    }
    ungroupBtn.classList.toggle("disabled", !canUngroup);

    menu.classList.add("visible");
  });

  document.getElementById("ctx-add-annotation").addEventListener("click", () => {
    if (contextMenuNodeId) {
      const menu = document.getElementById("context-menu");
      const menuRect = menu.getBoundingClientRect();
      openAnnotationCard(contextMenuNodeId, menuRect.left, menuRect.top);
    }
    closeContextMenu();
  });

  // Duplicate via context menu
  document.getElementById("ctx-duplicate").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(contextMenuNodeId)) {
        fdCanvas.select_by_id(contextMenuNodeId);
      }
      const changed = fdCanvas.duplicate_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Group via context menu
  document.getElementById("ctx-group").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(contextMenuNodeId)) {
        fdCanvas.select_by_id(contextMenuNodeId);
      }
      const changed = fdCanvas.group_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Ungroup via context menu
  document.getElementById("ctx-ungroup").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(contextMenuNodeId)) {
        fdCanvas.select_by_id(contextMenuNodeId);
      }
      const changed = fdCanvas.ungroup_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Delete via context menu
  document.getElementById("ctx-delete").addEventListener("click", () => {
    if (fdCanvas && contextMenuNodeId) {
      fdCanvas.select_by_id(contextMenuNodeId);
      const changed = fdCanvas.delete_selected();
      if (changed) {
        render();
        syncTextToExtension();
      }
    }
    closeContextMenu();
  });

  // Close menu on any click
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("context-menu");
    if (!menu.contains(e.target)) {
      closeContextMenu();
    }
  });
}

function closeContextMenu() {
  document.getElementById("context-menu").classList.remove("visible");
  contextMenuNodeId = null;
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
    { id: "prop-label", key: "label" },
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

  // Text content (for text nodes) and label (for rect/ellipse)
  const textSection = document.getElementById("props-text-section");
  const textInput = document.getElementById("prop-text-content");
  const labelSection = document.getElementById("props-label-section");
  const labelInput = document.getElementById("prop-label");

  if (props.kind === "text") {
    if (textSection) textSection.style.display = "";
    if (labelSection) labelSection.style.display = "none";
    if (textInput) textInput.value = props.content || "";
  } else if (props.kind === "rect" || props.kind === "ellipse") {
    if (textSection) textSection.style.display = "none";
    if (labelSection) labelSection.style.display = "";
    if (labelInput) labelInput.value = props.label || "";
  } else {
    if (textSection) textSection.style.display = "none";
    if (labelSection) labelSection.style.display = "none";
  }

  // Show/hide appearance section based on kind
  const appearance = document.getElementById("props-appearance");
  if (appearance) {
    appearance.style.display = (props.kind === "root" || props.kind === "group") ? "none" : "";
  }

  propsSuppressSync = false;
}

// ─── Inline Text Editor ────────────────────────────────────────────────────

/** Inline textarea for editing text nodes and shape labels directly on canvas. */
let inlineEditorActive = false;

function setupInlineEditor() {
  canvas.addEventListener("dblclick", (e) => {
    if (!fdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    // Hit-test the scene to find the clicked node
    const nodeId = fdCanvas.get_selected_id();

    // If nothing selected, create a new text node at click position (Figma behavior)
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        render();
        syncTextToExtension();
        // Open inline editor on the newly created text node
        const newId = fdCanvas.get_selected_id();
        if (newId) {
          setTimeout(() => openInlineEditor(newId, "content", ""), 50);
        }
      }
      e.preventDefault();
      return;
    }

    // Get node props to know kind and current content
    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props.id) return;

    const isText = props.kind === "text";
    const isShape = props.kind === "rect" || props.kind === "ellipse";
    if (!isText && !isShape) return;

    const propKey = isText ? "content" : "label";
    const currentValue = isText ? (props.content || "") : (props.label || "");

    openInlineEditor(props.id, propKey, currentValue);
    e.preventDefault();
  });
}

/**
 * Compute relative luminance of a hex color for contrast calculation.
 * Returns 0 (black) to 1 (white).
 */
function hexLuminance(hex) {
  if (!hex || hex.length < 4) return 1;
  let r, g, b;
  if (hex.length <= 5) {
    // #RGB or #RGBA
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    // #RRGGBB or #RRGGBBAA
    r = parseInt(hex.slice(1, 3), 16) / 255;
    g = parseInt(hex.slice(3, 5), 16) / 255;
    b = parseInt(hex.slice(5, 7), 16) / 255;
  }
  // sRGB to linear
  const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Show a floating textarea over the node for in-place text editing.
 */
function openInlineEditor(nodeId, propKey, currentValue) {
  if (inlineEditorActive) return;

  const boundsJson = fdCanvas.get_node_bounds(nodeId);
  const b = JSON.parse(boundsJson);
  // Use minimum size for zero-width nodes (e.g. new text nodes)
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;

  const container = document.getElementById("canvas-container");

  // Convert scene-space bounds to screen-space
  const sx = (b.x || 0) * zoomLevel + panX;
  const sy = (b.y || 0) * zoomLevel + panY;
  const sw = Math.max(bw * zoomLevel, 80);
  const sh = Math.max(bh * zoomLevel, 28);

  // Read node fill color for background matching
  fdCanvas.select_by_id(nodeId);
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);
  let bgColor = "transparent";
  let textColor = "#1C1C1E";

  if (props.fill) {
    bgColor = props.fill;
    // Use white text on dark backgrounds, black on light
    const lum = hexLuminance(props.fill);
    textColor = lum < 0.4 ? "#FFFFFF" : "#1C1C1E";
  }

  // Get font info from node props
  const fontSize = props.fontSize ? Math.round(props.fontSize * zoomLevel) : Math.round(14 * zoomLevel);
  const fontFamily = props.fontFamily || "Inter";
  const fontWeight = props.fontWeight || 400;

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`,
    `top:${sy}px`,
    `width:${sw}px`,
    `height:${sh}px`,
    `padding:4px 6px`,
    `font:${fontWeight} ${fontSize}px ${fontFamily},system-ui,sans-serif`,
    `border:2px solid #4FC3F7`,
    `border-radius:4px`,
    `background:${bgColor}`,
    `color:${textColor}`,
    `resize:none`,
    `outline:none`,
    `z-index:100`,
    `box-shadow:0 2px 8px rgba(0,0,0,0.12)`,
    `line-height:1.4`,
    `overflow:hidden`,
  ].join(";");

  container.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;
    // Re-select the node in case selection was lost
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      e.stopPropagation();
      return;
    }
    // Shift+Enter = newline; plain Enter = commit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  });

  // Delay blur→commit to avoid premature removal from focus-stealing
  textarea.addEventListener("blur", () => {
    setTimeout(commit, 150);
  });
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────

/** Default dimensions for shapes when dropped from palette. */
const DEFAULT_SHAPE_SIZES = { rect: [100, 80], ellipse: [100, 80], text: [80, 24] };

function setupDragAndDrop() {
  // Palette items — create custom drag images sized to default node dimensions
  document.querySelectorAll(".palette-item[data-shape]").forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      const shape = item.getAttribute("data-shape");
      e.dataTransfer.setData("text/plain", shape);
      e.dataTransfer.effectAllowed = "copy";

      // Build an offscreen drag ghost at default node size
      const [w, h] = DEFAULT_SHAPE_SIZES[shape] || [100, 80];
      const ghost = document.createElement("canvas");
      ghost.width = w;
      ghost.height = h;
      const gc = ghost.getContext("2d");
      gc.fillStyle = "rgba(200, 200, 215, 0.6)";
      gc.strokeStyle = "rgba(100, 100, 120, 0.8)";
      gc.lineWidth = 1.5;
      if (shape === "ellipse") {
        gc.beginPath();
        gc.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
        gc.fill();
        gc.stroke();
      } else if (shape === "text") {
        gc.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
        gc.fillStyle = "rgba(80, 80, 90, 0.9)";
        gc.fillText("Text", 8, h / 2 + 5);
      } else {
        gc.beginPath();
        gc.roundRect(1, 1, w - 2, h - 2, 6);
        gc.fill();
        gc.stroke();
      }
      ghost.style.position = "absolute";
      ghost.style.top = "-9999px";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, w / 2, h / 2);
      // Clean up after drag starts
      requestAnimationFrame(() => ghost.remove());
    });
  });

  // Canvas drop target
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

    const changed = fdCanvas.create_node_at(shape, x, y);
    if (changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  });
}

// ─── View Mode Toggle ────────────────────────────────────────────────────

function setupViewToggle() {
  document.getElementById("view-design")?.addEventListener("click", () => setViewMode("design"));
  document.getElementById("view-spec")?.addEventListener("click", () => setViewMode("spec"));
}

function setViewMode(mode) {
  viewMode = mode;
  const isSpec = mode === "spec";

  document.getElementById("view-design")?.classList.toggle("active", mode === "design");
  document.getElementById("view-spec")?.classList.toggle("active", isSpec);

  // Canvas stays visible — spec view keeps full interactivity
  const overlay = document.getElementById("spec-overlay");
  if (overlay) overlay.style.display = isSpec ? "" : "none";

  // Hide properties panel in spec view
  const props = document.getElementById("props-panel");
  if (props && isSpec) props.classList.remove("visible");

  // Notify extension to apply/remove code-mode spec folding
  vscode.postMessage({ type: "viewModeChanged", mode });

  if (isSpec) {
    refreshSpecView();
  } else {
    // Clear badges when leaving spec view
    if (overlay) overlay.innerHTML = "";
  }

  // Always refresh layers (it's always visible)
  refreshLayersPanel();
}

function refreshSpecView() {
  const overlay = document.getElementById("spec-overlay");
  if (!overlay || !fdCanvas) return;

  // Parse source to find annotated nodes
  const source = fdCanvas.get_text();
  const nodesWithAnnotations = parseAnnotatedNodes(source);

  let html = "";
  for (const node of nodesWithAnnotations) {
    const boundsJson = fdCanvas.get_node_bounds(node.id);
    const b = JSON.parse(boundsJson);
    if (!b.width) continue;

    // Position badge at top-right corner of node, adjusted for pan
    const bx = b.x + b.width + panX - 6;
    const by = b.y + panY - 6;

    const annCount = node.annotations.length;
    const descriptions = node.annotations.filter(a => a.type === "description");
    const tooltip = descriptions.length > 0
      ? escapeAttr(descriptions[0].value)
      : `${annCount} annotation(s)`;

    html += `<div class="spec-badge-pin" style="left:${bx}px;top:${by}px" `;
    html += `data-node-id="${escapeAttr(node.id)}" title="${tooltip}">`;
    html += `<span class="spec-badge-count">${annCount}</span>`;
    html += `</div>`;
  }

  overlay.innerHTML = html;

  // Attach click handlers to badges to open annotation card
  overlay.querySelectorAll(".spec-badge-pin").forEach(pin => {
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      const nodeId = pin.getAttribute("data-node-id");
      if (nodeId) {
        // Select the node on canvas
        if (fdCanvas.select_by_id(nodeId)) render();
        // Open annotation card near the badge
        const rect = pin.getBoundingClientRect();
        openAnnotationCard(nodeId, rect.left, rect.bottom + 4);
      }
    });
  });
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

// ─── Layers Panel (Tree View) ────────────────────────────────────────────

const LAYER_ICONS = {
  group: "◫",
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

    // Edge
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      const node = { id: edgeMatch[1], kind: "edge", text: "", children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      braceDepth += openBraces - closeBraces;
      stack.push({ node, depth: braceDepth });
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
function renderLayerNode(node, selectedId, depth = 0) {
  const icon = LAYER_ICONS[node.kind] || "•";
  const isSelected = node.id === selectedId;
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

  let html = `<div class="layer-item${isSelected ? " selected" : ""}" data-node-id="${escapeAttr(node.id)}">`;
  html += `<span class="layer-indent">${indent}</span>`;
  html += chevron;
  html += `<span class="layer-icon">${icon}</span>`;
  html += `<span class="layer-name">${escapeHtml(node.id)}${textPreview}</span>`;
  html += `<span class="layer-kind">${escapeHtml(node.kind)}</span>`;
  html += `<span class="layer-eye" data-eye-id="${escapeAttr(node.id)}" title="Toggle visibility">👁</span>`;
  html += `</div>`;

  if (hasChildren) {
    html += `<div class="layer-children" data-parent-id="${escapeAttr(node.id)}">`;
    for (const child of node.children) {
      html += renderLayerNode(child, selectedId, depth + 1);
    }
    html += `</div>`;
  }
  return html;
}

/** Refresh the layers panel content. */
// ─── Spec Summary Panel (replaces layers in Spec mode) ──────────────────

function refreshSpecSummary(panel) {
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
  html += `<option value="draft">→ Draft</option>`;
  html += `<option value="in_progress">→ In Progress</option>`;
  html += `<option value="done">→ Done</option>`;
  html += `</select>`;
  html += `</div>`;
  html += `</div>`;

  // Filter tabs
  const filters = [
    { key: "all", label: "All" },
    { key: "draft", label: "Draft" },
    { key: "in_progress", label: "In Prog" },
    { key: "done", label: "Done" },
  ];
  html += `<div class="spec-filter-tabs">`;
  for (const f of filters) {
    const active = specFilter === f.key ? " active" : "";
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
  const filtered = specFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === specFilter)
    );

  if (filtered.length === 0 && annotated.length === 0) {
    html += `<div class="spec-empty-state">`;
    html += `<div style="font-size:24px;margin-bottom:8px;opacity:0.4">◇</div>`;
    html += `<div style="opacity:0.5;font-size:12px">No spec annotations yet</div>`;
    html += `<div style="opacity:0.35;font-size:11px;margin-top:4px">Right-click a node → Add Annotation, or press ⌘I</div>`;
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
    const descriptions = node.annotations.filter(a => a.type === "description");
    const statuses = node.annotations.filter(a => a.type === "status");
    const priorities = node.annotations.filter(a => a.type === "priority");
    const accepts = node.annotations.filter(a => a.type === "accept");
    const tags = node.annotations.filter(a => a.type === "tag");

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
      specFilter = btn.getAttribute("data-filter") || "all";
      refreshSpecSummary(panel);
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
    const desc = node.annotations.find(a => a.type === "description");
    const status = node.annotations.find(a => a.type === "status");
    const priority = node.annotations.find(a => a.type === "priority");
    const accepts = node.annotations.filter(a => a.type === "accept");
    const tags = node.annotations.filter(a => a.type === "tag");

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
  const targets = specFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === specFilter)
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
  if (panel) refreshSpecSummary(panel);
}

function refreshLayersPanel() {
  const panel = document.getElementById("layers-panel");
  if (!panel || !fdCanvas) return;

  // In Spec mode, show requirements summary instead of layers
  if (viewMode === "spec") {
    refreshSpecSummary(panel);
    return;
  }

  const source = fdCanvas.get_text();
  const tree = parseLayerTree(source);
  const selectedId = fdCanvas.get_selected_id() || "";

  // Count total nodes
  const countNodes = (nodes) => nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
  const totalCount = countNodes(tree);

  let html = `<div class="layers-header">`;
  html += `<span class="layers-title">Layers</span>`;
  html += `<span class="layers-count">${totalCount}</span>`;
  html += `</div>`;
  html += `<div class="layers-body">`;
  for (const node of tree) {
    html += renderLayerNode(node, selectedId);
  }
  html += `</div>`;

  panel.innerHTML = html;

  // Wire click handlers for layer items (selection)
  panel.querySelectorAll(".layer-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      // Don't select when clicking chevron
      if (e.target.closest(".layer-chevron")) return;
      e.stopPropagation();
      const nodeId = item.getAttribute("data-node-id");
      if (nodeId && fdCanvas) {
        if (fdCanvas.select_by_id(nodeId)) {
          render();
          // Update selection highlight in layers
          panel.querySelectorAll(".layer-item").forEach((el) => {
            el.classList.toggle("selected", el.getAttribute("data-node-id") === nodeId);
          });
          // Notify extension of selection
          vscode.postMessage({ type: "nodeSelected", id: nodeId });
        }
      }
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

      const commit = () => {
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
          fdCanvas.set_text(renamed);
          render();
          syncTextToExtension();
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
}

// ─── Spec View Parser (client-side) ──────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

// ─── Dimension Tooltip (R3.18) ────────────────────────────────────────────────

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
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
    // Center the scene in the usable area (right of layers panel)
    panX = panelW + (usableW - sceneW * zoomLevel) / 2 - minX * zoomLevel;
    panY = (ch - sceneH * zoomLevel) / 2 - minY * zoomLevel;
  }

  render();
  updateZoomIndicator();
}

/** Update the zoom level indicator in the toolbar. */
function updateZoomIndicator() {
  const el = document.getElementById("zoom-level");
  if (el) {
    el.textContent = Math.round(zoomLevel * 100) + "%";
  }
}

/** Set up click-to-reset on zoom indicator. */
function setupZoomIndicator() {
  const el = document.getElementById("zoom-level");
  if (!el) return;
  el.addEventListener("click", () => {
    // Reset to 100% centered
    const container = document.getElementById("canvas-container");
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    const oldZoom = zoomLevel;
    zoomLevel = 1.0;
    panX = cx - (cx - panX) * (1.0 / oldZoom);
    panY = cy - (cy - panY) * (1.0 / oldZoom);
    render();
    updateZoomIndicator();
  });
}

// ─── Grid Overlay (R3.21 — Figma/Sketch/draw.io) ─────────────────────────────

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
    const changed = fdCanvas.handle_pointer_move(cx + dx, cy + dy, 1.0, false, false, false, false);
    const upResult = JSON.parse(fdCanvas.handle_pointer_up(cx + dx, cy + dy, false, false, false, false));
    if (upResult.changed || changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  } catch (_) { /* skip */ }
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
  fdCanvas.render(exportCtx, performance.now());

  // Send to extension for save dialog
  const dataUrl = exportCanvas.toDataURL("image/png");
  vscode.postMessage({ type: "exportPng", dataUrl });
}

/** Set up the export button. */
function setupExportButton() {
  const btn = document.getElementById("export-btn");
  if (!btn) return;
  btn.addEventListener("click", exportToPng);
}

// ─── Minimap (Figma/Miro) ─────────────────────────────────────────────────────

let minimapCtx = null;
let minimapDragging = false;

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
function getSceneBounds() {
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

/** Render the minimap thumbnail with viewport indicator. */
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
    minimapCtx.restore();
    return;
  }

  const padding = 20;
  const sceneW = bounds.maxX - bounds.minX;
  const sceneH = bounds.maxY - bounds.minY;
  if (sceneW <= 0 || sceneH <= 0) {
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

  // Draw viewport rectangle
  const container = document.getElementById("canvas-container");
  const cw = container.clientWidth;
  const ch = container.clientHeight;

  // Viewport in scene-space
  const vpLeft = -panX / zoomLevel;
  const vpTop = -panY / zoomLevel;
  const vpW = cw / zoomLevel;
  const vpH = ch / zoomLevel;

  // Convert to minimap coordinates
  const rx = offsetX + (vpLeft - bounds.minX) * scale;
  const ry = offsetY + (vpTop - bounds.minY) * scale;
  const rw = vpW * scale;
  const rh = vpH * scale;

  minimapCtx.strokeStyle = isDark ? "rgba(10, 132, 255, 0.6)" : "rgba(0, 122, 255, 0.5)";
  minimapCtx.lineWidth = 1.5;
  minimapCtx.strokeRect(rx, ry, rw, rh);
  minimapCtx.fillStyle = isDark ? "rgba(10, 132, 255, 0.08)" : "rgba(0, 122, 255, 0.06)";
  minimapCtx.fillRect(rx, ry, rw, rh);

  minimapCtx.restore();
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

// ─── Selection Info Bar (Figma/Sketch bottom status) ──────────────────────────

/** Update the selection info bar with current selection details. */
function updateSelectionBar() {
  const bar = document.getElementById("selection-bar");
  if (!bar || !fdCanvas) return;

  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) {
    bar.classList.remove("visible");
    return;
  }

  try {
    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props || !props.kind) {
      bar.classList.remove("visible");
      return;
    }

    const w = Math.round(props.w || 0);
    const h = Math.round(props.h || 0);
    const x = Math.round(props.x || 0);
    const y = Math.round(props.y || 0);

    bar.textContent = `@${selectedId} · ${props.kind} · ${w}×${h} · (${x}, ${y})`;
    bar.classList.add("visible");
  } catch (_) {
    bar.classList.remove("visible");
  }
}

/** Set up selection bar (just needs the render loop, already wired). */
function setupSelectionBar() {
  // Selection bar updates happen in render() via updateSelectionBar()
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

// ─── Copy / Paste / Select All (Figma/Sketch standard) ───────────────────────

/** Clipboard buffer for FD node text */
let fdClipboard = "";

/** Copy the selected node's .fd block to the clipboard. */
function copySelectedAsFd() {
  if (!fdCanvas) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;

  const text = fdCanvas.get_text();
  const lines = text.split("\n");

  // Find the line that starts the node declaration
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${selectedId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return;

  // Determine the indentation of the start line
  const startIndent = lines[startIdx].match(/^\s*/)[0].length;

  // Collect all lines belonging to this block (same or deeper indentation)
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }

  fdClipboard = lines.slice(startIdx, endIdx).join("\n");

  // Also copy to system clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fdClipboard).catch(() => { });
  }
}

/** Paste a node from the FD clipboard. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Try reading from system clipboard first
  let clipText = fdClipboard;
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText.includes("@")) {
        clipText = sysText;
      }
    }
  } catch (_) { /* permission denied, use internal clipboard */ }

  if (!clipText.trim()) return;

  // Generate a new unique ID to avoid conflicts
  const idMatch = clipText.match(/@(\w+)/);
  if (!idMatch) return;
  const oldId = idMatch[1];
  const newId = oldId + "_copy" + Math.floor(Math.random() * 1000);
  const pasteText = clipText.replace(new RegExp(`@${oldId}\\b`, "g"), `@${newId}`);

  // Append to current text
  const currentText = fdCanvas.get_text();
  const updatedText = currentText.trimEnd() + "\n\n" + pasteText + "\n";
  fdCanvas.set_text(updatedText);
  render();
  syncTextToExtension();

  // Select the newly pasted node
  fdCanvas.select_by_id(newId);
  render();
  updatePropertiesPanel();
}

/** Select all nodes in the scene. */
function selectAllNodes() {
  if (!fdCanvas) return;
  const text = fdCanvas.get_text();
  if (!text) return;

  // Find all node IDs
  const nodeIdPattern = /@(\w+)/g;
  let match;
  const ids = [];
  const seen = new Set();
  while ((match = nodeIdPattern.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      ids.push(match[1]);
      seen.add(match[1]);
    }
  }

  if (ids.length === 0) return;

  // Select the first node (multi-select would need WASM API support)
  // For now, select the first node
  fdCanvas.select_by_id(ids[0]);
  render();
  updatePropertiesPanel();
}

// ─── Start ───────────────────────────────────────────────────────────────────

main();
