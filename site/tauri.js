// ── Tauri Desktop Integration ──────────────────────────────────────────────
// Detect Tauri runtime and wire native file I/O shortcuts.
// On web (non-Tauri), this entire module is a no-op.
//
// IMPORTANT: All plugin APIs use invoke() directly instead of importing
// @tauri-apps/plugin-* JS wrappers, because site/ has no node_modules.

/**
 * Initialize Tauri desktop integration (file open/save, auto-update).
 * No-op on web — caller should guard with isTauri check or call unconditionally.
 *
 * @param {object} api
 * @param {() => object|null} api.getEditorView
 * @param {(msg: string) => void} api.showToast
 */
export function initTauri(api) {
  const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
  if (!isTauri) return;

  // Add desktop class for CSS targeting (drag regions, traffic light padding)
  document.body.classList.add('tauri-desktop');

  /** Helper: invoke Tauri IPC command */
  function invoke(cmd, args) {
    const internals = window.__TAURI_INTERNALS__ || window.__TAURI__;
    return internals.invoke(cmd, args);
  }

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
      // Use plugin:dialog IPC directly instead of CDN import
      const result = await invoke('plugin:dialog|open', {
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
      const editorView = api.getEditorView();
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: content },
        });
      }
      api.showToast('Opened: ' + path.split('/').pop().split('\\').pop());
    } catch (e) {
      console.error('Tauri open failed:', e);
      api.showToast('Failed to open file');
    }
  }

  /** Save to current file (or prompt Save As). */
  async function tauriSave() {
    if (!currentFilePath) return tauriSaveAs();
    try {
      const editorView = api.getEditorView();
      const content = editorView ? editorView.state.doc.toString() : '';
      await invoke('save_file', { path: currentFilePath, content });
      api.showToast('Saved');
    } catch (e) {
      console.error('Tauri save failed:', e);
      api.showToast('Failed to save');
    }
  }

  /** Save As — prompt for new file path. */
  async function tauriSaveAs() {
    try {
      // Use plugin:dialog IPC directly instead of CDN import
      const path = await invoke('plugin:dialog|save', {
        filters: [{ name: 'Fast Draft', extensions: ['fd'] }],
      });
      if (!path) return; // user cancelled
      const editorView = api.getEditorView();
      const content = editorView ? editorView.state.doc.toString() : '';
      await invoke('save_file', { path, content });
      await invoke('add_recent_file', { path });
      currentFilePath = path;
      updateTitle(path);
      api.showToast('Saved: ' + path.split('/').pop().split('\\').pop());
    } catch (e) {
      console.error('Tauri save-as failed:', e);
      api.showToast('Failed to save');
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
      // Use plugin:updater IPC channel directly
      const updateRaw = await invoke('plugin:updater|check', {});
      if (!updateRaw || !updateRaw.available) {
        console.log('[FD] App is up to date');
        return;
      }

      const version = updateRaw.version || 'new';
      console.log(`[FD] Update available: v${version}`);

      // Show persistent toast with update action
      const toast = document.createElement('div');
      toast.className = 'fd-update-toast';
      toast.innerHTML = `
        <span>Fast Draft v${version} available</span>
        <button id="fd-update-btn">Update Now</button>
        <button id="fd-update-dismiss" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;padding:4px;">✕</button>
      `;
      document.body.appendChild(toast);
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
          await invoke('plugin:updater|download_and_install', {});
          btn.textContent = 'Restarting…';
          // Restart the app after update
          await invoke('plugin:process|restart', {});
        } catch (err) {
          console.error('[FD] Update failed:', err);
          btn.textContent = 'Update Failed';
          api.showToast('Update failed — try again later');
        }
      });
    } catch (err) {
      // Silently ignore update check failures (network error, no release, etc.)
      console.debug('[FD] Update check skipped:', err.message || err);
    }
  }, 10000);

  console.log('[FD] Tauri desktop mode — ⌘O/⌘S/⌘⇧S enabled');
}
