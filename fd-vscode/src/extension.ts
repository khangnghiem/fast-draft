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
import { FdDiagnosticsProvider } from "./diagnostics";
import { FdTreePreviewPanel } from "./panels/tree-preview";
import { FdSpecViewPanel } from "./panels/spec-view";
import { FdDocumentSymbolProvider } from "./document-symbol";
import { HTML_TEMPLATE, VIEW_TYPE_CANVAS, COMMAND_AI_REFINE, COMMAND_AI_REFINE_ALL, COMMAND_EXPORT_SPEC, COMMAND_OPEN_CANVAS, COMMAND_SHOW_PREVIEW, COMMAND_SHOW_SPEC_VIEW, COMMAND_TOGGLE_VIEW_MODE } from "./webview-html";

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * FD Custom Editor Provider.
 *
 * Creates a side-by-side experience: VS Code's built-in text editor +
 * a WASM-powered canvas webview that renders the .fd scene graph.
 *
 * TypeScript is ONLY glue — all rendering and parsing happens in Rust/WASM.
 */
class FdEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = VIEW_TYPE_CANVAS;
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
                // Only move cursor if not already on this line
                if (cursorLine !== i) {
                  suppressCursorSync = true;
                  const pos = new vscode.Position(i, 0);
                  editor.selection = new vscode.Selection(pos, pos);
                  editor.revealRange(
                    line.range,
                    vscode.TextEditorRevealType.InCenterIfOutsideViewport
                  );
                }
                // Always highlight the node declaration line
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
        case "exportSvg": {
          const svgStr = (message as { type: string; svgStr?: string }).svgStr;
          if (!svgStr) break;
          const buffer = Buffer.from(svgStr, "utf8");
          const defaultName = document.fileName.replace(/\.fd$/, ".svg");
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { "SVG Image": ["svg"] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, buffer);
            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
          }
          break;
        }
        case "requestLibraries": {
          const libraries = await scanLibraryFiles();
          webviewPanel.webview.postMessage({
            type: "libraryData",
            libraries,
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

  // ─── AI Assist Handler ─────────────────────────────────────────────

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
        `AI Assist: ${result.error}`,
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
      `AI Assist: ${nodeIds.length} node(s) refined.`
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
    const initialText = JSON.stringify(document.getText())
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e");

    return HTML_TEMPLATE
      .replace(/{nonce}/g, nonce)
      .replace(/{cspSource}/g, webview.cspSource)
      .replace(/{initialText}/g, initialText)
      .replace(/{wasmBinaryUri}/g, wasmBinaryUri.toString())
      .replace(/{wasmJsUri}/g, wasmJsUri.toString())
      .replace(/{mainJsUri}/g, mainJsUri.toString());
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

// ─── Library Scanning ────────────────────────────────────────────────────────

interface LibraryComponent {
  name: string;
  kind: string;
  code: string;
}

interface LibraryFile {
  name: string;
  path: string;
  components: LibraryComponent[];
}

/**
 * Scan workspace `libraries/` directories for .fd files.
 * Parse each file to extract reusable components (themes, groups, nodes).
 */
async function scanLibraryFiles(): Promise<LibraryFile[]> {
  const results: LibraryFile[] = [];
  const files = await vscode.workspace.findFiles("**/libraries/**/*.fd", null, 50);

  for (const fileUri of files) {
    try {
      const content = await vscode.workspace.fs.readFile(fileUri);
      const text = new TextDecoder().decode(content);
      const components = parseLibraryComponents(text);
      // Extract library name from header comment or filename
      const nameMatch = text.match(/^#\s*@library\s+"([^"]+)"/m);
      const fileName = fileUri.path.split("/").pop()?.replace(/\.fd$/, "") ?? "Unknown";
      const libName = nameMatch ? nameMatch[1] : fileName;

      if (components.length > 0) {
        results.push({ name: libName, path: fileUri.fsPath, components });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/**
 * Parse a library .fd file to extract component definitions.
 * Extracts themes and top-level nodes (group, rect, ellipse, etc.) with their full code.
 */
function parseLibraryComponents(text: string): LibraryComponent[] {
  const components: LibraryComponent[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Skip comments, empty lines, imports
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("import ")) {
      i++;
      continue;
    }

    // Theme definition: theme name { ... }
    const themeMatch = trimmed.match(/^theme\s+(\w+)\s*\{/);
    if (themeMatch) {
      const startLine = i;
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        depth += (lines[i].match(/\{/g) || []).length;
        depth -= (lines[i].match(/\}/g) || []).length;
        i++;
      }
      const code = lines.slice(startLine, i).join("\n");
      components.push({ name: themeMatch[1], kind: "theme", code });
      continue;
    }

    // Node definition: (group|rect|ellipse|path|text|frame) @id ... { }
    const nodeMatch = trimmed.match(/^(group|rect|ellipse|path|text|frame)\s+@(\w+)/);
    if (nodeMatch) {
      const startLine = i;
      if (trimmed.includes("{")) {
        let depth = (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
        i++;
        while (i < lines.length && depth > 0) {
          depth += (lines[i].match(/\{/g) || []).length;
          depth -= (lines[i].match(/\}/g) || []).length;
          i++;
        }
      } else {
        i++;
      }
      const code = lines.slice(startLine, i).join("\n");
      components.push({ name: nodeMatch[2], kind: nodeMatch[1], code });
      continue;
    }

    i++;
  }

  return components;
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

  // ─── Auto-open welcome.fd on first activation ───────────────────────
  const welcomed = context.globalState.get<boolean>("fd.welcomed", false);
  if (!welcomed) {
    context.globalState.update("fd.welcomed", true);
    // Find welcome.fd in workspace examples folder
    vscode.workspace.findFiles("**/examples/welcome.fd", null, 1).then(files => {
      if (files.length > 0) {
        vscode.commands.executeCommand(
          "vscode.openWith",
          files[0],
          FdEditorProvider.viewType
        );
      }
    });
  }

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
            (input as { viewType: string }).viewType === VIEW_TYPE_CANVAS &&
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
              VIEW_TYPE_CANVAS,
              { viewColumn: targetColumn, preserveFocus: true }
            );
            didOpen = true;
          } else if (!canvasTab.isActive) {
            // Canvas is in a different column but hidden behind another tab
            await vscode.commands.executeCommand(
              "vscode.openWith",
              editor.document.uri,
              VIEW_TYPE_CANVAS,
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
            VIEW_TYPE_CANVAS,
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
    vscode.commands.registerCommand(COMMAND_SHOW_PREVIEW, () => {
      FdTreePreviewPanel.show(context);
    })
  );

  // Register spec view command
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_SHOW_SPEC_VIEW, () => {
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
    vscode.commands.registerCommand(COMMAND_TOGGLE_VIEW_MODE, () => {
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
    vscode.commands.registerCommand(COMMAND_EXPORT_SPEC, () => {
      exportSpecMarkdown();
    })
  );

  // Register open canvas command
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_CANVAS, async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "fd") {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          editor.document.uri,
          VIEW_TYPE_CANVAS
        );
      } else {
        vscode.window.showInformationMessage(
          "Open a .fd file first to use the canvas editor."
        );
      }
    })
  );

  // Register AI Assist command (selected nodes via cursor position)
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_AI_REFINE, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "fd") {
        vscode.window.showInformationMessage(
          "Open a .fd file first to use AI Assist."
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
          `AI Assist: ${result.error}`,
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
        `AI Assist: ${nodeIds.length} node(s) refined.`
      );
    })
  );

  // Register AI Assist All command (all _anon_ nodes)
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_AI_REFINE_ALL, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "fd") {
        vscode.window.showInformationMessage(
          "Open a .fd file first to use AI Assist All."
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
          `AI Assist: ${result.error}`,
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
        `AI Assist All: ${nodeIds.length} node(s) refined.`
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
