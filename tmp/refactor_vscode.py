import os

def replace_chunk(content, target, replacement):
    if target not in content:
        raise Exception(f"Target not found in content:\n---\n{target}\n---")
    return content.replace(target, replacement)

def refactor_file(path):
    with open(path, "r") as f:
        content = f.read()

    # CHUNK 1: Signature
    t1 = """function openInlineEditor(nodeId, propKey, currentValue) {
  if (inlineEditorActive) return;

  // Force-measure text bounds BEFORE reading them — ensures the bounds
  // reflect the actual rendered text size, not a stale intrinsic_size heuristic.
  // This fixes both "double-click shape jump" and "editing vs non-editing mismatch".
  measureAndUpdateTextBounds(nodeId);

  const boundsJson = fdCanvas.get_node_bounds(nodeId);
  const b = JSON.parse(boundsJson);"""
    r1 = """function openInlineEditor(nodeId, propKey, currentValue, parentShapeId, createCtx) {
  if (inlineEditorActive) return;

  // Force-measure text bounds BEFORE reading them
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
  }"""
  
    content = replace_chunk(content, t1, r1)

    # CHUNK 2: Suppression and properties
    t2 = """  if (fdCanvas.set_suppressed_text_node) {
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
  const props = JSON.parse(propsJson);"""
    r2 = """  if (nodeId) {
    if (fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node(nodeId);
    }
  }

  const container = document.getElementById("canvas-container");

  if (nodeId) fdCanvas.select_by_id(nodeId);
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
  }"""
    content = replace_chunk(content, t2, r2)
    
    # CHUNK 3: BG Color
    t3 = """  // Determine background & text color based on node kind
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
  const vAlign = props.textVAlign || "top";"""
    r3 = """  let bgColor;
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
  const vAlign = props.textVAlign || (isInShape ? "middle" : "top");"""
    content = replace_chunk(content, t3, r3)

    # CHUNK 4: Border radius
    t4 = """  // Compute border-radius matching the node's actual shape
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
  const boxShadow = isTextNode ? "none" : "0 2px 8px rgba(0,0,0,0.12)";"""
    r4 = """  // Compute border-radius matching the node's actual shape
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
  const boxShadow = (isTextNode && !isInShape) ? "none" : "0 2px 8px rgba(0,0,0,0.12)";"""
    content = replace_chunk(content, t4, r4)
    
    # CHUNK 5: input
    t5 = """  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    render();
    syncTextToExtension();
  });"""
    r5 = """  textarea.addEventListener("input", () => {
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
        // Since VSCode version uses text string manipulation for edges primarily currently,
        // we'll use the API for neat lazy init directly here.
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
  });"""
    content = replace_chunk(content, t5, r5)

    # CHUNK 6: commit
    t6 = """  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (propKey === "content" && newVal.trim() === "") {"""
    r6 = """  const commit = () => {
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

    if (propKey === "content" && newVal.trim() === "") {"""
    content = replace_chunk(content, t6, r6)

    # CHUNK 7: Esc
    t7 = """  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Cancel: revert to original value
      inlineEditorActive = false;
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      
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
    }"""
    r7 = """  textarea.addEventListener("keydown", (e) => {
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
    }"""
    content = replace_chunk(content, t7, r7)

    # CHUNK 8: setupInlineEditor canvas
    t8 = """    // Still no selection after hit-test → create new text node at position
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        const newId = fdCanvas.get_selected_id();
        if (fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(newId);
        }
        render();
        syncTextToExtension();
        if (newId) {
          setTimeout(() => openInlineEditor(newId, "content", ""), 50);
        }
      }
      e.preventDefault();
      return;
    }"""
    r8 = """    // Still no selection after hit-test → create new text node at position
    if (!nodeId) {
      setTimeout(() => openInlineEditor(null, "content", "", null, { type: "canvas", x, y }), 50);
      e.preventDefault();
      return;
    }"""
    content = replace_chunk(content, t8, r8)

    # CHUNK 9: edge (Wait, the regex hack in VSCode has backslashes)
    t9 = """        } else {
          // No text child — create one via text manipulation
          const textId = "label_" + edgeId;
          const esc = edgeId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
          const re = new RegExp(`(edge\\\\s+@${esc}\\\\s*\\\\{)`);
          const m2 = source.match(re);
          if (m2) {
            const insertPos = source.indexOf(m2[0]) + m2[0].length;
            const newSource = source.slice(0, insertPos)
              + `\\n  text @${textId} "" {}`
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
            setTimeout(() => openInlineEditor(textId, "content", ""), 50);
          }
        }"""
    r9 = """        } else {
          // Lazy materialize edge
          setTimeout(() => openInlineEditor(null, "content", "", null, { type: "edge", edgeId }), 50);
        }"""
    # Note: instead of fighting python raw strings, I'll use multi_replace directly if it fails.
    try:
        content = replace_chunk(content, t9, r9)
    except:
        # Instead, just fallback to replace something simpler:
        t9_alt = "const textId = \"label_\" + edgeId;"
        # since we want to replace the whole block, I will let it fail here if it doesn't match and debug.
        content = replace_chunk(content, t9, r9)

    # CHUNK 10: child
    t10 = """      } else {
        // Create a new text child inside the shape
        const newTextId = fdCanvas.create_child_text(props.id, "");
        if (newTextId) {
          if (fdCanvas.set_suppressed_text_node) {
            fdCanvas.set_suppressed_text_node(newTextId);
          }
          render();
          syncTextToExtension();
          setTimeout(() => openInlineEditor(newTextId, "content", ""), 50);
        }
      }"""
    r10 = """      } else {
        setTimeout(() => openInlineEditor(null, "content", "", props.id, { type: "child", parentShapeId: props.id }), 50);
      }"""
    content = replace_chunk(content, t10, r10)

    with open(path, "w") as f:
        f.write(content)

refactor_file("/Users/khangnghiem/fast-draft/fd-vscode/webview/src/inline-edit.js")
