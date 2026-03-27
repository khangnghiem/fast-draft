// ── Presentation Mode ─────────────────────────────────────────────────────
// Provides: frame-based slideshow with keyboard navigation.

/**
 * Initialize presentation mode: collect frames, navigate slides, auto-fullscreen.
 *
 * @param {object} api
 * @param {HTMLCanvasElement} api.canvas
 * @param {() => object|null} api.getFdCanvas
 * @param {() => object|null} api.getEditorView
 * @param {(msg: string) => void} api.showToast
 * @param {() => void} api.toggleFullscreen
 * @param {() => number} api.getZoomLevel
 * @param {(z: number) => void} api.setZoomLevel
 * @param {(x: number) => void} api.setPanX
 * @param {(y: number) => void} api.setPanY
 * @param {() => void} api.markRenderDirty
 * @param {() => void} api.renderCanvas
 * @param {URLSearchParams} api.urlParams
 */
export function initPresentation(api) {
  const presOverlay = document.getElementById('presentation-overlay');
  const presCounter = document.getElementById('presentation-counter');
  let presentation = { active: false, frames: [], index: 0 };

  function collectFrames() {
    const fdCanvas = api.getFdCanvas();
    if (!fdCanvas) return [];
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
      api.showToast('No frames found — create frames first (F key)');
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
    const canvasRect = api.canvas.getBoundingClientRect();
    const cw = canvasRect.width;
    const ch = canvasRect.height;
    const zoom = Math.min(cw / frame.w, ch / frame.h) * 0.9;
    api.setZoomLevel(zoom);
    api.setPanX((cw / 2) - (frame.x + frame.w / 2) * zoom);
    api.setPanY((ch / 2) - (frame.y + frame.h / 2) * zoom);
    api.markRenderDirty();
    api.renderCanvas();
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
  if (api.urlParams?.has('fullscreen')) {
    setTimeout(api.toggleFullscreen, 300);
  }

  /** @returns {boolean} Whether presentation is currently active */
  return {
    isActive: () => presentation.active,
  };
}
