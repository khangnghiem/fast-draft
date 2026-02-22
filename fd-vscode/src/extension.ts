import * as vscode from "vscode";

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
    webviewPanel.webview.onDidReceiveMessage((message: { type: string; text?: string; id?: string }) => {
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
    }
    #toolbar {
      display: flex;
      gap: 4px;
      padding: 6px 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground, #181825);
      border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, #313244);
      flex-shrink: 0;
    }
    .tool-btn {
      padding: 4px 10px;
      border: 1px solid var(--vscode-button-border, #45475a);
      background: var(--vscode-button-secondaryBackground, #313244);
      color: var(--vscode-button-secondaryForeground, #CDD6F4);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    }
    .tool-btn.active {
      background: var(--vscode-button-background, #89B4FA);
      color: var(--vscode-button-foreground, #1E1E2E);
      border-color: var(--vscode-button-background, #89B4FA);
    }
    .tool-btn:hover {
      opacity: 0.85;
    }
    #status {
      margin-left: auto;
      color: var(--vscode-descriptionForeground, #6C7086);
      font-size: 11px;
      align-self: center;
    }
    #canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    #loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--vscode-descriptionForeground, #6C7086);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 14px;
    }
    /* Annotation card overlay */
    #annotation-card {
      display: none;
      position: absolute;
      z-index: 100;
      width: 280px;
      background: var(--vscode-editorWidget-background, #1E1E2E);
      border: 1px solid var(--vscode-editorWidget-border, #45475a);
      border-radius: 8px;
      padding: 12px;
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 12px;
      color: var(--vscode-foreground, #CDD6F4);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
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
    #annotation-card .field-group {
      margin-bottom: 8px;
    }
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
      border: 1px solid var(--vscode-input-border, #45475a);
      border-radius: 4px;
      background: var(--vscode-input-background, #313244);
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
    #annotation-card .accept-item input[type="checkbox"] {
      flex-shrink: 0;
    }
    #annotation-card .accept-item input[type="text"] {
      flex: 1;
    }
    #annotation-card .add-btn {
      cursor: pointer;
      font-size: 11px;
      color: var(--vscode-textLink-foreground, #89B4FA);
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
    #annotation-card .tag-input {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    #annotation-card .tag-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      background: var(--vscode-badge-background, #45475a);
      color: var(--vscode-badge-foreground, #CDD6F4);
    }
    /* Context menu */
    #context-menu {
      display: none;
      position: absolute;
      z-index: 200;
      background: var(--vscode-menu-background, #1E1E2E);
      border: 1px solid var(--vscode-menu-border, #45475a);
      border-radius: 6px;
      padding: 4px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 12px;
      min-width: 160px;
    }
    #context-menu.visible { display: block; }
    #context-menu .menu-item {
      padding: 6px 14px;
      cursor: pointer;
      color: var(--vscode-menu-foreground, #CDD6F4);
    }
    #context-menu .menu-item:hover {
      background: var(--vscode-menu-selectionBackground, #45475a);
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button class="tool-btn active" data-tool="select">▸ Select</button>
    <button class="tool-btn" data-tool="rect">▢ Rect</button>
    <span id="status">Loading WASM…</span>
  </div>
  <div id="canvas-container">
    <canvas id="fd-canvas"></canvas>
    <div id="loading">Loading FD engine…</div>
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
  </div>

  <script nonce="${nonce}">
    window.initialText = \`${initialText}\`;
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
      await vscode.commands.executeCommand(
        "vscode.openWith",
        doc.uri,
        "fd.canvas",
        vscode.ViewColumn.Beside
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
}

export function deactivate() { }
