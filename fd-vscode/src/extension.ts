import * as vscode from "vscode";
import { refineSelectedNodes, findAnonNodeIds } from "./ai-refine";

/**
 * FD Custom Editor Provider.
 *
 * Creates a side-by-side experience: VS Code's built-in text editor +
 * a WASM-powered canvas webview that renders the .fd scene graph.
 *
 * TypeScript is ONLY glue — all rendering and parsing happens in Rust/WASM.
 */
class FdEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "fd.canvas";

  constructor(private readonly context: vscode.ExtensionContext) { }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "webview"),
      ],
    };

    // Set HTML content
    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document
    );

    // ─── Extension → Webview: text changes ─────────────────────────
    const changeDocumentSubscription =
      vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          webviewPanel.webview.postMessage({
            type: "setText",
            text: document.getText(),
          });
        }
      });

    // ─── Webview → Extension: canvas mutations ─────────────────────
    webviewPanel.webview.onDidReceiveMessage(async (message: { type: string; text?: string; id?: string; nodeIds?: string[] }) => {
      switch (message.type) {
        case "textChanged": {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            message.text ?? ""
          );
          vscode.workspace.applyEdit(edit);
          break;
        }
        case "nodeSelected": {
          // Future: show properties panel, highlight in text
          break;
        }
        case "ready": {
          // Webview loaded — send initial text
          webviewPanel.webview.postMessage({
            type: "setText",
            text: document.getText(),
          });
          break;
        }
        case "aiRefine": {
          const nodeIds = message.nodeIds ?? [];
          await this.handleAiRefine(document, webviewPanel, nodeIds);
          break;
        }
        case "aiRefineAll": {
          const allAnon = findAnonNodeIds(document.getText());
          await this.handleAiRefine(document, webviewPanel, allAnon);
          break;
        }
      }
    });

    // ─── Text editor cursor → Canvas selection ──────────────────────
    let suppressCursorSync = false;
    const cursorSubscription =
      vscode.window.onDidChangeTextEditorSelection(
        (e: vscode.TextEditorSelectionChangeEvent) => {
          if (suppressCursorSync) return;
          // Only respond to the text editor for this document
          if (e.textEditor.document.uri.toString() !== document.uri.toString()) return;
          const line = e.textEditor.document.lineAt(
            e.selections[0].active.line
          ).text;
          const nodeMatch = line.match(/@(\w+)/);
          if (nodeMatch) {
            webviewPanel.webview.postMessage({
              type: "selectNode",
              nodeId: nodeMatch[1],
            });
          }
        }
      );

    // Cleanup
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      cursorSubscription.dispose();
    });
  }

  // ─── AI Refine Handler ─────────────────────────────────────────────

  private async handleAiRefine(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    nodeIds: string[]
  ): Promise<void> {
    if (nodeIds.length === 0) {
      // If no specific nodes, find all _anon_ nodes
      const allAnon = findAnonNodeIds(document.getText());
      if (allAnon.length === 0) {
        webviewPanel.webview.postMessage({
          type: "aiRefineComplete",
          error: "No anonymous nodes to refine.",
        });
        return;
      }
      nodeIds = allAnon;
    }

    // Notify webview that refine started
    webviewPanel.webview.postMessage({ type: "aiRefineStarted" });

    const result = await refineSelectedNodes(document.getText(), nodeIds);

    if (result.error) {
      vscode.window.showWarningMessage(`AI Refine: ${result.error}`);
      webviewPanel.webview.postMessage({
        type: "aiRefineComplete",
        error: result.error,
      });
      return;
    }

    // Apply refined text to the document
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      result.refinedText
    );
    await vscode.workspace.applyEdit(edit);

    webviewPanel.webview.postMessage({ type: "aiRefineComplete" });
    vscode.window.showInformationMessage(
      `AI Refine: ${nodeIds.length} node(s) refined.`
    );
  }

  private getHtmlForWebview(
    webview: vscode.Webview,
    document: vscode.TextDocument
  ): string {
    // URIs for webview resources
    const wasmJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "webview",
        "wasm",
        "fd_wasm.js"
      )
    );
    const mainJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "webview", "main.js")
    );

    const nonce = getNonce();
    const initialText = document
      .getText()
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${webview.cspSource};
    style-src 'nonce-${nonce}';
    img-src ${webview.cspSource};
    connect-src ${webview.cspSource};
    font-src ${webview.cspSource};
  ">
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      background: var(--vscode-editor-background, #1E1E2E);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    }
    /* ── Toolbar ─────────────────── */
    #toolbar {
      display: flex;
      gap: 2px;
      padding: 5px 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground, #181825);
      border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, #313244);
      flex-shrink: 0;
      align-items: center;
    }
    .tool-btn {
      padding: 5px 10px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--vscode-button-secondaryForeground, #CDD6F4);
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .tool-btn:hover {
      background: rgba(255,255,255,0.06);
    }
    .tool-btn.active {
      background: var(--vscode-button-background, #89B4FA);
      color: var(--vscode-button-foreground, #1E1E2E);
      border-color: transparent;
    }
    .tool-icon { font-size: 14px; }
    .tool-key {
      font-size: 9px;
      opacity: 0.5;
      padding: 1px 3px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .active .tool-key {
      border-color: rgba(0,0,0,0.2);
      opacity: 0.6;
    }
    .tool-sep {
      width: 1px;
      height: 18px;
      background: var(--vscode-editorGroupHeader-tabsBorder, #313244);
      margin: 0 4px;
    }
    #tool-help-btn {
      margin-left: auto;
      padding: 4px 8px;
      font-size: 12px;
    }
    #status {
      color: var(--vscode-descriptionForeground, #6C7086);
      font-size: 11px;
      margin-left: 8px;
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
      align-items: center;
      justify-content: center;
      color: var(--vscode-descriptionForeground, #6C7086);
      font-size: 14px;
    }
    /* ── Cursor per tool ─────────── */
    canvas.tool-select { cursor: default; }
    canvas.tool-rect,
    canvas.tool-ellipse { cursor: crosshair; }
    canvas.tool-pen { cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="3" fill="white" stroke="black"/></svg>') 10 10, crosshair; }
    canvas.tool-text { cursor: text; }
    /* ── Properties Panel (Apple-style) ── */
    #props-panel {
      width: 0;
      overflow: hidden;
      background: rgba(30, 30, 46, 0.85);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-left: 1px solid rgba(255,255,255,0.08);
      font-size: 11px;
      color: var(--vscode-foreground, #CDD6F4);
      transition: width 0.2s ease;
      flex-shrink: 0;
      overflow-y: auto;
    }
    #props-panel.visible {
      width: 240px;
    }
    .props-inner {
      padding: 14px 12px;
      min-width: 240px;
    }
    .props-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground, #CDD6F4);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .props-title .kind-badge {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(137, 180, 250, 0.15);
      color: #89B4FA;
      font-weight: 500;
    }
    .props-section {
      margin-bottom: 12px;
    }
    .props-section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--vscode-descriptionForeground, #6C7086);
      margin-bottom: 6px;
      font-weight: 500;
    }
    .props-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 8px;
    }
    .props-field {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .props-field.full {
      grid-column: 1 / -1;
    }
    .props-field label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--vscode-descriptionForeground, #6C7086);
    }
    .props-field input,
    .props-field select {
      padding: 4px 6px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 5px;
      background: rgba(255,255,255,0.04);
      color: var(--vscode-input-foreground, #CDD6F4);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .props-field input:focus {
      border-color: rgba(137, 180, 250, 0.4);
    }
    .props-field input[type="color"] {
      height: 28px;
      padding: 2px;
      cursor: pointer;
    }
    .props-slider {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .props-slider input[type="range"] {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      outline: none;
    }
    .props-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #89B4FA;
      cursor: pointer;
      border: 2px solid rgba(30,30,46,0.8);
    }
    .props-slider .slider-val {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #A6ADC8);
      min-width: 28px;
      text-align: right;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    /* ── Drag & Drop Palette ────── */
    #shape-palette {
      position: absolute;
      top: 50%;
      left: 10px;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 50;
      background: rgba(30, 30, 46, 0.75);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 6px;
    }
    .palette-item {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 7px;
      cursor: grab;
      color: var(--vscode-foreground, #CDD6F4);
      font-size: 18px;
      transition: all 0.15s ease;
      user-select: none;
    }
    .palette-item:hover {
      background: rgba(255,255,255,0.08);
    }
    .palette-item:active {
      cursor: grabbing;
      transform: scale(0.92);
    }
    .palette-item .palette-label {
      display: none;
      position: absolute;
      left: 48px;
      background: rgba(30,30,46,0.9);
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 11px;
      white-space: nowrap;
      pointer-events: none;
    }
    .palette-item:hover .palette-label {
      display: block;
    }
    /* ── Annotation card overlay ── */
    #annotation-card {
      display: none;
      position: absolute;
      z-index: 100;
      width: 280px;
      background: rgba(30, 30, 46, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      color: var(--vscode-foreground, #CDD6F4);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    #annotation-card.visible { display: block; }
    #annotation-card .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: 600;
      font-size: 13px;
    }
    #annotation-card .card-close {
      cursor: pointer;
      opacity: 0.6;
      font-size: 16px;
      background: none;
      border: none;
      color: inherit;
    }
    #annotation-card .card-close:hover { opacity: 1; }
    #annotation-card .field-group { margin-bottom: 8px; }
    #annotation-card .field-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #6C7086);
      margin-bottom: 3px;
    }
    #annotation-card textarea,
    #annotation-card input[type="text"],
    #annotation-card select {
      width: 100%;
      padding: 4px 6px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 5px;
      background: rgba(255,255,255,0.04);
      color: var(--vscode-input-foreground, #CDD6F4);
      font-family: inherit;
      font-size: 12px;
      resize: vertical;
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
      color: #89B4FA;
      background: none;
      border: none;
      padding: 2px 0;
    }
    #annotation-card .add-btn:hover { text-decoration: underline; }
    #annotation-card .status-row {
      display: flex;
      gap: 6px;
    }
    #annotation-card .status-row select { flex: 1; }
    /* ── Context menu ────────────── */
    #context-menu {
      display: none;
      position: absolute;
      z-index: 200;
      background: rgba(30, 30, 46, 0.9);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 4px 0;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      font-size: 12px;
      min-width: 160px;
    }
    #context-menu.visible { display: block; }
    #context-menu .menu-item {
      padding: 6px 14px;
      cursor: pointer;
      color: var(--vscode-menu-foreground, #CDD6F4);
      transition: background 0.1s ease;
    }
    #context-menu .menu-item:hover {
      background: rgba(255,255,255,0.06);
    }
    /* ── Shortcut help overlay ──── */
    #shortcut-help {
      display: none;
      position: absolute;
      inset: 0;
      z-index: 300;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
      align-items: center;
      justify-content: center;
    }
    #shortcut-help.visible { display: flex; }
    .help-panel {
      background: rgba(30, 30, 46, 0.95);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      width: 560px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
      color: var(--vscode-foreground, #CDD6F4);
    }
    .help-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .help-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
    .help-close {
      cursor: pointer;
      font-size: 18px;
      background: none;
      border: none;
      color: inherit;
      opacity: 0.6;
    }
    .help-close:hover { opacity: 1; }
    .help-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      padding: 8px 18px 12px;
    }
    .help-section { padding: 8px 0; }
    .help-section h4 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground, #6C7086);
      margin: 0 0 6px;
    }
    .help-section dl { margin: 0; padding: 0; }
    .help-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
      font-size: 12px;
    }
    .help-row dt { width: 80px; text-align: right; }
    .help-row dd { margin: 0; color: var(--vscode-descriptionForeground, #A6ADC8); }
    kbd {
      display: inline-block;
      padding: 1px 5px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px;
      background: rgba(255,255,255,0.04);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      line-height: 1.4;
    }
    .help-footer {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #6C7086);
      border-top: 1px solid rgba(255,255,255,0.06);
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button class="tool-btn active" data-tool="select"><span class="tool-icon">▸</span>Select<span class="tool-key">V</span></button>
    <button class="tool-btn" data-tool="rect"><span class="tool-icon">▢</span>Rect<span class="tool-key">R</span></button>
    <button class="tool-btn" data-tool="ellipse"><span class="tool-icon">◯</span>Ellipse<span class="tool-key">O</span></button>
    <button class="tool-btn" data-tool="pen"><span class="tool-icon">✎</span>Pen<span class="tool-key">P</span></button>
    <button class="tool-btn" data-tool="text"><span class="tool-icon">T</span>Text<span class="tool-key">T</span></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="ai-refine-btn" title="AI Refine selected node (rename + restyle)">✨ Refine</button>
    <button class="tool-btn" id="ai-refine-all-btn" title="AI Refine all anonymous nodes">✨ All</button>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="tool-help-btn">?</button>
    <span id="status">Loading WASM…</span>
  </div>
  <div id="canvas-container">
    <div id="shape-palette">
      <div class="palette-item" draggable="true" data-shape="rect">▢<span class="palette-label">Rectangle</span></div>
      <div class="palette-item" draggable="true" data-shape="ellipse">◯<span class="palette-label">Ellipse</span></div>
      <div class="palette-item" draggable="true" data-shape="text">T<span class="palette-label">Text</span></div>
    </div>
    <canvas id="fd-canvas" class="tool-select"></canvas>
    <div id="loading">Loading FD engine…</div>
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
      </div>
    </div>
  </div>
  <div id="annotation-card">
    <div class="card-header">
      <span id="card-title">Annotations</span>
      <button class="card-close" id="card-close-btn">×</button>
    </div>
    <div class="field-group">
      <div class="field-label">Description</div>
      <textarea id="ann-description" placeholder="What this node is/does…"></textarea>
    </div>
    <div class="field-group">
      <div class="field-label">Acceptance Criteria</div>
      <div id="ann-accept-list"></div>
      <button class="add-btn" id="ann-add-accept">+ Add criterion</button>
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
    <div class="menu-item" id="ctx-add-annotation">📌 Add Annotation</div>
    <div class="menu-item" id="ctx-ai-refine">✨ AI Refine</div>
  </div>

  <script nonce="${nonce}">
    window.initialText = \`${initialText}\`;
  </script>
  <script nonce="${nonce}">
    // ─── AI Refine toolbar + context menu handlers ─────────
    (function() {
      const vscodeApi = acquireVsCodeApi();
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
          if (btn) { btn.textContent = '✨ Refine'; btn.disabled = false; }
          if (allBtn) { allBtn.disabled = false; }
        }
      });

      // Refine selected node
      document.getElementById('ai-refine-btn')?.addEventListener('click', () => {
        if (selectedNodeId) {
          vscodeApi.postMessage({ type: 'aiRefine', nodeIds: [selectedNodeId] });
        } else {
          // No selection — refine all anon nodes
          vscodeApi.postMessage({ type: 'aiRefineAll' });
        }
      });

      // Refine all anonymous nodes
      document.getElementById('ai-refine-all-btn')?.addEventListener('click', () => {
        vscodeApi.postMessage({ type: 'aiRefineAll' });
      });

      // Context menu: AI Refine
      document.getElementById('ctx-ai-refine')?.addEventListener('click', () => {
        if (selectedNodeId) {
          vscodeApi.postMessage({ type: 'aiRefine', nodeIds: [selectedNodeId] });
        }
        document.getElementById('context-menu')?.classList.remove('visible');
      });
    })();
  </script>
  <script nonce="${nonce}" type="module" src="${mainJsUri}"></script>
</body>
</html>`;
  }
}

// ─── Diagnostics Provider ────────────────────────────────────────────────

class FdDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("fd");
  }

  public activate(context: vscode.ExtensionContext): void {
    // Validate on open
    if (vscode.window.activeTextEditor?.document.languageId === "fd") {
      this.validateDocument(vscode.window.activeTextEditor.document);
    }

    // Validate on change (debounced)
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (e.document.languageId === "fd") {
          this.scheduleValidation(e.document);
        }
      })
    );

    // Validate on open
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
        if (doc.languageId === "fd") {
          this.validateDocument(doc);
        }
      })
    );

    // Clear on close
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
        this.diagnosticCollection.delete(doc.uri);
      })
    );

    context.subscriptions.push(this.diagnosticCollection);
  }

  private scheduleValidation(document: vscode.TextDocument): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.validateDocument(document);
    }, 300);
  }

  private validateDocument(document: vscode.TextDocument): void {
    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    // Simple regex-based validation (works without WASM)
    // Check for common issues
    const lines = text.split("\n");
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments
      if (trimmed.startsWith("#")) continue;

      // Track brace depth
      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      // Unmatched closing brace
      if (braceDepth < 0) {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(i, 0, i, line.length),
            "Unexpected closing brace '}'",
            vscode.DiagnosticSeverity.Error
          )
        );
        braceDepth = 0;
      }

      // Check for invalid hex colors
      const hexMatch = trimmed.match(/#[0-9A-Fa-f]+\b/g);
      if (hexMatch) {
        for (const hex of hexMatch) {
          const len = hex.length - 1; // minus the #
          if (![3, 4, 6, 8].includes(len)) {
            const col = line.indexOf(hex);
            diagnostics.push(
              new vscode.Diagnostic(
                new vscode.Range(i, col, i, col + hex.length),
                `Invalid hex color '${hex}' — expected #RGB, #RGBA, #RRGGBB, or #RRGGBBAA`,
                vscode.DiagnosticSeverity.Error
              )
            );
          }
        }
      }
    }

    // Unclosed braces at end of file
    if (braceDepth > 0) {
      const lastLine = lines.length - 1;
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(lastLine, 0, lastLine, lines[lastLine].length),
          `${braceDepth} unclosed brace(s) — missing '}'`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }
}

// ─── Tree Preview Panel ──────────────────────────────────────────────────

class FdTreePreviewPanel {
  public static currentPanel: FdTreePreviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.context = context;

    this.update();

    // Update on text change
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(
      (e: vscode.TextDocumentChangeEvent) => {
        if (
          vscode.window.activeTextEditor &&
          e.document === vscode.window.activeTextEditor.document &&
          e.document.languageId === "fd"
        ) {
          this.update();
        }
      }
    );
    this.disposables.push(changeSubscription);

    const editorSubscription = vscode.window.onDidChangeActiveTextEditor(
      () => {
        this.update();
      }
    );
    this.disposables.push(editorSubscription);

    this.panel.onDidDispose(() => {
      FdTreePreviewPanel.currentPanel = undefined;
      for (const d of this.disposables) d.dispose();
    });
  }

  public static show(context: vscode.ExtensionContext): void {
    if (FdTreePreviewPanel.currentPanel) {
      FdTreePreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "fd.treePreview",
      "FD Tree Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    FdTreePreviewPanel.currentPanel = new FdTreePreviewPanel(panel, context);
  }

  private update(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "fd") return;

    const text = editor.document.getText();
    const treeHtml = this.buildTreeHtml(text);
    this.panel.webview.html = treeHtml;
  }

  private buildTreeHtml(source: string): string {
    // Parse the FD source into a simple tree representation
    const tree = this.parseToTree(source);
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 13px;
      color: var(--vscode-foreground, #CDD6F4);
      background: var(--vscode-editor-background, #1E1E2E);
      padding: 16px;
      line-height: 1.6;
    }
    h2 {
      font-size: 14px;
      color: var(--vscode-descriptionForeground, #A6ADC8);
      margin-bottom: 12px;
      font-weight: 500;
    }
    .tree { padding: 0; }
    .node {
      padding: 3px 0;
      margin-left: 16px;
      border-left: 1px solid var(--vscode-editorIndentGuide-background, #313244);
      padding-left: 12px;
    }
    .node-kind {
      color: var(--vscode-symbolIcon-classForeground, #89B4FA);
      font-weight: 600;
    }
    .node-id {
      color: var(--vscode-symbolIcon-variableForeground, #F9E2AF);
    }
    .node-text {
      color: var(--vscode-symbolIcon-stringForeground, #A6E3A1);
      font-style: italic;
    }
    .node-prop {
      color: var(--vscode-descriptionForeground, #6C7086);
      font-size: 11px;
    }
    .style-def {
      color: var(--vscode-symbolIcon-enumForeground, #CBA6F7);
      font-weight: 600;
    }
    .error {
      color: var(--vscode-errorForeground, #F38BA8);
      padding: 8px;
      border: 1px solid var(--vscode-errorForeground, #F38BA8);
      border-radius: 4px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h2>Scene Graph</h2>
  <div class="tree">${tree}</div>
</body>
</html>`;
  }

  private parseToTree(source: string): string {
    // Simple regex-based tree parser (works without WASM)
    const lines = source.split("\n");
    let html = "";
    const stack: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Style definition
      const styleMatch = trimmed.match(/^style\s+(\w+)\s*\{/);
      if (styleMatch) {
        html += `<div class="node"><span class="style-def">style</span> <span class="node-id">${escapeHtml(styleMatch[1])}</span></div>`;
        continue;
      }

      // Node declaration
      const nodeMatch = trimmed.match(
        /^(group|rect|ellipse|path|text)\s+(@\w+)(?:\s+"([^"]*)")?\s*\{?/
      );
      if (nodeMatch) {
        const kind = nodeMatch[1];
        const id = nodeMatch[2];
        const text = nodeMatch[3] || "";
        html += `<div class="node"><span class="node-kind">${escapeHtml(kind)}</span> <span class="node-id">${escapeHtml(id)}</span>`;
        if (text) {
          html += ` <span class="node-text">"${escapeHtml(text)}"</span>`;
        }
        html += "</div>";
        if (trimmed.endsWith("{")) stack.push(kind);
        continue;
      }

      // Constraint line
      const constraintMatch = trimmed.match(/^(@\w+)\s*->\s*(.+)/);
      if (constraintMatch) {
        html += `<div class="node"><span class="node-id">${escapeHtml(constraintMatch[1])}</span> → <span class="node-prop">${escapeHtml(constraintMatch[2])}</span></div>`;
        continue;
      }

      // Property
      const propMatch = trimmed.match(/^(\w+):\s*(.+)/);
      if (propMatch && !trimmed.endsWith("{")) {
        html += `<div class="node"><span class="node-prop">${escapeHtml(propMatch[1])}: ${escapeHtml(propMatch[2])}</span></div>`;
      }
    }

    return html || '<div class="node-prop">Empty document</div>';
  }
}

// ─── Spec View Panel ─────────────────────────────────────────────────────

class FdSpecViewPanel {
  public static currentPanel: FdSpecViewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.context = context;

    this.update();

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(
      (e: vscode.TextDocumentChangeEvent) => {
        if (
          vscode.window.activeTextEditor &&
          e.document === vscode.window.activeTextEditor.document &&
          e.document.languageId === "fd"
        ) {
          this.update();
        }
      }
    );
    this.disposables.push(changeSubscription);

    const editorSubscription = vscode.window.onDidChangeActiveTextEditor(
      () => {
        this.update();
      }
    );
    this.disposables.push(editorSubscription);

    this.panel.onDidDispose(() => {
      FdSpecViewPanel.currentPanel = undefined;
      for (const d of this.disposables) d.dispose();
    });
  }

  public static show(context: vscode.ExtensionContext): void {
    if (FdSpecViewPanel.currentPanel) {
      FdSpecViewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "fd.specView",
      "FD Spec View",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    FdSpecViewPanel.currentPanel = new FdSpecViewPanel(panel, context);
  }

  private update(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "fd") return;

    const text = editor.document.getText();
    this.panel.webview.html = this.buildSpecHtml(text);
  }

  private buildSpecHtml(source: string): string {
    const spec = this.parseSpec(source);
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 13px;
      color: var(--vscode-foreground, #CDD6F4);
      background: var(--vscode-editor-background, #1E1E2E);
      padding: 16px;
      line-height: 1.7;
    }
    h2 {
      font-size: 15px;
      color: var(--vscode-foreground, #CDD6F4);
      margin: 0 0 12px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    .spec-node {
      margin-bottom: 14px;
      padding: 10px 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      border-left: 3px solid var(--vscode-symbolIcon-classForeground, #89B4FA);
    }
    .spec-node.generic {
      border-left-color: var(--vscode-symbolIcon-enumForeground, #CBA6F7);
    }
    .spec-node .node-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .node-id {
      color: var(--vscode-symbolIcon-variableForeground, #F9E2AF);
      font-weight: 600;
      font-size: 14px;
    }
    .kind-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: rgba(137,180,250,0.15);
      color: var(--vscode-symbolIcon-classForeground, #89B4FA);
    }
    .kind-badge.spec {
      background: rgba(203,166,247,0.15);
      color: var(--vscode-symbolIcon-enumForeground, #CBA6F7);
    }
    .description {
      color: var(--vscode-foreground, #CDD6F4);
      font-style: italic;
      margin: 4px 0;
      padding-left: 2px;
    }
    .accept-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin: 3px 0;
      color: var(--vscode-descriptionForeground, #A6ADC8);
      font-size: 12px;
    }
    .accept-item::before {
      content: "☐";
      color: var(--vscode-symbolIcon-classForeground, #89B4FA);
      flex-shrink: 0;
    }
    .meta-row {
      display: flex;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .status-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }
    .status-draft { background: rgba(108,112,134,0.2); color: #6C7086; }
    .status-in_progress { background: rgba(249,226,175,0.15); color: #F9E2AF; }
    .status-done { background: rgba(166,227,161,0.15); color: #A6E3A1; }
    .priority-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
    }
    .priority-high { background: rgba(243,139,168,0.15); color: #F38BA8; }
    .priority-medium { background: rgba(249,226,175,0.15); color: #F9E2AF; }
    .priority-low { background: rgba(166,227,161,0.15); color: #A6E3A1; }
    .tag-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      background: rgba(137,180,250,0.1);
      color: var(--vscode-symbolIcon-classForeground, #89B4FA);
    }
    .children { margin-left: 16px; margin-top: 6px; }
    .edge-item {
      margin: 6px 0;
      padding: 8px 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      border-left: 3px solid var(--vscode-symbolIcon-stringForeground, #A6E3A1);
      font-size: 12px;
    }
    .edge-label { color: var(--vscode-descriptionForeground, #A6ADC8); font-style: italic; }
    .section-header {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground, #6C7086);
      margin: 16px 0 8px;
      font-weight: 600;
    }
    .empty-msg {
      color: var(--vscode-descriptionForeground, #6C7086);
      font-style: italic;
      padding: 20px 0;
      text-align: center;
    }
  </style>
</head>
<body>
  <h2>📋 Spec View</h2>
  ${spec}
</body>
</html>`;
  }

  private parseSpec(source: string): string {
    const lines = source.split("\n");
    let html = "";
    const nodeStack: { indent: number; hasAnnotations: boolean }[] = [];
    let pendingAnnotations: { type: string; value: string }[] = [];
    let currentNodeId = "";
    let currentNodeKind = "";
    let insideNode = false;
    let braceDepth = 0;

    // Collect edges
    const edges: { from: string; to: string; label: string; annotations: { type: string; value: string }[] }[] = [];
    let currentEdge: { from: string; to: string; label: string; annotations: { type: string; value: string }[] } | null = null;
    let insideEdge = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Track braces
      const openBraces = (trimmed.match(/\{/g) || []).length;
      const closeBraces = (trimmed.match(/\}/g) || []).length;

      // Comment (single #)
      if (trimmed.startsWith("#") && !trimmed.startsWith("##")) continue;

      // Annotation line
      if (trimmed.startsWith("##")) {
        const ann = this.parseAnnotation(trimmed);
        if (ann) {
          if (insideEdge && currentEdge) {
            currentEdge.annotations.push(ann);
          } else {
            pendingAnnotations.push(ann);
          }
        }
        continue;
      }

      // Edge block
      const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
      if (edgeMatch) {
        insideEdge = true;
        currentEdge = { from: "", to: "", label: "", annotations: [] };
        braceDepth += openBraces - closeBraces;
        continue;
      }

      if (insideEdge && currentEdge) {
        const fromMatch = trimmed.match(/^from:\s*@(\w+)/);
        const toMatch = trimmed.match(/^to:\s*@(\w+)/);
        const labelMatch = trimmed.match(/^label:\s*"([^"]*)"/);
        if (fromMatch) currentEdge.from = fromMatch[1];
        if (toMatch) currentEdge.to = toMatch[1];
        if (labelMatch) currentEdge.label = labelMatch[1];
        braceDepth += openBraces - closeBraces;
        if (trimmed === "}") {
          insideEdge = false;
          if (currentEdge.from && currentEdge.to) {
            edges.push(currentEdge);
          }
          currentEdge = null;
        }
        continue;
      }

      // Closing brace
      if (trimmed === "}") {
        braceDepth -= 1;
        if (insideNode && braceDepth <= (nodeStack.length > 0 ? nodeStack[nodeStack.length - 1].indent : 0)) {
          // Flush current node
          if (currentNodeId && pendingAnnotations.length > 0) {
            html += this.renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
          }
          pendingAnnotations = [];
          currentNodeId = "";
          insideNode = nodeStack.length > 0;
          nodeStack.pop();
          if (nodeStack.length > 0) {
            html += "</div>"; // close .children
          }
        }
        continue;
      }

      // Node declaration (typed)
      const nodeMatch = trimmed.match(
        /^(group|rect|ellipse|path|text)\s+@(\w+)(?:\s+"[^"]*")?\s*\{?/
      );
      if (nodeMatch) {
        // Flush previous node
        if (currentNodeId && pendingAnnotations.length > 0) {
          html += this.renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
          pendingAnnotations = [];
        }
        currentNodeKind = nodeMatch[1];
        currentNodeId = nodeMatch[2];
        insideNode = true;
        if (trimmed.endsWith("{")) {
          braceDepth += 1;
          nodeStack.push({ indent: braceDepth, hasAnnotations: false });
        }
        continue;
      }

      // Generic node (@id { )
      const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
      if (genericMatch) {
        if (currentNodeId && pendingAnnotations.length > 0) {
          html += this.renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
          pendingAnnotations = [];
        }
        currentNodeKind = "spec";
        currentNodeId = genericMatch[1];
        insideNode = true;
        braceDepth += 1;
        nodeStack.push({ indent: braceDepth, hasAnnotations: false });
        continue;
      }

      // Track braces for other lines
      braceDepth += openBraces - closeBraces;
    }

    // Flush last node
    if (currentNodeId && pendingAnnotations.length > 0) {
      html += this.renderSpecNode(currentNodeId, currentNodeKind, pendingAnnotations);
    }

    // Edges
    if (edges.length > 0) {
      html += '<div class="section-header">Flows</div>';
      for (const edge of edges) {
        html += `<div class="edge-item"><strong>@${escapeHtml(edge.from)}</strong> → <strong>@${escapeHtml(edge.to)}</strong>`;
        if (edge.label) {
          html += ` <span class="edge-label">— ${escapeHtml(edge.label)}</span>`;
        }
        html += "</div>";
        for (const ann of edge.annotations) {
          if (ann.type === "description") {
            html += `<div class="edge-item"><span class="description">${escapeHtml(ann.value)}</span></div>`;
          }
        }
      }
    }

    return html || '<div class="empty-msg">No annotations found in this document.</div>';
  }

  private parseAnnotation(line: string): { type: string; value: string } | null {
    const trimmed = line.replace(/^##\s*/, "");
    const acceptMatch = trimmed.match(/^accept:\s*"([^"]*)"/);
    if (acceptMatch) return { type: "accept", value: acceptMatch[1] };
    const statusMatch = trimmed.match(/^status:\s*(\S+)/);
    if (statusMatch) return { type: "status", value: statusMatch[1] };
    const priorityMatch = trimmed.match(/^priority:\s*(\S+)/);
    if (priorityMatch) return { type: "priority", value: priorityMatch[1] };
    const tagMatch = trimmed.match(/^tag:\s*(.+)/);
    if (tagMatch) return { type: "tag", value: tagMatch[1].trim() };
    const descMatch = trimmed.match(/^"([^"]*)"/);
    if (descMatch) return { type: "description", value: descMatch[1] };
    return null;
  }

  private renderSpecNode(
    id: string,
    kind: string,
    annotations: { type: string; value: string }[]
  ): string {
    const isGeneric = kind === "spec" || kind === "";
    let html = `<div class="spec-node${isGeneric ? " generic" : ""}">`;
    html += `<div class="node-header">`;
    html += `<span class="node-id">@${escapeHtml(id)}</span>`;
    html += `<span class="kind-badge${isGeneric ? " spec" : ""}">${escapeHtml(kind || "spec")}</span>`;
    html += `</div>`;

    const descriptions = annotations.filter((a) => a.type === "description");
    const accepts = annotations.filter((a) => a.type === "accept");
    const statuses = annotations.filter((a) => a.type === "status");
    const priorities = annotations.filter((a) => a.type === "priority");
    const tags = annotations.filter((a) => a.type === "tag");

    for (const d of descriptions) {
      html += `<div class="description">${escapeHtml(d.value)}</div>`;
    }

    for (const a of accepts) {
      html += `<div class="accept-item">${escapeHtml(a.value)}</div>`;
    }

    if (statuses.length > 0 || priorities.length > 0 || tags.length > 0) {
      html += '<div class="meta-row">';
      for (const s of statuses) {
        html += `<span class="status-badge status-${escapeHtml(s.value)}">${escapeHtml(s.value)}</span>`;
      }
      for (const p of priorities) {
        html += `<span class="priority-badge priority-${escapeHtml(p.value)}">${escapeHtml(p.value)}</span>`;
      }
      for (const t of tags) {
        for (const tag of t.value.split(",")) {
          html += `<span class="tag-badge">${escapeHtml(tag.trim())}</span>`;
        }
      }
      html += "</div>";
    }

    html += "</div>";
    return html;
  }
}

// ─── Spec Markdown Export ────────────────────────────────────────────────

function exportSpecMarkdown(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "fd") {
    vscode.window.showInformationMessage("Open a .fd file first to export spec.");
    return;
  }

  const source = editor.document.getText();
  const fileName = editor.document.fileName;
  const baseName = fileName.replace(/\.fd$/, "");
  const specPath = `${baseName}.spec.md`;

  const lines = source.split("\n");
  let md = `# Spec: ${fileName.split("/").pop()}\n\n`;
  let currentAnnotations: { type: string; value: string }[] = [];
  let currentNodeId = "";
  let currentNodeKind = "";
  let headingLevel = 2;
  const depthStack: number[] = [];
  let braceDepth = 0;
  let insideEdge = false;
  const edgeLines: string[] = [];
  let edgeFrom = "";
  let edgeTo = "";
  let edgeLabel = "";
  let edgeAnnotations: { type: string; value: string }[] = [];

  const parseAnn = (line: string): { type: string; value: string } | null => {
    const trimmed = line.replace(/^##\s*/, "");
    const acceptMatch = trimmed.match(/^accept:\s*"([^"]*)"/);
    if (acceptMatch) return { type: "accept", value: acceptMatch[1] };
    const statusMatch = trimmed.match(/^status:\s*(\S+)/);
    if (statusMatch) return { type: "status", value: statusMatch[1] };
    const priorityMatch = trimmed.match(/^priority:\s*(\S+)/);
    if (priorityMatch) return { type: "priority", value: priorityMatch[1] };
    const tagMatch = trimmed.match(/^tag:\s*(.+)/);
    if (tagMatch) return { type: "tag", value: tagMatch[1].trim() };
    const descMatch = trimmed.match(/^"([^"]*)"/);
    if (descMatch) return { type: "description", value: descMatch[1] };
    return null;
  };

  const flushNode = () => {
    if (!currentNodeId || currentAnnotations.length === 0) {
      currentAnnotations = [];
      currentNodeId = "";
      return;
    }
    const hashes = "#".repeat(Math.min(headingLevel, 6));
    md += `${hashes} @${currentNodeId} \`${currentNodeKind}\`\n\n`;
    for (const ann of currentAnnotations) {
      switch (ann.type) {
        case "description":
          md += `> ${ann.value}\n`;
          break;
        case "accept":
          md += `- [ ] ${ann.value}\n`;
          break;
        case "status":
          md += `- **Status:** ${ann.value}\n`;
          break;
        case "priority":
          md += `- **Priority:** ${ann.value}\n`;
          break;
        case "tag":
          md += `- **Tags:** ${ann.value}\n`;
          break;
      }
    }
    md += "\n";
    currentAnnotations = [];
    currentNodeId = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#") && !trimmed.startsWith("##")) continue;

    if (trimmed.startsWith("##")) {
      const ann = parseAnn(trimmed);
      if (ann) {
        if (insideEdge) {
          edgeAnnotations.push(ann);
        } else {
          currentAnnotations.push(ann);
        }
      }
      continue;
    }

    // Edge
    const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
    if (edgeMatch) {
      flushNode();
      insideEdge = true;
      edgeFrom = "";
      edgeTo = "";
      edgeLabel = "";
      edgeAnnotations = [];
      braceDepth += 1;
      continue;
    }

    if (insideEdge) {
      const fromMatch = trimmed.match(/^from:\s*@(\w+)/);
      const toMatch = trimmed.match(/^to:\s*@(\w+)/);
      const labelMatch = trimmed.match(/^label:\s*"([^"]*)"/);
      if (fromMatch) edgeFrom = fromMatch[1];
      if (toMatch) edgeTo = toMatch[1];
      if (labelMatch) edgeLabel = labelMatch[1];
      if (trimmed === "}") {
        insideEdge = false;
        braceDepth -= 1;
        let edgeMd = `- **@${edgeFrom}** → **@${edgeTo}**`;
        if (edgeLabel) edgeMd += ` — ${edgeLabel}`;
        edgeMd += "\n";
        for (const ann of edgeAnnotations) {
          if (ann.type === "description") edgeMd += `  > ${ann.value}\n`;
          if (ann.type === "accept") edgeMd += `  - [ ] ${ann.value}\n`;
        }
        edgeLines.push(edgeMd);
      }
      continue;
    }

    // Closing brace
    if (trimmed === "}") {
      flushNode();
      braceDepth -= 1;
      if (depthStack.length > 0) {
        depthStack.pop();
        headingLevel = 2 + depthStack.length;
      }
      continue;
    }

    // Node declaration
    const nodeMatch = trimmed.match(
      /^(group|rect|ellipse|path|text)\s+@(\w+)(?:\s+"[^"]*")?\s*\{?/
    );
    if (nodeMatch) {
      flushNode();
      currentNodeKind = nodeMatch[1];
      currentNodeId = nodeMatch[2];
      if (trimmed.endsWith("{")) {
        braceDepth += 1;
        depthStack.push(braceDepth);
        headingLevel = 2 + depthStack.length - 1;
      }
      continue;
    }

    // Generic node
    const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
    if (genericMatch) {
      flushNode();
      currentNodeKind = "spec";
      currentNodeId = genericMatch[1];
      braceDepth += 1;
      depthStack.push(braceDepth);
      headingLevel = 2 + depthStack.length - 1;
      continue;
    }
  }

  flushNode();

  // Append edges
  if (edgeLines.length > 0) {
    md += "---\n\n## Flows\n\n";
    for (const el of edgeLines) {
      md += el;
    }
    md += "\n";
  }

  // Write file
  const uri = vscode.Uri.file(specPath);
  const encoder = new TextEncoder();
  vscode.workspace.fs.writeFile(uri, encoder.encode(md)).then(() => {
    vscode.workspace.openTextDocument(uri).then((doc) => {
      vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    });
    vscode.window.showInformationMessage(`Spec exported to ${specPath.split("/").pop()}`);
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Utilities ───────────────────────────────────────────────────────────

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// ─── Extension Entry Points ──────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Register custom editor provider
  const editorProvider = new FdEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      FdEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // ─── Auto-open canvas alongside text editor for .fd files ────────
  const openedUris = new Set<string>();
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (doc: vscode.TextDocument) => {
      if (doc.languageId !== "fd") return;
      const key = doc.uri.toString();
      if (openedUris.has(key)) return;
      openedUris.add(key);

      // Small delay so the text editor settles first
      await new Promise((r) => setTimeout(r, 300));

      // Find a reusable editor group: prefer an existing non-active column
      // so we don't keep creating new Beside panels
      const activeColumn = vscode.window.activeTextEditor?.viewColumn;
      const visibleColumns = vscode.window.visibleTextEditors
        .map((e) => e.viewColumn)
        .filter((c): c is vscode.ViewColumn => c !== undefined);
      const otherColumn = visibleColumns.find((c) => c !== activeColumn);

      // Reuse the other group if it exists, otherwise open beside (creates one)
      const targetColumn = otherColumn ?? vscode.ViewColumn.Beside;

      await vscode.commands.executeCommand(
        "vscode.openWith",
        doc.uri,
        "fd.canvas",
        targetColumn
      );
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
      openedUris.delete(doc.uri.toString());
    })
  );

  // Register diagnostics
  const diagnostics = new FdDiagnosticsProvider();
  diagnostics.activate(context);

  // Register tree preview command
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.showPreview", () => {
      FdTreePreviewPanel.show(context);
    })
  );

  // Register spec view command
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.showSpecView", () => {
      FdSpecViewPanel.show(context);
    })
  );

  // Register spec export command
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.exportSpec", () => {
      exportSpecMarkdown();
    })
  );

  // Register open canvas command
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.openCanvas", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "fd") {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          editor.document.uri,
          "fd.canvas"
        );
      } else {
        vscode.window.showInformationMessage(
          "Open a .fd file first to use the canvas editor."
        );
      }
    })
  );

  // Register AI Refine command (selected nodes via cursor position)
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.aiRefine", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "fd") {
        vscode.window.showInformationMessage(
          "Open a .fd file first to use AI Refine."
        );
        return;
      }
      const line = editor.document.lineAt(editor.selection.active.line).text;
      const match = line.match(/@(\w+)/);
      const nodeIds = match ? [match[1]] : findAnonNodeIds(editor.document.getText());
      if (nodeIds.length === 0) {
        vscode.window.showInformationMessage("No nodes to refine.");
        return;
      }
      const result = await refineSelectedNodes(editor.document.getText(), nodeIds);
      if (result.error) {
        vscode.window.showWarningMessage(`AI Refine: ${result.error}`);
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        editor.document.uri,
        new vscode.Range(0, 0, editor.document.lineCount, 0),
        result.refinedText
      );
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(
        `AI Refine: ${nodeIds.length} node(s) refined.`
      );
    })
  );

  // Register AI Refine All command (all _anon_ nodes)
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.aiRefineAll", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "fd") {
        vscode.window.showInformationMessage(
          "Open a .fd file first to use AI Refine All."
        );
        return;
      }
      const nodeIds = findAnonNodeIds(editor.document.getText());
      if (nodeIds.length === 0) {
        vscode.window.showInformationMessage("No anonymous nodes to refine.");
        return;
      }
      const result = await refineSelectedNodes(editor.document.getText(), nodeIds);
      if (result.error) {
        vscode.window.showWarningMessage(`AI Refine: ${result.error}`);
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        editor.document.uri,
        new vscode.Range(0, 0, editor.document.lineCount, 0),
        result.refinedText
      );
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(
        `AI Refine All: ${nodeIds.length} node(s) refined.`
      );
    })
  );
}

export function deactivate() { }
