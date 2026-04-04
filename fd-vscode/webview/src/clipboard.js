// ─── clipboard.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Copy / Paste / Cut / Select All (Figma/Sketch standard) ─────────────────

/** Clipboard buffer for FD node text */
let fdClipboard = "";

/** Track whether clipboard content is from internal copy (vs. external paste). */
let fdClipboardIsInternal = false;

/** Cumulative paste offset — increments by 20 on each successive paste,
 *  resets when a new copy is made. */
let pasteOffsetCount = 0;

/** Extract the .fd text block for a single node by its ID.
 *  Returns the block string, or "" if not found. */
function extractNodeBlock(text, nodeId) {
  const lines = text.split("\n");
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${nodeId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return "";

  const startIndent = lines[startIdx].match(/^\s*/)[0].length;
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

/** Copy the selected node(s)' .fd block(s) to the clipboard. */
function copySelectedAsFd() {
  if (!fdCanvas) return;

  // Use emit_selection_fd for multi-node + edge support
  try {
    const selFd = fdCanvas.emit_selection_fd();
    if (selFd && selFd.trim()) {
      fdClipboard = selFd;
      fdClipboardIsInternal = true;
      pasteOffsetCount = 0;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fdClipboard).catch(() => { });
      }
      return;
    }
  } catch (_) {}

  // Fallback: multi-node via get_selected_ids + extractNodeBlock
  const text = fdCanvas.get_text();
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  if (selectedIds.length === 0) return;

  const blocks = [];
  for (const id of selectedIds) {
    const block = extractNodeBlock(text, id);
    if (block) blocks.push(block);
  }
  if (blocks.length === 0) return;

  fdClipboard = blocks.join("\n\n");
  fdClipboardIsInternal = true;
  pasteOffsetCount = 0;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(fdClipboard).catch(() => { });
  }
}

/** Cut the selected node(s) — copy + delete. */
function cutSelectedAsFd() {
  if (!fdCanvas) return;
  copySelectedAsFd();
  const changed = fdCanvas.delete_selected();
  if (changed) {
    render();
    syncTextToExtension();
  }
}

/** Paste node(s) — delegates to WASM duplicate for internal clipboard,
 *  falls back to text-based paste for external system clipboard content. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Check if system clipboard has different content (external paste)
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText.includes("@") && sysText !== fdClipboard) {
        fdClipboard = sysText;
        fdClipboardIsInternal = false;
      }
    }
  } catch (_) { /* permission denied — use internal */ }

  // Internal clipboard: delegate to WASM duplicate_selected() for correct
  // naming, constraint remapping, edge duplication, and position handling.
  if (fdClipboardIsInternal && fdClipboard) {
    fdCanvas.push_undo_snapshot(fdCanvas.get_text(), fdCanvas.get_text());
    const changed = fdCanvas.duplicate_selected();
    if (changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
    return;
  }

  // External clipboard: text-based paste with batch-aware ID renaming
  const clipText = fdClipboard;
  if (!clipText || !clipText.trim()) return;

  pasteOffsetCount++;

  // Collect all @id declarations in the pasted block
  const idPattern = /@(\w+)\s*\{/g;
  const allIds = new Set();
  let m;
  while ((m = idPattern.exec(clipText)) !== null) {
    allIds.add(m[1]);
  }
  if (allIds.size === 0) return;

  // Build renamed text: use batch-aware incremented _N naming
  const existingText = fdCanvas.get_text();
  let pasteText = clipText;
  const rootId = [...allIds][0];
  const idMap = new Map();
  const batchMaxCache = new Map(); // stem → current max N (batch-aware)

  for (const oldId of allIds) {
    const stem = oldId.replace(/_(?:\d+|cp\d+)$/, '');
    let maxN = batchMaxCache.get(stem) || 0;
    if (maxN === 0) {
      // First time seeing this stem — scan existing text
      maxN = 1;
      const re = new RegExp(`@${stem}_(\\d+)\\b`, 'g');
      let match;
      while ((match = re.exec(existingText)) !== null) {
        maxN = Math.max(maxN, parseInt(match[1]));
      }
      if (new RegExp(`@${stem}\\b`).test(existingText)) {
        maxN = Math.max(maxN, 1);
      }
    }
    const newN = maxN + 1;
    batchMaxCache.set(stem, newN);
    idMap.set(oldId, stem + '_' + newN);
  }

  // Replace all @id references with new names
  for (const [oldId, newId] of idMap) {
    pasteText = pasteText.replace(new RegExp(`@${oldId}\\b`, 'g'), `@${newId}`);
  }
  const newRootId = idMap.get(rootId) || rootId;

  // Horizontal stagger
  let xOffset = pasteOffsetCount * 20;
  try {
    const boundsJson = fdCanvas.get_node_bounds(rootId);
    if (boundsJson) {
      const bounds = JSON.parse(boundsJson);
      if (bounds && bounds.width > 0) {
        xOffset = (bounds.width + 20) * pasteOffsetCount;
      }
    }
  } catch (_) {}

  pasteText = pasteText.replace(/\b(x:\s*)(-?\d+(?:\.\d+)?)/g, (_match, prefix, val) => {
    return prefix + (parseFloat(val) + xOffset);
  });

  // Undo support
  const textBefore = fdCanvas.get_text();
  const updatedText = textBefore.trimEnd() + '\n\n' + pasteText + '\n';
  fdCanvas.set_text(updatedText);
  fdCanvas.push_undo_snapshot(textBefore, updatedText);

  render();
  syncTextToExtension();

  // Select the newly pasted root node
  fdCanvas.select_by_id(newRootId);
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

// Select all nodes
  if (ids.length > 0) {
    if (typeof fdCanvas.select_multiple_by_ids === "function") {
      fdCanvas.select_multiple_by_ids(JSON.stringify(ids));
    } else {
      fdCanvas.select_by_id(ids[0]);
    }
    render();
    updatePropertiesPanel();
  }
}

/** Copy the selected node(s) as a transparent PNG to the system clipboard. */
async function copySelectionAsPng() {
  if (!fdCanvas) return;

  const boundsArr = fdCanvas.get_selection_bounds();
  if (!boundsArr) return; // No selection

  // boundsArr is Float64Array[x, y, width, height]
  const bx = boundsArr[0];
  const by = boundsArr[1];
  const bw = boundsArr[2];
  const bh = boundsArr[3];

  // Add a small transparent padding
  const padding = 16;
  const exportW = bw + padding * 2;
  const exportH = bh + padding * 2;
  const offsetX = bx - padding;
  const offsetY = by - padding;

  // Create an offscreen canvas
  const offscreen = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 2; // Default to retina

  offscreen.width = exportW * dpr;
  offscreen.height = exportH * dpr;

  const offCtx = offscreen.getContext("2d");
  offCtx.scale(dpr, dpr);
  // Canvas defaults to transparent background

  // Draw exactly the selected nodes with correct translation
  fdCanvas.render_export(offCtx, offsetX, offsetY);

  // Helper inside toBlob
  offscreen.toBlob(blob => {
    if (!blob) {
      vscode.postMessage({ type: "error", text: "Failed to generate PNG blob." });
      return;
    }

    // Write blob to os clipboard
    try {
      const item = new ClipboardItem({ "image/png": blob });
      navigator.clipboard.write([item]).then(() => {
        vscode.postMessage({ type: "info", text: "Selection copied as PNG!" });
      }).catch(err => {
        console.error("Clipboard write error:", err);
        vscode.postMessage({ type: "error", text: "Failed to copy image to clipboard. Check permissions." });
      });
    } catch (err) {
      console.error(err);
      vscode.postMessage({ type: "error", text: "Clipboard image API not supported in this environment." });
    }
  }, "image/png");
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
  const matches = text.match(/@\w+/g);
  if (!matches) return;

  const seenIds = new Set();
  for (let i = 0; i < matches.length; i++) {
    const id = matches[i].substring(1);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const bStr = fdCanvas.get_node_bounds_json(id);
    if (bStr && bStr !== "{}") {
      const b = JSON.parse(bStr);
      if (b.width && b.width > 0) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
        foundAny = true;
      }
    }
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
  fdCanvas.render(exportCtx, performance.now(), true, true, false, false);

  // Send to extension for save dialog
  const dataUrl = exportCanvas.toDataURL("image/png");
  vscode.postMessage({ type: "exportPng", dataUrl });
}

/** Set up the export dropdown menu. */
function setupExportButton() {
  const btn = document.getElementById("export-menu-btn");
  const menu = document.getElementById("export-menu");
  if (!btn || !menu) return;

  // Toggle menu
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("visible");
  });

  // Handle menu actions
  document.querySelectorAll(".export-menu-item").forEach(item => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      menu.classList.remove("visible");
      if (item.classList.contains("disabled")) return;

      const action = item.dataset.export;
      switch (action) {
        case "png-clip":
          await copySelectionAsPng();
          break;
        case "png-file":
          exportToPng();
          break;
        case "svg-file":
          exportToSvg();
          break;
        case "fd-clip":
          copySelectedAsFd();
          vscode.postMessage({ type: "info", text: "Copied .fd text to clipboard!" });
          break;
      }
    });
  });

  // Close when clicking outside
  document.addEventListener("pointerdown", (e) => {
    if (menu.classList.contains("visible") && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("visible");
    }
  });
}

/** Set up the insert dropdown menu (Insert button in top bar). */
function setupInsertMenu() {
  const btn = document.getElementById("insert-menu-btn");
  const menu = document.getElementById("insert-menu");
  if (!btn || !menu) return;

  // Toggle menu
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("visible");
  });

  // Handle insert actions — activate the tool (same as top bar tool buttons)
  document.querySelectorAll(".insert-menu-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.remove("visible");
      const shape = item.dataset.insert;
      if (!shape) return;

      // Activate the corresponding tool button in the toolbar
      const toolBtn = document.querySelector(`.tool-btn[data-tool="${shape}"]`);
      if (toolBtn) {
        toolBtn.click();
      }
    });
  });

  // Close when clicking outside
  document.addEventListener("pointerdown", (e) => {
    if (menu.classList.contains("visible") && !menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.remove("visible");
    }
  });
}

/** Save selection (or full canvas) as an SVG file. */
function exportToSvg() {
  if (!fdCanvas) return;
  const svgStr = fdCanvas.export_svg();
  if (!svgStr) {
    vscode.postMessage({ type: "error", text: "Failed to generate SVG." });
    return;
  }
  vscode.postMessage({ type: "exportSvg", svgStr });
}

