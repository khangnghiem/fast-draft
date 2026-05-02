// ─── drag-drop.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Drag & Drop ─────────────────────────────────────────────────────────

/** Default dimensions for shapes when dropped from palette. */
const DEFAULT_SHAPE_SIZES = {
  rect: [100, 80],
  ellipse: [100, 80],
  text: [80, 24],
  frame: [200, 150],
  line: [120, 4],
  arrow: [120, 4],
};

function setupDragAndDrop() {
  // Canvas drop target (kept for future drag-from-insert support)
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

    // Line & arrow: create as thin rect with stroke-only styling
    if (shape === "line" || shape === "arrow") {
      const changed = fdCanvas.create_node_at("rect", x, y);
      if (changed) {
        // Restyle to a thin line: narrow height, no fill, black stroke
        const selId = fdCanvas.get_selected_id();
        if (selId) {
          fdCanvas.set_node_prop("width", "120");
          fdCanvas.set_node_prop("height", "2");
          fdCanvas.set_node_prop("fill", "#000000");
          fdCanvas.set_node_prop("cornerRadius", "0");
        }
        render();
        syncTextToExtension();
        updatePropertiesPanel();
      }
      return;
    }

    const changed = fdCanvas.create_node_at(shape, x, y);
    if (changed) {
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  });
}

// ─── Animation Picker ────────────────────────────────────────────────────

const ANIM_PRESETS = [
  {
    group: "Hover", trigger: "hover", items: [
      { label: "Scale Up", icon: "↗", props: { scale: 1.1 }, ease: "spring", duration: 300 },
      { label: "Fade", icon: "◐", props: { opacity: 0.6 }, ease: "ease_in_out", duration: 200 },
      { label: "Color Shift", icon: "◆", props: { fill: "#D63031" }, ease: "ease_out", duration: 250 },
      { label: "Rotate", icon: "↻", props: { rotate: 5 }, ease: "spring", duration: 400 },
      { label: "Lift & Glow", icon: "✦", props: { scale: 1.06 }, ease: "spring", duration: 400 },
    ]
  },
  {
    group: "Press", trigger: "press", items: [
      { label: "Squish", icon: "↙", props: { scale: 0.88 }, ease: "spring", duration: 150 },
      { label: "Dim", icon: "◑", props: { opacity: 0.5 }, ease: "ease_out", duration: 100 },
      { label: "Flash", icon: "⚡", props: { fill: "#FFF" }, ease: "linear", duration: 80 },
    ]
  },
  {
    group: "Enter", trigger: "enter", items: [
      { label: "Fade In", icon: "▶", props: { opacity: 1.0 }, ease: "ease_out", duration: 500 },
      { label: "Pop In", icon: "◉", props: { scale: 1.0, opacity: 1.0 }, ease: "spring", duration: 600 },
      { label: "Slide Up", icon: "⬆", props: { opacity: 1.0 }, ease: "ease_in_out", duration: 400 },
    ]
  },
];

let animPickerTargetId = null;

function setupAnimPicker() {
  const picker = document.getElementById("anim-picker");
  if (!picker) return;

  // Close button
  document.getElementById("anim-picker-close")?.addEventListener("click", closeAnimPicker);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker.classList.contains("visible")) {
      closeAnimPicker();
    }
  });

  // Close on click outside
  document.addEventListener("pointerdown", (e) => {
    if (picker.classList.contains("visible") && !picker.contains(e.target)) {
      closeAnimPicker();
    }
  });
}

function closeAnimPicker() {
  const picker = document.getElementById("anim-picker");
  if (picker) picker.classList.remove("visible");
  animPickerTargetId = null;
}

function openAnimPicker(targetNodeId, clientX, clientY) {
  if (!fdCanvas) return;
  const picker = document.getElementById("anim-picker");
  const body = document.getElementById("anim-picker-body");
  if (!picker || !body) return;

  animPickerTargetId = targetNodeId;
  body.innerHTML = "";

  // Show existing animations on this node
  try {
    const existing = JSON.parse(fdCanvas.get_node_animations_json(targetNodeId));
    if (existing.length > 0) {
      const existLabel = document.createElement("div");
      existLabel.className = "picker-group-label";
      existLabel.textContent = "Current Animations";
      body.appendChild(existLabel);

      for (const anim of existing) {
        const row = document.createElement("div");
        row.className = "picker-existing";
        const trigger = anim.trigger?.Custom || anim.trigger || "?";
        const triggerName = typeof trigger === "string" ? trigger : Object.keys(trigger)[0]?.toLowerCase() || "?";
        row.innerHTML = `<span>:${triggerName}</span> <span style="flex:1;opacity:0.6">${anim.duration_ms || 300}ms</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.className = "pe-remove";
        removeBtn.textContent = "✕";
        removeBtn.addEventListener("click", () => {
          fdCanvas.remove_node_animations(targetNodeId);
          render();
          syncTextToExtension();
          openAnimPicker(targetNodeId, clientX, clientY); // Refresh
        });
        row.appendChild(removeBtn);
        body.appendChild(row);
      }

      const sep = document.createElement("div");
      sep.className = "picker-sep";
      body.appendChild(sep);
    }
  } catch (_) { /* no existing animations */ }

  // Build preset groups
  for (const group of ANIM_PRESETS) {
    const groupLabel = document.createElement("div");
    groupLabel.className = "picker-group-label";
    groupLabel.textContent = group.group;
    body.appendChild(groupLabel);

    for (const preset of group.items) {
      const row = document.createElement("div");
      row.className = "picker-item";
      row.innerHTML = `<span class="pi-icon">${preset.icon}</span><span class="pi-label">${preset.label}</span><span class="pi-meta">${preset.duration}ms</span>`;

      // Live preview on hover
      row.addEventListener("mouseenter", () => {
        if (preset.props.scale != null) {
          startTween(targetNodeId, "scale", 1.0, preset.props.scale, preset.duration, preset.ease);
        }
        if (preset.props.opacity != null) {
          startTween(targetNodeId, "opacity", 1.0, preset.props.opacity, preset.duration, preset.ease);
        }
        render();
      });

      row.addEventListener("mouseleave", () => {
        // Reset tweens back
        if (preset.props.scale != null) {
          startTween(targetNodeId, "scale", preset.props.scale, 1.0, 200, "ease_out");
        }
        if (preset.props.opacity != null) {
          startTween(targetNodeId, "opacity", preset.props.opacity, 1.0, 200, "ease_out");
        }
        render();
      });

      // Commit on click
      row.addEventListener("click", () => {
        const propsJson = JSON.stringify({
          ...preset.props,
          duration: preset.duration,
          ease: preset.ease,
        });
        const changed = fdCanvas.add_animation_to_node(
          targetNodeId,
          group.trigger,
          propsJson
        );
        if (changed) {
          render();
          syncTextToExtension();
          updatePropertiesPanel();
        }
        closeAnimPicker();
      });

      body.appendChild(row);
    }
  }

  // Position the picker near the drop point
  const container = document.getElementById("canvas-container");
  const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0, width: 800, height: 600 };
  let left = clientX - containerRect.left + 12;
  let top = clientY - containerRect.top + 12;
  // Keep within bounds
  const pw = 260, ph = 400;
  if (left + pw > containerRect.width) left = containerRect.width - pw - 8;
  if (top + ph > containerRect.height) top = Math.max(8, containerRect.height - ph - 8);

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  picker.classList.add("visible");
}


// ─── View Mode Toggle ────────────────────────────────────────────────────

function setupViewToggle() {
  document.getElementById("view-design")?.addEventListener("click", () => setViewMode("design"));
  document.getElementById("view-specs")?.addEventListener("click", () => setViewMode("specs"));
}

function setViewMode(mode) {
  viewMode = mode;
  const isSpecs = mode === "specs";

  document.getElementById("view-design")?.classList.toggle("active", mode === "design");
  document.getElementById("view-specs")?.classList.toggle("active", isSpecs);

  // Canvas stays visible — notes view keeps full interactivity
  const overlay = document.getElementById("spec-overlay");
  if (overlay) overlay.style.display = (isSpecs || specBadgesVisible) ? "" : "none";

  // Hide properties panel in notes view
  const props = document.getElementById("props-panel");
  if (props && isSpecs) props.classList.remove("visible");

  // Notify extension to apply/remove code-mode spec folding
  vscode.postMessage({ type: "viewModeChanged", mode });

  if (isSpecs || specBadgesVisible) {
    refreshSpecBadges();
  } else {
    // Clear badges when leaving spec view with toggle OFF
    if (overlay) overlay.innerHTML = "";
  }

  if (isSpecs) {
    refreshSpecView();
  }

  // Always refresh layers (it's always visible)
  refreshLayersPanel();
}

/**
 * Render spec info for the selected node in the spec overlay.
 * In Design/All view: only show spec details for the currently selected node.
 * Badge pins are removed; specs appear on hover via tooltip.
 */
function refreshSpecBadges() {
  const overlay = document.getElementById("spec-overlay");
  if (!overlay || !fdCanvas) return;

  // In design/all modes, hide the overlay (tooltip handles hover display)
  overlay.style.display = "none";
  overlay.innerHTML = "";
}

/** Cached annotated nodes for hover tooltip lookups. */
let cachedAnnotatedNodes = [];
let cachedAnnotatedSource = "";

/** Refresh the annotated nodes cache if source changed. */
function refreshAnnotatedCache() {
  if (!fdCanvas) return;
  const source = fdCanvas.get_text();
  if (source !== cachedAnnotatedSource) {
    cachedAnnotatedSource = source;
    cachedAnnotatedNodes = parseAnnotatedNodes(source);
  }
}

/** Show spec hover tooltip at screen position for a given node. */
function showSpecTooltip(nodeId, clientX, clientY) {
  const tooltip = document.getElementById("spec-hover-tooltip");
  if (!tooltip) return;

  refreshAnnotatedCache();
  const node = cachedAnnotatedNodes.find(n => n.id === nodeId);
  if (!node || node.annotations.length === 0) {
    hideSpecTooltip();
    return;
  }

  // ⚡ Bolt Optimization: Refactored multiple O(N) array methods into a single pass
  // to prevent redundant iterations over node annotations.
  const descs = [];
  const statuses = [];
  const priorities = [];
  for (const a of node.annotations) {
    if (a.type === "description") descs.push(a);
    else if (a.type === "status") statuses.push(a);
    else if (a.type === "priority") priorities.push(a);
  }

  let html = `<div class="spec-tip-id">◇ @${escapeHtml(node.id)}</div>`;
  if (descs.length > 0) {
    html += `<div class="spec-tip-desc">${escapeHtml(descs[0].value)}</div>`;
  }
  if (statuses.length > 0 || priorities.length > 0) {
    html += `<div class="spec-tip-badges">`;
    for (const s of statuses) {
      html += `<span class="spec-tip-badge status-${escapeAttr(s.value)}">${escapeHtml(s.value)}</span>`;
    }
    for (const p of priorities) {
      html += `<span class="spec-tip-badge priority-${escapeAttr(p.value)}">⚡ ${escapeHtml(p.value)}</span>`;
    }
    html += `</div>`;
  }

  tooltip.innerHTML = html;
  const container = document.getElementById("canvas-container");
  const containerRect = container.getBoundingClientRect();
  tooltip.style.left = (clientX - containerRect.left + 14) + "px";
  tooltip.style.top = (clientY - containerRect.top - 10) + "px";
  tooltip.classList.add("visible");
}

/** Hide the spec hover tooltip. */
function hideSpecTooltip() {
  const tooltip = document.getElementById("spec-hover-tooltip");
  if (tooltip) tooltip.classList.remove("visible");
}

function refreshSpecView() {
  // Badges are now handled by refreshSpecBadges()
  refreshSpecBadges();
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

