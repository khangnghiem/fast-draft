// ── Search Panel ─────────────────────────────────────────────────────────
// Provides: exact / smart / regex search with WASM-backed scoring,
// canvas highlighting, and CodeMirror scroll-to-line.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Initialize the search panel UI and wire event handlers.
 *
 * @param {object} api
 * @param {HTMLCanvasElement} api.canvas
 * @param {() => object|null} api.getFdCanvas
 * @param {() => object|null} api.getEditorView
 * @param {() => void} api.renderCanvas
 * @param {() => number} api.getZoomLevel
 * @param {(z: number) => void} api.setZoomLevel
 * @param {() => number} api.getPanX
 * @param {() => number} api.getPanY
 * @param {(x: number) => void} api.setPanX
 * @param {(y: number) => void} api.setPanY
 * @param {() => void} api.updateZoomIndicator
 * @param {(v: boolean) => void} api.setRenderDirty
 * @param {(v: boolean) => void} api.setUiDirty
 */
export function initSearchPanel(api) {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const searchCount = document.getElementById('search-count');
  const searchZoomFit = document.getElementById('search-zoom-fit');
  const searchModeSegmented = document.getElementById('search-mode-segmented');
  let searchMode = 'smart'; // 'exact' | 'smart' | 'regex'

  // Segmented control click handler
  searchModeSegmented?.querySelectorAll('.search-mode-seg').forEach(btn => {
    btn.addEventListener('click', () => {
      searchModeSegmented.querySelectorAll('.search-mode-seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      searchMode = btn.dataset.mode;
      performSearch(searchInput?.value || '');
    });
  });

  // Alt+R keyboard shortcut for regex toggle
  searchInput?.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'r') {
      e.preventDefault();
      // Cycle: if already regex → smart, otherwise → regex
      const newMode = searchMode === 'regex' ? 'smart' : 'regex';
      searchMode = newMode;
      searchModeSegmented?.querySelectorAll('.search-mode-seg').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === newMode);
      });
      performSearch(searchInput.value);
    }
  });

  function performSearch(query) {
    const fdCanvas = api.getFdCanvas();
    const editorView = api.getEditorView();
    if (!searchResults) return;
    // Remove previous regex error
    const prevErr = searchResults.parentElement?.querySelector('.search-regex-error');
    if (prevErr) prevErr.remove();
    searchInput?.classList.remove('regex-error');

    if (!query || query.length < 2) {
      searchResults.innerHTML = '<div class="search-empty">Search your document by node ID, text content, or style name.</div>';
      if (searchCount) searchCount.textContent = '';
      // Clear canvas highlights
      if (fdCanvas?.clear_search_highlights) {
        try { fdCanvas.clear_search_highlights(); } catch (_) {}
        api.setRenderDirty(true);
        api.renderCanvas();
      }
      return;
    }

    // Validate regex if in regex mode
    let regex = null;
    if (searchMode === 'regex') {
      try {
        regex = new RegExp(query, 'gi');
      } catch (err) {
        searchInput?.classList.add('regex-error');
        const errDiv = document.createElement('div');
        errDiv.className = 'search-regex-error';
        errDiv.textContent = err.message;
        searchResults.parentElement?.insertBefore(errDiv, searchResults.parentElement.firstChild);
        searchResults.innerHTML = '<div class="search-empty">Invalid regex pattern.</div>';
        if (searchCount) searchCount.textContent = '0';
        return;
      }
    }

    let results = [];

    // Use WASM search for exact and smart modes
    if (fdCanvas?.search_nodes && searchMode !== 'regex') {
      try {
        const wasmResults = JSON.parse(fdCanvas.search_nodes(query, searchMode));
        results = wasmResults.map(r => ({
          id: r.id,
          kind: r.kind,
          context: r.context,
          hasBounds: r.hasBounds,
          bounds: r.bounds,
          score: r.score,
          source: 'wasm'
        }));
      } catch (_) {}
    }

    // Fallback to text-line scan for regex mode (or when WASM unavailable)
    if (results.length === 0 || searchMode === 'regex') {
      results = [];
      const text = editorView ? editorView.state.doc.toString() : '';
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const match = searchMode === 'regex'
          ? regex.test(line)
          : line.toLowerCase().includes(query.toLowerCase());
        // Reset regex lastIndex for global flag
        if (regex) regex.lastIndex = 0;
        if (match) {
          const idMatch = line.match(/@([\w-]+)/);
          const trimmed = line.trim();
          results.push({
            lineNum: i + 1,
            id: idMatch ? idMatch[1] : null,
            kind: null,
            context: trimmed.substring(0, 80),
            hasBounds: false,
            bounds: null,
            score: null,
            offset: editorView ? editorView.state.doc.line(i + 1).from : 0,
            source: 'text'
          });
        }
      });
    }

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-empty">No matches found.</div>';
      if (searchCount) searchCount.textContent = '0';
      // Clear canvas highlights
      if (fdCanvas?.clear_search_highlights) {
        try { fdCanvas.clear_search_highlights(); } catch (_) {}
        api.setRenderDirty(true);
        api.renderCanvas();
      }
      return;
    }

    if (searchCount) searchCount.textContent = results.length + ' found';

    // Highlight all matching nodes on canvas
    if (fdCanvas?.set_search_highlights) {
      const ids = results.filter(r => r.id).map(r => r.id);
      try {
        fdCanvas.set_search_highlights(JSON.stringify(ids));
        api.setRenderDirty(true);
        api.renderCanvas();
      } catch (_) {}
    }

    // Render results
    const kindIcons = {
      rect: '▢', ellipse: '○', text: 'T', group: '⊞', frame: '⊟',
      path: '✎', image: '🖼', edge: '↗', style: '🎨', generic: '◇'
    };

    searchResults.innerHTML = '';
    results.forEach((r, idx) => {
      const icon = r.kind ? (kindIcons[r.kind] || '•') : '•';
      const idDisplay = r.id ? '@' + r.id : (r.lineNum ? 'Line ' + r.lineNum : '—');

      const itemDiv = document.createElement('div');
      itemDiv.className = 'search-result-item';
      itemDiv.dataset.index = idx;
      if (r.id) itemDiv.dataset.id = r.id;
      if (r.bounds) itemDiv.dataset.bounds = r.bounds.join(',');
      if (r.offset !== undefined) itemDiv.dataset.offset = r.offset;
      if (r.lineNum) itemDiv.dataset.line = r.lineNum;

      const headerDiv = document.createElement('div');
      headerDiv.style.display = 'flex';
      headerDiv.style.alignItems = 'center';
      headerDiv.style.gap = '6px';

      const iconSpan = document.createElement('span');
      iconSpan.style.fontSize = '12px';
      iconSpan.style.opacity = '0.5';
      iconSpan.style.width = '14px';
      iconSpan.style.textAlign = 'center';
      iconSpan.style.flexShrink = '0';
      iconSpan.textContent = icon;
      headerDiv.appendChild(iconSpan);

      const idSpan = document.createElement('span');
      idSpan.className = 'search-result-id';
      idSpan.textContent = idDisplay;
      headerDiv.appendChild(idSpan);

      if (r.kind) {
        const kindSpan = document.createElement('span');
        kindSpan.className = 'search-result-kind';
        kindSpan.textContent = r.kind;
        headerDiv.appendChild(kindSpan);
      }

      itemDiv.appendChild(headerDiv);

      const contextSpan = document.createElement('span');
      contextSpan.className = 'search-result-context';
      contextSpan.textContent = r.context || '';
      itemDiv.appendChild(contextSpan);

      if (r.lineNum) {
        const lineSpan = document.createElement('span');
        lineSpan.className = 'search-result-line';
        lineSpan.textContent = `L${r.lineNum}`;
        itemDiv.appendChild(lineSpan);
      }

      searchResults.appendChild(itemDiv);
    });

    // Click handler for results
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const editorV = api.getEditorView();
        const fdC = api.getFdCanvas();

        // Scroll to line in CodeMirror
        const lineNum = parseInt(item.dataset.line, 10);
        if (editorV && lineNum) {
          const line = editorV.state.doc.line(lineNum);
          editorV.dispatch({
            selection: { anchor: line.from, head: line.to },
            scrollIntoView: true
          });
        }

        // Select node on canvas
        const nodeId = item.dataset.id;
        if (nodeId && fdC) {
          try { fdC.select_by_id(nodeId); } catch (_) {}

          // Zoom-to-fit if enabled and bounds available
          if (searchZoomFit?.checked && item.dataset.bounds) {
            const [bx, by, bw, bh] = item.dataset.bounds.split(',').map(Number);
            if (bw > 0 && bh > 0) {
              const pad = 0.2;
              const cw = api.canvas.clientWidth;
              const ch = api.canvas.clientHeight;
              if (cw > 0 && ch > 0) {
                const scaleX = cw * (1 - 2 * pad) / bw;
                const scaleY = ch * (1 - 2 * pad) / bh;
                let zl = Math.min(scaleX, scaleY, 3.0);
                zl = Math.max(zl, 0.1);
                api.setZoomLevel(zl);
                api.setPanX(cw / 2 - (bx + bw / 2) * zl);
                api.setPanY(ch / 2 - (by + bh / 2) * zl);
                api.updateZoomIndicator();
              }
            }
          }

          api.setRenderDirty(true);
          api.setUiDirty(true);
          api.renderCanvas();
        }

        // Mark active
        searchResults.querySelectorAll('.search-result-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }

  searchInput?.addEventListener('input', () => {
    performSearch(searchInput.value);
  });
}
