/**
 * app-state.js
 * 
 * Unified application state and API for Fast Draft.
 * Centralizes the global mutable variables previously housed in app.js,
 * providing a single context object passed to all extracted modules.
 */

export const appState = {
  // ── Core DOM & Context ──
  fdCanvas: null,
  ctx: null,
  editorView: null,

  // ── Transform & Canvas State ──
  panX: 0,
  panY: 0,
  panStartX: 0,
  panStartY: 0,
  panDragging: false,
  canvasDragOccurred: false,
  zoomLevel: 1.0,
  isPanning: false,
  gridEnabled: false,

  // ── UI Flags ──
  isDark: false,
  isSketchy: false,
  reduceMotion: false,
  fullscreenMode: false,
  renderDirty: true,
  uiDirty: true,
  sceneDirty: true,
  suppressSync: false,
  
  // ── Pointers & Gestures ──
  activePointerId: -1,
  
  // Touch contact halo — visual feedback for finger taps
  touchHalo: { active: false, x: 0, y: 0, sceneX: 0, sceneY: 0, startTime: 0, targetBounds: null },
  // Apple Pencil hover preview — crosshair + node highlight
  pencilHover: { active: false, sceneX: 0, sceneY: 0, screenX: 0, screenY: 0, nodeId: null },
  
  activePointers: new Map(), // pointerId → {x, y}
  pinchStartDist: 0,
  pinchStartZoom: 1,
  pinchPanStartX: 0,
  pinchPanStartY: 0,
  pinchMidStartX: 0,
  pinchMidStartY: 0,
  isTwoFingerGesture: false,
  twoFingerTimer: null,
  twoFingerPending: false,

  // ── Toolbar & Tools ──
  lockedTool: null,
  lastToolKeyTime: 0,
  lastToolKeyName: '',
  lastToolBtnTime: 0,
  lastToolBtnName: '',
  
  // ── Tool Handlers State ──
  handTempSelectActive: false,
  handTempSelectOriginalTool: null,
  handAltCloneActive: false,
  handPanClientStartX: null,
  handPanClientStartY: null,

  // ── Selection & Creation States ──
  lassoPoints: [],
  lassoActive: false,
  eraserMarquee: null,
  eraserActive: false,
  dtcPreview: null,
  
  // ── Smart Defaults ──
  smartDefaults: { fill: null, stroke: '#333333', strokeWidth: 2.5, opacity: 1, cornerRadius: 8 },

  // ── Callbacks (Injected by app.js) ──
  api: {
    renderCanvas: () => {},
    syncCanvasToEditor: () => {},
    refreshLayersPanel: () => {},
    updateToolbar: () => {},
    showToast: (msg) => console.log(msg),
    toggleLeftPanel: () => {},
    toggleRightPanel: () => {},
    adjustMinimapForToolbar: () => {},
    screenToScene: (cx, cy, el) => ({x: cx, y: cy})
  },

  // Helpers to safely trigger flags
  markRenderDirty() { this.renderDirty = true; },
  markUiDirty() { this.uiDirty = true; },
  markSceneDirty() { this.sceneDirty = true; }
};

try {
  const saved = localStorage.getItem('fd-smart-defaults');
  if (saved) appState.smartDefaults = { ...appState.smartDefaults, ...JSON.parse(saved) };
} catch (_) {}

try {
  appState.isDark = localStorage.getItem('fd-canvas-theme') === 'dark';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  appState.reduceMotion = prefersReducedMotion.matches || localStorage.getItem('fd-reduce-motion') === 'true';
} catch (_) {}
