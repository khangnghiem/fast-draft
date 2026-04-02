import os

def replace_chunk(content, target, replacement):
    if target not in content:
        raise Exception(f"Target not found in content!")
    return content.replace(target, replacement)

def refactor_file(path, is_vscode=False):
    with open(path, "r") as f:
        content = f.read()

    # CHUNK 1: Signature and Bounds
    if not is_vscode:
        t1 = """  const {
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
        r1 = """  let { nodeId } = opts;
  const {
    propKey, currentValue,
    fdCanvas, canvasEl, container,
    renderFn, syncFn, updatePanelFn,
    panX, panY, zoomLevel,
    parentShapeId, createCtx,
  } = opts;

  if (nodeId) {
    // Force-measure text bounds BEFORE reading them
    measureAndUpdateTextBounds(fdCanvas, canvasEl, nodeId);
  }

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
    else:
        # VS Code version
        t1 = """  const {
    nodeId, propKey, currentValue,
    fdCanvas, canvasEl, container,
    panX, panY, zoomLevel,
    parentShapeId,
  } = opts;

  // Force-measure text bounds BEFORE reading them
  measureAndUpdateTextBounds(nodeId);

  // For text-in-shape: use parent shape bounds for textarea overlay
  // so the editor perfectly covers the shape, not the tiny text child.
  let posId = nodeId;
  if (parentShapeId) {
    posId = parentShapeId;
  }
  const boundsJson = fdCanvas.get_node_bounds(posId);
  const b = JSON.parse(boundsJson);"""
        r1 = """  let { nodeId } = opts;
  const {
    propKey, currentValue,
    fdCanvas, canvasEl, container,
    panX, panY, zoomLevel,
    parentShapeId, createCtx,
  } = opts;

  if (nodeId) {
    // Force-measure text bounds BEFORE reading them
    measureAndUpdateTextBounds(nodeId);
  }

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

    # CHUNK 2: Suppression and Selection
    if not is_vscode:
        t2 = """  // Suppress text rendering AND set selection BEFORE any render — prevents
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
        r2 = """  // Suppress text rendering AND set selection BEFORE any render — prevents
  // the blue selection box from flashing for a single frame.
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
    else:
        t2 = """  // Suppress text rendering AND set selection BEFORE any render — prevents
  // the blue selection box from flashing for a single frame.
  if (fdCanvas.set_suppressed_text_node) {
    fdCanvas.set_suppressed_text_node(nodeId);
  }
  fdCanvas.select_by_id(nodeId);
  fdCanvas.clear_pressed();
  render();

  // Read node props for styling
  const propsJson = fdCanvas.get_selected_node_props();
  const props = JSON.parse(propsJson);"""
        r2 = """  // Suppress text rendering AND set selection BEFORE any render — prevents
  // the blue selection box from flashing for a single frame.
  if (nodeId) {
    if (fdCanvas.set_suppressed_text_node) {
      fdCanvas.set_suppressed_text_node(nodeId);
    }
    fdCanvas.select_by_id(nodeId);
  }
  fdCanvas.clear_pressed();
  render();

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
    
    # CHUNK 3: Shape Props
    t3 = """  const isInShape = !!parentShapeId;
  let bgColor, textColor;

  // Read parent shape props for styling when editing text-in-shape
  let shapeProps = null;
  if (isInShape) {
    fdCanvas.select_by_id(parentShapeId);
    const spJson = fdCanvas.get_selected_node_props();
    shapeProps = JSON.parse(spJson);
    // Re-select the text node so mutations target the right node
    fdCanvas.select_by_id(nodeId);
  }"""
    r3 = """  const isInShape = !!parentShapeId || (createCtx && createCtx.type === "child");
  let bgColor, textColor;

  // Read parent shape props for styling when editing text-in-shape
  let shapeProps = null;
  const actualParentShapeId = parentShapeId || (createCtx && createCtx.parentShapeId);
  if (isInShape && actualParentShapeId) {
    fdCanvas.select_by_id(actualParentShapeId);
    const spJson = fdCanvas.get_selected_node_props();
    shapeProps = JSON.parse(spJson);
    // Re-select the text node so mutations target the right node
    if (nodeId) fdCanvas.select_by_id(nodeId);
  }"""
    content = replace_chunk(content, t3, r3)

    # CHUNK 4: Input event
    if not is_vscode:
        t4 = """  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    renderFn();
    syncFn();
  });"""
        r4 = """  textarea.addEventListener("input", () => {
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
    else:
        t4 = """  textarea.addEventListener("input", () => {
    const val = textarea.value;
    if (val === lastSyncedValue) return;
    lastSyncedValue = val;
    fdCanvas.select_by_id(nodeId);
    fdCanvas.set_node_prop(propKey, val);
    render();
    syncTextToExtension();
  });"""
        r4 = """  textarea.addEventListener("input", () => {
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
  });"""
    content = replace_chunk(content, t4, r4)

    # CHUNK 5: Commit
    if not is_vscode:
        t5_target = """    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (propKey === "content" && newVal.trim() === "") {"""
        t5_repl = """    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (!nodeId) {
      if (updatePanelFn) updatePanelFn();
      renderFn();
      return;
    }

    if (propKey === "content" && newVal.trim() === "") {"""
    else:
        t5_target = """    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (propKey === "content" && newVal.trim() === "") {"""
        t5_repl = """    const newVal = textarea.value;
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
    if (!fdCanvas) return;

    if (!nodeId) {
      updatePropertiesPanel();
      render();
      return;
    }

    if (propKey === "content" && newVal.trim() === "") {"""
    
    content = replace_chunk(content, t5_target, t5_repl)

    # CHUNK 6: Escape
    if not is_vscode:
        t6_target = """      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);

      if (propKey === "content" && originalValue.trim() === "") {"""
        t6_repl = """      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);

      if (!nodeId) {
        renderFn();
        e.stopPropagation();
        return;
      }

      if (propKey === "content" && originalValue.trim() === "") {"""
    else:
        t6_target = """      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);

      if (propKey === "content" && originalValue.trim() === "") {"""
        t6_repl = """      if (textarea.parentNode) textarea.parentNode.removeChild(textarea);

      if (!nodeId) {
        render();
        e.stopPropagation();
        return;
      }

      if (propKey === "content" && originalValue.trim() === "") {"""
      
    content = replace_chunk(content, t6_target, t6_repl)


    # ALL CHUNKS BELOW ARE IN setupInlineEditor

    # CHUNK 7: set up text node on canvas
    if not is_vscode:
        t7 = """    // Still no selection after hit-test → create new text node at position
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
        r7 = """    // Still no selection after hit-test → open unmaterialized inline editor
    if (!nodeId) {
      setTimeout(() => openInlineEditor({
        nodeId: null, propKey: "content", currentValue: "",
        createCtx: { type: "canvas", x, y },
        fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
        panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
      }), 50);
      e.preventDefault();
      return;
    }"""
    else:
        t7 = """    // Still no selection after hit-test → create new text node at position
    if (!nodeId) {
      const created = fdCanvas.create_node_at("text", x, y);
      if (created) {
        const newId = fdCanvas.get_selected_id();
        // Suppress before render to prevent blue box flash
        if (newId && fdCanvas.set_suppressed_text_node) {
          fdCanvas.set_suppressed_text_node(newId);
        }
        render();
        syncTextToExtension();
        if (newId) {
          setTimeout(() => openInlineEditor({
            nodeId: newId, propKey: "content", currentValue: "",
            fdCanvas, canvasEl, container,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          }), 50);
        }
      }
      e.preventDefault();
      return;
    }"""
        r7 = """    // Still no selection after hit-test → open unmaterialized inline editor
    if (!nodeId) {
      setTimeout(() => openInlineEditor({
        nodeId: null, propKey: "content", currentValue: "",
        createCtx: { type: "canvas", x, y },
        fdCanvas, canvasEl, container,
        panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
      }), 50);
      e.preventDefault();
      return;
    }"""
    content = replace_chunk(content, t7, r7)

    # CHUNK 8: edge label
    if not is_vscode:
        t8 = """      } else {
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
        r8 = """      } else {
        // Lazy materialization for edge label
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          createCtx: { type: "edge", edgeId },
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
        }), 50);
      }"""
    else:
        # VS code actually has the regexp hack in setupInlineEditor right now because I didn't verify it was removed earlier! Let's check what's actually there.
        # Wait, I did `fd-vscode/webview/src/inline-edit.js` using `multi_replace` but let me review what's there now.
        pass

    if not is_vscode:
        content = replace_chunk(content, t8, r8)

    # CHUNK 9: shape child
    if not is_vscode:
        t9 = """      } else {
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
        r9 = """      } else {
        // Lazy materialization for child text
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          createCtx: { type: "child", parentShapeId: props.id },
          fdCanvas, canvasEl, container, renderFn, syncFn, updatePanelFn,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          parentShapeId: props.id,
        }), 50);
      }"""
    else:
        # vscode format:
        t9 = """      } else {
        const newTextId = fdCanvas.create_child_text(props.id, "");
        if (newTextId) {
          // Suppress before render to prevent blue box flash
          if (fdCanvas.set_suppressed_text_node) {
            fdCanvas.set_suppressed_text_node(newTextId);
          }
          render();
          syncTextToExtension();
          setTimeout(() => openInlineEditor({
            nodeId: newTextId, propKey: "content", currentValue: "",
            fdCanvas, canvasEl, container,
            panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
            parentShapeId: props.id,
          }), 50);
        }
      }"""
        r9 = """      } else {
        // Lazy materialization for child text
        setTimeout(() => openInlineEditor({
          nodeId: null, propKey: "content", currentValue: "",
          createCtx: { type: "child", parentShapeId: props.id },
          fdCanvas, canvasEl, container,
          panX: getPanX(), panY: getPanY(), zoomLevel: getZoom(),
          parentShapeId: props.id,
        }), 50);
      }"""
    
    if not is_vscode:
        content = replace_chunk(content, t9, r9)
    else:
        content = replace_chunk(content, t9, r9)

    with open(path, "w") as f:
        f.write(content)

refactor_file("/Users/khangnghiem/fast-draft/site/canvas-core/inline-edit.js", is_vscode=False)
# Special case for vs code logic later
