// ─── shortcuts.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Keyboard shortcuts (delegated to WASM) ─────────────────────────────

/** Whether we're in pan mode (Space held) */
let isPanning = false;

// ─── Global modifier key tracking ────────────────────────────────────────
// macOS Option/Alt pressed mid-drag may not update e.altKey on pointermove
// in Electron/VS Code webviews. Track state explicitly via keydown/keyup.
let modAltHeld = false;
let modCtrlHeld = false;
let modMetaHeld = false;
let modShiftHeld = false;

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

  // ── Esc cancels active drag (node move/resize/draw) ──
  if (e.key === "Escape" && pointerIsDown && fdCanvas) {
    const cancelled = fdCanvas.cancel_drag();
    if (cancelled) {
      // Reset all JS-side drag state
      pointerIsDown = false;
      isDraggingNode = false;
      draggedNodeId = null;
      nearDetachState = null;
      altCloneActive = false;
      altDragGhosts = [];
      hideDimensionTooltip();

      // Restore tool after ⌘+drag temp Select or Alt+drag clone
      if (cmdTempSelectActive && cmdTempSelectOriginalTool) {
        fdCanvas.set_tool(cmdTempSelectOriginalTool);
        updateToolbarActive(lockedTool || cmdTempSelectOriginalTool);
        updateCanvasCursor(cmdTempSelectOriginalTool);
      }
      cmdTempSelectActive = false;
      cmdTempSelectOriginalTool = null;

      // Restore tool after Ctrl temp Eraser
      if (tempEraserMode && tempEraserPrevTool) {
        fdCanvas.set_tool(tempEraserPrevTool);
        updateToolbarActive(lockedTool || tempEraserPrevTool);
        updateCanvasCursor(tempEraserPrevTool);
      }
      tempEraserMode = false;
      tempEraserPrevTool = null;

      render();
      e.preventDefault();
      return;
    }
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

  // ── Library panel toggle shortcut ──
  if ((e.key === "l" || e.key === "L") && e.shiftKey) {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggleLibraryPanel();
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

  // ── Copy as PNG (⌘⇧C / Ctrl+Shift+C) ──
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
    e.preventDefault();
    copySelectionAsPng();
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

  // ── L key: toggle Layers panel (always works, crucial in Zen mode) ──
  if (e.key === "l" || e.key === "L") {
    const active = document.activeElement;
    const isTextInput = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !isTextInput) {
      e.preventDefault();
      const layersPanel = document.getElementById("layers-panel");
      if (layersPanel) {
        layersPanel.classList.toggle("zen-visible");
      }
      return;
    }
  }

  // ── 0 key: reset zoom to 100% ──
  if (e.key === "0" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const active = document.activeElement;
    const isTextInput = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (!isTextInput) {
      e.preventDefault();
      cameraZoom = 1.0;
      updateZoomIndicator();
      render();
      return;
    }
  }

  // ── V key or Escape: unlock tool if locked ──
  if ((e.key === "v" || e.key === "V" || e.key === "Escape") && !e.metaKey && !e.ctrlKey) {
    if (lockedTool) {
      e.preventDefault();
      unlockTool();
      return;
    }
  }

  // ── Double-press detection for tool locking (RR, OO, PP, AA, TT) ──
  const toolShortcuts = { r: "rect", o: "ellipse", p: "pen", a: "arrow", t: "text", f: "frame", e: "eraser" };
  const lowerKey = e.key.toLowerCase();
  if (toolShortcuts[lowerKey] && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const now = Date.now();
    if (lastShortcutKey === lowerKey && (now - lastShortcutTime) < DOUBLE_PRESS_MS) {
      // Double-press detected — lock this tool
      e.preventDefault();
      lockTool(toolShortcuts[lowerKey]);
      lastShortcutKey = null;
      lastShortcutTime = 0;
      return;
    }
    lastShortcutKey = lowerKey;
    lastShortcutTime = now;
  } else {
    // Reset double-press tracker on non-tool keys
    lastShortcutKey = null;
    lastShortcutTime = 0;
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
    closeContextMenu();
    closeAnnotationCard();
  }

  // Handle tool switches from keyboard
  if (result.toolSwitched) {
    if (lockedTool && result.tool === "select") {
      // Don't switch to select if a tool is locked — this shouldn't normally happen
      // from keyboard, but guard anyway
    } else {
      // Switching to a new tool via keyboard clears previous lock
      if (lockedTool && result.tool !== lockedTool) {
        lockedTool = null;
        document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => b.classList.remove("locked"));
      }
      updateToolbarActive(result.tool);
    }
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
    case "copyStyle":
      showToast("Style copied");
      break;
    case "pasteStyle":
      if (result.changed) {
        render();
        syncTextToExtension();
        showToast("Style pasted");
      }
      break;
  }

  // Notify extension of selection changes from keyboard actions
  if (result.changed || result.action === "deselect") {
    const selectedId = fdCanvas.get_selected_id();
    syncSelection(selectedId, "keyboard");
  }

  // Update cursor when tool changes via shortcut
  if (result.toolSwitched) {
    updateCanvasCursor(result.tool);
  }
});

/** Whether we're holding ⌘ for temporary hand tool (Screenbrush-style) */
let isCmdHold = false;
let toolBeforeCmdHold = null;

// ── Modifier-hold cursor feedback ────────────────────────────────────────
// When a bare modifier key is held (no other key pressed), show a preview
// cursor so the user knows what action will happen before they click.
// Cmd → grab (pan), Alt → copy (duplicate), Ctrl → red eraser (delete).

/** Clear all modifier cursor classes from the canvas. */
function clearModifierCursors() {
  canvas.classList.remove("modifier-cmd", "modifier-alt", "modifier-ctrl");
}

document.addEventListener("keydown", (e) => {
  // Always update tracked modifier state (even mid-drag)
  if (e.key === "Alt") modAltHeld = true;
  if (e.key === "Control") modCtrlHeld = true;
  if (e.key === "Meta") modMetaHeld = true;
  if (e.key === "Shift") modShiftHeld = true;

  // Skip cursor preview if pointer is already down (active interaction)
  if (pointerIsDown) return;
  // Skip if a text input is focused
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return;

  // Cmd/Meta held alone → grab cursor (pan preview)
  if (e.key === "Meta" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    clearModifierCursors();
    canvas.classList.add("modifier-cmd");
  }
  // Alt/Option held alone → copy cursor (clone preview)
  if (e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    clearModifierCursors();
    canvas.classList.add("modifier-alt");
  }
  // Ctrl held alone → red eraser cursor (delete preview)
  if (e.key === "Control" && !e.metaKey && !e.altKey && !e.shiftKey) {
    clearModifierCursors();
    canvas.classList.add("modifier-ctrl");
  }
}, true);

document.addEventListener("keyup", (e) => {
  // Always update tracked modifier state
  if (e.key === "Alt") modAltHeld = false;
  if (e.key === "Control") modCtrlHeld = false;
  if (e.key === "Meta") modMetaHeld = false;
  if (e.key === "Shift") modShiftHeld = false;

  if (e.key === " " && isPanning) {
    isPanning = false;
    canvas.style.cursor = "";
  }
  // Screenbrush: Release ⌘ → restore previous tool
  if (e.key === "Meta" && isCmdHold && fdCanvas) {
    isCmdHold = false;
    canvas.style.cursor = "";
    if (toolBeforeCmdHold) {
      fdCanvas.set_tool(toolBeforeCmdHold);
      updateToolbarActive(toolBeforeCmdHold);
      toolBeforeCmdHold = null;
    }
  }
  // Release Ctrl → restore from temporary eraser mode
  if (e.key === "Control" && tempEraserMode && fdCanvas) {
    if (tempEraserPrevTool) {
      fdCanvas.set_tool(tempEraserPrevTool);
      updateToolbarActive(lockedTool || tempEraserPrevTool);
      updateCanvasCursor(tempEraserPrevTool);
    }
    tempEraserMode = false;
    tempEraserPrevTool = null;
  }
  // Clear modifier cursor class on any modifier release
  if (e.key === "Meta" || e.key === "Alt" || e.key === "Control") {
    clearModifierCursors();
  }
});

// Clear modifier cursors and tracked state when window loses focus
window.addEventListener("blur", () => {
  clearModifierCursors();
  modAltHeld = false;
  modCtrlHeld = false;
  modMetaHeld = false;
  modShiftHeld = false;
  // Also restore from temp modes if window lost focus mid-hold
  if (isCmdHold && fdCanvas && toolBeforeCmdHold) {
    isCmdHold = false;
    canvas.style.cursor = "";
    fdCanvas.set_tool(toolBeforeCmdHold);
    updateToolbarActive(toolBeforeCmdHold);
    toolBeforeCmdHold = null;
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
  document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
  updateCanvasCursor(tool);
}

function updateCanvasCursor(tool) {
  canvas.className = canvas.className.replace(/tool-\w+/g, "").trim();
  canvas.classList.add(`tool-${tool || "select"}`);
}

/**
 * Check if scene-space coords (x, y) are over a resize handle of the
 * currently selected node. Returns a CSS cursor name or empty string.
 * Handle radius is 5px in scene-space (matches WASM hit_test_resize_handle).
 */
function getResizeHandleCursor(x, y) {
  if (!fdCanvas) return "";
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return "";
  let b;
  try {
    b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) { return ""; }
  if (b.x === undefined) return "";

  // Check if selected node is text (horizontal-only resize)
  const propsJson = fdCanvas.get_selected_node_props();
  let isText = false;
  try { isText = JSON.parse(propsJson).kind === "text"; } catch (_) { /* ignore */ }

  const r = 8; // hit radius in scene-space px (bug #6: increased from 5)

  if (isText) {
    // Text nodes: horizontal-only resize handles (Apple Preview style)
    const handles = [
      { hx: b.x, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-left
      { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-right
    ];
    for (const { hx, hy, cursor } of handles) {
      const dx = x - hx;
      const dy = y - hy;
      if (dx * dx + dy * dy <= r * r) return cursor;
    }
    return "";
  }

  const handles = [
    { hx: b.x, hy: b.y, cursor: "nwse-resize" }, // top-left
    { hx: b.x + b.width / 2, hy: b.y, cursor: "ns-resize" }, // top-center
    { hx: b.x + b.width, hy: b.y, cursor: "nesw-resize" }, // top-right
    { hx: b.x, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-left
    { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: "ew-resize" }, // middle-right
    { hx: b.x, hy: b.y + b.height, cursor: "nesw-resize" }, // bottom-left
    { hx: b.x + b.width / 2, hy: b.y + b.height, cursor: "ns-resize" }, // bottom-center
    { hx: b.x + b.width, hy: b.y + b.height, cursor: "nwse-resize" }, // bottom-right
  ];
  for (const { hx, hy, cursor } of handles) {
    const dx = x - hx;
    const dy = y - hy;
    if (dx * dx + dy * dy <= r * r) return cursor;
  }
  return "";
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
        ["A", "Arrow"],
        ["T", "Text"],
        ["F", "Frame"],
        ["E", "Eraser"],
        ["Tab", "Toggle last two tools"],
        ["R R", "Lock tool (stays active)"],
        ["Escape", "Unlock tool / Deselect"],
      ],
    },
    {
      title: "Edit",
      shortcuts: [
        [`${cmd}Z`, "Undo"],
        [`${cmd}⇧Z`, "Redo"],
        ["Del / ⌫", "Delete selected"],
        [`${cmd}D`, "Duplicate (+10,+10)"],
        [`${cmd}A`, "Select all"],
        [`${cmd}G`, "Group selected"],
        [`${cmd}⇧G`, "Ungroup"],
        [`${cmd}C`, "Copy"],
        [`${cmd}X`, "Cut"],
        [`${cmd}V`, "Paste"],
        [`⌥${cmd}C`, "Copy Style"],
        [`⌥${cmd}V`, "Paste Style"],
      ],
    },
    {
      title: "Transform",
      shortcuts: [
        [`${cmd}[`, "Send backward"],
        [`${cmd}]`, "Bring forward"],
        [`${cmd}⇧[`, "Send to back"],
        [`${cmd}⇧]`, "Bring to front"],
        ["Arrow keys", "Nudge 1px"],
        ["Shift+Arrow", "Nudge 10px"],
      ],
    },
    {
      title: "View",
      shortcuts: [
        [`${cmd}+`, "Zoom in"],
        [`${cmd}−`, "Zoom out"],
        ["0", "Reset zoom to 100%"],
        [`${cmd}0`, "Zoom to fit"],
        [`${cmd}1`, "Zoom to selection"],
        ["L", "Toggle Layers panel"],
        ["G", "Toggle grid overlay"],
        ["Space (hold)", "Pan / hand tool"],
        [`${cmd} (hold)`, "Temp. hand tool"],
        ["Pinch", "Trackpad zoom"],
      ],
    },
    {
      title: "Modifiers (while dragging)",
      shortcuts: [
        ["Shift", "Constrain axis / square"],
        ["Alt+drag", "Duplicate while moving"],
        ["Double-click", "Edit text / create text"],
        ["Dbl-click tool", "Lock tool (🔒)"],
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

