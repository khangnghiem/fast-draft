import os

# Files to update
files = [
    "/Users/khangnghiem/fast-draft/site/canvas-core/inline-edit.js",
    "/Users/khangnghiem/fast-draft/fd-vscode/webview/src/inline-edit.js"
]

for file_path in files:
    with open(file_path, "r") as f:
        content = f.read()
    
    # Chunk 1: openInlineEditor signature and bounds
    chunk1_target = """  const {
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
    
    chunk1_target_vscode = chunk1_target.replace(", renderFn, syncFn, updatePanelFn,", "")
    
    chunk1_replacement = """  let { nodeId } = opts;
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
    
    # vscode doesn't have renderFn in destructuring, but we can just use the same replacement, wait if the target has no renderFn... let me check how vscode does it.
    # Ah wait, vscode has:
    # const {
    #   nodeId, propKey, currentValue,
    #   fdCanvas, canvasEl, container,
    #   panX, panY, zoomLevel,
    #   parentShapeId,
    # } = opts;
    # It removes renderFn entirely. I will just handle vscode logic cautiously.
    # Let's apply dynamically via regex or string splitting.
    pass

