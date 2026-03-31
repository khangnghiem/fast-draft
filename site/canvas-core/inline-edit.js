// ─── canvas-core/inline-edit.js ─── Shared inline text editor
// Imported by both site/app.js and fd-vscode/webview/src/inline-edit.js.
//
// Double-click text/shape → floating textarea for in-place editing.
// Enter = commit, Escape = cancel, live-sync on every keystroke.

/** Whether the inline editor is currently open */
export let inlineEditorActive = false;

/**
 * Compute relative luminance of a hex color (0=black, 1=white).
 */
export function hexLuminance(hex) {
  if (!hex || hex.length < 4) return 1;
  let r, g, b;
  if (hex.length <= 5) {
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    r = parseInt(hex.slice(1, 3), 16) / 255;
    g = parseInt(hex.slice(3, 5), 16) / 255;
    b = parseInt(hex.slice(5, 7), 16) / 255;
  }
  const lin = (c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Measure a text node and update its WASM bounds.
 * Returns true if bounds changed.
 */
export function measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId) {
  if (!fdCanvas) return false;
  const propsJson = fdCanvas.get_node_props(nodeId);
  if (!propsJson) return false;
  let props;
  try { props = JSON.parse(propsJson); } catch (_) { return false; }
  const text = props.text || "";
  if (!text) return false;

  const fontSize = props.fontSize || 14;
  const fontFamily = props.fontFamily || "Inter, system-ui, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const maxWidth = props.maxWidth || null;
  const lineHeight = fontSize * 1.2;

  const measureCtx = canvasEl.getContext("2d");
  measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  let measuredWidth, measuredHeight;
  if (maxWidth) {
    const paragraphs = text.split("\n");
    let totalLines = 0;
    let maxLineWidth = 0;
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) { totalLines++; continue; }
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = measureCtx.measureText(testLine).width;
        if (currentLine && testWidth > maxWidth) {
          maxLineWidth = Math.max(maxLineWidth, measureCtx.measureText(currentLine).width);
          totalLines++;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        maxLineWidth = Math.max(maxLineWidth, measureCtx.measureText(currentLine).width);
        totalLines++;
      }
    }
    measuredWidth = maxWidth;
    measuredHeight = Math.max(totalLines * lineHeight, lineHeight);
  } else {
    const metrics = measureCtx.measureText(text);
    measuredWidth = metrics.width;
    const rawGlyphHeight = (metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null)
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : lineHeight;
    measuredHeight = Math.max(rawGlyphHeight, lineHeight);
  }

  const changed = fdCanvas.update_text_metrics(nodeId, measuredWidth, measuredHeight);
  if (changed) {
    fdCanvas.finalize_bounds();
    return true;
  }
  return false;
}

/**
 * Measure all text nodes and update bounds.
 * @param {Function} renderFn — render callback
 */
export function measureAllTextNodes(fdCanvas, canvasEl, renderFn) {
  if (!fdCanvas) return;
  const text = fdCanvas.get_text();
  const textIdRe = /text\s+@(\w+)\s+"/g;
  let match;
  let anyChanged = false;
  for (const match of text.matchAll(textIdRe)) {
    if (measureAndUpdateTextBounds(fdCanvas, canvasEl, match[1])) {
      anyChanged = true;
    }
  }
  if (anyChanged && renderFn) renderFn();
}

/**
 * Open a floating textarea over a node for in-place editing.
 *
 * @param {Object} opts
 * @param {string} opts.nodeId       — ID of the node to edit
 * @param {string} opts.propKey      — property key ("content")
 * @param {string} opts.currentValue — current text value
 * @param {any}    opts.fdCanvas     — WASM FdCanvas instance
 * @param {HTMLCanvasElement} opts.canvasEl — the canvas element
 * @param {HTMLElement} opts.container   — overlay container
 * @param {Function} opts.renderFn   — render callback
 * @param {Function} opts.syncFn     — text sync callback
 * @param {Function} [opts.updatePanelFn] — properties panel update callback
 * @param {number} opts.panX         — current pan X
 * @param {number} opts.panY         — current pan Y
 * @param {number} opts.zoomLevel    — current zoom
 * @param {string} [opts.parentShapeId] — parent shape ID for text-in-shape editing
 */
export function openInlineEditor(opts) {
  if (inlineEditorActive) return;

  const {
    nodeId, propKey, currentValue,
    fdCanvas, canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    panX, panY, zoomLevel,
    parentShapeId,
  } = opts;

  // Force-measure text bounds BEFORE reading them
  measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);

  // For text-in-shape: use parent shape bounds for textarea overlay
  // so the editor perfectly covers the shape, not the tiny text child.
  let posId = nodeId;
  if (parentShapeId) {
    posId = parentShapeId;
  }
  const boundsJson = fdCanvas.get_node_bounds_json(posId);
  const b = JSON.parse(boundsJson);
  const bw = b.w || 80;
  const bh = b.h || 24;

  inlineEditorActive = true;

  // Suppress text rendering AND set selection BEFORE any render — prevents
  // the blue selection box from flashing for a single frame.
  if (fdCanvas.set_suppressed_text_node) {
    fdCanvas.set_suppressed_text_node(nodeId);
  }
  fdCanvas.select_by_id(nodeId);
  fdCanvas.clear_pressed();
  renderFn();

  // Read node props for styling
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

  const rawFontSize = props.fontSize || 14;
  // Sub-pixel precision — do NOT round. Matches Canvas2D `{weight} {size}px {family}`.
  const fontSize = rawFontSize * zoomLevel;
  const fontFamily = props.fontFamily ? `"${props.fontFamily}", system-ui, sans-serif` : "Inter, system-ui, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const lineHeight = rawFontSize * 1.2 * zoomLevel;

  // Offset canvas-element origin within its overlay container
  const canvasRect = canvasEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top - containerRect.top;
  const scaledW = bw * zoomLevel;
  const scaledH = bh * zoomLevel;
  const sw = Math.max(scaledW, 80);
  const sh = Math.max(scaledH, lineHeight + 4);
  // Sub-pixel positioning — match Canvas2D coordinate space exactly.
  // Do NOT round to integer px; CSS handles sub-pixel fine.
  const sx = (b.x || 0) * zoomLevel + panX + canvasOffsetX - (sw - scaledW) / 2;
  const sy = (b.y || 0) * zoomLevel + panY + canvasOffsetY - (sh - scaledH) / 2;

  // Colors & shape styling
  const isDark = document.body.classList.contains("dark-theme") ||
                 document.body.classList.contains("vscode-dark");
  const isTextNode = props.kind === "text";
  const isInShape = !!parentShapeId;
  let bgColor, textColor;

  // Read parent shape props for styling when editing text-in-shape
  let shapeProps = null;
  if (isInShape) {
    fdCanvas.select_by_id(parentShapeId);
    const spJson = fdCanvas.get_selected_node_props();
    shapeProps = JSON.parse(spJson);
    // Re-select the text node so mutations target the right node
    fdCanvas.select_by_id(nodeId);
  }

  if (isInShape && shapeProps) {
    // Use parent shape's fill for WYSIWYG overlay
    if (shapeProps.fill && shapeProps.fill !== "none") {
      bgColor = shapeProps.fill;
      textColor = hexLuminance(shapeProps.fill) < 0.4 ? "#FFFFFF" : "#1C1C1E";
    } else {
      bgColor = "transparent";
      textColor = props.fill || (isDark ? "#E0E0E0" : "#1C1C1E");
    }
  } else if (isTextNode) {
    bgColor = "transparent";
    textColor = props.fill || (isDark ? "#E0E0E0" : "#1C1C1E");
  } else if (props.fill) {
    bgColor = props.fill;
    textColor = hexLuminance(props.fill) < 0.4 ? "#FFFFFF" : "#1C1C1E";
  } else {
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#E0E0E0" : "#1C1C1E";
  }

  const hAlign = props.textAlign || (isTextNode && !isInShape ? "left" : "center");
  const vAlign = props.textVAlign || (isInShape ? "middle" : "top");
  const originalValue = currentValue;

  // Vertical padding
  const topOffset = 2 * zoomLevel;
  let padTop = 0, padBottom = 0;
  if (vAlign === "top") {
    padTop = topOffset;
  } else if (vAlign === "middle") {
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, (sh - textHeight) / 2);
    padBottom = padTop;
  } else if (vAlign === "bottom") {
    padBottom = topOffset;
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, sh - textHeight - padBottom);
  }

  // Border radius — use parent shape's kind when editing text-in-shape
  const shapeKind = isInShape && shapeProps ? shapeProps.kind : props.kind;
  let borderRadius = "8px";
  if (shapeKind === "ellipse") borderRadius = "50%";
  else if (shapeKind === "rect" || shapeKind === "frame") {
    const cr = (isInShape && shapeProps ? shapeProps.cornerRadius : props.cornerRadius);
    borderRadius = cr !== undefined ? `${Math.round(cr * zoomLevel)}px` : "0";
  } else if (isTextNode && !isInShape) borderRadius = "0";

  const outlineStyle = "none";
  const boxShadow = "none";

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`, `top:${sy}px`,
    `width:${sw}px`, `height:${sh}px`,
    `padding:${padTop}px 0 ${padBottom}px 0`,
    `font:${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`,
    `border:none`,
    `outline:${outlineStyle}`, `outline-offset:-1px`,
    `border-radius:${borderRadius}`,
    `background:${bgColor}`, `color:${textColor}`,
    `resize:none`, `z-index:100`,
    `box-shadow:${boxShadow}`,
    `overflow:hidden`, `text-align:${hAlign}`,
    `box-sizing:border-box`,
    `-webkit-text-size-adjust:100%`,
    `word-wrap:break-word`, `white-space:pre-wrap`,
    `overflow-wrap:break-word`,
    `letter-spacing:0px`,
  ].join(";");

  container.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let lastSyncedValue = currentValue;
  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    renderFn();
    syncFn();
  });

  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    if (fdCanvas && fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node();
    }
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;
    if (newVal === originalValue) {
      // No change — deselect and return to neutral canvas state
      fdCanvas.select_by_id("");
      renderFn();
      return;
    }
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      if (propKey === "content") measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
      syncFn();
      if (updatePanelFn) updatePanelFn();
    }
    // Editing complete — deselect to return canvas to neutral state
    fdCanvas.select_by_id("");
    renderFn();
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (fdCanvas && fdCanvas.set_suppressed_text_node) {
        fdCanvas.set_suppressed_text_node();
      }
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, originalValue);
      // Cancel complete — deselect to return canvas to neutral state
      fdCanvas.select_by_id("");
      renderFn();
      syncFn();
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  });

  textarea.addEventListener("blur", () => { setTimeout(commit, 0); });
}

/**
 * Setup double-click handler for inline editing on a canvas.
 *
 * @param {Object} opts
 * @param {any}    opts.fdCanvas   — WASM FdCanvas instance getter
 * @param {HTMLCanvasElement} opts.canvasEl — the canvas element
 * @param {HTMLElement} opts.container — overlay container
 * @param {Function} opts.renderFn — render callback
 * @param {Function} opts.syncFn   — text sync callback
 * @param {Function} [opts.updatePanelFn] — properties panel update
 * @param {Function} opts.getPanX  — getter for panX
 * @param {Function} opts.getPanY  — getter for panY
 * @param {Function} opts.getZoom  — getter for zoomLevel
 * @param {Function} opts.screenToScene — coord transform function
 */
export function setupInlineEditor(opts) {
  const {
    canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    getPanX, getPanY, getZoom, screenToScene,
  } = opts;

  // Fix "weird box" bug: Web/VSCode UI elements outside the canvas often call e.preventDefault()
  // on pointerdown to stop scrolling, which blocks the browser's native blur on the textarea.
  // We attach a capture listener to `window` to intercept clicks *everywhere* in the app.
  if (!window.__fd_inline_editor_capture_installed) {
    window.addEventListener("pointerdown", (e) => {
      if (inlineEditorActive && document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
        // Only force blur if the user clicked OUTSIDE the textarea itself
        if (e.target !== document.activeElement) {
          document.activeElement.blur();
        }
      }
    }, { capture: true });
    window.__fd_inline_editor_capture_installed = true;
  }

  canvasEl.addEventListener("dblclick", (e) => {
    const fdCanvas = typeof opts.fdCanvas === 'function' ? opts.fdCanvas() : opts.fdCanvas;
    if (!fdCanvas) return;

    const { x, y } = screenToScene(e.clientX, e.clientY, canvasEl);
    let nodeId = fdCanvas.get_selected_id();

    // Fallback: hit-test at click coordinates in case selection was cleared
    // between the two pointerdown events that precede a dblclick.
    // This fixes double-click on ellipses (and rects) that were not yet selected.
    if (!nodeId) {
      const hitId = fdCanvas.hit_test_at(x, y);
      if (hitId) {
        fdCanvas.select_by_id(hitId);
        nodeId = hitId;
      }
    }

    // Still no selection after hit-test → create new text node at position
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        const newId = fdCanvas.get_selected_id();
        // Suppress before render to prevent blue box flash
        if (newId && fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(newId);
        }
        renderFn();
        syncFn();
        if (newId) {
          setTimeout(() => openInlineEditor({
            nodeId: newId, propKey: "content", currentValue: "",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }
      e.preventDefault();
      return;
    }

    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props.id) return;

    // Edge → edit/create label
    if (props.kind === "edge") {
      const edgeId = props.id;

      // Use WASM API to check for existing text child (idempotent, no duplicates)
      const existingTextId = fdCanvas.get_edge_text_child_id(edgeId);
      if (existingTextId) {
        // Edit existing label
        fdCanvas.select_by_id(existingTextId);
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        renderFn();
        openInlineEditor({
          nodeId: existingTextId, propKey: "content", currentValue: childProps.content || "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        });
      } else {
        // Create new label via WASM (sets Edge.text_child, adds to graph, re-resolves layout)
        const textBefore = fdCanvas.get_text();
        const newTextId = fdCanvas.create_edge_text_child(edgeId, "Label");
        if (newTextId) {
          const textAfter = fdCanvas.get_text();
          fdCanvas.push_undo_snapshot(textBefore, textAfter);
          renderFn();
          syncFn();
          // Suppress before selecting + rendering to prevent blue box flash
          if (fdCanvas.set_suppressed_text_node) {
            fdCanvas.set_suppressed_text_node(newTextId);
          }
          fdCanvas.select_by_id(newTextId);
          setTimeout(() => openInlineEditor({
            nodeId: newTextId, propKey: "content", currentValue: "Label",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }
      e.preventDefault();
      return;
    }

    const isText = props.kind === "text";
    const isShape = props.kind === "rect" || props.kind === "ellipse" || props.kind === "frame";
    if (!isText && !isShape) return;

    if (isText) {
      openInlineEditor({
        nodeId: props.id, propKey: "content", currentValue: props.content || "",
        fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
        panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
      });
    } else {
      const existingTextId = fdCanvas.get_text_child_id(props.id);
      if (existingTextId) {
        // Suppress text node before selecting + rendering to prevent blue box flash
        if (fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(existingTextId);
        }
        fdCanvas.select_by_id(existingTextId);
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        openInlineEditor({
          nodeId: existingTextId, propKey: "content", currentValue: childProps.content || "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          parentShapeId: props.id,
        });
      } else {
        const newTextId = fdCanvas.create_child_text(props.id, "");
        if (newTextId) {
          // Suppress before render to prevent blue box flash
          if (fdCanvas.set_suppressed_text_node) {
            fdCanvas.set_suppressed_text_node(newTextId);
          }
          renderFn();
          syncFn();
          setTimeout(() => openInlineEditor({
            nodeId: newTextId, propKey: "content", currentValue: "",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
            parentShapeId: props.id,
          }), 50);
        }
      }
    }
    e.preventDefault();
  });
}
