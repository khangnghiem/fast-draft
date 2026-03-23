// ─── FD Playground — WASM-powered interactive editor ───

// ─── CodeMirror 6 Imports ────────────────────────────────────────────────
import { EditorState, Compartment } from 'https://esm.sh/@codemirror/state@6';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, tooltips, hoverTooltip
} from 'https://esm.sh/@codemirror/view@6';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } from 'https://esm.sh/@codemirror/language@6';
import { tags } from 'https://esm.sh/@lezer/highlight@1';
import { autocompletion, closeBrackets, closeBracketsKeymap } from 'https://esm.sh/@codemirror/autocomplete@6';
import { linter, lintGutter } from 'https://esm.sh/@codemirror/lint@6';
import { defaultKeymap, history, historyKeymap } from 'https://esm.sh/@codemirror/commands@6';
import { highlightSelectionMatches } from 'https://esm.sh/@codemirror/search@6';
import LZString from 'https://esm.sh/lz-string@1.5.0';
import { initAiChat, clearChatHistory } from './ai-chat.js?v=0.11.5';
import {
  screenToScene as coreScreenToScene,
  pointerTypeToU8 as corePointerTypeToU8,
  showToast as coreShowToast,
  ZOOM_WHEEL_FACTOR as CORE_ZOOM_WHEEL_FACTOR,
  GRID_SPACING as CORE_GRID_SPACING,
} from './canvas-core/state.js?v=0.11.5';
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
} from './canvas-core/render.js?v=0.11.5';
import {
  extractNodeBlock as coreExtractNodeBlock,
  buildPasteIdMap,
  applyIdRenames,
  collectDeclaredIds,
} from './canvas-core/clipboard.js?v=0.11.5';
import {
  getResizeHandleCursor as coreGetResizeHandleCursor,
  pinchDistance as corePinchDistance,
  pinchCenter as corePinchCenter,
  nudgeSelected as coreNudgeSelected,
} from './canvas-core/viewport.js?v=0.11.5';
import {
  TOOL_SHORTCUTS,
  TOOL_CYCLE,
  DOUBLE_PRESS_MS,
  ZOOM_STEP as CORE_ZOOM_STEP,
  buildShortcutHelpHtml as coreBuildShortcutHelpHtml,
} from './canvas-core/shortcuts.js?v=0.11.5';

// ─── FD Language Definition (StreamLanguage) ─────────────────────────────
const fdLanguage = StreamLanguage.define({
  token(stream) {
    // Skip whitespace
    if (stream.eatSpace()) return null;

    // Comment: # to end of line
    if (stream.match(/^#.*/)) return 'comment';

    // String: "..."
    if (stream.match(/^"[^"]*"/)) return 'string';

    // Node keywords
    if (stream.match(/^(group|frame|rect|ellipse|path|text|edge|image|import)\b/)) return 'keyword';

    // Style/theme keyword
    if (stream.match(/^(style|theme)\b/)) return 'keyword';

    // Animation/spec keywords
    if (stream.match(/^(when|spec)\b/)) return 'keyword';

    // Property names followed by colon
    if (stream.match(/^(w|h|x|y|fill|stroke|font|corner|opacity|shadow|bg|layout|use|center_in|offset|gap|pad|scale|rotate|translate|ease|duration|cols|from|to|src|alt|align|clip|arrow|curve|flow|place|d|label_offset|todo|done|tag|role|trait|intent|extends|visible|cursor)\s*:/)) {
      return 'propertyName';
    }

    // Node ID: @word
    if (stream.match(/^@\w+/)) return 'variableName.special';

    // Hex color: #FFF or #FFFFFF or #FFFFFFAA
    if (stream.match(/^#[0-9A-Fa-f]{3,8}\b/)) return 'color';

    // Number (including decimals)
    if (stream.match(/^\d+(\.\d+)?/)) return 'number';

    // Layout/easing/animation value keywords
    if (stream.match(/^(column|row|grid|free|spring|linear|ease_in|ease_out|ease_in_out|canvas|bold|italic|semibold|medium|light|thin|center|left|right|top|bottom|middle|cover|contain|none|start|end|both|smooth|straight|step|pulse|dash|todo|doing|done|blocked|low|high|critical)\b/)) {
      return 'atom';
    }

    // Triggers
    if (stream.match(/^:(hover|press|enter)\b/)) return 'meta';

    // Braces
    if (stream.eat('{') || stream.eat('}')) return 'brace';

    // Consume any other character
    stream.next();
    return null;
  },
});

// ─── Atom One Dark Theme for CodeMirror ──────────────────────────────────
const fdHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#C678DD' },           // purple
  { tag: tags.comment, color: '#5C6370', fontStyle: 'italic' },
  { tag: tags.string, color: '#98C379' },             // green
  { tag: tags.propertyName, color: '#E06C75' },       // red
  { tag: tags.variableName, color: '#E5C07B' },       // yellow/gold (node IDs)
  { tag: tags.color, color: '#56B6C2' },              // cyan (hex colors)
  { tag: tags.number, color: '#D19A66' },             // orange
  { tag: tags.atom, color: '#56B6C2' },               // cyan (value keywords)
  { tag: tags.meta, color: '#61AFEF' },               // blue (triggers)
  { tag: tags.brace, color: '#ABB2BF' },              // gray
]);

const fdTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1a1b26',
    color: '#ABB2BF',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
    height: '100%',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: '#528bff',
  },
  '.cm-cursor': {
    borderLeftColor: '#528bff',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#3E4451 !important',
  },
  '.cm-activeLine': {
    backgroundColor: '#2c313c40',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2c313c40',
  },
  '.cm-gutters': {
    backgroundColor: '#1a1b26',
    color: '#495162',
    border: 'none',
    borderRight: '1px solid #2c313c',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '32px',
  },
  // Lint gutter
  '.cm-lint-marker-error': {
    content: '"●"',
    color: '#E06C75',
  },
  // Autocomplete
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: '#21252b',
    border: '1px solid #3E4451',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 10px',
    fontSize: '12px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#2c313c',
    color: '#ABB2BF',
  },
  // Hover tooltip
  '.cm-tooltip-hover': {
    backgroundColor: '#21252b',
    border: '1px solid #3E4451',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    lineHeight: '1.5',
    maxWidth: '400px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  // Lint underlines
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #E06C75',
    textDecorationSkipInk: 'none',
  },
  // Bracket matching
  '.cm-matchingBracket': {
    backgroundColor: '#515a6b40',
    outline: '1px solid #515a6b',
  },
  // Scrollbar
  '.cm-scroller': {
    overflow: 'auto',
  },
}, { dark: true });

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
let inlineEditorActive = false;

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
  while ((m = idRegex.exec(text)) !== null) {
    try {
      const bj = fdCanvas.get_node_bounds(m[1]);
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
  fdCanvas.render(ctx, performance.now(), true, true);

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
      // Show 120×80 ghost outline centered at hover
      ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
      ctx.lineWidth = 1.5 / zoomLevel;
      ctx.strokeRect(px - 60, py - 40, 120, 80);
      ctx.setLineDash([]);
    } else if (hoverTool === 'ellipse') {
      // Show 100×100 ghost circle centered at hover
      ctx.setLineDash([4 / zoomLevel, 4 / zoomLevel]);
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
      ctx.lineWidth = 1.5 / zoomLevel;
      ctx.beginPath();
      ctx.ellipse(px, py, 50, 50, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (pencilHover.nodeId) {
      // Hover node highlight (non-draw tools)
      try {
        const bJson = fdCanvas.get_node_bounds(pencilHover.nodeId);
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

/** Auto-center scene content in canvas viewport */
function fitToContent(canvas) {
  if (!fdCanvas) return;
  try {
    const text = fdCanvas.get_text();
    const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const nodes = [];
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      try {
        const bj = fdCanvas.get_node_bounds(m[1]);
        if (!bj) continue;
        const b = JSON.parse(bj);
        if (b.width > 0 && b.height > 0) nodes.push(b);
      } catch (_) { }
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
let activeLeftTab = localStorage.getItem('fd-left-tab') || 'layers';

/** Active right panel tab id */
let activeRightTab = localStorage.getItem('fd-right-tab') || 'agent';

/** Switch the active tab in the left panel (Layers/Code/Inspect). */
function switchLeftTab(tabId) {
  const panel = document.getElementById('left-panel');
  if (!panel) return;
  // Ensure panel is visible (but not on mobile — panels are overlays there)
  if (window.innerWidth > 768) panel.classList.remove('collapsed');
  // Update tabs
  panel.querySelectorAll('.lp-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  // Update panes
  panel.querySelectorAll('.lp-pane').forEach(p => {
    p.classList.toggle('active', p.dataset.pane === tabId);
  });
  activeLeftTab = tabId;
  localStorage.setItem('fd-left-tab', tabId);
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
  if (window.innerWidth > 768) {
    panel.classList.remove('collapsed');
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
  localStorage.setItem('fd-right-tab', tabId);
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    resizeCanvas();
  });
}

/** Update the --right-panel-width and --right-panel-actual-width CSS vars.
 * --right-panel-width controls canvas positioning (left/right offsets).
 * --right-panel-actual-width controls minimap offset. */
function updateRightPanelWidth(expanded) {
  document.documentElement.style.setProperty('--right-panel-width', expanded ? '320px' : '0px');
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
    const restoreW = (savedW >= 200 && savedW <= 500) ? savedW : 320;
    h.style.setProperty('--left-panel-width', restoreW + 'px');
    switchLeftTab(activeLeftTab);
  }
  localStorage.setItem('fd-left-collapsed', isCollapsed ? '1' : '');
  requestAnimationFrame(() => {
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

  while ((match = classRegex.exec(cssText)) !== null) {
    const rawName = match[1];
    const body = match[2];
    // Sanitize class name: replace hyphens with underscores, remove invalid chars
    const name = rawName.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    if (!name) continue;

    const props = [];
    // Parse individual CSS properties
    const propRegex = /([a-z-]+)\s*:\s*([^;]+)/gi;
    let pm;
    while ((pm = propRegex.exec(body)) !== null) {
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
  while ((m = idRegex.exec(text)) !== null) {
    try {
      const bj = fdCanvas.get_node_bounds(m[1]);
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

/** Sync canvas text back to CodeMirror with echo suppression */
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
    const boundsJson = fdCanvas.get_node_bounds(selectedId);
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

  // Apply flash highlight decorations (CSS animation auto-fades)
  const { RangeSet, Decoration, StateField, EditorView: EV } = window.cmBundle || {};
  if (!Decoration) return; // CodeMirror not loaded

  const marks = ranges.map(r => {
    const from = Math.max(0, Math.min(r.from, text.length));
    const to = Math.max(from, Math.min(r.to, text.length));
    return Decoration.mark({ class: 'ai-diff-selected' }).range(from, to);
  });
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

  // Auto-clear stale decoration state after CSS animation finishes (1.2s + buffer)
  clearTimeout(highlightClearTimer);
  highlightClearTimer = setTimeout(() => {
    clearCodeHighlights();
    lastHighlightedIds = [];
  }, 1400);
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
  if (fillEl && props.fill) {
    let hex = props.fill;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    fillEl.value = hex.substring(0, 7);
  }

  // Stroke
  const strokeEl = document.getElementById('pp-stroke');
  if (strokeEl && props.strokeColor) {
    let hex = props.strokeColor;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    strokeEl.value = hex.substring(0, 7);
  }
  setVal('pp-stroke-w', props.strokeWidth);
  setVal('pp-corner', props.cornerRadius);

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
      while ((match = re.exec(existingText)) !== null) {
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
    const boundsJson = fdCanvas.get_node_bounds(rootId);
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
    if (!fdCanvas) return;

    const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
    const hitId = fdCanvas.hit_test_at(x, y);

    if (hitId) {
      // ── Node context menu ──
      const currentIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!currentIds.includes(hitId)) {
        fdCanvas.select_by_id(hitId);
      }
      renderCanvas();
      updateFab(canvas);
      updatePropertiesPanel();

      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      ctxMenu.open({
        items: buildNodeMenuItems(hitId, selectedIds),
        x: e.clientX,
        y: e.clientY,
        onAction: doNodeAction,
      });
    } else if (fdCanvas.hit_test_edge_at) {
      // ── Edge right-click ──
      const edgeHit = fdCanvas.hit_test_edge_at(x, y);
      if (edgeHit) {
        fdCanvas.select_by_id(edgeHit);
        renderCanvas();
        updatePropertiesPanel();
        showToast(`Selected edge @${edgeHit}`);
      } else {
        // ── Empty space context menu ──
        contextMenuClickPos = { x, y };
        ctxMenu.open({
          items: buildCanvasMenuItems(),
          x: e.clientX,
          y: e.clientY,
          onAction: doCanvasAction,
        });
      }
    } else {
      // ── Empty space context menu ──
      contextMenuClickPos = { x, y };
      ctxMenu.open({
        items: buildCanvasMenuItems(),
        x: e.clientX,
        y: e.clientY,
        onAction: doCanvasAction,
      });
    }
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
    // Shift+F → toggle fullscreen
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
  });
  // Close context menu on canvas pointerdown (ContextMenu handles this via capture,
  // but this ensures the old pattern still works for any other menus)
  canvas.addEventListener('pointerdown', () => ctxMenu.close());
}

/** ─── Layers Panel ────────────────────────────────────────────────────── */
const LAYER_ICONS = {
  group: '◻', frame: '▣', rect: '▢', ellipse: '○',
  path: '〜', text: 'T', style: '◆', edge: '⟶', note: '◇', spec: '◇'
};

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/** Parse FD source into a hierarchical layer tree. */
function parseLayerTree(source) {
  const lines = source.split('\n');
  const root = [];
  const stack = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Style definition
    const styleMatch = trimmed.match(/^style\s+(\w+)\s*\{/);
    if (styleMatch) {
      const node = { id: styleMatch[1], kind: 'style', text: '', children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      braceDepth += openBraces - closeBraces;
      stack.push({ node, depth: braceDepth });
      continue;
    }

    // Edge — matches both header form (edge @name @from -> @to) and body form (edge @name {)
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s+@(\w+)\s*->\s*@(\w+)/) ||
                      trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      const node = { id: edgeMatch[1], kind: 'edge', text: '', children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      if (trimmed.includes('{')) { braceDepth += 1; stack.push({ node, depth: braceDepth }); }
      continue;
    }

    // Typed node
    const nodeMatch = trimmed.match(/^(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?/);
    if (nodeMatch) {
      const node = { id: nodeMatch[2], kind: nodeMatch[1], text: nodeMatch[3] || '', children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      if (trimmed.endsWith('{')) { braceDepth += 1; stack.push({ node, depth: braceDepth }); }
      continue;
    }

    // Closing brace
    if (trimmed === '}') {
      braceDepth -= 1;
      while (stack.length > 0 && stack[stack.length - 1].depth > braceDepth) stack.pop();
      continue;
    }

    braceDepth += openBraces - closeBraces;
  }
  return root;
}

/** Render a layer tree node as HTML. */
function renderLayerNode(node, selectedIds, depth = 0) {
  const icon = LAYER_ICONS[node.kind] || '•';
  const isSelected = selectedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  let indent = '';
  for (let i = 0; i < depth; i++) indent += '<span class="layer-indent-guide"></span>';

  const chevronClass = hasChildren ? 'layer-chevron expanded' : 'layer-chevron empty';
  const chevron = `<span class="${chevronClass}" data-toggle-id="${escHtml(node.id)}">▶</span>`;

  const isContainer = ['rect','ellipse','frame','group'].includes(node.kind);
  let html = `<div class="layer-item${isSelected ? ' selected' : ''}" data-node-id="${escHtml(node.id)}" data-node-kind="${escHtml(node.kind)}" draggable="true">`;
  html += `<span class="layer-indent">${indent}</span>`;
  html += chevron;
  html += `<span class="layer-icon">${icon}</span>`;
  html += `<span class="layer-name">${escHtml(node.id)}</span>`;
  html += `<span class="layer-kind">${escHtml(node.kind)}</span>`;
  html += '</div>';

  if (hasChildren) {
    html += `<div class="layer-children" data-parent-id="${escHtml(node.id)}">`;
    for (const child of node.children) html += renderLayerNode(child, selectedIds, depth + 1);
    html += '</div>';
  }
  return html;
}

let lastLayerText = '';
let lastLayerSelectedId = '';

/** Last clicked layer item ID — for ⇧+click range select */
let lastClickedLayerId = '';

/** Flatten a layer tree into a visible-order array of IDs (respects collapsed state). */
function flattenLayerTree(nodes, panel) {
  const result = [];
  for (const node of nodes) {
    result.push(node.id);
    if (node.children.length > 0) {
      const childrenEl = panel?.querySelector(`.layer-children[data-parent-id="${node.id}"]`);
      const isCollapsed = childrenEl?.classList.contains('collapsed');
      if (!isCollapsed) {
        result.push(...flattenLayerTree(node.children, panel));
      }
    }
  }
  return result;
}

/** Close any open layer context menu. */
function closeLayerCtxMenu() {
  ctxMenu.close();
}

/** Searchable "Move Into" picker — replaces static container list with a filterable search. */
function showSearchableParentPicker(nodeId, posX, posY) {
  if (!fdCanvas?.get_container_ids) return;

  let containers;
  try { containers = JSON.parse(fdCanvas.get_container_ids()); } catch (_) { return; }
  const validTargets = containers.filter(c => c.id !== nodeId);
  if (validTargets.length === 0) { showToast('No valid containers'); return; }

  // Remove any existing picker
  document.getElementById('parent-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'parent-picker';
  picker.style.cssText = `position:fixed;left:${posX}px;top:${posY}px;z-index:310;` +
    'min-width:220px;max-width:280px;max-height:320px;display:flex;flex-direction:column;' +
    'background:var(--fd-surface-solid,#1C1C1E);border:1px solid var(--fd-border,#333);' +
    'border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);overflow:hidden;' +
    'font-family:var(--mono);font-size:12px;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'padding:8px 10px 4px;color:var(--fd-text-dim,#888);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
  header.textContent = `Move @${nodeId} into`;
  picker.appendChild(header);

  // Search input
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search containers…';
  input.style.cssText = 'margin:0 8px 4px;padding:6px 8px;border:1px solid var(--fd-border,#444);' +
    'border-radius:6px;background:var(--fd-bg,#0A0A0A);color:var(--fd-text,#E5E5EA);' +
    'font-size:12px;font-family:var(--mono);outline:none;';
  picker.appendChild(input);

  // Results list
  const list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;max-height:240px;padding:4px 0;';
  picker.appendChild(list);

  const LAYER_ICONS = { rect: '▢', ellipse: '○', frame: '⊞', group: '⊟', text: 'T', pen: '✐', image: '🖼' };

  function renderList(filter) {
    list.innerHTML = '';
    const q = (filter || '').toLowerCase();
    const matches = validTargets.filter(c => c.id.toLowerCase().includes(q));
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 10px;color:var(--fd-text-dim,#666);text-align:center;';
      empty.textContent = 'No matches';
      list.appendChild(empty);
      return;
    }
    for (const t of matches.slice(0, 50)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;' +
        'color:var(--fd-text,#E5E5EA);transition:background .1s;';
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--fd-hover,rgba(255,255,255,0.06))'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });

      const icon = document.createElement('span');
      icon.textContent = LAYER_ICONS[t.kind] || '•';
      icon.style.cssText = 'width:16px;text-align:center;flex-shrink:0;';
      row.appendChild(icon);

      const name = document.createElement('span');
      name.textContent = `@${t.id}`;
      name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      row.appendChild(name);

      // Two actions: Move (nest) and Center
      const moveBtn = document.createElement('button');
      moveBtn.textContent = '📦';
      moveBtn.title = 'Nest (preserve position)';
      moveBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
      moveBtn.addEventListener('mouseenter', () => { moveBtn.style.background = 'var(--fd-accent,#007AFF)'; });
      moveBtn.addEventListener('mouseleave', () => { moveBtn.style.background = ''; });
      moveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, false); });
      row.appendChild(moveBtn);

      const centerBtn = document.createElement('button');
      centerBtn.textContent = '⊙';
      centerBtn.title = 'Center in container';
      centerBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
      centerBtn.addEventListener('mouseenter', () => { centerBtn.style.background = 'var(--fd-accent,#007AFF)'; });
      centerBtn.addEventListener('mouseleave', () => { centerBtn.style.background = ''; });
      centerBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, true); });
      row.appendChild(centerBtn);

      // Click on row = nest (default)
      row.addEventListener('click', () => doReparent(t.id, false));
      list.appendChild(row);
    }
    if (matches.length > 50) {
      const more = document.createElement('div');
      more.style.cssText = 'padding:6px 10px;color:var(--fd-text-dim,#666);text-align:center;font-size:10px;';
      more.textContent = `…${matches.length - 50} more (refine search)`;
      list.appendChild(more);
    }
  }

  function doReparent(targetId, center) {
    const textBefore = fdCanvas.get_text();
    let changed = false;
    if (center && fdCanvas.reparent_into_centered) {
      changed = fdCanvas.reparent_into_centered(nodeId, targetId);
    } else {
      changed = fdCanvas.reparent_into(nodeId, targetId);
    }
    if (changed) {
      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) fdCanvas.push_undo_snapshot(textBefore, textAfter);
      renderCanvas();
      syncCanvasToEditor();
      updatePropertiesPanel();
      refreshLayersPanel();
      showToast(`Moved @${nodeId} → @${targetId}`);
    }
    closePicker();
  }

  function closePicker() {
    picker.remove();
    document.removeEventListener('pointerdown', outsideClickHandler, true);
    document.removeEventListener('keydown', escHandler, true);
  }

  function outsideClickHandler(ev) {
    if (!picker.contains(ev.target)) closePicker();
  }
  function escHandler(ev) {
    if (ev.key === 'Escape') { ev.stopPropagation(); closePicker(); }
  }

  input.addEventListener('input', () => renderList(input.value));
  renderList('');

  document.body.appendChild(picker);

  // Clamp to viewport
  requestAnimationFrame(() => {
    const r = picker.getBoundingClientRect();
    if (r.right > window.innerWidth) picker.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
    if (r.bottom > window.innerHeight) picker.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
  });

  // Focus input after a tick so it doesn't immediately close
  setTimeout(() => {
    input.focus();
    document.addEventListener('pointerdown', outsideClickHandler, true);
    document.addEventListener('keydown', escHandler, true);
  }, 50);
}

/** Clear all drag indicators from layer items. */
function clearLayerDragIndicators(panel) {
  panel.querySelectorAll('.layer-item').forEach(el => {
    el.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
  });
  panel.querySelectorAll('.layers-body').forEach(el => {
    el.classList.remove('drag-over-root');
  });
}

/** Determine the drop zone based on cursor Y position within the element.
 *  Returns 'above' (top 25%), 'below' (bottom 25%), or 'nest' (middle 50%). */
function getDropZone(e, el) {
  const rect = el.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const h = rect.height;
  if (y < h * 0.25) return 'above';
  if (y > h * 0.75) return 'below';
  return 'nest';
}

/** Collect a flat ordered list of {id, index-within-parent} from the DOM. */
function getSiblingIndex(panel, nodeId) {
  const item = panel.querySelector(`.layer-item[data-node-id="${nodeId}"]`);
  if (!item) return 0;
  const parent = item.parentElement;
  if (!parent) return 0;
  const siblings = [...parent.querySelectorAll(':scope > .layer-item')];
  return siblings.indexOf(item);
}

/** Wire drag-and-drop handlers on all layer items (#1, #2, #4, #5). */
function wireLayerDragDrop(panel) {
  if (!fdCanvas) return;
  let draggedId = null;

  panel.querySelectorAll('.layer-item').forEach(item => {
    // ── dragstart ──
    item.addEventListener('dragstart', (e) => {
      draggedId = item.getAttribute('data-node-id');
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });

    // ── dragover ── (determines drop zone indicator)
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetId = item.getAttribute('data-node-id');
      if (!draggedId || targetId === draggedId) return;

      clearLayerDragIndicators(panel);
      const zone = getDropZone(e, item);
      const kind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(kind);

      if (zone === 'nest' && isContainer) {
        item.classList.add('drag-over-nest');
      } else if (zone === 'above') {
        item.classList.add('drag-over-above');
      } else {
        item.classList.add('drag-over-below');
      }
    });

    // ── dragleave ──
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
    });

    // ── drop ── (#1 reparent, #2 reorder, #4 undo guard)
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearLayerDragIndicators(panel);
      const targetId = item.getAttribute('data-node-id');
      if (!draggedId || !fdCanvas || targetId === draggedId) return;

      const textBefore = fdCanvas.get_text();
      const zone = getDropZone(e, item);
      const kind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(kind);
      let changed = false;

      if (zone === 'nest' && isContainer) {
        // #1: Reparent into container (Alt = center, default = preserve position)
        changed = e.altKey && fdCanvas.reparent_into_centered
          ? fdCanvas.reparent_into_centered(draggedId, targetId)
          : fdCanvas.reparent_into(draggedId, targetId);
      } else {
        // #2: Reorder — calculate target index
        const targetIndex = getSiblingIndex(panel, targetId);
        const insertIndex = zone === 'above' ? targetIndex : targetIndex + 1;
        // Check if same parent — if so, reorder; otherwise reparent first
        const targetItem = panel.querySelector(`.layer-item[data-node-id="${targetId}"]`);
        const dragItem = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
        const targetParent = targetItem?.parentElement?.getAttribute?.('data-parent-id');
        const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id');
        if (targetParent && dragParent && targetParent === dragParent) {
          // Same parent — pure reorder
          changed = fdCanvas.reorder_child(draggedId, insertIndex);
        } else if (targetParent) {
          // Different parent — reparent into target's parent, then reorder
          changed = fdCanvas.reparent_into(draggedId, targetParent);
          if (changed) {
            fdCanvas.reorder_child(draggedId, insertIndex);
          }
        } else {
          // Target is at root level — reparent to root, then reorder
          changed = fdCanvas.reparent_into(draggedId, 'root');
          if (changed) {
            fdCanvas.reorder_child(draggedId, insertIndex);
          }
        }
      }

      // #4: Undo snapshot guard
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
      draggedId = null;
    });

    // ── dragend ── (cleanup)
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      clearLayerDragIndicators(panel);
      draggedId = null;
    });
  });

  // #5: Drop-to-root — drop on empty space in layers-body
  const layersBody = panel.querySelector('.layers-body');
  if (layersBody) {
    layersBody.addEventListener('dragover', (e) => {
      // Only highlight if dropping on empty space (not on a layer-item)
      if (e.target.closest('.layer-item')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearLayerDragIndicators(panel);
      layersBody.classList.add('drag-over-root');
    });
    layersBody.addEventListener('dragleave', (e) => {
      if (!layersBody.contains(e.relatedTarget) || e.relatedTarget?.closest('.layer-item')) {
        layersBody.classList.remove('drag-over-root');
      }
    });
    layersBody.addEventListener('drop', (e) => {
      if (e.target.closest('.layer-item')) return; // handled by item drop
      e.preventDefault();
      layersBody.classList.remove('drag-over-root');
      if (!draggedId || !fdCanvas) return;

      const textBefore = fdCanvas.get_text();
      const changed = fdCanvas.reparent_into(draggedId, 'root');
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
      draggedId = null;
    });
  }
}

/** Wire right-click context menu on layer items — uses unified ContextMenu. */
function wireLayerContextMenu(panel) {
  if (!fdCanvas) return;

  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const nodeId = item.getAttribute('data-node-id');
      if (!nodeId) return;

      // Determine selection state for enable/disable logic
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!selectedIds.includes(nodeId)) {
        fdCanvas.select_by_id(nodeId);
      }
      const nodeKind = item.getAttribute('data-node-kind');
      const isContainer = ['rect','ellipse','frame','group'].includes(nodeKind);
      const hasChildren = !!item.nextElementSibling?.classList.contains('layer-children');
      const canGroup = selectedIds.length >= 2 || (selectedIds.includes(nodeId) && selectedIds.length >= 2);
      let canUngroup = false;
      const source = fdCanvas.get_text();
      for (const id of selectedIds) {
        if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
          canUngroup = true;
          break;
        }
      }
      const isLocked = fdCanvas.is_node_locked ? fdCanvas.is_node_locked(nodeId) : false;

      // Build items array
      const items = [];

      // Rename
      items.push({ type: 'action', icon: '✏️', label: 'Rename', action: 'rename' });
      items.push({ type: 'separator' });

      // Clipboard
      items.push({ type: 'action', icon: '✂', label: 'Cut', shortcut: '⌘X', action: 'cut' });
      items.push({ type: 'action', icon: '⎘', label: 'Copy', shortcut: '⌘C', action: 'copy' });
      items.push({ type: 'action', icon: '📋', label: 'Paste', shortcut: '⌘V', action: 'paste' });
      items.push({ type: 'action', icon: '🖼', label: 'Copy as PNG', shortcut: '⌘⇧C', action: 'copy-png' });
      items.push({ type: 'separator' });

      // Structure
      items.push({ type: 'action', icon: '⊕', label: 'Duplicate', shortcut: '⌘D', action: 'duplicate' });
      items.push({ type: 'action', icon: '◻', label: 'Group', shortcut: '⌘G', action: 'group', disabled: !canGroup });
      items.push({ type: 'action', icon: '◫', label: 'Ungroup', shortcut: '⇧⌘G', action: 'ungroup', disabled: !canUngroup });
      items.push({ type: 'action', icon: '⊞', label: 'Frame Selection', action: 'frame' });
      items.push({ type: 'separator' });

      // Z-order
      items.push({ type: 'action', icon: '↑', label: 'Bring to Front', shortcut: '⌘⇧]', action: 'bring-front' });
      items.push({ type: 'action', icon: '↓', label: 'Send to Back', shortcut: '⌘⇧[', action: 'send-back' });

      // Lock
      items.push({ type: 'action', icon: isLocked ? '🔓' : '🔒', label: isLocked ? 'Unlock' : 'Lock', action: 'lock' });

      // Select Children (containers only)
      if (isContainer && hasChildren) {
        items.push({ type: 'action', icon: '📂', label: 'Select Children', action: 'select-children' });
      }
      items.push({ type: 'separator' });

      // Move Into — opens searchable picker
      items.push({ type: 'action', icon: '📦', label: 'Move Into…', action: 'move-into-search' });
      items.push({ type: 'action', icon: '↑', label: 'Move to Root', action: 'move-to-root' });
      items.push({ type: 'separator' });

      // Delete
      items.push({ type: 'action', icon: '✕', label: 'Delete', shortcut: '⌫', action: 'delete', danger: true });

      // Action handler for layer-specific actions
      const doLayerAction = (action, el) => {
        const textBefore = fdCanvas.get_text();
        let changed = false;

        if (action === 'rename') {
          const nameEl = item.querySelector('.layer-name');
          if (nameEl) nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return;
        } else if (action === 'cut') {
          fdCanvas.select_by_id(nodeId);
          copySelectedAsFd();
          changed = fdCanvas.delete_selected();
        } else if (action === 'copy') {
          fdCanvas.select_by_id(nodeId);
          copySelectedAsFd();
          return;
        } else if (action === 'paste') {
          pasteFromClipboard().then(() => {
            renderCanvas(); syncCanvasToEditor();
            updatePropertiesPanel(); refreshLayersPanel();
          });
          return;
        } else if (action === 'copy-png') {
          fdCanvas.select_by_id(nodeId);
          if (typeof copySelectionAsPng === 'function') copySelectionAsPng();
          return;
        } else if (action === 'duplicate') {
          fdCanvas.select_by_id(nodeId);
          changed = fdCanvas.duplicate_selected();
        } else if (action === 'group') {
          changed = fdCanvas.group_selected();
        } else if (action === 'ungroup') {
          changed = fdCanvas.ungroup_selected();
        } else if (action === 'frame') {
          const resultJson = fdCanvas.handle_key('f', false, false, false, true);
          const result = JSON.parse(resultJson);
          changed = result.changed;
        } else if (action === 'bring-front') {
          const resultJson = fdCanvas.handle_key(']', false, true, false, true);
          const result = JSON.parse(resultJson);
          changed = result.changed;
        } else if (action === 'send-back') {
          const resultJson = fdCanvas.handle_key('[', false, true, false, true);
          const result = JSON.parse(resultJson);
          changed = result.changed;
        } else if (action === 'lock') {
          if (fdCanvas.toggle_node_locked) {
            fdCanvas.toggle_node_locked(nodeId);
            changed = true;
          }
        } else if (action === 'select-children') {
          const childrenContainer = panel.querySelector(`.layer-children[data-parent-id="${nodeId}"]`);
          if (childrenContainer) {
            const childIds = [...childrenContainer.querySelectorAll(':scope > .layer-item')].map(
              el => el.getAttribute('data-node-id')
            ).filter(Boolean);
            if (childIds.length > 0) {
              fdCanvas.select_multiple_by_ids(JSON.stringify(childIds));
              renderCanvas();
              updatePropertiesPanel();
              refreshLayersPanel();
            }
          }
          return;
        } else if (action === 'move-into-search') {
          showSearchableParentPicker(nodeId, e.clientX ?? 200, e.clientY ?? 200);
          return; // picker handles its own undo
        } else if (action === 'move-into') {
          const targetId = el?.getAttribute('data-target');
          if (targetId) changed = fdCanvas.reparent_into(nodeId, targetId);
        } else if (action === 'center-into') {
          const targetId = el?.getAttribute('data-target');
          if (targetId) {
            changed = fdCanvas.reparent_into_centered
              ? fdCanvas.reparent_into_centered(nodeId, targetId)
              : fdCanvas.reparent_into(nodeId, targetId);
          }
        } else if (action === 'move-to-root') {
          changed = fdCanvas.reparent_into(nodeId, 'root');
        } else if (action === 'delete') {
          fdCanvas.select_by_id(nodeId);
          changed = fdCanvas.delete_selected();
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

      ctxMenu.open({
        items,
        x: e.clientX,
        y: e.clientY,
        onAction: doLayerAction,
      });
    });
  });
}

/** Refresh the layers panel. */
function refreshLayersPanel() {
  const panel = document.getElementById('layers-panel');
  if (!panel || !fdCanvas) return;

  // Use full set of selected IDs for multi-select highlighting
  const selectedIds = new Set(JSON.parse(fdCanvas.get_selected_ids()));
  const selectedKey = [...selectedIds].sort().join(',');
  const source = fdCanvas.get_text();

  // Selection-only change: just update highlights
  if (source === lastLayerText && selectedKey !== lastLayerSelectedId) {
    lastLayerSelectedId = selectedKey;
    panel.querySelectorAll('.layer-item').forEach(el =>
      el.classList.toggle('selected', selectedIds.has(el.getAttribute('data-node-id')))
    );
    const sel = panel.querySelector('.layer-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  // No change at all
  if (source === lastLayerText && selectedKey === lastLayerSelectedId) return;

  lastLayerText = source;
  lastLayerSelectedId = selectedKey;

  const tree = parseLayerTree(source);
  const countNodes = (nodes) => nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
  const total = countNodes(tree);

  let html = '<div class="layers-header" id="layers-header-toggle">';
  html += '<span class="layers-title">Layers</span>';
  html += `<span class="layers-count">${total}</span>`;
  html += '</div><div class="layers-body">';
  for (const node of tree) html += renderLayerNode(node, selectedIds);
  html += '</div>';

  panel.innerHTML = html;

  // Wire click-to-select with ⌘+click multi and ⇧+click range
  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.layer-chevron')) return;
      e.stopPropagation();
      const nodeId = item.getAttribute('data-node-id');
      if (!nodeId || !fdCanvas) return;

      // ⌘+click (Mac) / Ctrl+click — toggle
      if (e.metaKey || e.ctrlKey) {
        fdCanvas.toggle_select_by_id(nodeId);
        lastClickedLayerId = nodeId;
        const newIds = new Set(JSON.parse(fdCanvas.get_selected_ids()));
        lastLayerSelectedId = [...newIds].sort().join(',');
        panel.querySelectorAll('.layer-item').forEach(el =>
          el.classList.toggle('selected', newIds.has(el.getAttribute('data-node-id')))
        );
        renderDirty = true;
        updatePropertiesPanel();
        return;
      }

      // ⇧+click — range select
      if (e.shiftKey && lastClickedLayerId) {
        const flatIds = flattenLayerTree(tree, panel);
        const startIdx = flatIds.indexOf(lastClickedLayerId);
        const endIdx = flatIds.indexOf(nodeId);
        if (startIdx >= 0 && endIdx >= 0) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          const rangeIds = flatIds.slice(lo, hi + 1);
          fdCanvas.select_multiple_by_ids(JSON.stringify(rangeIds));
          const newIds = new Set(rangeIds);
          lastLayerSelectedId = [...newIds].sort().join(',');
          panel.querySelectorAll('.layer-item').forEach(el =>
            el.classList.toggle('selected', newIds.has(el.getAttribute('data-node-id')))
          );
          renderDirty = true;
          updatePropertiesPanel();
          return;
        }
      }

      // Plain click — single select
      lastClickedLayerId = nodeId;
      fdCanvas.select_by_id(nodeId);
      renderCanvas();
      lastLayerSelectedId = nodeId;
      panel.querySelectorAll('.layer-item').forEach(el =>
        el.classList.toggle('selected', el.getAttribute('data-node-id') === nodeId)
      );
      updateFab(document.getElementById('fd-canvas'));
      updatePropertiesPanel();
    });
  });

  // Wire chevron toggle
  panel.querySelectorAll('.layer-chevron:not(.empty)').forEach(chevron => {
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      const toggleId = chevron.getAttribute('data-toggle-id');
      const childrenEl = panel.querySelector(`.layer-children[data-parent-id="${toggleId}"]`);
      if (childrenEl) {
        const collapsed = childrenEl.classList.toggle('collapsed');
        chevron.classList.toggle('expanded', !collapsed);
      }
    });
  });

  // ── Layer Drag-and-Drop (#1 reparent, #2 reorder, #5 drop-to-root) ──
  wireLayerDragDrop(panel);

  // ── Layer Context Menu (#3 "Move Into") ──
  wireLayerContextMenu(panel);

  // ── Layers header click → toggle panel (Penpot-style) ──
  const layersHeaderEl = panel.querySelector('#layers-header-toggle');
  if (layersHeaderEl) {
    layersHeaderEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLayersPanel();
    });
  }

  // ── Keyboard shortcuts when layers panel is focused (#7) ──
  wireLayerKeyboardShortcuts(panel);
}

/** Wire keyboard shortcuts for layers panel — Delete, ⌘C/X/V/D */
function wireLayerKeyboardShortcuts(panel) {
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
  if (panel._layerKeysWired) return;
  panel._layerKeysWired = true;

  panel.addEventListener('keydown', (e) => {
    if (!fdCanvas) return;
    const meta = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (key === 'delete' || key === 'backspace') {
      e.preventDefault(); e.stopPropagation();
      if (fdCanvas.delete_selected()) {
        renderCanvas(); syncCanvasToEditor();
        updatePropertiesPanel(); refreshLayersPanel();
      }
      return;
    }
    if (meta && key === 'd') {
      e.preventDefault(); e.stopPropagation();
      if (fdCanvas.duplicate_selected()) {
        renderCanvas(); syncCanvasToEditor();
        updatePropertiesPanel(); refreshLayersPanel();
      }
      return;
    }
    if (meta && key === 'c' && !e.shiftKey) {
      e.preventDefault(); e.stopPropagation();
      copySelectedAsFd(); return;
    }
    if (meta && key === 'x') {
      e.preventDefault(); e.stopPropagation();
      cutSelectedAsFd();
      renderCanvas(); syncCanvasToEditor();
      updatePropertiesPanel(); refreshLayersPanel();
      return;
    }
    if (meta && key === 'v') {
      e.preventDefault(); e.stopPropagation();
      pasteFromClipboard().then(() => {
        renderCanvas(); syncCanvasToEditor();
        updatePropertiesPanel(); refreshLayersPanel();
      });
      return;
    }
  });
}

/** ─── Minimap ─────────────────────────────────────────────────────────── */
let minimapLastRender = 0;
const MINIMAP_INTERVAL = 100; // ~10fps

/** Render the minimap: actual WASM scene overview + viewport rect */
function renderMinimap(canvas) {
  const mc = document.getElementById('minimap-canvas');
  if (!mc || !fdCanvas) return;

  const dpr = window.devicePixelRatio || 1;
  const mw = 150, mh = 100;
  mc.width = mw * dpr;
  mc.height = mh * dpr;

  const mctx = mc.getContext('2d');
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Theme-aware background
  mctx.fillStyle = isDark ? 'rgba(28,28,30,0.9)' : 'rgba(245,245,247,0.9)';
  mctx.fillRect(0, 0, mw, mh);

  // Use single WASM call instead of N×get_node_bounds()
  const sceneBoundsJson = fdCanvas.get_scene_bounds();
  if (!sceneBoundsJson) return;
  let sb;
  try { sb = JSON.parse(sceneBoundsJson); } catch (_) { return; }
  if (!sb.w || sb.w <= 0 || !sb.h || sb.h <= 0) return;

  const pad = 20;
  const scale = Math.min((mw - pad * 2) / sb.w, (mh - pad * 2) / sb.h);
  const ox = (mw - sb.w * scale) / 2;
  const oy = (mh - sb.h * scale) / 2;

  // Render actual scene scaled into minimap via WASM (skip grid)
  mctx.save();
  mctx.translate(ox, oy);
  mctx.scale(scale, scale);
  mctx.translate(-sb.x, -sb.y);
  fdCanvas.render(mctx, performance.now(), true, false);
  mctx.restore();

  // Draw viewport rect
  if (canvas) {
    const cr = canvas.getBoundingClientRect();
    const vx = -panX / zoomLevel;
    const vy = -panY / zoomLevel;
    const vw = cr.width / zoomLevel;
    const vh = cr.height / zoomLevel;
    const vrx = ox + (vx - sb.x) * scale;
    const vry = oy + (vy - sb.y) * scale;
    const vrw = vw * scale;
    const vrh = vh * scale;

    // Theme-aware viewport indicator
    mctx.strokeStyle = isDark ? 'rgba(10, 132, 255, 0.6)' : 'rgba(0, 122, 255, 0.5)';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(vrx, vry, vrw, vrh);
    mctx.fillStyle = isDark ? 'rgba(10, 132, 255, 0.08)' : 'rgba(0, 122, 255, 0.06)';
    mctx.fillRect(vrx, vry, vrw, vrh);
  }

  // Store scene info for click-to-pan (backward-compatible)
  mc._minimap = { sx: sb.x, sy: sb.y, sw: sb.w, sh: sb.h, scale, ox, oy };
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

  const MIN_WIDTH = 200;
  const MAX_WIDTH = 500;
  const DEFAULT_LEFT_W = 320;

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
    const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx));
    document.documentElement.style.setProperty('--left-panel-width', newW + 'px');
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
    const w = leftPanel.offsetWidth;
    localStorage.setItem('fd-left-panel-width', String(w));
    // Re-clamp toolbar to new canvas bounds after panel resize
    requestAnimationFrame(() => window.__fdReclampToolbar?.());
  };
  layersHandle.addEventListener('pointerup', endDrag);
  layersHandle.addEventListener('pointercancel', endDrag);

  // Double-click to collapse
  layersHandle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isCollapsed = document.documentElement.dataset.lp === 'open';
    document.documentElement.dataset.lp = isCollapsed ? 'closed' : 'open';
    if (isCollapsed) {
      document.documentElement.style.setProperty('--left-panel-width', '0px');
      localStorage.setItem('fd-left-collapsed', '1');
    } else {
      const savedW = parseInt(localStorage.getItem('fd-left-panel-width'), 10);
      const restoreW = (savedW >= MIN_WIDTH && savedW <= MAX_WIDTH) ? savedW : DEFAULT_LEFT_W;
      document.documentElement.style.setProperty('--left-panel-width', restoreW + 'px');
      localStorage.setItem('fd-left-collapsed', '');
    }
    requestAnimationFrame(() => {
      positionLayersHandle();
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
    const restoreW = (savedW >= 200 && savedW <= 500) ? savedW : 320;
    h.style.setProperty('--left-panel-width', restoreW + 'px');
    localStorage.setItem('fd-left-collapsed', '');
  }
  // Hide resize handle when collapsed, show when expanded
  if (layersHandle) {
    layersHandle.style.display = isCollapsed ? 'none' : '';
    if (!isCollapsed) {
      requestAnimationFrame(() => {
        layersHandle.style.left = layersPanel.offsetWidth + 'px';
      });
    }
  }
  requestAnimationFrame(() => {
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
  while ((m = re.exec(fdText)) !== null) {
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
  while ((m = re.exec(fdText)) !== null) {
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
    const boundsJson = fdCanvas.get_node_bounds(selectedId);
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
function setupInlineEditor(canvas) {
  canvas.addEventListener('dblclick', (e) => {
    if (!fdCanvas || inlineEditorActive) return;
    const { x, y } = screenToScene(e.clientX, e.clientY, canvas);

    const nodeId = fdCanvas.get_selected_id();

    // Double-click empty space → create text node
    if (!nodeId) {
      if (fdCanvas.create_node_at) {
        const created = fdCanvas.create_node_at('text', x, y);
        if (created) {
          renderCanvas();
          syncCanvasToEditor();
          refreshLayersPanel();
          const newId = fdCanvas.get_selected_id();
          if (newId) {
            setTimeout(() => openInlineTextEditor(newId, ''), 50);
          }
        }
      }
      e.preventDefault();
      return;
    }

    // Get node props
    let props;
    try {
      const json = fdCanvas.get_selected_node_props();
      props = JSON.parse(json);
    } catch (_) { return; }
    if (!props.id) return;

    // Only edit text and shape nodes (rect/ellipse/frame)
    const isText = props.kind === 'text';
    const isShape = props.kind === 'rect' || props.kind === 'ellipse' || props.kind === 'frame';
    if (!isText && !isShape) return;

    if (isText) {
      // Direct text node — edit its content
      openInlineTextEditor(props.id, props.content || '', 'content');
    } else {
      // Shape node — drill into child text (Figma behavior)
      const existingTextId = fdCanvas.get_text_child_id(props.id);
      if (existingTextId) {
        // Select the child text node and edit it
        fdCanvas.select_by_id(existingTextId);
        renderCanvas();
        const childProps = JSON.parse(fdCanvas.get_selected_node_props());
        openInlineTextEditor(existingTextId, childProps.content || '', 'content');
      } else {
        // Create a new text child inside the shape
        const newTextId = fdCanvas.create_child_text(props.id, 'Text');
        if (newTextId) {
          renderCanvas();
          syncCanvasToEditor();
          refreshLayersPanel();
          setTimeout(() => openInlineTextEditor(newTextId, 'Text', 'content'), 50);
        }
      }
    }
    e.preventDefault();
  });
}

/** Open a floating textarea over the node for in-place text editing. */
function openInlineTextEditor(nodeId, currentValue, propKey = 'content') {
  if (inlineEditorActive || !fdCanvas) return;

  let boundsJson;
  try { boundsJson = fdCanvas.get_node_bounds(nodeId); } catch (_) { return; }
  const b = JSON.parse(boundsJson);
  const bw = b.width || 80;
  const bh = b.height || 24;

  inlineEditorActive = true;
  if (fdCanvas.clear_pressed) fdCanvas.clear_pressed();
  renderCanvas();

  // Get font info from node props
  let props;
  try { props = JSON.parse(fdCanvas.get_selected_node_props()); } catch (_) { props = {}; }
  const fontSize = Math.round((props.fontSize || 14) * zoomLevel);
  const fontFamily = props.fontFamily || 'Inter, system-ui, sans-serif';
  const fontWeight = props.fontWeight || 400;
  const lineHeight = Math.round((props.fontSize || 14) * 1.2 * zoomLevel);

  // Convert scene-space to screen-space
  const sx = (b.x || 0) * zoomLevel + panX;
  const sy = (b.y || 0) * zoomLevel + panY;
  const sw = Math.max(bw * zoomLevel, 80);
  const sh = Math.max(bh * zoomLevel, lineHeight + 4);

  // Determine colors
  const isText = props.kind === 'text';
  let bgColor, textColor;
  if (isText) {
    bgColor = 'transparent';
    textColor = props.fill || '#1C1C1E';
  } else if (props.fill && props.fill !== 'none') {
    bgColor = props.fill;
    textColor = '#FFFFFF';
  } else {
    bgColor = '#F5F5F7';
    textColor = '#1C1C1E';
  }

  const wrapper = document.getElementById('canvas-wrapper');
  const originalValue = currentValue;

  // Create textarea
  const textarea = document.createElement('textarea');
  textarea.value = currentValue;
  textarea.style.cssText = `
    position: absolute; left: ${sx}px; top: ${sy}px;
    width: ${sw}px; min-height: ${sh}px;
    font-size: ${fontSize}px; font-family: ${fontFamily}; font-weight: ${fontWeight};
    line-height: ${lineHeight}px;
    color: ${textColor}; background: ${bgColor};
    border: 2px solid #0A84FF; border-radius: 4px;
    padding: 2px 4px; margin: 0; box-sizing: border-box;
    resize: none; outline: none; overflow: hidden;
    z-index: 10000; white-space: pre-wrap; word-wrap: break-word;
  `;

  // Auto-resize
  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };
  textarea.addEventListener('input', autoResize);

  const commitEdit = () => {
    if (!inlineEditorActive) return;
    const newValue = textarea.value.trim();
    if (newValue !== originalValue && fdCanvas) {
      const textBefore = fdCanvas.get_text();
      fdCanvas.set_node_prop(propKey, newValue);
      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) {
        fdCanvas.push_undo_snapshot(textBefore, textAfter);
      }
      renderCanvas();
      syncCanvasToEditor();
      refreshLayersPanel();
    }
    cleanup();
  };

  const cancelEdit = () => {
    cleanup();
  };

  const cleanup = () => {
    inlineEditorActive = false;
    textarea.remove();
    renderCanvas();
  };

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
    e.stopPropagation(); // Prevent canvas shortcuts while editing
  });

  textarea.addEventListener('blur', () => {
    setTimeout(commitEdit, 50);
  });

  wrapper.appendChild(textarea);
  textarea.focus();
  textarea.select();
  autoResize();
}

// ── Touch Gesture System ──────────────────────────────────────────────────
// Provides: pinch-to-zoom, two-finger pan with momentum inertia,
// three-finger swipe/tap/pinch (undo/redo/copy/paste), four-finger swipe/tap
// (zen mode, zoom-to-fit, zoom-to-selection, tool cycle),
// long-press context menu, Apple Pencil palm rejection.
//
// Gesture hierarchy: 1-finger = object, 2-finger = viewport, 3-finger = edit, 4-finger = app.
function setupTouchGestures(canvas, fdCanvasRef, markRenderDirty, markUiDirty) {
  let activeTouches = new Map();
  let lastPinchDist = 0;
  let lastPinchCenter = { x: 0, y: 0 };
  let longPressTimer = null;
  let longPressPos = null;
  let isGesturing = false;
  let threeFingerStartX = 0;
  let threeFingerHandled = false;
  let pencilActive = false;

  // Inertia state — weighted velocity for smooth momentum
  const velocityHistory = []; // last 3 frames: [{vx, vy, t}]
  let inertiaVx = 0;
  let inertiaVy = 0;
  let inertiaRaf = null;

  // ── 3-finger tap/double-tap state (undo/redo) ──
  let threeFingerTouchStart = 0;  // timestamp of 3-finger touchstart
  let threeFingerStartPositions = []; // [{x,y}] at touchstart
  let lastThreeFingerTapTime = 0;

  // ── 3-finger pinch state (copy/paste) ──
  let threeFingerStartArea = 0;   // bounding area of 3 touches at start
  let threeFingerPinchHandled = false;

  // ── 3-finger long-press state (edit menu) ──
  let threeFingerLongPressTimer = null;

  // ── 4-finger state ──
  let fourFingerTouchStart = 0;
  let fourFingerStartPositions = [];
  let fourFingerHandled = false;

  // Tool cycle order (matches toolbar visual order)
  const TOOL_CYCLE = ['hand', 'select', 'rect', 'ellipse', 'pen', 'arrow', 'text', 'eraser'];

  function pinchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pinchCenter(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2
    };
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function cancelInertia() {
    if (inertiaRaf) {
      cancelAnimationFrame(inertiaRaf);
      inertiaRaf = null;
    }
    velocityHistory.length = 0;
  }

  function computeWeightedVelocity() {
    if (velocityHistory.length === 0) return { vx: 0, vy: 0 };
    // Weighted average: recent frames count more
    let totalWeight = 0;
    let vx = 0, vy = 0;
    for (let i = 0; i < velocityHistory.length; i++) {
      const weight = i + 1; // newer frames have higher index
      vx += velocityHistory[i].vx * weight;
      vy += velocityHistory[i].vy * weight;
      totalWeight += weight;
    }
    return { vx: vx / totalWeight, vy: vy / totalWeight };
  }

  function applyInertia() {
    const friction = 0.95; // Exponential decay (smoother than 0.92)
    inertiaVx *= friction;
    inertiaVy *= friction;
    // Stop when below minimum threshold
    if (Math.abs(inertiaVx) < 0.1 && Math.abs(inertiaVy) < 0.1) {
      inertiaRaf = null;
      return;
    }
    panX += inertiaVx;
    panY += inertiaVy;
    markRenderDirty();
    markUiDirty();
    inertiaRaf = requestAnimationFrame(applyInertia);
  }

  /** Zoom by a multiplier, anchored at a screen-space point. */
  function touchZoomAtPoint(mx, my, factor) {
    const oldZoom = zoomLevel;
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * factor));
    panX = mx - (mx - panX) * (zoomLevel / oldZoom);
    panY = my - (my - panY) * (zoomLevel / oldZoom);
    updateZoomIndicator();
    markRenderDirty();
    markUiDirty();
  }

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, t);
    }

    const count = activeTouches.size;
    cancelInertia();

    // Palm rejection: if Apple Pencil is active and a finger appears, ignore fingers
    if (pencilActive && count > 0) {
      const hasPencil = [...e.touches].some(t => t.touchType === 'stylus');
      if (!hasPencil) {
        e.preventDefault();
        return;
      }
    }

    // Detect Apple Pencil
    for (const t of e.changedTouches) {
      if (t.touchType === 'stylus') {
        pencilActive = true;
      }
    }

    if (count === 1) {
      // Single finger — start long-press timer for context menu
      const t = [...activeTouches.values()][0];
      longPressPos = { x: t.clientX, y: t.clientY };
      longPressTimer = setTimeout(() => {
        const fakeEvent = new MouseEvent('contextmenu', {
          clientX: longPressPos.x,
          clientY: longPressPos.y,
          bubbles: true,
        });
        canvas.dispatchEvent(fakeEvent);
        isGesturing = true;
        longPressTimer = null;
      }, 500);
    } else {
      clearLongPress();
    }

    if (count === 2) {
      // Start pinch / two-finger pan
      isGesturing = true;
      const touches = [...activeTouches.values()];

      // Smart disambiguation: reject if fingers too close
      const dist = pinchDistance(touches[0], touches[1]);
      if (dist < 30) {
        return;
      }

      lastPinchDist = dist;
      lastPinchCenter = pinchCenter(touches[0], touches[1]);
      e.preventDefault();
    }

    if (count === 3) {
      // Start three-finger gesture detection (swipe/tap/pinch/long-press)
      isGesturing = true;
      threeFingerHandled = false;
      threeFingerPinchHandled = false;
      const touches = [...activeTouches.values()];
      threeFingerStartX = touches.reduce((s, t) => s + t.clientX, 0) / 3;
      threeFingerTouchStart = performance.now();
      threeFingerStartPositions = touches.map(t => ({ x: t.clientX, y: t.clientY }));

      // Compute bounding area for pinch detection
      const xs = touches.map(t => t.clientX);
      const ys = touches.map(t => t.clientY);
      threeFingerStartArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));

      // Start 3-finger long-press timer (500ms → edit menu)
      if (threeFingerLongPressTimer) clearTimeout(threeFingerLongPressTimer);
      threeFingerLongPressTimer = setTimeout(() => {
        threeFingerLongPressTimer = null;
        if (activeTouches.size === 3 && !threeFingerHandled && !threeFingerPinchHandled) {
          threeFingerHandled = true;
          showThreeFingerEditMenu(touches);
        }
      }, 500);

      e.preventDefault();
    }

    if (count === 4) {
      // Start four-finger gesture detection (tap/swipe)
      isGesturing = true;
      fourFingerHandled = false;
      const touches = [...activeTouches.values()];
      fourFingerTouchStart = performance.now();
      fourFingerStartPositions = touches.map(t => ({ x: t.clientX, y: t.clientY }));
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      activeTouches.set(t.identifier, t);
    }

    const count = activeTouches.size;

    // Cancel long-press if moved too far
    if (count === 1 && longPressTimer && longPressPos) {
      const t = [...activeTouches.values()][0];
      const dx = t.clientX - longPressPos.x;
      const dy = t.clientY - longPressPos.y;
      if (dx * dx + dy * dy > 100) {
        clearLongPress();
      }
    }

    if (count === 2) {
      const touches = [...activeTouches.values()];
      const dist = pinchDistance(touches[0], touches[1]);
      const center = pinchCenter(touches[0], touches[1]);

      // Pinch-to-zoom
      if (lastPinchDist > 0) {
        const scale = dist / lastPinchDist;
        const canvasRect = canvas.getBoundingClientRect();
        const mx = center.x - canvasRect.left;
        const my = center.y - canvasRect.top;
        touchZoomAtPoint(mx, my, scale);
      }

      // Two-finger pan
      const dx = center.x - lastPinchCenter.x;
      const dy = center.y - lastPinchCenter.y;
      panX += dx;
      panY += dy;

      // Track velocity for inertia (weighted 3-frame history)
      const now = performance.now();
      const dt = velocityHistory.length > 0
        ? now - velocityHistory[velocityHistory.length - 1].t
        : 16;
      const normalizedDt = Math.max(dt, 1);
      velocityHistory.push({ vx: dx * (16 / normalizedDt), vy: dy * (16 / normalizedDt), t: now });
      if (velocityHistory.length > 3) velocityHistory.shift();

      lastPinchDist = dist;
      lastPinchCenter = center;
      markRenderDirty();
      markUiDirty();
      e.preventDefault();
    }

    if (count === 3 && !threeFingerHandled) {
      const touches = [...activeTouches.values()];
      const avgX = touches.reduce((s, t) => s + t.clientX, 0) / 3;
      const swipeDist = avgX - threeFingerStartX;

      // Require significant horizontal swipe
      if (Math.abs(swipeDist) > 50) {
        threeFingerHandled = true;
        if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
        if (fdCanvasRef) {
          if (swipeDist < 0) {
            // Swipe left = undo
            const changed = fdCanvasRef.handle_key('z', false, false, false, true);
            if (changed) {
              markRenderDirty();
              markUiDirty();
              syncCanvasToEditor();
            }
          } else {
            // Swipe right = redo
            const changed = fdCanvasRef.handle_key('z', false, true, false, true);
            if (changed) {
              markRenderDirty();
              markUiDirty();
              syncCanvasToEditor();
            }
          }
        }
        e.preventDefault();
      }

      // ── 3-finger pinch detection (copy / paste) ──
      if (!threeFingerPinchHandled && threeFingerStartArea > 0) {
        const xs = touches.map(t => t.clientX);
        const ys = touches.map(t => t.clientY);
        const currentArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        const ratio = currentArea / threeFingerStartArea;

        if (ratio < 0.4) {
          // Pinch-in → copy
          threeFingerPinchHandled = true;
          threeFingerHandled = true;
          if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
          copySelectedAsFd();
          showToast('Copied');
          e.preventDefault();
        } else if (ratio > 2.5) {
          // Pinch-out → paste
          threeFingerPinchHandled = true;
          threeFingerHandled = true;
          if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
          pasteFromClipboard();
          e.preventDefault();
        }
      }
    }

    // ── 4-finger swipe detection ──
    if (count === 4 && !fourFingerHandled) {
      const touches = [...activeTouches.values()];
      const avgX = touches.reduce((s, t) => s + t.clientX, 0) / 4;
      const avgY = touches.reduce((s, t) => s + t.clientY, 0) / 4;
      const startAvgX = fourFingerStartPositions.reduce((s, p) => s + p.x, 0) / 4;
      const startAvgY = fourFingerStartPositions.reduce((s, p) => s + p.y, 0) / 4;
      const dx = avgX - startAvgX;
      const dy = avgY - startAvgY;

      const SWIPE_THRESHOLD = 50;

      if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        fourFingerHandled = true;
        if (dy < 0) {
          // Swipe up → zoom-to-fit
          fitToContent(canvas);
          markRenderDirty();
          markUiDirty();
        } else {
          // Swipe down → zoom-to-selection (or reset to 100% if none)
          if (fdCanvasRef) {
            const selectedId = fdCanvasRef.get_selected_id();
            if (selectedId) {
              try {
                const b = JSON.parse(fdCanvasRef.get_node_bounds(selectedId));
                if (b.width > 0 && b.height > 0) {
                  const cr = canvas.getBoundingClientRect();
                  const pad = 60;
                  const zoom = Math.min(cr.width / (b.width + pad), cr.height / (b.height + pad), ZOOM_MAX);
                  zoomLevel = Math.max(zoom, ZOOM_MIN);
                  panX = cr.width / 2 - (b.x + b.width / 2) * zoomLevel;
                  panY = cr.height / 2 - (b.y + b.height / 2) * zoomLevel;
                  updateZoomIndicator();
                  markRenderDirty();
                  markUiDirty();
                }
              } catch (_) {}
            } else {
              // No selection → reset to 100%
              const cr = canvas.getBoundingClientRect();
              zoomLevel = 1.0;
              panX = cr.width / 2;
              panY = cr.height / 2;
              updateZoomIndicator();
              markRenderDirty();
              markUiDirty();
            }
          }
        }
        e.preventDefault();
      } else if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe → cycle tool
        fourFingerHandled = true;
        if (fdCanvasRef) {
          const currentTool = fdCanvasRef.get_tool_name();
          const currentIdx = TOOL_CYCLE.indexOf(currentTool);
          const dir = dx > 0 ? 1 : -1;
          const nextIdx = (currentIdx + dir + TOOL_CYCLE.length) % TOOL_CYCLE.length;
          const nextTool = TOOL_CYCLE[nextIdx];
          fdCanvasRef.set_tool(nextTool);
          updateToolbar(nextTool);
          canvas.style.cursor = (nextTool === 'select' || nextTool === 'eraser' || nextTool === 'hand') ? '' : 'crosshair';
          if (nextTool === 'hand') canvas.style.cursor = 'grab';
          showToast(nextTool.charAt(0).toUpperCase() + nextTool.slice(1));
        }
        e.preventDefault();
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    const prevCount = activeTouches.size;
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }

    clearLongPress();
    if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }

    // Check if pencil lifted
    for (const t of e.changedTouches) {
      if (t.touchType === 'stylus') {
        pencilActive = false;
      }
    }

    // ── 3-finger tap / double-tap detection (undo / redo) ──
    if (prevCount === 3 && activeTouches.size === 0 && !threeFingerHandled && !threeFingerPinchHandled) {
      const elapsed = performance.now() - threeFingerTouchStart;
      if (elapsed < 200) {
        // Check total movement — must be <15px to count as tap
        const maxMove = threeFingerStartPositions.reduce((max, p, i) => {
          const endT = e.changedTouches[i];
          if (!endT) return max;
          const dist = Math.hypot(endT.clientX - p.x, endT.clientY - p.y);
          return Math.max(max, dist);
        }, 0);

        if (maxMove < 15) {
          const now = performance.now();
          if (now - lastThreeFingerTapTime < 400) {
            // Double-tap → undo
            lastThreeFingerTapTime = 0;
            if (fdCanvasRef) {
              const changed = fdCanvasRef.handle_key('z', false, false, false, true);
              if (changed) {
                markRenderDirty();
                markUiDirty();
                syncCanvasToEditor();
              }
            }
          } else {
            // Single tap → record time for double-tap detection (no action)
            lastThreeFingerTapTime = now;
          }
        }
      }
    }

    // ── 4-finger tap detection (zen mode toggle) ──
    if (prevCount === 4 && activeTouches.size === 0 && !fourFingerHandled) {
      const elapsed = performance.now() - fourFingerTouchStart;
      if (elapsed < 250) {
        // Check total movement — must be <20px to count as tap
        const maxMove = fourFingerStartPositions.reduce((max, p, i) => {
          const endT = e.changedTouches[i];
          if (!endT) return max;
          const dist = Math.hypot(endT.clientX - p.x, endT.clientY - p.y);
          return Math.max(max, dist);
        }, 0);

        if (maxMove < 20) {
          // Toggle fullscreen mode
          toggleFullscreen();
        }
      }
    }

    // Start inertia if two-finger gesture just ended
    if (activeTouches.size === 0 && isGesturing) {
      isGesturing = false;
      lastPinchDist = 0;
      const { vx, vy } = computeWeightedVelocity();
      inertiaVx = vx;
      inertiaVy = vy;
      if (!reduceMotion && (Math.abs(inertiaVx) > 0.5 || Math.abs(inertiaVy) > 0.5)) {
        inertiaRaf = requestAnimationFrame(applyInertia);
      }
    }
  });

  canvas.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) {
      activeTouches.delete(t.identifier);
    }
    clearLongPress();
    if (threeFingerLongPressTimer) { clearTimeout(threeFingerLongPressTimer); threeFingerLongPressTimer = null; }
    isGesturing = false;
    pencilActive = false;
    cancelInertia();
  });

  // ── 3-finger long-press edit menu ──
  function showThreeFingerEditMenu(touches) {
    // Position at the centroid of the 3 touches
    const cx = touches.reduce((s, t) => s + t.clientX, 0) / 3;
    const cy = touches.reduce((s, t) => s + t.clientY, 0) / 3;

    // Remove existing menu if present
    const existing = document.getElementById('three-finger-edit-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'three-finger-edit-menu';
    menu.style.cssText = `
      position: fixed; left: ${cx}px; top: ${cy - 50}px; transform: translateX(-50%);
      display: flex; gap: 2px; padding: 6px 8px;
      background: rgba(30,30,30,0.92); backdrop-filter: blur(12px);
      border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      z-index: 10001; font-size: 13px; color: #fff; user-select: none;
    `;

    const actions = [
      { label: 'Undo', fn: () => { if (!fdCanvasRef) return; const c = fdCanvasRef.handle_key('z', false, false, false, true); if (c) { markRenderDirty(); markUiDirty(); syncCanvasToEditor(); } } },
      { label: 'Redo', fn: () => { if (!fdCanvasRef) return; const c = fdCanvasRef.handle_key('z', false, true, false, true); if (c) { markRenderDirty(); markUiDirty(); syncCanvasToEditor(); } } },
      { label: 'Cut', fn: () => cutSelectedAsFd() },
      { label: 'Copy', fn: () => { copySelectedAsFd(); showToast('Copied'); } },
      { label: 'Paste', fn: () => pasteFromClipboard() },
    ];

    for (const action of actions) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = `
        border: none; background: transparent; color: #fff; padding: 6px 12px;
        cursor: pointer; border-radius: 6px; font-size: 13px; font-weight: 500;
      `;
      btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(255,255,255,0.15)'; });
      btn.addEventListener('pointerleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        action.fn();
        menu.remove();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    // Auto-dismiss after 3s or on any touch/click elsewhere
    const dismiss = () => { menu.remove(); document.removeEventListener('pointerdown', dismiss); };
    setTimeout(dismiss, 3000);
    setTimeout(() => document.addEventListener('pointerdown', dismiss), 100);
  }
}

// ── Apple Pencil Pro Squeeze Detection ────────────────────────────────────
// On iPad Safari, Apple Pencil Pro squeeze fires as a button=5 pointer event.
// Modifier combos: plain=toggle last two tools, Shift=Pen, Ctrl=Select,
// Alt=Rect, Ctrl+Shift=Ellipse.
function setupApplePencilPro(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen' && e.button === 5 && fdCanvas) {
      const newTool = fdCanvas.handle_stylus_squeeze(
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      updateToolbar(newTool);
      canvas.style.cursor = (newTool === 'select' || newTool === 'eraser') ? '' : 'crosshair';
      if (newTool === 'hand') canvas.style.cursor = 'grab';
    }
  });
}

async function initPlayground() {
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
    const wasmFetchUrl = './wasm/fd_wasm_bg.wasm?v=0.11.5';
    const [wasm, wasmResponse] = await raceWithTimeout(Promise.all([
      import('./wasm/fd_wasm.js?v=0.11.5'),
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
    // Deep link: load ?code= param if present, else use default
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('code');
    let initialFd = DEFAULT_FD;
    if (codeParam) {
      try {
        const decoded = LZString.decompressFromEncodedURIComponent(codeParam);
        if (decoded && decoded.trim().length > 0) initialFd = decoded;
      } catch (_) { /* invalid code param, use default */ }
    }
    fdCanvas.set_text(initialFd);
    console.log(`[FD] ✓ Ready (total ${Math.round(performance.now() - t0)}ms)`);
    // Hand tool is default on load — set grab cursor
    canvas.style.cursor = 'grab';

    // ── Create CodeMirror Editor ──────────────────────────────────────
    const fdLinter = linter((view) => {
      if (!fdCanvas) return [];
      const text = view.state.doc.toString();
      try {
        // Use the WASM diagnostics API
        const raw = fdCanvas.get_diagnostics();
        const diags = JSON.parse(raw);
        return diags.map(d => {
          const from = view.state.doc.line(d.line + 1).from + d.col;
          const to = Math.min(
            view.state.doc.line(d.line + 1).from + d.endCol,
            view.state.doc.line(d.line + 1).to
          );
          return {
            from: Math.min(from, view.state.doc.length),
            to: Math.min(to, view.state.doc.length),
            severity: 'error',
            message: d.message,
          };
        });
      } catch { return []; }
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
                    renderDirty = true; uiDirty = true;
                  }
                } catch (_) {
                  renderDirty = true; uiDirty = true;
                }
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
          const boundsJson = fdCanvas.get_node_bounds(selectedId);
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
        requestCanvas();
        updateQCP();
      });
      // Right-click dot → apply stroke
      qcp.addEventListener('contextmenu', (e) => {
        const dot = e.target.closest('.qcp-dot');
        if (!dot || !fdCanvas) return;
        e.preventDefault();
        fdCanvas.set_property('strokeColor', dot.dataset.color);
        requestCanvas();
      });
      // Custom color
      document.getElementById('qcp-custom-input')?.addEventListener('input', (e) => {
        if (!fdCanvas) return;
        fdCanvas.set_property('fill', e.target.value);
        requestCanvas();
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
        e.dataTransfer.dropEffect = 'copy';
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

    // ── Presentation Mode ─────────────────────────────────────────────
    const presOverlay = document.getElementById('presentation-overlay');
    const presCounter = document.getElementById('presentation-counter');
    let presentation = { active: false, frames: [], index: 0 };

    function collectFrames() {
      if (!fdCanvas) return [];
      const text = editorView ? editorView.state.doc.toString() : '';
      const frames = [];
      // Find all frame nodes from the scene graph
      const nodesJson = fdCanvas.get_all_nodes_json?.();
      if (nodesJson) {
        try {
          const nodes = JSON.parse(nodesJson);
          for (const n of nodes) {
            if (n.kind === 'frame' || n.kind === 'Frame') {
              frames.push({ id: n.id, x: n.x || 0, y: n.y || 0, w: n.w || 400, h: n.h || 300 });
            }
          }
        } catch (_) {}
      }
      // Sort top-left to bottom-right
      frames.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      return frames;
    }

    function startPresentation() {
      const frames = collectFrames();
      if (frames.length === 0) {
        showToast('No frames found — create frames first (F key)');
        return;
      }
      presentation = { active: true, frames, index: 0 };
      presOverlay.classList.remove('hidden');
      zoomToFrame(frames[0]);
      updatePresCounter();
      // Hide all chrome
      document.querySelectorAll('.chrome-pill, .scroll-toolbar, #floating-action-bar, .quick-color-picker, #right-panel, #minimap-container')
        .forEach(el => el.style.display = 'none');
    }

    function stopPresentation() {
      presentation.active = false;
      presOverlay.classList.add('hidden');
      // Restore chrome
      document.querySelectorAll('.chrome-pill, .scroll-toolbar, #minimap-container')
        .forEach(el => el.style.display = '');
      document.getElementById('floating-action-bar').style.display = '';
      document.getElementById('right-panel').style.display = '';
    }

    function zoomToFrame(frame) {
      const canvasRect = canvas.getBoundingClientRect();
      const cw = canvasRect.width;
      const ch = canvasRect.height;
      const zoom = Math.min(cw / frame.w, ch / frame.h) * 0.9;
      zoomLevel = zoom;
      panX = (cw / 2) - (frame.x + frame.w / 2) * zoom;
      panY = (ch / 2) - (frame.y + frame.h / 2) * zoom;
      requestCanvas();
    }

    function updatePresCounter() {
      if (presCounter) {
        presCounter.textContent = `${presentation.index + 1} / ${presentation.frames.length}`;
      }
    }

    document.getElementById('sm-present')?.addEventListener('click', startPresentation);
    document.getElementById('presentation-exit')?.addEventListener('click', stopPresentation);
    window.addEventListener('keydown', (e) => {
      if (!presentation.active) return;
      if (e.key === 'Escape') { stopPresentation(); e.preventDefault(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        if (presentation.index < presentation.frames.length - 1) {
          presentation.index++;
          zoomToFrame(presentation.frames[presentation.index]);
          updatePresCounter();
        }
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft') {
        if (presentation.index > 0) {
          presentation.index--;
          zoomToFrame(presentation.frames[presentation.index]);
          updatePresCounter();
        }
        e.preventDefault();
      }
    });

    // Auto-fullscreen from URL param
    if (urlParams.has('fullscreen')) {
      setTimeout(toggleFullscreen, 300);
    }

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
      // Minimap + Layers at ~10fps (only when something changed)
      if (uiDirty && time - minimapLastRender > MINIMAP_INTERVAL) {
        renderMinimap(canvas);
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
      e.preventDefault(); // prevent browser scroll/zoom on touch
      canvasDragOccurred = false; // reset drag tracking

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

      // Middle-click or Space+click → always pan
      if (e.button === 1 || isPanning) {
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
              const boundsJson = fdCanvas.get_node_bounds(hit.id);
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
      if (moveResult.changed) { renderDirty = true; uiDirty = true; canvasDragOccurred = true; }

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
    setupTouchGestures(canvas, fdCanvas, () => renderDirty = true, () => uiDirty = true);

    // ── Apple Pencil Pro squeeze detection ──
    setupApplePencilPro(canvas);

    // ── Tool Toolbar (floating) ────────────────────────────────────
    // ── Drag-to-Create state ──
    let dtcActive = false;
    let dtcStartX = 0, dtcStartY = 0;
    let dtcTool = '';
    let dtcGhost = null;
    const DTC_DRAG_THRESHOLD = 5;

    /** Default dimensions for each shape type (arrow excluded — needs two anchors) */
    const DTC_SIZES = {
      rect: [120, 80], ellipse: [80, 80], text: [80, 24],
      frame: [200, 150], pen: [120, 80]
    };

    /** Insert a shape at the given scene coordinates via FD code injection */
    function insertShapeAt(type, sceneX, sceneY) {
      if (!editorView) return;
      const id = `${type}_${Date.now().toString(36)}`;
      const [w, h] = DTC_SIZES[type] || [100, 80];
      const x = Math.round(sceneX);
      const y = Math.round(sceneY);
      const isDarkNow = document.body.classList.contains('dark-theme');
      const defaultStroke = isDarkNow ? '#CCCCCC' : '#333333';
      const defaultFill = isDarkNow ? '#2C2C2E' : '#F0F0F0';
      let fdBlock;
      if (type === 'text') {
        fdBlock = `\ntext @${id} "Text" {\n  x: ${x} y: ${y}\n  w: ${w} h: ${h}\n}\n`;
      } else if (type === 'arrow') {
        fdBlock = `\nedge @${id} {\n  x: ${x} y: ${y}\n  w: 120 h: 40\n  arrow: end\n  curve: smooth\n  stroke: ${defaultStroke} 2\n}\n`;
      } else if (type === 'frame') {
        fdBlock = `\nframe @${id} {\n  x: ${x} y: ${y}\n  w: ${w} h: ${h}\n  fill: #FFFFFF\n  stroke: ${defaultStroke} 1\n  corner: 8\n}\n`;
      } else {
        const corner = type === 'rect' ? `\n  corner: ${smartDefaults.cornerRadius || 8}` : '';
        fdBlock = `\n${type} @${id} {\n  x: ${x} y: ${y}\n  w: ${w} h: ${h}\n  fill: ${defaultFill}\n  stroke: ${defaultStroke} 1.5${corner}\n}\n`;
      }
      const currentText = editorView.state.doc.toString();
      const newText = currentText + fdBlock;
      editorView.dispatch({
        changes: { from: currentText.length, to: currentText.length, insert: fdBlock },
      });
      // Force immediate sync to canvas so shapes appear right away
      if (fdCanvas) {
        suppressSync = true;
        fdCanvas.set_text(newText);
        suppressSync = false;
        fdCanvas.set_tool('select');
        updateToolbar('select');
        canvas.style.cursor = '';
      }
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} created`);
      renderDirty = true;
      uiDirty = true;
      renderCanvas();
      refreshLayersPanel();
    }

    /** Insert a shape at the center of the visible viewport */
    function insertShapeAtCenter(type) {
      const canvasEl = document.getElementById('fd-canvas');
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const centerClientX = rect.left + rect.width / 2;
      const centerClientY = rect.top + rect.height / 2;
      const [w, h] = DTC_SIZES[type] || [100, 80];
      const sceneX = ((centerClientX - rect.left) - panX) / zoomLevel - w / 2;
      const sceneY = ((centerClientY - rect.top) - panY) / zoomLevel - h / 2;
      insertShapeAt(type, sceneX, sceneY);
    }

    /** Create or show the drag ghost element */
    function createDtcGhost(tool) {
      if (dtcGhost) dtcGhost.remove();
      dtcGhost = document.createElement('div');
      dtcGhost.className = 'dtc-ghost';
      const [w, h] = DTC_SIZES[tool] || [100, 80];
      dtcGhost.style.width = w + 'px';
      dtcGhost.style.height = h + 'px';
      if (tool === 'ellipse') dtcGhost.classList.add('dtc-ellipse');
      else if (tool === 'text') { dtcGhost.classList.add('dtc-text'); dtcGhost.textContent = 'T'; }
      document.body.appendChild(dtcGhost);
      return dtcGhost;
    }

    document.querySelectorAll('.ft-tool-btn[data-tool]').forEach(btn => {
      // Click to select tool — then draw on canvas (Figma/Excalidraw style)
      // CRITICAL: e.preventDefault() prevents native SVG drag from hijacking pointer events
      // See LESSONS.md: "Native Drag Hijacks SVG Pointerdown"
      btn.addEventListener('pointerdown', (e) => {
        if (!fdCanvas) return;
        e.preventDefault(); // THE FIX: prevent native SVG drag
        const tool = btn.dataset.tool;
        fdCanvas.set_tool(tool);
        updateToolbar(tool);
        canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
        // Track drag start for drag-to-create
        if (tool !== 'hand' && tool !== 'select' && tool !== 'eraser' && tool !== 'lasso' && tool !== 'arrow') {
          dtcStartX = e.clientX;
          dtcStartY = e.clientY;
          dtcTool = tool;
        }
      });

      btn.addEventListener('click', () => {
        if (!fdCanvas) return;
        const tool = btn.dataset.tool;
        const now = performance.now();
        // Double-click = lock tool (sticky mode)
        if (tool === lastToolBtnName && now - lastToolBtnTime < 400) {
          lockedTool = tool;
          btn.classList.add('tool-locked');
          showToast(`🔒 ${tool.charAt(0).toUpperCase() + tool.slice(1)} tool locked`);
          lastToolBtnTime = 0;
        } else {
          // Single click = unlock if different tool
          if (lockedTool && tool !== lockedTool) {
            document.querySelector('.ft-tool-btn.tool-locked')?.classList.remove('tool-locked');
            lockedTool = null;
          }
          lastToolBtnTime = now;
          lastToolBtnName = tool;
        }
        // Tool already set via pointerdown — just ensure consistency
        fdCanvas.set_tool(tool);
        updateToolbar(tool);
        canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
      });
    });

    // ── Drag-to-Create: pointermove + pointerup (document-level) ─────
    document.addEventListener('pointermove', (e) => {
      if (!dtcTool || dtcActive) {
        // Already in drag mode — update ghost position
        if (dtcActive && dtcGhost) {
          const [w, h] = DTC_SIZES[dtcTool] || [100, 80];
          dtcGhost.style.left = (e.clientX - w / 2) + 'px';
          dtcGhost.style.top = (e.clientY - h / 2) + 'px';
        }
        return;
      }
      // Check if drag threshold reached
      const dx = e.clientX - dtcStartX;
      const dy = e.clientY - dtcStartY;
      if (Math.sqrt(dx * dx + dy * dy) >= DTC_DRAG_THRESHOLD) {
        dtcActive = true;
        createDtcGhost(dtcTool);
        const [w, h] = DTC_SIZES[dtcTool] || [100, 80];
        dtcGhost.style.left = (e.clientX - w / 2) + 'px';
        dtcGhost.style.top = (e.clientY - h / 2) + 'px';
      }
    });

    document.addEventListener('pointerup', (e) => {
      if (!dtcActive) {
        dtcTool = ''; // Reset drag tracking
        return;
      }
      // Remove ghost
      if (dtcGhost) { dtcGhost.remove(); dtcGhost = null; }
      // Check if dropped over canvas
      const canvasEl = document.getElementById('fd-canvas');
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          // Convert screen → scene coords
          const sceneX = ((e.clientX - rect.left) - panX) / zoomLevel;
          const sceneY = ((e.clientY - rect.top) - panY) / zoomLevel;
          const [w, h] = DTC_SIZES[dtcTool] || [100, 80];
          insertShapeAt(dtcTool, sceneX - w / 2, sceneY - h / 2);
        } else {
          showToast('Drop on canvas to create shape');
        }
      }
      dtcActive = false;
      dtcTool = '';
    });

    // ── Insert Menu (+  button) ───────────────────────────────────────
    const insertBtn = document.getElementById('insert-btn');
    const insertMenu = document.getElementById('insert-menu');
    if (insertBtn && insertMenu) {
      insertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = insertMenu.classList.contains('visible');
        if (isOpen) {
          insertMenu.classList.remove('visible');
        } else {
          // Position menu relative to button, adapting to toolbar edge
          const btnRect = insertBtn.getBoundingClientRect();
          const toolbarEl = document.getElementById('floating-toolbar');
          const toolbarRect = toolbarEl ? toolbarEl.getBoundingClientRect() : btnRect;
          // Reset positioning
          insertMenu.style.left = '';
          insertMenu.style.right = '';
          insertMenu.style.top = '';
          insertMenu.style.bottom = '';
          if (toolbarEl?.classList.contains('toolbar-docked-bottom')) {
            // Open above when toolbar at bottom
            insertMenu.style.left = (btnRect.left - toolbarRect.left) + 'px';
            insertMenu.style.bottom = (toolbarRect.bottom - btnRect.top + 4) + 'px';
          } else if (toolbarEl?.classList.contains('toolbar-docked-left')) {
            // Open to the right when toolbar at left
            insertMenu.style.left = (toolbarRect.right - toolbarRect.left + 4) + 'px';
            insertMenu.style.top = (btnRect.top - toolbarRect.top) + 'px';
          } else if (toolbarEl?.classList.contains('toolbar-docked-right')) {
            // Open to the left when toolbar at right
            insertMenu.style.right = (toolbarRect.right - toolbarRect.left + 4) + 'px';
            insertMenu.style.top = (btnRect.top - toolbarRect.top) + 'px';
          } else {
            // Default: open below (toolbar at top or floating)
            insertMenu.style.left = (btnRect.left - toolbarRect.left) + 'px';
            insertMenu.style.top = (btnRect.bottom - toolbarRect.top + 4) + 'px';
          }
          insertMenu.classList.add('visible');
        }
      });

      // Menu item click → insert shape at center
      insertMenu.querySelectorAll('.insert-menu-item[data-insert]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const type = item.dataset.insert;
          insertShapeAtCenter(type);
          insertMenu.classList.remove('visible');
        });
      });

      // Close menu on outside click
      document.addEventListener('pointerdown', (e) => {
        if (!insertMenu.contains(e.target) && e.target !== insertBtn) {
          insertMenu.classList.remove('visible');
        }
      });
    }

    // ── Toolbar: Drag-to-snap + Minimize ──────────────────────────────────
    const toolbar = document.getElementById('floating-toolbar');
    if (toolbar) {
      // ── Snap indicator element ──
      let snapIndicator = document.createElement('div');
      snapIndicator.className = 'toolbar-snap-indicator';
      snapIndicator.style.display = 'none';
      document.body.appendChild(snapIndicator);

      // Track drag state
      let isDragging = false;
      let gripPointerDown = false; // true between pointerdown and pointerup on grip
      let dragStartX = 0, dragStartY = 0;
      let toolbarStartX = 0, toolbarStartY = 0;
      const pointerHistory = [];
      const SNAP_THRESHOLD = 60;
      const SNAP_GAP = 10;
      const GRIP_DRAG_THRESHOLD = 5; // minimum px before grip counts as drag

      /** Get the visible canvas bounding rect (excludes area behind panels) */
      function getCanvasRect() {
        const c = document.getElementById('fd-canvas');
        if (!c) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
        const cr = c.getBoundingClientRect();
        // The canvas grid column can extend behind panels (higher z-index).
        // Narrow the rect to the actual visible area between panels.
        const lp = document.getElementById('left-panel');
        const rp = document.getElementById('right-panel');
        let left = cr.left;
        let right = cr.right;
        if (lp) {
          const lpRight = lp.getBoundingClientRect().right;
          if (lpRight > left) left = lpRight;
        }
        if (rp) {
          const rpLeft = rp.getBoundingClientRect().left;
          if (rpLeft < right) right = rpLeft;
        }
        return { left, top: cr.top, right, bottom: cr.bottom, width: right - left, height: cr.height };
      }

      /** Detect which edge the pointer is near (relative to canvas, not window) */
      function getSnapSide(x, y) {
        const cr = getCanvasRect();
        if (y < cr.top + SNAP_THRESHOLD) return 'top';
        if (y > cr.bottom - SNAP_THRESHOLD) return 'bottom';
        if (x < cr.left + SNAP_THRESHOLD) return 'left';
        if (x > cr.right - SNAP_THRESHOLD) return 'right';
        return null;
      }

      /** Track user's preferred side (for restoring after overflow) */
      let preferredSide = null;

      /** Position toolbar on an edge at (dropX, dropY), clamped within canvas */
      function applySnapPosition(side, dropX, dropY, isAutoOverflow) {
        toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right', 'toolbar-dragging', 'toolbar-floating');
        toolbar.style.cssText = '';
        toolbar.style.visibility = 'visible'; // preserve — CSS default is hidden
        toolbar.classList.add(`toolbar-docked-${side}`);
        document.documentElement.dataset.toolbar = side;

        // Measure toolbar after class is applied (so flex-direction is correct)
        const tbRect = toolbar.getBoundingClientRect();
        const cr = getCanvasRect();

        // Auto-snap to vertical left if horizontal toolbar overflows canvas width
        if ((side === 'top' || side === 'bottom') && tbRect.width > cr.width - 2 * SNAP_GAP) {
          if (!isAutoOverflow) preferredSide = side; // remember user's preferred side
          toolbar.classList.remove(`toolbar-docked-${side}`);
          return applySnapPosition('left', null, dropY, true);
        }

        if (side === 'top' || side === 'bottom') {
          // Horizontal — clamp left position within canvas
          let left = (dropX != null) ? dropX - tbRect.width / 2 : cr.left + (cr.width - tbRect.width) / 2;
          left = Math.max(cr.left + SNAP_GAP, Math.min(left, cr.right - tbRect.width - SNAP_GAP));
          toolbar.style.position = 'fixed';
          toolbar.style.left = left + 'px';
          toolbar.style.top = side === 'top' ? (cr.top + SNAP_GAP) + 'px' : (cr.bottom - tbRect.height - SNAP_GAP) + 'px';
          toolbar.style.transform = 'none';
        } else {
          // Vertical — clamp top position within canvas
          let top = (dropY != null) ? dropY - tbRect.height / 2 : cr.top + (cr.height - tbRect.height) / 2;
          top = Math.max(cr.top + SNAP_GAP, Math.min(top, cr.bottom - tbRect.height - SNAP_GAP));
          toolbar.style.position = 'fixed';
          toolbar.style.top = top + 'px';
          toolbar.style.left = side === 'left' ? (cr.left + SNAP_GAP) + 'px' : (cr.right - tbRect.width - SNAP_GAP) + 'px';
          toolbar.style.transform = 'none';
        }

        // Persist side + drop coordinates for restore
        if (!isAutoOverflow) {
          preferredSide = null; // user explicitly chose this side
          localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side, x: dropX, y: dropY }));
        }

        // Collision-based minimap shift (replaces blanket CSS bottom offset)
        requestAnimationFrame(() => adjustMinimapForToolbar());
      }

      /** Position toolbar at a free-floating point on canvas, clamped within bounds */
      function applyFloatingPosition(dropX, dropY) {
        toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right', 'toolbar-dragging', 'toolbar-floating');
        toolbar.style.cssText = '';
        toolbar.style.visibility = 'visible';
        // Keep whatever orientation was last (horizontal by default)
        toolbar.classList.add('toolbar-floating');
        document.documentElement.dataset.toolbar = 'floating';

        const tbRect = toolbar.getBoundingClientRect();
        const cr = getCanvasRect();

        // If toolbar doesn't fit horizontally, auto-dock to nearest vertical edge
        if (tbRect.width > cr.width - 2 * SNAP_GAP) {
          const cx = dropX || (cr.left + cr.width / 2);
          const cy = dropY || (cr.top + cr.height / 2);
          const distLeft = Math.abs(cx - cr.left);
          const distRight = Math.abs(cx - cr.right);
          applySnapPosition(distLeft <= distRight ? 'left' : 'right', cx, cy);
          return;
        }

        // Clamp within canvas bounds
        let left = dropX - tbRect.width / 2;
        let top = dropY - tbRect.height / 2;
        left = Math.max(cr.left + SNAP_GAP, Math.min(left, cr.right - tbRect.width - SNAP_GAP));
        top = Math.max(cr.top + SNAP_GAP, Math.min(top, cr.bottom - tbRect.height - SNAP_GAP));

        toolbar.style.position = 'fixed';
        toolbar.style.left = left + 'px';
        toolbar.style.top = top + 'px';
        toolbar.style.transform = 'none';

        preferredSide = null;
        localStorage.setItem('fd-toolbar-pos', JSON.stringify({ side: 'floating', x: dropX, y: dropY }));

        requestAnimationFrame(() => adjustMinimapForToolbar());
      }

      /** Re-clamp toolbar to canvas bounds (call on panel toggle / resize) */
      function reclampToolbar() {
        if (isDragging) return;
        const saved = parseToolbarPos();
        if (saved && saved.side === 'floating') {
          // Re-clamp floating toolbar within current canvas bounds.
          // applyFloatingPosition already clamps to canvas rect, so this
          // handles both "canvas shrank" and "toolbar overflows" cases.
          // Use DOM center as the reference point (saved x/y may be stale).
          const tbRect = toolbar.getBoundingClientRect();
          const cx = tbRect.left + tbRect.width / 2;
          const cy = tbRect.top + tbRect.height / 2;
          applyFloatingPosition(cx, cy);
        } else {
          // Docked — re-clamp as before
          const tryPreferred = preferredSide || (saved ? saved.side : 'bottom');
          if (saved) applySnapPosition(tryPreferred, saved.x, saved.y);
        }
        // Also re-check minimap collision
        requestAnimationFrame(() => adjustMinimapForToolbar());
      }
      // Expose for panel toggle code to call
      window.__fdReclampToolbar = reclampToolbar;

      /** Parse saved toolbar position with migration from old string format */
      function parseToolbarPos() {
        const raw = localStorage.getItem('fd-toolbar-pos');
        if (!raw) return { side: 'bottom', x: null, y: null };
        try {
          const obj = JSON.parse(raw);
          if (obj && obj.side) return obj;
        } catch (_) {}
        // Migration: old format was just a string like 'top'
        if (['top', 'bottom', 'left', 'right', 'floating'].includes(raw)) {
          return { side: raw, x: null, y: null };
        }
        return { side: 'bottom', x: null, y: null };
      }

      function showSnapIndicator(side, pointerX, pointerY, grabOffsetX, grabOffsetY) {
        if (side) {
          // Measure toolbar to create a ghost silhouette
          const tbRect = toolbar.getBoundingClientRect();
          const cr = getCanvasRect();
          const isVert = (side === 'left' || side === 'right');
          // Ghost dimensions: swap if orientation will change
          const currentIsVert = getComputedStyle(toolbar).flexDirection === 'column';
          let gw = tbRect.width, gh = tbRect.height;
          if (isVert !== currentIsVert) {
            // Estimate: swap aspect ratio for ghost preview
            gw = tbRect.height > 400 ? 44 : tbRect.height > 200 ? 40 : 38;
            gh = tbRect.width > 400 ? tbRect.width : tbRect.height;
            if (!isVert) { gw = tbRect.height > 400 ? tbRect.height : tbRect.width; gh = 44; }
          }
          snapIndicator.style.display = 'block';
          snapIndicator.style.width = gw + 'px';
          snapIndicator.style.height = gh + 'px';
          // Preserve grab offset so shadow lines up with where the toolbar will land.
          // For the sliding axis, use the grab offset ratio (how far along the toolbar
          // the user grabbed). For orientation changes, scale the offset proportionally.
          const grabRatioX = grabOffsetX / (tbRect.width || 1);
          const grabRatioY = grabOffsetY / (tbRect.height || 1);
          const offsetAlongW = grabRatioX * gw;
          const offsetAlongH = grabRatioY * gh;
          // Position the ghost at the snap destination — aligned to grab position
          if (side === 'top') {
            const left = Math.max(cr.left + SNAP_GAP, Math.min(pointerX - offsetAlongW, cr.right - gw - SNAP_GAP));
            snapIndicator.style.left = left + 'px';
            snapIndicator.style.top = (cr.top + SNAP_GAP) + 'px';
          } else if (side === 'bottom') {
            const left = Math.max(cr.left + SNAP_GAP, Math.min(pointerX - offsetAlongW, cr.right - gw - SNAP_GAP));
            snapIndicator.style.left = left + 'px';
            snapIndicator.style.top = (cr.bottom - gh - SNAP_GAP) + 'px';
          } else if (side === 'left') {
            const top = Math.max(cr.top + SNAP_GAP, Math.min(pointerY - offsetAlongH, cr.bottom - gh - SNAP_GAP));
            snapIndicator.style.left = (cr.left + SNAP_GAP) + 'px';
            snapIndicator.style.top = top + 'px';
          } else if (side === 'right') {
            const top = Math.max(cr.top + SNAP_GAP, Math.min(pointerY - offsetAlongH, cr.bottom - gh - SNAP_GAP));
            snapIndicator.style.left = (cr.right - gw - SNAP_GAP) + 'px';
            snapIndicator.style.top = top + 'px';
          }
        } else {
          snapIndicator.style.display = 'none';
        }
      }

      // ── Drag start ──
      toolbar.querySelectorAll('.toolbar-grip').forEach(grip => {
        grip.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Deferred drag: only record start position, don't enter drag mode yet.
          // Drag mode activates in pointermove after exceeding GRIP_DRAG_THRESHOLD.
          // This prevents visual jumps on click/double-click.
          gripPointerDown = true;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          const rect = toolbar.getBoundingClientRect();
          toolbarStartX = rect.left;
          toolbarStartY = rect.top;
          pointerHistory.length = 0;
          grip.setPointerCapture(e.pointerId);
        });

        // ── Double-click to minimize/expand ──
        grip.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          e.preventDefault();
          // Read the ACTUAL current side from the toolbar's CSS class, not localStorage.
          // localStorage may be stale (e.g., default 'bottom' when toolbar is visually
          // on 'left' due to auto-overflow or initialization).
          const isFloating = toolbar.classList.contains('toolbar-floating');
          const currentSide = isFloating ? 'floating'
            : toolbar.classList.contains('toolbar-docked-left') ? 'left'
            : toolbar.classList.contains('toolbar-docked-right') ? 'right'
            : toolbar.classList.contains('toolbar-docked-top') ? 'top'
            : 'bottom';
          // Capture current center BEFORE size change — applySnapPosition uses
          // dropX/Y to compute left = dropX - width/2. When width changes on
          // minimize, position shifts. Using current center keeps it anchored.
          const tbRect = toolbar.getBoundingClientRect();
          const cx = tbRect.left + tbRect.width / 2;
          const cy = tbRect.top + tbRect.height / 2;
          toolbar.classList.toggle('toolbar-minimized');
          localStorage.setItem('fd-toolbar-minimized', toolbar.classList.contains('toolbar-minimized') ? '1' : '0');
          // Re-position synchronously with center anchor
          if (currentSide === 'floating') {
            applyFloatingPosition(cx, cy);
          } else {
            applySnapPosition(currentSide, cx, cy);
          }
          adjustMinimapForToolbar();
        });
      });

      // ── Drag move ──
      document.addEventListener('pointermove', (e) => {
        // Deferred drag start — enter drag mode only after exceeding threshold
        if (gripPointerDown && !isDragging) {
          const dx = e.clientX - dragStartX;
          const dy = e.clientY - dragStartY;
          if (Math.sqrt(dx * dx + dy * dy) >= GRIP_DRAG_THRESHOLD) {
            isDragging = true;
            const currentDirection = getComputedStyle(toolbar).flexDirection;
            toolbar.classList.remove('toolbar-docked-top', 'toolbar-docked-bottom', 'toolbar-docked-left', 'toolbar-docked-right');
            toolbar.classList.add('toolbar-dragging');
            toolbar.style.left = toolbarStartX + 'px';
            toolbar.style.top = toolbarStartY + 'px';
            toolbar.style.transform = 'none';
            toolbar.style.right = 'auto';
            toolbar.style.bottom = 'auto';
            toolbar.style.flexDirection = currentDirection;
          }
          return;
        }
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        toolbar.style.left = (toolbarStartX + dx) + 'px';
        toolbar.style.top = (toolbarStartY + dy) + 'px';

        // Track velocity
        pointerHistory.push({ x: e.clientX, y: e.clientY, t: Date.now() });
        if (pointerHistory.length > 5) pointerHistory.shift();

        // Show snap indicator (canvas-aware) — follows pointer along edge
        // Pass grab offset so shadow lines up with toolbar, not centered on cursor
        const grabOffX = dragStartX - toolbarStartX;
        const grabOffY = dragStartY - toolbarStartY;
        showSnapIndicator(getSnapSide(e.clientX, e.clientY), e.clientX, e.clientY, grabOffX, grabOffY);
      });

      // ── Drag end / snap ──
      document.addEventListener('pointerup', (e) => {
        // Grip click (no drag) — toolbar never left docked state, just clear flag
        if (gripPointerDown && !isDragging) {
          gripPointerDown = false;
          return;
        }
        if (!isDragging) return;
        isDragging = false;
        gripPointerDown = false;
        showSnapIndicator(null);

        // Check velocity for throw
        let side = getSnapSide(e.clientX, e.clientY);
        if (!side && pointerHistory.length >= 2) {
          const last = pointerHistory[pointerHistory.length - 1];
          const prev = pointerHistory[0];
          const dt = (last.t - prev.t) / 1000;
          if (dt > 0) {
            const vx = (last.x - prev.x) / dt;
            const vy = (last.y - prev.y) / dt;
            const speed = Math.sqrt(vx * vx + vy * vy);
            if (speed > 500) {
              if (Math.abs(vx) > Math.abs(vy)) {
                side = vx > 0 ? 'right' : 'left';
              } else {
                side = vy > 0 ? 'bottom' : 'top';
              }
            }
          }
        }

        if (side) {
          applySnapPosition(side, e.clientX, e.clientY);
        } else {
          // No snap detected — let toolbar float freely on canvas
          applyFloatingPosition(e.clientX, e.clientY);
        }
      });

      // ── Restore saved state (suppress transition to avoid startup jump) ──
      toolbar.style.transition = 'none';
      const savedPos = parseToolbarPos();
      if (savedPos.side === 'floating') {
        applyFloatingPosition(savedPos.x, savedPos.y);
      } else {
        applySnapPosition(savedPos.side, savedPos.x, savedPos.y);
      }
      toolbar.style.visibility = 'visible'; // reveal after JS positioned it
      if (localStorage.getItem('fd-toolbar-minimized') === '1') {
        toolbar.classList.add('toolbar-minimized');
      }
      // Double-rAF: re-enable transitions at the same frame as
      // init-no-transition removal (line ~5210) to prevent leaking animations
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { toolbar.style.transition = ''; });
      });

      // ── Re-clamp on window resize ──
      window.addEventListener('resize', () => requestAnimationFrame(() => reclampToolbar()));
    }

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
      fdCanvas.set_node_prop('stroke', e.target.value);
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
      const editorFocused = editorView?.hasFocus ?? false;

      // Space → pan mode
      if (e.code === 'Space' && !e.repeat && !editorFocused) {
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
      if (!editorFocused && e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        gridEnabled = !gridEnabled;
        renderCanvas();
        e.preventDefault();
        return;
      }

      // Reduce Motion toggle (Shift+M)
      if (!editorFocused && e.key === 'M' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const manual = localStorage.getItem('fd-reduce-motion') === 'true';
        localStorage.setItem('fd-reduce-motion', manual ? 'false' : 'true');
        reduceMotion = !manual || prefersReducedMotion.matches;
        document.body.classList.toggle('reduce-motion', !manual);
        showToast(reduceMotion ? 'Reduce Motion: ON' : 'Reduce Motion: OFF');
        e.preventDefault();
        return;
      }

      // Tool shortcuts (only when canvas focused)
      if (!editorFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
      if (!editorFocused && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          nudgeSelected(e.key, step);
          return;
        }
      }

      // Delete (only when canvas focused)
      if (!editorFocused && (e.key === 'Delete' || e.key === 'Backspace')) {
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
      if (e.key === 'Alt') canvas.classList.remove('modifier-alt');
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
      fitToContent(canvas);
      renderCanvas();
      renderMinimap(canvas);
    });



    // ── Chrome Dropdowns (unified settings gear) ─────────────────────────
    const settingsGearBtn = document.getElementById('settings-gear-btn');
    const settingsDropdown = document.getElementById('settings-dropdown');

    function updateSettingsToggles() {
      document.getElementById('sm-sketchy-toggle')?.classList.toggle('toggle-on', isSketchy);
      document.getElementById('sm-grid-toggle')?.classList.toggle('toggle-on', gridEnabled);
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

    // ── Search Panel ─────────────────────────────────────────────
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const searchCount = document.getElementById('search-count');

    function performSearch(query) {
      if (!searchResults) return;
      if (!query || query.length < 2) {
        searchResults.innerHTML = '<div class="search-empty">Search your document by node ID, text content, or style name.</div>';
        if (searchCount) searchCount.textContent = '';
        return;
      }
      const qLower = query.toLowerCase();
      const text = editorView ? editorView.state.doc.toString() : '';
      const lines = text.split('\n');
      const results = [];

      lines.forEach((line, i) => {
        if (line.toLowerCase().includes(qLower)) {
          // Extract @id if present
          const idMatch = line.match(/@([\w-]+)/);
          const trimmed = line.trim();
          results.push({
            lineNum: i + 1,
            id: idMatch ? idMatch[1] : null,
            context: trimmed.substring(0, 80),
            offset: editorView ? editorView.state.doc.line(i + 1).from : 0
          });
        }
      });

      if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-empty">No matches found.</div>';
        if (searchCount) searchCount.textContent = '0';
        return;
      }

      if (searchCount) searchCount.textContent = results.length + ' found';
      searchResults.innerHTML = results.map((r, idx) => `
        <div class="search-result-item" data-offset="${r.offset}" data-line="${r.lineNum}" data-index="${idx}">
          <span class="search-result-id">${r.id ? '@' + r.id : 'Line ' + r.lineNum}</span>
          <span class="search-result-context">${escapeHtml(r.context)}</span>
          <span class="search-result-line">L${r.lineNum}</span>
        </div>
      `).join('');

      // Click handler for results
      searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const offset = parseInt(item.dataset.offset, 10);
          const lineNum = parseInt(item.dataset.line, 10);
          // Highlight in CodeMirror
          if (editorView) {
            const line = editorView.state.doc.line(lineNum);
            editorView.dispatch({
              selection: { anchor: line.from, head: line.to },
              scrollIntoView: true
            });
          }
          // Select node on canvas if @id exists
          const id = item.querySelector('.search-result-id')?.textContent;
          if (id && id.startsWith('@') && fdCanvas) {
            try { fdCanvas.select_node(id.slice(1)); } catch (_) {}
            renderDirty = true;
            renderCanvas();
          }
          // Mark active
          searchResults.querySelectorAll('.search-result-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        });
      });
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    searchInput?.addEventListener('input', () => {
      performSearch(searchInput.value);
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

    // ── Tauri Desktop Integration ──────────────────────────────────────
    // Detect Tauri runtime and wire native file I/O shortcuts.
    // On web (non-Tauri), this entire block is skipped.
    const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
    if (isTauri) {
      let currentFilePath = null;

      /** Update window title to show the current file name. */
      function updateTitle(filePath) {
        if (filePath) {
          const name = filePath.split('/').pop().split('\\').pop();
          document.title = `${name} — Fast Draft`;
        } else {
          document.title = 'Fast Draft';
        }
      }

      /** Open a .fd file via native file dialog. */
      async function tauriOpen() {
        try {
          const { invoke } = window.__TAURI_INTERNALS__ || window.__TAURI__;
          // Open file dialog via IPC
          const { open } = await import('https://unpkg.com/@tauri-apps/plugin-dialog@2/dist-js/index.mjs');
          const result = await open({
            multiple: false,
            filters: [{ name: 'Fast Draft', extensions: ['fd'] }],
          });
          if (!result) return; // user cancelled
          const path = typeof result === 'string' ? result : result.path;
          const content = await invoke('open_file', { path });
          await invoke('add_recent_file', { path });
          currentFilePath = path;
          updateTitle(path);
          // Load content into editor + canvas
          if (editorView) {
            editorView.dispatch({
              changes: { from: 0, to: editorView.state.doc.length, insert: content },
            });
          }
          showToast('Opened: ' + path.split('/').pop().split('\\').pop());
        } catch (e) {
          console.error('Tauri open failed:', e);
          showToast('Failed to open file');
        }
      }

      /** Save to current file (or prompt Save As). */
      async function tauriSave() {
        if (!currentFilePath) return tauriSaveAs();
        try {
          const { invoke } = window.__TAURI_INTERNALS__ || window.__TAURI__;
          const content = editorView ? editorView.state.doc.toString() : '';
          await invoke('save_file', { path: currentFilePath, content });
          showToast('Saved');
        } catch (e) {
          console.error('Tauri save failed:', e);
          showToast('Failed to save');
        }
      }

      /** Save As — prompt for new file path. */
      async function tauriSaveAs() {
        try {
          const { invoke } = window.__TAURI_INTERNALS__ || window.__TAURI__;
          const { save } = await import('https://unpkg.com/@tauri-apps/plugin-dialog@2/dist-js/index.mjs');
          const path = await save({
            filters: [{ name: 'Fast Draft', extensions: ['fd'] }],
          });
          if (!path) return; // user cancelled
          const content = editorView ? editorView.state.doc.toString() : '';
          await invoke('save_file', { path, content });
          await invoke('add_recent_file', { path });
          currentFilePath = path;
          updateTitle(path);
          showToast('Saved: ' + path.split('/').pop().split('\\').pop());
        } catch (e) {
          console.error('Tauri save-as failed:', e);
          showToast('Failed to save');
        }
      }

      // Wire ⌘O, ⌘S, ⌘⇧S
      document.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;

        if (e.key === 'o' && !e.shiftKey) {
          e.preventDefault();
          tauriOpen();
        } else if (e.key === 's' && !e.shiftKey) {
          e.preventDefault();
          tauriSave();
        } else if (e.key === 's' && e.shiftKey) {
          e.preventDefault();
          tauriSaveAs();
        }
      });

      // Check if launched with a file argument
      (async () => {
        try {
          const { invoke } = window.__TAURI_INTERNALS__ || window.__TAURI__;
          const path = await invoke('get_current_file');
          if (path) {
            currentFilePath = path;
            updateTitle(path);
          }
        } catch (_) { /* no file on launch */ }
      })();

      // ── Auto-update check ──────────────────────────────────────────
      // Check for updates 10s after launch (non-blocking).
      // Shows a toast if a new version is available.
      setTimeout(async () => {
        try {
          const { check } = await import('https://unpkg.com/@tauri-apps/plugin-updater@2/dist-js/index.mjs');
          const update = await check();
          if (update) {
            console.log(`[FD] Update available: v${update.version}`);
            // Show persistent toast with update action
            const toast = document.createElement('div');
            toast.className = 'fd-update-toast';
            toast.innerHTML = `
              <span>Fast Draft v${update.version} available</span>
              <button id="fd-update-btn">Update Now</button>
              <button id="fd-update-dismiss" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;padding:4px;">✕</button>
            `;
            document.body.appendChild(toast);
            // Trigger animation
            requestAnimationFrame(() => toast.classList.add('visible'));

            document.getElementById('fd-update-dismiss')?.addEventListener('click', () => {
              toast.classList.remove('visible');
              setTimeout(() => toast.remove(), 300);
            });

            document.getElementById('fd-update-btn')?.addEventListener('click', async () => {
              const btn = document.getElementById('fd-update-btn');
              btn.textContent = 'Downloading…';
              btn.disabled = true;
              try {
                await update.downloadAndInstall((progress) => {
                  if (progress?.event === 'Started' && progress.data?.contentLength) {
                    btn.textContent = 'Downloading… 0%';
                  } else if (progress?.event === 'Progress') {
                    // Progress updates
                  } else if (progress?.event === 'Finished') {
                    btn.textContent = 'Restarting…';
                  }
                });
                // Restart the app after update
                const { relaunch } = await import('https://unpkg.com/@tauri-apps/plugin-process@2/dist-js/index.mjs');
                await relaunch();
              } catch (err) {
                console.error('[FD] Update failed:', err);
                btn.textContent = 'Update Failed';
                showToast('Update failed — try again later');
              }
            });
          } else {
            console.log('[FD] App is up to date');
          }
        } catch (err) {
          // Silently ignore update check failures (network error, no release, etc.)
          console.debug('[FD] Update check skipped:', err.message || err);
        }
      }, 10000);

      console.log('[FD] Tauri desktop mode — ⌘O/⌘S/⌘⇧S enabled');
    }

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
