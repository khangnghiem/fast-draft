// ─── context-menu.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Annotation Card ───────────────────────────────────────────────────────

// ─── Unified Context Menu Class ────────────────────────────────────────────
/**
 * Data-driven context menu with robust dismiss, keyboard nav, and ARIA.
 * Singleton — calling open() closes any previous menu first.
 */
class ContextMenu {
  constructor() {
    this._el = null;
    this._ac = null; // AbortController
    this._activeIdx = -1;
    this._onAction = null;
    this._items = [];
  }
  get isOpen() { return this._el !== null; }

  open({ items, x, y, onAction }) {
    this.close();
    this._items = items;
    this._onAction = onAction;
    this._activeIdx = -1;
    this._ac = new AbortController();
    const sig = this._ac.signal;

    const el = document.createElement('div');
    el.className = 'ctx-menu';
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;
    this._el = el;

    // Render items
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-sep';
        sep.setAttribute('role', 'separator');
        el.appendChild(sep);
      } else if (item.type === 'header') {
        const hdr = document.createElement('div');
        hdr.className = 'ctx-menu-header';
        hdr.textContent = item.label;
        el.appendChild(hdr);
      } else if (item.type === 'custom' && item.render) {
        const wrap = document.createElement('div');
        wrap.className = 'ctx-menu-custom';
        item.render(wrap);
        el.appendChild(wrap);
      } else {
        const row = document.createElement('div');
        row.className = 'ctx-menu-item';
        if (item.danger) row.classList.add('ctx-menu-danger');
        if (item.disabled) row.classList.add('ctx-menu-disabled');
        row.setAttribute('role', 'menuitem');
        row.setAttribute('data-action', item.action || '');
        if (item.data) {
          for (const [k, v] of Object.entries(item.data)) {
            row.setAttribute('data-' + k, v);
          }
        }
        if (item.icon) {
          const ic = document.createElement('span');
          ic.className = 'ctx-menu-icon';
          ic.textContent = item.icon;
          row.appendChild(ic);
        }
        const lbl = document.createElement('span');
        lbl.className = 'ctx-menu-label';
        lbl.textContent = item.label;
        row.appendChild(lbl);
        if (item.shortcut) {
          const sc = document.createElement('span');
          sc.className = 'ctx-menu-shortcut';
          sc.textContent = item.shortcut;
          row.appendChild(sc);
        }
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.disabled) return;
          this.close();
          if (this._onAction) this._onAction(item.action, row);
        }, { signal: sig });
        el.appendChild(row);
      }
    }

    // Position (use canvas-container for relative positioning in VS Code webview)
    const container = document.getElementById('canvas-container');
    if (container) {
      container.appendChild(el);
      const cRect = container.getBoundingClientRect();
      let left = x - cRect.left;
      let top = y - cRect.top;
      // Clamp to viewport
      requestAnimationFrame(() => {
        const mw = el.offsetWidth;
        const mh = el.offsetHeight;
        if (left + mw > cRect.width) left = cRect.width - mw - 4;
        if (top + mh > cRect.height) top = cRect.height - mh - 4;
        if (left < 0) left = 4;
        if (top < 0) top = 4;
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.classList.add('ctx-menu-visible');
        el.focus();
      });
    } else {
      document.body.appendChild(el);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      requestAnimationFrame(() => {
        el.classList.add('ctx-menu-visible');
        el.focus();
      });
    }

    // Dismiss listeners (capture phase to beat stopPropagation)
    document.addEventListener('pointerdown', (e) => {
      if (!el.contains(e.target)) this.close();
    }, { capture: true, signal: sig });
    window.addEventListener('blur', () => this.close(), { signal: sig });
    window.addEventListener('resize', () => this.close(), { signal: sig });

    // Keyboard nav (capture phase)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      const actionItems = el.querySelectorAll('.ctx-menu-item:not(.ctx-menu-disabled)');
      if (!actionItems.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._activeIdx = (this._activeIdx + 1) % actionItems.length;
        this._highlight(actionItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._activeIdx = (this._activeIdx - 1 + actionItems.length) % actionItems.length;
        this._highlight(actionItems);
      } else if (e.key === 'Enter' && this._activeIdx >= 0) {
        e.preventDefault();
        actionItems[this._activeIdx]?.click();
      }
    }, { capture: true, signal: sig });
  }

  close() {
    if (this._ac) { this._ac.abort(); this._ac = null; }
    if (this._el) { this._el.remove(); this._el = null; }
    this._activeIdx = -1;
    this._onAction = null;
  }

  _highlight(items) {
    items.forEach(el => el.classList.remove('ctx-menu-active'));
    if (this._activeIdx >= 0 && this._activeIdx < items.length) {
      items[this._activeIdx].classList.add('ctx-menu-active');
      items[this._activeIdx].scrollIntoView({ block: 'nearest' });
    }
  }
}

const ctxMenu = new ContextMenu();

// ─── Floating Action Bar (Contextual Toolbar) ──────────────────────────────

/** Position the floating action bar above the selected node's bounds */
function updateFloatingBar() {
  const fab = document.getElementById("floating-action-bar");
  if (!fab || !fdCanvas) return;

  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId || pointerIsDown || inlineEditorActive) {
    fab.classList.remove("visible");
    return;
  }

  // Get node bounds in scene space
  let bounds;
  try {
    bounds = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) {
    fab.classList.remove("visible");
    return;
  }
  if (bounds.x === undefined) {
    fab.classList.remove("visible");
    return;
  }

  // Scene → screen coords (apply pan + zoom)
  const canvas = document.getElementById("fd-canvas");
  const rect = canvas.getBoundingClientRect();
  const screenX = bounds.x * zoomLevel + panX + rect.left;
  const screenY = bounds.y * zoomLevel + panY + rect.top;
  const screenW = bounds.w * zoomLevel;

  // Position bar centered above node, 36px gap
  const barX = screenX + screenW / 2;
  const barY = screenY - 36;

  // Clamp to stay within canvas bounds
  const containerRect = document.getElementById("canvas-container").getBoundingClientRect();
  const clampedY = Math.max(containerRect.top + 4, barY);

  fab.style.left = `${barX - containerRect.left}px`;
  fab.style.top = `${clampedY - containerRect.top}px`;
  fab.classList.add("visible");

  // Read current node props for the controls
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

  // Update fill color
  const fillEl = document.getElementById("fab-fill");
  if (fillEl && props.fill) {
    let hex = props.fill;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    fillEl.value = hex.substring(0, 7);
  }

  // Update stroke color
  const strokeEl = document.getElementById("fab-stroke");
  if (strokeEl && props.strokeColor) {
    let hex = props.strokeColor;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    strokeEl.value = hex.substring(0, 7);
  }

  // Stroke width
  const strokeW = document.getElementById("fab-stroke-w");
  if (strokeW) strokeW.value = props.strokeWidth !== undefined ? props.strokeWidth : 1;

  // Opacity
  const opSlider = document.getElementById("fab-opacity");
  const opVal = document.getElementById("fab-opacity-val");
  const op = props.opacity !== undefined ? props.opacity : 1;
  if (opSlider) opSlider.value = op;
  if (opVal) opVal.textContent = `${Math.round(op * 100)}%`;

  // Font size — show only for text nodes
  const isText = props.kind === "text";
  document.querySelectorAll(".fab-text-only").forEach(el => {
    el.style.display = isText ? "" : "none";
  });
  if (isText) {
    const fsEl = document.getElementById("fab-font-size");
    if (fsEl && props.fontSize) fsEl.value = props.fontSize;
  }
}

function hideFloatingBar() {
  const fab = document.getElementById("floating-action-bar");
  if (fab) fab.classList.remove("visible");
}

// ─── Delete Button (Floating Action Bar) ───────────────────────────────────
document.getElementById("deleteSelectedBtn")?.addEventListener("click", () => {
  if (!fdCanvas) return;
  const changed = fdCanvas.delete_selected();
  if (changed) {
    render();
    syncTextToExtension();
    updateFloatingBar();
  }
});



function setupFloatingBar() {
  const fab = document.getElementById("floating-action-bar");
  if (!fab) return;

  // ── Fill color change ──
  document.getElementById("fab-fill").addEventListener("input", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("fill", e.target.value);
    captureDefault("fill", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Stroke color change ──
  document.getElementById("fab-stroke").addEventListener("input", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("stroke", e.target.value);
    captureDefault("stroke", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Stroke width change ──
  document.getElementById("fab-stroke-w").addEventListener("change", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("stroke_width", e.target.value);
    captureDefault("stroke_width", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Opacity slider ──
  const opSlider = document.getElementById("fab-opacity");
  const opVal = document.getElementById("fab-opacity-val");
  opSlider.addEventListener("input", (e) => {
    if (!fdCanvas) return;
    opVal.textContent = `${Math.round(e.target.value * 100)}%`;
    fdCanvas.set_node_prop("opacity", e.target.value);
    captureDefault("opacity", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });

  // ── Font size change ──
  document.getElementById("fab-font-size").addEventListener("change", (e) => {
    if (!fdCanvas) return;
    fdCanvas.set_node_prop("font_size", e.target.value);
    captureDefault("font_size", e.target.value);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });


  // Prevent FAB clicks from deselecting the node
  fab.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });
}

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
    <button class="card-close" style="font-size:14px" aria-label="Close">×</button>
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

/**
 * Check if a node has a spec annotation block.
 * Uses parseAnnotatedNodes to detect matching spec data.
 */
function nodeHasSpec(nodeId) {
  if (!fdCanvas || !nodeId) return false;
  const source = fdCanvas.get_text();
  const nodes = parseAnnotatedNodes(source);
  return nodes.some(n => n.id === nodeId);
}

/**
 * Remove spec block(s) from a node's FD source via text manipulation.
 * Handles both inline `spec "..."` and block `spec { ... }` forms.
 */
function removeNodeSpec(nodeId) {
  if (!fdCanvas || !nodeId) return;
  let source = fdCanvas.get_text();
  const lines = source.split("\n");
  const result = [];
  let insideTargetNode = false;
  let nodeDepth = 0;
  let skipSpecBlock = false;
  let specBlockDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Detect target node start
    const nodeRe = new RegExp(`^(?:group|frame|rect|ellipse|path|text)\\s+@${nodeId}(?:\\s|\\{)`);
    if (nodeRe.test(trimmed)) {
      insideTargetNode = true;
      nodeDepth = 0;
    }

    if (insideTargetNode) {
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;

      // Skip inline spec line
      if (trimmed.match(/^spec\s+"/)) {
        continue; // drop this line
      }

      // Skip block spec start
      if (trimmed.match(/^spec\s*\{/) || trimmed === "spec{") {
        skipSpecBlock = true;
        specBlockDepth = opens - closes;
        continue;
      }

      if (skipSpecBlock) {
        specBlockDepth += opens - closes;
        if (specBlockDepth <= 0) skipSpecBlock = false;
        continue;
      }

      nodeDepth += opens - closes;
      if (trimmed === "}" && nodeDepth < 0) {
        insideTargetNode = false;
      }
    }

    result.push(lines[i]);
  }

  const newSource = result.join("\n");
  fdCanvas.set_text(newSource);
}

// ─── Context Menu (Right-Click) ─────────────────────────────────────────

/** Build context menu items for when a node is right-clicked */
function buildNodeMenuItems(hitId, selectedIds) {
  const isSingle = selectedIds.length <= 1;
  const canGroup = selectedIds.length >= 2;
  const source = fdCanvas.get_text();
  let canUngroup = false;
  for (const id of selectedIds) {
    if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) { canUngroup = true; break; }
  }
  const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(hitId) : false;
  const hasSpec = nodeHasSpec(hitId);

  const items = [];

  // AI Touch submenu (VS Code specific — uses custom render)
  items.push({
    action: 'ai-touch', label: 'AI Touch', icon: '✦', shortcut: '▸',
    type: 'custom',
    render: (wrap) => {
      wrap.className = 'menu-item-wrap ctx-ai-touch-wrap';
      wrap.id = 'ctx-ai-touch-wrap-dyn';
      wrap.innerHTML = `
        <div class="ctx-menu-item" role="menuitem" data-action="ai-touch">
          <span class="ctx-menu-icon">✦</span>
          <span class="ctx-menu-label">AI Touch</span>
          <span class="ctx-menu-shortcut">▸</span>
        </div>
        <div class="ctx-ai-submenu" id="ctx-ai-submenu-dyn">
          <textarea class="ctx-ai-prompt" id="ctx-ai-prompt-dyn" placeholder="e.g. Make it Apple HIG style" maxlength="200" rows="2"></textarea>
          <div class="ctx-ai-footer">
            <span class="ctx-ai-counter" id="ctx-ai-counter-dyn">0/200</span>
            <button class="ctx-ai-run" id="ctx-ai-run-dyn">Run ✦</button>
          </div>
        </div>
      `;
      // Wire AI Touch toggle
      const trigger = wrap.querySelector('[data-action="ai-touch"]');
      trigger?.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.toggle('expanded');
        const promptEl = wrap.querySelector('#ctx-ai-prompt-dyn');
        const counterEl = wrap.querySelector('#ctx-ai-counter-dyn');
        if (promptEl) {
          const saved = localStorage.getItem('fd-ai-prompt') || '';
          promptEl.value = saved;
          if (counterEl) counterEl.textContent = saved.length + '/200';
          setTimeout(() => promptEl.focus(), 50);
        }
      });
      // Wire prompt input
      const promptEl = wrap.querySelector('#ctx-ai-prompt-dyn');
      const counterEl = wrap.querySelector('#ctx-ai-counter-dyn');
      const runBtn = wrap.querySelector('#ctx-ai-run-dyn');
      if (promptEl) {
        promptEl.addEventListener('input', () => {
          if (counterEl) counterEl.textContent = promptEl.value.length + '/200';
          localStorage.setItem('fd-ai-prompt', promptEl.value);
        });
        promptEl.addEventListener('click', (e) => e.stopPropagation());
        promptEl.addEventListener('mousedown', (e) => e.stopPropagation());
        promptEl.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            ctxMenu.close();
            const ids = hitId ? [hitId] : [];
            if (typeof vscode !== 'undefined') {
              vscode.postMessage({ type: 'aiTouch', nodeIds: ids, userFocus: localStorage.getItem('fd-ai-prompt') || undefined });
            }
          }
        });
      }
      if (runBtn) {
        runBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ctxMenu.close();
          const ids = hitId ? [hitId] : [];
          if (typeof vscode !== 'undefined') {
            vscode.postMessage({ type: 'aiTouch', nodeIds: ids, userFocus: localStorage.getItem('fd-ai-prompt') || undefined });
          }
        });
      }
    }
  });

  // Notes
  if (!hasSpec) items.push({ action: 'add-annotation', label: 'Add Spec', icon: '◇' });
  if (hasSpec) items.push({ action: 'view-specs', label: 'Specs Panel', icon: '📝', shortcut: '⌘⇧N' });

  // Rename
  items.push({ action: 'rename', label: 'Rename', icon: '✏️' });
  items.push({ type: 'separator' });

  // Clipboard
  items.push({ action: 'cut', label: 'Cut', icon: '✂', shortcut: '⌘X' });
  items.push({ action: 'copy', label: 'Copy', icon: '⎘', shortcut: '⌘C' });
  items.push({ action: 'paste', label: 'Paste', icon: '📋', shortcut: '⌘V' });
  items.push({ action: 'copy-png', label: 'Copy as PNG', icon: '🖼', shortcut: '⌘⇧C' });
  items.push({ type: 'separator' });

  // Structure
  items.push({ action: 'duplicate', label: 'Duplicate', icon: '⊕', shortcut: '⌘D' });
  items.push({ action: 'group', label: 'Group', icon: '◻', shortcut: '⌘G', disabled: !canGroup });
  items.push({ action: 'ungroup', label: 'Ungroup', icon: '◫', shortcut: '⇧⌘G', disabled: !canUngroup });
  items.push({ action: 'frame', label: 'Frame Selection', icon: '⊞' });
  items.push({ type: 'separator' });

  // Z-order
  items.push({ action: 'bring-front', label: 'Bring to Front', icon: '↑', shortcut: '⌘⇧]' });
  items.push({ action: 'send-back', label: 'Send to Back', icon: '↓', shortcut: '⌘⇧[' });

  // Lock
  items.push({ action: 'lock', label: isLocked ? 'Unlock' : 'Lock', icon: isLocked ? '🔓' : '🔒' });
  items.push({ type: 'separator' });

  // Delete
  items.push({ action: 'delete', label: 'Delete', icon: '⊖', shortcut: '⌫', danger: true });

  return items;
}

/** Handle canvas context menu actions */
function doNodeAction(action, el) {
  if (!fdCanvas || !contextMenuNodeId) return;
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  if (!selectedIds.includes(contextMenuNodeId)) {
    fdCanvas.select_by_id(contextMenuNodeId);
  }

  if (action === 'add-annotation') {
    openAnnotationCard(contextMenuNodeId, parseInt(el?.style?.left || 0), parseInt(el?.style?.top || 0));
    return;
  }
  if (action === 'view-specs') {
    fdCanvas.select_by_id(contextMenuNodeId);
    render();
    openAnnotationCard(contextMenuNodeId, parseInt(el?.style?.left || 0), parseInt(el?.style?.top || 0));
    return;
  }
  if (action === 'rename') {
    const oldId = contextMenuNodeId;
    const newId = prompt(`Rename @${oldId} to:`, oldId);
    if (!newId || newId === oldId || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newId)) return;
    const text = fdCanvas.get_text();
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}\\b`, "g");
    const newText = text.replace(re, `@${newId}`);
    fdCanvas.set_text(newText);
    bumpGeneration();
    render();
    syncTextToExtension();
    return;
  }
  if (action === 'cut') {
    copySelectedAsFd();
    const changed = fdCanvas.delete_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'copy') { copySelectedAsFd(); return; }
  if (action === 'paste') { pasteFromClipboard(); return; }
  if (action === 'copy-png') { if (typeof copySelectionAsPng === 'function') copySelectionAsPng(); return; }
  if (action === 'duplicate') {
    const changed = fdCanvas.duplicate_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'group') {
    const changed = fdCanvas.group_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'ungroup') {
    const changed = fdCanvas.ungroup_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'frame') {
    const resultJson = fdCanvas.handle_key("f", false, false, false, true);
    const result = JSON.parse(resultJson);
    if (result.changed) { render(); syncTextToExtension(); }
    return;
  }
  if (action === 'bring-front') {
    const resultJson = fdCanvas.handle_key("]", false, true, false, true);
    const result = JSON.parse(resultJson);
    if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    return;
  }
  if (action === 'send-back') {
    const resultJson = fdCanvas.handle_key("[", false, true, false, true);
    const result = JSON.parse(resultJson);
    if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    return;
  }
  if (action === 'lock') {
    if (fdCanvas.toggle_node_locked) {
      fdCanvas.toggle_node_locked(contextMenuNodeId);
      render();
      syncTextToExtension();
    }
    return;
  }
  if (action === 'delete') {
    fdCanvas.select_by_id(contextMenuNodeId);
    const changed = fdCanvas.delete_selected();
    if (changed) { render(); syncTextToExtension(); }
    return;
  }
}

function setupContextMenu() {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!fdCanvas) return;
    if (tempEraserMode || fdCanvas.get_tool_name() === "eraser") return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    const selectedId = fdCanvas.get_selected_id();
    fdCanvas.handle_pointer_down(x, y, 1.0);
    fdCanvas.handle_pointer_up(x, y, false, false, false, false);
    const hitId = fdCanvas.get_selected_id();
    render();

    if (!hitId) {
      if (fdCanvas.hit_test_edge_at) {
        const edgeHit = fdCanvas.hit_test_edge_at(x, y);
        if (edgeHit) {
          const container = document.getElementById("canvas-container");
          const containerRect = container.getBoundingClientRect();
          showEdgeContextMenu(edgeHit, e.clientX - containerRect.left, e.clientY - containerRect.top);
          return;
        }
      }
      ctxMenu.close();
      return;
    }

    contextMenuNodeId = hitId;
    const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
    const items = buildNodeMenuItems(hitId, selectedIds);

    ctxMenu.open({
      items,
      x: e.clientX,
      y: e.clientY,
      onAction: (action, row) => doNodeAction(action, row),
    });
  });

  // ── Layers panel: ⋮ button → open context menu ──
  const layersPanel = document.getElementById("layers-panel");
  if (layersPanel) {
    layersPanel.addEventListener("click", (e) => {
      const actionsBtn = e.target.closest(".layer-actions");
      if (!actionsBtn || !fdCanvas) return;
      e.stopPropagation();
      const nodeId = actionsBtn.getAttribute("data-actions-id");
      if (!nodeId) return;
      fdCanvas.select_by_id(nodeId);
      render();
      contextMenuNodeId = nodeId;
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      const items = buildNodeMenuItems(nodeId, selectedIds);
      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: (action, row) => doNodeAction(action, row),
      });
    });
  }
}

function closeContextMenu() {
  ctxMenu.close();
  contextMenuNodeId = null;
}


// ─── Edge Context Menu ──────────────────────────────────────────────────

let ecmEdgeId = null;

function showEdgeContextMenu(edgeId, screenX, screenY) {
  const menu = document.getElementById("edge-context-menu");
  if (!menu) return;
  ecmEdgeId = edgeId;
  document.getElementById("ecm-arrow").value = "end";
  document.getElementById("ecm-curve").value = "smooth";
  document.getElementById("ecm-stroke-color").value = "#999999";
  document.getElementById("ecm-stroke-width").value = "1";
  document.getElementById("ecm-flow").value = "none";
  document.getElementById("ecm-flow-dur").style.display = "none";
  menu.style.left = (screenX + 12) + "px";
  menu.style.top = (screenY - 60) + "px";
  menu.classList.add("visible");
  setTimeout(() => {
    document.addEventListener("pointerdown", ecmClickOutside, true);
    document.addEventListener("keydown", ecmEscHandler, true);
  }, 50);
}

function closeEdgeContextMenu() {
  const menu = document.getElementById("edge-context-menu");
  if (menu) menu.classList.remove("visible");
  ecmEdgeId = null;
  document.removeEventListener("pointerdown", ecmClickOutside, true);
  document.removeEventListener("keydown", ecmEscHandler, true);
}

function ecmClickOutside(e) {
  const menu = document.getElementById("edge-context-menu");
  if (menu && !menu.contains(e.target)) closeEdgeContextMenu();
}

function ecmEscHandler(e) {
  if (e.key === "Escape") { closeEdgeContextMenu(); e.preventDefault(); }
}

function setupEdgeContextMenu() {
  const arrowSel = document.getElementById("ecm-arrow");
  const curveSel = document.getElementById("ecm-curve");
  const strokeColor = document.getElementById("ecm-stroke-color");
  const strokeWidth = document.getElementById("ecm-stroke-width");
  const flowSel = document.getElementById("ecm-flow");
  const flowDur = document.getElementById("ecm-flow-dur");
  if (!arrowSel) return;

  function applyEdgeChange() {
    if (!fdCanvas || !ecmEdgeId) return;
    const text = fdCanvas.get_text();
    const esc = ecmEdgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(edge\\s+@${esc}\\s*\\{[^}]*?)\\}`, "s");
    const m = text.match(re);
    if (!m) return;
    let block = m[1];
    // Arrow
    block = block.replace(/arrow:\s*\S+/, `arrow: ${arrowSel.value}`);
    if (!block.includes("arrow:")) block += `\n  arrow: ${arrowSel.value}`;
    // Curve
    block = block.replace(/curve:\s*\S+/, `curve: ${curveSel.value}`);
    if (!block.includes("curve:")) block += `\n  curve: ${curveSel.value}`;
    // Stroke
    const sw = strokeWidth.value || "1";
    const sc = strokeColor.value || "#999";
    block = block.replace(/stroke:\s*#?\w+\s*[\d.]*/, `stroke: ${sc} ${sw}`);
    if (!block.includes("stroke:")) block += `\n  stroke: ${sc} ${sw}`;
    // Flow
    if (flowSel.value !== "none") {
      const dur = flowDur.value || "800";
      const flowLine = `flow: ${flowSel.value} ${dur}ms`;
      if (block.includes("flow:")) {
        block = block.replace(/flow:\s*\S+\s*\d*m?s?/, flowLine);
      } else {
        block += `\n  ${flowLine}`;
      }
    } else {
      block = block.replace(/\n\s*flow:\s*\S+\s*\d*m?s?/, "");
    }
    const newText = text.replace(re, block + "\n}");
    fdCanvas.set_text(newText);
    bumpGeneration();
    render();
    syncTextToExtension();
  }

  arrowSel.addEventListener("change", applyEdgeChange);
  curveSel.addEventListener("change", applyEdgeChange);
  strokeColor.addEventListener("input", applyEdgeChange);
  strokeWidth.addEventListener("change", applyEdgeChange);
  flowSel.addEventListener("change", () => {
    flowDur.style.display = flowSel.value !== "none" ? "" : "none";
    applyEdgeChange();
  });
  flowDur.addEventListener("change", applyEdgeChange);

  // Delete edge
  document.getElementById("ecm-delete")?.addEventListener("click", () => {
    if (!fdCanvas || !ecmEdgeId) { closeEdgeContextMenu(); return; }
    // Select the edge and delete it
    fdCanvas.select_by_id(ecmEdgeId);
    const changed = fdCanvas.delete_selected();
    if (changed) {
      bumpGeneration();
      render();
      syncTextToExtension();
    }
    closeEdgeContextMenu();
  });

  // Reverse edge direction (swap from: and to:)
  document.getElementById("ecm-reverse")?.addEventListener("click", () => {
    if (!fdCanvas || !ecmEdgeId) { closeEdgeContextMenu(); return; }
    const text = fdCanvas.get_text();
    const esc = ecmEdgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(edge\\s+@${esc}\\s*\\{[^}]*?)\\}`, "s");
    const m = text.match(re);
    if (!m) { closeEdgeContextMenu(); return; }
    let block = m[1];
    // Extract from: and to: values
    const fromMatch = block.match(/from:\s*(.+)/);
    const toMatch = block.match(/to:\s*(.+)/);
    if (fromMatch && toMatch) {
      const fromVal = fromMatch[1].trim();
      const toVal = toMatch[1].trim();
      block = block.replace(/from:\s*.+/, `from: ${toVal}`);
      block = block.replace(/to:\s*.+/, `to: ${fromVal}`);
      const newText = text.replace(re, block + "\n}");
      fdCanvas.set_text(newText);
      bumpGeneration();
      render();
      syncTextToExtension();
    }
    closeEdgeContextMenu();
  });
}

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

/** Toggle spec badge overlay on/off (independent of Spec View mode). */
function toggleSpecBadges() {
  specBadgesVisible = !specBadgesVisible;
  const btn = document.getElementById("sm-note-badge-toggle");
  if (btn) btn.classList.toggle("active", specBadgesVisible);
  vscode.setState({ ...(vscode.getState() || {}), specBadgesVisible });

  const overlay = document.getElementById("spec-overlay");
  if (specBadgesVisible || viewMode === "specs") {
    refreshSpecBadges();
  } else {
    if (overlay) { overlay.innerHTML = ""; overlay.style.display = "none"; }
  }
}

/** Set up spec badge toggle button and restore persisted state. */
function setupSpecBadgeToggle() {
  const btn = document.getElementById("sm-note-badge-toggle");
  if (!btn) return;

  // Restore persisted state
  const savedState = vscode.getState();
  if (savedState && savedState.specBadgesVisible) {
    specBadgesVisible = true;
    btn.classList.add("active");
    setTimeout(() => { if (fdCanvas) refreshSpecBadges(); }, 500);
  }

  btn.addEventListener("click", toggleSpecBadges);
}

