import * as vscode from "vscode";
import { refineSelectedNodes, findAnonNodeIds } from "./ai-refine";
import {
  parseAnnotation as fdParseAnnotation,
  computeSpecFoldRanges,
  escapeHtml,
  resolveTargetColumn,
  parseDocumentSymbols,
  findSymbolAtLine,
  transformSpecViewLine,
  FdSymbol,
} from "./fd-parse";

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
  /** The most recently focused canvas webview panel, for command routing. */
  public static activePanel: vscode.WebviewPanel | undefined;
  /** Current view mode of the active panel. */
  public static activeViewMode: "design" | "spec" = "design";
  /** Callback invoked when canvas webview changes view mode. */
  public static onViewModeChanged: ((mode: "design" | "spec") => void) | undefined;

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
    // Guard flag: suppress echo-back when we ourselves applied a canvas edit.
    // Without this, canvas→text sync triggers onDidChangeTextDocument which
    // echoes the text back to the webview, causing a full re-parse +
    // resolve_layout that resets all node positions.
    let suppressEchoBack = false;

    const changeDocumentSubscription =
      vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          if (suppressEchoBack) return;
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
          const incoming = message.text ?? "";
          // Skip if text is identical — avoids full document replacement that disrupts cursor
          if (incoming === document.getText()) break;
          suppressEchoBack = true;
          const lastLine = document.lineCount - 1;
          const lastLineRange = document.lineAt(lastLine).range;
          const fullRange = new vscode.Range(0, 0, lastLine, lastLineRange.end.character);

          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            fullRange,
            incoming
          );
          await vscode.workspace.applyEdit(edit);
          suppressEchoBack = false;
          break;
        }
        case "nodeSelected": {
          const nodeId = message.id;
          if (!nodeId) break;
          // Find the line containing @<nodeId> in the text editor
          const pattern = new RegExp(`@${nodeId}\\b`);
          for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (pattern.test(line.text)) {
              const editor = vscode.window.visibleTextEditors.find(
                (e) => e.document.uri.toString() === document.uri.toString()
              );
              if (editor) {
                const cursorLine = editor.selection.active.line;
                // Skip if cursor is already on this line (prevents jump on re-click)
                if (cursorLine === i) break;
                // Suppress cursor→canvas sync to prevent feedback loop
                suppressCursorSync = true;
                const pos = new vscode.Position(i, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(
                  line.range,
                  vscode.TextEditorRevealType.InCenterIfOutsideViewport
                );
                // Briefly highlight the node declaration line
                const decoration = vscode.window.createTextEditorDecorationType({
                  backgroundColor: new vscode.ThemeColor(
                    "editor.findMatchHighlightBackground"
                  ),
                  isWholeLine: true,
                });
                editor.setDecorations(decoration, [line.range]);
                setTimeout(() => decoration.dispose(), 1500);
              }
              setTimeout(() => {
                suppressCursorSync = false;
              }, 200);
              break;
            }
          }
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
        case "viewModeChanged": {
          const mode: "design" | "spec" = (message as { type: string; mode?: string }).mode === "spec" ? "spec" : "design";
          FdEditorProvider.activeViewMode = mode;
          FdEditorProvider.onViewModeChanged?.(mode);
          break;
        }
        case "exportPng": {
          const dataUrl = (message as { type: string; dataUrl?: string }).dataUrl;
          if (!dataUrl) break;
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
          const buffer = Buffer.from(base64, "base64");
          const defaultName = document.fileName.replace(/\.fd$/, ".png");
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { "PNG Image": ["png"] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, buffer);
            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
          }
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
          const cursorLine = e.selections[0].active.line;
          const lines = e.textEditor.document.getText().split("\n");
          const symbols = parseDocumentSymbols(lines);
          const sym = findSymbolAtLine(symbols, cursorLine);
          if (sym && sym.name.startsWith("@")) {
            webviewPanel.webview.postMessage({
              type: "selectNode",
              nodeId: sym.name.slice(1),
            });
          } else {
            // Cursor outside any node — deselect canvas
            webviewPanel.webview.postMessage({
              type: "selectNode",
              nodeId: "",
            });
          }
        }
      );

    // Track active panel for command routing
    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        FdEditorProvider.activePanel = webviewPanel;
      } else if (FdEditorProvider.activePanel === webviewPanel) {
        FdEditorProvider.activePanel = undefined;
      }
    });

    // Cleanup
    webviewPanel.onDidDispose(() => {
      if (FdEditorProvider.activePanel === webviewPanel) {
        FdEditorProvider.activePanel = undefined;
      }
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
      const action = result.needsSettings ? "Open Settings" : undefined;
      const chosen = await vscode.window.showWarningMessage(
        `AI Refine: ${result.error}`,
        ...(action ? [action] : [])
      );
      if (chosen === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "fd.ai");
      }
      webviewPanel.webview.postMessage({
        type: "aiRefineComplete",
        error: result.error,
      });
      return;
    }

    // Apply refined text to the document
    const lastLine = document.lineCount - 1;
    const lastLineRange = document.lineAt(lastLine).range;
    const fullRange = new vscode.Range(0, 0, lastLine, lastLineRange.end.character);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      fullRange,
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
    const wasmBinaryUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "webview",
        "wasm",
        "fd_wasm_bg.wasm"
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
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      z-index: 9;
    }
    .spec-badge-pin:hover {
      transform: scale(1.18);
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

    /* ── Export Button ── */
    #export-btn {
      font-size: 13px;
      min-width: 32px;
      justify-content: center;
    }

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
  </style>
</head>
<body>
  <div id="toolbar">
    <button class="tool-btn active" data-tool="select"><span class="tool-icon">▸</span>Select<span class="tool-key">V</span></button>
    <button class="tool-btn" data-tool="rect"><span class="tool-icon">▢</span>Rect<span class="tool-key">R</span></button>
    <button class="tool-btn" data-tool="ellipse"><span class="tool-icon">◯</span>Ellipse<span class="tool-key">O</span></button>
    <button class="tool-btn" data-tool="pen"><span class="tool-icon">✎</span>Pen<span class="tool-key">P</span></button>
    <button class="tool-btn" data-tool="arrow"><span class="tool-icon">→</span>Arrow<span class="tool-key">A</span></button>
    <button class="tool-btn" data-tool="text"><span class="tool-icon">T</span>Text<span class="tool-key">T</span></button>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="ai-refine-btn" title="AI Refine selected node (rename + restyle)">&#x2728; Refine</button>
    <button class="tool-btn" id="ai-refine-all-btn" title="AI Refine all anonymous nodes">&#x2728; All</button>
    <div class="tool-sep"></div>
    <div class="view-toggle" id="view-toggle">
      <button class="view-btn active" id="view-design" title="Design View — full canvas">Design</button>
      <button class="view-btn" id="view-spec" title="Spec View — requirements and structure">Spec</button>
    </div>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="grid-toggle-btn" title="Toggle grid overlay (G)">⊞</button>
    <button class="tool-btn" id="export-btn" title="Export canvas as PNG">📥</button>
    <div class="tool-sep"></div>
    <button class="tool-btn" id="sketchy-toggle-btn" title="Toggle sketchy hand-drawn mode">✏️</button>
    <button class="tool-btn" id="theme-toggle-btn" title="Toggle light/dark canvas theme">🌙</button>
    <button id="zoom-level" title="Zoom level (click to reset to 100%)">100%</button>
    <button class="tool-btn" id="tool-help-btn" title="Keyboard shortcuts">?</button>
    <span id="status">Loading WASM…</span>
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
    <div class="menu-item" id="ctx-add-annotation"><span class="menu-icon">◇</span><span class="menu-label">Add Annotation</span></div>
    <div class="menu-item" id="ctx-ai-refine"><span class="menu-icon">✦</span><span class="menu-label">AI Refine</span></div>
    <div class="menu-separator"></div>
    <div class="menu-item" id="ctx-duplicate" data-action="duplicate"><span class="menu-icon">⊕</span><span class="menu-label">Duplicate</span><span class="menu-shortcut">⌘D</span></div>
    <div class="menu-item" id="ctx-group" data-action="group"><span class="menu-icon">◫</span><span class="menu-label">Group</span><span class="menu-shortcut">⌘G</span></div>
    <div class="menu-item" id="ctx-ungroup" data-action="ungroup"><span class="menu-icon">◻</span><span class="menu-label">Ungroup</span><span class="menu-shortcut">⇧⌘G</span></div>
    <div class="menu-item" id="ctx-delete" data-action="delete"><span class="menu-icon">⊖</span><span class="menu-label">Delete</span><span class="menu-shortcut">⌫</span></div>
  </div>
  <div id="anim-picker">
    <div class="picker-header"><span class="picker-icon">⚡</span> Add Animation <button class="picker-close" id="anim-picker-close">×</button></div>
    <div class="picker-body" id="anim-picker-body"></div>
  </div>

  <script nonce="${nonce}">
    window.initialText = \`${initialText}\`;
    window.wasmBinaryUrl = "${wasmBinaryUri}";
    window.wasmJsUrl = "${wasmJsUri}";
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script nonce="${nonce}">
    // ─── AI Refine toolbar + context menu handlers ─────────
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

    const lines = text.split("\n");
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith("#")) continue;

      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

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

      const hexMatch = trimmed.match(/#[0-9A-Fa-f]+\b/g);
      if (hexMatch) {
        for (const hex of hexMatch) {
          const len = hex.length - 1;
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
      if (trimmed.startsWith("#")) continue;

      // Spec block (inline or block form)
      if (trimmed.startsWith("spec ") || trimmed.startsWith("spec{")) {
        const inlineMatch = trimmed.match(/^spec\s+"([^"]*)"/);
        if (inlineMatch) {
          const ann = { type: "description", value: inlineMatch[1] };
          if (insideEdge && currentEdge) {
            currentEdge.annotations.push(ann);
          } else {
            pendingAnnotations.push(ann);
          }
          continue;
        }
        if (trimmed.includes("{")) {
          let specDepth = (trimmed.match(/\{/g) || []).length;
          specDepth -= (trimmed.match(/\}/g) || []).length;
          const lineIdx = lines.indexOf(line);
          let j = lineIdx + 1;
          while (j < lines.length && specDepth > 0) {
            const specLine = lines[j].trim();
            specDepth += (specLine.match(/\{/g) || []).length;
            specDepth -= (specLine.match(/\}/g) || []).length;
            if (specLine !== "}" && specLine.length > 0 && specDepth >= 0) {
              const ann = this.parseAnnotation(specLine);
              if (ann) {
                if (insideEdge && currentEdge) {
                  currentEdge.annotations.push(ann);
                } else {
                  pendingAnnotations.push(ann);
                }
              }
            }
            j++;
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
    return fdParseAnnotation(line);
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
    const trimmed = line.trim();
    if (!trimmed || trimmed === "}") return null;
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
    if (trimmed.startsWith("#")) continue;

    // Spec block
    if (trimmed.startsWith("spec ") || trimmed.startsWith("spec{")) {
      const inlineMatch = trimmed.match(/^spec\s+"([^"]*)"/);
      if (inlineMatch) {
        const ann = { type: "description", value: inlineMatch[1] };
        if (insideEdge) {
          edgeAnnotations.push(ann);
        } else {
          currentAnnotations.push(ann);
        }
        continue;
      }
      if (trimmed.includes("{")) {
        let specDepth = (trimmed.match(/\{/g) || []).length;
        specDepth -= (trimmed.match(/\}/g) || []).length;
        const lineIdx = lines.indexOf(line);
        let j = lineIdx + 1;
        while (j < lines.length && specDepth > 0) {
          const specLine = lines[j].trim();
          specDepth += (specLine.match(/\{/g) || []).length;
          specDepth -= (specLine.match(/\}/g) || []).length;
          if (specLine !== "}" && specLine.length > 0 && specDepth >= 0) {
            const ann = parseAnn(specLine);
            if (ann) {
              if (insideEdge) {
                edgeAnnotations.push(ann);
              } else {
                currentAnnotations.push(ann);
              }
            }
          }
          j++;
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

// escapeHtml is imported from fd-parse.ts

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

// ─── Document Symbol Provider (Outline View) ───────────────────────────────────────

class FdDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }
    const fdSymbols = parseDocumentSymbols(lines);
    return fdSymbols.map((s) => this.toDocumentSymbol(s, document));
  }

  private toDocumentSymbol(
    sym: FdSymbol,
    doc: vscode.TextDocument
  ): vscode.DocumentSymbol {
    const kindMap: Record<string, vscode.SymbolKind> = {
      group: vscode.SymbolKind.Module,
      rect: vscode.SymbolKind.Struct,
      ellipse: vscode.SymbolKind.Struct,
      path: vscode.SymbolKind.Struct,
      text: vscode.SymbolKind.String,
      style: vscode.SymbolKind.Class,
      edge: vscode.SymbolKind.Interface,
      spec: vscode.SymbolKind.Object,
      constraint: vscode.SymbolKind.Property,
    };

    const range = new vscode.Range(sym.startLine, 0, sym.endLine, doc.lineAt(sym.endLine).text.length);
    const selRange = new vscode.Range(sym.startLine, 0, sym.startLine, doc.lineAt(sym.startLine).text.length);
    const detail = sym.text ? `"${sym.text}"` : sym.kind;
    const dsym = new vscode.DocumentSymbol(
      sym.name,
      detail,
      kindMap[sym.kind] ?? vscode.SymbolKind.Variable,
      range,
      selRange
    );
    dsym.children = sym.children.map((c) => this.toDocumentSymbol(c, doc));
    return dsym;
  }
}

// ─── Extension Entry Points ────────────────────────────────────────────────────

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

  // ─── Track opened .fd documents ──────────────────────────────────────
  const openedUris = new Set<string>();
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
      openedUris.delete(doc.uri.toString());
    })
  );

  // ─── Canvas reveal/open on .fd tab activation ──────────────────────
  // Single handler: whenever a text editor for an .fd file becomes active,
  // ensure its Canvas Mode is visible in the OTHER column (without focus).
  //
  // Handles all scenarios:
  //  1. No canvas → open one in the other column
  //  2. Canvas in a different column → reveal it (bring to front)
  //  3. Canvas in the SAME column as text → move it to the other column
  let revealDebounce: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      clearTimeout(revealDebounce);
      if (!editor || editor.document.languageId !== "fd") return;
      const key = editor.document.uri.toString();
      openedUris.add(key);

      revealDebounce = setTimeout(async () => {
        const editorColumn = editor.viewColumn;

        // Helper: check if a tab is the canvas for this URI
        const isCanvasForUri = (tab: vscode.Tab): boolean => {
          const input = tab.input;
          return (
            input != null &&
            typeof input === "object" &&
            "viewType" in input &&
            (input as { viewType: string }).viewType === "fd.canvas" &&
            "uri" in input &&
            (input as { uri: vscode.Uri }).uri.toString() === key
          );
        };

        // Find existing canvas tab
        let canvasTab: vscode.Tab | undefined;
        let canvasGroup: vscode.TabGroup | undefined;
        for (const group of vscode.window.tabGroups.all) {
          const found = group.tabs.find(isCanvasForUri);
          if (found) {
            canvasTab = found;
            canvasGroup = group;
            break;
          }
        }

        // Determine the correct target column for canvas (opposite of text editor)
        const allGroupColumns = vscode.window.tabGroups.all.map(
          (g) => g.viewColumn
        );
        const resolved = resolveTargetColumn(editorColumn, allGroupColumns);
        const targetColumn =
          resolved === "beside" ? vscode.ViewColumn.Beside : resolved;

        let didOpen = false;
        if (canvasTab && canvasGroup) {
          if (canvasGroup.viewColumn === editorColumn) {
            // Canvas is in the SAME column as text editor — move it
            await vscode.commands.executeCommand(
              "vscode.openWith",
              editor.document.uri,
              "fd.canvas",
              { viewColumn: targetColumn, preserveFocus: true }
            );
            didOpen = true;
          } else if (!canvasTab.isActive) {
            // Canvas is in a different column but hidden behind another tab
            await vscode.commands.executeCommand(
              "vscode.openWith",
              editor.document.uri,
              "fd.canvas",
              { viewColumn: canvasGroup.viewColumn, preserveFocus: true }
            );
            didOpen = true;
          }
          // else: canvas is already active in the other column — nothing to do
        } else {
          // No canvas exists — open one in the other column
          await vscode.commands.executeCommand(
            "vscode.openWith",
            editor.document.uri,
            "fd.canvas",
            { viewColumn: targetColumn, preserveFocus: true }
          );
          didOpen = true;
        }

        // Refocus Code Mode — canvas webviews can steal focus despite preserveFocus
        if (didOpen) {
          await new Promise((r) => setTimeout(r, 120));
          const textEditor = vscode.window.visibleTextEditors.find(
            (e) => e.document.uri.toString() === key
          );
          if (textEditor) {
            await vscode.window.showTextDocument(
              textEditor.document,
              textEditor.viewColumn,
              false
            );
          }
        }
      }, 200);
    })
  );

  // Register diagnostics
  const diagnostics = new FdDiagnosticsProvider();
  diagnostics.activate(context);

  // Register document symbol provider (Outline view)
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      "fd",
      new FdDocumentSymbolProvider()
    )
  );

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

  // ─── Code-mode Spec View (editor decorations) ────────────────────
  // When spec mode is active, hide style/animation/layout details from
  // the text editor, showing only #, spec blocks, node/edge declarations, and braces.
  let codeSpecMode: "design" | "spec" = "design";

  // Wire up canvas → code-mode spec sync
  FdEditorProvider.onViewModeChanged = (mode) => {
    codeSpecMode = mode;
    applyCodeSpecView();
  };

  // ─── FoldingRangeProvider for Spec View ─────────────────────────────
  // When spec mode is active, provide fold ranges for style/anim/property
  // blocks so they collapse to zero height (no gaps).

  const foldChangeEmitter = new vscode.EventEmitter<void>();
  context.subscriptions.push(foldChangeEmitter);

  const foldingProvider: vscode.FoldingRangeProvider = {
    onDidChangeFoldingRanges: foldChangeEmitter.event,
    provideFoldingRanges(
      document: vscode.TextDocument
    ): vscode.FoldingRange[] {
      if (codeSpecMode !== "spec") return [];
      const lines: string[] = [];
      for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
      }
      return computeSpecFoldRanges(lines).map(
        (r) => new vscode.FoldingRange(r.start, r.end, vscode.FoldingRangeKind.Region)
      );
    },
  };

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider("fd", foldingProvider)
  );

  // Decoration type that visually collapses type keywords (group, rect, etc.)
  // in Spec View without modifying the document text.
  const specKeywordHideDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: "none; font-size: 0",
    letterSpacing: "-100em",
    color: "transparent",
  });
  context.subscriptions.push(specKeywordHideDecoration);

  /** Fold or unfold all spec regions in visible FD editors. */
  async function applyCodeSpecView() {
    // Notify VS Code that fold ranges changed
    foldChangeEmitter.fire();

    // Small delay so VS Code processes the new fold ranges first
    await new Promise((r) => setTimeout(r, 100));

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId !== "fd") continue;
      // Focus the editor temporarily to apply fold/unfold commands
      await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
      if (codeSpecMode === "spec") {
        await vscode.commands.executeCommand("editor.foldAll");
        applySpecKeywordDecorations(editor);
      } else {
        await vscode.commands.executeCommand("editor.unfoldAll");
        editor.setDecorations(specKeywordHideDecoration, []);
      }
    }
  }

  /** Apply decorations to hide type keywords from node declarations. */
  function applySpecKeywordDecorations(editor: vscode.TextEditor): void {
    const typeKeywordRe = /^(\s*)(group|frame|rect|ellipse|path|text)(\s+)(?=@\w+)/;
    const ranges: vscode.DecorationOptions[] = [];
    for (let i = 0; i < editor.document.lineCount; i++) {
      const lineText = editor.document.lineAt(i).text;
      const match = lineText.match(typeKeywordRe);
      if (match) {
        // Hide the type keyword + trailing space (e.g. "group " from "group @foo {")
        const startCol = match[1].length; // after leading whitespace
        const endCol = startCol + match[2].length + match[3].length;
        ranges.push({
          range: new vscode.Range(i, startCol, i, endCol),
        });
      }
    }
    editor.setDecorations(specKeywordHideDecoration, ranges);
  }

  // Re-fold when text changes in spec mode
  let foldDebounce: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (codeSpecMode !== "spec") return;
      if (e.document.languageId !== "fd") return;
      clearTimeout(foldDebounce);
      foldDebounce = setTimeout(() => applyCodeSpecView(), 300);
    })
  );

  // Re-fold when visible editors change
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      if (codeSpecMode !== "spec") return;
      applyCodeSpecView();
    })
  );

  // Register view mode toggle command (Design ↔ Spec)
  context.subscriptions.push(
    vscode.commands.registerCommand("fd.toggleViewMode", () => {
      const next: "design" | "spec" = FdEditorProvider.activeViewMode === "design" ? "spec" : "design";
      FdEditorProvider.activeViewMode = next;
      codeSpecMode = next;

      // Send to canvas webview if active
      const panel = FdEditorProvider.activePanel;
      if (panel) {
        panel.webview.postMessage({ type: "setViewMode", mode: next });
      }

      // Apply/remove code-mode folding
      applyCodeSpecView();

      const labels: Record<string, string> = { design: "Design", spec: "Spec" };
      vscode.window.showInformationMessage(
        `FD View: ${labels[next]} Mode`
      );
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
        const action = result.needsSettings ? "Open Settings" : undefined;
        const chosen = await vscode.window.showWarningMessage(
          `AI Refine: ${result.error}`,
          ...(action ? [action] : [])
        );
        if (chosen === "Open Settings") {
          vscode.commands.executeCommand("workbench.action.openSettings", "fd.ai");
        }
        return;
      }
      const lastLine = editor.document.lineCount - 1;
      const lastLineRange = editor.document.lineAt(lastLine).range;
      const fullRange = new vscode.Range(0, 0, lastLine, lastLineRange.end.character);

      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        editor.document.uri,
        fullRange,
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
        const action = result.needsSettings ? "Open Settings" : undefined;
        const chosen = await vscode.window.showWarningMessage(
          `AI Refine: ${result.error}`,
          ...(action ? [action] : [])
        );
        if (chosen === "Open Settings") {
          vscode.commands.executeCommand("workbench.action.openSettings", "fd.ai");
        }
        return;
      }
      const lastLine = editor.document.lineCount - 1;
      const lastLineRange = editor.document.lineAt(lastLine).range;
      const fullRange = new vscode.Range(0, 0, lastLine, lastLineRange.end.character);

      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        editor.document.uri,
        fullRange,
        result.refinedText
      );
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(
        `AI Refine All: ${nodeIds.length} node(s) refined.`
      );
    })
  );
  // ─── Format Document Provider (Option+Shift+F) ──────────────────────
  // Spawns `fd-lsp --format` as a one-shot formatter: reads FD text from
  // stdin and writes the canonical formatted output to stdout.
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("fd", {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument
      ): vscode.TextEdit[] {
        const { spawnSync } = require("child_process") as typeof import("child_process");
        const path = require("path") as typeof import("path");

        // Resolve the bundled fd-lsp binary path
        const binName = process.platform === "win32" ? "fd-lsp.exe" : "fd-lsp";
        const binPath = path.join(context.extensionPath, "bin", binName);

        const result = spawnSync(binPath, ["--format"], {
          input: document.getText(),
          encoding: "utf8",
          timeout: 5000,
        });

        if (result.error || result.status !== 0) {
          // Don't mutate the document on failure — silently return no edits
          return [];
        }

        const formatted: string = result.stdout as string;
        if (!formatted || formatted === document.getText()) {
          return [];
        }

        // Replace the entire document with the formatted text
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        return [vscode.TextEdit.replace(fullRange, formatted)];
      },
    })
  );
}

export function deactivate() { }
