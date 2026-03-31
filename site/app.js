import { initLayersPanel } from './layers.js?v=0.11.309';
import init, { FdCanvas } from './wasm/fd_wasm.js?v=0.11.309';
// ─── FD Playground — WASM-powered interactive editor ───

// ─── CodeMirror 6 + lz-string — local vendor bundle (no CDN) ─────────────
import {
  EditorState, Compartment,
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, tooltips, hoverTooltip,
  StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching,
  foldGutter, foldAll, unfoldAll, foldService,
  tags,
  autocompletion, closeBrackets, closeBracketsKeymap,
  linter, lintGutter,
  defaultKeymap, history, historyKeymap,
  highlightSelectionMatches,
  LZString,
} from './vendor/cm.min.js';
import { initAiChat, clearChatHistory } from './ai-chat.js?v=0.11.296';
import {
  screenToScene as coreScreenToScene,
  pointerTypeToU8 as corePointerTypeToU8,
  showToast as coreShowToast,
  ZOOM_WHEEL_FACTOR as CORE_ZOOM_WHEEL_FACTOR,
  GRID_SPACING as CORE_GRID_SPACING,
} from './canvas-core/state.js?v=0.11.296';
import {
  drawGrid as coreDrawGrid,
  fitToContent as coreFitToContent,
  getSceneBounds as coreGetSceneBounds,
  zoomAtPoint as coreZoomAtPoint,
  startAnimLoop as coreStartAnimLoop,
  stopAnimLoop as coreStopAnimLoop,
  activeTweens,
  startTween,
  evalTweens,
  playDetachAnimation as corePlayDetachAnimation,
} from './canvas-core/render.js?v=0.11.296';
import {
  extractNodeBlock as coreExtractNodeBlock,
  buildPasteIdMap,
  applyIdRenames,
  collectDeclaredIds,
} from './canvas-core/clipboard.js?v=0.11.296';
import {
  getResizeHandleCursor as coreGetResizeHandleCursor,
  pinchDistance as corePinchDistance,
  pinchCenter as corePinchCenter,
  nudgeSelected as coreNudgeSelected,
} from './canvas-core/viewport.js?v=0.11.296';
import {
  TOOL_SHORTCUTS,
  TOOL_CYCLE,
  DOUBLE_PRESS_MS,
  ZOOM_STEP as CORE_ZOOM_STEP,
  buildShortcutHelpHtml as coreBuildShortcutHelpHtml,
} from './canvas-core/shortcuts.js?v=0.11.296';
import {
  setupInlineEditor as coreSetupInlineEditor,
  openInlineEditor as coreOpenInlineEditor,
  inlineEditorActive as coreInlineEditorActive,
} from './canvas-core/inline-edit.js?v=0.11.296';
import { setupTouchGestures as setupTouchGesturesModule, setupApplePencilPro as setupApplePencilProModule } from './touch.js?v=0.11.296';
import { initSearchPanel } from './search.js?v=0.11.296';
import { initPresentation } from './presentation.js?v=0.11.296';
import { initTauri } from './tauri.js?v=0.11.296';
import { initToolbar, drawDtcPreview } from './toolbar.js?v=0.11.296';

import { fdLanguage, fdHighlightStyle, fdTheme } from './src/editor/syntax.js';
/** Global CodeMirror EditorView */
let editorView = null;
/** Compartment for read-only state */
const readOnlyCompartment = new Compartment();

const DEFAULT_FD = ``;

// ─── State ───────────────────────────────────────────────────────────────
let fdCanvas = null;
let ctx = null;
let isDark = localStorage.getItem('fd-canvas-theme') === 'dark'; // Default light
let isSketchy = false;
let animFrameId = null;
let suppressSync = false;
/** Debounce timer for editor→canvas sync (hoisted for syncCanvasToEditor to clear) */
let editorDebounceTimer = null;

// Pointer tracking
let activePointerId = -1;

// Zoom / Pan
let panX = 0, panY = 0;
let panStartX = 0, panStartY = 0;
let panDragging = false;
let canvasDragOccurred = false; // tracks whether a real canvas drag happened (for post-drop menu)
let zoomLevel = 1.0;
let gridEnabled = false;
let xrayLabels = false; // X-ray mode: show all node name badges (backtick toggle)
let modShiftHeld = false; // Shift mode: single node hover
const GRID_SPACING = 20;


// Reduce Motion — respect OS setting + manual toggle
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = prefersReducedMotion.matches || localStorage.getItem('fd-reduce-motion') === 'true';
if (reduceMotion) document.body.classList.add('reduce-motion');
prefersReducedMotion.addEventListener('change', (e) => {
  reduceMotion = e.matches || localStorage.getItem('fd-reduce-motion') === 'true';
  document.body.classList.toggle('reduce-motion', reduceMotion);
});
let fullscreenMode = false;
const ZOOM_MIN = 0.1, ZOOM_MAX = 5;
const ZOOM_WHEEL_FACTOR = 1.04; // Normalized zoom step (shared with VS Code)
let isPanning = false;
// inlineEditorActive is re-exported from canvas-core/inline-edit.js
// We keep a getter for backward compatibility in this file.
function isInlineEditing() { return coreInlineEditorActive; }

// ── iPad touch/pencil visual feedback ────────────────────────────────
/** Map PointerEvent.pointerType to WASM u8: 0=mouse, 1=touch, 2=pen */
function pointerTypeToU8(pointerType) {
  if (pointerType === 'touch') return 1;
  if (pointerType === 'pen') return 2;
  return 0;
}

// Touch contact halo — visual feedback for finger taps
let touchHalo = { active: false, x: 0, y: 0, sceneX: 0, sceneY: 0, startTime: 0, targetBounds: null };
// Apple Pencil hover preview — crosshair + node highlight
let pencilHover = { active: false, sceneX: 0, sceneY: 0, screenX: 0, screenY: 0, nodeId: null };

// Tool locking (sticky mode) — double-press shortcut or double-click button
let lockedTool = null;
let lastToolKeyTime = 0;
let lastToolKeyName = '';
let lastToolBtnTime = 0;
let lastToolBtnName = '';

// Modifier drag state — Hand tool modifier bypass
let handTempSelectActive = false;
let handTempSelectOriginalTool = null;
let handAltCloneActive = false;
let handPanClientStartX = null;  // Track click vs drag for deselect
let handPanClientStartY = null;

// Smart defaults — per-tool style memory (persistent via localStorage)
let smartDefaults = { fill: null, stroke: '#333333', strokeWidth: 2.5, opacity: 1, cornerRadius: 8 };
try {
  const saved = localStorage.getItem('fd-smart-defaults');
  if (saved) smartDefaults = { ...smartDefaults, ...JSON.parse(saved) };
} catch (_) {}

// Render dirty flag — only re-render when something changed
let renderDirty = true;
let uiDirty = true;
let refreshLayersPanel = () => {};
let toolbarApi = null;
let sceneDirty = true; // Tracks real document/WASM changes for minimap caching
let minimapCacheCanvas = null; // Offscreen cache for minimap background

// Multi-touch state (for two-finger pan and pinch-to-zoom)
let activePointers = new Map(); // pointerId → {x, y}
let pinchStartDist = 0;
let pinchStartZoom = 1;
let pinchPanStartX = 0;
let pinchPanStartY = 0;
let pinchMidStartX = 0;
let pinchMidStartY = 0;
let isTwoFingerGesture = false;
let twoFingerTimer = null; // Smart disambiguation: 50ms delay
let twoFingerPending = false;

// Lasso select state — draws freeform path, selects enclosed nodes
let lassoPoints = [];    // Array of {x, y} scene-space points
let lassoActive = false; // Currently drawing lasso

// Eraser marquee state — draws rectangle, deletes enclosed nodes
let eraserMarquee = null; // {startX, startY, endX, endY} scene-space
let eraserActive = false; // Currently drawing eraser marquee

/** Test if a point {x,y} is inside a polygon defined by pts [{x,y},...] (ray-casting) */
function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Test if a rect {x,y,width,height} is fully inside a polygon */
function rectInsidePolygon(b, pts) {
  return pointInPolygon(b.x, b.y, pts) &&
         pointInPolygon(b.x + b.width, b.y, pts) &&
         pointInPolygon(b.x, b.y + b.height, pts) &&
         pointInPolygon(b.x + b.width, b.y + b.height, pts);
}

/** Test if a rect is fully inside another rect */
function rectInsideRect(inner, outer) {
  const ox1 = Math.min(outer.startX, outer.endX);
  const oy1 = Math.min(outer.startY, outer.endY);
  const ox2 = Math.max(outer.startX, outer.endX);
  const oy2 = Math.max(outer.startY, outer.endY);
  return inner.x >= ox1 && inner.y >= oy1 &&
         (inner.x + inner.width) <= ox2 && (inner.y + inner.height) <= oy2;
}

/** Get all node IDs and bounds from the scene graph */
function getAllNodeBounds() {
  if (!fdCanvas) return [];
  const text = fdCanvas.get_text();
  const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const nodes = [];
  let m;
  for (const m of text.matchAll(idRegex)) {
    try {
      const bj = fdCanvas.get_node_bounds_json(m[1]);
      if (!bj) continue;
      const b = JSON.parse(bj);
      if (b.width > 0 && b.height > 0) nodes.push({ id: m[1], ...b });
    } catch (_) {}
  }
  return nodes;
}

/** Get current layers panel width (dynamic for resize). */
function getLayersPanelWidth() {
  const panel = document.getElementById('layers-panel');
  return panel ? panel.offsetWidth : 0;
}
/** Get current right panel width (dynamic for resize). */
function getRightPanelWidth() {
  const panel = document.getElementById('right-panel');
  return (panel && document.documentElement.dataset.rp !== 'closed') ? panel.offsetWidth : 0;
}


// ─── Helpers ─────────────────────────────────────────────────────────────

/** Convert screen (client) coords to scene coords accounting for zoom+pan */
function screenToScene(clientX, clientY, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) - panX) / zoomLevel,
    y: ((clientY - rect.top) - panY) / zoomLevel
  };
}

/** Draw subtle grid overlay in scene space */
function drawGrid() {
  if (!gridEnabled || !ctx) return;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const left = -panX / zoomLevel;
  const top = -panY / zoomLevel;
  const right = left + w / zoomLevel;
  const bottom = top + h / zoomLevel;
  const startX = Math.floor(left / GRID_SPACING) * GRID_SPACING;
  const startY = Math.floor(top / GRID_SPACING) * GRID_SPACING;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5 / zoomLevel;
  ctx.beginPath();
  for (let x = startX; x <= right; x += GRID_SPACING) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = startY; y <= bottom; y += GRID_SPACING) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Render the scene with DPR + zoom/pan transform */
function renderCanvas() {
  if (!fdCanvas || !ctx) return;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  // 1. Clear in raw pixel space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 2. Fill background in DPR-scaled identity space (covers full canvas)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = isDark ? '#1C1C1E' : '#F5F5F7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 3. Apply zoom/pan transform for scene rendering
  ctx.setTransform(dpr * zoomLevel, 0, 0, dpr * zoomLevel, panX * dpr, panY * dpr);
  drawGrid();
  // 4. Render scene — skip_bg=true since we already filled above
  fdCanvas.render(ctx, performance.now(), true, true, xrayLabels, modShiftHeld);

  // 5. Draw drag-to-create preview shape (on-canvas, zoom-aware WYSIWYG)
  drawDtcPreview(ctx, dtcPreview, smartDefaults, zoomLevel);
  if (dtcPreview) renderDirty = true; // keep re-rendering during drag

  // ── Arrow tool: draw live preview line during drag ──
  const arrowPreviewJson = fdCanvas.get_arrow_preview();
  if (arrowPreviewJson) {
    try {
      const ap = JSON.parse(arrowPreviewJson);
      ctx.save();
      
      if (ap.x1 !== undefined && ap.y1 !== undefined) {
        ctx.strokeStyle = "#6B7080";
        ctx.lineWidth = 1.5;
        // Solid line (not dashed)
        ctx.beginPath();
        ctx.moveTo(ap.x1, ap.y1);
        ctx.lineTo(ap.x2, ap.y2);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(ap.y2 - ap.y1, ap.x2 - ap.x1);
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(ap.x2, ap.y2);
        ctx.lineTo(
          ap.x2 - headLen * Math.cos(angle - Math.PI / 6),
          ap.y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(ap.x2, ap.y2);
        ctx.lineTo(
          ap.x2 - headLen * Math.cos(angle + Math.PI / 6),
          ap.y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }

      // Highlight target node under cursor during arrow drag or edge repointing
      if (ap.target_id) {
        try {
          const targetBoundsJson = fdCanvas.get_node_bounds_json(ap.target_id);
          if (targetBoundsJson) {
            const tb = JSON.parse(targetBoundsJson);
            const pad = 4;
            ctx.beginPath();
            ctx.roundRect(tb.x - pad, tb.y - pad, tb.width + pad * 2, tb.height + pad * 2, 6);
            ctx.strokeStyle = "#4FC3F7";
            ctx.lineWidth = 2.5;
            ctx.shadowColor = "#4FC3F7";
            ctx.shadowBlur = 8;
            ctx.stroke();
          }
        } catch (_) { /* ignore */ }
      }

      ctx.restore();
      renderDirty = true; // Keep animating while actively dragging/snapping
    } catch (_) { /* ignore parse errors */ }
  }

  // ── iPad touch/pencil visual overlays ──────────────────────────────
  // Touch contact halo (finger tap feedback)
  if (touchHalo.active) {
    const elapsed = performance.now() - touchHalo.startTime;
    const scale = Math.min(1, elapsed / 150); // 150ms scale-in
    const alpha = 0.2 * (1 - Math.max(0, (elapsed - 300) / 200)); // fade after 300ms
    if (alpha > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(touchHalo.sceneX, touchHalo.sceneY, 24 * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(79, 195, 247, ${alpha.toFixed(3)})`;
      ctx.fill();
      // Target node highlight glow
      if (touchHalo.targetBounds) {
        const tb = touchHalo.targetBounds;
        ctx.strokeStyle = `rgba(79, 195, 247, ${(alpha * 2).toFixed(3)})`;
        ctx.lineWidth = 2 / zoomLevel;
        ctx.strokeRect(tb.x, tb.y, tb.width, tb.height);
      }
      ctx.restore();
      renderDirty = true; // keep animating
    } else {
      touchHalo.active = false;
    }
  }

  // Apple Pencil hover preview (crosshair + node highlight + tool ghost)
  if (pencilHover.active) {
    ctx.save();
    const px = pencilHover.sceneX;
    const py = pencilHover.sceneY;
    const cs = 6 / zoomLevel; // Crosshair size scales inversely with zoom
    const lw = 1.5 / zoomLevel;
    ctx.strokeStyle = '#4FC3F7';
    ctx.lineWidth = lw;
    // Crosshair lines
    ctx.beginPath();
    ctx.moveTo(px - cs, py); ctx.lineTo(px + cs, py);
    ctx.moveTo(px, py - cs); ctx.lineTo(px, py + cs);
    ctx.stroke();
    // Center dot
    ctx.beginPath();
    ctx.arc(px, py, 2 / zoomLevel, 0, Math.PI * 2);
    ctx.fillStyle = '#4FC3F7';
    ctx.fill();
    // Tool-specific ghost preview during hover
    const hoverTool = fdCanvas ? fdCanvas.get_tool_name() : '';
    if (hoverTool === 'rect' || hoverTool === 'frame') {
      // Show 162×100 ghost outline centered at hover
      ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
      ctx.lineWidth = 1.5 / zoomLevel;
      ctx.strokeRect(px - 162 / 2, py - 100 / 2, 162, 100);
      ctx.setLineDash([]);
    } else if (hoverTool === 'ellipse') {
      // Show 128×128 ghost circle centered at hover
      ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
      ctx.lineWidth = 1.5 / zoomLevel;
      ctx.beginPath();
      ctx.ellipse(px, py, 64, 64, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (pencilHover.nodeId) {
      // Hover node highlight (non-draw tools)
      try {
        const bJson = fdCanvas.get_node_bounds_json(pencilHover.nodeId);
        if (bJson) {
          const hb = JSON.parse(bJson);
          ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
          ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
          ctx.lineWidth = 1 / zoomLevel;
          ctx.strokeRect(hb.x, hb.y, hb.width, hb.height);
          ctx.setLineDash([]);
        }
      } catch (_) { /* node may not exist */ }
    }
    ctx.restore();
  }

  // ── Lasso path visual ──
  if (lassoActive && lassoPoints.length > 1) {
    ctx.save();
    ctx.setLineDash([6 / zoomLevel, 4 / zoomLevel]);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.lineWidth = 1.5 / zoomLevel;
    ctx.beginPath();
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let i = 1; i < lassoPoints.length; i++) {
      ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    renderDirty = true; // keep animating while lasso is active
  }

  // ── Eraser marquee visual ──
  if (eraserActive && eraserMarquee) {
    ctx.save();
    const ex = Math.min(eraserMarquee.startX, eraserMarquee.endX);
    const ey = Math.min(eraserMarquee.startY, eraserMarquee.endY);
    const ew = Math.abs(eraserMarquee.endX - eraserMarquee.startX);
    const eh = Math.abs(eraserMarquee.endY - eraserMarquee.startY);
    ctx.setLineDash([6 / zoomLevel, 4 / zoomLevel]);
    ctx.strokeStyle = 'rgba(255, 59, 48, 0.7)';
    ctx.fillStyle = 'rgba(255, 59, 48, 0.06)';
    ctx.lineWidth = 1.5 / zoomLevel;
    ctx.fillRect(ex, ey, ew, eh);
    ctx.strokeRect(ex, ey, ew, eh);
    ctx.setLineDash([]);
    ctx.restore();
    renderDirty = true; // keep animating while eraser is active
  }
}

/** Default dimensions for each shape type (arrow excluded — needs two anchors).
 *  Module-scope so drawDtcPreview() can access them from renderCanvas(). */
/** Canvas-projected preview state — set by DTC pointermove, read by renderCanvas().
 *  Module-scope so both initPlayground() handlers and toolbar module can share it. */
let dtcPreview = null; // { type: string, sceneX: number, sceneY: number }

/** Auto-center scene content in canvas viewport */
function fitToContent(canvas) {
  if (!fdCanvas) return;
  try {
    const text = fdCanvas.get_text();
    const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const nodes = [];
    let m;
    for (const m of text.matchAll(idRegex)) {
      const bj = fdCanvas.get_node_bounds_json(m[1]);
      if (!bj || bj === "{}") continue;
      const b = JSON.parse(bj);
      if (b.width > 0 && b.height > 0) nodes.push(b);
    }
    if (nodes.length === 0) return;
    let sx = Infinity, sy = Infinity, sx2 = -Infinity, sy2 = -Infinity;
    for (const n of nodes) {
      sx = Math.min(sx, n.x);
      sy = Math.min(sy, n.y);
      sx2 = Math.max(sx2, n.x + n.width);
      sy2 = Math.max(sy2, n.y + n.height);
    }
    const pad = 40;
    sx -= pad; sy -= pad; sx2 += pad; sy2 += pad;
    const sw = sx2 - sx, sh = sy2 - sy;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    zoomLevel = Math.min(cw / sw, ch / sh, ZOOM_MAX);
    zoomLevel = Math.max(zoomLevel, ZOOM_MIN);
    panX = (cw - sw * zoomLevel) / 2 - sx * zoomLevel;
    panY = (ch - sh * zoomLevel) / 2 - sy * zoomLevel;
    updateZoomIndicator();
    renderDirty = true; uiDirty = true;
  } catch (_) { }
}

// ── Panel Tab Switching ──────────────────────────────────────────

/** Active left panel tab id */
let activeLeftTab = sessionStorage.getItem('fd-left-tab') || 'layers';

/** Active right panel tab id */
let activeRightTab = sessionStorage.getItem('fd-right-tab') || 'agent';

/** Switch the active tab in the left panel (Layers/Code/Inspect). */
function switchLeftTab(tabId) {
  const panel = document.getElementById('left-panel');
  if (!panel) return;
  // Ensure panel is visible (but not on mobile — panels are overlays there)
  const h = document.documentElement;
  if (window.innerWidth > 768 && h.dataset.lp === 'closed') {
    h.dataset.lp = 'open';
    localStorage.setItem('fd-left-collapsed', '');
    const savedW = parseInt(localStorage.getItem('fd-left-panel-width'), 10);
    const restoreW = (savedW >= 120 && savedW <= 500) ? savedW : 260;
    h.style.setProperty('--left-panel-width', restoreW + 'px');
  }
  // Update tabs
  panel.querySelectorAll('.lp-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  // Update panes
  panel.querySelectorAll('.lp-pane').forEach(p => {
    p.classList.toggle('active', p.dataset.pane === tabId);
  });
  activeLeftTab = tabId;
  sessionStorage.setItem('fd-left-tab', tabId);
  // Refresh editor size if switching to code
  if (tabId === 'code' && editorView) {
    requestAnimationFrame(() => editorView.requestMeasure());
  }
  // Render specs if switching to inspect (merged specs+design)
  if (tabId === 'inspect' && typeof renderSpecsPanel === 'function') {
    renderSpecsPanel();
  }
  // Resize canvas
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    resizeCanvas();
  });
}

/** Switch the active tab in the right panel (Agent/Search). */
function switchRightTab(tabId) {
  const panel = document.getElementById('right-panel');
  if (!panel) return;
  // Ensure panel is visible (but not on mobile — panels are overlays there)
  const h = document.documentElement;
  if (window.innerWidth > 768 && h.dataset.rp === 'closed') {
    h.dataset.rp = 'open';
    localStorage.setItem('fd-right-collapsed', '');
    updateRightPanelWidth(true);
  }
  // Update tabs
  panel.querySelectorAll('.rp-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.rtab === tabId);
  });
  // Update panes
  panel.querySelectorAll('.rp-pane').forEach(p => {
    p.classList.toggle('active', p.dataset.rpane === tabId);
  });
  activeRightTab = tabId;
  sessionStorage.setItem('fd-right-tab', tabId);
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    resizeCanvas();
  });
}

/** Update the --right-panel-width and --right-panel-actual-width CSS vars.
 * --right-panel-width controls canvas positioning (left/right offsets).
 * --right-panel-actual-width controls minimap offset. */
function updateRightPanelWidth(expanded) {
  if (expanded) {
    const savedW = parseInt(localStorage.getItem('fd-right-panel-width'), 10);
    const restoreW = (savedW >= 120 && savedW <= 500) ? savedW : 260;
    document.documentElement.style.setProperty('--right-panel-width', restoreW + 'px');
  } else {
    document.documentElement.style.setProperty('--right-panel-width', '0px');
  }
}

/** Toggle left panel collapsed/expanded. */
function toggleLeftPanel() {
  const panel = document.getElementById('left-panel');
  if (!panel) return;
  const h = document.documentElement;
  const isCollapsed = h.dataset.lp === 'open'; // toggling: open → closed
  h.dataset.lp = isCollapsed ? 'closed' : 'open';
  if (isCollapsed) {
    h.style.setProperty('--left-panel-width', '0px');
  } else {
    const savedW = parseInt(localStorage.getItem('fd-left-panel-width'), 10);
    const restoreW = (savedW >= 120 && savedW <= 500) ? savedW : 260;
    h.style.setProperty('--left-panel-width', restoreW + 'px');
    switchLeftTab(activeLeftTab);
  }
  localStorage.setItem('fd-left-collapsed', isCollapsed ? '1' : '');
  requestAnimationFrame(() => {
    window.__fdPositionLayersHandle?.();  // keep resize handle at panel edge
    window.dispatchEvent(new Event('resize'));
    resizeCanvas();
    // Re-clamp toolbar after grid recalculates (double-rAF for layout settle)
    requestAnimationFrame(() => window.__fdReclampToolbar?.());
  });
}

/** Toggle right panel collapsed/expanded. */
function toggleRightPanel() {
  const panel = document.getElementById('right-panel');
  if (!panel) return;
  const h = document.documentElement;
  const isCollapsed = h.dataset.rp === 'open'; // toggling: open → closed
  h.dataset.rp = isCollapsed ? 'closed' : 'open';
  updateRightPanelWidth(!isCollapsed);
  localStorage.setItem('fd-right-collapsed', isCollapsed ? '1' : '');
  requestAnimationFrame(() => {
    window.__fdPositionRightHandle?.();  // keep resize handle at panel edge
    window.dispatchEvent(new Event('resize'));
    resizeCanvas();
    // Re-clamp toolbar after grid recalculates (double-rAF for layout settle)
    requestAnimationFrame(() => window.__fdReclampToolbar?.());
  });
}

/** Initialize left panel: tab click handlers, default tab. */
function initLeftPanel() {
  const panel = document.getElementById('left-panel');
  if (!panel) return;
  // Tab click handlers
  panel.querySelectorAll('.lp-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = tab.dataset.tab;
      switchLeftTab(tabId);
    });
  });
  // Set default tab
  switchLeftTab(activeLeftTab);
  // Sync panel state with data-attrs already set from <head> script
  // No classList toggle needed — [data-lp] handles visibility

  const copyCodeBtn = document.getElementById('code-copy-btn');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      if (window.api && window.api.cm) {
        const sel = window.api.cm.getSelection();
        const text = sel ? sel : window.api.cm.getValue();
        navigator.clipboard.writeText(text).then(() => {
          window.api.showToast("✓ Code copied to clipboard", 1500);
          copyCodeBtn.classList.add('success');
          setTimeout(() => copyCodeBtn.classList.remove('success'), 1500);
        }).catch(() => {
          window.api.showToast("Copy failed");
        });
      }
    });
  }

  let isFolded = false;
  const foldCodeBtn = document.getElementById('code-fold-btn');
  if (foldCodeBtn) {
    foldCodeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!editorView) return;
      if (isFolded) {
        unfoldAll(editorView);
        isFolded = false;
        foldCodeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
        window.api.showToast("Unfolded");
      } else {
        foldAll(editorView);
        isFolded = true;
        foldCodeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'; // same icon for toggle, could switch it to expand-arrows
        window.api.showToast("Collapsed All");
      }
    });
  }

  const formatCodeBtn = document.getElementById('code-format-btn');
  if (formatCodeBtn) {
    formatCodeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const canvas = window.api && window.api.getFdCanvas();
      if (!canvas) return;
      const textBefore = canvas.get_text();
      const result = canvas.format_with_options(true, true, false);
      try {
        const parsed = JSON.parse(result);
        if (parsed.changed) {
          const textAfter = canvas.get_text();
          canvas.push_undo_snapshot(textBefore, textAfter);
          if (window.api.renderCanvas) window.api.renderCanvas();
          if (window.api.syncCanvasToEditor) window.api.syncCanvasToEditor();
          if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
          if (typeof refreshLayersPanel === 'function') refreshLayersPanel();
          const delta = parsed.lines_before - parsed.lines_after;
          const deltaStr = delta > 0 ? `, ${delta} lines trimmed` : '';
          window.api.showToast(`✦ Formatted: ${parsed.summary}${deltaStr}`);
          formatCodeBtn.classList.add('success');
          setTimeout(() => formatCodeBtn.classList.remove('success'), 1500);
        } else {
          window.api.showToast('✓ Clean');
          formatCodeBtn.classList.add('success');
          setTimeout(() => formatCodeBtn.classList.remove('success'), 1500);
        }
      } catch (_) {
        if (window.api) window.api.showToast('Format failed');
      }
    });
  }
}

/** Initialize right panel: tab click handlers, default tab. */
function initRightPanel() {
  const panel = document.getElementById('right-panel');
  if (!panel) return;
  // Tab click handlers
  panel.querySelectorAll('.rp-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = tab.dataset.rtab;
      switchRightTab(tabId);
    });
  });
  // Panel collapsed state handled by data-attrs set from <head> script
  // Just ensure CSS vars are correct
  if (document.documentElement.dataset.rp === 'closed') {
    updateRightPanelWidth(false);
  } else {
    updateRightPanelWidth(true);
  }
  // Set default tab
  switchRightTab(activeRightTab);
  // Sync panel state with data-attrs already set from <head> script
  // No classList toggle needed — [data-rp] handles visibility
}

/** Initialize onboarding hints (shown once on first visit, canvas-only). */
function initOnboarding() {
  if (localStorage.getItem('fd-onboarded')) return;
  const hints = document.getElementById('onboarding-hints');
  if (!hints) return;
  // Show hints after a brief delay for WASM init
  setTimeout(() => {
    hints.style.display = '';
  }, 1200);
  // Fade out and dismiss after 8 seconds or on first click/key
  const dismiss = () => {
    hints.style.transition = 'opacity 1s ease';
    hints.style.opacity = '0';
    setTimeout(() => { hints.style.display = 'none'; }, 1000);
    localStorage.setItem('fd-onboarded', '1');
    document.removeEventListener('keydown', dismiss);
    document.removeEventListener('pointerdown', dismiss);
  };
  // Auto-dismiss after 8s
  setTimeout(dismiss, 8000);
  // Or dismiss on any user interaction
  document.addEventListener('keydown', dismiss, { once: true });
  document.addEventListener('pointerdown', dismiss, { once: true });
}

/** Wire settings panel buttons to existing action handlers. */
function initSettingsPanel() {
  // Settings gear dblclick no longer switches to settings tab (tab removed)
  // Share dropdown toggle
  const shareBtn = document.getElementById('share-btn-chrome');
  const shareDropdown = document.getElementById('share-dropdown');
  shareBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    shareDropdown?.classList.toggle('visible');
    document.getElementById('settings-dropdown')?.classList.remove('visible');
  });

  // Wire lp-sidebar-toggle (in left panel header) to toggle left panel
  document.getElementById('lp-sidebar-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLeftPanel();
  });
  // Wire rp-sidebar-toggle (in right panel header) to toggle right panel
  document.getElementById('rp-sidebar-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRightPanel();
  });
}

/** Toggle code panel — just switches to code tab. */
function toggleCodePanel() {
  switchLeftTab('code');
}

/** Collapse code panel (idempotent — no-op if already collapsed) */
function collapseCodePanel() {
  // No-op in new right panel design — code is just a tab
}

/** Toggle native full-screen mode on all platforms */
function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
}
// Sync fullscreenMode flag with native fullscreen state
document.addEventListener('fullscreenchange', () => {
  fullscreenMode = !!document.fullscreenElement;
  document.body.classList.toggle('fullscreen-mode', fullscreenMode);
  if (fullscreenMode) collapseCodePanel();
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
});
document.addEventListener('webkitfullscreenchange', () => {
  fullscreenMode = !!document.webkitFullscreenElement;
  document.body.classList.toggle('fullscreen-mode', fullscreenMode);
  if (fullscreenMode) collapseCodePanel();
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
});

/** Show a brief toast notification */
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'fd-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 1500);
}

/** Generate a simple QR code on a canvas element (no library needed). */
function generateQR(canvasEl, text) {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  const size = canvasEl.width;
  ctx.clearRect(0, 0, size, size);

  // Simple visual "QR-like" pattern (not scannable, but visually communicates sharing)
  // For production, import a proper QR library. This is a placeholder visual.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  // Generate a hash-based pattern from the URL
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  const cellSize = 4;
  const margin = 16;
  const inner = size - margin * 2;
  const cols = Math.floor(inner / cellSize);

  ctx.fillStyle = '#1D1D1F';

  // QR finder patterns (corners)
  const drawFinder = (x, y) => {
    const s = cellSize * 7;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + cellSize, y + cellSize, s - cellSize * 2, s - cellSize * 2);
    ctx.fillStyle = '#1D1D1F';
    ctx.fillRect(x + cellSize * 2, y + cellSize * 2, s - cellSize * 4, s - cellSize * 4);
  };

  drawFinder(margin, margin);
  drawFinder(margin + inner - cellSize * 7, margin);
  drawFinder(margin, margin + inner - cellSize * 7);

  // Data cells — deterministic pattern from URL hash
  let seed = Math.abs(hash);
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      // Skip finder pattern areas
      if ((row < 8 && col < 8) || (row < 8 && col >= cols - 8) || (row >= cols - 8 && col < 8)) continue;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 3 !== 0) continue;
      ctx.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
    }
  }
}

/** Insert an image data URL into the FD document at the given canvas position */
function insertImageFromDataURL(dataUrl, canvasX, canvasY) {
  if (!editorView) return;
  // Convert screen coords to scene coords
  const sceneX = Math.round((canvasX - panX) / zoomLevel);
  const sceneY = Math.round((canvasY - panY) / zoomLevel);

  // Create an FD image node
  const id = `img_${Date.now().toString(36)}`;
  const fdBlock = `\nimage @${id} {\n  x: ${sceneX} y: ${sceneY}\n  w: 200 h: 150\n  src: "${dataUrl.substring(0, 120)}..."\n}\n`;

  // For now, insert as a rect with the image name as a comment
  // Full image support requires Rust model changes
  const rectBlock = `\nrect @${id} {\n  x: ${sceneX} y: ${sceneY}\n  w: 200 h: 150\n  fill: #F0F4FF\n  corner: 8\n  # Dropped image placeholder\n}\n`;

  const currentText = editorView.state.doc.toString();
  editorView.dispatch({
    changes: { from: currentText.length, to: currentText.length, insert: rectBlock },
  });
  showToast('Image added as placeholder');
}


/**
 * Parse CSS text and convert class rules to FD style blocks.
 * Only extracts the ~6 properties FD supports; everything else is silently ignored.
 */
function parseCssToFdStyles(cssText) {
  const styles = [];
  // Match class selectors: .class-name { ... }
  const classRegex = /\.([a-zA-Z_-][\w-]*)\s*\{([^}]*)\}/g;
  let match;

  for (const match of cssText.matchAll(classRegex)) {
    const rawName = match[1];
    const body = match[2];
    // Sanitize class name: replace hyphens with underscores, remove invalid chars
    const name = rawName.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    if (!name) continue;

    const props = [];
    // Parse individual CSS properties
    const propRegex = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let pm;
    for (const pm of body.matchAll(propRegex)) {
      const prop = pm[1].trim().toLowerCase();
      const val = pm[2].trim();

      switch (prop) {
        case 'background-color':
        case 'background': {
          // Only extract solid colors (hex, rgb, named)
          const hexMatch = val.match(/#[0-9a-fA-F]{3,8}/);
          if (hexMatch) props.push(`  fill: ${hexMatch[0]}`);
          else if (val.match(/^(rgb|rgba)\(/)) {
            const hex = rgbToHex(val);
            if (hex) props.push(`  fill: ${hex}`);
          } else if (val.match(/^[a-zA-Z]+$/) && !val.includes('gradient')) {
            props.push(`  fill: ${val}`);
          }
          break;
        }
        case 'color': {
          const hexMatch = val.match(/#[0-9a-fA-F]{3,8}/);
          if (hexMatch) props.push(`  fill: ${hexMatch[0]}`);
          else if (val.match(/^(rgb|rgba)\(/)) {
            const hex = rgbToHex(val);
            if (hex) props.push(`  fill: ${hex}`);
          }
          break;
        }
        case 'border-radius':
        case 'rounded': {
          const px = parseInt(val);
          if (!isNaN(px) && px > 0) props.push(`  corner: ${px}`);
          break;
        }
        case 'opacity': {
          const op = parseFloat(val);
          if (!isNaN(op) && op >= 0 && op < 1) props.push(`  opacity: ${op}`);
          break;
        }
        case 'box-shadow': {
          // Extract simple shadow: offset-x offset-y blur-radius color
          const shadowMatch = val.match(/([\d.]+)\w*\s+([\d.]+)\w*\s+([\d.]+)\w*\s+(.+)/);
          if (shadowMatch) {
            const [, sx, sy, blur, color] = shadowMatch;
            const hexC = color.match(/#[0-9a-fA-F]{3,8}/);
            const c = hexC ? hexC[0] : '#00000020';
            props.push(`  shadow: (${parseInt(sx)},${parseInt(sy)},${parseInt(blur)},${c})`);
          }
          break;
        }
        case 'border': {
          // Extract border as stroke: "1px solid #color"
          const borderMatch = val.match(/([\d.]+)\w*\s+\w+\s+(#[0-9a-fA-F]{3,8})/);
          if (borderMatch) {
            props.push(`  stroke: ${borderMatch[2]} ${parseInt(borderMatch[1])}`);
          }
          break;
        }
        case 'font-family': {
          const family = val.replace(/['"]/g, '').split(',')[0].trim();
          if (family) props.push(`  font: "${family}"`);
          break;
        }
        case 'font-size': {
          const fs = parseInt(val);
          if (!isNaN(fs) && fs > 0) props.push(`  font: ${fs}`);
          break;
        }
        case 'font-weight': {
          const weightMap = { '100': 'thin', '200': 'extralight', '300': 'light', '400': 'regular',
            '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black',
            'normal': 'regular', 'bold': 'bold' };
          const w = weightMap[val.toLowerCase()];
          if (w && w !== 'regular') props.push(`  font: ${w}`);
          break;
        }
      }
    }

    if (props.length > 0) {
      styles.push(`style ${name} {\n${props.join('\n')}\n}`);
    }
  }

  return styles;
}

/** Convert rgb(r,g,b) or rgba(r,g,b,a) to hex */
function rgbToHex(rgb) {
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  const [, r, g, b] = match.map(Number);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/** Compute full scene bounding box from all @id nodes */
function getSceneBounds() {
  if (!fdCanvas) return null;
  const text = fdCanvas.get_text();
  const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let sx = Infinity, sy = Infinity, sx2 = -Infinity, sy2 = -Infinity;
  let found = false;
  let m;
  for (const m of text.matchAll(idRegex)) {
    try {
      const bj = fdCanvas.get_node_bounds_json(m[1]);
      if (!bj) continue;
      const b = JSON.parse(bj);
      if (b.width > 0 && b.height > 0) {
        sx = Math.min(sx, b.x); sy = Math.min(sy, b.y);
        sx2 = Math.max(sx2, b.x + b.width); sy2 = Math.max(sy2, b.y + b.height);
        found = true;
      }
    } catch (_) {}
  }
  if (!found) return null;
  const pad = 20;
  return { x: sx - pad, y: sy - pad, w: sx2 - sx + pad * 2, h: sy2 - sy + pad * 2 };
}
/** Update toolbar active state */
function updateToolbar(activeTool) {
  document.querySelectorAll('.ft-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.ft-tool-btn[data-tool="${activeTool}"]`);
  if (btn) btn.classList.add('active');
}

/** Update zoom indicator text */
function updateZoomIndicator() {
  const pct = Math.round(zoomLevel * 100) + '%';
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = pct;
  const rb = document.getElementById('zoom-reset-btn');
  if (rb) rb.textContent = pct;
}

// ─── Smart Focus on Node (Layer Click) ───────────────────────────────────────

/** Active focus animation ID (for cancellation). */
let focusAnimId = null;

/**
 * Smoothly pan (and optionally zoom) the viewport to focus on a node.
 */
function focusOnNode(nodeId) {
  if (!fdCanvas) return;
  let bounds;
  const bounds_json = fdCanvas.get_node_bounds_json(nodeId);
  if (!bounds_json || bounds_json === "{}") return;
  bounds = JSON.parse(bounds_json);
    if (!bounds || (bounds.width <= 0 && bounds.height <= 0)) return;

  const container = document.getElementById("canvas-container") || document.getElementById("canvas-wrapper") || document.body;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  
  const lp = document.getElementById("left-panel");
  const lpRect = lp ? lp.getBoundingClientRect() : { width: 0 };
  const effectivePanelW = lpRect.width;
  const usableW = cw - effectivePanelW;

  const nodeCX = bounds.x + bounds.width / 2;
  const nodeCY = bounds.y + bounds.height / 2;

  const vpCenterX = (effectivePanelW + usableW / 2 - panX) / zoomLevel;
  const vpCenterY = (ch / 2 - panY) / zoomLevel;

  let targetZoom = zoomLevel;
  const screenW = bounds.width * zoomLevel;
  const screenH = bounds.height * zoomLevel;
  const maxScreenDim = Math.max(screenW, screenH);

  const MIN_VISIBLE_PX = 20;
  const FIT_PADDING_RATIO = 0.15;
  const FIT_TARGET_RATIO = 0.10;

  if (screenW < MIN_VISIBLE_PX && screenH < MIN_VISIBLE_PX) {
    const maxDim = Math.max(bounds.width, bounds.height, 1);
    targetZoom = (usableW * FIT_TARGET_RATIO) / maxDim;
    targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom));
  } else if (maxScreenDim > Math.max(usableW, ch)) {
    const padding = Math.min(usableW, ch) * FIT_PADDING_RATIO;
    const fitZoom = Math.min(
      (usableW - padding * 2) / Math.max(bounds.width, 1),
      (ch - padding * 2) / Math.max(bounds.height, 1)
    );
    targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
  }

  const thresholdX = usableW * 0.2 / zoomLevel;
  const thresholdY = ch * 0.2 / zoomLevel;
  const dx = Math.abs(nodeCX - vpCenterX);
  const dy = Math.abs(nodeCY - vpCenterY);
  const needsPan = dx > thresholdX || dy > thresholdY;
  const needsZoom = Math.abs(targetZoom - zoomLevel) / zoomLevel > 0.05;

  if (!needsPan && !needsZoom) return;

  const finalTargetPanX = effectivePanelW + usableW / 2 - nodeCX * targetZoom;
  const finalTargetPanY = ch / 2 - nodeCY * targetZoom;

  const startPanX = panX;
  const startPanY = panY;
  const startZoom = zoomLevel;
  const duration = 250;
  const startTime = performance.now();

  if (focusAnimId) cancelAnimationFrame(focusAnimId);

  if (reduceMotion) {
    panX = finalTargetPanX;
    panY = finalTargetPanY;
    zoomLevel = targetZoom;
    renderCanvas();
    updateZoomIndicator();
    return;
  }

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    panX = startPanX + (finalTargetPanX - startPanX) * ease;
    panY = startPanY + (finalTargetPanY - startPanY) * ease;
    zoomLevel = startZoom + (targetZoom - startZoom) * ease;
    renderCanvas();
    updateZoomIndicator();
    if (t < 1) { focusAnimId = requestAnimationFrame(step); } 
    else { focusAnimId = null; }
  }
  focusAnimId = requestAnimationFrame(step);
}

/** Sync canvas text back to CodeMirror with echo suppression */
let _saveTimer = null;
function syncCanvasToEditor() {
  if (!fdCanvas || !editorView) return;
  suppressSync = true;
  clearTimeout(editorDebounceTimer);
  editorDebounceTimer = null;
  // Strip [auto] doc-comments — they're for AI agents, not human editing.
  const rawText = fdCanvas.get_text();
  const newText = rawText.replace(/^# \[auto\] .*\n/gm, '');
  const currentText = editorView.state.doc.toString();
  if (newText !== currentText) {
    editorView.dispatch({
      changes: { from: 0, to: currentText.length, insert: newText },
    });
  }
  // Persist to localStorage (debounced to avoid thrashing during drags)
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem('fd-document', newText); } catch (_) {}
  }, 500);
  sceneDirty = true;
  suppressSync = false;
}

/** Show/hide and position the floating action bar above the selected node */
function updateFab(canvas) {
  const fab = document.getElementById('floating-action-bar');
  if (!fab || !fdCanvas) { fab?.classList.remove('visible'); return; }

  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) { fab.classList.remove('visible'); return; }

  // Hide FAB when Design tab is active in right panel (props visible there)
  const rpDesignContent = document.getElementById('rp-design-content');
  if (rpDesignContent && rpDesignContent.style.display !== 'none') { fab.classList.remove('visible'); return; }

  try {
    const boundsJson = fdCanvas.get_node_bounds_json(selectedId);
    if (!boundsJson) { fab.classList.remove('visible'); return; }
    const b = JSON.parse(boundsJson);
    if (!b.width) { fab.classList.remove('visible'); return; }

    // Position above node center (screen coords with zoom+pan)
    const screenX = b.x * zoomLevel + panX + (b.width * zoomLevel) / 2;
    const screenY = b.y * zoomLevel + panY - 14;
    fab.style.left = screenX + 'px';
    fab.style.top = screenY + 'px';
    fab.classList.add('visible');

    // Read current props
    const propsJson = fdCanvas.get_selected_node_props();
    if (propsJson) {
      const props = JSON.parse(propsJson);
      if (props.fill) document.getElementById('fab-fill').value = props.fill;
      if (props.strokeColor) document.getElementById('fab-stroke').value = props.strokeColor;
      const swEl = document.getElementById('fab-stroke-w');
      if (swEl && props.strokeWidth !== undefined) swEl.value = Math.round(props.strokeWidth);
      const opEl = document.getElementById('fab-opacity');
      const opValEl = document.getElementById('fab-opacity-val');
      if (opEl && props.opacity !== undefined) { opEl.value = props.opacity; }
      if (opValEl) opValEl.textContent = Math.round((props.opacity ?? 1) * 100) + '%';
    }
  } catch (_) {
    fab.classList.remove('visible');
  }
}

/** ─── Selection → Code Highlight ────────────────────────────────────── */
let lastHighlightedIds = [];
let codeHighlightDecos = []; // CodeMirror Decoration marks
let highlightClearTimer = null; // auto-clear after CSS animation

/** Find block line ranges for given IDs in the FD text. */
function findBlockRangesInText(text, ids) {
  const lines = text.split('\n');
  const ranges = [];
  for (const id of ids) {
    const range = findBlockWithRange(lines, id);
    if (range) {
      // Convert line numbers to character offsets for CodeMirror
      let startPos = 0, endPos = 0;
      for (let i = 0; i < lines.length; i++) {
        if (i === range.startLine) startPos = endPos;
        endPos += lines[i].length + 1; // +1 for newline
        if (i === range.endLine) { ranges.push({ id, startLine: range.startLine, endLine: range.endLine, from: startPos, to: endPos - 1 }); break; }
      }
    }
  }
  return ranges;
}

/** Highlight selected blocks in CodeMirror editor. */
function highlightSelectedBlocksInEditor(ids) {
  if (!editorView) return;
  // Avoid redundant updates
  const idsKey = ids.join(',');
  if (idsKey === lastHighlightedIds.join(',')) return;
  lastHighlightedIds = [...ids];

  // Clear existing highlights immediately
  clearCodeHighlights();

  // Skip highlight for multi-selection (visual noise) or empty selection
  if (ids.length === 0 || ids.length > 1) return;

  const text = editorView.state.doc.toString();
  const ranges = findBlockRangesInText(text, ids);
  if (ranges.length === 0) return;

  const { RangeSet, Decoration, StateField, EditorView: EV } = window.cmBundle || {};
  if (!Decoration) return; // CodeMirror not loaded

  const marks = [];
  const linesCount = editorView.state.doc.lines;
  
  // Apply line dimming to all lines outside the selected blocks
  for (let i = 1; i <= linesCount; i++) {
    const isSelected = ranges.some(r => (i - 1) >= r.startLine && (i - 1) <= r.endLine);
    if (!isSelected) {
      const linePos = editorView.state.doc.line(i).from;
      marks.push(Decoration.line({ class: 'ai-diff-dimmed' }).range(linePos));
    }
  }

  // Apply subtle highlight to the selected block itself
  ranges.forEach(r => {
    const from = Math.max(0, Math.min(r.from, text.length));
    const to = Math.max(from, Math.min(r.to, text.length));
    marks.push(Decoration.mark({ class: 'ai-diff-selected' }).range(from, to));
  });

  // CodeMirror requires marks to be sorted by position
  marks.sort((a, b) => a.from - b.from);

  if (marks.length === 0) return;

  const decoSet = RangeSet.of(marks, true);
  // Use a compartment-free approach: dispatch via effects if available
  if (!editorView._fdHighlightField) {
    const field = StateField.define({
      create() { return Decoration.none; },
      update(v, tr) {
        for (const e of tr.effects) {
          if (e.is(setHighlightEffect)) return e.value;
        }
        return v.map(tr.changes);
      },
      provide: f => EV.decorations.from(f),
    });
    editorView._fdHighlightField = field;
    editorView._fdHighlightReconfig = editorView.dispatch({
      effects: window.cmBundle.StateEffect.appendConfig.of([field]),
    });
  }
  editorView.dispatch({ effects: [setHighlightEffect.of(decoSet)] });

  // Scroll to first highlighted block
  if (ranges.length > 0) {
    editorView.dispatch({ effects: EV.scrollIntoView(ranges[0].from, { y: 'center' }) });
  }
}

function clearCodeHighlights() {
  if (!editorView || !editorView._fdHighlightField) return;
  const { Decoration } = window.cmBundle || {};
  if (!Decoration) return;
  editorView.dispatch({ effects: [setHighlightEffect.of(Decoration.none)] });
}

// StateEffect for highlight decorations — initialized lazily
let setHighlightEffect;
let setDiffEffect;
function initCodeMirrorEffects() {
  if (setHighlightEffect) return;
  const { StateEffect } = window.cmBundle || {};
  if (!StateEffect) return;
  setHighlightEffect = StateEffect.define();
  setDiffEffect = StateEffect.define();
}

/** ─── AI Touch Diff/Accept/Reject State ─────────────────────────────── */
let aiDiffState = null; // { originalText, perBlockChanges: [{ id, oldBlock, newBlock, startLine, endLine }] }

/** Show inline diff for AI Touch results — accept/reject before applying. */
function showAiTouchDiff(originalText, refinedOutput, selectedIds) {
  if (!editorView) return false;

  const origLines = originalText.split('\n');
  const perBlockChanges = [];

  for (const id of selectedIds) {
    const origRange = findBlockWithRange(origLines, id);
    if (!origRange) continue;
    const oldBlock = origLines.slice(origRange.startLine, origRange.endLine + 1).join('\n');

    // Find the corresponding block in AI output
    const aiLines = refinedOutput.split('\n');
    const newBlock = findBlockForId(aiLines, id);
    if (!newBlock) continue;

    // Check if AI renamed the ID
    const oldIdMatch = oldBlock.match(/@(\w+)/);
    const newIdMatch = newBlock.match(/@(\w+)/);
    const renamedId = (oldIdMatch && newIdMatch && oldIdMatch[1] !== newIdMatch[1]) ? newIdMatch[1] : null;

    if (oldBlock.trim() !== newBlock.trim()) {
      perBlockChanges.push({ id, oldBlock, newBlock, startLine: origRange.startLine, endLine: origRange.endLine, renamedId });
    }
  }

  if (perBlockChanges.length === 0) {
    showToast('AI Touch: No changes detected');
    return false;
  }

  aiDiffState = { originalText, perBlockChanges };

  // Highlight changed blocks in the editor with diff colors
  renderDiffDecorations(perBlockChanges);
  showDiffToolbar(perBlockChanges.length);
  return true;
}

/** Render red/green diff decorations in CodeMirror. */
function renderDiffDecorations(changes) {
  if (!editorView) return;
  initCodeMirrorEffects();
  const { Decoration, RangeSet, StateField, EditorView: EV, StateEffect } = window.cmBundle || {};
  if (!Decoration) return;

  // Register diff field if not already done
  if (!editorView._fdDiffField) {
    const field = StateField.define({
      create() { return Decoration.none; },
      update(v, tr) {
        for (const e of tr.effects) {
          if (e.is(setDiffEffect)) return e.value;
        }
        return v.map(tr.changes);
      },
      provide: f => EV.decorations.from(f),
    });
    editorView._fdDiffField = field;
    editorView.dispatch({ effects: StateEffect.appendConfig.of([field]) });
  }

  const text = editorView.state.doc.toString();
  const marks = [];

  for (const change of changes) {
    // Highlight the original block range as "will be changed"
    const lines = text.split('\n');
    const range = findBlockWithRange(lines, change.id);
    if (!range) continue;

    let startPos = 0;
    for (let i = 0; i < range.startLine; i++) startPos += lines[i].length + 1;
    let endPos = startPos;
    for (let i = range.startLine; i <= range.endLine; i++) endPos += lines[i].length + 1;
    endPos = Math.min(endPos - 1, text.length);

    marks.push(Decoration.mark({ class: 'ai-diff-changed' }).range(
      Math.max(0, startPos), Math.max(startPos, endPos)
    ));
  }

  if (marks.length > 0) {
    editorView.dispatch({ effects: [setDiffEffect.of(RangeSet.of(marks, true))] });
    // Scroll to first change
    editorView.dispatch({ effects: EV.scrollIntoView(marks[0].from, { y: 'center' }) });
  }
}

/** Show accept/reject toolbar for AI Touch diffs. */
function showDiffToolbar(changeCount) {
  let toolbar = document.getElementById('ai-diff-toolbar');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'ai-diff-toolbar';
    toolbar.className = 'ai-diff-toolbar';
    document.body.appendChild(toolbar);
  }
  toolbar.innerHTML = `
    <span class="ai-diff-label">✦ ${changeCount} block${changeCount > 1 ? 's' : ''} changed</span>
    <button class="ai-diff-accept" id="ai-diff-accept-btn">✓ Accept</button>
    <button class="ai-diff-reject" id="ai-diff-reject-btn">✗ Reject</button>
  `;
  toolbar.classList.add('visible');

  document.getElementById('ai-diff-accept-btn').onclick = () => acceptAiDiff();
  document.getElementById('ai-diff-reject-btn').onclick = () => rejectAiDiff();
}

/** Accept AI Touch changes — apply per-block edits with granular undo. */
function acceptAiDiff() {
  if (!aiDiffState || !editorView || !fdCanvas) return;

  const { originalText, perBlockChanges } = aiDiffState;
  let currentText = originalText;

  // Apply per-block changes (from bottom to top to preserve line numbers)
  const sorted = [...perBlockChanges].sort((a, b) => b.startLine - a.startLine);

  for (const change of sorted) {
    const lines = currentText.split('\n');
    const range = findBlockWithRange(lines, change.id);
    if (!range) continue;

    const before = lines.slice(0, range.startLine);
    const after = lines.slice(range.endLine + 1);
    currentText = [...before, change.newBlock, ...after].join('\n');
  }

  // Apply to CodeMirror as a single transaction (preserves undo atomically)
  const cur = editorView.state.doc.toString();
  editorView.dispatch({ changes: { from: 0, to: cur.length, insert: currentText } });

  // Sync to WASM canvas
  fdCanvas.set_text(currentText);
  renderCanvas();
  refreshLayersPanel();
  updatePropertiesPanel();

  // Cleanup
  clearDiffState();
  showToast(`✓ Accepted ${perBlockChanges.length} AI change${perBlockChanges.length > 1 ? 's' : ''}`);
}

/** Reject AI Touch changes — restore original text. */
function rejectAiDiff() {
  if (!aiDiffState) return;
  clearDiffState();
  showToast('✗ AI changes rejected');
}

/** Clean up diff state and decorations. */
function clearDiffState() {
  aiDiffState = null;
  // Clear diff decorations
  if (editorView && editorView._fdDiffField) {
    const { Decoration } = window.cmBundle || {};
    if (Decoration) {
      editorView.dispatch({ effects: [setDiffEffect.of(Decoration.none)] });
    }
  }
  // Hide toolbar
  const toolbar = document.getElementById('ai-diff-toolbar');
  if (toolbar) toolbar.classList.remove('visible');
}

/** ─── Properties Panel ──────────────────────────────────────────────── */
let propsSuppressSync = false;

function updatePropertiesPanel() {
  const designContent = document.getElementById('rp-design-content');
  const designEmpty = document.getElementById('rp-design-empty');
  if (!designContent || !fdCanvas) {
    if (designContent) designContent.style.display = 'none';
    if (designEmpty) designEmpty.style.display = '';
    return;
  }

  // #4: Check for multi-selection
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  const isMulti = selectedIds.length > 1;

  // Notify AI Chat panel about selection changes
  const selKey = selectedIds.join(',');
  if (selKey !== updatePropertiesPanel._lastSelKey) {
    updatePropertiesPanel._lastSelKey = selKey;
    document.dispatchEvent(new CustomEvent('fd-selection-changed', { detail: { ids: selectedIds } }));
  }

  // Highlight selected blocks in Code Mode (unless editor is focused)
  initCodeMirrorEffects();
  if (document.activeElement !== editorView?.dom && !editorView?.hasFocus) {
    highlightSelectedBlocksInEditor(selectedIds);
  }

  if (isMulti) {
    // Multi-selection: show count and appearance controls only
    propsSuppressSync = true;
    designContent.style.display = '';
    designEmpty.style.display = 'none';

    document.getElementById('pp-node-id').textContent = `${selectedIds.length} objects`;
    document.getElementById('pp-kind').textContent = 'mixed';

    // Hide position & size (not meaningful for mixed selection)
    ['pp-x', 'pp-y', 'pp-w', 'pp-h'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '—';
    });

    // Show appearance section for bulk editing
    const appearance = document.getElementById('pp-appearance');
    if (appearance) appearance.style.display = '';

    propsSuppressSync = false;
    return;
  }

  const json = fdCanvas.get_selected_node_props();
  let props;
  try { props = JSON.parse(json); } catch (_) { designContent.style.display = 'none'; designEmpty.style.display = ''; return; }

  if (!props.id) {
    designContent.style.display = 'none';
    designEmpty.style.display = '';
    return;
  }

  propsSuppressSync = true;
  designContent.style.display = '';
  designEmpty.style.display = 'none';

  // Header
  document.getElementById('pp-node-id').textContent = `@${props.id}`;
  document.getElementById('pp-kind').textContent = props.kind || '';

  // Position & Size
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined ? Math.round(val) : ''; };
  setVal('pp-x', props.x);
  setVal('pp-y', props.y);
  setVal('pp-w', props.width);
  setVal('pp-h', props.height);

  // Fill color
  const fillEl = document.getElementById('pp-fill');
  if (fillEl) {
    if (props.fill) {
      let hex = props.fill;
      if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      fillEl.value = hex.substring(0, 7);
    } else {
      fillEl.value = props.kind === 'text' ? '#ffffff' : '#000000'; // Fallback text is white (or theme)
    }
  }

  // Stroke
  const strokeEl = document.getElementById('pp-stroke');
  if (strokeEl) {
    if (props.strokeColor) {
      let hex = props.strokeColor;
      if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      strokeEl.value = hex.substring(0, 7);
    } else {
      strokeEl.value = '#000000';
    }
  }
  setVal('pp-stroke-w', props.strokeWidth !== undefined ? props.strokeWidth : 0);
  setVal('pp-corner', props.cornerRadius !== undefined ? props.cornerRadius : 0);

  // Hide Corner for text nodes (corner_radius has no visual effect on text boxes themselves)
  const cornerRow = document.getElementById('pp-corner')?.closest('.pp-row');
  if (cornerRow) cornerRow.style.display = props.kind === 'text' ? 'none' : '';


  // Opacity
  const opSlider = document.getElementById('pp-opacity');
  const opVal = document.getElementById('pp-opacity-val');
  const opacity = props.opacity !== undefined ? props.opacity : 1;
  if (opSlider) opSlider.value = opacity;
  if (opVal) opVal.textContent = Math.round(opacity * 100) + '%';

  // Hide appearance for groups
  const appearance = document.getElementById('pp-appearance');
  if (appearance) appearance.style.display = (props.kind === 'root' || props.kind === 'group') ? 'none' : '';

  propsSuppressSync = false;
}

/** Shift minimap when props panel is visible. */
function adjustMinimapForProps(visible) {
  const mc = document.getElementById('minimap-container');
  if (mc) mc.style.right = visible ? '212px' : '12px';
}

/** Shift minimap bottom when toolbar actually overlaps it (collision-based). */
function adjustMinimapForToolbar() {
  const mc = document.getElementById('minimap-container');
  const tb = document.getElementById('floating-toolbar');
  if (!mc || !tb) return;
  // If toolbar is hidden or minimized with no overlap risk, reset
  if (tb.style.visibility === 'hidden' || tb.offsetParent === null) {
    mc.style.bottom = '12px';
    return;
  }
  const mr = mc.getBoundingClientRect();
  const tr = tb.getBoundingClientRect();
  // Check AABB overlap: toolbar rect intersects minimap rect
  const overlaps = !(tr.right < mr.left || tr.left > mr.right ||
                     tr.bottom < mr.top || tr.top > mr.bottom);
  if (overlaps) {
    // Shift minimap above toolbar with 8px gap
    const canvas = document.getElementById('canvas-content') || document.getElementById('canvas-wrapper');
    const cr = canvas ? canvas.getBoundingClientRect() : { bottom: window.innerHeight };
    const gap = cr.bottom - tr.top + 8;
    mc.style.bottom = Math.max(12, gap) + 'px';
  } else {
    mc.style.bottom = '12px';
  }
}

/** Wire input handlers for the properties panel fields. */
function setupPropsPanel() {
  const propChange = (key, el) => {
    if (propsSuppressSync || !fdCanvas) return;
    // #4: Use bulk editing when multiple nodes are selected
    const changed = (fdCanvas.set_multi_node_prop && JSON.parse(fdCanvas.get_selected_ids()).length > 1)
      ? fdCanvas.set_multi_node_prop(key, el.value)
      : fdCanvas.set_node_prop(key, el.value);
    if (changed) { renderCanvas(); syncCanvasToEditor(); }
  };

  // W/H inputs (debounced)
  let debounce = null;
  ['pp-w', 'pp-h'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = id === 'pp-w' ? 'width' : 'height';
    el.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => propChange(key, el), 150);
    });
  });

  // Fill color
  document.getElementById('pp-fill')?.addEventListener('input', function() { propChange('fill', this); });

  // Stroke color
  document.getElementById('pp-stroke')?.addEventListener('input', function() { propChange('strokeColor', this); });

  // Stroke width
  document.getElementById('pp-stroke-w')?.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(() => propChange('strokeWidth', this), 150);
  });

  // Corner radius
  document.getElementById('pp-corner')?.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(() => propChange('cornerRadius', this), 150);
  });

  // Opacity slider
  const opSlider = document.getElementById('pp-opacity');
  const opVal = document.getElementById('pp-opacity-val');
  if (opSlider) {
    opSlider.addEventListener('input', () => {
      if (opVal) opVal.textContent = Math.round(parseFloat(opSlider.value) * 100) + '%';
      clearTimeout(debounce);
      debounce = setTimeout(() => propChange('opacity', opSlider), 100);
    });
  }

  // Duplicate
  document.getElementById('pp-duplicate')?.addEventListener('click', () => {
    if (!fdCanvas) return;
    const changed = fdCanvas.duplicate_selected();
    if (changed) { renderCanvas(); syncCanvasToEditor(); updatePropertiesPanel(); }
  });

  // Delete
  document.getElementById('pp-delete')?.addEventListener('click', () => {
    if (!fdCanvas) return;
    const changed = fdCanvas.delete_selected();
    if (changed) { renderCanvas(); syncCanvasToEditor(); updatePropertiesPanel(); }
  });

  // Select all text on focus for number inputs (easier editing)
  ['pp-w', 'pp-h', 'pp-stroke-w', 'pp-corner'].forEach(id => {
    document.getElementById(id)?.addEventListener('focus', (e) => e.target.select());
  });
}

/** ─── Clipboard (Copy / Paste / Cut) ────────────────────────────────── */
let fdClipboard = '';
let fdClipboardIsInternal = false;
let pasteOffsetCount = 0;

/** Extract the .fd text block for a single node by its ID. */
function extractNodeBlock(text, nodeId) {
  const lines = text.split('\n');
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${nodeId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx < 0) return '';

  // Walk down from the declaration line until indent <= start
  const startIndent = lines[startIdx].match(/^\s*/)[0].length;
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

/** Copy the selected node's .fd block to internal + system clipboard. */
function copySelectedAsFd() {
  if (!fdCanvas) return;
  // Use emit_selection_fd for multi-node support (copies all selected nodes + edges)
  try {
    const selFd = fdCanvas.emit_selection_fd();
    if (selFd && selFd.trim()) {
      fdClipboard = selFd;
      fdClipboardIsInternal = true;
      pasteOffsetCount = 0;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fdClipboard).catch(() => {});
      }
      return;
    }
  } catch (_) {}
  // Fallback: single node via extractNodeBlock
  const text = fdCanvas.get_text();
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;
  const block = extractNodeBlock(text, selectedId);
  if (!block) return;
  fdClipboard = block;
  fdClipboardIsInternal = true;
  pasteOffsetCount = 0;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fdClipboard).catch(() => {});
  }
}

/** Cut the selected node — copy then delete. */
function cutSelectedAsFd() {
  if (!fdCanvas) return;
  copySelectedAsFd();
  const changed = fdCanvas.delete_selected();
  if (changed) {
    renderCanvas();
    syncCanvasToEditor();
  }
}

/** Paste node(s) — delegates to WASM duplicate for internal clipboard,
 *  falls back to text-based paste for external system clipboard content. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Check if system clipboard has different content (external paste)
  let useExternal = false;
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText.includes('@') && sysText !== fdClipboard) {
        useExternal = true;
        fdClipboard = sysText;
        fdClipboardIsInternal = false;
      }
    }
  } catch (_) { /* permission denied — use internal */ }

  // Internal clipboard: delegate to WASM duplicate_selected() for correct
  // naming, constraint remapping, edge duplication, and position handling.
  if (fdClipboardIsInternal && fdClipboard) {
    fdCanvas.push_undo_snapshot(fdCanvas.get_text(), fdCanvas.get_text());
    const changed = fdCanvas.duplicate_selected();
    if (changed) {
      renderCanvas();
      syncCanvasToEditor();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
    return;
  }

  // External clipboard: text-based paste with regex ID renaming
  const clipText = fdClipboard;
  if (!clipText || !clipText.trim()) return;

  pasteOffsetCount++;

  // Collect all @id declarations
  const idPattern = /@(\w+)\s*\{/g;
  const allIds = new Set();
  let m;
  while ((m = idPattern.exec(clipText)) !== null) allIds.add(m[1]);
  const idPattern2 = /@(\w+)\s+"[^"]*"\s*\{/g;
  while ((m = idPattern2.exec(clipText)) !== null) allIds.add(m[1]);
  const idPattern3 = /(?:rect|ellipse|text|group|frame|path|edge)\s+@(\w+)/g;
  while ((m = idPattern3.exec(clipText)) !== null) allIds.add(m[1]);
  if (allIds.size === 0) return;

  // Rename IDs to avoid conflicts — use batch-aware naming
  const existingText = fdCanvas.get_text();
  let pasteText = clipText;
  const rootId = [...allIds][0];
  const idMap = new Map();
  let batchMaxCache = new Map(); // stem → current max N (batch-aware)

  for (const oldId of allIds) {
    const stem = oldId.replace(/_(?:\d+|cp\d+)$/, '');
    let maxN = batchMaxCache.get(stem) || 0;
    if (maxN === 0) {
      // First time seeing this stem — scan existing text
      const re = new RegExp(`@${stem}_(\\d+)\\b`, 'g');
      let match;
      for (const match of existingText.matchAll(re)) {
        maxN = Math.max(maxN, parseInt(match[1]));
      }
      if (new RegExp(`@${stem}\\b`).test(existingText)) maxN = Math.max(maxN, 1);
    }
    const newN = maxN + 1;
    batchMaxCache.set(stem, newN); // Increment for next node with same stem
    idMap.set(oldId, stem + '_' + newN);
  }

  for (const [oldId, newId] of idMap) {
    pasteText = pasteText.replace(new RegExp(`@${oldId}\\b`, 'g'), `@${newId}`);
  }
  const newRootId = idMap.get(rootId) || rootId;

  // Horizontal offset
  let xOffset = pasteOffsetCount * 20;
  try {
    const boundsJson = fdCanvas.get_node_bounds_json(rootId);
    if (boundsJson) {
      const bounds = JSON.parse(boundsJson);
      if (bounds && bounds.width > 0) xOffset = (bounds.width + 20) * pasteOffsetCount;
    }
  } catch (_) {}

  pasteText = pasteText.replace(/\b(x:\s*)(-?\d+(?:\.\d+)?)/g, (_m, prefix, val) => {
    return prefix + (parseFloat(val) + xOffset);
  });

  // Undo support
  const textBefore = fdCanvas.get_text();
  const updatedText = textBefore.trimEnd() + '\n\n' + pasteText + '\n';
  fdCanvas.set_text(updatedText);
  fdCanvas.push_undo_snapshot(textBefore, updatedText);

  renderCanvas();
  syncCanvasToEditor();

  // Select the newly pasted root node
  fdCanvas.select_by_id(newRootId);
  renderCanvas();
  updatePropertiesPanel();
  refreshLayersPanel();
}

/** ─── Context Menu (Unified) ──────────────────────────────────────── */
let contextMenuClickPos = null; // scene-space {x, y} of right-click
const ctxMenu = new ContextMenu();

function closeContextMenu() {
  ctxMenu.close();
}

/** Wire context menu events and action handlers. */
function setupContextMenu() {
  const canvas = document.getElementById('fd-canvas');
  if (!canvas) return;

  // ── Node action handler (shared by canvas and layer menus) ──
  const doNodeAction = (action, el) => {
    if (!fdCanvas) return;
    let changed = false;
    const textBefore = fdCanvas.get_text();
    switch (action) {
      case 'copy':
        copySelectedAsFd();
        break;
      case 'cut':
        cutSelectedAsFd();
        changed = true;
        break;
      case 'duplicate':
        changed = fdCanvas.duplicate_selected();
        break;
      case 'delete':
        changed = fdCanvas.delete_selected();
        break;
      case 'bring-forward': {
        const r = JSON.parse(fdCanvas.handle_key(']', false, false, false, true));
        changed = r.changed;
        break;
      }
      case 'send-backward': {
        const r = JSON.parse(fdCanvas.handle_key('[', false, false, false, true));
        changed = r.changed;
        break;
      }
      case 'group':
        changed = fdCanvas.group_selected();
        break;
      case 'ungroup':
        changed = fdCanvas.ungroup_selected();
        break;
      case 'copy-fd':
        navigator.clipboard.writeText(fdCanvas.get_text()).catch(() => {});
        break;
      case 'add-note': {
        const noteId = fdCanvas.get_selected_id();
        if (!noteId) break;
        const noteText = prompt('Add a note:');
        if (!noteText) break;
        const src = fdCanvas.get_text();
        const nodeRe = new RegExp(`(@${noteId.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*(?:"[^"]*"\\s*)?\\{)`);
        const m = src.match(nodeRe);
        if (m) {
          const insertPos = m.index + m[0].length;
          const newSrc = src.slice(0, insertPos) + `\n  note "${noteText}"` + src.slice(insertPos);
          fdCanvas.set_text(newSrc);
          changed = true;
        }
        break;
      }
      case 'lock':
        if (fdCanvas.toggle_node_locked) {
          fdCanvas.toggle_node_locked(fdCanvas.get_selected_id());
          changed = true;
        }
        break;
      case 'rename': {
        const selId = fdCanvas.get_selected_id();
        if (!selId) break;
        const newId = prompt(`Rename @${selId} to:`, selId);
        if (!newId || newId === selId || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newId)) break;
        const text = fdCanvas.get_text();
        const esc = selId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`@${esc}\\b`, 'g');
        fdCanvas.set_text(text.replace(re, `@${newId}`));
        changed = true;
        break;
      }
    }
    if (changed) {
      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) {
        fdCanvas.push_undo_snapshot(textBefore, textAfter);
      }
      renderCanvas();
      syncCanvasToEditor();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
  };

  // ── Canvas empty-space action handler ──
  const doCanvasAction = (action) => {
    if (!fdCanvas) return;
    switch (action) {
      case 'paste':
        pasteFromClipboard();
        break;
      case 'add-rect':
        fdCanvas.set_tool('rect');
        updateToolbar('rect');
        canvas.style.cursor = 'crosshair';
        break;
      case 'add-ellipse':
        fdCanvas.set_tool('ellipse');
        updateToolbar('ellipse');
        canvas.style.cursor = 'crosshair';
        break;
      case 'add-text':
        fdCanvas.set_tool('text');
        updateToolbar('text');
        canvas.style.cursor = 'crosshair';
        break;
      case 'fit': {
        const sb = fdCanvas.get_scene_bounds();
        if (sb) {
          try {
            const b = JSON.parse(sb);
            if (b.w > 0 && b.h > 0) {
              const cr = canvas.getBoundingClientRect();
              const zoom = Math.min(cr.width / (b.w + 60), cr.height / (b.h + 60), 2);
              zoomLevel = zoom;
              panX = cr.width / 2 - (b.x + b.w / 2) * zoom;
              panY = cr.height / 2 - (b.y + b.h / 2) * zoom;
              renderCanvas();
              updateZoomIndicator();
            }
          } catch (_) {}
        }
        break;
      }
    }
  };

  // ── Build node context menu items ──
  function buildNodeMenuItems(hitId, selectedIds) {
    const selCount = selectedIds.length;
    const isMulti = selCount > 1;
    const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(hitId) : false;

    const items = [];

    // Selection badge (header)
    if (isMulti) {
      items.push({ type: 'header', label: `${selCount} objects selected` });
    }

    // Clipboard
    items.push({ type: 'action', icon: '📋', label: isMulti ? `Copy ${selCount} items` : 'Copy', shortcut: '⌘C', action: 'copy' });
    items.push({ type: 'action', icon: '✂', label: isMulti ? `Cut ${selCount} items` : 'Cut', shortcut: '⌘X', action: 'cut' });
    items.push({ type: 'action', icon: '⧉', label: isMulti ? `Duplicate ${selCount} items` : 'Duplicate', shortcut: '⌘D', action: 'duplicate' });
    items.push({ type: 'action', icon: '🗑', label: isMulti ? `Delete ${selCount} items` : 'Delete', shortcut: '⌫', action: 'delete', danger: true });
    items.push({ type: 'separator' });

    // Z-order
    items.push({ type: 'action', icon: '↑', label: 'Bring Forward', action: 'bring-forward' });
    items.push({ type: 'action', icon: '↓', label: 'Send Backward', action: 'send-backward' });
    items.push({ type: 'separator' });

    // Structure
    items.push({ type: 'action', icon: '⊞', label: 'Group', action: 'group' });
    items.push({ type: 'action', icon: '⊟', label: 'Ungroup', action: 'ungroup' });

    if (!isMulti) {
      items.push({ type: 'separator' });
      items.push({ type: 'action', icon: '✏️', label: 'Rename', action: 'rename' });
      items.push({ type: 'action', icon: isLocked ? '🔓' : '🔒', label: isLocked ? 'Unlock' : 'Lock', action: 'lock' });
      items.push({ type: 'separator' });
      items.push({ type: 'action', icon: '📄', label: 'Copy as .fd', action: 'copy-fd' });
      items.push({ type: 'separator' });
      items.push({ type: 'action', icon: '📝', label: 'Add Note', action: 'add-note' });
    }

    return items;
  }

  // ── Build canvas empty-space menu items ──
  function buildCanvasMenuItems() {
    return [
      { type: 'action', icon: '📋', label: 'Paste', shortcut: '⌘V', action: 'paste' },
      { type: 'separator' },
      { type: 'action', icon: '▢', label: 'Add Rectangle', shortcut: 'R', action: 'add-rect' },
      { type: 'action', icon: '○', label: 'Add Ellipse', shortcut: 'O', action: 'add-ellipse' },
      { type: 'action', icon: 'T', label: 'Add Text', shortcut: 'T', action: 'add-text' },
      { type: 'separator' },
      { type: 'action', icon: '⊡', label: 'Fit to Content', action: 'fit' },
    ];
  }

  // Right-click on canvas
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Escape layered dismissal (non-menu uses)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Context menu Escape is handled by ContextMenu class (capture phase)
      // Only handle non-menu Escape here
      if (ctxMenu.isOpen) return; // already handled by ContextMenu
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (fdCanvas && fdCanvas.get_selected_id()) {
        fdCanvas.select_by_id('');
        renderDirty = true; uiDirty = true;
      }
    }
    // Track Shift key for hover labels
    if (e.key === 'Shift') {
      modShiftHeld = true;
      renderDirty = true;
    }

    if (e.key === 'F' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    // ⌘⇧N (Ctrl+Shift+N) → toggle Specs panel
    if (e.key === 'N' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      toggleSpecsPanel();
    }
    // \ (backslash) → toggle Layers panel (no modifiers, not in input)
    if (e.key === '\\' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleLayersPanel();
      }
    }
    // ⌥⇧F (Option+Shift+F) → Format document
    if (e.key === 'F' && e.shiftKey && e.altKey && !e.metaKey && !e.ctrlKey) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (fdCanvas) {
          const textBefore = fdCanvas.get_text();
          const result = fdCanvas.format_with_options(true, true, false);
          try {
            const parsed = JSON.parse(result);
            if (parsed.changed) {
              const textAfter = fdCanvas.get_text();
              fdCanvas.push_undo_snapshot(textBefore, textAfter);
              renderCanvas();
              syncCanvasToEditor();
              updatePropertiesPanel();
              refreshLayersPanel();
              const delta = parsed.lines_before - parsed.lines_after;
              const deltaStr = delta > 0 ? `, ${delta} lines trimmed` : '';
              showToast(`✦ Formatted: ${parsed.summary}${deltaStr}`);
            } else {
              showToast('✓ Already formatted');
            }
          } catch (_) {
            showToast('Format failed');
          }
        }
      }
    }
    // ` (backtick) → toggle X-ray node labels (no modifiers, not in input)
    if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        xrayLabels = !xrayLabels;
        renderDirty = true;
        showToast(xrayLabels ? 'X-ray labels ON' : 'X-ray labels OFF');
      }
    }
  });
  // Close context menu on canvas pointerdown (ContextMenu handles this via capture,
  // but this ensures the old pattern still works for any other menus)
  canvas.addEventListener('pointerdown', () => ctxMenu.close());
}

    // Layers Panel logic extracted to site/layers.js
    // refreshLayersPanel is assigned from initLayersPanel(api)

/** ─── Minimap ─────────────────────────────────────────────────────────── */
let minimapLastRender = 0;
const MINIMAP_INTERVAL = 100; // ~10fps

function updateMinimapCache(mw, mh, dpr) {
  if (!minimapCacheCanvas) {
    minimapCacheCanvas = document.createElement('canvas');
  }
  if (minimapCacheCanvas.width !== mw * dpr) minimapCacheCanvas.width = mw * dpr;
  if (minimapCacheCanvas.height !== mh * dpr) minimapCacheCanvas.height = mh * dpr;
  const ctx = minimapCacheCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = isDark ? 'rgba(28,28,30,0.9)' : 'rgba(245,245,247,0.9)';
  ctx.fillRect(0, 0, mw, mh);

  const sceneBoundsJson = fdCanvas.get_scene_bounds();
  if (!sceneBoundsJson) return;
  let sb;
  try { sb = JSON.parse(sceneBoundsJson); } catch (_) { return; }
  if (!sb.w || sb.w <= 0 || !sb.h || sb.h <= 0) return;

  const pad = 20;
  const scale = Math.min((mw - pad * 2) / sb.w, (mh - pad * 2) / sb.h);
  const ox = (mw - sb.w * scale) / 2;
  const oy = (mh - sb.h * scale) / 2;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.translate(-sb.x, -sb.y);
  fdCanvas.render(ctx, performance.now(), true, false, false, false);
  ctx.restore();

  const mc = document.getElementById('minimap-canvas');
  if (mc) {
    mc._minimap = { sx: sb.x, sy: sb.y, sw: sb.w, sh: sb.h, scale, ox, oy };
  }
}

/** Render the minimap: cached scene overview + 60fps viewport rect */
function renderMinimap(canvas) {
  const mc = document.getElementById('minimap-canvas');
  if (!mc || !fdCanvas) return;

  // Toggle has-content on minimap container to hide preview on empty canvas
  const mmContainer = document.getElementById('minimap-container');
  if (mmContainer) {
    const boundsJson = fdCanvas.get_scene_bounds();
    let hasNodes = false;
    if (boundsJson) {
      try {
        const b = JSON.parse(boundsJson);
        hasNodes = b.w > 0 && b.h > 0;
      } catch (_) { /* ignore */ }
    }
    mmContainer.classList.toggle('has-content', hasNodes);
  }

  const dpr = window.devicePixelRatio || 1;
  const mw = 150, mh = 100;
  
  if (mc.width !== mw * dpr) mc.width = mw * dpr;
  if (mc.height !== mh * dpr) mc.height = mh * dpr;

  // 1. Update WASM cache (debounced during active interactions)
  if (sceneDirty && activePointerId === -1 && !isInlineEditing()) {
    updateMinimapCache(mw, mh, dpr);
    sceneDirty = false;
  }

  const mctx = mc.getContext('2d');
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, mw * dpr, mh * dpr);

  // 2. Draw cached scene
  if (minimapCacheCanvas) {
    mctx.drawImage(minimapCacheCanvas, 0, 0);
  } else {
    // Fallback if cache isn't ready
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle = isDark ? 'rgba(28,28,30,0.9)' : 'rgba(245,245,247,0.9)';
    mctx.fillRect(0, 0, mw, mh);
  }

  // 3. Draw viewport rect
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (canvas && mc._minimap) {
    const sb = mc._minimap;
    const cr = canvas.getBoundingClientRect();
    const vx = -panX / zoomLevel;
    const vy = -panY / zoomLevel;
    const vw = cr.width / zoomLevel;
    const vh = cr.height / zoomLevel;
    const vrx = sb.ox + (vx - sb.sx) * sb.scale;
    const vry = sb.oy + (vy - sb.sy) * sb.scale;
    const vrw = vw * sb.scale;
    const vrh = vh * sb.scale;

    mctx.strokeStyle = isDark ? 'rgba(10, 132, 255, 0.6)' : 'rgba(0, 122, 255, 0.5)';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(vrx, vry, vrw, vrh);
    mctx.fillStyle = isDark ? 'rgba(10, 132, 255, 0.08)' : 'rgba(0, 122, 255, 0.06)';
    mctx.fillRect(vrx, vry, vrw, vrh);
  }
}

// ─── Specs Panel Resize ──────────────────────────────────────────────────

/** Set up drag-to-resize for the Specs panel (left edge). */
function setupSpecsResize() {
  const panel = document.getElementById('specs-panel');
  const handle = document.getElementById('notes-resize');
  if (!panel || !handle) return;

  const MIN_W = 180;
  const MAX_W = 500;
  const DEFAULT_W = 260;

  // Restore persisted width
  const savedW = parseInt(localStorage.getItem('fd-specs-width'), 10);
  if (savedW >= MIN_W && savedW <= MAX_W) {
    panel.style.setProperty('--specs-width', savedW + 'px');
  }

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    handle.classList.add('active');
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // Dragging left edge: moving left = wider, moving right = narrower
    const dx = startX - e.clientX;
    const newW = Math.max(MIN_W, Math.min(MAX_W, startW + dx));
    panel.style.setProperty('--specs-width', newW + 'px');
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('active');
    // Persist width
    const w = panel.offsetWidth;
    localStorage.setItem('fd-specs-width', String(w));
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  // Double-click to reset to default width
  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    panel.style.setProperty('--specs-width', DEFAULT_W + 'px');
    localStorage.setItem('fd-specs-width', String(DEFAULT_W));
  });
}

// (setupSplitResize removed — code editor now lives in right panel tabs)
let lastSplitResizeTime = 0; // kept for backward compat with any existing guards

// ─── Panel Resize ────────────────────────────────────────────────────────

/** Set up drag-to-resize for left panel. */
function setupPanelResize(wrapper, resizeCanvas) {
  const leftPanel = document.getElementById('left-panel');
  const layersHandle = document.getElementById('layers-resize');

  const MIN_WIDTH = 120;
  const MAX_WIDTH = 500;
  const DEFAULT_LEFT_W = 260;

  // Restore persisted widths
  const savedLeftW = parseInt(localStorage.getItem('fd-left-panel-width'), 10);

  if (savedLeftW && savedLeftW >= MIN_WIDTH && savedLeftW <= MAX_WIDTH) {
    document.documentElement.style.setProperty('--left-panel-width', savedLeftW + 'px');
  }

  /** Position layers resize handle at panel's right edge. */
  function positionLayersHandle() {
    if (!layersHandle || !leftPanel) return;
    const w = document.documentElement.dataset.lp === 'closed' ? 0 : leftPanel.offsetWidth;
    layersHandle.style.left = w + 'px';
  }
  // Expose globally so toggleLeftPanel / toggleLayersPanel can call it after CSS var update
  window.__fdPositionLayersHandle = positionLayersHandle;

  // Initial position
  requestAnimationFrame(() => {
    positionLayersHandle();
  });

  // ── Layers drag handler ──
  if (!layersHandle || !leftPanel) return;
  let dragging = false;
  let startX = 0;
  let startW = 0;
  let resizeRafId = null;

  layersHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    startX = e.clientX;
    startW = leftPanel.offsetWidth;
    leftPanel.classList.add('no-transition');
    layersHandle.classList.add('active');
    layersHandle.setPointerCapture(e.pointerId);
  });

  layersHandle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const rawWidth = startW + dx;
    
    if (rawWidth < 80) {
      if (document.documentElement.dataset.lp !== 'closed') {
        document.documentElement.dataset.lp = 'closed';
        document.documentElement.style.setProperty('--left-panel-width', '0px');
        localStorage.setItem('fd-left-collapsed', '1');
      }
    } else {
      if (document.documentElement.dataset.lp === 'closed') {
        document.documentElement.dataset.lp = 'open';
        localStorage.setItem('fd-left-collapsed', '');
      }
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, rawWidth));
      document.documentElement.style.setProperty('--left-panel-width', newW + 'px');
    }
    
    positionLayersHandle();
    // Batch expensive canvas resize + render to once per display frame
    if (!resizeRafId) {
      resizeRafId = requestAnimationFrame(() => {
        resizeCanvas();
        renderCanvas();
        resizeRafId = null;
      });
    }
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    leftPanel.classList.remove('no-transition');
    layersHandle.classList.remove('active');
    // Cancel any pending RAF and do a final sync resize
    if (resizeRafId) {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = null;
    }
    resizeCanvas();
    renderCanvas();
    if (document.documentElement.dataset.lp !== 'closed') {
      const w = leftPanel.offsetWidth;
      localStorage.setItem('fd-left-panel-width', String(w));
    }
    // Re-clamp toolbar to new canvas bounds after panel resize
    requestAnimationFrame(() => window.__fdReclampToolbar?.());
  };
  layersHandle.addEventListener('pointerup', endDrag);
  layersHandle.addEventListener('pointercancel', endDrag);

  // Double-click to reset left panel to default width
  layersHandle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.documentElement.style.setProperty('--left-panel-width', DEFAULT_LEFT_W + 'px');
    localStorage.setItem('fd-left-panel-width', String(DEFAULT_LEFT_W));
    requestAnimationFrame(() => {
      positionLayersHandle();
      resizeCanvas();
      renderCanvas();
    });
  });

  // ── Right panel drag-to-resize ──────────────────────────────────────
  const rightPanel = document.getElementById('right-panel');
  const rightHandle = document.getElementById('right-resize');
  const MIN_RIGHT_W = 180;
  const MAX_RIGHT_W = 500;
  const DEFAULT_RIGHT_W = 260;

  // Restore persisted right panel width
  const savedRightW = parseInt(localStorage.getItem('fd-right-panel-width'), 10);
  if (savedRightW >= MIN_RIGHT_W && savedRightW <= MAX_RIGHT_W) {
    document.documentElement.style.setProperty('--right-panel-width', savedRightW + 'px');
  }

  /** Position right resize handle at the panel's left edge. */
  function positionRightHandle() {
    if (!rightHandle || !rightPanel) return;
    if (document.documentElement.dataset.rp === 'closed') {
      rightHandle.style.right = '0px';
    } else {
      rightHandle.style.right = rightPanel.offsetWidth + 'px';
    }
  }
  window.__fdPositionRightHandle = positionRightHandle;

  requestAnimationFrame(() => {
    positionRightHandle();
  });

  if (!rightHandle || !rightPanel) return;
  let rightDragging = false;
  let rightStartX = 0;
  let rightStartW = 0;
  let rightResizeRafId = null;

  rightHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    rightDragging = true;
    rightStartX = e.clientX;
    rightStartW = rightPanel.offsetWidth;
    rightPanel.classList.add('no-transition');
    rightHandle.classList.add('active');
    rightHandle.setPointerCapture(e.pointerId);
  });

  rightHandle.addEventListener('pointermove', (e) => {
    if (!rightDragging) return;
    // Dragging left edge of right panel: moving left = wider, moving right = narrower
    const dx = rightStartX - e.clientX;
    const newW = Math.max(MIN_RIGHT_W, Math.min(MAX_RIGHT_W, rightStartW + dx));
    document.documentElement.style.setProperty('--right-panel-width', newW + 'px');
    positionRightHandle();
    if (!rightResizeRafId) {
      rightResizeRafId = requestAnimationFrame(() => {
        resizeCanvas();
        renderCanvas();
        rightResizeRafId = null;
      });
    }
  });

  const endRightDrag = () => {
    if (!rightDragging) return;
    rightDragging = false;
    rightPanel.classList.remove('no-transition');
    rightHandle.classList.remove('active');
    if (rightResizeRafId) {
      cancelAnimationFrame(rightResizeRafId);
      rightResizeRafId = null;
    }
    resizeCanvas();
    renderCanvas();
    if (document.documentElement.dataset.rp !== 'closed') {
      const w = rightPanel.offsetWidth;
      localStorage.setItem('fd-right-panel-width', String(w));
    }
    requestAnimationFrame(() => window.__fdReclampToolbar?.());
  };
  rightHandle.addEventListener('pointerup', endRightDrag);
  rightHandle.addEventListener('pointercancel', endRightDrag);

  // Double-click to reset right panel to default width
  rightHandle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.documentElement.style.setProperty('--right-panel-width', DEFAULT_RIGHT_W + 'px');
    localStorage.setItem('fd-right-panel-width', String(DEFAULT_RIGHT_W));
    requestAnimationFrame(() => {
      positionRightHandle();
      resizeCanvas();
      renderCanvas();
    });
  });
}

// ─── Init ────────────────────────────────────────────────────────────────

/** ─── Specs Panel ────────────────────────────────────────────────────── */
let specsPanelOpen = false;

/**
 * Render notes panel using WASM get_all_specs() API + marked.js.
 * Each node's raw markdown note is rendered via marked.parse().
 * Interactive checkboxes: click to toggle [ ] ↔ [x] and write back.
 */
function renderSpecsPanel() {
  const body = document.getElementById('specs-panel-body');
  if (!body || !fdCanvas) return;

  // Get all notes from WASM API
  let notes;
  try {
    const json = fdCanvas.get_all_specs();
    notes = JSON.parse(json);
  } catch (_) {
    notes = [];
  }

  if (notes.length === 0) {
    body.innerHTML = '<p class="specs-empty">No notes yet. Add a note via right-click → Add Note.</p>';
    return;
  }

  // Configure marked for safe rendering
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  let html = '';
  for (const entry of notes) {
    const nodeId = entry.id;
    const rawNote = entry.note;

    html += `<div class="spec-group" data-note-node="${nodeId}">`;
    html += `<div class="spec-group-header" data-node="${nodeId}" title="Click to select @${nodeId}">@${nodeId}</div>`;
    html += `<div class="spec-markdown">`;

    // Check if entire note is a file reference (inline form: note "./spec.md")
    const fileRefMatch = rawNote.trim().match(/^\.?\.?\/[^\s]+\.md$/);
    if (fileRefMatch) {
      html += `<div class="note-file-link" title="Open in VS Code to view">📎 ${rawNote.trim()}</div>`;
    } else {
      // Process @include directives within block notes
      let processedNote = rawNote.replace(
        /@include\("([^"]+\.md)"\)/g,
        (_, path) => `\n\n<div class="note-file-link" title="Open in VS Code to view">📎 ${path}</div>\n\n`
      );

      if (typeof marked !== 'undefined') {
        const rendered = marked.parse(processedNote);
        html += rendered;
      } else {
        html += `<pre>${processedNote.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      }
    }

    html += `</div></div>`;
  }
  body.innerHTML = html;

  // Click-to-select: clicking a group header selects the node on canvas
  body.querySelectorAll('.spec-group-header').forEach(el => {
    el.addEventListener('click', () => {
      const nid = el.dataset.node;
      if (nid && nid !== '_root' && fdCanvas) {
        fdCanvas.select_by_id(nid);
      }
    });
  });

  // Interactive checkboxes: toggle [ ] ↔ [x] in the raw markdown
  body.querySelectorAll('.spec-markdown input[type="checkbox"]').forEach(cb => {
    cb.removeAttribute('disabled');
    cb.addEventListener('change', (e) => {
      const group = e.target.closest('.spec-group');
      if (!group) return;
      const nodeId = group.dataset.noteNode;
      if (!nodeId || !fdCanvas) return;

      // Get current note, find the N-th checkbox, toggle it
      const currentSpec = fdCanvas.get_spec(nodeId);
      if (!currentSpec) return;

      // Find checkbox index within this spec-group
      const allCheckboxes = group.querySelectorAll('input[type="checkbox"]');
      let cbIndex = 0;
      for (let i = 0; i < allCheckboxes.length; i++) {
        if (allCheckboxes[i] === e.target) { cbIndex = i; break; }
      }

      // Toggle the N-th checkbox pattern in the raw markdown
      let checkboxCount = 0;
      const updatedSpec = currentSpec.replace(/- \[([ xX])\]/g, (match, state) => {
        if (checkboxCount === cbIndex) {
          checkboxCount++;
          return state.trim() ? '- [ ]' : '- [x]';
        }
        checkboxCount++;
        return match;
      });

      // Write back via WASM
      fdCanvas.set_spec(nodeId, updatedSpec);

      // Sync to code editor
      if (typeof syncCanvasToEditor === 'function') {
        syncCanvasToEditor();
      } else if (typeof editorView !== 'undefined' && editorView) {
        const newText = fdCanvas.get_text();
        const currentText = editorView.state.doc.toString();
        if (newText !== currentText) {
          editorView.dispatch({
            changes: { from: 0, to: currentText.length, insert: newText }
          });
        }
      }
    });
  });
}

function toggleSpecsPanel() {
  switchLeftTab('inspect');
  if (typeof renderSpecsPanel === 'function') renderSpecsPanel();
}

/** Toggle Layers panel collapsed/expanded. */
function toggleLayersPanel() {
  const leftPanel = document.getElementById('left-panel');
  if (!leftPanel) return;
  const h = document.documentElement;
  const isCollapsed = h.dataset.lp === 'open'; // toggling: open → closed
  h.dataset.lp = isCollapsed ? 'closed' : 'open';
  if (isCollapsed) {
    h.style.setProperty('--left-panel-width', '0px');
    localStorage.setItem('fd-left-collapsed', '1');
  } else {
    const savedW = parseInt(localStorage.getItem('fd-left-panel-width'), 10);
    const restoreW = (savedW >= 120 && savedW <= 500) ? savedW : 260;
    h.style.setProperty('--left-panel-width', restoreW + 'px');
    localStorage.setItem('fd-left-collapsed', '');
  }
  // Reposition resize handle after collapse/expand
  const lrHandle = document.getElementById('layers-resize');
  if (lrHandle) {
    lrHandle.style.display = isCollapsed ? 'none' : '';
  }
  requestAnimationFrame(() => {
    window.__fdPositionLayersHandle?.();
    window.dispatchEvent(new Event('resize'));
    renderCanvas();
  });
}

/** ─── AI Touch — Unified Two-Phase Pipeline ──────────────────────────── *
 * With selection:  Phase 1 (refine) → Phase 2 (scoped review)
 * No selection:    Full-doc review
 * ──────────────────────────────────────────────────────────────────────── */

/** Read admin model override from URL param: ?ai_model=llama-70b */
function getAiModelHint() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('ai_model') || undefined;
  } catch (_) { return undefined; }
}

async function aiTouch() {
  if (!fdCanvas) { showToast('Canvas not ready'); return; }

  // Gather selected IDs
  let selectedIds = [];
  try {
    const idsJson = fdCanvas.get_selected_ids?.();
    selectedIds = idsJson ? JSON.parse(idsJson) : [];
  } catch (_) {}
  if (selectedIds.length === 0) {
    const single = fdCanvas.get_selected_id?.();
    if (single) selectedIds = [single];
  }

  const btn = document.getElementById('ai-touch-btn');
  const statusEl = document.getElementById('canvas-status');
  const hasSelection = selectedIds.length > 0;

  btn?.classList.add('loading');
  if (statusEl) statusEl.textContent = hasSelection
    ? `✦ Refining ${selectedIds.length} element${selectedIds.length > 1 ? 's' : ''}…`
    : '✦ Refining entire design…';

  try {
    const fdText = fdCanvas.get_text();

    // Build prompt — either scoped or full-doc
    const prompt = hasSelection
      ? buildRefinePrompt(fdText, selectedIds)
      : `Improve this FD design — enhance layout, alignment, colors, spacing, and visual hierarchy. Return the COMPLETE improved FD code:\n\n${fdText}`;
    const modelHint = getAiModelHint();
    const userFocus = localStorage.getItem('fd-ai-prompt') || undefined;
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mode: 'refine', model_hint: modelHint, user_focus: userFocus }),
    });

    if (resp.status === 429) {
      const data = await resp.json();
      showToast(`Rate limit reached — ${data.limit}/day free. Try again tomorrow.`);
      return;
    }
    if (!resp.ok) throw new Error(`AI API error: ${resp.status}`);
    const data = await resp.json();

    let refined = data.result || '';
    refined = refined.replace(/^```(?:fd|text)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

    if (!refined) {
      showToast('AI returned empty output — try again');
      return;
    }

    // Show inline diff for user review (Apply/Reject toolbar)
    initCodeMirrorEffects();
    const diffShown = showAiTouchDiff(fdText, refined, hasSelection ? selectedIds : null);
    if (!diffShown) {
      // Fallback: apply directly if diff UI fails
      const result = hasSelection ? spliceModifiedBlocks(fdText, refined, selectedIds) : refined;
      if (editorView) {
        const cur = editorView.state.doc.toString();
        editorView.dispatch({ changes: { from: 0, to: cur.length, insert: result } });
      }
      fdCanvas.set_text(result);
      renderCanvas();
    }

    const remaining = data.remaining;
    let msg = '✦ AI Touch — diff ready for review';
    if (remaining != null && remaining <= 2) msg += ` (${remaining} calls left)`;
    showToast(msg);

  } catch (err) {
    console.warn('AI Touch error:', err);
    showToast('AI unavailable — check /api/ai endpoint');
  } finally {
    btn?.classList.remove('loading');
    if (statusEl) statusEl.textContent = 'Ready';
  }
}

/** Escape HTML for safe rendering. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildRefinePrompt(fdText, selectedIds) {
  const nodeList = selectedIds.filter(id => !id.includes('->')).map(id => `@${id}`);
  const edgeList = selectedIds.filter(id => id.includes('->'));

  let targetDesc = '';
  if (nodeList.length > 0) targetDesc += `Nodes: ${nodeList.join(', ')}`;
  if (edgeList.length > 0) targetDesc += `${targetDesc ? '\n' : ''}Edges: ${edgeList.join(', ')}`;

  // Extract the blocks using WASM emitter (accurate, no regex fragility)
  let selectedBlocks;
  try {
    selectedBlocks = fdCanvas.emit_selection_fd();
  } catch (_) {
    // Fallback to regex-based extraction if WASM API not available
    selectedBlocks = extractBlocksForIds(fdText, selectedIds);
  }

  return `You are an expert UI designer working with the FD (Fast Draft) format.

## Task

Improve ONLY the following elements:
${targetDesc}

## Rules

1. **Rename auto-generated IDs**: Replace \`@_kind_N\` (like \`@_rect_0\`) with a short, semantic snake_case name (e.g., \`@hero_card\`). Max 15 chars.
2. **Restyle for visual polish**: Improve colors (harmonious hex palettes), add rounded corners, adjust sizing. Modern design best practices.
3. **Preserve structure**: Do NOT add, remove, or reorder elements. Only change IDs and visual properties (fill, stroke, corner, opacity, font, dash).
4. **Edges**: You may restyle visual edges (stroke, dash, label). Do NOT modify constraint edges (center_in, align_left, etc.).
5. **Output ONLY the modified blocks** — one per element. No unchanged elements, no full document.
6. **No markdown fences, no explanations** — just valid FD blocks.

## Example 1: Rename + Restyle a plain node

INPUT:
rect @_rect_0 {
  w: 200 h: 120
  fill: #FF0000
  corner: 0
}

OUTPUT:
rect @hero_card {
  w: 200 h: 120
  fill: #6C5CE7
  corner: 14
  shadow: (0,2,16,#00000010)
}

## Example 2: Fix naming + colors inside a frame (preserve structure)

INPUT:
frame @_frame_1 {
  text @_text_3 "Login" {
    fill: #000000
    font: "Arial" 12
  }
  rect @_rect_4 {
    w: 200 h: 40
    fill: #0000FF
    corner: 0
  }
  w: 300 h: 200
  fill: #EEEEEE
}

OUTPUT:
frame @login_form {
  text @login_title "Login" {
    fill: #1A1A2E
    font: "Inter" bold 18
  }
  rect @login_submit {
    w: 200 h: 40
    fill: #6C5CE7
    corner: 10
    when :hover { fill: #5A4BD1 ease: ease_out 150ms }
  }
  w: 300 h: 200
  fill: #F5F5F7
  corner: 16
}

## Selected Blocks to Modify

${selectedBlocks}

## Full Document (read-only context — DO NOT output this, use for design harmony only)

${fdText}`;
}

/** Extract FD text blocks for the given node/edge IDs. */
function extractBlocksForIds(fdText, ids) {
  const lines = fdText.split('\n');
  const blocks = [];
  const idSet = new Set(ids);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Match node definitions: group @id { or rect @id {
    const nodeMatch = trimmed.match(/^(group|frame|rect|ellipse|path|text)\s+@(\w+)/);
    if (nodeMatch && idSet.has(nodeMatch[2])) {
      // Extract the full block (from this line to matching closing brace)
      const block = extractBlock(lines, i);
      blocks.push(block);
      continue;
    }

    // Match edge definitions: @from -> @to or @id -> property: value
    const edgeMatch = trimmed.match(/@(\w+)\s*->/);
    if (edgeMatch && idSet.has(edgeMatch[1])) {
      const block = extractBlock(lines, i);
      blocks.push(block);
    }
  }

  return blocks.join('\n\n') || ids.map(id => `# (block for @${id} not found)`).join('\n');
}

/** Extract a block of FD text starting at lineIdx, matching braces. */
function extractBlock(lines, startIdx) {
  const result = [lines[startIdx]];
  if (!lines[startIdx].includes('{')) return lines[startIdx];

  let depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    if (i !== startIdx) result.push(lines[i]);
    depth += (lines[i].match(/\{/g) || []).length;
    depth -= (lines[i].match(/\}/g) || []).length;
    if (depth <= 0) break;
  }
  return result.join('\n');
}

/** Splice AI-modified blocks back into the original document.
 *  Finds each selected ID block in the original and replaces it with the AI version. */
function spliceModifiedBlocks(originalFd, aiOutput, selectedIds) {
  // If AI returned something that looks like a complete document, just use it
  if (aiOutput.match(/^(#|style\s|group\s|frame\s|rect\s|ellipse\s|path\s|text\s)/m) &&
      aiOutput.split('\n').length > 5 &&
      aiOutput.match(/\b(rect|ellipse|text|group|path)\b/g)?.length >= 3) {
    // Looks like a full document — might be AI ignoring instructions
    // Still try to splice if possible, otherwise use as-is
  }

  let result = originalFd;
  const aiLines = aiOutput.split('\n');

  for (const id of selectedIds) {
    // Find the block for this ID in the AI output
    const aiBlock = findBlockForId(aiLines, id);
    if (!aiBlock) continue;

    // Find and replace the block in the original document
    const origLines = result.split('\n');
    const origBlock = findBlockWithRange(origLines, id);
    if (!origBlock) continue;

    const before = origLines.slice(0, origBlock.startLine);
    const after = origLines.slice(origBlock.endLine + 1);
    result = [...before, aiBlock, ...after].join('\n');
  }

  return result;
}

/** Find a block for a given ID in FD text lines. */
function findBlockForId(lines, id) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const nodeMatch = trimmed.match(new RegExp(`^(group|frame|rect|ellipse|path|text)\\s+@(\\w*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)`));
    const edgeMatch = trimmed.match(new RegExp(`@${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*->`));
    if (nodeMatch || edgeMatch) {
      return extractBlock(lines, i);
    }
  }
  return null;
}

/** Find a block's line range for a given ID. */
function findBlockWithRange(lines, id) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const nodeMatch = trimmed.match(new RegExp(`^(group|frame|rect|ellipse|path|text)\\s+@${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    const edgeMatch = trimmed.match(new RegExp(`@${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*->`));
    if (nodeMatch || edgeMatch) {
      if (!lines[i].includes('{')) return { startLine: i, endLine: i };
      let depth = 0;
      for (let j = i; j < lines.length; j++) {
        depth += (lines[j].match(/\{/g) || []).length;
        depth -= (lines[j].match(/\}/g) || []).length;
        if (depth <= 0) return { startLine: i, endLine: j };
      }
      return { startLine: i, endLine: lines.length - 1 };
    }
  }
  return null;
}

/** ─── Renamify — Heuristic + AI Rename ───────────────────────────────── */
async function renamify() {
  if (!fdCanvas) { showToast('Canvas not ready'); return; }

  const btn = document.getElementById('renamify-btn');
  btn?.classList.add('loading');
  const statusEl = document.getElementById('canvas-status');
  if (statusEl) statusEl.textContent = 'Renaming…';

  try {
    const fdText = fdCanvas.get_text();
    const anonIds = findAnonymousNodeIds(fdText);

    if (anonIds.length === 0) {
      showToast('No anonymous IDs found — all nodes already named!');
      return;
    }

    // Use heuristic rename (no API needed, works immediately)
    const proposals = heuristicRename(fdText, anonIds);

    if (proposals.length === 0) {
      showToast('Could not generate better names');
      return;
    }

    // Apply renames
    let result = fdText;
    for (const { oldId, newId } of proposals) {
      const pattern = new RegExp(`@${oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      result = result.replace(pattern, `@${newId}`);
    }

    // Update CodeMirror and canvas
    if (editorView) {
      const cur = editorView.state.doc.toString();
      editorView.dispatch({ changes: { from: 0, to: cur.length, insert: result } });
    }
    fdCanvas.set_text(result);
    renderCanvas();
    showToast(`✦ Renamed ${proposals.length} node${proposals.length > 1 ? 's' : ''}`);
  } catch (err) {
    console.warn('Renamify error:', err);
    showToast('Rename failed — try again');
  } finally {
    btn?.classList.remove('loading');
    if (statusEl) statusEl.textContent = 'Ready';
  }
}

/** Find auto-generated node IDs like @_rect_0, @_text_3 */
function findAnonymousNodeIds(fdText) {
  const re = /(?:group|frame|rect|ellipse|path|text)\s+@(_(?:rect|ellipse|group|frame|path|text)_\d+)/g;
  const ids = [];
  let m;
  for (const m of fdText.matchAll(re)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Sanitize a string to a valid FD identifier (snake_case, no special chars). */
function sanitizeToFdId(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
}

/** Extract context for anonymous nodes from FD text. */
function extractNodeContexts(fdText, anonIds) {
  const lines = fdText.split('\n');
  const contexts = new Map();
  const parentStack = [];
  let braceDepth = 0;
  const depthAtPush = [];
  let currentNode = null;

  const NODE_RE = /^\s*(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?\s*$/;
  const WIDTH_RE = /\bw:\s*(\d+(?:\.\d+)?)/;
  const HEIGHT_RE = /\bh:\s*(\d+(?:\.\d+)?)/;
  const CONTENT_RE = /\bcontent:\s*"([^"]*)"/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    const nodeMatch = trimmed.match(NODE_RE);
    if (nodeMatch) {
      const [, type, id, inlineText] = nodeMatch;
      const ctx = { id, type, parentId: parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined };
      if (inlineText) ctx.textContent = inlineText;

      if (anonIds.has(id)) {
        contexts.set(id, ctx);
        currentNode = ctx;
      }

      if ((type === 'group' || type === 'frame') && trimmed.includes('{')) {
        parentStack.push(id);
        depthAtPush.push(braceDepth + openBraces);
      }

      braceDepth += openBraces - closeBraces;
      continue;
    }

    if (currentNode && braceDepth > 0) {
      const wMatch = trimmed.match(WIDTH_RE);
      const hMatch = trimmed.match(HEIGHT_RE);
      const contentMatch = trimmed.match(CONTENT_RE);
      if (wMatch) currentNode.width = parseFloat(wMatch[1]);
      if (hMatch) currentNode.height = parseFloat(hMatch[1]);
      if (contentMatch && !currentNode.textContent) currentNode.textContent = contentMatch[1];
    }

    braceDepth += openBraces - closeBraces;

    if (trimmed === '}') {
      while (depthAtPush.length > 0 && depthAtPush[depthAtPush.length - 1] > braceDepth) {
        depthAtPush.pop();
        parentStack.pop();
      }
      if (braceDepth <= 0) currentNode = null;
    }
  }

  return contexts;
}

/** Generate a semantic name from node context using heuristics. */
function generateHeuristicName(ctx) {
  const parts = [];

  // 1. Text content takes priority
  if (ctx.textContent) {
    const cleaned = ctx.textContent
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('_');
    if (cleaned) {
      parts.push(cleaned);
      parts.push(ctx.type !== 'text' ? ctx.type : 'label');
      return sanitizeToFdId(parts.join('_'));
    }
  }

  // 2. Parent context
  if (ctx.parentId && !ctx.parentId.match(/^_?(group|frame)_\d+$/)) {
    parts.push(ctx.parentId);
  }

  // 3. Shape detection
  if (ctx.type === 'ellipse' && ctx.width && ctx.height && ctx.width === ctx.height) {
    parts.push('circle');
  } else if (ctx.type === 'rect' && ctx.width && ctx.height) {
    if (ctx.width > ctx.height * 3) parts.push('bar');
    else if (ctx.height > ctx.width * 3) parts.push('column');
    else parts.push(ctx.type);
  } else {
    parts.push(ctx.type);
  }

  return sanitizeToFdId(parts.join('_')) || ctx.type;
}

/** Heuristic rename — generate semantic names without AI. */
function heuristicRename(fdText, anonIds) {
  const existingIds = findAllNodeIds(fdText);
  const anonSet = new Set(anonIds);
  const contexts = extractNodeContexts(fdText, anonSet);
  const usedNames = new Set(existingIds);
  const proposals = [];

  for (const oldId of anonIds) {
    const ctx = contexts.get(oldId);
    if (!ctx) continue;

    let newId = generateHeuristicName(ctx);
    if (!newId || newId === oldId) continue;

    let candidate = newId;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${newId}_${suffix}`;
      suffix++;
    }
    newId = candidate;

    usedNames.add(newId);
    proposals.push({ oldId, newId });
  }

  return proposals;
}

/** Find ALL node IDs in an FD document. */
function findAllNodeIds(fdText) {
  const re = /(?:group|frame|rect|ellipse|path|text)\s+@(\w+)/g;
  const ids = [];
  let m;
  for (const m of fdText.matchAll(re)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

// ─── Syntax Highlighting ─────────────────────────────────────────────────

// Syntax highlighting and scroll sync are now handled by CodeMirror.
// The old tokenizeLine, highlightEditor, syncHighlightScroll functions are removed.

/** ─── Arrow-Key Nudge (Figma/Sketch standard) ──────────────────────── */
function nudgeSelected(arrowKey, step) {
  if (!fdCanvas) return;
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;

  try {
    const boundsJson = fdCanvas.get_node_bounds_json(selectedId);
    const b = JSON.parse(boundsJson);
    if (b.x === undefined) return;

    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    let dx = 0, dy = 0;

    switch (arrowKey) {
      case 'ArrowUp': dy = -step; break;
      case 'ArrowDown': dy = step; break;
      case 'ArrowLeft': dx = -step; break;
      case 'ArrowRight': dx = step; break;
    }

    // Use pointer sequence to move correctly through WASM
    fdCanvas.handle_pointer_down(cx, cy, 1.0, false, false, false, false);
    fdCanvas.handle_pointer_move(cx + dx, cy + dy, 1.0, false, false, false, false);
    const upResult = JSON.parse(fdCanvas.handle_pointer_up(cx + dx, cy + dy, false, false, false, false));
    if (upResult.changed) {
      renderDirty = true; uiDirty = true;
      syncCanvasToEditor();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
  } catch (_) { /* skip */ }
}

/** ─── Inline Text Editor (double-click to edit) ───────────────────── */
// Uses shared canvas-core/inline-edit.js module (same as VS Code extension).
// The shared module handles: dark/light theme, contrast-aware text color,
// shape-specific border radius, edge label editing, proper ESC/blur.
function setupInlineEditor(canvas) {
  const container = document.getElementById('canvas-content');
  coreSetupInlineEditor({
    fdCanvas: () => fdCanvas,
    canvasEl: canvas,
    container,
    renderFn: () => renderCanvas(),
    syncFn: () => syncCanvasToEditor(),
    updatePanelFn: () => { updatePropertiesPanel(); refreshLayersPanel(); },
    getPanX: () => panX,
    getPanY: () => panY,
    getZoom: () => zoomLevel,
    screenToScene,
  });
}

// ── Touch Gesture System + Apple Pencil Pro → extracted to touch.js ───────

async function initPlayground() {

    const layersApi = initLayersPanel({
      getFdCanvas: () => fdCanvas,
      markRenderDirty: () => { renderDirty = true; },
      getRenderDirty: () => renderDirty,
      ctxMenu: ctxMenu,
      copySelectedAsFd: copySelectedAsFd,
      cutSelectedAsFd: cutSelectedAsFd,
      pasteFromClipboard: pasteFromClipboard,
      renderCanvas: renderCanvas,
      syncCanvasToEditor: syncCanvasToEditor,
      updatePropertiesPanel: updatePropertiesPanel,
      showToast: showToast,
      toggleLayersPanel: toggleLayersPanel,
      updateFab: updateFab
    });
    refreshLayersPanel = layersApi.refreshLayersPanel;

  const editorMount = document.getElementById('fd-editor');
  const canvas = document.getElementById('fd-canvas');
  const wrapper = document.getElementById('canvas-wrapper');

  // ── (#1) Init panels BEFORE any await — pure DOM, no WASM needed ──────
  // This runs synchronously before the browser yields to fetch WASM,
  // so panels are correctly sized from the very first paint frame.
  initLeftPanel();
  initRightPanel();
  initSettingsPanel();
  initOnboarding();

  try {
    // Load WASM module

    // Timeout helper — prevents infinite hang if WASM fetch/init stalls
    const WASM_TIMEOUT_MS = 30000;
    const raceWithTimeout = (promise, ms, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        `${label} timed out after ${ms / 1000}s — check your network connection`
      )), ms)),
    ]);

    const t0 = performance.now();
    console.log('[FD] Fetching WASM module + binary…');

    // Start JS module import and WASM fetch in parallel
    const wasmFetchUrl = './wasm/fd_wasm_bg.wasm?v=0.11.296';
    const [wasm, wasmResponse] = await raceWithTimeout(Promise.all([
      import('./wasm/fd_wasm.js?v=0.11.296'),
      fetch(wasmFetchUrl),
    ]), WASM_TIMEOUT_MS, 'WASM fetch');

    if (!wasmResponse.ok) {
      throw new Error(`WASM fetch failed: HTTP ${wasmResponse.status} ${wasmResponse.statusText}`);
    }
    console.log(`[FD] WASM fetched (${Math.round(performance.now() - t0)}ms)`);

    // Streaming WASM instantiation (#5): pass the Response directly to wasm.default()
    // which calls WebAssembly.instantiateStreaming internally — the browser compiles
    // WASM while bytes are still arriving over the wire, saving 100-300ms.
    // For progress UI, read Content-Length from headers to show an estimate.
    const contentLength = +wasmResponse.headers.get('Content-Length') || 0;
    if (contentLength > 0) {
      await raceWithTimeout(
        wasm.default(wasmResponse),
        WASM_TIMEOUT_MS,
        'WASM streaming instantiation'
      );
    } else {
      // Fallback: no Content-Length (Cloudflare brotli/gzip strips it).
      // Still use streaming — pass Response directly.
      await raceWithTimeout(
        wasm.default(wasmResponse),
        WASM_TIMEOUT_MS,
        'WASM streaming instantiation'
      );
    }

    console.log(`[FD] Runtime initialized via streaming (${Math.round(performance.now() - t0)}ms)`);

    // Size the canvas
    const resizeCanvas = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const layersW = getLayersPanelWidth();
      const propsW = getRightPanelWidth();
      const canvasWidth = rect.width - layersW - propsW;
      const newW = Math.round(canvasWidth * dpr);
      const newH = Math.round(rect.height * dpr);
      // Only reassign if dimensions actually changed —
      // canvas.width = X clears the pixel buffer (HTML5 spec),
      // causing a 1-frame blank flash on every ResizeObserver tick.
      let bufferCleared = false;
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = rect.height + 'px';
        bufferCleared = true;
        uiDirty = true;
        if (fdCanvas) {
          fdCanvas.resize(canvasWidth, rect.height);
        }
      }
      // Repaint synchronously after resize — do NOT rely on renderDirty + RAF.
      // ResizeObserver fires after RAF in Chrome's rendering pipeline, so
      // canvas.width = X clears pixels AFTER the RAF has already rendered.
      // Without an immediate repaint here, the browser paints a blank canvas.
      if (bufferCleared) {
        renderCanvas();
        renderDirty = false; // prevent redundant double-render on next RAF
      }
    };

    resizeCanvas();

    // Create the FdCanvas instance
    console.log('[FD] Creating canvas…');
    const rect = wrapper.getBoundingClientRect();
    const canvasW = rect.width - getLayersPanelWidth();
    fdCanvas = new wasm.FdCanvas(canvasW, rect.height);
    // Canvas theme — honor localStorage preference
    fdCanvas.set_theme(isDark);
    wrapper.classList.toggle('dark-canvas', isDark);
    console.log('[FD] Parsing scene…');
    // Deep link: load ?code= param if present, else restore from localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    let initialFd = DEFAULT_FD;
    if (codeParam) {
      try {
        const decoded = LZString.decompressFromEncodedURIComponent(codeParam);
        if (decoded && decoded.trim().length > 0) initialFd = decoded;
      } catch (_) { /* invalid code param, use default */ }
    } else {
      // Restore last session from localStorage
      try {
        const saved = localStorage.getItem('fd-document');
        if (saved && saved.trim().length > 0) initialFd = saved;
      } catch (_) { /* localStorage unavailable */ }
    }
    fdCanvas.set_text(initialFd);
    console.log(`[FD] ✓ Ready (total ${Math.round(performance.now() - t0)}ms)`);
    // Hand tool is default on load — set grab cursor
    canvas.style.cursor = 'grab';

    // ── Create CodeMirror Editor ──────────────────────────────────────
    const fdLinter = linter((view) => {
      const linterBtn = document.getElementById('linter-status-btn');
      const linterText = document.getElementById('linter-status-text');
      
      if (!fdCanvas) {
        if (linterBtn && linterText) {
          linterBtn.className = 'code-status-pill status-valid';
          linterText.textContent = 'Valid';
          linterBtn.onclick = null;
        }
        return [];
      }
      
      const text = view.state.doc.toString();
      try {
        // Use the WASM diagnostics API
        const raw = fdCanvas.get_diagnostics_for_source(text);
        const diags = JSON.parse(raw);
        const mapped = diags.map(d => {
          const from = view.state.doc.line(Math.min(d.line + 1, view.state.doc.lines)).from + d.col;
          const to = Math.min(
            view.state.doc.line(Math.min(d.line + 1, view.state.doc.lines)).from + d.endCol,
            view.state.doc.line(Math.min(d.line + 1, view.state.doc.lines)).to
          );
          return {
            from: Math.min(from, view.state.doc.length),
            to: Math.min(to, view.state.doc.length),
            severity: 'error',
            message: d.message,
          };
        });
        
        // Update the Code Pane Header Pill
        if (linterBtn && linterText) {
          if (mapped.length === 0) {
            linterBtn.className = 'code-status-pill status-valid';
            linterBtn.title = 'No syntax errors';
            linterText.textContent = 'Valid';
            linterBtn.onclick = null;
          } else {
            linterBtn.className = 'code-status-pill status-error';
            linterBtn.title = 'Jump to first error';
            linterText.textContent = `${mapped.length} Error${mapped.length > 1 ? 's' : ''}`;
            linterBtn.onclick = () => {
              if (editorView && mapped.length > 0) {
                editorView.dispatch({
                  selection: { anchor: mapped[0].from },
                  scrollIntoView: true
                });
                editorView.focus();
              }
            };
          }
        }
        return mapped;
      } catch (err) {
        console.error('linter map error:', err);
        return [];
      }
    }, { delay: 300 });

    const fdCompletionSource = (context) => {
      if (!fdCanvas) return null;
      const pos = context.state.doc.lineAt(context.pos);
      const line = pos.number - 1; // 0-indexed
      const col = context.pos - pos.from;
      try {
        const raw = fdCanvas.get_completions(line, col);
        const items = JSON.parse(raw);
        if (!items.length) return null;
        // Find the word start for completion range
        const before = context.state.sliceDoc(pos.from, context.pos);
        const wordMatch = before.match(/[\w@#]*$/);
        const wordStart = context.pos - (wordMatch ? wordMatch[0].length : 0);
        return {
          from: wordStart,
          options: items.map(item => ({
            label: item.label,
            type: item.kind === 'keyword' ? 'keyword' :
              item.kind === 'property' ? 'property' : 'enum',
            detail: item.detail,
          })),
        };
      } catch { return null; }
    };

    const fdHoverTooltip = hoverTooltip((view, pos) => {
      if (!fdCanvas) return null;
      const line = view.state.doc.lineAt(pos);
      const lineNum = line.number - 1;
      const col = pos - line.from;
      try {
        const raw = fdCanvas.get_hover(lineNum, col);
        if (!raw) return null;
        const info = JSON.parse(raw);
        if (!info.content) return null;
        return {
          pos,
          above: true,
          create() {
            const dom = document.createElement('div');
            dom.className = 'cm-tooltip-hover';
            dom.textContent = info.content.replace(/\\n/g, '\n');
            return { dom };
          },
        };
      } catch { return null; }
    });

    const fdFoldService = foldService.of((state, lineStart, lineEnd) => {
      const startLine = state.doc.lineAt(lineStart);
      const strippedStart = startLine.text.replace(/#.*/g, '').replace(/"[^"]*"/g, '""');
      const openBrace = strippedStart.indexOf('{');
      if (openBrace === -1) return null;

      let depth = 0;
      let from = -1;
      for (let i = startLine.number; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const stripped = line.text.replace(/#.*/g, '').replace(/"[^"]*"/g, '""');
        const startCol = (i === startLine.number) ? openBrace : 0;
        
        for (let c = startCol; c < stripped.length; c++) {
          if (stripped[c] === '{') {
            if (depth === 0) from = line.from + c + 1;
            depth++;
          } else if (stripped[c] === '}') {
            depth--;
            if (depth === 0 && from !== -1) {
              return { from: from, to: line.from + c };
            }
          }
        }
      }
      return null;
    });

    editorView = new EditorView({
      state: EditorState.create({
        doc: initialFd,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          history(),
          highlightSelectionMatches(),
          fdLanguage,
          fdFoldService,
          foldGutter(),
          syntaxHighlighting(fdHighlightStyle),
          fdTheme,
          readOnlyCompartment.of(EditorState.readOnly.of(false)),
          lintGutter(),
          fdLinter,
          autocompletion({ override: [fdCompletionSource] }),
          fdHoverTooltip,
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            // ─── Code -> Canvas Implicit Cursor Sync ───
            if (update.selectionSet && update.userEvent === 'select.pointer') {
              const pos = update.state.selection.main.head;
              const lineInfo = update.state.doc.lineAt(pos);
              
              clearTimeout(window._cursorSyncTimer);
              window._cursorSyncTimer = setTimeout(() => {
                if (!fdCanvas) return;
                
                // Scan backward up to 30 lines to find block header
                const maxLines = Math.min(30, lineInfo.number);
                let foundBlockHeader = null;
                let foundId = null;
                
                for (let i = 0; i < maxLines; i++) {
                  const checkLine = update.state.doc.line(lineInfo.number - i).text;
                  const match = checkLine.match(/@([a-zA-Z_]\w*)\s*\{/);
                  if (match) {
                    foundBlockHeader = lineInfo.number - i;
                    foundId = match[1];
                    break;
                  }
                }
                
                if (foundId && foundBlockHeader) {
                  // Verify we are still inside the block's braces
                  let braceDepth = 1;
                  for (let i = foundBlockHeader; i < lineInfo.number; i++) {
                    const text = update.state.doc.line(i + 1).text;
                    braceDepth += (text.match(/\{/g) || []).length;
                    braceDepth -= (text.match(/\}/g) || []).length;
                    if (braceDepth <= 0) break;
                  }
                  
                  if (braceDepth > 0) {
                    const currentSelected = fdCanvas.get_selected_id();
                    if (currentSelected !== foundId) {
                      fdCanvas.select_by_id(foundId);
                      renderDirty = true; uiDirty = true; sceneDirty = true;
                      renderCanvas();
                      updatePropertiesPanel();
                    }
                  }
                }
              }, 100);
            }

            if (!update.docChanged || suppressSync) return;
            clearTimeout(editorDebounceTimer);
            editorDebounceTimer = setTimeout(() => {
              if (fdCanvas) {
                const text = update.state.doc.toString();
                const resultJson = fdCanvas.set_text(text);
                try {
                  const r = JSON.parse(resultJson);
                  // Always repaint — visual-only changes (fill, stroke, opacity)
                  // don't trigger layout_changed but still need a re-render.
                  if (r.ok) {
                    renderDirty = true; uiDirty = true; sceneDirty = true;
                  }
                } catch (_) {
                  renderDirty = true; uiDirty = true; sceneDirty = true;
                }
                // Persist to localStorage
                clearTimeout(_saveTimer);
                _saveTimer = setTimeout(() => {
                  try { localStorage.setItem('fd-document', text); } catch (_) {}
                }, 500);
              }
            }, 50);
          }),
        ],
      }),
      parent: editorMount,
    });

    setupPropsPanel();
    setupContextMenu();
    setupInlineEditor(canvas);

    // Full Screen toggle in settings dropdown
    document.getElementById('sm-fullscreen-toggle')?.addEventListener('click', toggleFullscreen);

    // Share button — open share modal with URL + QR code
    document.getElementById('share-link-btn')?.addEventListener('click', () => {
      if (!editorView) return;
      const text = editorView.state.doc.toString();
      const compressed = LZString.compressToEncodedURIComponent(text);
      const url = new URL(window.location.href);
      url.searchParams.set('code', compressed);
      if (fullscreenMode) url.searchParams.set('fullscreen', '');
      else url.searchParams.delete('fullscreen');
      const shareUrl = url.toString();

      const modal = document.getElementById('share-modal');
      const urlInput = document.getElementById('share-url-input');
      const copyBtn = document.getElementById('share-copy-btn');

      urlInput.value = shareUrl;
      modal.classList.add('visible');

      // Generate QR code on the canvas
      generateQR(document.getElementById('share-qr'), shareUrl);

      // Copy button
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
          copyBtn.textContent = '✓ Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(() => prompt('Copy this link:', shareUrl));
      };
    });
    // Close share modal
    document.getElementById('share-modal-close')?.addEventListener('click', () => {
      document.getElementById('share-modal')?.classList.remove('visible');
    });
    document.getElementById('share-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'share-modal') {
        document.getElementById('share-modal').classList.remove('visible');
      }
    });

    // ── Quick Color Picker ────────────────────────────────────────────
    const qcp = document.getElementById('quick-color-picker');
    if (qcp) {
      // Show QCP when node is selected (alongside or instead of FAB)
      const updateQCP = () => {
        if (!fdCanvas) { qcp.classList.remove('visible'); return; }
        const selectedId = fdCanvas.get_selected_id();
        if (!selectedId) { qcp.classList.remove('visible'); return; }
        try {
          const boundsJson = fdCanvas.get_node_bounds_json(selectedId);
          if (!boundsJson) { qcp.classList.remove('visible'); return; }
          const b = JSON.parse(boundsJson);
          if (!b.width) { qcp.classList.remove('visible'); return; }
          const screenX = b.x * zoomLevel + panX + (b.width * zoomLevel) / 2;
          const screenY = b.y * zoomLevel + panY - 40;
          const canvasRect = canvas.getBoundingClientRect();
          qcp.style.left = (canvasRect.left + screenX) + 'px';
          qcp.style.top = (canvasRect.top + screenY) + 'px';
          qcp.classList.add('visible');

          // Highlight active color
          const propsJson = fdCanvas.get_selected_node_props();
          if (propsJson) {
            const props = JSON.parse(propsJson);
            qcp.querySelectorAll('.qcp-dot').forEach(dot => {
              dot.classList.toggle('active',
                props.fill && dot.dataset.color.toLowerCase() === props.fill.toLowerCase());
            });
          }
        } catch (_) { qcp.classList.remove('visible'); }
      };

      // Click dot → apply fill
      qcp.addEventListener('click', (e) => {
        const dot = e.target.closest('.qcp-dot');
        if (!dot || !fdCanvas) return;
        const color = dot.dataset.color;
        fdCanvas.set_property('fill', color);
        renderDirty = true; renderCanvas();
        updateQCP();
      });
      // Right-click dot → apply stroke
      qcp.addEventListener('contextmenu', (e) => {
        const dot = e.target.closest('.qcp-dot');
        if (!dot || !fdCanvas) return;
        e.preventDefault();
        fdCanvas.set_property('strokeColor', dot.dataset.color);
        renderDirty = true; renderCanvas();
      });
      // Custom color
      document.getElementById('qcp-custom-input')?.addEventListener('input', (e) => {
        if (!fdCanvas) return;
        fdCanvas.set_property('fill', e.target.value);
        renderDirty = true; renderCanvas();
        updateQCP();
      });

      // Hook into render loop to update QCP position
      const origUpdateFab = updateFab;
      window._updateQCP = updateQCP;
    }

    // ── Image Drag-and-Drop ───────────────────────────────────────────
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const dropZone = document.getElementById('canvas-drop-zone');
    if (canvasWrapper && dropZone) {
      let dragCounter = 0;
      canvasWrapper.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (e.dataTransfer?.types?.includes('Files')) {
          dropZone.classList.add('visible');
        }
      });
      canvasWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        // Only set 'copy' for external file drops — not internal layer DnD (which uses 'move')
        if (e.dataTransfer?.types?.includes('Files')) {
          e.dataTransfer.dropEffect = 'copy';
        }
      });
      canvasWrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          dropZone.classList.remove('visible');
        }
      });
      canvasWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropZone.classList.remove('visible');
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          if (file.size > 2 * 1024 * 1024) {
            showToast('Image too large (max 2MB)');
            continue;
          }
          const reader = new FileReader();
          reader.onload = () => {
            insertImageFromDataURL(reader.result, e.offsetX, e.offsetY);
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // ── Presentation Mode → extracted to presentation.js ──────────────
    initPresentation({
      canvas,
      getFdCanvas: () => fdCanvas,
      getEditorView: () => editorView,
      showToast,
      toggleFullscreen,
      getZoomLevel: () => zoomLevel,
      setZoomLevel: (z) => { zoomLevel = z; },
      setPanX: (x) => { panX = x; },
      setPanY: (y) => { panY = y; },
      markRenderDirty: () => { renderDirty = true; },
      renderCanvas: () => renderCanvas(),
      urlParams,
    });

    // ── Panels already initialized before WASM (see top of initPlayground) ──

    // ── Mobile: auto-collapse both panels for canvas-first experience ──
    const isMobileViewport = window.innerWidth <= 768;
    if (isMobileViewport) {
      const lp = document.getElementById('left-panel');
      const rp = document.getElementById('right-panel');
      if (lp) lp.classList.add('collapsed');
      if (rp) rp.classList.add('collapsed');
      // CSS handles --left/right-panel-width: 0px via !important
    }

    // Wire sidebar (top-left) and hamburger (top-right) chrome toggles
    // On mobile, also manage the backdrop overlay
    const mobileBackdropEl = document.getElementById('mobile-layers-backdrop');

    document.getElementById('sidebar-toggle-btn')?.addEventListener('click', () => {
      toggleLeftPanel();
      // On mobile, show/hide backdrop when left panel is open
      if (window.innerWidth <= 768 && mobileBackdropEl) {
        const lp = document.getElementById('left-panel');
        const isOpen = document.documentElement.dataset.lp === 'open';
        mobileBackdropEl.classList.toggle('visible', isOpen);
      }
    });
    document.getElementById('hamburger-toggle-btn')?.addEventListener('click', () => {
      toggleRightPanel();
      // On mobile, show/hide backdrop when right panel is open
      if (window.innerWidth <= 768 && mobileBackdropEl) {
        const rp = document.getElementById('right-panel');
        const isOpen = document.documentElement.dataset.rp === 'open';
        mobileBackdropEl.classList.toggle('visible', isOpen);
      }
    });
    // Mobile backdrop click to collapse any open panel
    mobileBackdropEl?.addEventListener('click', () => {
      const lp = document.getElementById('left-panel');
      const rp = document.getElementById('right-panel');
      if (document.documentElement.dataset.lp === 'open') toggleLeftPanel();
      if (document.documentElement.dataset.rp === 'open') toggleRightPanel();
      mobileBackdropEl.classList.remove('visible');
    });

    // ── #3: Mobile panel close buttons (✕ inside tab bars) ──
    document.getElementById('lp-mobile-close')?.addEventListener('click', () => {
      toggleLeftPanel();
      mobileBackdropEl?.classList.remove('visible');
    });
    document.getElementById('rp-mobile-close')?.addEventListener('click', () => {
      toggleRightPanel();
      mobileBackdropEl?.classList.remove('visible');
    });

    // ── #2: Toolbar scroll indicator — remove gradient when scrolled to end ──
    const ftEl = document.getElementById('floating-toolbar');
    if (ftEl) {
      const updateScrollMask = () => {
        const atEnd = ftEl.scrollLeft + ftEl.clientWidth >= ftEl.scrollWidth - 4;
        ftEl.classList.toggle('scroll-end', atEnd);
      };
      ftEl.addEventListener('scroll', updateScrollMask, { passive: true });
      // Check initial state after layout
      requestAnimationFrame(updateScrollMask);
    }

    // ── #4: matchMedia observer — auto-collapse on viewport change ──
    const mobileMq = window.matchMedia('(max-width: 768px)');
    mobileMq.addEventListener('change', (e) => {
      if (e.matches) {
        // Entering mobile — collapse both panels
        const lp = document.getElementById('left-panel');
        const rp = document.getElementById('right-panel');
        if (document.documentElement.dataset.lp === 'open') toggleLeftPanel();
        if (document.documentElement.dataset.rp === 'open') toggleRightPanel();
        mobileBackdropEl?.classList.remove('visible');
      }
    });

    // ── Toolbar buttons ──────────────────────────────────────────────
    document.getElementById('ai-touch-btn')?.addEventListener('click', aiTouch);
    document.getElementById('renamify-btn')?.addEventListener('click', renamify);

    // ── AI Chat panel ────────────────────────────────────────────────
    initAiChat(
      () => editorView ? editorView.state.doc.toString() : '',
      (text) => {
        if (!editorView) return;
        editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: text } });
      },
      () => fdCanvas
    );
    // Clear chat button
    document.getElementById('ai-chat-clear')?.addEventListener('click', () => {
      clearChatHistory();
    });
    // Specs toggle now handled by sidebar dropdown (sd-specs-toggle)
    document.getElementById('specs-panel-close')?.addEventListener('click', toggleSpecsPanel);

    // Get canvas 2D context
    ctx = canvas.getContext('2d');

    // Render loop — only repaint when dirty flag is set
    const renderLoop = (time) => {
      if (renderDirty) {
        renderCanvas();
        renderDirty = false;
      }
      
      // Viewport minimap updates continuously at 60fps when panning or changing
      if (uiDirty) {
        renderMinimap(canvas);
      }

      // Layers + Props + Fab throttled to ~10fps
      if (uiDirty && time - minimapLastRender > MINIMAP_INTERVAL) {
        refreshLayersPanel();
        updatePropertiesPanel();
        updateFab(canvas);
        if (window._updateQCP) window._updateQCP();
        minimapLastRender = time;
        uiDirty = false;
      }
      animFrameId = requestAnimationFrame(renderLoop);
    };
    animFrameId = requestAnimationFrame(renderLoop);

    // Auto-center scene content in viewport on init (deferred for layout)
    // Defer fit-to-content — WASM layout resolve needs a frame to settle.
    setTimeout(() => {
      fitToContent(canvas);
      renderCanvas();
      refreshLayersPanel();
      renderMinimap(canvas);
      uiDirty = false; // first render done
    }, 100);



    // (#2) Double-rAF: wait TWO animation frames before enabling transitions.
    // Single rAF can fire in the same paint cycle as layout changes from panel init.
    // Double-rAF guarantees the browser has painted one full frame with the final
    // layout before transitions are re-enabled — bulletproof against race conditions.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('init-no-transition');
      });
    });

    // ── Canvas Theme Toggle (moved to settings gear dropdown) ─────────
    // Theme toggle is now handled by sm-theme-toggle in the gear dropdown



    // ── Panel Resize Setup ───────────────────────────────────────────
    setupPanelResize(wrapper, resizeCanvas);

    // ── Canvas Chrome Auto-Fade ─────────────────────────────────────
    // Fade export/settings buttons after 4s of idle — reclaim visual space
    {
      const chromeRight = document.getElementById('chrome-right');
      if (chromeRight) {
        let chromeIdleTimer = null;
        const CHROME_IDLE_MS = 4000;
        function startChromeIdle() {
          clearTimeout(chromeIdleTimer);
          chromeIdleTimer = setTimeout(() => {
            chromeRight.classList.add('chrome-idle');
          }, CHROME_IDLE_MS);
        }
        chromeRight.addEventListener('mouseenter', () => {
          clearTimeout(chromeIdleTimer);
          chromeRight.classList.remove('chrome-idle');
        });
        chromeRight.addEventListener('mouseleave', startChromeIdle);
        startChromeIdle(); // start timer on load
      }
    }

    // (initLeftPanel moved earlier — before WASM init)

    // ── Mobile Layers Drawer Toggle ──────────────────────────────────
    const mobileLayersToggle = document.getElementById('mobile-layers-toggle');
    const mobileLayersBackdrop = document.getElementById('mobile-layers-backdrop');
    const layersPanelEl = document.getElementById('layers-panel');

    function toggleMobileLayersDrawer() {
      if (!layersPanelEl) return;
      const isOpen = layersPanelEl.classList.toggle('mobile-open');
      mobileLayersBackdrop?.classList.toggle('visible', isOpen);
      mobileLayersToggle?.classList.toggle('active', isOpen);
    }
    function closeMobileLayersDrawer() {
      layersPanelEl?.classList.remove('mobile-open');
      mobileLayersBackdrop?.classList.remove('visible');
      mobileLayersToggle?.classList.remove('active');
    }

    mobileLayersToggle?.addEventListener('click', toggleMobileLayersDrawer);
    mobileLayersBackdrop?.addEventListener('click', closeMobileLayersDrawer);

    // ── (layers-collapse-btn removed — Layers is now a tab) ──

    // ── Specs Panel Resize ───────────────────────────────────────────
    setupSpecsResize();

    // ── (Right sidebar toggle removed — replaced by #right-panel tabs) ──

    // ── (Desktop editor-header toggle removed — code is now a right panel tab) ──

    // ── Mobile Code Editor Toggle (#4) ───────────────────────────────
    const mobileCodeToggle = document.getElementById('mobile-code-toggle');

    function toggleMobileCodeEditor() {
      switchLeftTab('code');
    }
    function closeMobileCodeEditor() {
      // No-op in new panel design
    }

    mobileCodeToggle?.addEventListener('click', toggleMobileCodeEditor);

    // Show close button only on mobile
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    function updateMobileUI(e) {
      // mobileCodeClose removed — code is now a right panel tab
      if (!e.matches) {
        closeMobileLayersDrawer();
        closeMobileCodeEditor();
      }
    }
    mobileQuery.addEventListener('change', updateMobileUI);
    updateMobileUI(mobileQuery); // init

    // ── #1: Debounced fitToContent on resize ─────────────────────────
    let fitDebounceTimer = null;
    const originalResizeCanvas = resizeCanvas;
    const resizeCanvasWithFit = () => {
      originalResizeCanvas();
      clearTimeout(fitDebounceTimer);
      fitDebounceTimer = setTimeout(() => {
        if (fdCanvas && window.matchMedia('(max-width: 768px)').matches) {
          fitToContent(canvas);
          renderCanvas();
        }
      }, 200);
    };
    // Patch: ResizeObserver will use the enhanced version
    // (the resizeObserver is set up later, but we store the enhanced fn)
    window.__fdResizeCanvasWithFit = resizeCanvasWithFit;

    // ── #5: FitToContent on orientation change ───────────────────────
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        resizeCanvas();
        fitToContent(canvas);
        renderCanvas();
      }, 300); // iOS needs time to settle new dimensions
    });

    // ── Layers→Canvas cross-drag ────────────────────────────────────
    // Accept drops from the Layers panel: reparent to root + move to drop position
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!fdCanvas) return;
      const nodeId = e.dataTransfer.getData('text/plain');
      if (!nodeId) return;

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
      const textBefore = fdCanvas.get_text();

      // Reparent to root if nested (this is a "take out of container" gesture)
      const parentId = fdCanvas.get_parent_id ? fdCanvas.get_parent_id(nodeId) : '';
      if (parentId) {
        fdCanvas.reparent_into(nodeId, 'root');
      }

      // Move node to drop position
      if (fdCanvas.set_node_position) {
        fdCanvas.set_node_position(nodeId, x, y);
      }

      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) {
        fdCanvas.push_undo_snapshot(textBefore, textAfter);
      }
      renderDirty = true; uiDirty = true;
      syncCanvasToEditor();
      updatePropertiesPanel();
      refreshLayersPanel();
      showToast(`Moved @${nodeId} to canvas`);
    });

    // ── Pointer Events ────────────────────────────────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      if (!fdCanvas) return;
      // Skip canvas interaction if inline editor is still active —
      // the blur→commit cycle will handle cleanup. This prevents
      // the dismissing click from also selecting/creating nodes.
      if (isInlineEditing()) return;
      e.preventDefault(); // prevent browser scroll/zoom on touch
      canvasDragOccurred = false; // reset drag tracking

      // Clear DTC state — the user clicked canvas directly, not dragging from toolbar.
      // Without this, both the WASM draw tool AND the DTC pointerup handler fire,
      // creating duplicate shapes (one from WASM + one from insertShapeAt).
      toolbarApi?.cancelDtc();

      // Update pointer type for adaptive hit radii + handle rendering
      fdCanvas.set_pointer_type(pointerTypeToU8(e.pointerType));

      // Clear pencil hover on contact
      pencilHover.active = false;

      // Track all active pointers for multi-touch
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Smart two-finger gesture disambiguation
      // Wait 50ms and check distance to avoid accidental triggers
      if (activePointers.size === 2) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

        // Reject if fingers too close (< 30px, likely accidental palm graze)
        // or if one pointer is a stylus (pencil + palm)
        if (dist < 30 || e.pointerType === 'pen') {
          return;
        }

        twoFingerPending = true;
        clearTimeout(twoFingerTimer);
        twoFingerTimer = setTimeout(() => {
          if (!twoFingerPending || activePointers.size !== 2) return;
          isTwoFingerGesture = true;
          const pts2 = [...activePointers.values()];
          pinchStartDist = Math.hypot(pts2[1].x - pts2[0].x, pts2[1].y - pts2[0].y);
          pinchStartZoom = zoomLevel;
          pinchMidStartX = (pts2[0].x + pts2[1].x) / 2;
          pinchMidStartY = (pts2[0].y + pts2[1].y) / 2;
          pinchPanStartX = panX;
          pinchPanStartY = panY;
          // Cancel any single-finger interaction in progress
          if (activePointerId !== -1) {
            panDragging = false;
            activePointerId = -1;
          }
        }, 50);
        return;
      }

      // Blur CodeMirror so keyboard shortcuts work on canvas
      editorView?.contentDOM.blur();

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);

      // Middle-click, Right-click, or Space+click → always pan
      if (e.button === 1 || e.button === 2 || isPanning) {
        panDragging = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        canvas.style.cursor = 'grabbing';
        activePointerId = e.pointerId;
        return;
      }

      // Hand tool: check modifier keys before defaulting to pan
      // Apple Pencil always falls through to Select (WASM) regardless of modifiers
      if (fdCanvas.get_tool_name() === 'hand' && e.pointerType !== 'pen') {
        canvas.classList.remove('modifier-cmd', 'modifier-alt', 'modifier-cmd-select');
        const isAltHand = e.altKey;
        const isCmdHand = e.metaKey && !e.ctrlKey;

        // Alt on Hand → temp Select for clone+drag (duplicate)
        if (isAltHand && !isCmdHand) {
          handTempSelectActive = true;
          handTempSelectOriginalTool = 'hand';
          handAltCloneActive = true;
          fdCanvas.set_tool('select');
          canvas.style.cursor = 'copy';
          // Fall through to normal pointer handling below
        }
        // Cmd on Hand → temp Select for move/select/reparent
        else if (isCmdHand && !isAltHand) {
          handTempSelectActive = true;
          handTempSelectOriginalTool = 'hand';
          handAltCloneActive = false;
          fdCanvas.set_tool('select');
          canvas.style.cursor = 'default';
          // Fall through to normal pointer handling below
        }
        // No modifier → pan as usual
        else {
          panDragging = true;
          panStartX = e.clientX - panX;
          panStartY = e.clientY - panY;
          handPanClientStartX = e.clientX;
          handPanClientStartY = e.clientY;
          canvas.style.cursor = 'grabbing';
          activePointerId = e.pointerId;
          return;
        }
      }

      // ⌘+drag on drawing tools → pan (consistent with Select tool behavior)
      // Hand tool has its own ⌘ handler above (temp Select).
      // Select tool handles ⌘ in WASM (pan via marquee bypass).
      // All other tools: ⌘ = pan, matching industry standard (Figma/Sketch).
      {
        const toolName = fdCanvas.get_tool_name();
        const isDrawTool = toolName !== 'hand' && toolName !== 'select'
          && toolName !== 'lasso' && toolName !== 'eraser';
        const isCmdHeld = e.metaKey || (e.ctrlKey && !e.metaKey);
        if (isDrawTool && isCmdHeld && !e.altKey) {
          panDragging = true;
          panStartX = e.clientX - panX;
          panStartY = e.clientY - panY;
          canvas.style.cursor = 'grabbing';
          activePointerId = e.pointerId;
          return;
        }
      }

      // Hide FAB during draw gestures (not during move — FAB tracks via render loop)
      if (fdCanvas.get_tool_name() !== 'select') {
        document.getElementById('floating-action-bar')?.classList.remove('visible');
      }

      // ── JS-only Lasso select ──
      const currentTool = fdCanvas.get_tool_name();
      if (currentTool === 'lasso') {
        lassoPoints = [{ x, y }];
        lassoActive = true;
        activePointerId = e.pointerId;
        canvas.style.cursor = 'crosshair';
        renderDirty = true;
        return;
      }
      // ── JS-only Eraser marquee ──
      if (currentTool === 'eraser') {
        eraserMarquee = { startX: x, startY: y, endX: x, endY: y };
        eraserActive = true;
        activePointerId = e.pointerId;
        canvas.style.cursor = 'crosshair';
        renderDirty = true;
        return;
      }

      const changed = fdCanvas.handle_pointer_down(
        x, y, e.pressure || 1.0,
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      activePointerId = e.pointerId;
      if (changed) { renderDirty = true; uiDirty = true; }

      // Touch contact halo — visual feedback for finger taps (iPad)
      if (e.pointerType === 'touch') {
        touchHalo = { active: true, x: e.clientX, y: e.clientY, sceneX: x, sceneY: y, startTime: performance.now(), targetBounds: null };
        // Get target node bounds for highlight
        try {
          const hitJson = fdCanvas.hit_test_at(x, y);
          if (hitJson) {
            const hit = JSON.parse(hitJson);
            if (hit.id) {
              const boundsJson = fdCanvas.get_node_bounds_json(hit.id);
              if (boundsJson) touchHalo.targetBounds = JSON.parse(boundsJson);
            }
          }
        } catch (_) { /* hit_test_at may not exist yet */ }
        renderDirty = true;
      }
    });

    document.addEventListener('pointermove', (e) => {
      if (!fdCanvas) return;

      // Update tracked pointer position
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Two-finger gesture: pan + pinch-to-zoom
      if (isTwoFingerGesture && activePointers.size === 2) {
        const pts = [...activePointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;

        // Pinch zoom — anchor at current finger midpoint (not initial)
        const scale = dist / pinchStartDist;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartZoom * scale));

        // Zoom at current midpoint + pan follows finger movement
        const canvasRect = canvas.getBoundingClientRect();
        const cmx = midX - canvasRect.left;
        const cmy = midY - canvasRect.top;
        const oldZoom = zoomLevel;
        panX = cmx - (cmx - panX) * (newZoom / oldZoom);
        panY = cmy - (cmy - panY) * (newZoom / oldZoom);
        zoomLevel = newZoom;
        updateZoomIndicator();
        renderDirty = true; uiDirty = true;
        return;
      }

      // Only process our owned pointer or hover over canvas
      if (activePointerId !== -1 && e.pointerId !== activePointerId) return;
      if (activePointerId === -1 && e.target !== canvas) return;

      // Pan drag
      if (panDragging) {
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        renderDirty = true; uiDirty = true;
        return;
      }

      // ── Lasso pointermove — add points to path ──
      if (lassoActive && activePointerId !== -1) {
        const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
        // Subsample: only add if moved >3px from last point
        const last = lassoPoints[lassoPoints.length - 1];
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist > 3 / zoomLevel) {
          lassoPoints.push({ x, y });
          renderDirty = true;
        }
        return;
      }

      // ── Eraser marquee pointermove — update rectangle ──
      if (eraserActive && activePointerId !== -1) {
        const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
        eraserMarquee.endX = x;
        eraserMarquee.endY = y;
        renderDirty = true;
        return;
      }

      // Apple Pencil hover preview — detect pen hovering above screen
      // iPadOS 16.1+ sends pointermove with pointerType='pen', buttons=0, pressure=0
      if (e.pointerType === 'pen' && e.buttons === 0 && activePointerId === -1) {
        fdCanvas.set_pointer_type(2); // pen
        const { x: hx, y: hy } = screenToScene(e.clientX, e.clientY, canvas);
        pencilHover.active = true;
        pencilHover.sceneX = hx;
        pencilHover.sceneY = hy;
        pencilHover.screenX = e.clientX;
        pencilHover.screenY = e.clientY;
        // Visual mode indicator: pencil shows default cursor on Hand tool (select mode)
        if (fdCanvas.get_tool_name() === 'hand') {
          canvas.style.cursor = 'default';
        }
        // Check what's under the pencil for hover highlight
        try {
          const hitJson = fdCanvas.hit_test_at(hx, hy);
          pencilHover.nodeId = hitJson ? JSON.parse(hitJson).id || null : null;
          // Hand+Pen over a node → show move cursor (indicates select behavior)
          if (pencilHover.nodeId && fdCanvas.get_tool_name() === 'hand') {
            canvas.style.cursor = 'move';
          }
        } catch (_) { pencilHover.nodeId = null; }
        renderDirty = true;
        return;
      }

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
      const moveResultJson = fdCanvas.handle_pointer_move(
        x, y, e.pressure || 1.0,
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      const moveResult = JSON.parse(moveResultJson);
      if (moveResult.changed) {
        renderDirty = true; uiDirty = true;
        // Only track as a canvas drag (for post-drop reparent menu) when using
        // Select or Hand tool. Draw tools (rect/ellipse/pen/text/frame/arrow)
        // should NOT trigger the post-drop reparent context menu — their
        // gestures are shape creation, not shape movement.
        const activeTool = fdCanvas.get_tool_name();
        if (activeTool === 'select' || activeTool === 'hand') {
          canvasDragOccurred = true;
        }
      } else if (activePointerId === -1) {
        // Hover (no button held): show resize cursor on handles
        const activeTool = fdCanvas.get_tool_name();
        if (activeTool === 'select') {
          const cursor = coreGetResizeHandleCursor(fdCanvas, x, y);
          if (cursor) { canvas.style.cursor = cursor; }
          else { canvas.style.cursor = ''; }
        }
      }

      // ── Canvas→Layers cross-drag: highlight layer items when pointer enters Layers panel ──
      if (canvasDragOccurred && activePointerId !== -1) {
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId) {
          const layersPanel = document.getElementById('layers-panel');
          const panelRect = layersPanel?.getBoundingClientRect();
          const overLayers = panelRect && e.clientX >= panelRect.left && e.clientX <= panelRect.right
            && e.clientY >= panelRect.top && e.clientY <= panelRect.bottom;

          if (overLayers) {
            // Find layer item under cursor
            const elUnder = document.elementFromPoint(e.clientX, e.clientY);
            const layerItem = elUnder?.closest('.layer-item');

            // Clear previous indicators
            if (layersPanel) clearLayerDragIndicators(layersPanel);

            if (layerItem) {
              const targetId = layerItem.getAttribute('data-node-id');
              if (targetId && targetId !== selectedId) {
                const zone = getDropZone(e, layerItem);
                const kind = layerItem.getAttribute('data-node-kind');
                const isContainer = ['rect','ellipse','frame','group'].includes(kind);
                if (zone === 'nest' && isContainer) {
                  layerItem.classList.add('drag-over-nest');
                } else if (zone === 'above') {
                  layerItem.classList.add('drag-over-above');
                } else {
                  layerItem.classList.add('drag-over-below');
                }
              }
            } else if (elUnder?.closest('.layers-body')) {
              // Over empty space → drop-to-root indicator
              const body = layersPanel.querySelector('.layers-body');
              if (body) body.classList.add('drag-over-root');
            }

            // Show ghost label
            let ghost = document.getElementById('canvas-drag-ghost');
            if (!ghost) {
              ghost = document.createElement('div');
              ghost.id = 'canvas-drag-ghost';
              ghost.style.cssText = 'position:fixed;z-index:300;pointer-events:none;' +
                'padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;' +
                'font-family:var(--mono);color:var(--fd-accent,#007AFF);' +
                'background:var(--fd-surface-solid,#1C1C1E);' +
                'border:1px solid var(--fd-accent,#007AFF);' +
                'box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;';
              document.body.appendChild(ghost);
            }
            ghost.textContent = `@${selectedId}`;
            ghost.style.left = (e.clientX + 12) + 'px';
            ghost.style.top = (e.clientY - 8) + 'px';
            ghost.style.display = 'block';
          } else {
            // Pointer left the Layers panel — clean up
            const layersPanel2 = document.getElementById('layers-panel');
            if (layersPanel2) clearLayerDragIndicators(layersPanel2);
            const ghost = document.getElementById('canvas-drag-ghost');
            if (ghost) ghost.style.display = 'none';
          }
        }
      }

      // Dimension tooltip — show W×H during drag (using bundled bounds)
      if (activePointerId !== -1 && moveResult.bounds) {
        const b = moveResult.bounds;
        if (b.w > 0 && b.h > 0) {
          const tip = document.getElementById('dimension-tooltip');
          if (tip) {
            tip.textContent = `${Math.round(b.w)} × ${Math.round(b.h)}`;
            const sx = b.x * zoomLevel + panX + (b.w * zoomLevel) / 2;
            const sy = (b.y + b.h) * zoomLevel + panY + 16;
            const wrapRect = document.getElementById('canvas-wrapper').getBoundingClientRect();
            tip.style.left = (sx - wrapRect.left + canvas.offsetLeft) + 'px';
            tip.style.top = sy + 'px';
            tip.style.display = 'block';
            tip.style.transform = 'translateX(-50%)';
          }
        }
      }
    });

    document.addEventListener('pointerup', (e) => {
      if (!fdCanvas) return;

      // Clean up tracked pointer
      activePointers.delete(e.pointerId);

      // End two-finger gesture
      if (isTwoFingerGesture || twoFingerPending) {
        twoFingerPending = false;
        clearTimeout(twoFingerTimer);
        if (activePointers.size < 2) {
          isTwoFingerGesture = false;
          // Reset single-finger state so next touch starts clean
          activePointerId = -1;
        }
        return;
      }

      if (activePointerId === -1) return;
      if (e.pointerId !== activePointerId) return;
      activePointerId = -1;

      // ── Lasso pointerup — select enclosed nodes ──
      if (lassoActive) {
        lassoActive = false;
        if (lassoPoints.length > 4) {
          const allNodes = getAllNodeBounds();
          const selectedIds = [];
          for (const node of allNodes) {
            if (rectInsidePolygon(node, lassoPoints)) {
              selectedIds.push(node.id);
            }
          }
          if (selectedIds.length > 0 && fdCanvas.select_multiple_by_ids) {
            fdCanvas.select_multiple_by_ids(JSON.stringify(selectedIds));
            showToast(`Selected ${selectedIds.length} node${selectedIds.length > 1 ? 's' : ''}`);
          } else if (selectedIds.length === 1) {
            fdCanvas.select_by_id(selectedIds[0]);
            showToast('Selected 1 node');
          } else {
            showToast('No nodes enclosed');
          }
          renderDirty = true; uiDirty = true;
          renderCanvas();
          refreshLayersPanel();
        }
        lassoPoints = [];
        // Switch to select tool after lasso
        fdCanvas.set_tool('select');
        updateToolbar('select');
        canvas.style.cursor = '';
        return;
      }

      // ── Eraser marquee pointerup — delete enclosed nodes ──
      if (eraserActive) {
        eraserActive = false;
        if (eraserMarquee) {
          const allNodes = getAllNodeBounds();
          const enclosedIds = [];
          for (const node of allNodes) {
            if (rectInsideRect(node, eraserMarquee)) {
              enclosedIds.push(node.id);
            }
          }
          if (enclosedIds.length > 0 && editorView) {
            const textBefore = fdCanvas.get_text();
            // Remove each enclosed node's FD block from the text
            let text = textBefore;
            for (const id of enclosedIds) {
              // Match the full block: type @id ... { ... }
              const blockRegex = new RegExp(`\\n?(?:rect|ellipse|text|frame|group|edge|path|image)\\s+@${id}\\s+(?:"[^"]*"\\s*)?\\{[^}]*\\}\\s*`, 'g');
              text = text.replace(blockRegex, '\n');
            }
            text = text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
            editorView.dispatch({
              changes: { from: 0, to: editorView.state.doc.length, insert: text },
            });
            suppressSync = true;
            fdCanvas.set_text(text);
            suppressSync = false;
            if (textBefore !== text) {
              fdCanvas.push_undo_snapshot(textBefore, text);
            }
            showToast(`Erased ${enclosedIds.length} node${enclosedIds.length > 1 ? 's' : ''}`);
            renderDirty = true; uiDirty = true;
            renderCanvas();
            refreshLayersPanel();
          } else {
            showToast('No nodes in eraser area');
          }
        }
        eraserMarquee = null;
        return;
      }

      // End pan drag
      // Clear touch halo on pointer up
      touchHalo.active = false;

      if (panDragging) {
        panDragging = false;
        handPanClientStartX = null;
        handPanClientStartY = null;
        canvas.style.cursor = (isPanning || fdCanvas.get_tool_name() === 'hand') ? 'grab' : '';
        return;
      }

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);

      // ── Post-drop reparent context menu ──
      // After a move gesture, check if the selected node overlaps a container.
      // If so, offer "Nest into @target" via a small context menu (explicit, no modifiers).
      const wasDragging = canvasDragOccurred;
      canvasDragOccurred = false;

      // Clean up ghost label
      const ghost = document.getElementById('canvas-drag-ghost');
      if (ghost) ghost.style.display = 'none';

      // ── Canvas→Layers cross-drop ──
      // If pointer is released over the Layers panel, reparent/reorder like Layers drag-drop.
      let canvasToLayersDone = false;
      if (wasDragging) {
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId) {
          const layersPanel = document.getElementById('layers-panel');
          const panelRect = layersPanel?.getBoundingClientRect();
          const overLayers = panelRect && e.clientX >= panelRect.left && e.clientX <= panelRect.right
            && e.clientY >= panelRect.top && e.clientY <= panelRect.bottom;

          if (overLayers && layersPanel) {
            clearLayerDragIndicators(layersPanel);
            const elUnder = document.elementFromPoint(e.clientX, e.clientY);
            const layerItem = elUnder?.closest('.layer-item');
            const textBefore = fdCanvas.get_text();
            let changed = false;

            if (layerItem) {
              const targetId = layerItem.getAttribute('data-node-id');
              if (targetId && targetId !== selectedId) {
                const zone = getDropZone(e, layerItem);
                const kind = layerItem.getAttribute('data-node-kind');
                const isContainer = ['rect','ellipse','frame','group'].includes(kind);

                if (zone === 'nest' && isContainer) {
                  changed = fdCanvas.reparent_into(selectedId, targetId);
                } else {
                  // Reorder — same logic as wireLayerDragDrop
                  const targetIndex = getSiblingIndex(layersPanel, targetId);
                  const insertIndex = zone === 'above' ? targetIndex : targetIndex + 1;
                  const targetItem = layersPanel.querySelector(`.layer-item[data-node-id="${targetId}"]`);
                  const dragItem = layersPanel.querySelector(`.layer-item[data-node-id="${selectedId}"]`);
                  const targetParent = targetItem?.parentElement?.getAttribute?.('data-parent-id');
                  const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id');
                  if (targetParent && dragParent && targetParent === dragParent) {
                    changed = fdCanvas.reorder_child(selectedId, insertIndex);
                  } else if (targetParent) {
                    changed = fdCanvas.reparent_into(selectedId, targetParent);
                    if (changed) fdCanvas.reorder_child(selectedId, insertIndex);
                  } else {
                    changed = fdCanvas.reparent_into(selectedId, 'root');
                    if (changed) fdCanvas.reorder_child(selectedId, insertIndex);
                  }
                }
              }
            } else if (elUnder?.closest('.layers-body')) {
              // Drop on empty space → move to root
              const parentId = fdCanvas.get_parent_id ? fdCanvas.get_parent_id(selectedId) : '';
              if (parentId) {
                changed = fdCanvas.reparent_into(selectedId, 'root');
              }
            }

            if (changed) {
              const textAfter = fdCanvas.get_text();
              if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
              renderDirty = true; uiDirty = true;
              syncCanvasToEditor();
              updatePropertiesPanel();
              refreshLayersPanel();
              showToast(`Moved @${selectedId}`);
              canvasToLayersDone = true;
            }
          }
        }
      }

      // ── Post-drop reparent context menu ──
      // After a move gesture on canvas (not dropped on Layers), check if node overlaps a container.
      if (wasDragging && !canvasToLayersDone && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId && fdCanvas.hit_test_at_excluding) {
          try {
            const hitId = fdCanvas.hit_test_at_excluding(x, y, selectedId);
            if (hitId && hitId !== selectedId) {
              // Only offer for containers (rect, ellipse, frame, group)
              const containerKinds = ['rect', 'ellipse', 'frame', 'group'];
              const hitKind = fdCanvas.get_node_kind ? fdCanvas.get_node_kind(hitId) : '';
              if (containerKinds.includes(hitKind)) {
                // Check the node isn't already a child of the target
                const parentId = fdCanvas.get_parent_id ? fdCanvas.get_parent_id(selectedId) : '';
                if (parentId !== hitId) {
                  const textBefore = fdCanvas.get_text();
                  ctxMenu.open({
                    items: [
                      { type: 'action', icon: '📦', label: `Nest into @${hitId}`, action: 'nest' },
                      { type: 'action', icon: '⊙', label: `Center in @${hitId}`, action: 'center-nest' },
                    ],
                    x: e.clientX,
                    y: e.clientY,
                    onAction: (action) => {
                      let changed = false;
                      if (action === 'nest') {
                        changed = fdCanvas.reparent_into(selectedId, hitId);
                      } else if (action === 'center-nest') {
                        changed = fdCanvas.reparent_into_centered
                          ? fdCanvas.reparent_into_centered(selectedId, hitId)
                          : fdCanvas.reparent_into(selectedId, hitId);
                      }
                      if (changed) {
                        const textAfter = fdCanvas.get_text();
                        if (textBefore !== textAfter) {
                          fdCanvas.push_undo_snapshot(textBefore, textAfter);
                        }
                        renderDirty = true; uiDirty = true;
                        syncCanvasToEditor();
                        updatePropertiesPanel();
                        refreshLayersPanel();
                        showToast(`Nested into @${hitId}`);
                      }
                    },
                  });
                }
              }
            }
          } catch (_) { /* hit_test_at_excluding or get_node_kind may not exist */ }
        }
      }

      const resultJson = fdCanvas.handle_pointer_up(
        x, y, e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      const result = JSON.parse(resultJson);

      if (result.changed || result.toolSwitched) {
        renderDirty = true; uiDirty = true;
        syncCanvasToEditor();
        updatePropertiesPanel();
        refreshLayersPanel();
      }

      // Apply smart defaults to newly created shapes
      if (result.toolSwitched && result.changed) {
        const newId = fdCanvas.get_selected_id();
        if (newId) {
          try {
            if (smartDefaults.fill) fdCanvas.set_node_prop('fill', smartDefaults.fill);
            if (smartDefaults.stroke) fdCanvas.set_node_prop('stroke', smartDefaults.stroke);
            if (smartDefaults.strokeWidth) fdCanvas.set_node_prop('strokeWidth', String(smartDefaults.strokeWidth));
            if (smartDefaults.opacity != null && smartDefaults.opacity < 1) fdCanvas.set_node_prop('opacity', String(smartDefaults.opacity));
            renderDirty = true;
            syncCanvasToEditor();
          } catch (_) { /* prop not settable */ }
        }
      }

      // Auto-switch toolbar after drawing gesture
      if (result.toolSwitched) {
        // Honor locked tool — re-activate instead of switching to Select
        if (lockedTool) {
          fdCanvas.set_tool(lockedTool);
          updateToolbar(lockedTool);
          canvas.style.cursor = lockedTool === 'hand' ? 'grab' : (lockedTool === 'select' || lockedTool === 'eraser') ? '' : 'crosshair';
        } else {
          updateToolbar(result.tool);
          canvas.style.cursor = '';
        }
      }

      // Restore Hand tool after modifier-key temp Select
      if (handTempSelectActive && handTempSelectOriginalTool) {
        fdCanvas.set_tool(handTempSelectOriginalTool);
        updateToolbar(handTempSelectOriginalTool);
        canvas.style.cursor = 'grab';
      }
      handTempSelectActive = false;
      handTempSelectOriginalTool = null;
      handAltCloneActive = false;

      // Re-apply modifier cursors if modifier keys still held after pointer-up
      // (Hand tool: ⌘ → select cursor, Alt → copy cursor; other tools: ⌘ → grab)
      if (fdCanvas.get_tool_name() === 'hand') {
        if (e.metaKey && !e.altKey) {
          canvas.classList.add('modifier-cmd-select');
        } else if (e.altKey && !e.metaKey) {
          canvas.classList.add('modifier-alt');
        }
      }

      // Show FAB + Props if node selected
      updateFab(canvas);
      updatePropertiesPanel();

      // Hide dimension tooltip
      const tip = document.getElementById('dimension-tooltip');
      if (tip) tip.style.display = 'none';
    });

    // Clean up on pointer cancel (mobile: app switch, incoming call, etc.)
    document.addEventListener('pointercancel', (e) => {
      activePointers.delete(e.pointerId);
      if ((isTwoFingerGesture || twoFingerPending) && activePointers.size < 2) {
        isTwoFingerGesture = false;
        twoFingerPending = false;
        clearTimeout(twoFingerTimer);
      }
      if (e.pointerId === activePointerId) {
        activePointerId = -1;
        panDragging = false;
        canvas.style.cursor = '';
      }
    });

    // ── Wheel → Pan / Zoom ────────────────────────────────────────────
    /** Zoom by a multiplier, anchored at a screen-space point (mx, my). */
    function zoomAtPoint(mx, my, factor) {
      const oldZoom = zoomLevel;
      zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * factor));
      panX = mx - (mx - panX) * (zoomLevel / oldZoom);
      panY = my - (my - panY) * (zoomLevel / oldZoom);
      updateZoomIndicator();
      renderDirty = true; uiDirty = true;
    }

    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom on trackpad or Ctrl+scroll: always preventDefault
        e.preventDefault();
        const canvasRect = canvas.getBoundingClientRect();
        const mx = e.clientX - canvasRect.left;
        const my = e.clientY - canvasRect.top;
        const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
        zoomAtPoint(mx, my, factor);
      } else {
        // Two-finger scroll → pan
        // Allow native macOS trackpad momentum events to flow through
        // by not calling preventDefault() for non-zoom scroll
        e.preventDefault();
        panX -= e.deltaX;
        panY -= e.deltaY;
        renderDirty = true; uiDirty = true;
      }
    }, { passive: false });

    // ── Touch Gestures (inertia, 3-finger undo/redo, long-press, pencil) ──
    const touchApi = {
      getFdCanvas: () => fdCanvas,
      markRenderDirty: () => renderDirty = true,
      markUiDirty: () => uiDirty = true,
      syncCanvasToEditor,
      showToast,
      copySelectedAsFd,
      cutSelectedAsFd,
      pasteFromClipboard,
      updateToolbar,
      updateZoomIndicator,
      toggleFullscreen,
      fitToContent: (c) => fitToContent(c),
      getZoomLevel: () => zoomLevel,
      setZoomLevel: (z) => { zoomLevel = z; },
      getPanX: () => panX,
      getPanY: () => panY,
      setPanX: (x) => { panX = x; },
      setPanY: (y) => { panY = y; },
      getZoomMin: () => ZOOM_MIN,
      getZoomMax: () => ZOOM_MAX,
      getReduceMotion: () => reduceMotion,
    };
    setupTouchGesturesModule(canvas, touchApi);

    // ── Apple Pencil Pro squeeze detection ──
    setupApplePencilProModule(canvas, { getFdCanvas: () => fdCanvas, updateToolbar });

    // ── Tool Toolbar (floating) ────────────────────────────────────
    toolbarApi = initToolbar({
      canvas: canvas,
      getFdCanvas: () => fdCanvas,
      getEditorView: () => editorView,
      getPanX: () => panX,
      getPanY: () => panY,
      getZoomLevel: () => zoomLevel,
      getSmartDefaults: () => smartDefaults,
      getLockedTool: () => lockedTool,
      setLockedTool: (t) => { lockedTool = t; },
      getLastToolBtnTime: () => lastToolBtnTime,
      setLastToolBtnTime: (t) => { lastToolBtnTime = t; },
      getLastToolBtnName: () => lastToolBtnName,
      setLastToolBtnName: (n) => { lastToolBtnName = n; },
      setDtcPreview: (p) => { dtcPreview = p; },
      markRenderDirty: () => { renderDirty = true; },
      markUiDirty: () => { uiDirty = true; },
      renderCanvas: () => renderCanvas(),
      syncCanvasToEditor: syncCanvasToEditor,
      refreshLayersPanel: refreshLayersPanel,
      updateToolbar: updateToolbar,
      showToast: showToast,
      toggleLeftPanel: toggleLeftPanel,
      toggleRightPanel: toggleRightPanel,
      adjustMinimapForToolbar: adjustMinimapForToolbar,
      screenToScene: screenToScene,
      focusOnNode: focusOnNode
    });

    // ── Floating Action Bar ─────────────────────────────────────────
    document.getElementById('fab-fill')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('fill', e.target.value);
      smartDefaults.fill = e.target.value;
      try { localStorage.setItem('fd-smart-defaults', JSON.stringify(smartDefaults)); } catch (_) {}
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-stroke')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('strokeColor', e.target.value);
      smartDefaults.stroke = e.target.value;
      try { localStorage.setItem('fd-smart-defaults', JSON.stringify(smartDefaults)); } catch (_) {}
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-stroke-w')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('strokeWidth', e.target.value);
      smartDefaults.strokeWidth = parseFloat(e.target.value) || 2.5;
      try { localStorage.setItem('fd-smart-defaults', JSON.stringify(smartDefaults)); } catch (_) {}
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-opacity')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('opacity', e.target.value);
      smartDefaults.opacity = parseFloat(e.target.value);
      try { localStorage.setItem('fd-smart-defaults', JSON.stringify(smartDefaults)); } catch (_) {}
      const valEl = document.getElementById('fab-opacity-val');
      if (valEl) valEl.textContent = Math.round(parseFloat(e.target.value) * 100) + '%';
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-delete')?.addEventListener('click', () => {
      if (!fdCanvas) return;
      fdCanvas.handle_key('Backspace', false, false, false, false);
      renderCanvas();
      syncCanvasToEditor();
      document.getElementById('floating-action-bar')?.classList.remove('visible');
    });

    // ── Keyboard Shortcuts ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (!fdCanvas) return;
      const isInputFocused = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
      const isEditingInput = (editorView?.hasFocus ?? false) || isInputFocused || coreInlineEditorActive;

      // Space → pan mode
      if (e.code === 'Space' && !e.repeat && !isEditingInput) {
        isPanning = true;
        canvas.style.cursor = 'grab';
        // Highlight Hand button in toolbar
        document.querySelector('.ft-tool-btn[data-tool="hand"]')?.classList.add('pan-active');
        e.preventDefault();
        return;
      }

      // Tool-aware modifier cursors:
      // Hand+Cmd → default/pointer (select preview), other+Cmd → grab (pan preview)
      // Alt → copy cursor on all tools
      if (e.key === 'Meta') {
        canvas.classList.remove('modifier-cmd', 'modifier-alt', 'modifier-cmd-select');
        if (fdCanvas && fdCanvas.get_tool_name() === 'hand') {
          canvas.classList.add('modifier-cmd-select'); // default cursor for select preview
        } else {
          canvas.classList.add('modifier-cmd'); // grab cursor for pan preview
        }
      }
      if (e.key === 'Alt') {
        canvas.classList.remove('modifier-cmd', 'modifier-alt', 'modifier-cmd-select');
        canvas.classList.add('modifier-alt');
      }
      // Insert menu toggle (⌘/ or Ctrl+/)
      if ((e.metaKey || e.ctrlKey) && e.key === '/' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const imBtn = document.getElementById('insert-btn');
        if (imBtn) imBtn.click();
        return;
      }

      // Grid toggle (G key)
      if (!isEditingInput && e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        gridEnabled = !gridEnabled;
        renderCanvas();
        e.preventDefault();
        return;
      }

      // Reduce Motion toggle (Shift+M)
      if (!isEditingInput && e.key === 'M' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const manual = localStorage.getItem('fd-reduce-motion') === 'true';
        localStorage.setItem('fd-reduce-motion', manual ? 'false' : 'true');
        reduceMotion = !manual || prefersReducedMotion.matches;
        document.body.classList.toggle('reduce-motion', !manual);
        showToast(reduceMotion ? 'Reduce Motion: ON' : 'Reduce Motion: OFF');
        e.preventDefault();
        return;
      }

      // Tool shortcuts (only when canvas focused)
      if (!isEditingInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const toolMap = { v:'select', r:'rect', o:'ellipse', t:'text', a:'arrow', p:'pen', e:'eraser', f:'frame', h:'hand' };
        const tool = toolMap[e.key.toLowerCase()];
        if (tool) {
          const now = performance.now();
          // Double-press = lock tool (sticky mode)
          if (tool === lastToolKeyName && now - lastToolKeyTime < 300) {
            lockedTool = tool;
            document.querySelector('.ft-tool-btn.tool-locked')?.classList.remove('tool-locked');
            document.querySelector(`.ft-tool-btn[data-tool="${tool}"]`)?.classList.add('tool-locked');
            showToast(`🔒 ${tool.charAt(0).toUpperCase() + tool.slice(1)} tool locked`);
            lastToolKeyTime = 0;
          } else {
            // Single press = select tool, unlock if different
            if (lockedTool && (tool !== lockedTool || tool === 'select')) {
              document.querySelector('.ft-tool-btn.tool-locked')?.classList.remove('tool-locked');
              lockedTool = null;
            }
            lastToolKeyTime = now;
            lastToolKeyName = tool;
          }
          fdCanvas.set_tool(tool);
          updateToolbar(tool);
          canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
          e.preventDefault();
          return;
        }
      }

      // ── Arrow-key nudge (Figma/Sketch standard) ──
      if (!isEditingInput && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          nudgeSelected(e.key, step);
          return;
        }
      }

      // Delete (only when canvas focused)
      if (!isEditingInput && (e.key === 'Delete' || e.key === 'Backspace')) {
        const r = JSON.parse(fdCanvas.handle_key(e.key, e.ctrlKey, e.shiftKey, e.altKey, e.metaKey));
        if (r.changed) {
          renderCanvas();
          syncCanvasToEditor();
        }
        document.getElementById('floating-action-bar')?.classList.remove('visible');
        e.preventDefault();
        return;
      }

      // ── Copy (⌘C / Ctrl+C) ──
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !e.shiftKey && !e.altKey && !editorFocused) {
        e.preventDefault();
        copySelectedAsFd();
        return;
      }

      // ── Cut (⌘X / Ctrl+X) ──
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x' && !e.shiftKey && !e.altKey && !editorFocused) {
        e.preventDefault();
        cutSelectedAsFd();
        return;
      }

      // ── Paste (⌘V / Ctrl+V) ──
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey && !editorFocused) {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }

      // ── Select All (⌘A / Ctrl+A) ──
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'a') && !e.shiftKey && !editorFocused) {
        e.preventDefault();
        // Select first visible node as a basic select-all
        const text = fdCanvas.get_text();
        const idRe = /@([a-zA-Z_][a-zA-Z0-9_]*)/;
        const m = idRe.exec(text);
        if (m) { fdCanvas.select_by_id(m[1]); renderDirty = true; uiDirty = true; }
        return;
      }

      // ── Zoom shortcuts (⌘+/⌘-/⌘0) ──
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        applyZoomCenter(zoomLevel * 1.25);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        applyZoomCenter(zoomLevel / 1.25);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        fitToContent(canvas);
        renderCanvas();
        renderMinimap(canvas);
        return;
      }

      // ── Duplicate (⌘D / Ctrl+D) ──
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && !editorFocused) {
        e.preventDefault();
        if (fdCanvas) {
          const changed = fdCanvas.duplicate_selected();
          if (changed) {
            renderCanvas();
            syncCanvasToEditor();
            updatePropertiesPanel();
            refreshLayersPanel();
          }
        }
        return;
      }

      // Undo/Redo (always — override textarea undo)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const changed = e.shiftKey ? fdCanvas.redo() : fdCanvas.undo();
        if (changed) {
          renderCanvas();
          syncCanvasToEditor();
        }
        return;
      }

      // Forward remaining keys to WASM (when canvas focused)
      if (!editorFocused) {
        try {
          const r = JSON.parse(fdCanvas.handle_key(e.key, e.ctrlKey, e.shiftKey, e.altKey, e.metaKey));

          // Handle export actions returned from WASM
          if (r.action === 'exportExcalidraw') {
            e.preventDefault();
            try {
              const json = fdCanvas.export_excalidraw();
              navigator.clipboard.writeText(json).then(() => {
                showToast('✦ Excalidraw JSON copied to clipboard');
              }).catch(() => {
                showToast('Failed to copy — check clipboard permissions');
              });
            } catch (err) {
              console.warn('Excalidraw export error:', err);
              showToast('Export failed');
            }
            return;
          }

          // Handle zoomReset action (bare 0 key → 100%)
          if (r.action === 'zoomReset') {
            e.preventDefault();
            zoomLevel = 1.0;
            panX = 0;
            panY = 0;
            updateZoomIndicator();
            renderCanvas();
            renderMinimap(canvas);
            return;
          }

          if (r.changed) {
            renderCanvas();
            syncCanvasToEditor();
          }
        } catch (_) {}
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        isPanning = false;
        if (!panDragging) canvas.style.cursor = '';
        // Remove pan indicator from Hand button
        document.querySelector('.ft-tool-btn[data-tool="hand"]')?.classList.remove('pan-active');
      }
      // Clear modifier cursors
      if (e.key === 'Meta') canvas.classList.remove('modifier-cmd', 'modifier-cmd-select');
      // Release Shift key tracker
      if (e.key === 'Shift') {
        modShiftHeld = false;
        renderDirty = true;
      }
    });

    // ── Resize Observer ───────────────────────────────────────────────
    // Use the enhanced resize function that includes debounced fitToContent for mobile (#1)
    const resizeObserver = new ResizeObserver(() => {
      if (window.__fdResizeCanvasWithFit) window.__fdResizeCanvasWithFit();
      else resizeCanvas();
    });
    resizeObserver.observe(wrapper);

    // ── Minimap Click-to-Pan ───────────────────────────────────────────
    const minimapCanvas = document.getElementById('minimap-canvas');
    let mmDragging = false;
    const minimapPanTo = (e) => {
      const mc = minimapCanvas;
      const info = mc._minimap;
      if (!info || !canvas) return;
      const rect = mc.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Convert minimap coords to scene coords
      const sceneX = info.sx + (mx - info.ox) / info.scale;
      const sceneY = info.sy + (my - info.oy) / info.scale;
      // Center viewport on clicked point
      const cr = canvas.getBoundingClientRect();
      panX = cr.width / 2 - sceneX * zoomLevel;
      panY = cr.height / 2 - sceneY * zoomLevel;
      renderCanvas();
      renderMinimap(canvas);
    };
    minimapCanvas.addEventListener('pointerdown', (e) => {
      mmDragging = true;
      minimapCanvas.setPointerCapture(e.pointerId);
      minimapPanTo(e);
    });
    minimapCanvas.addEventListener('pointermove', (e) => {
      if (mmDragging) minimapPanTo(e);
    });
    minimapCanvas.addEventListener('pointerup', () => { mmDragging = false; });

    // (Undo/Redo buttons removed — use keyboard shortcuts ⌘Z / ⇧⌘Z)
    // (Zoom pill removed — zoom is now in minimap pill)

    // ── Zoom Buttons ──────────────────────────────────────────────────
    const applyZoomCenter = (newZoom) => {
      const cr = canvas.getBoundingClientRect();
      const cx = cr.width / 2;
      const cy = cr.height / 2;
      newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
      panX = cx - (cx - panX) * (newZoom / zoomLevel);
      panY = cy - (cy - panY) * (newZoom / zoomLevel);
      zoomLevel = newZoom;
      updateZoomIndicator();
      renderCanvas();
      renderMinimap(canvas);
    };
    document.getElementById('zoom-in-btn').addEventListener('click', () => applyZoomCenter(zoomLevel * 1.25));
    document.getElementById('zoom-out-btn').addEventListener('click', () => applyZoomCenter(zoomLevel / 1.25));
    document.getElementById('zoom-reset-btn').addEventListener('click', () => {
      // Smart Toggle: If already at 100%, fit to content. Otherwise, jump to 100%.
      if (Math.abs(zoomLevel - 1.0) < 0.01) {
        fitToContent(canvas);
      } else {
        applyZoomCenter(1.0);
        return; // applyZoomCenter already calls renderCanvas/renderMinimap
      }
      renderCanvas();
      renderMinimap(canvas);
    });



    // ── Chrome Dropdowns (unified settings gear) ─────────────────────────
    const settingsGearBtn = document.getElementById('settings-gear-btn');
    const settingsDropdown = document.getElementById('settings-dropdown');

    function updateSettingsToggles() {
      document.getElementById('sm-sketchy-toggle')?.classList.toggle('toggle-on', isSketchy);
      document.getElementById('sm-grid-toggle')?.classList.toggle('toggle-on', gridEnabled);
      document.getElementById('sm-xray-toggle')?.classList.toggle('toggle-on', xrayLabels);
      document.getElementById('sm-motion-toggle')?.classList.toggle('toggle-on', reduceMotion);
    }

    // Settings gear dropdown (unified menu)
    settingsGearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSettingsToggles();
      settingsDropdown?.classList.toggle('visible');
      document.getElementById('sidebar-dropdown')?.classList.remove('visible');
    });

    // Close all dropdowns on click outside
    document.addEventListener('pointerdown', (e) => {
      const inside = e.target.closest('.chrome-dropdown') || e.target.closest('.chrome-btn') || e.target.closest('.chrome-dropdown-container');
      if (!inside) {
        settingsDropdown?.classList.remove('visible');
        document.getElementById('share-dropdown')?.classList.remove('visible');
        document.getElementById('sidebar-dropdown')?.classList.remove('visible');
      }
    });

    // Handle chrome-dropdown-item clicks (settings + menu)
    document.querySelectorAll('.chrome-dropdown-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const setting = btn.getAttribute('data-setting');
        if (!setting) return; // Links handle themselves
        switch (setting) {
          case 'sketchy':
            isSketchy = !isSketchy;
            if (fdCanvas) fdCanvas.set_sketchy_mode(isSketchy);
            break;
          case 'grid':
            gridEnabled = !gridEnabled;
            renderDirty = true; uiDirty = true;
            break;
          case 'xray':
            xrayLabels = !xrayLabels;
            renderDirty = true; uiDirty = true;
            break;
          case 'reduce-motion': {
            const manual = localStorage.getItem('fd-reduce-motion') === 'true';
            localStorage.setItem('fd-reduce-motion', manual ? 'false' : 'true');
            reduceMotion = !manual || prefersReducedMotion.matches;
            document.body.classList.toggle('reduce-motion', !manual);
            showToast(reduceMotion ? 'Reduce Motion: ON' : 'Reduce Motion: OFF');
            break;
          }
          case 'fit': {
            fitToContent(canvas);
            settingsDropdown?.classList.remove('visible');
            renderDirty = true; uiDirty = true;
            return;
          }
          case 'copy-png': {
            if (!fdCanvas) break;
            const selBounds = fdCanvas.get_selection_bounds();
            let bx, by, bw, bh;
            if (selBounds) {
              [bx, by, bw, bh] = selBounds;
            } else {
              const sb = getSceneBounds();
              if (!sb) { showToast('Nothing to export'); break; }
              bx = sb.x; by = sb.y; bw = sb.w; bh = sb.h;
            }
            const dpr = window.devicePixelRatio || 1;
            const offCanvas = document.createElement('canvas');
            offCanvas.width = Math.ceil(bw * dpr);
            offCanvas.height = Math.ceil(bh * dpr);
            const offCtx = offCanvas.getContext('2d');
            offCtx.scale(dpr, dpr);
            fdCanvas.render_export(offCtx, -bx, -by);
            offCanvas.toBlob((blob) => {
              if (!blob) { showToast('Export failed'); return; }
              navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]).then(() => showToast('Copied as PNG!'))
                .catch(() => showToast('Clipboard blocked'));
            }, 'image/png');
            settingsMenu?.classList.remove('visible');
            return;
          }
          case 'export-svg': {
            if (!fdCanvas) break;
            const svgStr = fdCanvas.export_svg();
            if (!svgStr) { showToast('Nothing to export'); break; }
            const blob = new Blob([svgStr], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'fast-draft-export.svg';
            a.click();
            URL.revokeObjectURL(url);
            showToast('SVG downloaded!');
            settingsMenu?.classList.remove('visible');
            return;
          }
          case 'export-html': {
            if (!fdCanvas) break;
            try {
              const htmlStr = fdCanvas.export_html();
              if (!htmlStr) { showToast('Nothing to export'); break; }
              const blob = new Blob([htmlStr], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'fast-draft-export.html';
              a.click();
              URL.revokeObjectURL(url);
              showToast('HTML page downloaded!');
            } catch (err) {
              console.warn('HTML export error:', err);
              showToast('Export failed');
            }
            settingsMenu?.classList.remove('visible');
            return;
          }
          case 'import-css': {
            settingsMenu?.classList.remove('visible');
            const fileInput = document.getElementById('css-file-input');
            if (!fileInput) break;
            fileInput.value = '';
            fileInput.onchange = (ev) => {
              const file = ev.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (re) => {
                const cssText = re.target.result;
                const fdStyles = parseCssToFdStyles(cssText);
                if (fdStyles.length === 0) {
                  showToast('No mappable CSS classes found');
                  return;
                }
                const styleBlock = '# ─── Imported CSS Styles ───\n\n' + fdStyles.join('\n\n') + '\n\n';
                if (editorView) {
                  const cur = editorView.state.doc.toString();
                  const newText = styleBlock + cur;
                  editorView.dispatch({ changes: { from: 0, to: cur.length, insert: newText } });
                  if (fdCanvas) fdCanvas.set_text(newText);
                }
                showToast(`Imported ${fdStyles.length} style${fdStyles.length > 1 ? 's' : ''} from ${file.name}`);
              };
              reader.readAsText(file);
            };
            fileInput.click();
            return;
          }

        }
        updateSettingsToggles();
        renderCanvas();
      });
    });

    // Theme toggle (in settings gear dropdown)
    document.getElementById('sm-theme-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      isDark = !isDark;
      if (fdCanvas) fdCanvas.set_theme(isDark);
      wrapper.classList.toggle('dark-canvas', isDark);
      localStorage.setItem('fd-canvas-theme', isDark ? 'dark' : 'light');
      settingsDropdown?.classList.remove('visible');
      renderDirty = true;
      renderCanvas();
    });

    // ── Search Panel → extracted to search.js ────────────────────────
    initSearchPanel({
      canvas,
      getFdCanvas: () => fdCanvas,
      getEditorView: () => editorView,
      renderCanvas: () => renderCanvas(),
      getZoomLevel: () => zoomLevel,
      setZoomLevel: (z) => { zoomLevel = z; },
      getPanX: () => panX,
      getPanY: () => panY,
      setPanX: (x) => { panX = x; },
      setPanY: (y) => { panY = y; },
      updateZoomIndicator,
      setRenderDirty: (v) => { renderDirty = v; },
      setUiDirty: (v) => { uiDirty = v; },
    });

    // Undo/Redo buttons (in scroll toolbar)
    document.getElementById('undo-btn')?.addEventListener('click', () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.undo();
      if (changed) {
        renderCanvas();
        syncCanvasToEditor();
      }
    });
    document.getElementById('redo-btn')?.addEventListener('click', () => {
      if (!fdCanvas) return;
      const changed = fdCanvas.redo();
      if (changed) {
        renderCanvas();
        syncCanvasToEditor();
      }
    });

    // ── Tauri Desktop Integration → extracted to tauri.js ──────────────
    initTauri({
      getEditorView: () => editorView,
      showToast,
    });

  } catch (err) {
    console.error('[FD] Failed to load WASM:', err);
    const isTimeout = err.message && err.message.includes('timed out');
    const errDetail = err.message ? `<code style="font-size:12px;opacity:0.7;display:block;margin-bottom:12px">${err.message}</code>` : '';
    const retryBtn = `<button onclick="location.reload()" style="margin-top:12px;padding:8px 20px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary,#1a1a2e);color:var(--text-primary,#fff);cursor:pointer;font-size:14px">↻ Retry</button>`;
    // Create error overlay dynamically (loading overlay was removed to avoid flash)
    const errOverlay = document.createElement('div');
    errOverlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--fd-bg,#F5F5F7);z-index:10';
    errOverlay.innerHTML = `
      <p style="color: var(--text-secondary); text-align: center; max-width: 360px;">
        <strong>${isTimeout ? 'Loading timed out' : 'Canvas couldn\u2019t start'}</strong><br><br>
        ${errDetail}
        ${isTimeout ? 'This can happen on slow connections or behind corporate proxies.' : 'Try reloading the page.'}
        If the issue persists, install the
        <a href="https://marketplace.visualstudio.com/items?itemName=khangnghiem.fast-draft" target="_blank">VS Code extension</a>
        for the full canvas experience.<br>
        ${retryBtn}
      </p>
    `;
    document.getElementById('canvas-content')?.appendChild(errOverlay);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlayground);
} else {
  initPlayground();
}

// Flush current document to localStorage on page unload (catches mid-debounce refreshes)
window.addEventListener('focus', () => {
  // macOS / Browser quirk: When regaining focus, devicePixelRatio or layout 
  // bounds might have shifted while the app was backgrounded. Force a sync 
  // immediately to prevent coordinate drift on the first click.
  if (typeof window.__fdResizeCanvasWithFit === 'function') {
    window.__fdResizeCanvasWithFit();
  } else {
    window.dispatchEvent(new Event('resize'));
  }
});

window.addEventListener('beforeunload', () => {
  if (!fdCanvas) return;
  try {
    fdCanvas.format_and_dedup(); // format-on-save
    const text = fdCanvas.get_text();
    if (text && text.trim().length > 0) {
      localStorage.setItem('fd-document', text);
    }
  } catch (_) {}
});
