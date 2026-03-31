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

    // If nothing selected, create a new text node at click position (Figma behavior)
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        const newId = fdCanvas.get_selected_id();
        if (newId && fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(newId);
        }
        render();
        syncTextToExtension();
        // Open inline editor on the newly created text node
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
          // No text child — create one via text manipulation
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
            render();
            syncTextToExtension();
            if (fdCanvas.set_suppressed_text_node) {
              fdCanvas.set_suppressed_text_node(textId);
            }
            fdCanvas.select_by_id(textId);
            render();
            setTimeout(() => openInlineEditor(textId, "content", "Label"), 50);
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
        // Create a new text child inside the shape
        const newTextId = fdCanvas.create_child_text(props.id, "Text");
        if (newTextId) {
          if (fdCanvas.set_suppressed_text_node) {
            fdCanvas.set_suppressed_text_node(newTextId);
          }
          render();
          syncTextToExtension();
          setTimeout(() => openInlineEditor(newTextId, "content", "Text"), 50);
        }
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
  for (const match of text.matchAll(textIdRe)) {
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
function openInlineEditor(nodeId, propKey, currentValue) {
  if (inlineEditorActive) return;

  // Force-measure text bounds BEFORE reading them — ensures the bounds
  // reflect the actual rendered text size, not a stale intrinsic_size heuristic.
  // This fixes both "double-click shape jump" and "editing vs non-editing mismatch".
  measureAndUpdateTextBounds(nodeId);

  const boundsJson = fdCanvas.get_node_bounds_json(nodeId);
  const b = JSON.parse(boundsJson);
  // Use minimum size for zero-width nodes (e.g. new text nodes)
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;

  if (fdCanvas.set_suppressed_text_node) {
    fdCanvas.set_suppressed_text_node(nodeId);
  }

  const container = document.getElementById("canvas-container");

  // Read node fill color for background matching
  fdCanvas.select_by_id(nodeId);
  // Clear press animation state to prevent visual shape jump on dblclick
  fdCanvas.clear_pressed();
  // Render to show correct bounds before textarea overlay appears
  render();
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);

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

  if (isTextNode) {
    // Text node: fill = text color, not background
    // Use themed background, and the node's fill as text color
    bgColor = "transparent";
    textColor = props.fill || (isDark ? "#E0E0E0" : "#1C1C1E");
  } else if (props.fill) {
  // Shape node with fill: use as background
    bgColor = props.fill;
    const lum = hexLuminance(props.fill);
    textColor = lum < 0.4 ? "#FFFFFF" : "#1C1C1E";
  } else {
    // Shape without fill: themed fallback
    bgColor = isDark ? "#2D2D44" : "#F5F5F7";
    textColor = isDark ? "#E0E0E0" : "#1C1C1E";
  }

  // Get text alignment — WASM API returns effective defaults (left/top for
  // standalone text, center/middle for text-in-shape)
  // WASM API always returns the context-aware default (center for text-in-shape,
  // left for standalone), so this fallback is a safety net only.
  const hAlign = props.textAlign || (isTextNode ? "left" : "center");
  const vAlign = props.textVAlign || "top";

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
  let borderRadius = "8px";
  if (props.kind === "ellipse") {
    borderRadius = "50%";
  } else if (props.kind === "rect" || props.kind === "frame") {
    const cr = props.cornerRadius !== undefined ? Math.round(props.cornerRadius * zoomLevel) : 0;
    borderRadius = `${cr}px`;
  } else if (isTextNode) {
    borderRadius = "0";
  }

  // Text nodes: minimal Apple Preview-style editor (thin border, no shadow)
  // Shape nodes: retain visible overlay for contrast against shape fill
  const outlineStyle = isTextNode ? "1px solid #4FC3F7" : "2px solid #4FC3F7";
  const boxShadow = isTextNode ? "none" : "0 2px 8px rgba(0,0,0,0.12)";

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
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    render();
    syncTextToExtension();
  });

  /** Commit: close editor, set final prop, sync */
  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;
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
      // Restore original text in the node
      fdCanvas.select_by_id(nodeId);
      fdCanvas.set_node_prop(propKey, originalValue);
      render();
      syncTextToExtension();
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

