// ─── canvas-core/viewport.js ─── Shared viewport geometry
// Pure math and geometry — no DOM or platform dependencies.

/**
 * Detect resize handle under cursor, return CSS cursor name.
 * @param {any} fdCanvas - WASM canvas instance
 * @param {number} x - Scene-space X
 * @param {number} y - Scene-space Y
 * @param {number} hitRadius - Hit radius in scene-space px (default 8)
 * @returns {string} CSS cursor name, or "" if not over a handle
 */
export function getResizeHandleCursor(fdCanvas, x, y, hitRadius = 8) {
  if (!fdCanvas) return '';
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return '';
  
  const r = Math.max(hitRadius, 12); // Padded hit radius

  // Try parsing regular bounds
  let b;
  try {
    b = JSON.parse(fdCanvas.get_node_bounds(selectedId));
  } catch (_) {}

  // Edge Anchor check
  if (!b || b.x === undefined) {
    let edge;
    try { edge = JSON.parse(fdCanvas.get_edge_endpoints(selectedId)); } catch (_) {}
    if (edge && edge.startX !== undefined) {
      const handles = [
        { hx: edge.startX, hy: edge.startY, cursor: 'crosshair' },
        { hx: edge.endX, hy: edge.endY, cursor: 'crosshair' }
      ];
      for (const { hx, hy, cursor } of handles) {
        const dx = x - hx, dy = y - hy;
        if (dx * dx + dy * dy <= r * r) return cursor;
      }
    }
    return '';
  }

  // Check if selected node is text (horizontal-only resize)
  const propsJson = fdCanvas.get_selected_node_props();
  let isText = false;
  try { isText = JSON.parse(propsJson).kind === 'text'; } catch (_) {}

  if (isText) {
    const handles = [
      { hx: b.x, hy: b.y + b.height / 2, cursor: 'ew-resize' },
      { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: 'ew-resize' },
    ];
    for (const { hx, hy, cursor } of handles) {
      const dx = x - hx, dy = y - hy;
      if (dx * dx + dy * dy <= r * r) return cursor;
    }
    return '';
  }

  const handles = [
    { hx: b.x, hy: b.y, cursor: 'nwse-resize' },
    { hx: b.x + b.width / 2, hy: b.y, cursor: 'ns-resize' },
    { hx: b.x + b.width, hy: b.y, cursor: 'nesw-resize' },
    { hx: b.x, hy: b.y + b.height / 2, cursor: 'ew-resize' },
    { hx: b.x + b.width, hy: b.y + b.height / 2, cursor: 'ew-resize' },
    { hx: b.x, hy: b.y + b.height, cursor: 'nesw-resize' },
    { hx: b.x + b.width / 2, hy: b.y + b.height, cursor: 'ns-resize' },
    { hx: b.x + b.width, hy: b.y + b.height, cursor: 'nwse-resize' },
  ];
  for (const { hx, hy, cursor } of handles) {
    const dx = x - hx, dy = y - hy;
    if (dx * dx + dy * dy <= r * r) return cursor;
  }
  return '';
}

/**
 * Compute pinch distance between two touch points.
 * @param {{ clientX: number, clientY: number }} t1
 * @param {{ clientX: number, clientY: number }} t2
 * @returns {number}
 */
export function pinchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute pinch center between two touch points.
 * @param {{ clientX: number, clientY: number }} t1
 * @param {{ clientX: number, clientY: number }} t2
 * @returns {{ x: number, y: number }}
 */
export function pinchCenter(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

/**
 * Nudge the selected node by step pixels in the given arrow direction.
 * @param {any} fdCanvas - WASM canvas instance
 * @param {string} arrowKey - 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
 * @param {number} step - Pixels to nudge (1 for normal, 10 for Shift)
 * @returns {boolean} Whether the scene changed
 */
export function nudgeSelected(fdCanvas, arrowKey, step) {
  if (!fdCanvas) return false;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return false;

  try {
    const boundsJson = fdCanvas.get_node_bounds(selectedId);
    const b = JSON.parse(boundsJson);
    if (b.x === undefined) return false;

    let newX = b.x, newY = b.y;
    switch (arrowKey) {
      case 'ArrowUp':    newY -= step; break;
      case 'ArrowDown':  newY += step; break;
      case 'ArrowLeft':  newX -= step; break;
      case 'ArrowRight': newX += step; break;
    }

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = newX - b.x;
    const dy = newY - b.y;
    fdCanvas.handle_pointer_down(cx, cy, 1.0, false, false, false, false);
    const moveResult = JSON.parse(fdCanvas.handle_pointer_move(cx + dx, cy + dy, 1.0, false, false, false, false));
    const upResult = JSON.parse(fdCanvas.handle_pointer_up(cx + dx, cy + dy, false, false, false, false));
    return upResult.changed || moveResult.changed;
  } catch (_) {
    return false;
  }
}
