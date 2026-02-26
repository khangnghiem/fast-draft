/**
 * Pure parsing/filtering utilities for FD documents.
 *
 * These functions are VS Code-independent — they operate on plain strings
 * and return data structures. This makes them testable with Vitest.
 */

// ─── Constants ───────────────────────────────────────────────────────────

const ANNOTATION_REGEX = {
  ACCEPT: /^\s*accept:\s*"([^"]*)"/,
  STATUS: /^\s*status:\s*(\S+)/,
  PRIORITY: /^\s*priority:\s*(\S+)/,
  TAG: /^\s*tag:\s*(.+)/,
  DESCRIPTION: /^\s*"([^"]*)"/,
};

const SPEC_REGEX = {
  INLINE: /^\s*spec\s+"([^"]*)"/,
  BLOCK_START: /^\s*spec\s*\{?/, // Matches "spec" or "spec{"
};

const EDGE_REGEX = {
  BLOCK_START: /^\s*edge\s+@(\w+)\s*\{/,
  FROM: /^\s*from:\s*@(\w+)/,
  TO: /^\s*to:\s*@(\w+)/,
  LABEL: /^\s*label:\s*"([^"]*)"/,
};

const NODE_REGEX = {
  TYPED: /^\s*(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?/,
  GENERIC: /^\s*@(\w+)\s*\{/,
};

const STYLE_REGEX = /^\s*style\s+(\w+)\s*\{/;
const ANIM_REGEX = /^\s*anim\s+:(\w+)\s*\{/;
const CONSTRAINT_REGEX = /^\s*@(\w+)\s*->\s*(.+)/;

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

/** Parse a single line inside a `spec { ... }` block into a typed annotation. */
export function parseAnnotation(line: string): Annotation | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let match;
  if ((match = trimmed.match(ANNOTATION_REGEX.ACCEPT))) {
    return { type: "accept", value: match[1] };
  }
  if ((match = trimmed.match(ANNOTATION_REGEX.STATUS))) {
    return { type: "status", value: match[1] };
  }
  if ((match = trimmed.match(ANNOTATION_REGEX.PRIORITY))) {
    return { type: "priority", value: match[1] };
  }
  if ((match = trimmed.match(ANNOTATION_REGEX.TAG))) {
    return { type: "tag", value: match[1].trim() };
  }
  if ((match = trimmed.match(ANNOTATION_REGEX.DESCRIPTION))) {
    return { type: "description", value: match[1] };
  }
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Regular comment — skip
    if (trimmed.startsWith("#")) continue;

    // Spec block (inline or block form)
    if (SPEC_REGEX.INLINE.test(trimmed) || SPEC_REGEX.BLOCK_START.test(trimmed)) {
      // Inline form: spec "description"
      const inlineMatch = trimmed.match(SPEC_REGEX.INLINE);
      if (inlineMatch) {
        const ann: Annotation = { type: "description", value: inlineMatch[1] };
        if (insideEdge && currentEdge) {
          currentEdge.annotations.push(ann);
        } else {
          pendingAnnotations.push(ann);
        }
        continue;
      }
      // Block form: spec { ... }
      if (trimmed.includes("{")) {
        let specDepth = (trimmed.match(/\{/g) || []).length;
        specDepth -= (trimmed.match(/\}/g) || []).length;
        let j = i + 1;
        while (j < lines.length && specDepth > 0) {
          const specLine = lines[j].trim();
          specDepth += (specLine.match(/\{/g) || []).length;
          specDepth -= (specLine.match(/\}/g) || []).length;
          if (specDepth > 0 || (specDepth === 0 && specLine !== "}")) {
             if (specLine !== "}" && specLine.length > 0) {
               const ann = parseAnnotation(specLine);
               if (ann) {
                 if (insideEdge && currentEdge) {
                   currentEdge.annotations.push(ann);
                 } else {
                   pendingAnnotations.push(ann);
                 }
               }
             }
          }
          j++;
        }
      }
      continue;
    }

    // Edge block
    const edgeMatch = trimmed.match(EDGE_REGEX.BLOCK_START);
    if (edgeMatch) {
      insideEdge = true;
      currentEdge = { from: "", to: "", label: "", annotations: [] };
      braceDepth += openBraces - closeBraces;
      continue;
    }

    if (insideEdge && currentEdge) {
      const fromMatch = trimmed.match(EDGE_REGEX.FROM);
      const toMatch = trimmed.match(EDGE_REGEX.TO);
      const labelMatch = trimmed.match(EDGE_REGEX.LABEL);
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

    // Typed node
    const nodeMatch = trimmed.match(NODE_REGEX.TYPED);
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

    // Generic node
    const genericMatch = trimmed.match(NODE_REGEX.GENERIC);
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

/** Helper to extract lines inside a block, respecting nested braces. */
function parseBlockContent(lines: string[], startIndex: number): string[] {
  const contentLines: string[] = [];
  const startLine = lines[startIndex].trim();
  let depth = (startLine.match(/\{/g) || []).length;
  depth -= (startLine.match(/\}/g) || []).length;

  let j = startIndex + 1;
  while (j < lines.length && depth > 0) {
    const line = lines[j].trim();
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (depth > 0 || (depth === 0 && line !== "}")) {
      if (line.length > 0 && line !== "}") {
        contentLines.push(line);
      }
    }
    j++;
  }
  return contentLines;
}

// ─── Spec Hide Lines ─────────────────────────────────────────────────────

export function computeSpecHideLines(lines: string[]): number[] {
  const hidden: number[] = [];
  let insideStyleBlock = false;
  let insideAnimBlock = false;
  let insideNodeBlock = false;
  let styleDepth = 0;
  let animDepth = 0;
  let nodeDepth = 0;

  // Patterns to KEEP (everything else inside a node is hidden)
  const keepPatterns = [
    /^\s*#/,                              // Comments
    SPEC_REGEX.BLOCK_START,                // Spec blocks
    NODE_REGEX.TYPED,                      // Typed node declarations
    NODE_REGEX.GENERIC,                    // Generic node declarations
    EDGE_REGEX.BLOCK_START,                // Edge declarations
    EDGE_REGEX.FROM,                       // Edge from
    EDGE_REGEX.TO,                         // Edge to
    EDGE_REGEX.LABEL,                      // Edge label
    /^\s*\}/,                              // Closing braces
    /^\s*$/,                               // Blank lines
    ANNOTATION_REGEX.DESCRIPTION,          // Quoted strings (inside spec)
    ANNOTATION_REGEX.ACCEPT,
    ANNOTATION_REGEX.STATUS,
    ANNOTATION_REGEX.PRIORITY,
    ANNOTATION_REGEX.TAG,
  ];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const trimmed = text.trim();

    // Track style blocks
    if (STYLE_REGEX.test(text)) {
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
    if (/^\s*anim\s+[:\w]+\s*\{/.test(text)) {
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

    // Track node blocks (typed and generic)
    const isNodeStart = NODE_REGEX.TYPED.test(text) || NODE_REGEX.GENERIC.test(text);
    if (isNodeStart) {
      insideNodeBlock = true;
      nodeDepth += (trimmed.match(/\{/g) || []).length;
      // The declaration line itself is kept
      continue;
    }

    if (insideNodeBlock) {
      nodeDepth += (trimmed.match(/\{/g) || []).length;
      nodeDepth -= (trimmed.match(/\}/g) || []).length;

      if (nodeDepth <= 0) {
        insideNodeBlock = false;
      }

      // Check keep patterns
      const shouldKeep = keepPatterns.some((p) => p.test(text));
      // Fix: Don't hide lines that match keepPatterns inside nodes!
      if (!shouldKeep && trimmed.length > 0) {
        hidden.push(i);
      }
      continue;
    }

    // Outside of style, anim, and node blocks
    const shouldKeep = keepPatterns.some((p) => p.test(text));
    // Fix: Don't hide kept lines (like comments) that are outside nodes
    // Wait, original logic hid things outside nodes?
    // Let's look at the original code in my memory trace.
    /*
        const shouldKeepGlobal = keepPatterns.some((p) => p.test(text)) || /^\s*@\w+\s*->/.test(text); // Added constraint keeping if needed? Wait, original logic didn't explicitly keep constraints.
        // Let's check original logic: constraints were HIDDEN because they didn't match keepPatterns.
        // Let's just reproduce original logic for outside blocks.
        const shouldKeep = keepPatterns.some((p) => p.test(text));
        if (!shouldKeep && trimmed.length > 0) {
          hidden.push(i);
        }
    */
    // The failing test is:
    // lines = [
    //   '# This is a comment',
    //   'spec {',
    //   '  "Description"',
    //   '  accept: "criterion"',
    //   "  status: done",
    //   '}',
    // ];
    // These are top-level spec blocks.
    // My regexes for SPEC_REGEX.BLOCK_START matches `spec {`.
    // ANNOTATION_REGEX matches contents.
    // The loop iterates.
    // i=0: #... matches keepPatterns. kept.
    // i=1: spec { matches SPEC_REGEX.BLOCK_START. kept.
    // i=2: "Description" matches ANNOTATION_REGEX.DESCRIPTION. kept.
    // ...
    // Wait, ANNOTATION_REGEX.DESCRIPTION is `/^"([^"]*)"/`.
    // The text is `'  "Description"'`. It has leading spaces.
    // The regexes assume trimmed or are tested against text?
    // `const trimmed = text.trim();`
    // `const shouldKeep = keepPatterns.some((p) => p.test(text));`
    // It tests against `text` (raw line), not `trimmed`.
    // The regexes start with `^` or `^\s*`.
    // My new regexes:
    // `DESCRIPTION: /^"([^"]*)"/` -> this expects NO leading whitespace if tested against `trimmed`?
    // But I'm testing against `text`.
    // So `text` has spaces. `^"..."` won't match `  "..."`.
    // I need to allow whitespace in my regexes if I test against `text`.
    // Or I should test against `trimmed`.

    // In `parseAnnotation`, I used `trimmed`.
    // In `computeSpecHideLines`, the original code used:
    // `const shouldKeep = keepPatterns.some((p) => p.test(text));`
    // And the original regexes were like `/^\s*#/, /^\s*spec[\s{]/, ...`
    // My constants like `DESCRIPTION: /^"([^"]*)"/` don't have `\s*`.

    // Fix: Update the loop to test regexes against `trimmed` for the content-based ones,
    // or update the regexes to allow leading whitespace.
    // Since `trimmed` is available, let's use it for the match.
    // But `keepPatterns` contains regexes that might rely on `^`.

    if (!shouldKeep && trimmed.length > 0) {
      hidden.push(i);
    }
  }
  return hidden;
}

// ─── Spec Fold Ranges ────────────────────────────────────────────────────

/**
 * Group consecutive hidden line indices into contiguous fold ranges.
 * Each range { start, end } is a 0-based inclusive line range suitable
 * for VS Code's FoldingRangeProvider.
 */
export function computeSpecFoldRanges(
  lines: string[]
): { start: number; end: number }[] {
  const hidden = computeSpecHideLines(lines);
  if (hidden.length === 0) return [];

  const ranges: { start: number; end: number }[] = [];
  let start = hidden[0];
  let prev = hidden[0];

  for (let i = 1; i < hidden.length; i++) {
    if (hidden[i] === prev + 1) {
      prev = hidden[i];
    } else {
      ranges.push({ start, end: prev });
      start = hidden[i];
      prev = hidden[i];
    }
  }
  ranges.push({ start, end: prev });
  return ranges;
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

// ─── Document Symbols (Outline / Layers) ─────────────────────────────────

export interface FdSymbol {
  name: string;       // "@gallery"
  kind: string;       // "group", "rect", "text", "style", "edge", "spec"
  text?: string;      // label text for text nodes
  startLine: number;  // 0-based line index
  endLine: number;    // 0-based line index (closing brace)
  children: FdSymbol[];
}

/**
 * Parse FD source lines into a hierarchical symbol tree.
 * Used by DocumentSymbolProvider (Outline) and Layers Panel.
 */
export function parseDocumentSymbols(lines: string[]): FdSymbol[] {
  const root: FdSymbol[] = [];
  const stack: { symbol: FdSymbol; depth: number }[] = [];

  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;

    // Style definition
    const styleMatch = trimmed.match(STYLE_REGEX);
    if (styleMatch) {
      const sym: FdSymbol = {
        name: styleMatch[1],
        kind: "style",
        startLine: i,
        endLine: i,
        children: [],
      };
      pushSymbol(root, stack, sym, braceDepth);
      braceDepth += openBraces - closeBraces;
      stack.push({ symbol: sym, depth: braceDepth });
      continue;
    }

    // Edge block
    const edgeMatch = trimmed.match(EDGE_REGEX.BLOCK_START);
    if (edgeMatch) {
      const sym: FdSymbol = {
        name: `@${edgeMatch[1]}`,
        kind: "edge",
        startLine: i,
        endLine: i,
        children: [],
      };
      pushSymbol(root, stack, sym, braceDepth);
      braceDepth += openBraces - closeBraces;
      stack.push({ symbol: sym, depth: braceDepth });
      continue;
    }

    // Typed node
    const nodeMatch = trimmed.match(NODE_REGEX.TYPED);
    if (nodeMatch) {
      const sym: FdSymbol = {
        name: `@${nodeMatch[2]}`,
        kind: nodeMatch[1],
        startLine: i,
        endLine: i,
        children: [],
      };
      if (nodeMatch[3]) sym.text = nodeMatch[3];
      pushSymbol(root, stack, sym, braceDepth);
      if (trimmed.endsWith("{")) {
        braceDepth += 1;
        stack.push({ symbol: sym, depth: braceDepth });
      }
      continue;
    }

    // Generic node
    const genericMatch = trimmed.match(NODE_REGEX.GENERIC);
    if (genericMatch) {
      const sym: FdSymbol = {
        name: `@${genericMatch[1]}`,
        kind: "spec",
        startLine: i,
        endLine: i,
        children: [],
      };
      pushSymbol(root, stack, sym, braceDepth);
      braceDepth += openBraces - closeBraces;
      stack.push({ symbol: sym, depth: braceDepth });
      continue;
    }

    // Closing brace
    if (trimmed === "}") {
      braceDepth -= 1;
      // Pop stack entries that match this depth
      while (stack.length > 0 && stack[stack.length - 1].depth > braceDepth) {
        const popped = stack.pop()!;
        popped.symbol.endLine = i;
      }
      continue;
    }

    // Constraint line
    const constraintMatch = trimmed.match(CONSTRAINT_REGEX);
    if (constraintMatch) {
      const sym: FdSymbol = {
        name: `@${constraintMatch[1]}`,
        kind: "constraint",
        text: constraintMatch[2].trim(),
        startLine: i,
        endLine: i,
        children: [],
      };
      pushSymbol(root, stack, sym, braceDepth);
      continue;
    }

    braceDepth += openBraces - closeBraces;
  }

  // Close any remaining symbols
  const lastLine = lines.length > 0 ? lines.length - 1 : 0;
  while (stack.length > 0) {
    const popped = stack.pop()!;
    popped.symbol.endLine = lastLine;
  }

  return root;
}

/** Push a symbol into the correct parent based on the stack. */
function pushSymbol(
  root: FdSymbol[],
  stack: { symbol: FdSymbol; depth: number }[],
  sym: FdSymbol,
  _currentDepth: number
): void {
  if (stack.length > 0) {
    stack[stack.length - 1].symbol.children.push(sym);
  } else {
    root.push(sym);
  }
}

// ─── Symbol Lookup ───────────────────────────────────────────────────────

/**
 * Find the deepest (most specific) symbol whose line range contains `line`.
 * Returns `undefined` if the cursor is outside all symbols.
 */
export function findSymbolAtLine(
  symbols: FdSymbol[],
  line: number
): FdSymbol | undefined {
  for (const sym of symbols) {
    if (line >= sym.startLine && line <= sym.endLine) {
      // Drill into children for a more specific match
      const child = findSymbolAtLine(sym.children, line);
      return child ?? sym;
    }
  }
  return undefined;
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

// ─── Spec View Line Transform ────────────────────────────────────────────

/**
 * Transform a line for Spec View display by stripping the type keyword
 * from typed node declarations.
 */
export function transformSpecViewLine(line: string): string {
  return line.replace(
    /^(\s*)(group|frame|rect|ellipse|path|text)\s+(@\w+)/,
    "$1$3"
  );
}
