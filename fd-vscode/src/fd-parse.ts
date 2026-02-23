/**
 * Pure parsing/filtering utilities for FD documents.
 *
 * These functions are VS Code-independent — they operate on plain strings
 * and return data structures. This makes them testable with Vitest.
 */

// ─── Types ───────────────────────────────────────────────────────────────

export interface Annotation {
  type: "accept" | "status" | "priority" | "tag" | "description";
  value: string;
}

export interface SpecNode {
  id: string;
  kind: string;
  annotations: Annotation[];
}

export interface SpecEdge {
  from: string;
  to: string;
  label: string;
  annotations: Annotation[];
}

export interface SpecResult {
  nodes: SpecNode[];
  edges: SpecEdge[];
}

// ─── Annotation Parsing ──────────────────────────────────────────────────

/** Parse a `## ...` annotation line into a typed annotation. */
export function parseAnnotation(
  line: string
): Annotation | null {
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

// ─── Spec Extraction ─────────────────────────────────────────────────────

/**
 * Extract spec-relevant data (nodes, edges, annotations) from FD source.
 * Returns structured data — no HTML rendering.
 */
export function parseSpecNodes(source: string): SpecResult {
  const lines = source.split("\n");
  const nodes: SpecNode[] = [];
  const edges: SpecEdge[] = [];
  let pendingAnnotations: Annotation[] = [];
  let currentNodeId = "";
  let currentNodeKind = "";
  let insideNode = false;
  let braceDepth = 0;

  let currentEdge: SpecEdge | null = null;
  let insideEdge = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Regular comment — skip
    if (trimmed.startsWith("#") && !trimmed.startsWith("##")) continue;

    // Annotation line
    if (trimmed.startsWith("##")) {
      const ann = parseAnnotation(trimmed);
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
      if (insideNode) {
        if (currentNodeId) {
          nodes.push({
            id: currentNodeId,
            kind: currentNodeKind,
            annotations: [...pendingAnnotations],
          });
          pendingAnnotations = [];
          currentNodeId = "";
          currentNodeKind = "";
        }
        insideNode = braceDepth > 0;
      }
      continue;
    }

    // Typed node: rect @foo { / group @foo {
    const nodeMatch = trimmed.match(
      /^(group|rect|ellipse|path|text)\s+@(\w+)(?:\s+"[^"]*")?\s*\{?/
    );
    if (nodeMatch) {
      if (currentNodeId && pendingAnnotations.length > 0) {
        nodes.push({
          id: currentNodeId,
          kind: currentNodeKind,
          annotations: [...pendingAnnotations],
        });
        pendingAnnotations = [];
      }
      currentNodeKind = nodeMatch[1];
      currentNodeId = nodeMatch[2];
      insideNode = true;
      if (trimmed.endsWith("{")) braceDepth += 1;
      continue;
    }

    // Generic node: @foo {
    const genericMatch = trimmed.match(/^@(\w+)\s*\{/);
    if (genericMatch) {
      if (currentNodeId && pendingAnnotations.length > 0) {
        nodes.push({
          id: currentNodeId,
          kind: currentNodeKind,
          annotations: [...pendingAnnotations],
        });
        pendingAnnotations = [];
      }
      currentNodeKind = "spec";
      currentNodeId = genericMatch[1];
      insideNode = true;
      braceDepth += 1;
      continue;
    }

    braceDepth += openBraces - closeBraces;
  }

  // Flush last node
  if (currentNodeId) {
    nodes.push({
      id: currentNodeId,
      kind: currentNodeKind,
      annotations: [...pendingAnnotations],
    });
  }

  return { nodes, edges };
}

// ─── Spec Hide Lines ─────────────────────────────────────────────────────

/**
 * Given an array of source lines, return the 0-based indices of lines
 * that should be hidden in Code Spec View. Hides style blocks, anim
 * blocks, and property lines — keeps #, ##, node/edge names, and braces.
 */
export function computeSpecHideLines(lines: string[]): number[] {
  const hidden: number[] = [];
  let insideStyleBlock = false;
  let insideAnimBlock = false;
  let styleDepth = 0;
  let animDepth = 0;

  const keepPatterns = [
    /^\s*#/,                              // Comments and annotations
    /^\s*(group|rect|ellipse|path|text)\s+@/, // Typed node declarations
    /^\s*@\w+\s*\{/,                      // Generic node declarations
    /^\s*edge\s+@/,                        // Edge declarations
    /^\s*from:\s*@/,                       // Edge from
    /^\s*to:\s*@/,                          // Edge to
    /^\s*label:\s*"/,                       // Edge label
    /^\s*\}/,                              // Closing braces
    /^\s*$/,                               // Blank lines
  ];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const trimmed = text.trim();

    // Track style blocks
    if (/^\s*style\s+\w+\s*\{/.test(text)) {
      insideStyleBlock = true;
      styleDepth = 1;
      hidden.push(i);
      continue;
    }
    if (insideStyleBlock) {
      styleDepth += (trimmed.match(/\{/g) || []).length;
      styleDepth -= (trimmed.match(/\}/g) || []).length;
      hidden.push(i);
      if (styleDepth <= 0) insideStyleBlock = false;
      continue;
    }

    // Track anim blocks
    if (/^\s*anim\s+:/.test(text)) {
      insideAnimBlock = true;
      animDepth = (trimmed.match(/\{/g) || []).length;
      animDepth -= (trimmed.match(/\}/g) || []).length;
      hidden.push(i);
      if (animDepth <= 0) insideAnimBlock = false;
      continue;
    }
    if (insideAnimBlock) {
      animDepth += (trimmed.match(/\{/g) || []).length;
      animDepth -= (trimmed.match(/\}/g) || []).length;
      hidden.push(i);
      if (animDepth <= 0) insideAnimBlock = false;
      continue;
    }

    // Check keep patterns
    const shouldKeep = keepPatterns.some((p) => p.test(text));
    if (!shouldKeep && trimmed.length > 0) {
      hidden.push(i);
    }
  }
  return hidden;
}

// ─── Anon Node IDs ───────────────────────────────────────────────────────

/** Find all `@_anon_N` node IDs in an FD document. */
export function findAnonNodeIds(fdText: string): string[] {
  const matches = fdText.matchAll(/@(_anon_\d+)/g);
  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m[1]);
  }
  return [...ids];
}

// ─── Markdown Fence Stripping ────────────────────────────────────────────

/** Strip ` ```fd ` or ` ```text ` fences from LLM output. */
export function stripMarkdownFences(text: string): string {
  let result = text;
  result = result.replace(/^```(?:fd|text|plaintext)?\s*\n?/, "");
  result = result.replace(/\n?```\s*$/, "");
  return result.trim();
}

// ─── Panel Column Resolution ─────────────────────────────────────────────

/**
 * Determine which ViewColumn to open the canvas panel in.
 *
 * When two editor groups already exist, returns the column of the
 * non-active group so the canvas reuses it instead of creating a 3rd panel.
 *
 * @param activeColumn  The ViewColumn of the active text editor (may be undefined).
 * @param allGroupColumns  ViewColumns of ALL editor groups (from `tabGroups.all`).
 * @returns A numeric column to reuse, or `"beside"` to create a new panel.
 */
export function resolveTargetColumn(
  activeColumn: number | undefined,
  allGroupColumns: number[]
): number | "beside" {
  const otherColumn = allGroupColumns.find((c) => c !== activeColumn);
  return otherColumn ?? "beside";
}

// ─── HTML Escaping ───────────────────────────────────────────────────────

/** Escape HTML special characters. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
