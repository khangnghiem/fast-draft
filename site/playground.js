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

    // Animation/note keywords
    if (stream.match(/^(when|anim|note|spec)\b/)) return 'keyword';

    // Property names followed by colon
    if (stream.match(/^(w|h|x|y|fill|stroke|font|corner|opacity|shadow|bg|layout|use|center_in|offset|gap|pad|scale|rotate|translate|ease|duration|cols|from|to|src|alt|align|clip|arrow|curve|flow|place|d|label_offset)\s*:/)) {
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

const DEFAULT_FD = `# A card with a button that reacts on hover

style accent {
  fill: #6C5CE7
}

frame @card {
  w: 260 h: 160
  layout: column gap=16 pad=24
  bg: #FFF corner=12 shadow=(0,4,20,#0002)

  text @title "Hello World" {
    font: "Inter" bold 24
    fill: #1A1A2E
  }

  rect @button {
    w: 200 h: 48
    corner: 10
    use: accent

    when :hover {
      fill: #5A4BD1
      scale: 1.02
      ease: spring 300ms
    }
  }
}

@card -> center_in: canvas`;

// ─── State ───────────────────────────────────────────────────────────────
let fdCanvas = null;
let ctx = null;
let isDark = localStorage.getItem('fd-canvas-theme') !== 'light'; // Default dark
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
let zoomLevel = 1.0;
let gridEnabled = false;
const GRID_SPACING = 20;
let zenMode = false;

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

/** Get current layers panel width (dynamic for resize). */
function getLayersPanelWidth() {
  const panel = document.getElementById('layers-panel');
  return panel ? panel.offsetWidth : 0;
}
/** Get current props panel width (dynamic for resize). */
function getPropsPanelWidth() {
  const panel = document.getElementById('props-panel');
  return (panel && panel.classList.contains('visible')) ? panel.offsetWidth : 0;
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

/** Toggle full-screen mode (expands playground to fill entire viewport) */
function toggleFullscreen() {
  fullscreenMode = !fullscreenMode;
  document.body.classList.toggle('fullscreen-mode', fullscreenMode);
  const btn = document.getElementById('fullscreen-toggle-btn');
  if (btn) {
    btn.textContent = fullscreenMode ? '✕' : '⛶';
    btn.title = fullscreenMode ? 'Exit Full Screen (Esc)' : 'Full Screen (⇧F)';
    btn.classList.toggle('fs-active', fullscreenMode);
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}

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

  // Hide FAB when props panel is visible
  const propsPanel = document.getElementById('props-panel');
  if (propsPanel?.classList.contains('visible')) { fab.classList.remove('visible'); return; }

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

/** ─── Properties Panel ──────────────────────────────────────────────── */
let propsSuppressSync = false;

function updatePropertiesPanel() {
  const panel = document.getElementById('props-panel');
  if (!panel || !fdCanvas) { panel?.classList.remove('visible'); adjustMinimapForProps(false); return; }

  // #4: Check for multi-selection
  const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
  const isMulti = selectedIds.length > 1;

  if (isMulti) {
    // Multi-selection: show count and appearance controls only
    propsSuppressSync = true;
    panel.classList.add('visible');
    adjustMinimapForProps(true);

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
  try { props = JSON.parse(json); } catch (_) { panel.classList.remove('visible'); adjustMinimapForProps(false); return; }

  if (!props.id) {
    panel.classList.remove('visible');
    adjustMinimapForProps(false);
    return;
  }

  propsSuppressSync = true;
  panel.classList.add('visible');
  adjustMinimapForProps(true);

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
  const text = fdCanvas.get_text();
  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) return;

  const block = extractNodeBlock(text, selectedId);
  if (!block) return;

  fdClipboard = block;
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

/** Paste node(s) from the FD clipboard with horizontal stagger. */
async function pasteFromClipboard() {
  if (!fdCanvas) return;

  // Try system clipboard, fall back to internal
  let clipText = fdClipboard;
  try {
    if (navigator.clipboard) {
      const sysText = await navigator.clipboard.readText();
      if (sysText && sysText.includes('@')) clipText = sysText;
    }
  } catch (_) { /* permission denied */ }
  if (!clipText.trim()) return;

  pasteOffsetCount++;

  // Collect all @id declarations
  const idPattern = /@(\w+)\s*\{/g;
  const allIds = new Set();
  let m;
  while ((m = idPattern.exec(clipText)) !== null) allIds.add(m[1]);
  // Also match @id with quoted text: rect @foo "text" {
  const idPattern2 = /@(\w+)\s+"[^"]*"\s*\{/g;
  while ((m = idPattern2.exec(clipText)) !== null) allIds.add(m[1]);
  // Also match typed nodes: rect @id { or ellipse @id {
  const idPattern3 = /(?:rect|ellipse|text|group|frame|path|edge)\s+@(\w+)/g;
  while ((m = idPattern3.exec(clipText)) !== null) allIds.add(m[1]);
  if (allIds.size === 0) return;

  // Rename IDs to avoid conflicts
  const existingText = fdCanvas.get_text();
  let pasteText = clipText;
  const rootId = [...allIds][0];
  const idMap = new Map();

  for (const oldId of allIds) {
    const stem = oldId.replace(/_(?:\d+|cp\d+)$/, '');
    let maxN = 0;
    const re = new RegExp(`@${stem}_(\\d+)\\b`, 'g');
    let match;
    while ((match = re.exec(existingText)) !== null) {
      maxN = Math.max(maxN, parseInt(match[1]));
    }
    if (new RegExp(`@${stem}\\b`).test(existingText)) maxN = Math.max(maxN, 1);
    idMap.set(oldId, stem + '_' + (maxN + 1));
  }

  for (const [oldId, newId] of idMap) {
    pasteText = pasteText.replace(new RegExp(`@${oldId}\\b`, 'g'), `@${newId}`);
  }
  const newRootId = idMap.get(rootId) || rootId;

  // Horizontal offset: place to the right with gap
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

/** ─── Context Menu ──────────────────────────────────────────────────── */
let contextMenuClickPos = null; // scene-space {x, y} of right-click

function closeContextMenu() {
  document.getElementById('ctx-menu')?.classList.remove('visible');
  document.getElementById('ctx-menu-canvas')?.classList.remove('visible');
  document.querySelector('.ctx-ai-touch-wrap')?.classList.remove('expanded');
}

/** Wire context menu events and action handlers. */
function setupContextMenu() {
  const nodeMenu = document.getElementById('ctx-menu');
  const canvasMenu = document.getElementById('ctx-menu-canvas');
  const canvas = document.getElementById('fd-canvas');
  if (!canvas) return;

  // Right-click on canvas
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!fdCanvas) return;

    const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
    const hitId = fdCanvas.hit_test_at(x, y);

    // Position helper (keep within viewport)
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let mx = e.clientX;
    let my = e.clientY;

    if (hitId) {
      // ── Node context menu ──
      // #1: Preserve multi-selection — only replace if hit node isn't already selected
      const currentIds = JSON.parse(fdCanvas.get_selected_ids());
      if (!currentIds.includes(hitId)) {
        fdCanvas.select_by_id(hitId);
      }
      renderCanvas();
      updateFab(canvas);
      updatePropertiesPanel();

      // Re-read selection after possible change
      const selectedIds = JSON.parse(fdCanvas.get_selected_ids());
      const selCount = selectedIds.length;
      const isMulti = selCount > 1;

      // #3: Selection count badge
      const badge = document.getElementById('ctx-selection-badge');
      if (badge) {
        if (isMulti) {
          badge.textContent = `${selCount} objects selected`;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }

      // #3: Multi-aware action labels
      const setLabel = (id, single, multi) => {
        const el = document.getElementById(id);
        if (el) {
          const shortcut = el.querySelector('.ctx-shortcut');
          const shortcutHtml = shortcut ? ` ${shortcut.outerHTML}` : '';
          el.innerHTML = (isMulti ? multi : single) + shortcutHtml;
        }
      };
      setLabel('ctx-del-btn', '🗑 Delete', `🗑 Delete ${selCount} items`);
      setLabel('ctx-dup-btn', '⧉ Duplicate', `⧉ Duplicate ${selCount} items`);
      setLabel('ctx-copy-btn', '📋 Copy', `📋 Copy ${selCount} items`);
      setLabel('ctx-cut-btn', '✂ Cut', `✂ Cut ${selCount} items`);

      // #3: Hide single-node-only items when multi-selected
      document.querySelectorAll('#ctx-menu .ctx-single-only').forEach(el => {
        el.style.display = isMulti ? 'none' : '';
      });

      // Update Lock button label (single only)
      if (!isMulti) {
        const lockBtn = document.getElementById('ctx-lock-site');
        if (lockBtn && fdCanvas.is_node_locked) {
          const isLocked = fdCanvas.is_node_locked(hitId);
          lockBtn.textContent = isLocked ? '\uD83D\uDD13 Unlock' : '\uD83D\uDD12 Lock';
        }
      }

      if (nodeMenu) {
        if (mx + 170 > vw) mx = vw - 174;
        if (my + 280 > vh) my = vh - 284;
        nodeMenu.style.left = mx + 'px';
        nodeMenu.style.top = my + 'px';
        canvasMenu?.classList.remove('visible');
        nodeMenu.classList.add('visible');
      }
    } else if (fdCanvas.hit_test_edge_at) {
      // ── Edge right-click → open edge properties panel ──
      const edgeHit = fdCanvas.hit_test_edge_at(x, y);
      if (edgeHit) {
        fdCanvas.select_by_id(edgeHit);
        renderCanvas();
        updatePropertiesPanel();
        // Show toast confirming the edge was selected
        showToast(`Selected edge @${edgeHit}`);
      } else {
        // ── Empty space context menu ──
        contextMenuClickPos = { x, y };
        if (canvasMenu) {
          if (mx + 170 > vw) mx = vw - 174;
          if (my + 220 > vh) my = vh - 224;
          canvasMenu.style.left = mx + 'px';
          canvasMenu.style.top = my + 'px';
          nodeMenu?.classList.remove('visible');
          canvasMenu.classList.add('visible');
        }
      }
    } else {
      // ── Empty space context menu ──
      contextMenuClickPos = { x, y };
      if (canvasMenu) {
        if (mx + 170 > vw) mx = vw - 174;
        if (my + 220 > vh) my = vh - 224;
        canvasMenu.style.left = mx + 'px';
        canvasMenu.style.top = my + 'px';
        nodeMenu?.classList.remove('visible');
        canvasMenu.classList.add('visible');
      }
    }
  });

  // ── Node menu action handlers (with undo snapshots) ──
  const doNodeAction = (action) => {
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
        // Find the closing brace of this node and insert note before it
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
      case 'ai-touch': {
        // Toggle submenu expansion instead of closing
        const wrap = document.querySelector('.ctx-ai-touch-wrap');
        if (wrap) {
          wrap.classList.toggle('expanded');
          // Restore saved prompt
          const promptEl = document.getElementById('ctx-ai-prompt');
          const counterEl = document.getElementById('ctx-ai-counter');
          if (promptEl) {
            const saved = localStorage.getItem('fd-ai-prompt') || '';
            promptEl.value = saved;
            if (counterEl) counterEl.textContent = `${saved.length}/200`;
            setTimeout(() => promptEl.focus(), 50);
          }
        }
        return; // Don't close the menu
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
      // Push undo snapshot for context menu mutations
      const textAfter = fdCanvas.get_text();
      if (textBefore !== textAfter) {
        fdCanvas.push_undo_snapshot(textBefore, textAfter);
      }
      renderCanvas();
      syncCanvasToEditor();
      updatePropertiesPanel();
      refreshLayersPanel();
    }
    closeContextMenu();
  };

  nodeMenu?.querySelectorAll('.ctx-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      doNodeAction(btn.getAttribute('data-action'));
    });
  });

  // ── AI Touch context menu prompt wiring ──
  const ctxAiPrompt = document.getElementById('ctx-ai-prompt');
  const ctxAiCounter = document.getElementById('ctx-ai-counter');
  const ctxAiRun = document.getElementById('ctx-ai-run');

  if (ctxAiPrompt) {
    // Live char counter + persist to localStorage
    ctxAiPrompt.addEventListener('input', () => {
      const len = ctxAiPrompt.value.length;
      if (ctxAiCounter) ctxAiCounter.textContent = `${len}/200`;
      localStorage.setItem('fd-ai-prompt', ctxAiPrompt.value);
    });
    // Prevent context menu from closing when clicking inside the textarea
    ctxAiPrompt.addEventListener('click', (e) => e.stopPropagation());
    ctxAiPrompt.addEventListener('mousedown', (e) => e.stopPropagation());
    // Ctrl+Enter or Enter (with empty prompt) to run
    ctxAiPrompt.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        closeContextMenu();
        aiTouch();
      }
    });
  }

  if (ctxAiRun) {
    ctxAiRun.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      aiTouch();
    });
  }

  // ── Canvas (empty space) menu action handlers ──
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
        // Zoom to fit content
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
    closeContextMenu();
  };

  canvasMenu?.querySelectorAll('.ctx-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      doCanvasAction(btn.getAttribute('data-action'));
    });
  });

  // Dismiss on outside click, escape, scroll
  document.addEventListener('click', (e) => {
    if (!nodeMenu?.contains(e.target) && !canvasMenu?.contains(e.target)) closeContextMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeContextMenu();
      // Exit fullscreen mode on Escape
      if (fullscreenMode) {
        toggleFullscreen();
      } else if (zenMode) {
        // Exit Zen mode on Escape
        zenMode = false;
        document.querySelector('.hero-playground')?.classList.remove('zen-mode');
        const zb = document.getElementById('zen-toggle-btn');
        if (zb) { zb.textContent = '🧘'; zb.title = 'Zen Mode (Esc)'; }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      }
    }
    // Shift+F → toggle fullscreen
    if (e.key === 'F' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    // ⌘⇧N (Ctrl+Shift+N) → toggle Notes panel
    if (e.key === 'N' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      toggleNotesPanel();
    }
  });
  canvas.addEventListener('pointerdown', closeContextMenu);
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

    // Edge
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      const node = { id: edgeMatch[1], kind: 'edge', text: '', children: [] };
      if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
      else root.push(node);
      braceDepth += openBraces - closeBraces;
      stack.push({ node, depth: braceDepth });
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
function renderLayerNode(node, selectedId, depth = 0) {
  const icon = LAYER_ICONS[node.kind] || '•';
  const isSelected = node.id === selectedId;
  const hasChildren = node.children.length > 0;

  let indent = '';
  for (let i = 0; i < depth; i++) indent += '<span class="layer-indent-guide"></span>';

  const chevronClass = hasChildren ? 'layer-chevron expanded' : 'layer-chevron empty';
  const chevron = `<span class="${chevronClass}" data-toggle-id="${escHtml(node.id)}">▶</span>`;

  let html = `<div class="layer-item${isSelected ? ' selected' : ''}" data-node-id="${escHtml(node.id)}">`;
  html += `<span class="layer-indent">${indent}</span>`;
  html += chevron;
  html += `<span class="layer-icon">${icon}</span>`;
  html += `<span class="layer-name">${escHtml(node.id)}</span>`;
  html += `<span class="layer-kind">${escHtml(node.kind)}</span>`;
  html += '</div>';

  if (hasChildren) {
    html += `<div class="layer-children" data-parent-id="${escHtml(node.id)}">`;
    for (const child of node.children) html += renderLayerNode(child, selectedId, depth + 1);
    html += '</div>';
  }
  return html;
}

let lastLayerText = '';
let lastLayerSelectedId = '';

/** Refresh the layers panel. */
function refreshLayersPanel() {
  const panel = document.getElementById('layers-panel');
  if (!panel || !fdCanvas) return;

  const selectedId = fdCanvas.get_selected_id() || '';
  const source = fdCanvas.get_text();

  // Selection-only change: just update highlights
  if (source === lastLayerText && selectedId !== lastLayerSelectedId) {
    lastLayerSelectedId = selectedId;
    panel.querySelectorAll('.layer-item').forEach(el =>
      el.classList.toggle('selected', el.getAttribute('data-node-id') === selectedId)
    );
    const sel = panel.querySelector('.layer-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  // No change at all
  if (source === lastLayerText && selectedId === lastLayerSelectedId) return;

  lastLayerText = source;
  lastLayerSelectedId = selectedId;

  const tree = parseLayerTree(source);
  const countNodes = (nodes) => nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
  const total = countNodes(tree);

  let html = '<div class="layers-header">';
  html += '<span class="layers-title">Layers</span>';
  html += `<span class="layers-count">${total}</span>`;
  html += '</div><div class="layers-body">';
  for (const node of tree) html += renderLayerNode(node, selectedId);
  html += '</div>';

  panel.innerHTML = html;

  // Wire click-to-select
  panel.querySelectorAll('.layer-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.layer-chevron')) return;
      e.stopPropagation();
      const nodeId = item.getAttribute('data-node-id');
      if (nodeId && fdCanvas) {
        fdCanvas.select_by_id(nodeId);
        renderCanvas();
        lastLayerSelectedId = nodeId;
        panel.querySelectorAll('.layer-item').forEach(el =>
          el.classList.toggle('selected', el.getAttribute('data-node-id') === nodeId)
        );
        updateFab(document.getElementById('fd-canvas'));
        updatePropertiesPanel();
      }
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

// ─── Split Resize (code ↔ canvas) ────────────────────────────────────────

/** Set up drag-to-resize for the code/canvas split. */
function setupSplitResize(container, resizeCanvas) {
  const handle = document.getElementById('split-resize');
  if (!handle || !container) return;

  const MIN_FRAC = 0.15;
  const MAX_FRAC = 0.75;

  let dragging = false;
  let containerRect = null;

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    containerRect = container.getBoundingClientRect();
    handle.classList.add('active');
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging || !containerRect) return;
    const x = e.clientX - containerRect.left;
    const frac = Math.max(MIN_FRAC, Math.min(MAX_FRAC, x / containerRect.width));
    container.style.setProperty('--editor-width', `${Math.round(containerRect.width * frac)}px`);
    resizeCanvas();
    renderCanvas();
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('active');
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  // Double-click to reset to default 30/70 split
  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    container.style.removeProperty('--editor-width');
    resizeCanvas();
    renderCanvas();
  });
}

// ─── Panel Resize ────────────────────────────────────────────────────────

/** Set up drag-to-resize for layers and properties panels. */
function setupPanelResize(wrapper, resizeCanvas) {
  const layersPanel = document.getElementById('layers-panel');
  const layersHandle = document.getElementById('layers-resize');
  const propsPanel = document.getElementById('props-panel');
  const propsHandle = document.getElementById('props-resize');
  const layersRestore = document.getElementById('layers-restore');
  const propsRestore = document.getElementById('props-restore');

  const MIN_WIDTH = 120;
  const MAX_WIDTH = 360;
  const DEFAULT_LAYERS_W = 180;
  const DEFAULT_PROPS_W = 200;

  // Restore persisted widths
  const savedLayersW = parseInt(localStorage.getItem('fd-layers-width'), 10);
  const savedPropsW = parseInt(localStorage.getItem('fd-props-width'), 10);
  // Don't auto-collapse layers panel — always show on playground load
  // so first-time visitors see their scene tree.
  const layersCollapsed = false;
  const propsCollapsed = localStorage.getItem('fd-props-collapsed') === '1';

  if (savedLayersW && savedLayersW >= MIN_WIDTH && savedLayersW <= MAX_WIDTH) {
    wrapper.style.setProperty('--layers-width', savedLayersW + 'px');
  }
  if (savedPropsW && savedPropsW >= MIN_WIDTH && savedPropsW <= MAX_WIDTH) {
    wrapper.style.setProperty('--props-width', savedPropsW + 'px');
  }
  if (layersCollapsed && layersPanel) {
    layersPanel.classList.add('collapsed');
    wrapper.style.setProperty('--layers-width', '0px');
  }

  /** Position layers resize handle at panel's right edge. */
  function positionLayersHandle() {
    if (!layersHandle || !layersPanel) return;
    const w = layersPanel.classList.contains('collapsed') ? 0 : layersPanel.offsetWidth;
    layersHandle.style.left = w + 'px';
    layersHandle.style.display = layersPanel.classList.contains('collapsed') ? 'none' : '';
  }

  /** Position props resize handle at panel's left edge. */
  function positionPropsHandle() {
    if (!propsHandle || !propsPanel) return;
    if (propsPanel.classList.contains('visible') && !propsPanel.classList.contains('collapsed')) {
      const w = propsPanel.offsetWidth;
      propsHandle.style.right = w + 'px';
      propsHandle.style.display = '';
    } else {
      propsHandle.style.display = 'none';
    }
  }

  // Initial position
  requestAnimationFrame(() => {
    positionLayersHandle();
    positionPropsHandle();
  });

  // ── Generic drag handler ──
  function makeDraggable(handle, panel, side, defaultW) {
    if (!handle || !panel) return;
    let dragging = false;
    let startX = 0;
    let startW = 0;

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startW = panel.offsetWidth;
      panel.classList.add('no-transition');
      handle.classList.add('active');
      handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, side === 'left' ? startW + dx : startW - dx));
      const varName = side === 'left' ? '--layers-width' : '--props-width';
      wrapper.style.setProperty(varName, newW + 'px');
      if (side === 'left') positionLayersHandle();
      else positionPropsHandle();
      resizeCanvas();
      renderCanvas();
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('no-transition');
      handle.classList.remove('active');
      // Persist
      const w = panel.offsetWidth;
      const key = side === 'left' ? 'fd-layers-width' : 'fd-props-width';
      localStorage.setItem(key, String(w));
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);

    // Double-click to collapse
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isCollapsed = panel.classList.toggle('collapsed');
      const varName = side === 'left' ? '--layers-width' : '--props-width';
      if (isCollapsed) {
        wrapper.style.setProperty(varName, '0px');
        localStorage.setItem(side === 'left' ? 'fd-layers-collapsed' : 'fd-props-collapsed', '1');
      } else {
        const savedW = parseInt(localStorage.getItem(side === 'left' ? 'fd-layers-width' : 'fd-props-width'), 10);
        const restoreW = (savedW >= MIN_WIDTH && savedW <= MAX_WIDTH) ? savedW : defaultW;
        wrapper.style.setProperty(varName, restoreW + 'px');
        localStorage.removeItem(side === 'left' ? 'fd-layers-collapsed' : 'fd-props-collapsed');
      }
      requestAnimationFrame(() => {
        if (side === 'left') positionLayersHandle();
        else positionPropsHandle();
        resizeCanvas();
        renderCanvas();
      });
    });
  }

  makeDraggable(layersHandle, layersPanel, 'left', DEFAULT_LAYERS_W);
  makeDraggable(propsHandle, propsPanel, 'right', DEFAULT_PROPS_W);

  // ── Restore strips (click to uncollapse) ──
  if (layersRestore) {
    layersRestore.addEventListener('click', () => {
      if (!layersPanel) return;
      layersPanel.classList.remove('collapsed');
      const savedW = parseInt(localStorage.getItem('fd-layers-width'), 10);
      const restoreW = (savedW >= MIN_WIDTH && savedW <= MAX_WIDTH) ? savedW : DEFAULT_LAYERS_W;
      wrapper.style.setProperty('--layers-width', restoreW + 'px');
      localStorage.removeItem('fd-layers-collapsed');
      requestAnimationFrame(() => { positionLayersHandle(); resizeCanvas(); renderCanvas(); });
    });
    layersRestore.addEventListener('dblclick', (e) => e.stopPropagation());
  }
  if (propsRestore) {
    propsRestore.addEventListener('click', () => {
      if (!propsPanel) return;
      propsPanel.classList.remove('collapsed');
      const savedW = parseInt(localStorage.getItem('fd-props-width'), 10);
      const restoreW = (savedW >= MIN_WIDTH && savedW <= MAX_WIDTH) ? savedW : DEFAULT_PROPS_W;
      wrapper.style.setProperty('--props-width', restoreW + 'px');
      localStorage.removeItem('fd-props-collapsed');
      requestAnimationFrame(() => { positionPropsHandle(); resizeCanvas(); renderCanvas(); });
    });
    propsRestore.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // ── Observe props panel visibility changes to reposition handle ──
  const propsObserver = new MutationObserver(() => {
    positionPropsHandle();
    // Update --props-width CSS var when props becomes visible/hidden
    if (propsPanel.classList.contains('visible') && !propsPanel.classList.contains('collapsed')) {
      const savedW = parseInt(localStorage.getItem('fd-props-width'), 10);
      const w = (savedW >= MIN_WIDTH && savedW <= MAX_WIDTH) ? savedW : DEFAULT_PROPS_W;
      wrapper.style.setProperty('--props-width', w + 'px');
    } else {
      wrapper.style.setProperty('--props-width', '0px');
    }
    resizeCanvas();
  });
  if (propsPanel) {
    propsObserver.observe(propsPanel, { attributes: true, attributeFilter: ['class'] });
  }
}

// ─── Init ────────────────────────────────────────────────────────────────

/** ─── Notes Panel ────────────────────────────────────────────────────── */
let notesPanelOpen = false;

/**
 * Render notes panel using WASM get_all_notes() API + marked.js.
 * Each node's raw markdown note is rendered via marked.parse().
 * Interactive checkboxes: click to toggle [ ] ↔ [x] and write back.
 */
function renderNotesPanel() {
  const body = document.getElementById('notes-panel-body');
  if (!body || !fdCanvas) return;

  // Get all notes from WASM API
  let notes;
  try {
    const json = fdCanvas.get_all_notes();
    notes = JSON.parse(json);
  } catch (_) {
    notes = [];
  }

  if (notes.length === 0) {
    body.innerHTML = '<p class="notes-empty">No notes yet. Add a note via right-click → Add Note.</p>';
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

    html += `<div class="note-group" data-note-node="${nodeId}">`;
    html += `<div class="note-group-header" data-node="${nodeId}" title="Click to select @${nodeId}">@${nodeId}</div>`;
    html += `<div class="note-markdown">`;

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
  body.querySelectorAll('.note-group-header').forEach(el => {
    el.addEventListener('click', () => {
      const nid = el.dataset.node;
      if (nid && nid !== '_root' && fdCanvas) {
        fdCanvas.select_by_id(nid);
      }
    });
  });

  // Interactive checkboxes: toggle [ ] ↔ [x] in the raw markdown
  body.querySelectorAll('.note-markdown input[type="checkbox"]').forEach(cb => {
    cb.removeAttribute('disabled');
    cb.addEventListener('change', (e) => {
      const group = e.target.closest('.note-group');
      if (!group) return;
      const nodeId = group.dataset.noteNode;
      if (!nodeId || !fdCanvas) return;

      // Get current note, find the N-th checkbox, toggle it
      const currentNote = fdCanvas.get_note(nodeId);
      if (!currentNote) return;

      // Find checkbox index within this note-group
      const allCheckboxes = group.querySelectorAll('input[type="checkbox"]');
      let cbIndex = 0;
      for (let i = 0; i < allCheckboxes.length; i++) {
        if (allCheckboxes[i] === e.target) { cbIndex = i; break; }
      }

      // Toggle the N-th checkbox pattern in the raw markdown
      let checkboxCount = 0;
      const updatedNote = currentNote.replace(/- \[([ xX])\]/g, (match, state) => {
        if (checkboxCount === cbIndex) {
          checkboxCount++;
          return state.trim() ? '- [ ]' : '- [x]';
        }
        checkboxCount++;
        return match;
      });

      // Write back via WASM
      fdCanvas.set_note(nodeId, updatedNote);

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

function toggleNotesPanel() {
  const panel = document.getElementById('notes-panel');
  if (!panel) return;
  notesPanelOpen = !notesPanelOpen;
  panel.classList.toggle('hidden', !notesPanelOpen);
  if (notesPanelOpen) renderNotesPanel();
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

  // No selection → full-doc review (fallback)
  if (selectedIds.length === 0) {
    return runFullDocReview(btn, statusEl);
  }

  // ── Two-phase pipeline: Refine → Scoped Review ──
  btn?.classList.add('loading');
  if (statusEl) statusEl.textContent = `✦ Phase 1: Refining ${selectedIds.length} element${selectedIds.length > 1 ? 's' : ''}…`;

  const panel = document.getElementById('ai-review-panel');
  const body = document.getElementById('ai-review-body');
  const scoreBadge = document.getElementById('ai-review-score');

  try {
    const fdText = fdCanvas.get_text();

    // ── Phase 1: Refine (1 credit) ──
    const prompt = buildRefinePrompt(fdText, selectedIds);
    const modelHint = getAiModelHint();
    const userFocus = localStorage.getItem('fd-ai-prompt') || undefined;
    const refineResp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mode: 'refine', model_hint: modelHint, user_focus: userFocus }),
    });

    if (refineResp.status === 429) {
      const data = await refineResp.json();
      showToast(`Rate limit reached — ${data.limit}/day free. Try again tomorrow.`);
      return;
    }
    if (!refineResp.ok) throw new Error(`Refine API error: ${refineResp.status}`);
    const refineData = await refineResp.json();

    let refined = refineData.result || '';
    refined = refined.replace(/^```(?:fd|text)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

    if (!refined) {
      showToast('AI returned empty output — try again');
      return;
    }

    // Apply refined text to editor + canvas
    const result = spliceModifiedBlocks(fdText, refined, selectedIds);
    if (editorView) {
      const cur = editorView.state.doc.toString();
      editorView.dispatch({ changes: { from: 0, to: cur.length, insert: result } });
    }
    fdCanvas.set_text(result);
    renderCanvas();

    // ── Phase 2: Scoped Review (1 credit) ──
    if (statusEl) statusEl.textContent = '✦ Phase 2: Analyzing improvements…';

    // Show panel with loading state
    if (body) body.innerHTML = '<p class="ai-review-loading">Scoring improvements…</p>';
    if (scoreBadge) { scoreBadge.textContent = ''; scoreBadge.className = 'ai-review-score-badge'; }
    panel?.classList.remove('hidden');

    // Get the refined blocks for scoped review
    let scopedFdText;
    try {
      scopedFdText = fdCanvas.emit_selection_fd?.();
    } catch (_) {}
    if (!scopedFdText) {
      scopedFdText = extractBlocksForIds(result, selectedIds);
    }

    const reviewResp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Review these FD nodes:\n\n${scopedFdText}`, mode: 'review', model_hint: getAiModelHint(), user_focus: localStorage.getItem('fd-ai-prompt') || undefined }),
    });

    if (reviewResp.status === 429) {
      if (body) body.innerHTML = '<p class="ai-review-error">Review skipped — rate limit reached. Your design was refined!</p>';
      showToast(`✦ AI Touch — ${selectedIds.length} element${selectedIds.length > 1 ? 's' : ''} refined (review skipped)`);
      return;
    }
    if (!reviewResp.ok) throw new Error(`Review API error: ${reviewResp.status}`);
    const reviewData = await reviewResp.json();

    renderReviewPanel(reviewData, body, scoreBadge);

    const remaining = reviewData.remaining ?? refineData.remaining;
    let msg = `✦ AI Touch — Score: ${reviewData.score}/100`;
    if (remaining != null && remaining <= 2) msg += ` (${remaining} calls left)`;
    showToast(msg);

  } catch (err) {
    console.warn('AI Touch error:', err);
    showToast('AI unavailable — check /api/ai endpoint');
    if (body) body.innerHTML = '<p class="ai-review-error">Review unavailable</p>';
  } finally {
    btn?.classList.remove('loading');
    if (statusEl) statusEl.textContent = 'Ready';
  }
}

/** Full-doc review (1 credit) — via settings menu or no-selection AI Touch */
async function runFullDocReview(btn, statusEl) {
  btn?.classList.add('loading');
  if (statusEl) statusEl.textContent = 'Full design review…';

  const panel = document.getElementById('ai-review-panel');
  const body = document.getElementById('ai-review-body');
  const scoreBadge = document.getElementById('ai-review-score');

  if (body) body.innerHTML = '<p class="ai-review-loading">Analyzing entire design… (1 credit)</p>';
  if (scoreBadge) { scoreBadge.textContent = ''; scoreBadge.className = 'ai-review-score-badge'; }
  panel?.classList.remove('hidden');

  try {
    const fdText = fdCanvas.get_text();
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Review this FD document:\n\n${fdText}`, mode: 'review', model_hint: getAiModelHint(), user_focus: localStorage.getItem('fd-ai-prompt') || undefined }),
    });

    if (resp.status === 429) {
      const data = await resp.json();
      if (body) body.innerHTML = `<p class="ai-review-error">Rate limit reached. ${data.remaining || 0}/${data.limit || 20} remaining.</p>`;
      return;
    }
    if (!resp.ok) throw new Error(`Review API error: ${resp.status}`);
    const data = await resp.json();

    renderReviewPanel(data, body, scoreBadge);
    showToast(`✦ Design Review — Score: ${data.score}/100`);
  } catch (err) {
    console.warn('Full doc review error:', err);
    if (body) body.innerHTML = '<p class="ai-review-error">Review unavailable</p>';
  } finally {
    btn?.classList.remove('loading');
    if (statusEl) statusEl.textContent = 'Ready';
  }
}

/** Render flat review findings into the panel (no category grouping). */
function renderReviewPanel(data, bodyEl, scoreBadgeEl) {
  if (!bodyEl) return;

  // Log raw categorized response for debugging
  console.debug('[AI Touch] Raw review:', data);

  if (scoreBadgeEl) {
    scoreBadgeEl.textContent = `${data.score}/100`;
    scoreBadgeEl.className = 'ai-review-score-badge';
    if (data.score >= 80) scoreBadgeEl.classList.add('score-high');
    else if (data.score >= 50) scoreBadgeEl.classList.add('score-mid');
    else scoreBadgeEl.classList.add('score-low');
  }

  // Flatten all findings from all categories into one list
  const allFindings = [];
  for (const cat of (data.categories || [])) {
    for (const f of (cat.findings || [])) {
      allFindings.push(f);
    }
  }

  const severityIcon = { error: '❌', warning: '⚠️', info: 'ℹ️' };
  let html = '';

  if (allFindings.length > 0) {
    html += '<ul class="ai-review-findings">';
    for (const f of allFindings) {
      const icon = severityIcon[f.severity] || 'ℹ️';
      html += `<li class="ai-review-finding">
        <span class="ai-review-severity">${icon}</span>
        <div class="ai-review-finding-text">
          ${escapeHtml(f.message)}
          ${f.suggestion ? `<div class="ai-review-suggestion">💡 ${escapeHtml(f.suggestion)}</div>` : ''}
        </div>
      </li>`;
    }
    html += '</ul>';
  } else {
    html += '<p class="ai-review-perfect">✅ No issues found</p>';
  }

  // Model badge footer
  const modelName = data.model ? data.model.split('/').pop() : '';
  if (modelName) {
    html += `<div class="ai-review-footer">Model: ${escapeHtml(modelName)}</div>`;
  }

  if (!data.categories || data.categories.length === 0) {
    html = '<p class="ai-review-error">No review data returned</p>';
  }

  bodyEl.innerHTML = html;
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
          // Toggle zen mode
          zenMode = !zenMode;
          document.querySelector('.hero-playground')?.classList.toggle('zen-mode', zenMode);
          const zenBtn = document.getElementById('zen-toggle-btn');
          if (zenBtn) {
            zenBtn.textContent = zenMode ? '✕ Exit Zen' : '🧘';
            zenBtn.title = zenMode ? 'Exit Zen Mode (Esc)' : 'Zen Mode (Esc)';
          }
          setTimeout(() => { markRenderDirty(); markUiDirty(); }, 50);
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
  const loading = document.getElementById('canvas-loading');
  const wrapper = document.getElementById('canvas-wrapper');

  try {
    // Load WASM module with real progress tracking
    const statusEl = document.getElementById('loading-status');
    const progressBar = document.querySelector('.loading-progress-bar');
    if (statusEl) statusEl.textContent = 'Loading engine…';

    // Start JS module import and WASM fetch in parallel
    const [wasm, wasmResponse] = await Promise.all([
      import('./wasm/fd_wasm.js?v=0.11.5'),
      fetch('./wasm/fd_wasm_bg.wasm?v=0.11.5'),
    ]);

    // Stream WASM bytes with real progress
    const contentLength = +wasmResponse.headers.get('Content-Length') || 0;
    if (contentLength > 0 && wasmResponse.body) {
      const reader = wasmResponse.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        const pct = Math.min(loaded / contentLength, 1);
        if (progressBar) progressBar.style.width = (pct * 100) + '%';
        if (statusEl) statusEl.textContent = `Loading engine… ${Math.round(pct * 100)}%`;
      }
      // Combine chunks into a single buffer
      const wasmBytes = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) { wasmBytes.set(chunk, offset); offset += chunk.length; }

      if (statusEl) statusEl.textContent = 'Initializing runtime…';
      if (progressBar) progressBar.style.width = '100%';
      await wasm.default(wasmBytes.buffer);
    } else {
      // Fallback: no Content-Length (e.g. compressed), use streaming init
      if (statusEl) statusEl.textContent = 'Initializing runtime…';
      if (progressBar) progressBar.style.width = '100%';
      await wasm.default('./wasm/fd_wasm_bg.wasm?v=0.11.5');
    }

    // Size the canvas
    const resizeCanvas = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const layersW = getLayersPanelWidth();
      const propsW = getPropsPanelWidth();
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
    const rect = wrapper.getBoundingClientRect();
    const canvasW = rect.width - getLayersPanelWidth();
    fdCanvas = new wasm.FdCanvas(canvasW, rect.height);
    // Canvas theme — honor localStorage preference
    fdCanvas.set_theme(isDark);
    wrapper.classList.toggle('dark-canvas', isDark);
    if (statusEl) statusEl.textContent = 'Parsing scene…';
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
    if (statusEl) statusEl.textContent = '✓ Ready';
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

    // Zen toggle button (inside canvas — stays visible in zen mode)
    const zenBtn = document.getElementById('zen-toggle-btn');
    zenBtn?.addEventListener('click', () => {
      zenMode = !zenMode;
      document.querySelector('.hero-playground')?.classList.toggle('zen-mode', zenMode);
      zenBtn.textContent = zenMode ? '✕ Exit Zen' : '🧘';
      zenBtn.title = zenMode ? 'Exit Zen Mode (Esc)' : 'Zen Mode (Esc)';
      setTimeout(() => { resizeCanvas(); renderCanvas(); }, 50);
    });

    // Full Screen toggle
    document.getElementById('fullscreen-toggle-btn')?.addEventListener('click', toggleFullscreen);

    // Share button — copy ?code= deep link to clipboard
    document.getElementById('share-btn')?.addEventListener('click', () => {
      if (!editorView) return;
      const text = editorView.state.doc.toString();
      const compressed = LZString.compressToEncodedURIComponent(text);
      const url = new URL(window.location.href);
      url.searchParams.set('code', compressed);
      // Also preserve fullscreen state if active
      if (fullscreenMode) url.searchParams.set('fullscreen', '');
      else url.searchParams.delete('fullscreen');
      navigator.clipboard.writeText(url.toString()).then(() => {
        showToast('Link copied to clipboard!');
      }).catch(() => {
        // Fallback: show URL in prompt
        prompt('Copy this link:', url.toString());
      });
    });

    // Auto-fullscreen from URL param
    if (urlParams.has('fullscreen')) {
      setTimeout(toggleFullscreen, 100);
    }

    // ── Toolbar buttons ──────────────────────────────────────────────
    document.getElementById('ai-touch-btn')?.addEventListener('click', aiTouch);
    document.getElementById('ai-review-close')?.addEventListener('click', () => {
      document.getElementById('ai-review-panel')?.classList.add('hidden');
    });
    document.getElementById('sm-design-review')?.addEventListener('click', () => {
      const btn = document.getElementById('ai-touch-btn');
      const statusEl = document.getElementById('canvas-status');
      runFullDocReview(btn, statusEl);
    });
    document.getElementById('renamify-btn')?.addEventListener('click', renamify);
    document.getElementById('notes-toggle-btn')?.addEventListener('click', toggleNotesPanel);
    document.getElementById('notes-panel-close')?.addEventListener('click', toggleNotesPanel);

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

    // Hide loading overlay
    // Hide loading overlay with fade-out
    loading.classList.add('fade-out');
    setTimeout(() => loading.classList.add('hidden'), 400);

    // ── Canvas Theme Toggle ─────────────────────────────────────────
    const themeToggle = document.getElementById('canvas-theme-toggle');
    if (themeToggle) {
      // Sync pill visual with initial state
      themeToggle.classList.toggle('is-light', !isDark);
      themeToggle.addEventListener('click', () => {
        isDark = !isDark;
        if (fdCanvas) fdCanvas.set_theme(isDark);
        wrapper.classList.toggle('dark-canvas', isDark);
        themeToggle.classList.toggle('is-light', !isDark);
        localStorage.setItem('fd-canvas-theme', isDark ? 'dark' : 'light');
        renderDirty = true;
        renderCanvas();
      });
    }



    // ── Panel Resize Setup ───────────────────────────────────────────
    setupPanelResize(wrapper, resizeCanvas);
    setupSplitResize(document.getElementById('playground-container'), resizeCanvas);

    // ── Pointer Events ────────────────────────────────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      if (!fdCanvas) return;
      e.preventDefault(); // prevent browser scroll/zoom on touch

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

      // Hand tool: finger/mouse → pan; Apple Pencil → fall through to Select (WASM)
      if (fdCanvas.get_tool_name() === 'hand' && e.pointerType !== 'pen') {
        panDragging = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        canvas.style.cursor = 'grabbing';
        activePointerId = e.pointerId;
        return;
      }

      // Hide FAB during draw gestures (not during move — FAB tracks via render loop)
      if (fdCanvas.get_tool_name() !== 'select') {
        document.getElementById('floating-action-bar')?.classList.remove('visible');
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

        // Pinch zoom
        const scale = dist / pinchStartDist;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartZoom * scale));

        // Pan follows midpoint
        const canvasRect = canvas.getBoundingClientRect();
        const mx = pinchMidStartX - canvasRect.left;
        const my = pinchMidStartY - canvasRect.top;
        panX = mx - (mx - pinchPanStartX) * (newZoom / pinchStartZoom) + (midX - pinchMidStartX);
        panY = my - (my - pinchPanStartY) * (newZoom / pinchStartZoom) + (midY - pinchMidStartY);
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
      if (moveResult.changed) { renderDirty = true; uiDirty = true; }

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

      // End pan drag
      // Clear touch halo on pointer up
      touchHalo.active = false;

      if (panDragging) {
        panDragging = false;
        canvas.style.cursor = (isPanning || fdCanvas.get_tool_name() === 'hand') ? 'grab' : '';
        return;
      }

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);

      // ⌘+drag reparent: if Cmd/Ctrl held, check if we're over a container
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const selectedId = fdCanvas.get_selected_id();
        if (selectedId) {
          try {
            const hitJson = fdCanvas.hit_test_at(x, y);
            if (hitJson) {
              const hit = JSON.parse(hitJson);
              if (hit.id && hit.id !== selectedId) {
                const ok = fdCanvas.reparent_into(selectedId, hit.id);
                if (ok) {
                  renderDirty = true; uiDirty = true;
                  syncCanvasToEditor();
                  showToast(`Nested into ${hit.id}`);
                }
              }
            }
          } catch (_) { /* reparent_into or hit_test_at may not exist */ }
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

    // ── Tool Toolbar (floating scroll) ────────────────────────────────────
    let toolbarDragTool = null; // Tracks drag-from-toolbar-to-canvas
    document.querySelectorAll('.ft-tool-btn[data-tool]').forEach(btn => {
      // pointerdown: switch tool immediately (enables drag-to-create)
      btn.addEventListener('pointerdown', (e) => {
        if (!fdCanvas) return;
        const tool = btn.dataset.tool;
        fdCanvas.set_tool(tool);
        updateToolbar(tool);
        canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
        // Track for drag-from-toolbar-to-canvas
        if (tool !== 'hand' && tool !== 'select' && tool !== 'eraser') {
          toolbarDragTool = tool;
          e.preventDefault(); // prevent text selection during drag
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

    // Drag-from-toolbar: when pointer enters canvas during toolbar drag,
    // synthesize a pointer-down to start shape creation
    canvas.addEventListener('pointerenter', (e) => {
      if (!toolbarDragTool || !fdCanvas || e.buttons === 0) return;
      const tool = toolbarDragTool;
      toolbarDragTool = null;
      // Synthesize pointer-down at entry point
      fdCanvas.set_pointer_type(pointerTypeToU8(e.pointerType));
      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
      const changed = fdCanvas.handle_pointer_down(
        x, y, e.pressure || 1.0,
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      activePointerId = e.pointerId;
      if (changed) { renderDirty = true; uiDirty = true; }
      // Hide FAB during draw gestures
      document.getElementById('floating-action-bar')?.classList.remove('visible');
    });
    // Clear toolbar drag on pointer up anywhere
    document.addEventListener('pointerup', () => { toolbarDragTool = null; }, true);

    // ── Scroll Toolbar: double-click handle to roll/unroll ──────────────
    const scrollToolbar = document.getElementById('floating-toolbar');
    const setupScrollRoll = (handleEl, rollClass, otherClass) => {
      if (!handleEl) return;
      handleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (scrollToolbar.classList.contains(rollClass)) {
          // Unroll
          scrollToolbar.classList.remove(rollClass);
          scrollToolbar.classList.add('unrolled');
          localStorage.removeItem('fd-toolbar-rolled');
        } else {
          // Roll up from this side
          scrollToolbar.classList.remove('unrolled', otherClass);
          scrollToolbar.classList.add(rollClass);
          localStorage.setItem('fd-toolbar-rolled', rollClass.replace('rolled-', ''));
        }
      });
    };
    setupScrollRoll(document.querySelector('.handle-start'), 'rolled-left', 'rolled-right');
    setupScrollRoll(document.querySelector('.handle-end'), 'rolled-right', 'rolled-left');
    // Restore rolled state from localStorage
    const savedRoll = localStorage.getItem('fd-toolbar-rolled');
    if (savedRoll === 'left' || savedRoll === 'right') {
      scrollToolbar.classList.remove('unrolled');
      scrollToolbar.classList.add(`rolled-${savedRoll}`);
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

      // Modifier cursors (⌘=grab, Alt=copy)
      if (e.key === 'Meta') canvas.classList.add('modifier-cmd');
      if (e.key === 'Alt') canvas.classList.add('modifier-alt');

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
      if (e.key === 'Meta') canvas.classList.remove('modifier-cmd');
      if (e.key === 'Alt') canvas.classList.remove('modifier-alt');
    });

    // ── Resize Observer ───────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => resizeCanvas());
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



    // ── Settings Menu (inside canvas) ──────────────────────────────────
    const settingsBtn = document.getElementById('settings-menu-btn');
    const settingsMenu = document.getElementById('settings-menu');

    function updateSettingsToggles() {
      document.getElementById('sm-sketchy-toggle')?.classList.toggle('toggle-on', isSketchy);
      document.getElementById('sm-grid-toggle')?.classList.toggle('toggle-on', gridEnabled);
      document.getElementById('sm-motion-toggle')?.classList.toggle('toggle-on', reduceMotion);
    }

    settingsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSettingsToggles();
      settingsMenu?.classList.toggle('visible');
    });

    settingsMenu?.querySelectorAll('.settings-menu-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const setting = btn.getAttribute('data-setting');
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
            settingsMenu?.classList.remove('visible');
            renderDirty = true; uiDirty = true;
            return;
          }
          case 'copy-png': {
            if (!fdCanvas) break;
            // Use selection bounds if available, else full scene
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
          case 'import-css': {
            settingsMenu?.classList.remove('visible');
            const fileInput = document.getElementById('css-file-input');
            if (!fileInput) break;
            // Reset so re-selecting same file still triggers change
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
                // Prepend generated styles to editor
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

    document.addEventListener('click', (e) => {
      const container = document.getElementById('settings-dropdown-container');
      if (container && !container.contains(e.target)) {
        settingsMenu?.classList.remove('visible');
      }
    });

  } catch (err) {
    console.error('Failed to load WASM:', err);
    const errDetail = err.message ? `<code style="font-size:12px;opacity:0.7;display:block;margin-bottom:12px">${err.message}</code>` : '';
    loading.innerHTML = `
      <p style="color: var(--text-secondary); text-align: center; max-width: 360px;">
        <strong>Canvas couldn't start</strong><br><br>
        ${errDetail}
        Try reloading the page. If the issue persists, install the
        <a href="https://marketplace.visualstudio.com/items?itemName=khangnghiem.fast-draft" target="_blank">VS Code extension</a>
        for the full canvas experience, or
        <a href="https://github.com/khangnghiem/fast-draft" target="_blank">build from source</a>.
      </p>
    `;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlayground);
} else {
  initPlayground();
}
