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

/** Canvas pan offset (JS-side, applied via ctx.translate) */
let panX = 0;
let panY = 0;
let panStartX = 0;
let panStartY = 0;
let panDragging = false;

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
  ctx.setTransform(dpr, 0, 0, dpr, panX * dpr, panY * dpr);
  fdCanvas.render(ctx, performance.now());
  ctx.restore();
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

    // Adjust for pan offset
    const x = rawX - panX;
    const y = rawY - panY;

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
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;
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
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;
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
    const selectedId = fdCanvas.get_selected_id();
    vscode.postMessage({ type: "nodeSelected", id: selectedId });
  });

  // ── Wheel / Trackpad scroll → pan ──
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    panX -= e.deltaX;
    panY -= e.deltaY;
    render();
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
      render();
      suppressTextSync = false;
      if (viewMode === "spec") refreshSpecView();
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

function syncTextToExtension() {
  if (!fdCanvas || suppressTextSync) return;
  const text = fdCanvas.get_text();
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
        ["Space (hold)", "Pan / hand tool"],
        [`${cmd} (hold)`, "Temp. hand tool"],
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
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;

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
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;

    // Hit-test the scene to find the clicked node
    const nodeId = fdCanvas.get_selected_id();
    if (!nodeId) return;

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
 * Show a floating textarea over the node for in-place text editing.
 */
function openInlineEditor(nodeId, propKey, currentValue) {
  if (inlineEditorActive) return;

  const boundsJson = fdCanvas.get_node_bounds(nodeId);
  const b = JSON.parse(boundsJson);
  if (!b.width) return;

  inlineEditorActive = true;

  const container = document.getElementById("canvas-container");
  const containerRect = container.getBoundingClientRect();

  // Convert scene-space bounds to screen-space
  const sx = b.x + panX;
  const sy = b.y + panY;
  const sw = Math.max(b.width, 80);
  const sh = Math.max(b.height, 28);

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`,
    `top:${sy}px`,
    `width:${sw}px`,
    `height:${sh}px`,
    `padding:4px 6px`,
    `font:14px Inter,system-ui,sans-serif`,
    `border:2px solid #4FC3F7`,
    `border-radius:4px`,
    `background:rgba(255,255,255,0.95)`,
    `color:#1C1C1E`,
    `resize:none`,
    `outline:none`,
    `z-index:100`,
    `box-shadow:0 4px 16px rgba(0,0,0,0.18)`,
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

  textarea.addEventListener("blur", commit);
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
    const x = (e.clientX - rect.left) - panX;
    const y = (e.clientY - rect.top) - panY;

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
  const canvas = document.getElementById("fd-canvas");
  const overlay = document.getElementById("spec-overlay");
  const isSpec = mode === "spec";

  document.getElementById("view-design")?.classList.toggle("active", !isSpec);
  document.getElementById("view-spec")?.classList.toggle("active", isSpec);

  if (canvas) canvas.style.display = isSpec ? "none" : "";
  if (overlay) overlay.style.display = isSpec ? "" : "none";

  // Show/hide tool buttons that don't apply in spec view
  document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
    btn.style.display = isSpec ? "none" : "";
  });
  document.querySelectorAll(".tool-sep").forEach((sep) => {
    sep.style.display = isSpec ? "none" : "";
  });
  // Hide shape palette and properties panel in spec view
  const palette = document.getElementById("shape-palette");
  const props = document.getElementById("props-panel");
  if (palette) palette.style.display = isSpec ? "none" : "";
  if (props) props.style.display = isSpec ? "none" : "";

  if (isSpec) refreshSpecView();
}

function refreshSpecView() {
  const overlay = document.getElementById("spec-overlay");
  if (!overlay || !fdCanvas) return;
  const source = fdCanvas.get_text();
  overlay.innerHTML = buildSpecView(source);
}

// ─── Spec View Parser (client-side) ──────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse .fd source and render a spec HTML string showing only
 * node/edge IDs and their ## annotations (requirements, ACs, status, etc).
 */
function buildSpecView(source) {
  const lines = source.split("\n");
  let html = "";
  let pendingAnnotations = [];
  let currentNodeId = "";
  let currentNodeKind = "";
  let insideNode = false;
  let braceDepth = 0;

  // Collect edges
  const edges = [];
  let currentEdge = null;
  let insideEdge = false;

  // Also collect ALL nodes (for Design View node list in spec)
  const allNodes = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Regular comment — skip
    if (trimmed.startsWith("#") && !trimmed.startsWith("##")) continue;

    // Annotation line
    if (trimmed.startsWith("##")) {
      const ann = parseSpecAnnotation(trimmed);
      if (ann) {
        if (insideEdge && currentEdge) {
          currentEdge.annotations.push(ann);
        } else {
          pendingAnnotations.push(ann);
        }
      }
      continue;
    }

    // Edge block
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      insideEdge = true;
      currentEdge = { id: edgeMatch[1], from: "", to: "", label: "", annotations: [] };
      braceDepth += openBraces - closeBraces;
      continue;
    }

    if (insideEdge && currentEdge) {
      const fromMatch = trimmed.match(/^from:\s*@(\w+)/);
      const toMatch = trimmed.match(/^to:\s*@(\w+)/);
      const labelMatch = trimmed.match(/^label:\s*"([^"]*)"/);
      if (fromMatch) currentEdge.from = fromMatch[1];
      if (toMatch) currentEdge.to = toMatch[1];
      if (labelMatch) currentEdge.label = labelMatch[1];
      braceDepth += openBraces - closeBraces;
      if (trimmed === "}") {
        insideEdge = false;
        if (currentEdge.from && currentEdge.to) edges.push(currentEdge);
        currentEdge = null;
      }
      continue;
    }

    // Closing brace
    if (trimmed === "}") {
      braceDepth -= 1;
      if (insideNode) {
        if (currentNodeId) {
          allNodes.push({ id: currentNodeId, kind: currentNodeKind, annotations: pendingAnnotations });
          if (pendingAnnotations.length > 0) {
            html += renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
          }
          pendingAnnotations = [];
          currentNodeId = "";
          currentNodeKind = "";
        }
        insideNode = braceDepth > 0;
      }
      continue;
    }

    // Typed node: rect @foo { / group @foo {
    const nodeMatch = trimmed.match(
      /^(group|rect|ellipse|path|text)\s+@(\w+)(?:\s+"[^"]*")?\s*\{?/
    );
    if (nodeMatch) {
      if (currentNodeId && pendingAnnotations.length > 0) {
        allNodes.push({ id: currentNodeId, kind: currentNodeKind, annotations: pendingAnnotations });
        html += renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
        pendingAnnotations = [];
      }
      currentNodeKind = nodeMatch[1];
      currentNodeId = nodeMatch[2];
      insideNode = true;
      if (trimmed.endsWith("{")) braceDepth += 1;
      continue;
    }

    // Generic node: @foo {
    const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
    if (genericMatch) {
      if (currentNodeId && pendingAnnotations.length > 0) {
        allNodes.push({ id: currentNodeId, kind: currentNodeKind, annotations: pendingAnnotations });
        html += renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
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

  // Flush last node
  if (currentNodeId && pendingAnnotations.length > 0) {
    allNodes.push({ id: currentNodeId, kind: currentNodeKind, annotations: pendingAnnotations });
    html += renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
  }

  // Nodes with no annotations — show as a compact list
  const annotatedIds = new Set(allNodes.filter(n => n.annotations.length > 0).map(n => n.id));
  const unannotated = allNodes.filter(n => n.annotations.length === 0);
  if (unannotated.length > 0) {
    html += `<div class="spec-section-header">Nodes without annotations</div>`;
    html += `<div class="spec-node-list">`;
    for (const n of unannotated) {
      html += `<span class="spec-node-chip"><span class="spec-chip-kind">${escapeHtml(n.kind)}</span> @${escapeHtml(n.id)}</span>`;
    }
    html += `</div>`;
  }

  // Edges
  if (edges.length > 0) {
    html += `<div class="spec-section-header">Flows &amp; Edges</div>`;
    for (const edge of edges) {
      html += `<div class="spec-edge">`;
      html += `<span class="edge-arrow"><strong>@${escapeHtml(edge.from)}</strong> → <strong>@${escapeHtml(edge.to)}</strong></span>`;
      if (edge.label) html += ` <span class="edge-label">— ${escapeHtml(edge.label)}</span>`;
      for (const ann of edge.annotations) {
        if (ann.type === "description") {
          html += `<div class="spec-description">${escapeHtml(ann.value)}</div>`;
        }
      }
      html += `</div>`;
    }
  }

  if (!html) return `<div class="spec-empty">No nodes found in this document.</div>`;
  return html;
}

function parseSpecAnnotation(line) {
  const trimmed = line.replace(/^##\s*/, "");
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

function renderSpecNode(id, kind, annotations) {
  const isGeneric = kind === "spec" || kind === "";
  let h = `<div class="spec-node${isGeneric ? " generic" : ""}">`;
  h += `<div class="spec-node-header">`;
  h += `<span class="spec-node-id">@${escapeHtml(id)}</span>`;
  h += `<span class="spec-kind-badge${isGeneric ? " spec" : ""}">${escapeHtml(kind || "spec")}</span>`;
  h += `</div>`;

  const descriptions = annotations.filter((a) => a.type === "description");
  const accepts = annotations.filter((a) => a.type === "accept");
  const statuses = annotations.filter((a) => a.type === "status");
  const priorities = annotations.filter((a) => a.type === "priority");
  const tags = annotations.filter((a) => a.type === "tag");

  for (const d of descriptions) h += `<div class="spec-description">${escapeHtml(d.value)}</div>`;
  for (const a of accepts) h += `<div class="spec-accept-item">${escapeHtml(a.value)}</div>`;

  if (statuses.length || priorities.length || tags.length) {
    h += `<div class="spec-meta-row">`;
    for (const s of statuses) h += `<span class="spec-badge status-${escapeHtml(s.value)}">${escapeHtml(s.value)}</span>`;
    for (const p of priorities) h += `<span class="spec-badge priority-${escapeHtml(p.value)}">${escapeHtml(p.value)}</span>`;
    for (const t of tags) {
      for (const tag of t.value.split(",")) {
        h += `<span class="spec-badge tag">${escapeHtml(tag.trim())}</span>`;
      }
    }
    h += `</div>`;
  }

  h += `</div>`;
  return h;
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

// ─── Start ───────────────────────────────────────────────────────────────────

main();
