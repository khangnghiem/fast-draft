// ─── canvas-core/inline-edit.js ─── Shared inline text editor
// Imported by both site/playground.js and fd-vscode/webview/src/inline-edit.js.
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
  while ((match = textIdRe.exec(text)) !== null) {
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
 */
export function openInlineEditor(opts) {
  if (inlineEditorActive) return;

  const {
    nodeId, propKey, currentValue,
    fdCanvas, canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    panX, panY, zoomLevel,
  } = opts;

  // Force-measure text bounds BEFORE reading them
  measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);

  const boundsJson = fdCanvas.get_node_bounds_json(nodeId);
  const b = JSON.parse(boundsJson);
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;

  // Read node props for styling
  fdCanvas.select_by_id(nodeId);
  fdCanvas.clear_pressed();
  renderFn();
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

  const rawFontSize = props.fontSize || 14;
  const fontSize = Math.round(rawFontSize * zoomLevel);
  const fontFamily = props.fontFamily || "Inter";
  const fontWeight = props.fontWeight || 400;
  const lineHeight = Math.round(rawFontSize * 1.2 * zoomLevel);

  const sx = (b.x || 0) * zoomLevel + panX;
  const sy = (b.y || 0) * zoomLevel + panY;
  const sw = Math.max(bw * zoomLevel, 80);
  const sh = Math.max(bh * zoomLevel, lineHeight + 4);

  // Colors
  const isDark = document.body.classList.contains("dark-theme") ||
                 document.body.classList.contains("vscode-dark");
  const isTextNode = props.kind === "text";
  let bgColor, textColor;

  if (isTextNode) {
    bgColor = "transparent";
    textColor = props.fill || (isDark ? "#E0E0E0" : "#1C1C1E");
  } else if (props.fill) {
    bgColor = props.fill;
    textColor = hexLuminance(props.fill) < 0.4 ? "#FFFFFF" : "#1C1C1E";
  } else {
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#E0E0E0" : "#1C1C1E";
  }

  const hAlign = props.textAlign || (isTextNode ? "left" : "center");
  const vAlign = props.textVAlign || "top";
  const originalValue = currentValue;

  // Vertical padding
  const topOffset = 2;
  let padTop = 0, padBottom = 0;
  if (vAlign === "top") {
    padTop = topOffset;
  } else if (vAlign === "middle") {
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, Math.round((sh - textHeight) / 2));
    padBottom = padTop;
  } else if (vAlign === "bottom") {
    padBottom = topOffset;
    const lines = (currentValue.match(/\n/g) || []).length + 1;
    const textHeight = lineHeight * lines;
    padTop = Math.max(0, sh - textHeight - padBottom);
  }

  // Border radius
  let borderRadius = "8px";
  if (props.kind === "ellipse") borderRadius = "50%";
  else if (props.kind === "rect" || props.kind === "frame") {
    const cr = props.cornerRadius !== undefined ? Math.round(props.cornerRadius * zoomLevel) : 0;
    borderRadius = `${cr}px`;
  } else if (isTextNode) borderRadius = "0";

  const outlineStyle = isTextNode ? "1px solid #4FC3F7" : "2px solid #4FC3F7";
  const boxShadow = isTextNode ? "none" : "0 2px 8px rgba(0,0,0,0.12)";

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`, `top:${sy}px`,
    `width:${sw}px`, `height:${sh}px`,
    `padding:${padTop}px 0 ${padBottom}px 0`,
    `font:${fontWeight} ${fontSize}px ${fontFamily}`,
    `border:none`,
    `outline:${outlineStyle}`, `outline-offset:-1px`,
    `border-radius:${borderRadius}`,
    `background:${bgColor}`, `color:${textColor}`,
    `resize:none`, `z-index:100`,
    `box-shadow:${boxShadow}`,
    `line-height:${lineHeight}px`,
    `overflow:hidden`, `text-align:${hAlign}`,
    `box-sizing:border-box`,
    `-webkit-text-size-adjust:100%`,
    `word-wrap:break-word`, `white-space:pre-wrap`,
    `overflow-wrap:break-word`,
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
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;
    if (newVal === originalValue) { renderFn(); return; }
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      if (propKey === "content") measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
      renderFn();
      syncFn();
      if (updatePanelFn) updatePanelFn();
    }
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, originalValue);
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

  textarea.addEventListener("blur", () => { setTimeout(commit, 150); });
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

  canvasEl.addEventListener("dblclick", (e) => {
    const fdCanvas = typeof opts.fdCanvas === 'function' ? opts.fdCanvas() : opts.fdCanvas;
    if (!fdCanvas) return;

    const { x, y } = screenToScene(e.clientX, e.clientY, canvasEl);
    const nodeId = fdCanvas.get_selected_id();

    // No selection → create new text node
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        renderFn();
        syncFn();
        const newId = fdCanvas.get_selected_id();
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
      const source = fdCanvas.get_text();
      const edgeBlockRe = new RegExp(`edge\\s+@${edgeId}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 's');
      const edgeMatch = source.match(edgeBlockRe);
      if (edgeMatch) {
        const textChildRe = /text\s+@(\w+)\s+"([^"]*)"/;
        const textMatch = edgeMatch[1].match(textChildRe);
        if (textMatch) {
          fdCanvas.select_by_id(textMatch[1]);
          renderFn();
          openInlineEditor({
            nodeId: textMatch[1], propKey: "content", currentValue: textMatch[2],
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          });
        } else {
          const textId = "label_" + edgeId;
          const esc = edgeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`(edge\\s+@${esc}\\s*\\{)`);
          const m2 = source.match(re);
          if (m2) {
            const insertPos = source.indexOf(m2[0]) + m2[0].length;
            const newSource = source.slice(0, insertPos)
              + `\n  text @${textId} "Label" {}`
              + source.slice(insertPos);
            const textBefore = source;
            fdCanvas.set_text(newSource);
            fdCanvas.push_undo_snapshot(textBefore, newSource);
            renderFn();
            syncFn();
            fdCanvas.select_by_id(textId);
            renderFn();
            setTimeout(() => openInlineEditor({
              nodeId: textId, propKey: "content", currentValue: "Label",
              fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
              panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
            }), 50);
          }
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
        fdCanvas.select_by_id(existingTextId);
        renderFn();
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        openInlineEditor({
          nodeId: existingTextId, propKey: "content", currentValue: childProps.content || "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        });
      } else {
        const newTextId = fdCanvas.create_child_text(props.id, "Text");
        if (newTextId) {
          renderFn();
          syncFn();
          setTimeout(() => openInlineEditor({
            nodeId: newTextId, propKey: "content", currentValue: "Text",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }
    }
    e.preventDefault();
  });
}
