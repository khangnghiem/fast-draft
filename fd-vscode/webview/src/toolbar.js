// ─── toolbar.js ─── Auto-extracted from main.js
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── Toolbar ─────────────────────────────────────────────────────────────

/** Currently locked tool (null = no lock, e.g. "rect", "ellipse") */
let lockedTool = null;

/** Track last shortcut press for double-press detection */
let lastShortcutKey = null;
let lastShortcutTime = 0;
const DOUBLE_PRESS_MS = 400;

function setupToolbar() {
  // Top toolbar no longer has tool buttons — they moved to floating toolbar.
  // This now handles both .tool-btn[data-tool] (if any remain) and .ft-tool-btn[data-tool].
  const allToolBtns = document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]");
  allToolBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tool = btn.getAttribute("data-tool");
      if (!fdCanvas || !tool) return;

      // If clicking the already-active & already-locked tool → unlock
      if (lockedTool === tool) {
        unlockTool();
        return;
      }

      // Clicking Select always unlocks
      if (tool === "select") {
        unlockTool();
      }

      // Update active state across all tool buttons
      allToolBtns.forEach((b) => {
        b.classList.remove("active");
        b.classList.remove("locked");
      });
      // Activate the matching tool in both toolbars
      document.querySelectorAll(`[data-tool="${tool}"]`).forEach((b) => {
        b.classList.add("active");
      });

      fdCanvas.set_tool(tool);
      updateCanvasCursor(tool);
    });

    // Double-click to lock
    btn.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const tool = btn.getAttribute("data-tool");
      if (!tool || tool === "select") return;
      lockTool(tool);
    });
  });

  // Floating toolbar collapse/expand: click active tool icon to toggle
  const floatingToolbar = document.getElementById("floating-toolbar");
  if (floatingToolbar) {
    floatingToolbar.addEventListener("dblclick", (e) => {
      // Double-click the toolbar background (not a button) = toggle collapse
      if (e.target === floatingToolbar || e.target.classList.contains("ft-drag-handle")) {
        floatingToolbar.classList.toggle("collapsed");
        vscode.setState({ ...(vscode.getState() || {}), ftCollapsed: floatingToolbar.classList.contains("collapsed") });
      }
    });
  }
}

/** Lock the given tool — it stays active after shape creation. */
function lockTool(tool) {
  lockedTool = tool;
  if (fdCanvas) {
    fdCanvas.set_tool(tool);
  }
  updateToolbarActive(tool);
  updateLockedIndicator(tool);
}

/** Unlock tool and switch back to Select. */
function unlockTool() {
  lockedTool = null;
  document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((b) => b.classList.remove("locked"));
  if (fdCanvas) {
    fdCanvas.set_tool("select");
  }
  updateToolbarActive("select");
}

/** Show lock indicator on the correct toolbar button. */
function updateLockedIndicator(tool) {
  document.querySelectorAll(".tool-btn[data-tool], .ft-tool-btn[data-tool]").forEach((btn) => {
    btn.classList.toggle("locked", btn.getAttribute("data-tool") === tool);
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
}

