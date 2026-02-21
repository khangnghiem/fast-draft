/**
 * FTD Webview — WASM loader + message bridge.
 *
 * Loads the Rust WASM module, initializes the FtdCanvas, and bridges
 * between the VS Code extension (postMessage) and the WASM engine.
 */

// Import WASM module (built by wasm-pack)
import init, { FtdCanvas } from "./wasm/ftd_wasm.js";

// VS Code API
const vscode = acquireVsCodeApi();

/** @type {FtdCanvas | null} */
let ftdCanvas = null;

/** @type {CanvasRenderingContext2D | null} */
let ctx = null;

/** @type {HTMLCanvasElement} */
let canvas;

/** Track if we're in the middle of a programmatic text update */
let suppressTextSync = false;

// ─── Initialization ──────────────────────────────────────────────────────

async function main() {
  canvas = document.getElementById("ftd-canvas");
  const loading = document.getElementById("loading");
  const status = document.getElementById("status");

  try {
    // Initialize WASM
    await init();

    // Set up canvas
    const container = document.getElementById("canvas-container");
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Create WASM canvas controller
    ftdCanvas = new FtdCanvas(width, height);

    // Load initial text if available
    if (window.initialText) {
      ftdCanvas.set_text(window.initialText);
    }

    // Initial render
    render();

    // Hide loading overlay
    if (loading) loading.style.display = "none";
    if (status) status.textContent = "Ready";

    // Set up event listeners
    setupPointerEvents();
    setupResizeObserver(container);
    setupToolbar();

    // Tell extension we're ready
    vscode.postMessage({ type: "ready" });
  } catch (err) {
    console.error("FTD WASM init failed:", err);
    if (loading) loading.textContent = "Failed to load FTD engine: " + err;
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────

function render() {
  if (!ftdCanvas || !ctx) return;
  ftdCanvas.render(ctx);
}

// ─── Pointer Events ──────────────────────────────────────────────────────

function setupPointerEvents() {
  const dpr = window.devicePixelRatio || 1;

  canvas.addEventListener("pointerdown", (e) => {
    if (!ftdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const changed = ftdCanvas.handle_pointer_down(x, y, e.pressure || 1.0);
    if (changed) render();
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!ftdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const changed = ftdCanvas.handle_pointer_move(x, y, e.pressure || 1.0);
    if (changed) render();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!ftdCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const changed = ftdCanvas.handle_pointer_up(x, y);
    if (changed) {
      render();
      syncTextToExtension();
    }
    canvas.releasePointerCapture(e.pointerId);
  });
}

// ─── Resize ──────────────────────────────────────────────────────────────

function setupResizeObserver(container) {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const dpr = window.devicePixelRatio || 1;
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      if (ftdCanvas) {
        ftdCanvas.resize(width, height);
        render();
      }
    }
  });
  observer.observe(container);
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

function setupToolbar() {
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active state
      document
        .querySelectorAll(".tool-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Switch tool in WASM
      const tool = btn.getAttribute("data-tool");
      if (ftdCanvas && tool) {
        ftdCanvas.set_tool(tool);
      }
    });
  });
}

// ─── Message Bridge (Extension ↔ Webview) ────────────────────────────────

window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "setText": {
      if (!ftdCanvas) return;
      suppressTextSync = true;
      ftdCanvas.set_text(message.text);
      render();
      suppressTextSync = false;
      break;
    }
    case "toolChanged": {
      if (!ftdCanvas) return;
      ftdCanvas.set_tool(message.tool);
      // Update toolbar UI
      document.querySelectorAll(".tool-btn").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.getAttribute("data-tool") === message.tool
        );
      });
      break;
    }
  }
});

function syncTextToExtension() {
  if (!ftdCanvas || suppressTextSync) return;
  const text = ftdCanvas.get_text();
  vscode.postMessage({
    type: "textChanged",
    text: text,
  });
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (!ftdCanvas) return;

  // Undo: Ctrl/Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    if (ftdCanvas.undo()) {
      render();
      syncTextToExtension();
    }
  }

  // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
  if (
    ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
    ((e.ctrlKey || e.metaKey) && e.key === "y")
  ) {
    e.preventDefault();
    if (ftdCanvas.redo()) {
      render();
      syncTextToExtension();
    }
  }

  // Tool shortcuts
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    switch (e.key) {
      case "v":
      case "V":
        ftdCanvas.set_tool("select");
        updateToolbarActive("select");
        break;
      case "r":
      case "R":
        ftdCanvas.set_tool("rect");
        updateToolbarActive("rect");
        break;
    }
  }
});

function updateToolbarActive(tool) {
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tool") === tool);
  });
}

// ─── Start ───────────────────────────────────────────────────────────────

main();
