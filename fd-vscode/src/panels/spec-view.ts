import * as vscode from "vscode";
import { parseAnnotation, escapeHtml } from "../fd-parse";
import { getNonce } from "../webview-html";

export class FdSpecViewPanel {
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
    .status-todo { background: rgba(108,112,134,0.2); color: #6C7086; }
    .status-draft { background: rgba(108,112,134,0.2); color: #6C7086; }
    .status-doing { background: rgba(249,226,175,0.15); color: #F9E2AF; }
    .status-in_progress { background: rgba(249,226,175,0.15); color: #F9E2AF; }
    .status-done { background: rgba(166,227,161,0.15); color: #A6E3A1; }
    .status-blocked { background: rgba(243,139,168,0.15); color: #F38BA8; }
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
    return parseAnnotation(line);
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
