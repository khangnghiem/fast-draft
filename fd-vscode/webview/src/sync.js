// ─── sync.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Message Bridge (Extension ↔ Webview) ────────────────────────────────

/** Debounce timer for Code→Canvas focusOnNode — prevents animation jitter
 *  when rapidly arrowing through lines in the text editor. */
let codeFocusDebounceTimer = null;

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "setText": {
      if (!fdCanvas) return;
      suppressTextSync = true;
      fdCanvas.set_text(message.text);
      lastSyncedText = message.text; // Keep dedup in sync
      bumpGeneration(); // External text change — invalidate caches
      measureAllTextNodes(); // Tight text bounds after code edit
      render();
      suppressTextSync = false;

      break;
    }
    case "selectNode": {
      if (!fdCanvas) return;
      const nodeId = message.nodeId || "";
      if (fdCanvas.select_by_id(nodeId)) {
        // Sync dedup state so next canvas click sends nodeSelected correctly
        lastNotifiedSelectedId = nodeId;
        render();
        // Update Layers panel highlight + scroll into view
        refreshLayersPanel();
        // Debounced pan/zoom to the selected node on Canvas (150ms)
        if (nodeId) {
          clearTimeout(codeFocusDebounceTimer);
          codeFocusDebounceTimer = setTimeout(() => focusOnNode(nodeId), 150);
        }
      }
      break;
    }
    case "libraryData": {
      // Library data received from extension host
      libraryComponents = message.libraries || [];
      refreshLibraryPanel();
      break;
    }
    case "toolChanged": {
      if (!fdCanvas) return;
      fdCanvas.set_tool(message.tool);
      // Update toolbar UI (both top and floating)
      document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-tool") === message.tool
        );
      });
      break;
    }
    case "setViewMode": {
      setViewMode(message.mode);
      break;
    }
  }
});

/** Last text sent to extension — skip sync if unchanged */
let lastSyncedText = "";

function syncTextToExtension() {
  if (!fdCanvas || suppressTextSync) return;
  const text = fdCanvas.get_text();
  // Skip if text hasn't changed — avoids full document replacement that destroys cursor
  if (text === lastSyncedText) return;
  lastSyncedText = text;
  bumpGeneration(); // Scene data changed — invalidate caches
  vscode.postMessage({
    type: "textChanged",
    text: text,
  });
}

