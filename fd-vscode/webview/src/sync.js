// ─── sync.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Message Bridge (Extension ↔ Webview) ────────────────────────────────

/** Debounce timer for Code→Canvas focusOnNode — prevents animation jitter
 *  when rapidly arrowing through lines in the text editor. */
let codeFocusDebounceTimer = null;

/**
 * Central selection sync — one function, all panels.
 * Ensures that selecting a node/edge in ANY panel updates all others.
 *
 * @param {string} id - Node or edge ID (from @id), or "" to deselect
 * @param {'canvas'|'layers'|'code'|'keyboard'} source - Origin panel
 */
function syncSelection(id, source) {
  if (!fdCanvas) return;

  // 1. Canvas: select + render (skip if source is canvas — already selected)
  if (source !== "canvas") {
    fdCanvas.select_by_id(id || "");
    // select_by_id returns false for edge IDs — that's OK, edges
    // don't have canvas selection highlights yet
    render();
  }

  // 2. Dedup state — prevents redundant nodeSelected round-trips
  lastNotifiedSelectedId = id || "";

  // 3. Layers: highlight + scroll into view
  refreshLayersPanel();

  // 4. Code: notify extension to highlight line (skip if source is code)
  if (source !== "code") {
    vscode.postMessage({ type: "nodeSelected", id: id || "" });
  }

  // 5. Canvas focus: debounced pan/zoom (only for Code→Canvas)
  if (source === "code" && id) {
    clearTimeout(codeFocusDebounceTimer);
    codeFocusDebounceTimer = setTimeout(() => focusOnNode(id), 150);
  }

  // 6. Side panels
  updatePropertiesPanel();
  updateFloatingBar();
}

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
      // Code cursor moved to a node/edge line → sync all panels
      syncSelection(message.nodeId || "", "code");
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


