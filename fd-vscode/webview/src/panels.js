// ─── panels.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

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
          captureDefault(key, el.value);
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
          captureDefault("opacity", String(v));
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

  // Dispatch selection change event for AI chat panel
  const selIds = [];
  try {
    const ids = JSON.parse(fdCanvas.get_selected_ids());
    selIds.push(...ids);
  } catch (_) {}
  const selKey = selIds.join(',');
  if (selKey !== updatePropertiesPanel._lastSelKey) {
    updatePropertiesPanel._lastSelKey = selKey;
    document.dispatchEvent(new CustomEvent('fd-selection-changed', { detail: { ids: selIds } }));
  }

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

  // Text content (for text nodes)
  const textSection = document.getElementById("props-text-section");
  const textInput = document.getElementById("prop-text-content");

  if (props.kind === "text") {
    if (textSection) textSection.style.display = "";
    if (textInput) textInput.value = props.content || "";
  } else {
    if (textSection) textSection.style.display = "none";
  }

  // Alignment grid — show for text/rect/ellipse nodes
  const alignSection = document.getElementById("props-align-section");
  if (alignSection) {
    const showAlign = props.kind === "text" || props.kind === "rect" || props.kind === "ellipse";
    alignSection.style.display = showAlign ? "" : "none";
    if (showAlign) {
      const h = props.textAlign || "center";
      const v = props.textVAlign || "middle";
      document.querySelectorAll(".align-cell").forEach(cell => {
        const cellH = cell.dataset.h;
        const cellV = cell.dataset.v;
        cell.classList.toggle("active", cellH === h && cellV === v);
      });
    }
  }

  // Show/hide appearance section based on kind
  const appearance = document.getElementById("props-appearance");
  if (appearance) {
    appearance.style.display = (props.kind === "root" || props.kind === "group") ? "none" : "";
  }

  // Actions section state
  updatePropsActionsState();

  propsSuppressSync = false;
}

// ─── Alignment Grid Picker ─────────────────────────────────────────────────

function setupAlignGrid() {
  const grid = document.getElementById("align-grid");
  if (!grid) return;
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".align-cell");
    if (!cell || !fdCanvas) return;
    const h = cell.dataset.h;
    const v = cell.dataset.v;
    fdCanvas.set_node_prop("textAlign", h);
    fdCanvas.set_node_prop("textVAlign", v);
    render();
    syncTextToExtension();
    updatePropertiesPanel();
  });
}

// ─── Props Actions (Group, Ungroup, Duplicate, etc.) ───────────────────────

function setupPropsActions() {
  const actions = {
    "props-group": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.group_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
    "props-ungroup": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.ungroup_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
    "props-duplicate": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.duplicate_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
    "props-frame": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("f", false, false, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { render(); syncTextToExtension(); }
    },
    "props-bring-front": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("]", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    },
    "props-send-back": () => {
      if (!fdCanvas) return;
      const resultJson = fdCanvas.handle_key("[", false, true, false, true);
      const result = JSON.parse(resultJson);
      if (result.changed) { bumpGeneration(); render(); syncTextToExtension(); }
    },
    "props-copy-png": () => {
      if (!fdCanvas) return;
      copySelectionAsPng();
    },
    "props-delete": () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.delete_selected();
      if (changed) { render(); syncTextToExtension(); }
    },
  };

  for (const [id, handler] of Object.entries(actions)) {
    document.getElementById(id)?.addEventListener("click", (e) => {
      e.stopPropagation();
      handler();
      updatePropertiesPanel();
      updateFloatingBar();
      refreshLayersPanel();
    });
  }
}

/** Enable/disable action buttons based on current selection state. */
function updatePropsActionsState() {
  if (!fdCanvas) return;
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  const canGroup = selectedIds.length >= 2;

  // Check if any selected node is a group
  let canUngroup = false;
  if (selectedIds.length >= 1) {
    const source = fdCanvas.get_text();
    for (const id of selectedIds) {
      if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
        canUngroup = true;
        break;
      }
    }
  }

  document.getElementById("props-group")?.classList.toggle("disabled", !canGroup);
  document.getElementById("props-ungroup")?.classList.toggle("disabled", !canUngroup);
  document.getElementById("props-frame")?.classList.toggle("disabled", !canGroup);
}


// ─── Layers Panel (Tree View) ────────────────────────────────────────────

const LAYER_ICONS = {
  group: "◻",
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

    // Edge — matches both header form (edge @name @from -> @to) and body form (edge @name {)
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s+@(\w+)\s*->\s*@(\w+)/) ||
                      trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      const node = { id: edgeMatch[1], kind: "edge", text: "", children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      if (trimmed.includes('{')) { braceDepth += openBraces - closeBraces; stack.push({ node, depth: braceDepth }); }
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
function renderLayerNode(node, selectedIds, depth = 0) {
  const icon = LAYER_ICONS[node.kind] || "•";
  const isSelected = selectedIds.has(node.id);
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

  let html = `<div class="layer-item${isSelected ? " selected" : ""}" data-node-id="${escapeAttr(node.id)}" data-node-kind="${escapeAttr(node.kind)}" draggable="true">`;
  html += `<span class="layer-indent">${indent}</span>`;
  html += chevron;
  html += `<span class="layer-icon">${icon}</span>`;
  const isLocked = fdCanvas && fdCanvas.is_node_locked && fdCanvas.is_node_locked(node.id);
  html += `<span class="layer-name">${escapeHtml(node.id)}${textPreview}</span>`;
  html += `<span class="layer-kind">${escapeHtml(node.kind)}</span>`;
  if (isLocked) {
    html += `<span class="layer-lock" title="Locked">🔒</span>`;
  }
  html += `<span class="layer-actions" data-actions-id="${escapeAttr(node.id)}" title="More actions">⋮</span>`;
  html += `<span class="layer-eye" data-eye-id="${escapeAttr(node.id)}" title="Toggle visibility">👁</span>`;
  html += `</div>`;

  if (hasChildren) {
    html += `<div class="layer-children" data-parent-id="${escapeAttr(node.id)}">`;
    for (const child of node.children) {
      html += renderLayerNode(child, selectedIds, depth + 1);
    }
    html += `</div>`;
  }
  return html;
}

/** Refresh the layers panel content. */

// ─── Spec Summary Panel (replaces layers in Spec mode) ──────────────────

function refreshSpecsSummary(panel) {
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
  html += `<option value="todo">→ To Do</option>`;
  html += `<option value="doing">→ Doing</option>`;
  html += `<option value="done">→ Done</option>`;
  html += `<option value="blocked">→ Blocked</option>`;
  html += `</select>`;
  html += `</div>`;
  html += `</div>`;

  // Filter tabs
  const filters = [
    { key: "all", label: "All" },
    { key: "todo", label: "To Do" },
    { key: "doing", label: "Doing" },
    { key: "done", label: "Done" },
    { key: "blocked", label: "Blocked" },
  ];
  html += `<div class="spec-filter-tabs">`;
  for (const f of filters) {
    const active = noteFilter === f.key ? " active" : "";
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
  const filtered = noteFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === noteFilter)
    );

  if (filtered.length === 0 && annotated.length === 0) {
    html += `<div class="spec-empty-state">`;
    html += `<div style="font-size:24px;margin-bottom:8px;opacity:0.4">◇</div>`;
    html += `<div style="opacity:0.5;font-size:12px">No spec annotations yet</div>`;
    html += `<div style="opacity:0.35;font-size:11px;margin-top:4px">Right-click a node → Add Spec, or press ⌘I</div>`;
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
      noteFilter = btn.getAttribute("data-filter") || "all";
      refreshSpecsSummary(panel);
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
  const targets = noteFilter === "all"
    ? annotated
    : annotated.filter(n =>
      n.annotations.some(a => a.type === "status" && a.value === noteFilter)
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
  if (panel) refreshSpecsSummary(panel);
}

/** Close any open layer context menu. */
function closeLayerCtxMenu() {
  ctxMenu.close();
}

/** Searchable "Move Into" picker for the extension — mirrors app.js implementation. */
function showSearchableParentPicker(nodeId, posX, posY) {
  if (!fdCanvas?.get_container_ids) return;
  let containers;
  try { containers = JSON.parse(fdCanvas.get_container_ids()); } catch (_) { return; }
  const validTargets = containers.filter(c => c.id !== nodeId);
  if (validTargets.length === 0) { showToast('No valid containers'); return; }

  document.getElementById('parent-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'parent-picker';
  picker.style.cssText = `position:fixed;left:${posX}px;top:${posY}px;z-index:310;` +
    'min-width:220px;max-width:280px;max-height:320px;display:flex;flex-direction:column;' +
    'background:var(--vscode-menu-background,#1e1e1e);border:1px solid var(--vscode-menu-border,#454545);' +
    'border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);overflow:hidden;' +
    'font-family:var(--vscode-editor-font-family,monospace);font-size:12px;';

  const header = document.createElement('div');
  header.style.cssText = 'padding:8px 10px 4px;color:var(--vscode-descriptionForeground,#888);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
  header.textContent = `Move @${nodeId} into`;
  picker.appendChild(header);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search containers…';
  input.style.cssText = 'margin:0 8px 4px;padding:6px 8px;border:1px solid var(--vscode-input-border,#444);' +
    'border-radius:6px;background:var(--vscode-input-background,#0A0A0A);color:var(--vscode-input-foreground,#E5E5EA);' +
    'font-size:12px;font-family:inherit;outline:none;';
  picker.appendChild(input);

  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;max-height:240px;padding:4px 0;';
  picker.appendChild(list);

  function renderList(filter) {
    list.innerHTML = '';
    const q = (filter || '').toLowerCase();
    const matches = validTargets.filter(c => c.id.toLowerCase().includes(q));
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 10px;color:var(--vscode-descriptionForeground,#666);text-align:center;';
      empty.textContent = 'No matches';
      list.appendChild(empty);
      return;
    }
    for (const t of matches.slice(0, 50)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;' +
        'color:var(--vscode-menu-foreground,#E5E5EA);transition:background .1s;';
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--vscode-list-hoverBackground,rgba(255,255,255,0.06))'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      const icon = document.createElement('span');
      icon.textContent = LAYER_ICONS[t.kind] || '•';
      icon.style.cssText = 'width:16px;text-align:center;flex-shrink:0;';
      row.appendChild(icon);

      const name = document.createElement('span');
      name.textContent = `@${t.id}`;
      name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      row.appendChild(name);

      const moveBtn = document.createElement('button');
      moveBtn.textContent = '📦';
      moveBtn.title = 'Nest (preserve position)';
      moveBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
      moveBtn.addEventListener('mouseenter', () => { moveBtn.style.background = 'var(--vscode-focusBorder,#007AFF)'; });
      moveBtn.addEventListener('mouseleave', () => { moveBtn.style.background = ''; });
      moveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, false); });
      row.appendChild(moveBtn);

      const centerBtn = document.createElement('button');
      centerBtn.textContent = '⊙';
      centerBtn.title = 'Center in container';
      centerBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
      centerBtn.addEventListener('mouseenter', () => { centerBtn.style.background = 'var(--vscode-focusBorder,#007AFF)'; });
      centerBtn.addEventListener('mouseleave', () => { centerBtn.style.background = ''; });
      centerBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, true); });
      row.appendChild(centerBtn);

      row.addEventListener('click', () => doReparent(t.id, false));
      list.appendChild(row);
    }
    if (matches.length > 50) {
      const more = document.createElement('div');
      more.style.cssText = 'padding:6px 10px;color:var(--vscode-descriptionForeground,#666);text-align:center;font-size:10px;';
      more.textContent = `…${matches.length - 50} more (refine search)`;
      list.appendChild(more);
    }
  }

  function doReparent(targetId, center) {
    const textBefore = fdCanvas.get_text();
    let changed = false;
    if (center && fdCanvas.reparent_into_centered) {
      changed = fdCanvas.reparent_into_centered(nodeId, targetId);
    } else {
      changed = fdCanvas.reparent_into(nodeId, targetId);
    }
    if (changed) {
      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
      bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
      showToast(`Moved @${nodeId} → @${targetId}`);
    }
    closePicker();
  }

  function closePicker() {
    picker.remove();
    document.removeEventListener('pointerdown', outsideClickHandler, true);
    document.removeEventListener('keydown', escHandler, true);
  }
  function outsideClickHandler(ev) { if (!picker.contains(ev.target)) closePicker(); }
  function escHandler(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); closePicker(); } }

  input.addEventListener('input', () => renderList(input.value));
  renderList('');
  document.body.appendChild(picker);

  requestAnimationFrame(() => {
    const r = picker.getBoundingClientRect();
    if (r.right > window.innerWidth) picker.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
    if (r.bottom > window.innerHeight) picker.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
  });

  setTimeout(() => {
    input.focus();
    document.addEventListener('pointerdown', outsideClickHandler, true);
    document.addEventListener('keydown', escHandler, true);
  }, 50);
}

/** Clear all drag indicators from layer items. */
function clearLayerDragIndicators(panel) {
  panel.querySelectorAll('.layer-item').forEach(el => {
    el.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
  });
  panel.querySelectorAll('.layers-body').forEach(el => {
    el.classList.remove('drag-over-root');
  });
}

/** Determine drop zone dynamically based on container type. */
function getDropZone(e, el) {
  const rect = el.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const h = rect.height;
  const kind = el.getAttribute('data-node-kind');
  const isContainer = ['rect','ellipse','frame','group'].includes(kind);
  const edgePct = isContainer ? 0.15 : 0.5;

  if (y < h * edgePct) return 'above';
  if (y > h * (1 - edgePct)) return 'below';
  return isContainer ? 'nest' : 'below';
}

/** Get sibling index of a node in the DOM. */
function getSiblingIndex(panel, nodeId) {
  const item = panel.querySelector(`.layer-item[data-node-id="${nodeId}"]`);
  if (!item) return 0;
  const parent = item.parentElement;
  if (!parent) return 0;
  const siblings = [...parent.querySelectorAll(':scope > .layer-item')];
  return siblings.indexOf(item);
}

/** Wire drag-and-drop handlers on layer items. */
function wireLayerDragDrop(panel) {
  if (!fdCanvas) return;
  let draggedId = null;

  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedId = item.getAttribute('data-node-id');
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });

    item.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetId = item.getAttribute('data-node-id');
      if (!draggedId || targetId === draggedId) return;
      clearLayerDragIndicators(panel);
      const zone = getDropZone(e, item);
      const kind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(kind);
      if (zone === 'nest' && isContainer) {
        item.classList.add('drag-over-nest');
      } else if (zone === 'above') {
        item.classList.add('drag-over-above');
      } else {
        item.classList.add('drag-over-below');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearLayerDragIndicators(panel);
      const targetId = item.getAttribute('data-node-id');
      if (!draggedId || !fdCanvas || targetId === draggedId) return;
      const textBefore = fdCanvas.get_text();
      const zone = getDropZone(e, item);
      const kind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(kind);
      let changed = false;
      if (zone === 'nest' && isContainer) {
        changed = e.altKey && fdCanvas.reparent_into_centered
          ? fdCanvas.reparent_into_centered(draggedId, targetId)
          : fdCanvas.reparent_into(draggedId, targetId);
      } else {
        let targetParent = item.parentElement?.getAttribute?.('data-parent-id') || null;
        let activeTargetId = targetId;

        // Drag-to-root (unindent): If user drags mouse horizontally left of the item text (approx 24px)
        const rect = item.getBoundingClientRect();
        if (e.clientX - rect.left < 24 && targetParent) {
          // Find the root-level ancestor
          let currentParentId = targetParent;
          while (currentParentId) {
            const parentItem = panel.querySelector(`.layer-item[data-node-id="${currentParentId}"]`);
            if (!parentItem) break;
            activeTargetId = currentParentId;
            currentParentId = parentItem.parentElement?.getAttribute?.('data-parent-id') || null;
          }
          targetParent = null; // Detaching to root
        }

        const targetIndex = getSiblingIndex(panel, activeTargetId);
        // If we unnested, we logically drop it 'below' the entire group
        const insertIndex = (zone === 'above' && targetId === activeTargetId) ? targetIndex : targetIndex + 1;
        const dragItem = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
        const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id') || null;

        if (targetParent === dragParent) {
          // Same parent (including both being root) — pure reorder
          changed = fdCanvas.reorder_child(draggedId, insertIndex);
        } else if (targetParent) {
          // Different parent — reparent into target's parent, then reorder
          changed = fdCanvas.reparent_into(draggedId, targetParent);
          if (changed) {
            fdCanvas.reorder_child(draggedId, insertIndex);
          }
        } else {
          // Target is at root level — reparent to root, then reorder
          changed = fdCanvas.reparent_into(draggedId, 'root');
          // 'changed' might be false if already at root, but reorder still needs to happen
          fdCanvas.reorder_child(draggedId, insertIndex);
          changed = true; // We triggered a mutation
        }
      }
      if (changed) {
        const textAfter = fdCanvas.get_text();
        if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        refreshLayersPanel();
      }
      draggedId = null;
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      clearLayerDragIndicators(panel);
      draggedId = null;
    });
  });

  // Drop-to-root
  const layersBody = panel.querySelector('.layers-body');
  if (layersBody) {
    layersBody.addEventListener('dragover', (e) => {
      if (e.target.closest('.layer-item')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearLayerDragIndicators(panel);
      layersBody.classList.add('drag-over-root');
    });
    layersBody.addEventListener('dragleave', (e) => {
      if (!layersBody.contains(e.relatedTarget) || e.relatedTarget?.closest('.layer-item')) {
        layersBody.classList.remove('drag-over-root');
      }
    });
    layersBody.addEventListener('drop', (e) => {
      if (e.target.closest('.layer-item')) return;
      e.preventDefault();
      layersBody.classList.remove('drag-over-root');
      if (!draggedId || !fdCanvas) return;
      const textBefore = fdCanvas.get_text();
      const changed = fdCanvas.reparent_into(draggedId, 'root');
      if (changed) {
        const textAfter = fdCanvas.get_text();
        if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        refreshLayersPanel();
        // Flash the moved item to confirm the operation
        requestAnimationFrame(() => {
          const movedEl = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
          if (movedEl) {
            movedEl.classList.add('just-moved');
            movedEl.addEventListener('animationend', () => movedEl.classList.remove('just-moved'), { once: true });
          }
        });
      }
      draggedId = null;
    });
  }
}

/** Wire right-click context menu on layer items — full parity with canvas context menu. */
function wireLayerContextMenu(panel) {
  if (!fdCanvas) return;
  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctxMenu.close();
      const nodeId = item.getAttribute('data-node-id');
      if (!nodeId) return;

      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(nodeId)) {
        fdCanvas.select_by_id(nodeId);
      }
      const nodeKind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(nodeKind);
      const hasChildren = !!item.nextElementSibling?.classList.contains('layer-children');
      const canGroup = selectedIds.length >= 2 || (selectedIds.includes(nodeId) && selectedIds.length >= 2);
      let canUngroup = false;
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
          canUngroup = true;
          break;
        }
      }
      const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(nodeId) : false;

      const items = [];

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

      // Select Children (containers only)
      if (isContainer && hasChildren) {
        items.push({ action: 'select-children', label: 'Select Children', icon: '📂' });
      }
      items.push({ type: 'separator' });

      // Move Into — opens searchable picker
      items.push({ action: 'move-into-search', label: 'Move Into…', icon: '📦' });
      items.push({ action: 'move-to-root', label: 'Move to Root', icon: '↑' });
      items.push({ type: 'separator' });

      // Delete
      items.push({ action: 'delete', label: 'Delete', icon: '✕', shortcut: '⌫', danger: true });

      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: (action, btn) => {
          if (action === 'rename') {
            const nameEl = item.querySelector('.layer-name');
            if (nameEl) nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            return;
          }
          const textBefore = fdCanvas.get_text();
          let changed = false;
          if (action === 'cut') {
            copySelectedAsFd();
            changed = fdCanvas.delete_selected();
          } else if (action === 'copy') {
            copySelectedAsFd();
            return;
          } else if (action === 'paste') {
            pasteFromClipboard().then(() => {
              bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
            });
            return;
          } else if (action === 'copy-png') {
            if (typeof copySelectionAsPng === 'function') copySelectionAsPng();
            return;
          } else if (action === 'duplicate') {
            changed = fdCanvas.duplicate_selected();
          } else if (action === 'group') {
            changed = fdCanvas.group_selected();
          } else if (action === 'ungroup') {
            changed = fdCanvas.ungroup_selected();
          } else if (action === 'frame') {
            const resultJson = fdCanvas.handle_key('f', false, false, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'bring-front') {
            const resultJson = fdCanvas.handle_key(']', false, true, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'send-back') {
            const resultJson = fdCanvas.handle_key('[', false, true, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'lock') {
            if (fdCanvas.toggle_node_locked) { fdCanvas.toggle_node_locked(nodeId); changed = true; }
          } else if (action === 'select-children') {
            const childrenContainer = panel.querySelector(`.layer-children[data-parent-id="${nodeId}"]`);
            if (childrenContainer) {
              const childIds = [...childrenContainer.querySelectorAll(':scope > .layer-item')].map(
                el => el.getAttribute('data-node-id')
              ).filter(Boolean);
              if (childIds.length > 0) {
                fdCanvas.select_multiple_by_ids(JSON.stringify(childIds));
                bumpGeneration(); render(); updatePropertiesPanel(); updateFloatingBar(); refreshLayersPanel();
              }
            }
            return;
          } else if (action === 'move-into-search') {
            showSearchableParentPicker(nodeId, e.clientX ?? 200, e.clientY ?? 200);
            return;
          } else if (action === 'move-into') {
            changed = fdCanvas.reparent_into(nodeId, btn.getAttribute('data-target'));
          } else if (action === 'center-into') {
            const targetId = btn.getAttribute('data-target');
            changed = fdCanvas.reparent_into_centered
              ? fdCanvas.reparent_into_centered(nodeId, targetId)
              : fdCanvas.reparent_into(nodeId, targetId);
          } else if (action === 'move-to-root') {
            changed = fdCanvas.reparent_into(nodeId, 'root');
          } else if (action === 'delete') {
            changed = fdCanvas.delete_selected();
          }
          if (changed) {
            const textAfter = fdCanvas.get_text();
            if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
            bumpGeneration(); render(); syncTextToExtension(); updatePropertiesPanel(); refreshLayersPanel();
          }
        },
      });
    });
  });
}

/** Last layer generation + selection — skip rebuild when unchanged */
let lastLayerGeneration = -1;
let lastLayerSelectedId = "";

/** Last clicked layer item ID — for ⇧+click range select */
let lastClickedLayerId = "";

/** Flatten a layer tree into a visible-order array of IDs (respects collapsed state). */
function flattenLayerTree(nodes, panel) {
  const result = [];
  for (const node of nodes) {
    result.push(node.id);
    if (node.children.length > 0) {
      const childrenEl = panel?.querySelector(`.layer-children[data-parent-id="${node.id}"]`);
      const isCollapsed = childrenEl?.classList.contains('collapsed');
      if (!isCollapsed) {
        result.push(...flattenLayerTree(node.children, panel));
      }
    }
  }
  return result;
}

function refreshLayersPanel() {
  const panel = document.getElementById("layers-panel");
  if (!panel || !fdCanvas) return;

  // In Spec mode, show requirements summary instead of layers
  if (viewMode === "specs") {
    lastLayerGeneration = -1;
    refreshSpecsSummary(panel);
    return;
  }

  // Use full set of selected IDs for multi-select highlighting
  const selectedIds = new Set(JSON.parse(fdCanvas.get_selected_ids()));
  const selectedKey = [...selectedIds].sort().join(',');

  // Skip DOM rebuild if nothing changed (uses generation counter instead of full-text hash)
  if (sceneGeneration === lastLayerGeneration && selectedKey === lastLayerSelectedId) return;

  // Selection-only change: update highlight on existing DOM without full rebuild
  if (sceneGeneration === lastLayerGeneration && selectedKey !== lastLayerSelectedId) {
    lastLayerSelectedId = selectedKey;
    panel.querySelectorAll(".layer-item").forEach(el => {
      const isSelected = selectedIds.has(el.getAttribute("data-node-id"));
      el.classList.toggle("selected", isSelected);
      if (isSelected) {
        let current = el.closest(".layer-children");
        while (current) {
          if (current.classList.contains("collapsed")) {
            current.classList.remove("collapsed");
            const parentId = current.getAttribute("data-parent-id");
            const chevron = panel.querySelector(`.layer-chevron[data-toggle-id="${parentId}"]`);
            if (chevron) chevron.classList.add("expanded");
          }
          current = current.parentElement?.closest(".layer-children");
        }
      }
    });
    // Scroll first selected item into view (Canvas/Code → Layers sync)
    const selectedEl = panel.querySelector('.layer-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  lastLayerGeneration = sceneGeneration;
  lastLayerSelectedId = selectedKey;

  const source = fdCanvas.get_text();

  const tree = parseLayerTree(source);

  // Count total nodes
  const countNodes = (nodes) => nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
  const totalCount = countNodes(tree);

  let html = `<div class="layers-header">`;
  html += `<span class="layers-title">Layers</span>`;
  html += `<span class="layers-count">${totalCount}</span>`;
  html += `</div>`;
  html += `<div class="layers-body">`;
  for (const node of tree) {
    html += renderLayerNode(node, selectedIds);
  }
  html += `</div>`;

  panel.innerHTML = html;

  // Wire click handlers for layer items — ⌘+click multi, ⇧+click range, plain click
  panel.querySelectorAll(".layer-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      // Don't select when clicking chevron
      if (e.target.closest(".layer-chevron")) return;
      e.stopPropagation();
      const nodeId = item.getAttribute("data-node-id");
      if (!nodeId || !fdCanvas) return;

      // ⌘+click (Mac) / Ctrl+click (others) — toggle single node in selection
      if (e.metaKey || e.ctrlKey) {
        fdCanvas.toggle_select_by_id(nodeId);
        lastClickedLayerId = nodeId;
        // Update highlighting from actual selection state
        const newIds = new Set(JSON.parse(fdCanvas.get_selected_ids()));
        lastLayerGeneration = sceneGeneration;
        lastLayerSelectedId = [...newIds].sort().join(',');
        panel.querySelectorAll(".layer-item").forEach(el =>
          el.classList.toggle("selected", newIds.has(el.getAttribute("data-node-id")))
        );
        render();
        updatePropertiesPanel();
        updateFloatingBar();
        return;
      }

      // ⇧+click — range select from lastClickedLayerId to this node
      if (e.shiftKey && lastClickedLayerId) {
        const flatIds = flattenLayerTree(tree, panel);
        const startIdx = flatIds.indexOf(lastClickedLayerId);
        const endIdx = flatIds.indexOf(nodeId);
        if (startIdx >= 0 && endIdx >= 0) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          const rangeIds = flatIds.slice(lo, hi + 1);
          fdCanvas.select_multiple_by_ids(JSON.stringify(rangeIds));
          const newIds = new Set(rangeIds);
          lastLayerGeneration = sceneGeneration;
          lastLayerSelectedId = [...newIds].sort().join(',');
          panel.querySelectorAll(".layer-item").forEach(el =>
            el.classList.toggle("selected", newIds.has(el.getAttribute("data-node-id")))
          );
          render();
          updatePropertiesPanel();
          updateFloatingBar();
          return;
        }
      }

      // Plain click — single select
      lastClickedLayerId = nodeId;
      lastLayerGeneration = sceneGeneration;
      lastLayerSelectedId = nodeId;
      panel.querySelectorAll(".layer-item").forEach((el) => {
        el.classList.toggle("selected", el.getAttribute("data-node-id") === nodeId);
      });
      // Smart focus: pan/zoom to the selected node if needed
      focusOnNode(nodeId);
      // Central sync: Canvas select + Code highlight + side panels
      syncSelection(nodeId, "layers");
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

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
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
          const ok = fdCanvas.set_text(renamed);
          if (ok) {
            render();
            syncTextToExtension();
          }
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

  // ── Layer Drag-and-Drop ──
  wireLayerDragDrop(panel);

  // ── Layer Context Menu ("Move Into") ──
  wireLayerContextMenu(panel);

  // ── Keyboard shortcuts when layers panel is focused (#7) ──
  wireLayerKeyboardShortcuts(panel);

  // ── Auto-expand parents of selected items and scroll into view ──
  panel.querySelectorAll('.layer-item.selected').forEach(el => {
    let current = el.closest(".layer-children");
    while (current) {
      if (current.classList.contains("collapsed")) {
        current.classList.remove("collapsed");
        const parentId = current.getAttribute("data-parent-id");
        const chevron = panel.querySelector(`.layer-chevron[data-toggle-id="${parentId}"]`);
        if (chevron) chevron.classList.add("expanded");
      }
      current = current.parentElement?.closest(".layer-children");
    }
  });
  const sel = panel.querySelector('.layer-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Wire keyboard shortcuts for layers panel — Delete, ⌘C/X/V/D (#5, #7) */
function wireLayerKeyboardShortcuts(panel) {
  // Make panel focusable so it can receive key events
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');

  // Only attach once
  if (panel._layerKeysWired) return;
  panel._layerKeysWired = true;

  panel.addEventListener('keydown', (e) => {
    if (!fdCanvas) return;
    const meta = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    // Delete / Backspace → delete selected
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      e.stopPropagation();
      const changed = fdCanvas.delete_selected();
      if (changed) {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      }
      return;
    }

    // ⌘D → duplicate
    if (meta && key === 'd') {
      e.preventDefault();
      e.stopPropagation();
      const changed = fdCanvas.duplicate_selected();
      if (changed) {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      }
      return;
    }

    // ⌘C → copy
    if (meta && key === 'c' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      copySelectedAsFd();
      return;
    }

    // ⌘X → cut
    if (meta && key === 'x') {
      e.preventDefault();
      e.stopPropagation();
      cutSelectedAsFd();
      bumpGeneration();
      render();
      syncTextToExtension();
      updatePropertiesPanel();
      updateFloatingBar();
      refreshLayersPanel();
      return;
    }

    // ⌘V → paste
    if (meta && key === 'v') {
      e.preventDefault();
      e.stopPropagation();
      pasteFromClipboard().then(() => {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      });
      return;
    }

    // ⌘A → select all
    if (meta && key === 'a') {
      e.preventDefault();
      e.stopPropagation();
      selectAllNodes();
      refreshLayersPanel();
      return;
    }

    // Enter → Rename
    if (key === 'enter') {
      e.preventDefault();
      e.stopPropagation();
      const sel = panel.querySelector('.layer-item.selected .layer-name');
      if (sel) {
        // Trigger the dblclick handler that sets up inline rename
        sel.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
      return;
    }

    // Space → Toggle Visibility
    if (key === ' ' || key === 'spacebar') {
      e.preventDefault();
      e.stopPropagation();
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      for (const id of selectedIds) {
        toggleNodeVisibility(id);
      }
      return;
    }

    // ⌘G → Group / ⌘⇧G → Ungroup
    if (meta && key === 'g') {
      e.preventDefault();
      e.stopPropagation();
      const changed = e.shiftKey ? fdCanvas.ungroup_selected() : fdCanvas.group_selected();
      if (changed) {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      }
      return;
    }

    // ⌘⇧L → Lock Selection
    if (meta && e.shiftKey && key === 'l') {
      e.preventDefault();
      e.stopPropagation();
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      let changed = false;
      for (const id of selectedIds) {
        if (fdCanvas.toggle_node_locked) {
          fdCanvas.toggle_node_locked(id);
          changed = true;
        }
      }
      if (changed) {
        bumpGeneration();
        render();
        syncTextToExtension();
        updatePropertiesPanel();
        updateFloatingBar();
        refreshLayersPanel();
      }
      return;
    }

    // Up / Down arrow navigation
    if (key === 'arrowup' || key === 'arrowdown') {
      e.preventDefault();
      e.stopPropagation();
      
      const tree = parseLayerTree(fdCanvas.get_text());
      const flatIds = flattenLayerTree(tree, panel);
      if (flatIds.length === 0) return;

      const currentSelectedIds = JSON.parse(fdCanvas.get_selected_ids());
      let focusId = lastLayerSelectedId;
      if (currentSelectedIds.length > 0 && !flatIds.includes(focusId)) {
        focusId = currentSelectedIds[0];
      }

      let idx = flatIds.indexOf(focusId);
      if (idx === -1) idx = 0;

      const newIdx = key === 'arrowup' ? Math.max(0, idx - 1) : Math.min(flatIds.length - 1, idx + 1);
      const targetId = flatIds[newIdx];

      if (e.shiftKey) {
        // Extend selection
        const newSelectedIds = new Set(currentSelectedIds);
        newSelectedIds.add(targetId);
        fdCanvas.select_multiple_by_ids(JSON.stringify([...newSelectedIds]));
      } else {
        // Single selection
        fdCanvas.select_by_id(targetId);
      }

      lastLayerSelectedId = targetId;
      render();
      updatePropertiesPanel();
      updateFloatingBar();
      refreshLayersPanel();
      return;
    }
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


// ─── Library Panel ───────────────────────────────────────────────────────

/** Library component data from extension host */
let libraryComponents = [];
let librarySearchQuery = "";

/** Toggle library panel visibility */
function toggleLibraryPanel() {
  const panel = document.getElementById("library-panel");
  if (!panel) return;
  const isVisible = panel.classList.toggle("visible");
  if (isVisible) {
    // Request library data from extension on first open
    vscode.postMessage({ type: "requestLibraries" });
    refreshLibraryPanel();
  }
}

/** Render library panel contents */
function refreshLibraryPanel() {
  const panel = document.getElementById("library-panel");
  if (!panel) return;

  let html = `<div class="lib-header">`;
  html += `<span class="lib-title">📦 Libraries</span>`;
  html += `<button class="lib-close" id="lib-close-btn" title="Close" aria-label="Close">×</button>`;
  html += `</div>`;
  html += `<input class="lib-search" id="lib-search" type="text" placeholder="Search components…" value="${escapeAttr(librarySearchQuery)}">`;

  if (libraryComponents.length === 0) {
    html += `<div class="lib-empty">`;
    html += `<div class="lib-empty-icon">📦</div>`;
    html += `<div>No libraries found</div>`;
    html += `<div style="margin-top:4px;opacity:0.6">Add .fd files to a <code>libraries/</code> folder</div>`;
    html += `</div>`;
    panel.innerHTML = html;
    wireLibraryHandlers(panel);
    return;
  }

  const query = librarySearchQuery.toLowerCase();

  for (const lib of libraryComponents) {
    const filtered = lib.components.filter(c =>
      !query || c.name.toLowerCase().includes(query) || c.kind.toLowerCase().includes(query)
    );
    if (filtered.length === 0) continue;

    html += `<div class="lib-group-label">${escapeHtml(lib.name)} (${filtered.length})</div>`;
    for (const comp of filtered) {
      const icon = comp.kind === "theme" ? "◆" : (comp.kind === "group" ? "◻" : LAYER_ICONS[comp.kind] || "•");
      html += `<div class="lib-component" data-lib-name="${escapeAttr(lib.name)}" data-comp-name="${escapeAttr(comp.name)}" data-comp-code="${escapeAttr(comp.code)}">`;
      html += `<span class="lib-icon">${icon}</span>`;
      html += `<span class="lib-name">${escapeHtml(comp.name)}</span>`;
      html += `<span class="lib-kind">${escapeHtml(comp.kind)}</span>`;
      html += `</div>`;
    }
  }

  panel.innerHTML = html;
  wireLibraryHandlers(panel);
}

/** Wire event handlers for library panel */
function wireLibraryHandlers(panel) {
  // Close button
  document.getElementById("lib-close-btn")?.addEventListener("click", () => {
    panel.classList.remove("visible");
    updateSettingsToggleStates();
  });

  // Search input
  document.getElementById("lib-search")?.addEventListener("input", (e) => {
    librarySearchQuery = e.target.value;
    refreshLibraryPanel();
    // Re-focus search input after re-render
    const searchInput = document.getElementById("lib-search");
    if (searchInput) {
      searchInput.focus();
      searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
    }
  });

  // Component click — insert into document
  panel.querySelectorAll(".lib-component").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = item.getAttribute("data-comp-code");
      if (!code || !fdCanvas) return;
      // Append component code to current document text
      const currentText = fdCanvas.get_text();
      const separator = currentText.endsWith("\n") ? "\n" : "\n\n";
      const newText = currentText + separator + code + "\n";
      fdCanvas.set_text(newText);
      bumpGeneration();
      render();
      syncTextToExtension();
      // Brief visual feedback
      item.style.background = "var(--fd-accent)";
      item.style.color = "var(--fd-accent-fg)";
      setTimeout(() => {
        item.style.background = "";
        item.style.color = "";
      }, 300);
    });
  });
}

// ─── Panel Resize ────────────────────────────────────────────────────────

/** Set up drag-to-resize for layers and properties panels. */
function setupPanelResize() {
  const container = document.getElementById("canvas-container");
  const layersPanel = document.getElementById("layers-panel");
  const layersHandle = document.getElementById("layers-resize");
  const propsPanel = document.getElementById("props-panel");
  const layersRestore = document.getElementById("layers-restore");
  const propsRestore = document.getElementById("props-restore");

  if (!container || !layersPanel) return;

  const MIN_WIDTH = 140;
  const MAX_WIDTH = 400;
  const DEFAULT_LAYERS_W = 232;
  const DEFAULT_PROPS_W = 244;

  // Restore persisted state
  const savedState = vscode.getState() || {};
  if (savedState.layersWidth && savedState.layersWidth >= MIN_WIDTH && savedState.layersWidth <= MAX_WIDTH) {
    container.style.setProperty("--layers-width", savedState.layersWidth + "px");
  }
  if (savedState.propsWidth && savedState.propsWidth >= MIN_WIDTH && savedState.propsWidth <= MAX_WIDTH) {
    container.style.setProperty("--props-width", savedState.propsWidth + "px");
  }
  if (savedState.layersCollapsed) {
    layersPanel.classList.add("collapsed");
    container.style.setProperty("--layers-width", "0px");
  }

  /** Position layers resize handle at panel's right edge. */
  function positionLayersHandle() {
    if (!layersHandle) return;
    const w = layersPanel.classList.contains("collapsed") ? 0 : layersPanel.offsetWidth;
    layersHandle.style.left = w + "px";
    layersHandle.style.display = layersPanel.classList.contains("collapsed") ? "none" : "";
  }

  // Initial position
  requestAnimationFrame(positionLayersHandle);

  // ── Layers panel drag ──
  if (layersHandle) {
    let dragging = false;
    let startX = 0;
    let startW = 0;

    layersHandle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startW = layersPanel.offsetWidth;
      layersPanel.classList.add("no-transition");
      layersHandle.classList.add("active");
      layersHandle.setPointerCapture(e.pointerId);
    });

    layersHandle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx));
      container.style.setProperty("--layers-width", newW + "px");
      positionLayersHandle();
      renderDirty = true;
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      layersPanel.classList.remove("no-transition");
      layersHandle.classList.remove("active");
      const w = layersPanel.offsetWidth;
      vscode.setState({ ...(vscode.getState() || {}), layersWidth: w });
    };
    layersHandle.addEventListener("pointerup", endDrag);
    layersHandle.addEventListener("pointercancel", endDrag);

    // Double-click to collapse
    layersHandle.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isCollapsed = layersPanel.classList.toggle("collapsed");
      if (isCollapsed) {
        container.style.setProperty("--layers-width", "0px");
        vscode.setState({ ...(vscode.getState() || {}), layersCollapsed: true });
      } else {
        const state = vscode.getState() || {};
        const restoreW = (state.layersWidth >= MIN_WIDTH && state.layersWidth <= MAX_WIDTH) ? state.layersWidth : DEFAULT_LAYERS_W;
        container.style.setProperty("--layers-width", restoreW + "px");
        vscode.setState({ ...(vscode.getState() || {}), layersCollapsed: false });
      }
      requestAnimationFrame(() => { positionLayersHandle(); renderDirty = true; });
    });
  }

  // ── Restore strips ──
  if (layersRestore) {
    layersRestore.addEventListener("click", () => {
      layersPanel.classList.remove("collapsed");
      const state = vscode.getState() || {};
      const restoreW = (state.layersWidth >= MIN_WIDTH && state.layersWidth <= MAX_WIDTH) ? state.layersWidth : DEFAULT_LAYERS_W;
      container.style.setProperty("--layers-width", restoreW + "px");
      vscode.setState({ ...(vscode.getState() || {}), layersCollapsed: false });
      requestAnimationFrame(() => { positionLayersHandle(); renderDirty = true; });
    });
  }

  // ── Props panel: observe visibility and apply persisted width ──
  if (propsPanel) {
    const propsObserver = new MutationObserver(() => {
      if (propsPanel.classList.contains("visible") && !propsPanel.classList.contains("collapsed")) {
        const state = vscode.getState() || {};
        const w = (state.propsWidth >= MIN_WIDTH && state.propsWidth <= MAX_WIDTH) ? state.propsWidth : DEFAULT_PROPS_W;
        container.style.setProperty("--props-width", w + "px");
      } else {
        container.style.setProperty("--props-width", "0px");
      }
      renderDirty = true;
    });
    propsObserver.observe(propsPanel, { attributes: true, attributeFilter: ["class"] });
  }

  // NOTE: Props panel has no separate resize handle in VS Code since it uses
  // a flex-based layout and the panels are overlays on the canvas-container.
  // The layers panel is the primary resizable panel; props panel gets persisted width.
}
