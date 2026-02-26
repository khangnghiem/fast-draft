import * as vscode from "vscode";
import { escapeHtml } from "../fd-parse";

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class FdTreePreviewPanel {
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
