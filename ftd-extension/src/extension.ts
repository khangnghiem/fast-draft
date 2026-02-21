import * as vscode from "vscode";

/**
 * FTD Custom Editor Provider.
 *
 * Creates a side-by-side experience: VS Code's built-in text editor +
 * a WASM-powered canvas webview that renders the .ftd scene graph.
 *
 * TypeScript is ONLY glue — all rendering and parsing happens in Rust/WASM.
 */
class FtdEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "ftd.canvas";

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

    // Cleanup
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
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
        "ftd_wasm.js"
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
    script-src 'nonce-${nonce}' ${webview.cspSource};
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
  </style>
</head>
<body>
  <div id="toolbar">
    <button class="tool-btn active" data-tool="select">▸ Select</button>
    <button class="tool-btn" data-tool="rect">▢ Rect</button>
    <span id="status">Loading WASM…</span>
  </div>
  <div id="canvas-container">
    <canvas id="ftd-canvas"></canvas>
    <div id="loading">Loading FTD engine…</div>
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

class FtdDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("ftd");
  }

  public activate(context: vscode.ExtensionContext): void {
    // Validate on open
    if (vscode.window.activeTextEditor?.document.languageId === "ftd") {
      this.validateDocument(vscode.window.activeTextEditor.document);
    }

    // Validate on change (debounced)
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (e.document.languageId === "ftd") {
          this.scheduleValidation(e.document);
        }
      })
    );

    // Validate on open
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
        if (doc.languageId === "ftd") {
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

class FtdTreePreviewPanel {
  public static currentPanel: FtdTreePreviewPanel | undefined;
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
          e.document.languageId === "ftd"
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
      FtdTreePreviewPanel.currentPanel = undefined;
      for (const d of this.disposables) d.dispose();
    });
  }

  public static show(context: vscode.ExtensionContext): void {
    if (FtdTreePreviewPanel.currentPanel) {
      FtdTreePreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "ftd.treePreview",
      "FTD Tree Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    FtdTreePreviewPanel.currentPanel = new FtdTreePreviewPanel(panel, context);
  }

  private update(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "ftd") return;

    const text = editor.document.getText();
    const treeHtml = this.buildTreeHtml(text);
    this.panel.webview.html = treeHtml;
  }

  private buildTreeHtml(source: string): string {
    // Parse the FTD source into a simple tree representation
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
  const editorProvider = new FtdEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      FtdEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Register diagnostics
  const diagnostics = new FtdDiagnosticsProvider();
  diagnostics.activate(context);

  // Register tree preview command
  context.subscriptions.push(
    vscode.commands.registerCommand("ftd.showPreview", () => {
      FtdTreePreviewPanel.show(context);
    })
  );

  // Register open canvas command
  context.subscriptions.push(
    vscode.commands.registerCommand("ftd.openCanvas", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "ftd") {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          editor.document.uri,
          "ftd.canvas"
        );
      } else {
        vscode.window.showInformationMessage(
          "Open a .ftd file first to use the canvas editor."
        );
      }
    })
  );
}

export function deactivate() { }
