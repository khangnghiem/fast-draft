import * as vscode from "vscode";

export function exportSpecMarkdown(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "fd") {
    vscode.window.showInformationMessage("Open a .fd file first to export spec.");
    return;
  }

  const source = editor.document.getText();
  const fileName = editor.document.fileName;
  const baseName = fileName.replace(/\.fd$/, "");
  const specPath = `${baseName}.spec.md`;

  const md = buildSpecMarkdown(source, fileName);
  writeSpecFile(specPath, md);
}

function writeSpecFile(specPath: string, md: string): void {
  const uri = vscode.Uri.file(specPath);
  const encoder = new TextEncoder();
  vscode.workspace.fs.writeFile(uri, encoder.encode(md)).then(() => {
    vscode.workspace.openTextDocument(uri).then((doc) => {
      vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    });
    vscode.window.showInformationMessage(`Spec exported to ${specPath.split("/").pop()}`);
  });
}

interface Annotation {
  type: string;
  value: string;
}

export function buildSpecMarkdown(source: string, fileName: string): string {
  const lines = source.split("\n");
  let md = `# Spec: ${fileName.split("/").pop()}\n\n`;
  const state = createParserState();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (processSpecBlock(lines, i, state)) continue;

    if (processEdgeStart(trimmed, state)) {
      md += flushNode(state);
      continue;
    }

    if (processEdgeBody(trimmed, state)) continue;

    if (processClosingBrace(trimmed, state)) {
      md += flushNode(state);
      continue;
    }

    if (processNodeDecl(trimmed, state, (s) => md += flushNode(s))) continue;
    if (processGenericNode(trimmed, state, (s) => md += flushNode(s))) continue;
  }

  md += flushNode(state);
  return appendEdges(md, state.edgeLines);
}

function createParserState() {
  return {
    currentAnnotations: [] as Annotation[],
    currentNodeId: "",
    currentNodeKind: "",
    headingLevel: 2,
    depthStack: [] as number[],
    braceDepth: 0,
    insideEdge: false,
    edgeLines: [] as string[],
    edgeFrom: "",
    edgeTo: "",
    edgeLabel: "",
    edgeAnnotations: [] as Annotation[]
  };
}

function parseAnn(line: string): Annotation | null {
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
}

function processSpecBlock(lines: string[], i: number, state: any): boolean {
  const trimmed = lines[i].trim();
  if (!(trimmed.startsWith("spec ") || trimmed.startsWith("spec{"))) return false;

  const inlineMatch = trimmed.match(/^spec\s+"([^"]*)"/);
  if (inlineMatch) {
    const ann = { type: "description", value: inlineMatch[1] };
    if (state.insideEdge) state.edgeAnnotations.push(ann);
    else state.currentAnnotations.push(ann);
    return true;
  }

  if (trimmed.includes("{")) {
    processSpecBlockMultiline(lines, i, state);
  }
  return true;
}

function processSpecBlockMultiline(lines: string[], i: number, state: any) {
  const trimmed = lines[i].trim();
  let specDepth = (trimmed.match(/\{/g) || []).length;
  specDepth -= (trimmed.match(/\}/g) || []).length;
  let j = i + 1;
  while (j < lines.length && specDepth > 0) {
    const specLine = lines[j].trim();
    specDepth += (specLine.match(/\{/g) || []).length;
    specDepth -= (specLine.match(/\}/g) || []).length;
    if (specLine !== "}" && specLine.length > 0 && specDepth >= 0) {
      const ann = parseAnn(specLine);
      if (ann) {
        if (state.insideEdge) state.edgeAnnotations.push(ann);
        else state.currentAnnotations.push(ann);
      }
    }
    j++;
  }
}

function processEdgeStart(trimmed: string, state: any): boolean {
  const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s*\{/);
  if (!edgeMatch) return false;
  state.insideEdge = true;
  state.edgeFrom = "";
  state.edgeTo = "";
  state.edgeLabel = "";
  state.edgeAnnotations = [];
  state.braceDepth += 1;
  return true;
}

function processEdgeBody(trimmed: string, state: any): boolean {
  if (!state.insideEdge) return false;
  const fromMatch = trimmed.match(/^from:\s*@(\w+)/);
  const toMatch = trimmed.match(/^to:\s*@(\w+)/);
  const labelMatch = trimmed.match(/^label:\s*"([^"]*)"/);
  if (fromMatch) state.edgeFrom = fromMatch[1];
  if (toMatch) state.edgeTo = toMatch[1];
  if (labelMatch) state.edgeLabel = labelMatch[1];

  if (trimmed === "}") {
    state.insideEdge = false;
    state.braceDepth -= 1;
    let edgeMd = `- **@${state.edgeFrom}** → **@${state.edgeTo}**`;
    if (state.edgeLabel) edgeMd += ` — ${state.edgeLabel}`;
    edgeMd += "\n";
    for (const ann of state.edgeAnnotations) {
      if (ann.type === "description") edgeMd += `  > ${ann.value}\n`;
      if (ann.type === "accept") edgeMd += `  - [ ] ${ann.value}\n`;
    }
    state.edgeLines.push(edgeMd);
  }
  return true;
}

function processClosingBrace(trimmed: string, state: any): boolean {
  if (trimmed !== "}") return false;
  state.braceDepth -= 1;
  if (state.depthStack.length > 0) {
    state.depthStack.pop();
    state.headingLevel = 2 + state.depthStack.length;
  }
  return true;
}

function processNodeDecl(trimmed: string, state: any, doFlush: (s: any) => void): boolean {
  const nodeMatch = trimmed.match(/^(group|rect|ellipse|path|text)\s+@(\w+)(?:\s+"[^"]*")?\s*\{?/);
  const nodeMatchWithSpec = trimmed.match(/^(group|rect|ellipse|path|text)\s+@(\w+)\s+spec\s+"([^"]*)"\s*\{?/);

  if (!nodeMatch && !nodeMatchWithSpec) return false;

  doFlush(state); // Flush PREVIOUS node before starting this new one

  if (nodeMatchWithSpec) {
    state.currentNodeKind = nodeMatchWithSpec[1];
    state.currentNodeId = nodeMatchWithSpec[2];
    state.currentAnnotations.push({ type: "description", value: nodeMatchWithSpec[3] });
  } else if (nodeMatch) {
    state.currentNodeKind = nodeMatch[1];
    state.currentNodeId = nodeMatch[2];
  }
  if (trimmed.endsWith("{")) {
    state.braceDepth += 1;
    state.depthStack.push(state.braceDepth);
    state.headingLevel = 2 + state.depthStack.length - 1;
  }
  return true;
}

function processGenericNode(trimmed: string, state: any, doFlush: (s: any) => void): boolean {
  const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
  const genericMatchWithSpec = trimmed.match(/^@(\w+)\s+spec\s+"([^"]*)"\s*\{/);

  if (!genericMatch && !genericMatchWithSpec) return false;

  doFlush(state); // Flush PREVIOUS node

  state.currentNodeKind = "spec";

  if (genericMatchWithSpec) {
    state.currentNodeId = genericMatchWithSpec[1];
    state.currentAnnotations.push({ type: "description", value: genericMatchWithSpec[2] });
  } else if (genericMatch) {
    state.currentNodeId = genericMatch[1];
  }
  state.braceDepth += 1;
  state.depthStack.push(state.braceDepth);
  state.headingLevel = 2 + state.depthStack.length - 1;
  return true;
}

function flushNode(state: any): string {
  if (!state.currentNodeId || state.currentAnnotations.length === 0) {
    state.currentAnnotations = [];
    state.currentNodeId = "";
    return "";
  }
  let md = "";
  const hashes = "#".repeat(Math.min(state.headingLevel, 6));
  md += `${hashes} @${state.currentNodeId} \`${state.currentNodeKind}\`\n\n`;
  for (const ann of state.currentAnnotations) {
    md += formatAnnotation(ann);
  }
  md += "\n";
  state.currentAnnotations = [];
  state.currentNodeId = "";
  return md;
}

function formatAnnotation(ann: Annotation): string {
  switch (ann.type) {
    case "description": return `> ${ann.value}\n`;
    case "accept": return `- [ ] ${ann.value}\n`;
    case "status": return `- **Status:** ${ann.value}\n`;
    case "priority": return `- **Priority:** ${ann.value}\n`;
    case "tag": return `- **Tags:** ${ann.value}\n`;
    default: return "";
  }
}

function appendEdges(md: string, edgeLines: string[]): string {
  if (edgeLines.length === 0) return md;
  let out = md + "---\n\n## Flows\n\n";
  for (const el of edgeLines) out += el;
  return out + "\n";
}
