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
    if (stream.match(/^(when|anim|spec)\b/)) return 'keyword';

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
let isDark = false; // Light theme only — no toggle
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
const ZOOM_MIN = 0.1, ZOOM_MAX = 5;
let isPanning = false;

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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoomLevel, 0, 0, dpr * zoomLevel, panX * dpr, panY * dpr);
  drawGrid();
  fdCanvas.render(ctx, performance.now(), true);
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
  const newText = fdCanvas.get_text();
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

/** Show/hide and populate the properties panel for the selected node. */
function updatePropertiesPanel() {
  const panel = document.getElementById('props-panel');
  if (!panel || !fdCanvas) { panel?.classList.remove('visible'); adjustMinimapForProps(false); return; }

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
    const changed = fdCanvas.set_node_prop(key, el.value);
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
      fdCanvas.select_by_id(hitId);
      renderCanvas();
      updateFab(canvas);
      updatePropertiesPanel();

      // Update Lock button label
      const lockBtn = document.getElementById('ctx-lock-site');
      if (lockBtn && fdCanvas.is_node_locked) {
        const isLocked = fdCanvas.is_node_locked(hitId);
        lockBtn.textContent = isLocked ? '\uD83D\uDD13 Unlock' : '\uD83D\uDD12 Lock';
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

  // ── Node menu action handlers ──
  const doNodeAction = (action) => {
    if (!fdCanvas) return;
    let changed = false;
    switch (action) {
      case 'copy':
        copySelectedAsFd();
        break;
      case 'cut':
        cutSelectedAsFd();
        changed = true; // already rendered inside cutSelectedAsFd
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
      // Exit Zen mode on Escape
      if (zenMode) {
        zenMode = false;
        document.querySelector('.hero-playground')?.classList.remove('zen-mode');
        const zb = document.getElementById('zen-toggle-btn');
        if (zb) { zb.textContent = '🧘'; zb.title = 'Zen Mode (Esc)'; }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
      }
    }
  });
  canvas.addEventListener('pointerdown', closeContextMenu);
}

/** ─── Layers Panel ────────────────────────────────────────────────────── */
const LAYER_ICONS = {
  group: '◻', frame: '▣', rect: '▢', ellipse: '○',
  path: '〜', text: 'T', style: '◆', edge: '⟶', spec: '◇'
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
  fdCanvas.render(mctx, performance.now(), true);
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

  const MIN_FRAC = 0.25;
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

  // Double-click to reset to 50/50
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

/** ─── View Mode Toggle ────────────────────────────────────────────────── */
let viewMode = 'all';

function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('view-all')?.classList.toggle('active', mode === 'all');
  document.getElementById('view-design')?.classList.toggle('active', mode === 'design');
  document.getElementById('view-spec')?.classList.toggle('active', mode === 'spec');

  if (!fdCanvas || !editorView) return;
  const fullText = fdCanvas.get_text();

  let displayText = fullText;
  let isReadOnly = false;

  if (mode === 'design') {
    displayText = fullText.replace(/\n?\s*spec\s*\{[^}]*\}/g, '').replace(/\n?\s*spec\s+"[^"]*"/g, '');
    isReadOnly = true;
  } else if (mode === 'spec') {
    const lines = fullText.split('\n');
    const specLines = [];
    for (const line of lines) {
      if (line.trim().startsWith('#') || line.trim().startsWith('spec ') || line.trim().startsWith('spec{')) {
        specLines.push(line);
        continue;
      }
      const nodeMatch = line.trim().match(/^(group|frame|rect|ellipse|text|path)\s+@/);
      if (nodeMatch) {
        specLines.push(line);
        continue;
      }
      if (line.trim() === '}') {
        specLines.push(line);
      }
    }
    displayText = specLines.join('\n');
    isReadOnly = true;
  }

  suppressSync = true;
  const cur = editorView.state.doc.toString();
  if (displayText !== cur) {
    editorView.dispatch({
      changes: { from: 0, to: cur.length, insert: displayText },
    });
  }
  editorView.dispatch({
    effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)),
  });
  suppressSync = false;
}

/** ─── AI Touch — Refine Selected Node ────────────────────────────────── */
async function aiTouch() {
  if (!fdCanvas) { showToast('Canvas not ready'); return; }

  // Multi-selection support: get all selected IDs (nodes + edges)
  let selectedIds = [];
  try {
    const idsJson = fdCanvas.get_selected_ids?.();
    selectedIds = idsJson ? JSON.parse(idsJson) : [];
  } catch (_) {}
  // Fallback to single selection
  if (selectedIds.length === 0) {
    const single = fdCanvas.get_selected_id?.();
    if (single) selectedIds = [single];
  }
  if (selectedIds.length === 0) {
    showToast('Select a node or edge first');
    return;
  }

  const btn = document.getElementById('ai-touch-btn');
  btn?.classList.add('loading');
  const statusEl = document.getElementById('canvas-status');
  if (statusEl) statusEl.textContent = `Refining ${selectedIds.length} element${selectedIds.length > 1 ? 's' : ''}…`;

  try {
    const fdText = fdCanvas.get_text();
    const prompt = buildRefinePrompt(fdText, selectedIds);

    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mode: 'refine' }),
    });

    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();
    let refined = data.result || '';

    // Strip markdown fences
    refined = refined.replace(/^```(?:fd|text)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

    if (!refined) {
      showToast('AI returned empty output — try again');
      return;
    }

    // Splice modified blocks back into the original document
    const result = spliceModifiedBlocks(fdText, refined, selectedIds);

    // Update CodeMirror and canvas
    if (editorView) {
      const cur = editorView.state.doc.toString();
      editorView.dispatch({ changes: { from: 0, to: cur.length, insert: result } });
    }
    fdCanvas.set_text(result);
    renderCanvas();
    showToast(`✦ AI Touch — ${selectedIds.length} element${selectedIds.length > 1 ? 's' : ''} refined`);
  } catch (err) {
    console.warn('AI Touch error:', err);
    showToast('AI unavailable — check /api/ai endpoint');
  } finally {
    btn?.classList.remove('loading');
    if (statusEl) statusEl.textContent = 'Ready';
  }
}

function buildRefinePrompt(fdText, selectedIds) {
  const nodeList = selectedIds.filter(id => !id.includes('->')).map(id => `@${id}`);
  const edgeList = selectedIds.filter(id => id.includes('->'));

  let targetDesc = '';
  if (nodeList.length > 0) targetDesc += `Nodes: ${nodeList.join(', ')}`;
  if (edgeList.length > 0) targetDesc += `${targetDesc ? '\n' : ''}Edges: ${edgeList.join(', ')}`;

  // Extract the blocks for the selected elements
  const selectedBlocks = extractBlocksForIds(fdText, selectedIds);

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

async function initPlayground() {
  const editorMount = document.getElementById('fd-editor');
  const canvas = document.getElementById('fd-canvas');
  const loading = document.getElementById('canvas-loading');
  const wrapper = document.getElementById('canvas-wrapper');

  try {
    // Load WASM module
    const wasm = await import('./wasm/fd_wasm.js');
    await wasm.default('./wasm/fd_wasm_bg.wasm');

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
      if (canvas.width !== newW || canvas.height !== newH) {
        canvas.width = newW;
        canvas.height = newH;
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = rect.height + 'px';
        // Buffer was cleared — schedule repaint so we don't show a blank frame
        renderDirty = true; uiDirty = true;
      }
      if (fdCanvas) {
        fdCanvas.resize(canvasWidth, rect.height);
      }
    };

    resizeCanvas();

    // Create the FdCanvas instance
    const rect = wrapper.getBoundingClientRect();
    const canvasW = rect.width - getLayersPanelWidth();
    fdCanvas = new wasm.FdCanvas(canvasW, rect.height);
    // Theme is always light — WASM defaults to dark_mode: false
    fdCanvas.set_text(DEFAULT_FD);

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
        doc: DEFAULT_FD,
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
                  if (r.layout_changed) {
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

    // Zen toggle button (inside canvas — stays visible in zen mode)
    const zenBtn = document.getElementById('zen-toggle-btn');
    zenBtn?.addEventListener('click', () => {
      zenMode = !zenMode;
      document.querySelector('.hero-playground')?.classList.toggle('zen-mode', zenMode);
      zenBtn.textContent = zenMode ? '✕ Exit Zen' : '🧘';
      zenBtn.title = zenMode ? 'Exit Zen Mode (Esc)' : 'Zen Mode (Esc)';
      setTimeout(() => { resizeCanvas(); renderCanvas(); }, 50);
    });

    // ── Toolbar buttons ──────────────────────────────────────────────
    document.getElementById('ai-touch-btn')?.addEventListener('click', aiTouch);
    document.getElementById('renamify-btn')?.addEventListener('click', renamify);
    document.getElementById('view-all')?.addEventListener('click', () => setViewMode('all'));
    document.getElementById('view-design')?.addEventListener('click', () => setViewMode('design'));
    document.getElementById('view-spec')?.addEventListener('click', () => setViewMode('spec'));

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
        minimapLastRender = time;
        uiDirty = false;
      }
      animFrameId = requestAnimationFrame(renderLoop);
    };
    animFrameId = requestAnimationFrame(renderLoop);

    // Auto-center scene content in viewport on init (deferred for layout)
    requestAnimationFrame(() => fitToContent(canvas));

    // Hide loading overlay
    loading.classList.add('hidden');

    // ── Panel Resize Setup ───────────────────────────────────────────
    setupPanelResize(wrapper, resizeCanvas);
    setupSplitResize(document.getElementById('playground-container'), resizeCanvas);

    // ── Pointer Events ────────────────────────────────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      if (!fdCanvas) return;
      e.preventDefault(); // prevent browser scroll/zoom on touch

      // Track all active pointers for multi-touch
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger gesture detection
      if (activePointers.size === 2) {
        isTwoFingerGesture = true;
        const pts = [...activePointers.values()];
        pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchStartZoom = zoomLevel;
        pinchMidStartX = (pts[0].x + pts[1].x) / 2;
        pinchMidStartY = (pts[0].y + pts[1].y) / 2;
        pinchPanStartX = panX;
        pinchPanStartY = panY;
        // Cancel any single-finger interaction in progress
        if (activePointerId !== -1) {
          panDragging = false;
          activePointerId = -1;
        }
        return;
      }

      // Blur CodeMirror so keyboard shortcuts work on canvas
      editorView?.contentDOM.blur();

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);

      // Middle-click or Space+click → start pan
      if (e.button === 1 || isPanning) {
        panDragging = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        canvas.style.cursor = 'grabbing';
        activePointerId = e.pointerId;
        return;
      }

      // Hide FAB during interaction
      document.getElementById('fab')?.classList.remove('visible');

      const changed = fdCanvas.handle_pointer_down(
        x, y, e.pressure || 1.0,
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      activePointerId = e.pointerId;
      if (changed) { renderDirty = true; uiDirty = true; }
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
      if (isTwoFingerGesture) {
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
      if (panDragging) {
        panDragging = false;
        canvas.style.cursor = isPanning ? 'grab' : '';
        return;
      }

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
      const resultJson = fdCanvas.handle_pointer_up(
        x, y, e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      const result = JSON.parse(resultJson);

      if (result.changed || result.toolSwitched) {
        renderDirty = true; uiDirty = true;
        syncCanvasToEditor();
      }

      // Auto-switch toolbar after drawing gesture
      if (result.toolSwitched) {
        updateToolbar(result.tool);
        canvas.style.cursor = '';
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
      if (isTwoFingerGesture && activePointers.size < 2) {
        isTwoFingerGesture = false;
      }
      if (e.pointerId === activePointerId) {
        activePointerId = -1;
        panDragging = false;
        canvas.style.cursor = '';
      }
    });

    // ── Wheel → Pan / Zoom ────────────────────────────────────────────
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom toward cursor
        const canvasRect = canvas.getBoundingClientRect();
        const mx = e.clientX - canvasRect.left;
        const my = e.clientY - canvasRect.top;
        const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * factor));
        panX = mx - (mx - panX) * (newZoom / zoomLevel);
        panY = my - (my - panY) * (newZoom / zoomLevel);
        zoomLevel = newZoom;
        updateZoomIndicator();
      } else {
        // Two-finger scroll → pan
        panX -= e.deltaX;
        panY -= e.deltaY;
      }
      renderDirty = true; uiDirty = true;
    }, { passive: false });

    // ── Tool Toolbar (floating scroll) ────────────────────────────────────
    document.querySelectorAll('.ft-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!fdCanvas) return;
        const tool = btn.dataset.tool;
        fdCanvas.set_tool(tool);
        updateToolbar(tool);
        canvas.style.cursor = (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
      });
    });

    // ── Floating Action Bar ─────────────────────────────────────────
    document.getElementById('fab-fill')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('fill', e.target.value);
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-stroke')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('stroke', e.target.value);
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-stroke-w')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('strokeWidth', e.target.value);
      renderCanvas();
      syncCanvasToEditor();
    });
    document.getElementById('fab-opacity')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('opacity', e.target.value);
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

      // Tool shortcuts (only when canvas focused)
      if (!editorFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const toolMap = { v:'select', r:'rect', o:'ellipse', t:'text', a:'arrow', p:'pen', e:'eraser' };
        const tool = toolMap[e.key.toLowerCase()];
        if (tool) {
          fdCanvas.set_tool(tool);
          updateToolbar(tool);
          canvas.style.cursor = (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
          e.preventDefault();
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
      zoomLevel = 1.0; panX = 0; panY = 0;
      updateZoomIndicator();
      renderCanvas();
      renderMinimap(canvas);
    });



    // ── Settings Menu (inside canvas) ──────────────────────────────────
    const settingsBtn = document.getElementById('settings-menu-btn');
    const settingsMenu = document.getElementById('settings-menu');

    function updateSettingsToggles() {
      document.getElementById('sm-sketchy-toggle')?.classList.toggle('toggle-on', isSketchy);
      document.getElementById('sm-grid-toggle')?.classList.toggle('toggle-on', gridEnabled);
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
