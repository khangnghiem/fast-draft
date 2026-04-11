// ─── inline-edit.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Inline Text Editor ────────────────────────────────────────────────────

/** Inline textarea for editing text nodes directly on canvas. */
let inlineEditorActive = false;

function setupInlineEditor() {
  canvas.addEventListener("dblclick", (e) => {
    if (!fdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) - panX) / zoomLevel;
    const y = ((e.clientY - rect.top) - panY) / zoomLevel;

    // Hit-test the scene to find the clicked node
    const nodeId = fdCanvas.get_selected_id();

    // Still no selection after hit-test → open unmaterialized inline editor
    if (!nodeId) {
      setTimeout(() => openInlineEditor(null, "content", "", null, { type: "canvas", x, y }), 50);
      e.preventDefault();
      return;
    }

    // Get node props to know kind and current content
    const propsJson = fdCanvas.get_selected_node_props();
    const props = JSON.parse(propsJson);
    if (!props.id) return;

    // Edge double-click: find/create text child and edit it
    if (props.kind === "edge") {
      const edgeId = props.id;
      const source = fdCanvas.get_text();
      // Check if edge already has a text child
      const edgeBlockRe = new RegExp(`edge\\s+@${edgeId}\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 's');
      const edgeMatch = source.match(edgeBlockRe);
      if (edgeMatch) {
        const innerBlock = edgeMatch[1];
        const textChildRe = /text\s+@(\w+)\s+"([^"]*)"/;
        const textMatch = innerBlock.match(textChildRe);
        if (textMatch) {
          // Text child exists — edit it
          const textChildId = textMatch[1];
          fdCanvas.select_by_id(textChildId);
          render();
          openInlineEditor(textChildId, "content", textMatch[2]);
        } else {
          // Lazy materialize edge label
          setTimeout(() => openInlineEditor(null, "content", "", null, { type: "edge", edgeId }), 50);
        }
      }
      e.preventDefault();
      return;
    }

    const isText = props.kind === "text";
    const isShape = props.kind === "rect" || props.kind === "ellipse" || props.kind === "frame";
    if (!isText && !isShape) return;

    if (isText) {
      // Direct text node — edit content
      openInlineEditor(props.id, "content", props.content || "");
    } else {
      // Shape node — drill into child text (Figma behavior)
      const existingTextId = fdCanvas.get_text_child_id(props.id);
      if (existingTextId) {
        if (fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(existingTextId);
        }
        // Select the child text node and edit it
        fdCanvas.select_by_id(existingTextId);
        render();
        const childPropsJson = fdCanvas.get_selected_node_props();
        const childProps = JSON.parse(childPropsJson);
        openInlineEditor(existingTextId, "content", childProps.content || "");
      } else {
        // Lazy materialization for child text
        setTimeout(() => openInlineEditor(null, "content", "", props.id, { type: "child", parentShapeId: props.id }), 50);
      }
    }
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
 * Measure a text node's content and update its bounds via WASM.
 * Uses Canvas2D measureText() to get the tight bounding box,
 * then sends dimensions back to the engine. After updating,
 * calls finalize_bounds() so parent containers can expand.
 * Returns true if bounds changed.
 */
function measureAndUpdateTextBounds(nodeId) {
  if (!fdCanvas) return false;

  // Get the text content from the node's properties
  const propsJson = fdCanvas.get_node_props(nodeId);
  if (!propsJson) return false;

  let props;
  try { props = JSON.parse(propsJson); } catch (_) { return false; }

  const text = props.text || "";
  if (!text) return false;

  // Extract font properties
  const fontSize = props.fontSize || 14;
  const fontFamily = props.fontFamily || "Inter, system-ui, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const maxWidth = props.maxWidth || null;

  // Measure using the off-screen canvas
  const measureCtx = canvas.getContext("2d");
  measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  let measuredWidth;
  let measuredHeight;
  const lineHeight = fontSize * 1.2;

  if (maxWidth) {
    // Word-wrap measurement: split text into lines that fit within maxWidth
    const paragraphs = text.split("\n");
    let totalLines = 0;
    let maxLineWidth = 0;
    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) {
        totalLines++;
        continue;
      }
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
    measuredWidth = maxWidth; // Width stays at maxWidth
    measuredHeight = Math.max(totalLines * lineHeight, lineHeight);
  } else {
  // Single-line measurement (original behavior)
    const metrics = measureCtx.measureText(text);
    measuredWidth = metrics.width;
    // Use precise glyph metrics when available, but ensure height is at least
    // fontSize * 1.2 to match the renderer's effective line height.
    const rawGlyphHeight = (metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null)
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : lineHeight;
    measuredHeight = Math.max(rawGlyphHeight, lineHeight);
  }

  // Send measured dimensions to WASM
  const changed = fdCanvas.update_text_metrics(nodeId, measuredWidth, measuredHeight);
  if (changed) {
    // Cascade parent expansion
    fdCanvas.finalize_bounds();
    return true;
  }
  return false;
}

/**
 * Measure all text nodes in the document and update their bounds.
 * Called after set_text() to ensure all text nodes have tight bounds.
 */
function measureAllTextNodes() {
  if (!fdCanvas) return;
  const text = fdCanvas.get_text();
  // Find all text node IDs
  const textIdRe = /text\s+@(\w+)\s+"/g;
  let match;
  let anyChanged = false;
  while ((match = textIdRe.exec(text)) !== null) {
    if (measureAndUpdateTextBounds(match[1])) {
      anyChanged = true;
    }
  }
  if (anyChanged) {
    render();
  }
}

/**
 * Show a floating textarea over the node for in-place text editing.
 */
function openInlineEditor(nodeIdOrOpts, propKey, currentValue, parentShapeId, createCtx) {
  let nodeId = nodeIdOrOpts;
  if (arguments.length === 1 && typeof nodeIdOrOpts === 'object' && nodeIdOrOpts !== null) {
    const opts = nodeIdOrOpts;
    nodeId = opts.nodeId;
    propKey = opts.propKey;
    currentValue = opts.currentValue;
    parentShapeId = opts.parentShapeId;
    createCtx = opts.createCtx;
  }

  if (inlineEditorActive) return;

  if (nodeId) {
    measureAndUpdateTextBounds(nodeId);
  }

  let posId = nodeId;
  if (parentShapeId) posId = parentShapeId;
  else if (createCtx && createCtx.parentShapeId) posId = createCtx.parentShapeId;
  else if (createCtx && createCtx.edgeId) posId = createCtx.edgeId;

  let b;
  if (posId) {
    const boundsJson = fdCanvas.get_node_bounds(posId);
    b = JSON.parse(boundsJson);
  } else if (createCtx && createCtx.type === "canvas") {
    b = { x: createCtx.x, y: createCtx.y, width: 80, height: 24 };
  } else {
    b = { x: 0, y: 0, width: 80, height: 24 };
  }
  
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;

  if (nodeId) {
    if (fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node(nodeId);
    }
    fdCanvas.select_by_id(nodeId);
  }

  const container = document.getElementById("canvas-container");

  fdCanvas.clear_pressed();
  render();

  let props;
  if (nodeId) {
    const propsJson = fdCanvas.get_selected_node_props();
    props = JSON.parse(propsJson);
  } else if (createCtx && createCtx.type === "canvas") {
    props = { kind: "text", fontSize: 14, fontFamily: "Inter", fontWeight: 400 };
  } else if (createCtx && createCtx.type === "child") {
    props = { kind: "text" };
  } else if (createCtx && createCtx.type === "edge") {
    props = { kind: "text", fontSize: 14 };
  } else {
    props = { kind: "text" };
  }

  // Get font info FIRST — needed for height calculation.
  // Compute lineHeight from unscaled font size first, then scale — this
  // matches how Canvas2D's draw_text() computes line_height = size * 1.2.
  const rawFontSize = props.fontSize || 14;
  const fontSize = rawFontSize * zoomLevel;
  // Use exact font family from WASM renderer — add fallback chain
  // to prevent browser defaulting to Times New Roman on font-load failure.
  const fontFamily = props.fontFamily ? `"${props.fontFamily}", system-ui, sans-serif` : "Inter, system-ui, sans-serif";
  const fontWeight = props.fontWeight || 400;
  const lineHeight = rawFontSize * 1.2 * zoomLevel;

  // Convert scene-space bounds to screen-space
  const sx = (b.x || 0) * zoomLevel + panX;
  const sy = (b.y || 0) * zoomLevel + panY;
  const sw = Math.max(bw * zoomLevel, 80);
  // Use actual bounds height — correctly sized for wrapped text
  const sh = Math.max(bh * zoomLevel, lineHeight + 4);

  // Determine background & text color based on node kind
  let bgColor;
  let textColor;
  const isDark = document.body.classList.contains("dark-theme");
  const isTextNode = props.kind === "text";
  const isInShape = !!parentShapeId || (createCtx && createCtx.type === "child");

  let shapeProps = null;
  const actualParentShapeId = parentShapeId || (createCtx && createCtx.parentShapeId);
  if (isInShape && actualParentShapeId) {
    fdCanvas.select_by_id(actualParentShapeId);
    const spJson = fdCanvas.get_selected_node_props();
    shapeProps = JSON.parse(spJson);
    if (nodeId) fdCanvas.select_by_id(nodeId);
  }

  if (isInShape && shapeProps) {
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
    const lum = hexLuminance(props.fill);
    textColor = lum < 0.4 ? "#FFFFFF" : "#1C1C1E";
  } else {
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#E0E0E0" : "#1C1C1E";
  }

  const hAlign = props.textAlign || (isTextNode && !isInShape ? "left" : "center");
  const vAlign = props.textVAlign || (isInShape ? "middle" : "top");

  // Store original value for Esc rollback
  const originalValue = currentValue;

  // Vertical padding: match Canvas2D text_baseline positioning exactly.
  // draw_text() uses a fixed 2.0px offset in scene-space.
  //   top    → text_baseline="top",    y = b.y + 2.0
  //   middle → text_baseline="middle", y = b.y + h/2
  //   bottom → text_baseline="bottom", y = b.y + h - 2.0
  // Scale the 2px offset by zoom since the renderer offsets in scene-space pixels.
  const topOffset = 2 * zoomLevel;
  let padTop = 0;
  let padBottom = 0;
  if (vAlign === "top") {
    padTop = topOffset;
  } else if (vAlign === "middle") {
  // CSS vertical centering via equal top/bottom padding
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

  // Horizontal padding: match Canvas2D x-position within the bounds.
  // draw_text() uses:
  //   left   → x = b.x
  //   center → x = b.x + b.width/2  (text-align:center handles this)
  //   right  → x = b.x + b.width    (text-align:right handles this)
  // CSS text-align handles the horizontal positioning, so no extra padding needed.
  const padLeft = 0;
  const padRight = 0;

  // Compute border-radius matching the node's actual shape
  const shapeKind = isInShape && shapeProps ? shapeProps.kind : props.kind;
  let borderRadius = "8px";
  if (shapeKind === "ellipse") {
    borderRadius = "50%";
  } else if (shapeKind === "rect" || shapeKind === "frame") {
    const crRaw = (isInShape && shapeProps ? shapeProps.cornerRadius : props.cornerRadius);
    const cr = crRaw !== undefined ? Math.round(crRaw * zoomLevel) : 0;
    borderRadius = `${cr}px`;
  } else if (isTextNode && !isInShape) {
    borderRadius = "0";
  }

  // Text nodes: minimal Apple Preview-style editor (thin border, no shadow)
  // Shape nodes: retain visible overlay for contrast against shape fill
  const outlineStyle = (isTextNode && !isInShape) ? "1px solid #4FC3F7" : "2px solid #4FC3F7";
  const boxShadow = (isTextNode && !isInShape) ? "none" : "0 2px 8px rgba(0,0,0,0.12)";

  const textarea = document.createElement("textarea");
  textarea.value = currentValue;
  textarea.style.cssText = [
    `position:absolute`,
    `left:${sx}px`,
    `top:${sy}px`,
    `width:${sw}px`,
    `height:${sh}px`,
    `padding:${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`,
    `font:${fontWeight} ${fontSize}px/${lineHeight}px ${fontFamily}`,
    `border:none`,
    `outline:${outlineStyle}`,
    `outline-offset:-1px`,
    `border-radius:${borderRadius}`,
    `background:${bgColor}`,
    `color:${textColor}`,
    `resize:none`,
    `z-index:100`,
    `box-shadow:${boxShadow}`,
    `overflow:hidden`,
    `text-align:${hAlign}`,
    `box-sizing:border-box`,
    `-webkit-text-size-adjust:100%`,
    `word-wrap:break-word`,
    `white-space:pre-wrap`,
    `overflow-wrap:break-word`,
  ].join(";");

  container.appendChild(textarea);
  textarea.focus();
  textarea.select();

  /** Live-sync text to Code Mode on every keystroke */
  let lastSyncedValue = currentValue;
  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    
    if (!nodeId && createCtx && val.trim() !== "") {
      if (createCtx.type === "canvas") {
        fdCanvas.create_node_at("text", createCtx.x, createCtx.y);
        nodeId = fdCanvas.get_selected_id();
      } else if (createCtx.type === "child") {
        nodeId = fdCanvas.create_child_text(createCtx.parentShapeId, "");
      } else if (createCtx.type === "edge") {
        const textBefore = fdCanvas.get_text();
        nodeId = fdCanvas.create_edge_text_child(createCtx.edgeId, "");
        if (nodeId) {
          const textAfter = fdCanvas.get_text();
          fdCanvas.push_undo_snapshot(textBefore, textAfter);
        }
      }
      if (nodeId && fdCanvas.set_suppressed_text_node) {
        fdCanvas.set_suppressed_text_node(nodeId);
      }
    }

    if (nodeId) {
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, val);
      render();
      syncTextToExtension();
    }
  });

  /** Commit: close editor, set final prop, sync */
  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (!nodeId) {
      updatePropertiesPanel();
      render();
      return;
    }

    if (propKey === "content" && newVal.trim() === "") {
      fdCanvas.select_by_id(nodeId);
      const changed = fdCanvas.delete_selected();
      if (changed) {
        render();
        syncTextToExtension();
        updatePropertiesPanel();
      }
      return;
    }

    // Skip mutation if value unchanged — avoids SetStyle flattening inherited styles
    if (newVal === originalValue) {
      render();
      return;
    }
    // Re-select and set final value (in case of any race)
    fdCanvas.select_by_id(nodeId);
    const changed = fdCanvas.set_node_prop(propKey, newVal);
    if (changed) {
      // Measure text content and update bounds for intrinsic sizing
      if (propKey === "content") {
        measureAndUpdateTextBounds(nodeId);
      }
      render();
      syncTextToExtension();
      updatePropertiesPanel();
    }
  };

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Cancel: revert to original value
      inlineEditorActive = false;
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      
      if (!nodeId) {
        render();
        e.stopPropagation();
        return;
      }

      if (propKey === "content" && originalValue.trim() === "") {
        fdCanvas.select_by_id(nodeId);
        if (fdCanvas.delete_selected()) {
          render();
          syncTextToExtension();
          updatePropertiesPanel();
        }
      } else {
        // Restore original text in the node
        fdCanvas.select_by_id(nodeId);
        fdCanvas.set_node_prop(propKey, originalValue);
        render();
        syncTextToExtension();
      }
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

