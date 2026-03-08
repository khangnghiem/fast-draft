// ─── FD Playground — WASM-powered interactive editor ───

const EXAMPLES = {
  card: `# A card with a button that reacts on hover

theme accent {
  fill: #6C5CE7
}

group @card {
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

@card -> center_in: canvas`,

  login: `# Login form with spec annotations

theme accent {
  fill: #6C5CE7
  corner: 10
}

theme base_text {
  fill: #333333
  font: "Inter" regular 14
}

group @login_form {
  spec {
    "User authentication entry point"
    accept: "email + password fields visible"
    status: todo
  }
  text @title "Welcome Back" {
    fill: #1A1A2E
    font: "Inter" bold 24
  }
  rect @email_field {
    text @email_hint "Email" {
      use: base_text
      fill: #999999
    }
    w: 280 h: 44
    stroke: #DDDDDD 1
    corner: 8
  }
  rect @pass_field {
    text @pass_hint "Password" {
      use: base_text
      fill: #999999
    }
    w: 280 h: 44
    stroke: #DDDDDD 1
    corner: 8
  }
  rect @login_btn {
    spec {
      "Primary CTA"
      accept: "disabled when fields empty"
      status: done
      priority: high
    }
    text @btn_label "Sign In" {
      fill: #FFFFFF
      font: "Inter" semibold 16
    }
    w: 280 h: 48
    use: accent
    fill: #5A4BD1
    when :hover {
      fill: #4A3BC1
      scale: 1.02
      ease: spring 200ms
    }
  }
  layout: column gap=16 pad=32
}

@login_form -> center_in: canvas`,

  welcome: `# Welcome to Fast Draft!

theme accent { fill: #6C5CE7 }
theme soft { fill: #DFE6E9; corner: 12 }
theme label_style { font: "Inter" 500 14; fill: #2D3436 }

text @welcome_title "Welcome to Fast Draft" {
  x: 180  y: 40
  font: "Inter" 700 28
  fill: #2D3436
}

text @welcome_sub "Edit this code to see changes live!" {
  x: 180  y: 80
  font: "Inter" 400 14
  fill: #636E72
}

rect @step1_bg {
  x: 60  y: 140
  w: 200  h: 140
  use: soft
}

text @step1_title "1. Draw Shapes" {
  x: 80  y: 160
  use: label_style
}

rect @step1_demo {
  x: 220  y: 200
  w: 30  h: 30
  use: accent
  corner: 6
  when :hover { scale: 1.1; ease: spring 200ms }
}

rect @step2_bg {
  x: 300  y: 140
  w: 200  h: 140
  use: soft
}

text @step2_title "2. Add Text" {
  x: 320  y: 160
  use: label_style
}

rect @step3_bg {
  x: 540  y: 140
  w: 200  h: 140
  use: soft
}

text @step3_title "3. Style It" {
  x: 560  y: 160
  use: label_style
}

ellipse @step3_demo {
  x: 700  y: 200
  w: 20  h: 20
  fill: #E17055
  when :hover { fill: #00B894; ease: ease_out 300ms }
}`
};

// ─── State ───────────────────────────────────────────────────────────────
let fdCanvas = null;
let ctx = null;
let isDark = true;
let isSketchy = false;
let animFrameId = null;
let suppressSync = false;

// Pointer tracking
let activePointerId = -1;

// Zoom / Pan
let panX = 0, panY = 0;
let panStartX = 0, panStartY = 0;
let panDragging = false;
let zoomLevel = 1.0;
const ZOOM_MIN = 0.1, ZOOM_MAX = 5;
let isPanning = false;

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Convert screen (client) coords to scene coords accounting for zoom+pan */
function screenToScene(clientX, clientY, canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) - panX) / zoomLevel,
    y: ((clientY - rect.top) - panY) / zoomLevel
  };
}

/** Render the scene with DPR + zoom/pan transform */
function renderCanvas() {
  if (!fdCanvas || !ctx) return;
  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * zoomLevel, 0, 0, dpr * zoomLevel, panX * dpr, panY * dpr);
  fdCanvas.render(ctx, performance.now());
}

/** Update toolbar active state */
function updateToolbar(activeTool) {
  document.querySelectorAll('.ft-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.ft-btn[data-tool="${activeTool}"]`);
  if (btn) btn.classList.add('active');
}

/** Update zoom indicator text */
function updateZoomIndicator() {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = Math.round(zoomLevel * 100) + '%';
}

/** Sync canvas text back to textarea with echo suppression */
function syncCanvasToEditor(editor) {
  if (!fdCanvas) return;
  suppressSync = true;
  editor.value = fdCanvas.get_text();
  suppressSync = false;
}

/** Show/hide and position the floating action bar above the selected node */
function updateFab(canvas) {
  const fab = document.getElementById('fab');
  if (!fab || !fdCanvas) { fab?.classList.remove('visible'); return; }

  const selectedId = fdCanvas.get_selected_id();
  if (!selectedId) { fab.classList.remove('visible'); return; }

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
    }
  } catch (_) {
    fab.classList.remove('visible');
  }
}

// ─── Init ────────────────────────────────────────────────────────────────

async function initPlayground() {
  const editor = document.getElementById('fd-editor');
  const canvas = document.getElementById('fd-canvas');
  const loading = document.getElementById('canvas-loading');
  const wrapper = document.getElementById('canvas-wrapper');

  // Load initial example
  editor.value = EXAMPLES.card;

  try {
    // Load WASM module
    const wasm = await import('./wasm/fd_wasm.js');
    await wasm.default('./wasm/fd_wasm_bg.wasm');

    // Size the canvas
    const resizeCanvas = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      if (fdCanvas) {
        fdCanvas.resize(rect.width, rect.height);
      }
    };

    resizeCanvas();

    // Create the FdCanvas instance
    const rect = wrapper.getBoundingClientRect();
    fdCanvas = new wasm.FdCanvas(rect.width, rect.height);
    fdCanvas.set_theme(isDark);
    fdCanvas.set_text(editor.value);

    // Get canvas 2D context
    ctx = canvas.getContext('2d');

    // Render loop — continuous for hover effects and animations
    const renderLoop = (time) => {
      renderCanvas();
      animFrameId = requestAnimationFrame(renderLoop);
    };
    animFrameId = requestAnimationFrame(renderLoop);

    // Hide loading overlay
    loading.classList.add('hidden');

    // ── Text Editor → Canvas ──────────────────────────────────────────
    let debounceTimer = null;
    editor.addEventListener('input', () => {
      if (suppressSync) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (fdCanvas) fdCanvas.set_text(editor.value);
      }, 50);
    });

    // ── Pointer Events ────────────────────────────────────────────────
    canvas.addEventListener('pointerdown', (e) => {
      if (!fdCanvas) return;
      // Blur textarea so keyboard shortcuts work on canvas
      editor.blur();

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);

      // Middle-click or Space+click → start pan
      if (e.button === 1 || isPanning) {
        panDragging = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        canvas.style.cursor = 'grabbing';
        activePointerId = e.pointerId;
        e.preventDefault();
        return;
      }

      // Hide FAB during interaction
      document.getElementById('fab')?.classList.remove('visible');

      const changed = fdCanvas.handle_pointer_down(
        x, y, e.pressure || 1.0,
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      activePointerId = e.pointerId;
      if (changed) renderCanvas();
    });

    document.addEventListener('pointermove', (e) => {
      if (!fdCanvas) return;

      // Only process our owned pointer or hover over canvas
      if (activePointerId !== -1 && e.pointerId !== activePointerId) return;
      if (activePointerId === -1 && e.target !== canvas) return;

      // Pan drag
      if (panDragging) {
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        renderCanvas();
        return;
      }

      const { x, y } = screenToScene(e.clientX, e.clientY, canvas);
      const changed = fdCanvas.handle_pointer_move(
        x, y, e.pressure || 1.0,
        e.shiftKey, e.ctrlKey, e.altKey, e.metaKey
      );
      if (changed) renderCanvas();
    });

    document.addEventListener('pointerup', (e) => {
      if (!fdCanvas) return;
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

      if (result.changed) {
        renderCanvas();
        syncCanvasToEditor(editor);
      }

      // Auto-switch toolbar after drawing gesture
      if (result.toolSwitched) {
        updateToolbar(result.tool);
        canvas.style.cursor = '';
      }

      // Show FAB if node selected
      updateFab(canvas);
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
      renderCanvas();
    }, { passive: false });

    // ── Tool Toolbar ──────────────────────────────────────────────────
    document.querySelectorAll('.ft-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!fdCanvas) return;
        const tool = btn.dataset.tool;
        fdCanvas.set_tool(tool);
        updateToolbar(tool);
        canvas.style.cursor = (tool === 'select' || tool === 'eraser') ? '' : 'crosshair';
      });
    });

    // ── Floating Action Bar ───────────────────────────────────────────
    document.getElementById('fab-fill')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('fill', e.target.value);
      renderCanvas();
      syncCanvasToEditor(editor);
    });
    document.getElementById('fab-stroke')?.addEventListener('input', (e) => {
      if (!fdCanvas) return;
      fdCanvas.set_node_prop('stroke', e.target.value);
      renderCanvas();
      syncCanvasToEditor(editor);
    });
    document.getElementById('fab-delete')?.addEventListener('click', () => {
      if (!fdCanvas) return;
      fdCanvas.handle_key('Backspace', false, false, false, false);
      renderCanvas();
      syncCanvasToEditor(editor);
      document.getElementById('fab')?.classList.remove('visible');
    });

    // ── Keyboard Shortcuts ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (!fdCanvas) return;
      const editorFocused = document.activeElement === editor;

      // Space → pan mode
      if (e.code === 'Space' && !e.repeat && !editorFocused) {
        isPanning = true;
        canvas.style.cursor = 'grab';
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
          syncCanvasToEditor(editor);
        }
        document.getElementById('fab')?.classList.remove('visible');
        e.preventDefault();
        return;
      }

      // Undo/Redo (always — override textarea undo)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const changed = e.shiftKey ? fdCanvas.redo() : fdCanvas.undo();
        if (changed) {
          renderCanvas();
          syncCanvasToEditor(editor);
        }
        return;
      }

      // Forward remaining keys to WASM (when canvas focused)
      if (!editorFocused) {
        try {
          const r = JSON.parse(fdCanvas.handle_key(e.key, e.ctrlKey, e.shiftKey, e.altKey, e.metaKey));
          if (r.changed) {
            renderCanvas();
            syncCanvasToEditor(editor);
          }
        } catch (_) {}
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        isPanning = false;
        if (!panDragging) canvas.style.cursor = '';
      }
    });

    // ── Resize Observer ───────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(wrapper);

    // ── Example Selector ──────────────────────────────────────────────
    document.getElementById('example-select').addEventListener('change', (e) => {
      const example = EXAMPLES[e.target.value];
      if (example) {
        editor.value = example;
        if (fdCanvas) fdCanvas.set_text(example);
        // Reset zoom/pan for new example
        panX = 0; panY = 0; zoomLevel = 1.0;
        updateZoomIndicator();
      }
    });

    // ── Theme Toggle ──────────────────────────────────────────────────
    document.getElementById('theme-toggle').addEventListener('click', function() {
      isDark = !isDark;
      if (fdCanvas) fdCanvas.set_theme(isDark);
      this.textContent = isDark ? '🌙 Dark' : '☀️ Light';
      this.classList.toggle('active', !isDark);
    });

    // ── Sketchy Toggle ────────────────────────────────────────────────
    document.getElementById('sketchy-toggle').addEventListener('click', function() {
      isSketchy = !isSketchy;
      if (fdCanvas) fdCanvas.set_sketchy_mode(isSketchy);
      this.classList.toggle('active', isSketchy);
    });

  } catch (err) {
    console.error('Failed to load WASM:', err);
    loading.innerHTML = `
      <p style="color: var(--text-secondary); text-align: center; max-width: 320px;">
        <strong>Playground requires WebAssembly</strong><br><br>
        Install the
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
