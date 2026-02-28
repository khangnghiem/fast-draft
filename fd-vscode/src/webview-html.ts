// ─── Constants ───────────────────────────────────────────────────────────

export const VIEW_TYPE_CANVAS = "fd.canvas";
export const VIEW_TYPE_TREE_PREVIEW = "fd.treePreview";
export const VIEW_TYPE_SPEC_VIEW = "fd.specView";
export const LANGUAGE_ID = "fd";
export const CONFIG_SECTION = "fd.ai";

export const COMMAND_SHOW_PREVIEW = "fd.showPreview";
export const COMMAND_OPEN_CANVAS = "fd.openCanvas";
export const COMMAND_AI_REFINE = "fd.aiRefine";
export const COMMAND_AI_REFINE_ALL = "fd.aiRefineAll";
export const COMMAND_SHOW_SPEC_VIEW = "fd.showSpecView";
export const COMMAND_EXPORT_SPEC = "fd.exportSpec";
export const COMMAND_TOGGLE_VIEW_MODE = "fd.toggleViewMode";

export const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-{nonce}' 'wasm-unsafe-eval' {cspSource};
    style-src 'nonce-{nonce}';
    img-src {cspSource};
    connect-src {cspSource};
    font-src {cspSource};
  ">
  <style nonce="{nonce}">
    /* ── Apple Design Tokens ─────── */
    :root {
      --fd-bg: #F5F5F7;
      --fd-toolbar-bg: rgba(246, 246, 248, 0.72);
      --fd-toolbar-border: rgba(0, 0, 0, 0.09);
      --fd-border: rgba(0, 0, 0, 0.08);
      --fd-surface: rgba(255, 255, 255, 0.82);
      --fd-surface-solid: #FFFFFF;
      --fd-surface-hover: rgba(0, 0, 0, 0.04);
      --fd-surface-active: rgba(0, 0, 0, 0.06);
      --fd-text: #1D1D1F;
      --fd-text-secondary: #86868B;
      --fd-text-tertiary: #AEAEB2;
      --fd-input-bg: rgba(142, 142, 147, 0.08);
      --fd-input-border: rgba(0, 0, 0, 0.06);
      --fd-input-focus: rgba(0, 122, 255, 0.3);
      --fd-accent: #007AFF;
      --fd-accent-fg: #FFFFFF;
      --fd-accent-dim: rgba(0, 122, 255, 0.1);
      --fd-accent-border: rgba(0, 122, 255, 0.35);
      --fd-accent-hover: #0071EB;
      --fd-segment-bg: rgba(142, 142, 147, 0.12);
      --fd-segment-active: #FFFFFF;
      --fd-segment-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 1px rgba(0, 0, 0, 0.04);
      --fd-slider-bg: rgba(142, 142, 147, 0.2);
      --fd-slider-thumb-border: rgba(255, 255, 255, 0.9);
      --fd-overlay-bg: rgba(0, 0, 0, 0.4);
      --fd-key-border: rgba(0, 0, 0, 0.1);
      --fd-key-bg: rgba(0, 0, 0, 0.03);
      --fd-shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.06);
      --fd-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.1);
      --fd-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);
      --fd-radius: 10px;
      --fd-radius-sm: 7px;
    }
    body.dark-theme {
      --fd-bg: #1C1C1E;
      --fd-toolbar-bg: rgba(28, 28, 30, 0.72);
      --fd-toolbar-border: rgba(255, 255, 255, 0.06);
      --fd-border: rgba(255, 255, 255, 0.06);
      --fd-surface: rgba(44, 44, 46, 0.82);
      --fd-surface-solid: #2C2C2E;
      --fd-surface-hover: rgba(255, 255, 255, 0.06);
      --fd-surface-active: rgba(255, 255, 255, 0.08);
      --fd-text: #F5F5F7;
      --fd-text-secondary: #98989D;
      --fd-text-tertiary: #636366;
      --fd-input-bg: rgba(142, 142, 147, 0.12);
      --fd-input-border: rgba(255, 255, 255, 0.06);
      --fd-input-focus: rgba(10, 132, 255, 0.4);
      --fd-accent: #0A84FF;
      --fd-accent-fg: #FFFFFF;
      --fd-accent-dim: rgba(10, 132, 255, 0.15);
      --fd-accent-border: rgba(10, 132, 255, 0.4);
      --fd-accent-hover: #409CFF;
      --fd-segment-bg: rgba(142, 142, 147, 0.16);
      --fd-segment-active: rgba(99, 99, 102, 0.6);
      --fd-segment-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.1);
      --fd-slider-bg: rgba(142, 142, 147, 0.25);
      --fd-slider-thumb-border: rgba(44, 44, 46, 0.8);
      --fd-overlay-bg: rgba(0, 0, 0, 0.6);
      --fd-key-border: rgba(255, 255, 255, 0.1);
      --fd-key-bg: rgba(255, 255, 255, 0.04);
      --fd-shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.15);
      --fd-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.25);
      --fd-shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.35);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      background: var(--fd-bg);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ── Toolbar (Apple frosted bar) ── */
    #toolbar {
      display: flex;
      gap: 3px;
      padding: 6px 12px;
      background: var(--fd-toolbar-bg);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-bottom: 0.5px solid var(--fd-toolbar-border);
      flex-shrink: 0;
      align-items: center;
      z-index: 10;
    }

    /* ── Tool Buttons (segmented control) ── */
    .tool-btn {
      padding: 5px 10px;
      border: none;
      background: transparent;
      color: var(--fd-text-secondary);
      border-radius: var(--fd-radius-sm);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      transition: all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
      display: flex;
      align-items: center;
      gap: 4px;
      position: relative;
      letter-spacing: -0.01em;
    }
    .tool-btn:hover {
      color: var(--fd-text);
      background: var(--fd-surface-hover);
    }
    .tool-btn:active {
      background: var(--fd-surface-active);
      transform: scale(0.97);
    }
    .tool-btn.active {
      background: var(--fd-segment-active);
      color: var(--fd-text);
      box-shadow: var(--fd-segment-shadow);
      font-weight: 600;
    }
    .tool-btn.locked {
      background: var(--fd-segment-active);
      color: var(--fd-text);
      box-shadow: var(--fd-segment-shadow), 0 0 0 1.5px var(--fd-accent);
      font-weight: 600;
    }
    .tool-btn.locked::after {
      content: '🔒';
      font-size: 8px;
      position: absolute;
      top: -3px;
      right: -3px;
      line-height: 1;
    }

    /* ── Floating Action Bar (contextual toolbar) ── */
    #floating-action-bar {
      position: absolute;
      z-index: 900;
      display: none;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      background: rgba(30,30,30,0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2);
      pointer-events: auto;
      transform: translateX(-50%);
      transition: opacity 0.15s ease, top 0.08s ease, left 0.08s ease;
      font-size: 11px;
      color: #ccc;
      white-space: nowrap;
    }
    #floating-action-bar.visible { display: flex; }
    .fab-sep {
      width: 1px;
      height: 18px;
      background: rgba(255,255,255,0.15);
      margin: 0 2px;
    }
    .fab-color {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.2);
      padding: 0;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
    }
    .fab-color::-webkit-color-swatch-wrapper { padding: 0; }
    .fab-color::-webkit-color-swatch { border-radius: 50%; border: none; }
    .fab-label {
      font-size: 9px;
      text-transform: uppercase;
      opacity: 0.5;
      letter-spacing: 0.5px;
      margin-right: -2px;
    }
    .fab-input {
      width: 38px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      color: #ddd;
      font-size: 11px;
      padding: 2px 4px;
      text-align: center;
    }
    .fab-input:focus { border-color: var(--fd-accent); outline: none; }
    .fab-slider {
      width: 50px;
      height: 3px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255,255,255,0.15);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }
    .fab-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--fd-accent);
      cursor: pointer;
    }
    .fab-btn {
      background: transparent;
      border: none;
      color: #aaa;
      font-size: 13px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1;
    }
    .fab-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
    /* Overflow menu */
    #fab-overflow-menu {
      position: absolute;
      bottom: calc(100% + 4px);
      right: 0;
      background: rgba(30,30,30,0.95);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 4px;
      display: none;
      flex-direction: column;
      gap: 1px;
      min-width: 120px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    #fab-overflow-menu.visible { display: flex; }
    .fab-menu-item {
      background: transparent;
      border: none;
      color: #ccc;
      font-size: 11px;
      padding: 6px 10px;
      text-align: left;
      cursor: pointer;
      border-radius: 4px;
    }
    .fab-menu-item:hover { background: rgba(255,255,255,0.1); color: #fff; }

    /* ── Onboarding Overlay ── */
    #onboarding-overlay {
      position: absolute;
      inset: 0;
      z-index: 950;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at center, rgba(20,20,30,0.92) 0%, rgba(10,10,18,0.97) 100%);
      backdrop-filter: blur(8px);
      pointer-events: auto;
      opacity: 1;
      transition: opacity 0.4s ease;
    }
    #onboarding-overlay.hidden { opacity: 0; pointer-events: none; }
    .onboard-heading {
      font-size: 28px;
      font-weight: 300;
      color: #eee;
      letter-spacing: 1px;
      margin-bottom: 8px;
      animation: onboardFloat 3s ease-in-out infinite;
    }
    .onboard-sub {
      font-size: 13px;
      color: rgba(255,255,255,0.4);
      margin-bottom: 32px;
    }
    @keyframes onboardFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    .onboard-cards {
      display: flex;
      gap: 16px;
      margin-bottom: 40px;
    }
    .onboard-card {
      width: 140px;
      padding: 20px 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
      font-size: inherit;
      color: inherit;
    }
    .onboard-card:focus-visible {
      outline: 2px solid var(--fd-accent);
      outline-offset: 2px;
    }
    .onboard-card:hover {
      background: rgba(255,255,255,0.12);
      border-color: var(--fd-accent);
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .onboard-card-icon { font-size: 28px; display: block; margin-bottom: 10px; }
    .onboard-card-title {
      font-size: 13px;
      font-weight: 500;
      color: #ddd;
    }
    .onboard-card-desc {
      font-size: 10px;
      color: rgba(255,255,255,0.35);
      margin-top: 4px;
    }
    .onboard-hint {
      font-size: 11px;
      color: rgba(255,255,255,0.25);
      letter-spacing: 0.5px;
    }
    .onboard-hint kbd {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 3px;
      padding: 1px 5px;
      font-family: inherit;
      font-size: 11px;
    }
    .tool-icon { font-size: 13px; }
    .tool-key {
      font-size: 9px;
      opacity: 0.4;
      padding: 1px 4px;
      border: 1px solid var(--fd-key-border);
      border-radius: 3px;
      background: var(--fd-key-bg);
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      font-weight: 500;
      line-height: 1.2;
    }
    .active .tool-key {
      opacity: 0.55;
      border-color: rgba(0, 0, 0, 0.1);
    }
    .tool-sep {
      width: 1px;
      height: 16px;
      background: var(--fd-border);
      margin: 0 5px;
      opacity: 0.6;
    }

    /* ── View Toggle (Design | Spec segmented control) ── */
    .view-toggle {
      display: flex;
      gap: 1px;
      background: var(--fd-segment-bg);
      border-radius: var(--fd-radius-sm);
      padding: 2px;
      margin-left: 4px;
    }
    .view-btn {
      padding: 3px 10px;
      border: none;
      background: transparent;
      color: var(--fd-text-secondary);
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      font-family: inherit;
      transition: all 0.15s ease;
      letter-spacing: -0.01em;
    }
    .view-btn:hover { color: var(--fd-text); }
    .view-btn.active {
      background: var(--fd-segment-active);
      color: var(--fd-text);
      box-shadow: var(--fd-segment-shadow);
      font-weight: 600;
    }

    /* ── Layers Panel (Figma / Sketch sidebar) ── */
    #layers-panel {
      display: block;
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 232px;
      background: var(--fd-surface);
      border-right: 0.5px solid var(--fd-border);
      overflow-y: auto;
      overflow-x: hidden;
      z-index: 10;
      font-size: 12px;
      padding: 0;
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
    }
    #layers-panel::-webkit-scrollbar { width: 6px; }
    #layers-panel::-webkit-scrollbar-track { background: transparent; }
    #layers-panel::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.12);
      border-radius: 3px;
    }
    .dark-theme #layers-panel::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.12);
    }
    .layers-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 8px;
      border-bottom: 0.5px solid var(--fd-border);
      position: sticky;
      top: 0;
      background: var(--fd-surface);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      z-index: 1;
    }
    .layers-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--fd-text-secondary);
      padding: 0;
      font-weight: 600;
    }
    .layers-count {
      font-size: 10px;
      color: var(--fd-text-tertiary);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .layers-body {
      padding: 4px 0;
    }
    .layer-item {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 0 8px 0 0;
      height: 28px;
      cursor: default;
      border-radius: 0;
      margin: 0;
      transition: background 0.06s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      position: relative;
    }
    .layer-item:hover {
      background: var(--fd-surface-hover);
    }
    .layer-item.selected {
      background: var(--fd-accent);
      color: var(--fd-accent-fg);
    }
    .layer-item.selected .layer-name { color: var(--fd-accent-fg); }
    .layer-item.selected .layer-kind { color: rgba(255,255,255,0.6); }
    .layer-item.selected .layer-icon { color: rgba(255,255,255,0.75); opacity: 1; }
    .layer-indent {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }
    .layer-indent-guide {
      width: 12px;
      height: 28px;
      position: relative;
      flex-shrink: 0;
    }
    .layer-indent-guide::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--fd-border);
    }
    .layer-chevron {
      width: 16px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
      color: var(--fd-text-tertiary);
      font-size: 8px;
      transition: transform 0.15s ease;
      user-select: none;
    }
    .layer-chevron.expanded {
      transform: rotate(90deg);
    }
    .layer-chevron.empty {
      visibility: hidden;
    }
    .layer-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--fd-text-secondary);
      opacity: 0.8;
      margin-right: 6px;
    }
    .layer-name {
      color: var(--fd-text);
      font-size: 11px;
      font-weight: 400;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.01em;
    }
    .layer-name .layer-text-preview {
      color: var(--fd-text-tertiary);
      font-style: italic;
      margin-left: 4px;
    }
    .layer-item.selected .layer-text-preview {
      color: rgba(255,255,255,0.5);
    }
    .layer-kind {
      color: var(--fd-text-tertiary);
      font-size: 9px;
      margin-left: auto;
      padding-right: 4px;
      padding-left: 6px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-weight: 500;
      flex-shrink: 0;
    }
    .layer-children {
      overflow: hidden;
    }
    .layer-children.collapsed {
      display: none;
    }

    /* ── Spec Overlay (transparent badge layer over canvas) ── */
    #spec-overlay {
      display: none;
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 8;
    }
    .spec-badge-pin {
      position: absolute;
      pointer-events: auto;
      cursor: pointer;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--fd-accent);
      color: var(--fd-accent-fg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      font-family: inherit;
      box-shadow: 0 2px 8px rgba(0, 122, 255, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
      z-index: 9;
    }
    .spec-badge-pin:hover {
      transform: scale(1.18);
      box-shadow: 0 3px 12px rgba(0, 122, 255, 0.5);
    }
    .spec-badge-pin.faint {
      opacity: 0.25;
      transform: scale(0.8);
    }
    .spec-badge-pin.faint:hover {
      opacity: 0.6;
      transform: scale(1.0);
    }
    .spec-badge-pin.active {
      opacity: 1;
      transform: scale(1.1);
      box-shadow: 0 3px 12px rgba(0, 122, 255, 0.5);
    }
    .spec-badge-count {
      line-height: 1;
    }
    .spec-node {
      margin-bottom: 12px;
      padding: 12px 16px;
      background: var(--fd-surface);
      border: 0.5px solid var(--fd-border);
      border-left: 3px solid var(--fd-accent);
      border-radius: var(--fd-radius-sm);
    }
    .spec-node.generic { border-left-color: #BF5AF2; }
    .spec-node-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .spec-node-id {
      font-weight: 700;
      font-size: 14px;
      color: var(--fd-text);
      letter-spacing: -0.02em;
    }
    .spec-kind-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--fd-accent-dim);
      color: var(--fd-accent);
    }
    .spec-kind-badge.spec {
      background: rgba(191, 90, 242, 0.1);
      color: #BF5AF2;
    }
    .spec-description {
      color: var(--fd-text-secondary);
      font-style: italic;
      margin: 3px 0;
    }
    .spec-accept-item {
      color: var(--fd-text);
      font-size: 12px;
      margin: 2px 0;
      padding-left: 14px;
      position: relative;
    }
    .spec-accept-item::before {
      content: '☐';
      position: absolute;
      left: 0;
      color: var(--fd-accent);
    }
    .spec-meta-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .spec-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }
    .spec-badge.status-draft   { background: rgba(142,142,147,0.15); color: var(--fd-text-secondary); }
    .spec-badge.status-in_progress { background: rgba(255,159,10,0.15); color: #FF9F0A; }
    .spec-badge.status-done    { background: rgba(52,199,89,0.15); color: #34C759; }
    .spec-badge.priority-high  { background: rgba(255,59,48,0.15); color: #FF3B30; }
    .spec-badge.priority-medium { background: rgba(255,159,10,0.15); color: #FF9F0A; }
    .spec-badge.priority-low   { background: rgba(52,199,89,0.15); color: #34C759; }
    .spec-badge.tag            { background: var(--fd-accent-dim); color: var(--fd-accent); }
    .spec-section-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--fd-text-tertiary);
      font-weight: 600;
      margin: 18px 0 8px;
    }
    .spec-node-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .spec-node-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      background: var(--fd-surface);
      border: 0.5px solid var(--fd-border);
      border-radius: 20px;
      font-size: 11px;
      color: var(--fd-text-secondary);
    }
    .spec-chip-kind {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fd-text-tertiary);
    }
    .spec-edge {
      margin: 6px 0;
      padding: 10px 14px;
      background: var(--fd-surface);
      border: 0.5px solid var(--fd-border);
      border-left: 3px solid #34C759;
      border-radius: var(--fd-radius-sm);
      font-size: 12px;
      color: var(--fd-text);
    }
    .edge-arrow { font-weight: 500; }
    .edge-label { color: var(--fd-text-secondary); font-style: italic; }
    .spec-empty {
      color: var(--fd-text-tertiary);
      font-style: italic;
      text-align: center;
      padding: 48px 0;
      font-size: 14px;
    }
    .spec-empty-state {
      text-align: center;
      padding: 36px 16px;
      color: var(--fd-text-secondary);
    }
    .spec-summary-card {
      padding: 10px 12px;
      margin: 4px 8px;
      border-radius: 8px;
      background: var(--fd-surface);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .spec-summary-card:hover {
      background: var(--fd-surface-hover);
      border-color: var(--fd-border);
    }
    .spec-summary-card.selected {
      border-color: var(--fd-accent);
      background: var(--fd-accent-dim);
    }
    .spec-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .spec-card-id {
      font-weight: 600;
      font-size: 12px;
      color: var(--fd-accent);
    }
    .spec-card-kind {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      background: var(--fd-surface-hover);
      color: var(--fd-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .spec-card-desc {
      font-size: 12px;
      color: var(--fd-text-primary);
      line-height: 1.4;
      margin-bottom: 6px;
    }
    .spec-card-badges {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 6px;
    }
    .spec-card-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .spec-card-badge.status-draft { background: rgba(142,142,147,0.15); color: #8E8E93; }
    .spec-card-badge.status-in_progress { background: rgba(255,159,10,0.15); color: #FF9F0A; }
    .spec-card-badge.status-done { background: rgba(52,199,89,0.15); color: #34C759; }
    .spec-card-badge.priority-high { background: rgba(255,59,48,0.15); color: #FF3B30; }
    .spec-card-badge.priority-medium { background: rgba(255,159,10,0.15); color: #FF9F0A; }
    .spec-card-badge.priority-low { background: rgba(52,199,89,0.15); color: #34C759; }
    .spec-card-accepts {
      margin-top: 4px;
      padding-left: 2px;
    }
    .spec-card-accept-item {
      font-size: 11px;
      color: var(--fd-text-secondary);
      padding: 1px 0;
      line-height: 1.4;
    }
    .spec-card-tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .spec-card-tag {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--fd-accent-dim);
      color: var(--fd-accent);
    }
    .spec-header-actions {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-left: auto;
    }
    .spec-action-btn {
      background: none;
      border: 1px solid var(--fd-border);
      border-radius: 4px;
      color: var(--fd-text-secondary);
      font-size: 12px;
      padding: 2px 6px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .spec-action-btn:hover {
      background: var(--fd-surface-hover);
      color: var(--fd-text-primary);
    }
    .spec-bulk-status {
      background: var(--fd-surface);
      border: 1px solid var(--fd-border);
      border-radius: 4px;
      color: var(--fd-text-secondary);
      font-size: 10px;
      padding: 2px 4px;
      cursor: pointer;
    }
    .spec-filter-tabs {
      display: flex;
      gap: 2px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--fd-border);
    }
    .spec-filter-btn {
      background: none;
      border: none;
      border-radius: 4px;
      color: var(--fd-text-secondary);
      font-size: 10px;
      padding: 3px 8px;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .spec-filter-btn:hover {
      background: var(--fd-surface-hover);
    }
    .spec-filter-btn.active {
      background: var(--fd-accent-dim);
      color: var(--fd-accent);
      font-weight: 600;
    }
    .spec-filter-count {
      opacity: 0.5;
      font-size: 9px;
      margin-left: 2px;
    }

    /* ── Theme Toggle (Apple pill) ── */
    #theme-toggle-btn {
      font-size: 14px;
      padding: 4px 12px;
      border: 1px solid var(--fd-border) !important;
      border-radius: 20px;
      background: var(--fd-segment-bg);
      min-width: 38px;
      justify-content: center;
      color: var(--fd-text);
      transition: all 0.2s ease;
    }
    #theme-toggle-btn:hover {
      background: var(--fd-accent-dim);
      border-color: var(--fd-accent-border) !important;
      transform: scale(1.04);
    }

    /* ── Zoom Indicator (Apple pill) ── */
    #zoom-level {
      padding: 3px 9px;
      border: 1px solid var(--fd-border) !important;
      border-radius: 20px;
      background: var(--fd-segment-bg);
      color: var(--fd-text-secondary);
      font-size: 10px;
      font-weight: 600;
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      letter-spacing: -0.02em;
      cursor: pointer;
      transition: all 0.18s ease;
      min-width: 42px;
      text-align: center;
    }
    #zoom-level:hover {
      background: var(--fd-accent-dim);
      border-color: var(--fd-accent-border) !important;
      color: var(--fd-accent);
    }

    /* ── Dimension Tooltip (R3.18) ── */
    #dimension-tooltip {
      display: none;
      position: absolute;
      z-index: 200;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      letter-spacing: -0.02em;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .dark-theme #dimension-tooltip {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
    }

    /* ── Grid Toggle Button ── */
    #grid-toggle-btn {
      font-size: 13px;
      min-width: 32px;
      justify-content: center;
    }
    #grid-toggle-btn.grid-on {
      color: var(--fd-accent);
      background: var(--fd-accent-dim);
    }

    /* ── Spec Badge Toggle Button ── */
    #spec-badge-toggle-btn {
      font-size: 13px;
      min-width: 32px;
      justify-content: center;
    }
    #spec-badge-toggle-btn.spec-on {
      color: var(--fd-accent);
      background: var(--fd-accent-dim);
    }

    /* ── Export Dropdown ── */
    #export-menu-btn {
      font-size: 13px; min-width: 32px; justify-content: center;
    }
    .export-dropdown-container { position: relative; display: inline-block; }
    .export-menu {
      display: none; position: absolute; top: 100%; right: 0; margin-top: 4px;
      background: #2D2D2D; border: 1px solid #404040; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5); flex-direction: column;
      z-index: 1000; min-width: 180px; padding: 4px;
    }
    .export-menu.visible { display: flex; }
    .export-menu-item {
      background: none; border: none; padding: 6px 10px;
      color: #D4D4D4; font-size: 12px; cursor: pointer; text-align: left;
      border-radius: 4px; display: flex; align-items: center; gap: 8px;
    }
    .export-menu-item:hover { background: #007FD4; color: #FFF; }
    .export-menu-sep { height: 1px; background: #404040; margin: 4px 0; }

    /* ── Minimap ── */
    #minimap-container {
      position: absolute;
      right: 12px;
      bottom: 12px;
      width: 180px;
      height: 120px;
      background: var(--fd-surface);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 0.5px solid var(--fd-border);
      border-radius: var(--fd-radius);
      box-shadow: var(--fd-shadow-md);
      z-index: 15;
      overflow: hidden;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }
    #minimap-container:hover {
      box-shadow: var(--fd-shadow-lg);
    }
    #minimap-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* ── Color Swatches (Sketch/Figma) ── */
    .color-swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .color-swatch {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1.5px solid var(--fd-border);
      cursor: pointer;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .color-swatch:hover {
      transform: scale(1.15);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .color-swatch:active {
      transform: scale(0.95);
    }
    .color-swatch.active {
      border-color: var(--fd-accent);
      box-shadow: 0 0 0 2px var(--fd-input-focus);
    }

    /* ── Layer Visibility (Eye Icon) ── */
    .layer-eye {
      width: 20px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
      font-size: 10px;
      color: var(--fd-text-tertiary);
      opacity: 0;
      transition: opacity 0.12s ease, color 0.12s ease;
    }
    .layer-item:hover .layer-eye,
    .layer-eye.hidden-layer {
      opacity: 1;
    }
    .layer-eye.hidden-layer {
      color: var(--fd-accent);
    }

    /* ── Selection Info Bar ── */
    #selection-bar {
      display: none;
      position: absolute;
      top: 8px;
      right: 16px;
      padding: 5px 14px;
      background: var(--fd-surface);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 0.5px solid var(--fd-border);
      border-radius: 20px;
      box-shadow: var(--fd-shadow-md);
      z-index: 15;
      font-size: 11px;
      color: var(--fd-text-secondary);
      font-weight: 500;
      white-space: nowrap;
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      letter-spacing: -0.02em;
    }
    #selection-bar.visible {
      display: block;
    }

    /* ── Help & Status ── */
    #tool-help-btn {
      margin-left: auto;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fd-text-secondary);
      border-radius: 20px;
      border: 1px solid var(--fd-border) !important;
      background: var(--fd-segment-bg);
    }
    #tool-help-btn:hover {
      background: var(--fd-surface-hover);
      color: var(--fd-text);
    }
    #status {
      color: var(--fd-text-tertiary);
      font-size: 11px;
      margin-left: 8px;
      font-weight: 400;
    }

    /* ── Canvas ──────────────────── */
    #canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      display: flex;
    }
    canvas {
      display: block;
      flex: 1;
    }
    #loading {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--fd-text-secondary);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.01em;
    }



    @keyframes fd-spin {
      to { transform: rotate(360deg); }
    }
    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 2.5px solid var(--fd-border);
      border-top-color: var(--fd-accent);
      border-radius: 50%;
      animation: fd-spin 0.8s linear infinite;
    }
    /* ── Cursor per tool ─────────── */
    canvas.tool-select { cursor: default; }
    canvas.tool-rect,
    canvas.tool-ellipse { cursor: crosshair; }
    canvas.tool-pen { cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="3" fill="white" stroke="black"/></svg>') 10 10, crosshair; }
    canvas.tool-text { cursor: text; }

    /* ── Properties Panel (Keynote inspector) ── */
    #props-panel {
      width: 0;
      overflow: hidden;
      background: var(--fd-surface);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border-left: 0.5px solid var(--fd-border);
      font-size: 11px;
      color: var(--fd-text);
      transition: width 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
      flex-shrink: 0;
      overflow-y: auto;
    }
    #props-panel.visible {
      width: 244px;
    }
    .props-inner {
      padding: 16px 14px;
      min-width: 244px;
    }
    .props-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--fd-text);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
      letter-spacing: -0.01em;
    }
    .props-title .kind-badge {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 7px;
      border-radius: 5px;
      background: var(--fd-accent-dim);
      color: var(--fd-accent);
      font-weight: 600;
    }
    .props-section {
      margin-bottom: 14px;
    }
    .props-section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fd-text-secondary);
      margin-bottom: 7px;
      font-weight: 600;
    }
    .props-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px 8px;
    }
    /* 3×3 text alignment grid picker */
    .align-grid {
      display: grid;
      grid-template-columns: repeat(3, 26px);
      grid-template-rows: repeat(3, 26px);
      gap: 0;
      border: 1px solid var(--fd-input-border);
      border-radius: 8px;
      overflow: hidden;
      width: fit-content;
    }
    .align-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--fd-input-bg);
      border: none;
      border-right: 1px solid var(--fd-input-border);
      border-bottom: 1px solid var(--fd-input-border);
      cursor: pointer;
      padding: 0;
      transition: background 0.12s ease;
    }
    .align-cell:nth-child(3n) { border-right: none; }
    .align-cell:nth-child(n+7) { border-bottom: none; }
    .align-cell:hover { background: rgba(79,195,247,0.15); }
    .align-cell.active {
      background: rgba(79,195,247,0.25);
    }
    .align-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--fd-text-secondary);
      transition: all 0.12s ease;
    }
    .align-cell.active .align-dot {
      background: #4FC3F7;
      width: 8px;
      height: 8px;
    }
    .props-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .props-field.full {
      grid-column: 1 / -1;
    }
    .props-field label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--fd-text-secondary);
      font-weight: 500;
    }
    .props-field input,
    .props-field select {
      padding: 5px 7px;
      border: 1px solid var(--fd-input-border);
      border-radius: 6px;
      background: var(--fd-input-bg);
      color: var(--fd-text);
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      font-size: 11px;
      outline: none;
      transition: all 0.15s ease;
    }
    .props-field input:focus {
      border-color: var(--fd-accent);
      box-shadow: 0 0 0 3px var(--fd-input-focus);
    }
    .props-field input[type="color"] {
      height: 30px;
      padding: 3px;
      cursor: pointer;
      border-radius: 6px;
    }
    .props-slider {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .props-slider input[type="range"] {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: var(--fd-slider-bg);
      border-radius: 2px;
      outline: none;
    }
    .props-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px; height: 16px;
      border-radius: 50%;
      background: var(--fd-accent);
      cursor: pointer;
      border: 2px solid var(--fd-slider-thumb-border);
      box-shadow: var(--fd-shadow-sm);
    }
    .props-slider .slider-val {
      font-size: 10px;
      color: var(--fd-text-secondary);
      min-width: 30px;
      text-align: right;
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      font-weight: 500;
    }

    /* ── Shape Palette (Freeform-style) ── */
    #shape-palette {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: row;
      gap: 2px;
      z-index: 50;
      background: var(--fd-surface);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 0.5px solid var(--fd-border);
      border-radius: 12px;
      padding: 5px;
      box-shadow: var(--fd-shadow-md);
      align-items: center;
    }
    .palette-sep {
      width: 1px;
      height: 24px;
      background: var(--fd-border);
      margin: 0 3px;
      opacity: 0.6;
      flex-shrink: 0;
    }
    .palette-item {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      cursor: grab;
      color: var(--fd-text-secondary);
      font-size: 18px;
      transition: all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
      user-select: none;
      position: relative;
    }
    .palette-item:hover {
      background: var(--fd-surface-hover);
      color: var(--fd-text);
    }
    .palette-item:active {
      cursor: grabbing;
      transform: scale(0.90);
      background: var(--fd-surface-active);
    }
    .palette-item .palette-label {
      display: none;
      position: absolute;
      bottom: 46px;
      background: var(--fd-surface-solid);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: var(--fd-shadow-sm);
      color: var(--fd-text);
    }
    .palette-item:hover .palette-label {
      display: block;
    }

    /* ── Annotation Card ── */
    #annotation-card {
      display: none;
      position: absolute;
      z-index: 100;
      width: 280px;
      background: var(--fd-surface);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 0.5px solid var(--fd-border);
      border-radius: 12px;
      padding: 14px;
      font-size: 12px;
      color: var(--fd-text);
      box-shadow: var(--fd-shadow-lg);
    }
    #annotation-card.visible { display: block; }
    #annotation-card .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-weight: 600;
      font-size: 13px;
    }
    #annotation-card .card-close {
      cursor: pointer;
      opacity: 0.5;
      font-size: 16px;
      background: none;
      border: none;
      color: inherit;
      transition: opacity 0.15s;
    }
    #annotation-card .card-close:hover { opacity: 1; }
    #annotation-card .field-group { margin-bottom: 10px; }
    #annotation-card .field-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fd-text-secondary);
      margin-bottom: 4px;
      font-weight: 600;
    }
    #annotation-card textarea,
    #annotation-card input[type="text"],
    #annotation-card select {
      width: 100%;
      padding: 5px 7px;
      border: 1px solid var(--fd-input-border);
      border-radius: 6px;
      background: var(--fd-input-bg);
      color: var(--fd-text);
      font-family: inherit;
      font-size: 12px;
      resize: vertical;
      transition: all 0.15s ease;
    }
    #annotation-card textarea:focus,
    #annotation-card input[type="text"]:focus {
      border-color: var(--fd-accent);
      box-shadow: 0 0 0 3px var(--fd-input-focus);
      outline: none;
    }
    #annotation-card textarea { min-height: 40px; }
    #annotation-card .accept-item {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    #annotation-card .accept-item input[type="text"] { flex: 1; }
    #annotation-card .add-btn {
      cursor: pointer;
      font-size: 11px;
      color: var(--fd-accent);
      background: none;
      border: none;
      padding: 2px 0;
      font-weight: 500;
    }
    #annotation-card .add-btn:hover { text-decoration: underline; }
    #annotation-card .status-row {
      display: flex;
      gap: 6px;
    }
    #annotation-card .status-row select { flex: 1; }

    /* ── Context Menu (macOS-style) ── */
    #context-menu {
      display: none;
      position: absolute;
      z-index: 200;
      background: var(--fd-surface);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 0.5px solid var(--fd-border);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 10px 38px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06);
      font-size: 13px;
      min-width: 200px;
    }
    .dark-theme #context-menu {
      box-shadow: 0 10px 38px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
    }
    #context-menu.visible { display: block; }
    #context-menu .menu-item {
      padding: 4px 10px;
      cursor: default;
      color: var(--fd-text);
      transition: none;
      border-radius: 5px;
      display: flex;
      align-items: center;
      gap: 8px;
      height: 26px;
      font-size: 13px;
      letter-spacing: -0.01em;
    }
    #context-menu .menu-item:hover {
      background: var(--fd-accent);
      color: var(--fd-accent-fg);
    }
    #context-menu .menu-item.disabled {
      opacity: 0.35;
      pointer-events: none;
    }
    #context-menu .menu-item:hover .menu-shortcut {
      color: rgba(255,255,255,0.55);
    }
    #context-menu .menu-item .menu-icon {
      width: 16px;
      text-align: center;
      font-size: 12px;
      flex-shrink: 0;
    }
    #context-menu .menu-item .menu-label {
      flex: 1;
    }
    #context-menu .menu-shortcut {
      font-size: 11px;
      color: var(--fd-text-tertiary);
      margin-left: auto;
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      letter-spacing: 0;
    }
    #context-menu .menu-separator {
      height: 1px;
      background: var(--fd-border);
      margin: 4px 8px;
    }

    /* ── Animation Picker (glassmorphism popover) ── */
    #anim-picker {
      display: none;
      position: absolute;
      z-index: 250;
      width: 260px;
      background: var(--fd-surface);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border: 0.5px solid var(--fd-border);
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.16), 0 4px 14px rgba(0,0,0,0.08);
      font-size: 13px;
      color: var(--fd-text);
      overflow: hidden;
    }
    .dark-theme #anim-picker {
      box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.3);
    }
    #anim-picker.visible { display: block; }
    .picker-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 14px 8px;
      font-weight: 600;
      font-size: 13px;
      border-bottom: 0.5px solid var(--fd-border);
      letter-spacing: -0.01em;
    }
    .picker-icon { font-size: 14px; }
    .picker-close {
      margin-left: auto;
      cursor: pointer;
      background: none;
      border: none;
      color: var(--fd-text-secondary);
      font-size: 16px;
      opacity: 0.6;
      transition: opacity 0.15s;
      padding: 0 2px;
    }
    .picker-close:hover { opacity: 1; }
    .picker-body { padding: 4px 0; max-height: 380px; overflow-y: auto; }
    .picker-group-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--fd-text-secondary);
      padding: 8px 14px 4px;
      font-weight: 600;
    }
    .picker-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px;
      cursor: default;
      border-radius: 6px;
      margin: 1px 4px;
      transition: background 0.1s;
    }
    .picker-item:hover {
      background: var(--fd-accent);
      color: var(--fd-accent-fg);
    }
    .picker-item .pi-icon {
      width: 18px;
      text-align: center;
      font-size: 13px;
      flex-shrink: 0;
    }
    .picker-item .pi-label { flex: 1; font-size: 12px; }
    .picker-item .pi-meta {
      font-size: 10px;
      color: var(--fd-text-tertiary);
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
    }
    .picker-item:hover .pi-meta { color: rgba(255,255,255,0.55); }
    .picker-sep {
      height: 1px;
      background: var(--fd-border);
      margin: 4px 12px;
    }
    .picker-existing {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px;
      font-size: 11px;
      color: var(--fd-text-secondary);
    }
    .picker-existing .pe-remove {
      margin-left: auto;
      cursor: pointer;
      background: none;
      border: none;
      color: var(--fd-text-tertiary);
      font-size: 14px;
      opacity: 0.6;
      transition: opacity 0.15s;
    }
    .picker-existing .pe-remove:hover { opacity: 1; color: var(--fd-accent); }

    /* ── Shortcut Help (Apple sheet) ── */
    #shortcut-help {
      display: none;
      position: absolute;
      inset: 0;
      z-index: 300;
      background: var(--fd-overlay-bg);
      backdrop-filter: blur(8px);
      align-items: center;
      justify-content: center;
    }
    #shortcut-help.visible { display: flex; }
    .help-panel {
      background: var(--fd-surface-solid);
      backdrop-filter: blur(24px);
      border: 0.5px solid var(--fd-border);
      border-radius: 14px;
      width: 560px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: var(--fd-shadow-lg);
      color: var(--fd-text);
    }
    .help-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 0.5px solid var(--fd-border);
    }
    .help-header h3 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
    .help-close {
      cursor: pointer;
      font-size: 18px;
      background: none;
      border: none;
      color: var(--fd-text-secondary);
      opacity: 0.7;
      transition: opacity 0.15s;
    }
    .help-close:hover { opacity: 1; }
    .help-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      padding: 10px 20px 14px;
    }
    .help-section { padding: 8px 0; }
    .help-section h4 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--fd-text-secondary);
      margin: 0 0 6px;
      font-weight: 600;
    }
    .help-section dl { margin: 0; padding: 0; }
    .help-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
      font-size: 12px;
    }
    .help-row dt { width: 80px; text-align: right; }
    .help-row dd { margin: 0; color: var(--fd-text-secondary); }
    kbd {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid var(--fd-key-border);
      border-radius: 5px;
      background: var(--fd-key-bg);
      font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
      font-size: 11px;
      line-height: 1.3;
      font-weight: 500;
    }
    .help-footer {
      text-align: center;
      padding: 10px;
      font-size: 11px;
      color: var(--fd-text-secondary);
      border-top: 0.5px solid var(--fd-border);
    }

    /* ── Zen Mode Toggle Button (top-right floating) ── */
    #zen-toggle-btn {
      position: fixed;
      top: 52px;
      right: 14px;
      z-index: 300;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border: 0.5px solid var(--fd-border);
      border-radius: 20px;
      background: var(--fd-surface);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: var(--fd-text-secondary);
      font-size: 11px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      box-shadow: var(--fd-shadow-sm);
      transition: all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
      letter-spacing: -0.01em;
    }
    #zen-toggle-btn:hover {
      background: var(--fd-surface-hover);
      color: var(--fd-text);
      box-shadow: var(--fd-shadow-md);
      transform: translateY(-1px);
    }
    #zen-toggle-btn .zen-icon { font-size: 13px; }

    /* ── Zen Mode overrides ── */
    .zen-mode #toolbar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      top: auto;
      border: 0.5px solid var(--fd-border);
      border-radius: 16px;
      border-bottom: 0.5px solid var(--fd-border);
      padding: 6px 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
      gap: 2px;
      z-index: 50;
    }
    .dark-theme.zen-mode #toolbar {
      box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
    }
    .zen-mode .zen-full-only { display: none !important; }
    .zen-mode #layers-panel { display: none !important; }
    .zen-mode #props-panel { display: none !important; }
    .zen-mode #minimap-container { display: none !important; }
    .zen-mode #shape-palette { display: none !important; }
    .zen-mode #selection-bar { display: none !important; }
    .zen-mode #spec-overlay { display: none !important; }

    /* Panel toggle via keyboard in zen mode */
    .zen-mode #layers-panel.zen-visible {
      display: block !important;
    }
    .zen-mode #props-panel.zen-visible {
      display: block !important;
    }

  </style>
</head>
<body>
  <button id="zen-toggle-btn" title="Switch between Zen and Full layout"><span class="zen-icon">🧘</span> Zen</button>
  <div id="toolbar">
    <button class="tool-btn active" data-tool="select"><span class="tool-icon">▸</span>Select<span class="tool-key">V</span></button>
    <button class="tool-btn" data-tool="rect"><span class="tool-icon">▢</span>Rect<span class="tool-key">R</span></button>
    <button class="tool-btn" data-tool="ellipse"><span class="tool-icon">◯</span>Ellipse<span class="tool-key">O</span></button>
    <button class="tool-btn" data-tool="pen"><span class="tool-icon">✎</span>Pen<span class="tool-key">P</span></button>
    <button class="tool-btn" data-tool="arrow"><span class="tool-icon">→</span>Arrow<span class="tool-key">A</span></button>
    <button class="tool-btn" data-tool="text"><span class="tool-icon">T</span>Text<span class="tool-key">T</span></button>
    <button class="tool-btn" data-tool="frame"><span class="tool-icon">⊞</span>Frame<span class="tool-key">F</span></button>
    <div class="tool-sep zen-full-only"></div>
    <button class="tool-btn zen-full-only" id="ai-refine-btn" title="AI Assist selected node (rename + restyle)">&#x2728; Assist</button>
    <button class="tool-btn zen-full-only" id="ai-refine-all-btn" title="AI Assist all anonymous nodes">&#x2728; All</button>
    <div class="tool-sep zen-full-only"></div>
    <div class="view-toggle zen-full-only" id="view-toggle">
      <button class="view-btn active" id="view-design" title="Design View — full canvas">Design</button>
      <button class="view-btn" id="view-spec" title="Spec View — requirements and structure">Spec</button>
    </div>
    <div class="tool-sep zen-full-only"></div>
    <button class="tool-btn zen-full-only" id="grid-toggle-btn" title="Toggle grid overlay (G)">⊞</button>
    <button class="tool-btn zen-full-only" id="spec-badge-toggle-btn" title="Toggle spec badges on canvas">◇</button>

    <!-- Export Dropdown -->
    <div class="export-dropdown-container zen-full-only" id="export-dropdown-container">
      <button class="tool-btn" id="export-menu-btn" title="Export options">📥</button>
      <div class="export-menu" id="export-menu">
        <button class="export-menu-item" data-export="png-clip">📋 Copy as PNG (⌘⇧C)</button>
        <button class="export-menu-item" data-export="png-file">🖼️ Save as PNG (2x)</button>
        <button class="export-menu-item" data-export="svg-file">✨ Save as SVG</button>
        <div class="export-menu-sep"></div>
        <button class="export-menu-item" data-export="fd-clip">📝 Copy as .fd text</button>

      </div>
    </div>
    <div class="tool-sep zen-full-only"></div>
    <button class="tool-btn" id="sketchy-toggle-btn" title="Toggle sketchy hand-drawn mode">✏️</button>
    <button class="tool-btn zen-full-only" id="theme-toggle-btn" title="Toggle light/dark canvas theme">🌙</button>
    <button class="zen-full-only" id="zoom-level" title="Zoom level (click to reset to 100%)">100%</button>
    <button class="tool-btn zen-full-only" id="tool-help-btn" title="Keyboard shortcuts">?</button>
    <span class="zen-full-only" id="status">Loading WASM…</span>
  </div>
  <div id="canvas-container">
    <div id="shape-palette">
      <div class="palette-item" draggable="true" data-shape="rect">▢<span class="palette-label">Rectangle</span></div>
      <div class="palette-item" draggable="true" data-shape="ellipse">◯<span class="palette-label">Ellipse</span></div>
      <div class="palette-item" draggable="true" data-shape="text">T<span class="palette-label">Text</span></div>
      <div class="palette-sep"></div>
      <div class="palette-item" draggable="true" data-shape="frame">▣<span class="palette-label">Frame</span></div>
      <div class="palette-item" draggable="true" data-shape="line">━<span class="palette-label">Line</span></div>
      <div class="palette-item" draggable="true" data-shape="arrow">→<span class="palette-label">Arrow</span></div>
    </div>
    <div id="onboarding-overlay">
      <div class="onboard-heading">Start drawing</div>
      <div class="onboard-sub">Create something beautiful</div>
      <div class="onboard-cards">
        <button class="onboard-card" data-tool="rect" type="button">
          <span class="onboard-card-icon">📐</span>
          <div class="onboard-card-title">Draw shapes</div>
          <div class="onboard-card-desc">Rectangles, ellipses, frames</div>
        </button>
        <button class="onboard-card" data-tool="pen" type="button">
          <span class="onboard-card-icon">✏️</span>
          <div class="onboard-card-title">Sketch freely</div>
          <div class="onboard-card-desc">Freehand pen drawings</div>
        </button>
        <button class="onboard-card" data-tool="text" type="button">
          <span class="onboard-card-icon">📝</span>
          <div class="onboard-card-title">Type text</div>
          <div class="onboard-card-desc">Labels, headings, notes</div>
        </button>
      </div>
      <div class="onboard-hint">Press <kbd>?</kbd> for all shortcuts</div>
    </div>
    <div id="floating-action-bar">
      <span class="fab-label">Fill</span>
      <input type="color" id="fab-fill" class="fab-color" value="#4A90D9" title="Fill color">
      <div class="fab-sep"></div>
      <span class="fab-label">Stroke</span>
      <input type="color" id="fab-stroke" class="fab-color" value="#333333" title="Stroke color">
      <input type="number" id="fab-stroke-w" class="fab-input" min="0" max="20" step="1" value="1" title="Stroke width">
      <div class="fab-sep"></div>
      <span class="fab-label">Opacity</span>
      <input type="range" id="fab-opacity" class="fab-slider" min="0" max="1" step="0.05" value="1" title="Opacity">
      <span id="fab-opacity-val" style="font-size:10px;min-width:24px">100%</span>
      <div class="fab-sep fab-text-only"></div>
      <span class="fab-label fab-text-only">Size</span>
      <input type="number" id="fab-font-size" class="fab-input fab-text-only" min="8" max="200" step="1" value="16" title="Font size">
      <div class="fab-sep"></div>
      <button class="fab-btn" id="fab-more-btn" title="More actions">⋯</button>
      <div id="fab-overflow-menu">
        <button class="fab-menu-item" data-action="group">⌘G ◻ Group</button>
        <button class="fab-menu-item" data-action="ungroup">⌘⇧G ◫ Ungroup</button>
        <button class="fab-menu-item" data-action="duplicate">⌘D Duplicate</button>
        <button class="fab-menu-item" data-action="copy-png">⌘⇧C Copy as PNG</button>
        <button class="fab-menu-item" data-action="delete" style="color:#e57373">⌫ Delete</button>
      </div>
    </div>
    <canvas id="fd-canvas" class="tool-select"></canvas>
    <div id="dimension-tooltip"></div>
    <div id="spec-overlay"></div>
    <div id="layers-panel"></div>
    <div id="minimap-container"><canvas id="minimap-canvas"></canvas></div>
    <div id="selection-bar"></div>
    <div id="loading"><div class="loading-spinner"></div>Loading FD engine…</div>
    <!-- Properties Panel (Apple-style) -->
    <div id="props-panel">
      <div class="props-inner">
        <div class="props-title">
          <span id="props-node-id">Node</span>
          <span class="kind-badge" id="props-kind">rect</span>
        </div>
        <div class="props-section">
          <div class="props-section-label">Position & Size</div>
          <div class="props-grid">
            <div class="props-field">
              <label>X</label>
              <input type="number" id="prop-x" step="1">
            </div>
            <div class="props-field">
              <label>Y</label>
              <input type="number" id="prop-y" step="1">
            </div>
            <div class="props-field">
              <label>W</label>
              <input type="number" id="prop-w" step="1" min="0">
            </div>
            <div class="props-field">
              <label>H</label>
              <input type="number" id="prop-h" step="1" min="0">
            </div>
          </div>
        </div>
        <div class="props-section" id="props-appearance">
          <div class="props-section-label">Appearance</div>
          <div class="props-grid">
            <div class="props-field">
              <label>Fill</label>
              <input type="color" id="prop-fill" value="#CCCCCC">
              <div class="color-swatches" id="fill-swatches"></div>
            </div>
            <div class="props-field">
              <label>Corner</label>
              <input type="number" id="prop-corner" step="1" min="0" value="0">
            </div>
            <div class="props-field">
              <label>Stroke</label>
              <input type="color" id="prop-stroke-color" value="#000000">
            </div>
            <div class="props-field">
              <label>Width</label>
              <input type="number" id="prop-stroke-w" step="0.5" min="0" value="0">
            </div>
          </div>
        </div>
        <div class="props-section">
          <div class="props-section-label">Opacity</div>
          <div class="props-slider">
            <input type="range" id="prop-opacity" min="0" max="1" step="0.01" value="1">
            <span class="slider-val" id="prop-opacity-val">100%</span>
          </div>
        </div>
        <div class="props-section" id="props-text-section" style="display:none">
          <div class="props-section-label">Content</div>
          <div class="props-field full">
            <input type="text" id="prop-text-content" placeholder="Text content">
          </div>
        </div>
        <div class="props-section" id="props-align-section" style="display:none">
          <div class="props-section-label">Alignment</div>
          <div class="align-grid" id="align-grid">
            <button class="align-cell" data-h="left"   data-v="top"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="center" data-v="top"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="right"  data-v="top"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="left"   data-v="middle"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="center" data-v="middle"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="right"  data-v="middle"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="left"   data-v="bottom"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="center" data-v="bottom"><span class="align-dot"></span></button>
            <button class="align-cell" data-h="right"  data-v="bottom"><span class="align-dot"></span></button>
          </div>
        </div>
    </div>
  </div>
  <div id="annotation-card">
    <div class="card-header">
      <span id="card-title">Spec</span>
      <button class="card-close" id="card-close-btn">×</button>
    </div>
    <div class="field-group">
      <div class="field-label">Description</div>
      <textarea id="ann-description" placeholder="What this node is/does…"></textarea>
    </div>
    <div class="field-group">
      <div class="field-label">Acceptance Criteria</div>
      <div id="ann-accept-list"></div>
      <button class="add-btn" id="ann-add-accept">+ Add</button>
    </div>
    <div class="field-group status-row">
      <div style="flex:1">
        <div class="field-label">Status</div>
        <select id="ann-status">
          <option value="">None</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div style="flex:1">
        <div class="field-label">Priority</div>
        <select id="ann-priority">
          <option value="">None</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
    <div class="field-group">
      <div class="field-label">Tags</div>
      <input type="text" id="ann-tags" placeholder="comma-separated tags">
    </div>
  </div>
  <div id="context-menu">
    <div class="menu-item" id="ctx-ai-refine"><span class="menu-icon">✦</span><span class="menu-label">AI Assist</span></div>
    <div class="menu-item" id="ctx-add-annotation"><span class="menu-icon">◇</span><span class="menu-label">Add Spec</span></div>
    <div class="menu-item" id="ctx-view-spec" style="display:none"><span class="menu-icon">◈</span><span class="menu-label">View Spec</span><span class="menu-shortcut">⌘I</span></div>
    <div class="menu-item" id="ctx-remove-spec" style="display:none"><span class="menu-icon">◇</span><span class="menu-label">Remove Spec</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" id="ctx-cut" data-action="cut"><span class="menu-icon">✂</span><span class="menu-label">Cut</span><span class="menu-shortcut">⌘X</span></div>
    <div class="menu-item" id="ctx-copy" data-action="copy"><span class="menu-icon">⎘</span><span class="menu-label">Copy</span><span class="menu-shortcut">⌘C</span></div>
    <div class="menu-item" id="ctx-paste" data-action="paste"><span class="menu-icon">📋</span><span class="menu-label">Paste</span><span class="menu-shortcut">⌘V</span></div>
    <div class="menu-item" id="ctx-copy-png" data-action="copy-png"><span class="menu-icon">🖼</span><span class="menu-label">Copy as PNG</span><span class="menu-shortcut">⌘⇧C</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" id="ctx-duplicate" data-action="duplicate"><span class="menu-icon">⊕</span><span class="menu-label">Duplicate</span><span class="menu-shortcut">⌘D</span></div>
    <div class="menu-item" id="ctx-group" data-action="group"><span class="menu-icon">◻</span><span class="menu-label">Group</span><span class="menu-shortcut">⌘G</span></div>
    <div class="menu-item" id="ctx-ungroup" data-action="ungroup"><span class="menu-icon">◫</span><span class="menu-label">Ungroup</span><span class="menu-shortcut">⇧⌘G</span></div>
    <div class="menu-item" id="ctx-frame" data-action="frame-selection"><span class="menu-icon">⊞</span><span class="menu-label">Frame Selection</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" id="ctx-bring-front" data-action="bring-front"><span class="menu-icon">↑</span><span class="menu-label">Bring to Front</span><span class="menu-shortcut">⌘⇧]</span></div>
    <div class="menu-item" id="ctx-send-back" data-action="send-back"><span class="menu-icon">↓</span><span class="menu-label">Send to Back</span><span class="menu-shortcut">⌘⇧[</span></div>
    <div class="menu-item disabled" id="ctx-lock" data-action="lock"><span class="menu-icon">🔒</span><span class="menu-label">Lock</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" id="ctx-delete" data-action="delete"><span class="menu-icon">⊖</span><span class="menu-label">Delete</span><span class="menu-shortcut">⌫</span></div>
  </div>
  <div id="anim-picker">
    <div class="picker-header"><span class="picker-icon">⚡</span> Add Animation <button class="picker-close" id="anim-picker-close">×</button></div>
    <div class="picker-body" id="anim-picker-body"></div>
  </div>

  <script nonce="{nonce}">
    window.initialText = {initialText};
    window.wasmBinaryUrl = "{wasmBinaryUri}";
    window.wasmJsUrl = "{wasmJsUri}";
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script nonce="{nonce}">
    // ─── AI Assist toolbar + context menu handlers ─────────
    (function() {
      const vscodeApi = window.vscodeApi;
      let selectedNodeId = null;

      // Listen for selection changes from canvas
      window.addEventListener('message', (e) => {
        if (e.data.type === 'nodeSelected') {
          selectedNodeId = e.data.id || null;
        }
        if (e.data.type === 'aiRefineStarted') {
          const btn = document.getElementById('ai-refine-btn');
          const allBtn = document.getElementById('ai-refine-all-btn');
          if (btn) { btn.textContent = '⏳ Refining…'; btn.disabled = true; }
          if (allBtn) { allBtn.disabled = true; }
        }
        if (e.data.type === 'aiRefineComplete') {
          const btn = document.getElementById('ai-refine-btn');
          const allBtn = document.getElementById('ai-refine-all-btn');
          if (btn) { btn.textContent = '✨ Assist'; btn.disabled = false; }
          if (allBtn) { allBtn.disabled = false; }
        }
      });

      // Assist selected node
      document.getElementById('ai-refine-btn')?.addEventListener('click', () => {
        if (selectedNodeId) {
          vscodeApi.postMessage({ type: 'aiRefine', nodeIds: [selectedNodeId] });
        } else {
          // No selection — assist all anon nodes
          vscodeApi.postMessage({ type: 'aiRefineAll' });
        }
      });

      // Assist all anonymous nodes
      document.getElementById('ai-refine-all-btn')?.addEventListener('click', () => {
        vscodeApi.postMessage({ type: 'aiRefineAll' });
      });

      // Context menu: AI Assist
      document.getElementById('ctx-ai-refine')?.addEventListener('click', () => {
        if (selectedNodeId) {
          vscodeApi.postMessage({ type: 'aiRefine', nodeIds: [selectedNodeId] });
        }
        document.getElementById('context-menu')?.classList.remove('visible');
      });
    })();
  </script>
  <script nonce="{nonce}" type="module" src="{mainJsUri}"></script>
</body>
</html>`;
