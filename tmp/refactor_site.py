import os

def replace_chunk(content, target, replacement):
    if target not in content:
        raise Exception(f"Target not found in content:\n---\n{target}\n---")
    return content.replace(target, replacement)

def refactor_file(path):
    with open(path, "r") as f:
        content = f.read()

    # signature of openInlineEditor
    t1 = """export function openInlineEditor(opts) {
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
  const boundsJson = fdCanvas.get_node_bounds(posId);
  const b = JSON.parse(boundsJson);"""
    r1 = """export function openInlineEditor(opts) {
  if (inlineEditorActive) return;

  let {
    nodeId, propKey, currentValue,
    fdCanvas, canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    panX, panY, zoomLevel,
    parentShapeId,
    createCtx,
  } = opts;

  // Force-measure text bounds BEFORE reading them
  if (nodeId) measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);

  // For text-in-shape: use parent shape bounds for textarea overlay
  let posId = nodeId;
  if (parentShapeId) posId = parentShapeId;
  else if (createCtx && createCtx.parentShapeId) posId = createCtx.parentShapeId;
  else if (createCtx && createCtx.edgeId) posId = createCtx.edgeId;

  let b;
  if (posId) {
    const boundsJson = fdCanvas.get_node_bounds(posId);
    b = JSON.parse(boundsJson);
  } else if (createCtx && createCtx.type === "canvas") {
    b = { x: createCtx.x, y: createCtx.y, w: 80, h: 24 };
  } else {
    b = { x: 0, y: 0, w: 80, h: 24 };
  }"""
    content = replace_chunk(content, t1, r1)

    # suppression
    t2 = """  inlineEditorActive = true;

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
  const props = JSON.parse(propsJson);"""
    r2 = """  inlineEditorActive = true;

  if (nodeId) {
    if (fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node(nodeId);
    }
    fdCanvas.select_by_id(nodeId);
  }
  fdCanvas.clear_pressed();
  renderFn();

  // Read node props for styling
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

    # color
    t3 = """  // Colors & shape styling
  const isDark = document.body.classList.contains("dark-theme") ||
                 document.body.classList.contains("vscode-dark");
  const isTextNode = props.kind === "text";
  const isInShape = !!parentShapeId;
  let bgColor, textColor;

  // Read parent shape props for styling when editing text-in-shape
  let shapeProps = null;
  if (isInShape && parentShapeId) {
    fdCanvas.select_by_id(parentShapeId);
    shapeProps = JSON.parse(fdCanvas.get_selected_node_props());
    // Restore text node selection
    fdCanvas.select_by_id(nodeId);
  }

  if (isInShape && shapeProps) {"""
    r3 = """  // Colors & shape styling
  const isDark = document.body.classList.contains("dark-theme") ||
                 document.body.classList.contains("vscode-dark");
  const isTextNode = props.kind === "text";
  const isInShape = !!parentShapeId || (createCtx && createCtx.type === "child");
  let bgColor, textColor;

  // Read parent shape props for styling when editing text-in-shape
  let shapeProps = null;
  const actualParentId = parentShapeId || (createCtx && createCtx.parentShapeId);
  if (isInShape && actualParentId) {
    fdCanvas.select_by_id(actualParentId);
    shapeProps = JSON.parse(fdCanvas.get_selected_node_props());
    // Restore text node selection
    if (nodeId) fdCanvas.select_by_id(nodeId);
  }

  if (isInShape && shapeProps) {"""
    content = replace_chunk(content, t3, r3)

    # align
    t4 = """  const hAlign = props.textAlign || (isTextNode ? "left" : "center");
  const vAlign = props.textVAlign || "top";"""
    r4 = """  const hAlign = props.textAlign || (isTextNode && !isInShape ? "left" : "center");
  const vAlign = props.textVAlign || (isInShape ? "middle" : "top");"""
    content = replace_chunk(content, t4, r4)

    # borders
    t5 = """  let borderRadius = "8px";
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
    r5 = """  let borderRadius = "8px";
  const shapeKind = isInShape && shapeProps ? shapeProps.kind : props.kind;
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
    content = replace_chunk(content, t5, r5)

    # input
    t6 = """  let lastSyncedValue = currentValue;
  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    renderFn();
    syncFn();
  });"""
    r6 = """  let lastSyncedValue = currentValue;
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
      renderFn();
      syncFn();
    }
  });"""
    content = replace_chunk(content, t6, r6)

    # commit
    t7 = """  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (propKey === "content" && newVal.trim() === "") {"""
    r7 = """  const commit = () => {
    if (!inlineEditorActive) return;
    inlineEditorActive = false;
    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (!nodeId) {
      if (updatePanelFn) updatePanelFn();
      renderFn();
      return;
    }

    if (propKey === "content" && newVal.trim() === "") {"""
    content = replace_chunk(content, t7, r7)

    # esc
    t8 = """  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (fdCanvas.set_suppressed_text_node) fdCanvas.set_suppressed_text_node();
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);

      if (propKey === "content" && originalValue.trim() === "") {
        fdCanvas.select_by_id(nodeId);
        if (fdCanvas.delete_selected()) {
          renderFn();
          syncFn();
          if (updatePanelFn) updatePanelFn();
        }
      } else {
        fdCanvas.select_by_id(nodeId);
        fdCanvas.set_node_prop(propKey, originalValue);
        fdCanvas.select_by_id("");
        renderFn();
        syncFn();
      }
      e.stopPropagation();
      return;
    }"""
    r8 = """  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      inlineEditorActive = false;
      if (fdCanvas.set_suppressed_text_node) fdCanvas.set_suppressed_text_node();
      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
      
      if (!nodeId) {
        renderFn();
        e.stopPropagation();
        return;
      }

      if (propKey === "content" && originalValue.trim() === "") {
        fdCanvas.select_by_id(nodeId);
        if (fdCanvas.delete_selected()) {
          renderFn();
          syncFn();
          if (updatePanelFn) updatePanelFn();
        }
      } else {
        fdCanvas.select_by_id(nodeId);
        fdCanvas.set_node_prop(propKey, originalValue);
        fdCanvas.select_by_id("");
        renderFn();
        syncFn();
      }
      e.stopPropagation();
      return;
    }"""
    content = replace_chunk(content, t8, r8)

    # setup canvas
    t9 = """    // Still no selection after hit-test → create new text node at position
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
    }"""
    r9 = """    if (!nodeId) {
      setTimeout(() => openInlineEditor({
        nodeId: null, propKey: "content", currentValue: "",
        fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
        panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        createCtx: { type: "canvas", x, y }
      }), 50);
      e.preventDefault();
      return;
    }"""
    content = replace_chunk(content, t9, r9)

    # setup edge
    t10 = """      } else {
        // Create new label via WASM (sets Edge.text_child, adds to graph, re-resolves layout)
        const textBefore = fdCanvas.get_text();
        const newTextId = fdCanvas.create_edge_text_child(edgeId, "");
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
            nodeId: newTextId, propKey: "content", currentValue: "",
            fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }"""
    r10 = """      } else {
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          createCtx: { type: "edge", edgeId }
        }), 50);
      }"""
    content = replace_chunk(content, t10, r10)

    # setup child
    t11 = """      } else {
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
      }"""
    r11 = """      } else {
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          parentShapeId: props.id,
          createCtx: { type: "child", parentShapeId: props.id }
        }), 50);
      }"""
    content = replace_chunk(content, t11, r11)

    with open(path, "w") as f:
        f.write(content)

refactor_file("/Users/khangnghiem/fast-draft/site/canvas-core/inline-edit.js")
